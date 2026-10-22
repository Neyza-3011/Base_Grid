import { Pool } from "pg";
import { runMigrations } from "../migrator";
import { config } from "../config";
import { getRuntimeMode } from "../runtime-mode";
import { getPostgresConnectionOptions } from "../postgres-connection-options";

async function main() {
  const dbUrl = process.env.DATABASE_URL || config.DATABASE_URL;
  if (!dbUrl) {
    console.error("CRITICAL ERROR: DATABASE_URL environment variable is required to run migrations.");
    process.exit(1);
  }

  const mode = getRuntimeMode();
  const connectionOptions = getPostgresConnectionOptions(
    dbUrl,
    mode === "production",
    config.DATABASE_SSL_CA,
  );

  const pool = new Pool({
    ...connectionOptions,
    max: 2,
    connectionTimeoutMillis: 5000,
  });

  try {
    console.log("[Migration CLI] Running database migrations...");
    const result = await runMigrations(pool);
    console.log(
      `[Migration CLI] Done: ${result.applied.length} applied, ${result.alreadyApplied.length} already applied (Total: ${result.total}).`
    );
    await pool.end();
    process.exit(0);
  } catch (err: any) {
    console.error("[Migration CLI] Migration run failed:", err?.message || err);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}

if (require.main === module || process.argv[1]?.endsWith("cli.ts")) {
  main();
}
