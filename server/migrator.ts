import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigrationRecord {
  version: string;
  name: string;
  applied_at: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
  total: number;
}

export interface MigratorOptions {
  migrationsDir?: string;
  migrations?: MigrationFile[];
  lockTimeoutMs?: number;
  lockPollIntervalMs?: number;
}

/**
 * Calculates SHA-256 checksum of SQL migration content
 */
export function calculateChecksum(sql: string): string {
  return crypto.createHash("sha256").update(sql.trim()).digest("hex");
}

/**
 * Locates the migrations directory across source and bundled runtime paths
 */
export function getDefaultMigrationsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "server/migrations"),
    path.resolve(__dirname, "migrations"),
    path.resolve(__dirname, "../server/migrations"),
  ];

  for (const dir of candidates) {
    try {
      if (fs.statSync(dir).isDirectory()) {
        fs.accessSync(dir, fs.constants.R_OK);
        return dir;
      }
    } catch {
      // Try the next known runtime location; the loader reports a clear error.
    }
  }

  return candidates[0];
}

/**
 * Loads and deterministically sorts all .sql migration files from directory
 */
export function loadMigrationsFromDir(dirPath: string): MigrationFile[] {
  let files: string[];
  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      throw new Error("path is not a directory");
    }
    fs.accessSync(dirPath, fs.constants.R_OK);
    files = fs
      .readdirSync(dirPath)
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch (err: any) {
    throw new Error(
      '[Migrator] Required migrations directory "' + dirPath + '" is missing or unreadable: ' + (err?.message || err)
    );
  }

  if (files.length === 0) {
    throw new Error('[Migrator] No SQL migration files found in required directory "' + dirPath + '".');
  }

  return files.map((filename) => {
    const fullPath = path.join(dirPath, filename);
    let sql: string;
    try {
      sql = fs.readFileSync(fullPath, "utf-8");
    } catch (err: any) {
      throw new Error('[Migrator] Cannot read migration file "' + fullPath + '": ' + (err?.message || err));
    }
    const match = filename.match(/^(\d+)/);
    const version = match ? match[1] : filename;
    const checksum = calculateChecksum(sql);

    return { version, name: filename, sql, checksum };
  });
}

/**
 * Ensures the migration tracking table exists in PostgreSQL
 */
