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
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  return candidates[0];
}

/**
 * Loads and deterministically sorts all .sql migration files from directory
 */
export function loadMigrationsFromDir(dirPath: string): MigrationFile[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return files.map((filename) => {
    const fullPath = path.join(dirPath, filename);
    const sql = fs.readFileSync(fullPath, "utf-8");
    const match = filename.match(/^(\d+)/);
    const version = match ? match[1] : filename;
    const checksum = calculateChecksum(sql);

    return {
      version,
      name: filename,
      sql,
      checksum,
    };
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
 * Runs pending PostgreSQL migrations in numerical order.
 * - Idempotent: Skips migrations that have already been applied.
 * - Atomic: Each migration executes in a dedicated transaction (BEGIN / COMMIT).
 * - Safe: On failure, transaction is rolled back, the migration is NOT recorded in schema_migrations,
 *   and an explicit error is thrown.
 */
export async function runMigrations(
  poolOrClient: any,
  options: MigratorOptions = {}
): Promise<MigrationResult> {
  const dirPath = options.migrationsDir || getDefaultMigrationsDir();
  const availableMigrations = options.migrations || loadMigrationsFromDir(dirPath);

  if (availableMigrations.length === 0) {
    console.warn(`[Migrator] No migration files found in ${dirPath}.`);
    return { applied: [], alreadyApplied: [], total: 0 };
  }

  // Ensure tracking table exists
  await ensureMigrationsTable(poolOrClient);

  // Retrieve already applied migrations
  const appliedRecords = await getAppliedMigrations(poolOrClient);
  const appliedMap = new Map<string, AppliedMigrationRecord>();
  for (const record of appliedRecords) {
    appliedMap.set(record.version, record);
  }

  const alreadyApplied: string[] = [];
  const pendingMigrations: MigrationFile[] = [];

  for (const migration of availableMigrations) {
    if (appliedMap.has(migration.version)) {
      alreadyApplied.push(migration.name);
    } else {
      pendingMigrations.push(migration);
    }
  }

  const appliedThisRun: string[] = [];

  for (const migration of pendingMigrations) {
    // Check if pool or single client
    const isPool = typeof poolOrClient.connect === "function";
    const client = isPool ? await poolOrClient.connect() : poolOrClient;

    try {
      await client.query("BEGIN");
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO schema_migrations (version, name, applied_at, checksum) 
         VALUES ($1, $2, CURRENT_TIMESTAMP, $3)`,
        [migration.version, migration.name, migration.checksum]
      );
      await client.query("COMMIT");
      appliedThisRun.push(migration.name);
      console.log(`[Migrator] Applied migration: ${migration.name} (version ${migration.version})`);
    } catch (err: any) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error(`[Migrator] Error rolling back failed migration ${migration.name}:`, rollbackErr);
      }
      throw new Error(
        `[Migrator] Migration ${migration.name} (version ${migration.version}) failed: ${err?.message || err}`
      );
    } finally {
      if (isPool && typeof client.release === "function") {
        client.release();
      }
    }
  }

  return {
    applied: appliedThisRun,
    alreadyApplied,
    total: availableMigrations.length,
  };
}
