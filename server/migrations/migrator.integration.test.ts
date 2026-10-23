import { randomUUID } from "crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { MigrationFile, runMigrations } from "../migrator";

// Set MIGRATOR_TEST_DATABASE_URL only to a disposable, isolated PostgreSQL test database.
// This test creates and drops one uniquely named schema and never targets DATABASE_URL.
const postgresDescribe = process.env.MIGRATOR_TEST_DATABASE_URL ? describe : describe.skip;

postgresDescribe("PostgreSQL migrator real-session concurrency", () => {
  const databaseUrl = process.env.MIGRATOR_TEST_DATABASE_URL!;
  const adminPool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000 });
  let schemaName = "";

  afterAll(async () => {
    if (schemaName) {
      await adminPool.query('DROP SCHEMA IF EXISTS "' + schemaName + '" CASCADE');
    }
    await adminPool.end();
  });

  it("serializes two independent pools so one migration is applied exactly once", async () => {
    schemaName = "bg_migrator_test_" + randomUUID().replace(/-/g, "");
    await adminPool.query('CREATE SCHEMA "' + schemaName + '"');

    const poolA = new Pool({
      connectionString: databaseUrl,
      options: "-c search_path=" + schemaName,
      max: 1,
      connectionTimeoutMillis: 5000,
    });
    const poolB = new Pool({
      connectionString: databaseUrl,
      options: "-c search_path=" + schemaName,
      max: 1,
      connectionTimeoutMillis: 5000,
    });

    const migrations: MigrationFile[] = [
      {
        version: "001",
        name: "001_concurrency_probe.sql",
        sql: "SELECT pg_sleep(0.25); CREATE TABLE migrator_concurrency_probe (id integer);",
        checksum: "real-postgres-concurrency-probe",
      },
    ];

    try {
      const [first, second] = await Promise.all([
        runMigrations(poolA, { migrations, lockTimeoutMs: 10_000 }),
        runMigrations(poolB, { migrations, lockTimeoutMs: 10_000 }),
      ]);

      expect([first.applied.length, second.applied.length].sort()).toEqual([0, 1]);
      expect([first.alreadyApplied.length, second.alreadyApplied.length].sort()).toEqual([0, 1]);

      const result = await adminPool.query(
        'SELECT count(*)::int AS count FROM "' + schemaName + '".schema_migrations WHERE version = $1',
        ["001"],
      );
      expect(result.rows[0].count).toBe(1);
    } finally {
      await Promise.all([poolA.end(), poolB.end()]);
    }
  });
});