export async function ensureMigrationsTable(clientOrPool: any): Promise<void> {
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum VARCHAR(64) NOT NULL
    );
  `);
}

/**
 * Retrieves all applied migrations from schema_migrations
 */
export async function getAppliedMigrations(clientOrPool: any): Promise<AppliedMigrationRecord[]> {
  await ensureMigrationsTable(clientOrPool);
  const result = await clientOrPool.query(`
    SELECT version, name, applied_at, checksum 
    FROM schema_migrations 
    ORDER BY version ASC
  `);
  return result.rows || [];
}

/**
 * Reject ambiguous migration versions before opening a database connection.
 * Numeric versions are compared without leading zeroes so "001" and "1" collide.
 */
function assertUniqueMigrationVersions(migrations: MigrationFile[]): void {
  const seen = new Map<string, { version: string; name: string }>();
  for (const migration of migrations) {
    const canonicalVersion = /^\\d+$/.test(migration.version)
      ? migration.version.replace(/^0+(?=\\d)/, "")
      : migration.version;
    const previous = seen.get(canonicalVersion);
    if (previous) {
      throw new Error(
        '[Migrator] Duplicate migration version "' + migration.version + '" in "' + migration.name +
        '" conflicts with "' + previous.version + '" in "' + previous.name + '". Migration versions must be unique.'
      );
    }
    seen.set(canonicalVersion, { version: migration.version, name: migration.name });
  }
}

const MIGRATION_ADVISORY_LOCK_KEY = [1111966788, 1296644679] as const;
const DEFAULT_MIGRATION_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_MIGRATION_LOCK_POLL_INTERVAL_MS = 100;

async function acquireMigrationLock(
  client: any,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<void> {
  const startedAt = Date.now();
  while (true) {
    const result = await client.query(
      "SELECT pg_try_advisory_lock($1, $2) AS acquired",
      [...MIGRATION_ADVISORY_LOCK_KEY],
    );
    if (result.rows?.[0]?.acquired === true) return;

    const elapsed = Date.now() - startedAt;
    if (elapsed >= timeoutMs) {
      throw new Error(
        "[Migrator] Timed out after " + timeoutMs + "ms waiting for the PostgreSQL migration advisory lock.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(1, timeoutMs - elapsed))));
  }
}

async function releaseMigrationLock(client: any): Promise<void> {
  const result = await client.query(
    "SELECT pg_advisory_unlock($1, $2) AS released",
    [...MIGRATION_ADVISORY_LOCK_KEY],
  );
  if (result.rows?.[0]?.released !== true) {
    throw new Error("[Migrator] PostgreSQL migration advisory lock was not held at release time.");
  }
}

/**
 * Runs pending PostgreSQL migrations in numerical order.
 * A session-level advisory lock protects the complete check-and-apply cycle,
 * including the gaps between each migration's dedicated transaction.
 */
export async function runMigrations(
  poolOrClient: any,
  options: MigratorOptions = {}
): Promise<MigrationResult> {
  const dirPath = options.migrationsDir || getDefaultMigrationsDir();
  const availableMigrations = options.migrations ?? loadMigrationsFromDir(dirPath);

  if (availableMigrations.length === 0) {
    throw new Error('[Migrator] No SQL migration files supplied for required directory "' + dirPath + '".');
  }
  assertUniqueMigrationVersions(availableMigrations);

  const isPool = typeof poolOrClient.connect === "function";
  const client = isPool ? await poolOrClient.connect() : poolOrClient;
  let lockAcquired = false;
  let operationError: unknown;
  let releaseError: unknown;

  try {
    await acquireMigrationLock(
      client,
      options.lockTimeoutMs ?? DEFAULT_MIGRATION_LOCK_TIMEOUT_MS,
      options.lockPollIntervalMs ?? DEFAULT_MIGRATION_LOCK_POLL_INTERVAL_MS,
    );
    lockAcquired = true;

    await ensureMigrationsTable(client);
    const appliedRecords = await getAppliedMigrations(client);
    const appliedMap = new Map<string, AppliedMigrationRecord>();
    for (const record of appliedRecords) appliedMap.set(record.version, record);

    const alreadyApplied: string[] = [];
    const pendingMigrations: MigrationFile[] = [];
    for (const migration of availableMigrations) {
      if (appliedMap.has(migration.version)) {
        const recorded = appliedMap.get(migration.version)!;
        if (recorded.checksum && recorded.checksum !== migration.checksum) {
          throw new Error(
            '[Migrator] Migration checksum mismatch for version ' + migration.version + ' (' + migration.name +
            '): recorded checksum "' + recorded.checksum + '", current file checksum "' + migration.checksum +
            '". Migration files must be immutable once applied. Manual intervention required.'
          );
        }
        alreadyApplied.push(migration.name);
      } else {
        pendingMigrations.push(migration);
      }
    }

    const appliedThisRun: string[] = [];
    for (const migration of pendingMigrations) {
      try {
        await client.query("BEGIN");
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name, applied_at, checksum) VALUES ($1, $2, CURRENT_TIMESTAMP, $3)",
          [migration.version, migration.name, migration.checksum],
        );
        await client.query("COMMIT");
        appliedThisRun.push(migration.name);
        console.log("[Migrator] Applied migration: " + migration.name + " (version " + migration.version + ")");
      } catch (err: any) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("[Migrator] Error rolling back failed migration " + migration.name + ":", rollbackErr);
        }
        throw new Error(
          "[Migrator] Migration " + migration.name + " (version " + migration.version + ") failed: " + (err?.message || err)
        );
      }
    }

    return { applied: appliedThisRun, alreadyApplied, total: availableMigrations.length };
  } catch (err) {
    operationError = err;
    throw err;
  } finally {
    let fatalReleaseError: unknown;
    if (lockAcquired) {
      try {
        await releaseMigrationLock(client);
      } catch (err) {
        releaseError = err;
        if (operationError) {
          console.error("[Migrator] Failed to release advisory lock after migration error:", err);
        } else {
          fatalReleaseError = err;
        }
      }
    }
    if (isPool && typeof client.release === "function") {
      // Destroy the connection if lock acquisition/release left its session state uncertain.
      const destroyError =
        releaseError instanceof Error
          ? releaseError
          : !lockAcquired && operationError instanceof Error
            ? operationError
            : undefined;
      client.release(destroyError);
    }
    if (fatalReleaseError) throw fatalReleaseError;
  }
}
