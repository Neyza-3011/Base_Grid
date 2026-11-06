import { randomUUID } from "crypto";
import path from "path";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { loadMigrationsFromDir, runMigrations } from "../migrator";

// This integration test uses only the disposable PostgreSQL database configured for CI.
const postgresDescribe = process.env.MIGRATOR_TEST_DATABASE_URL ? describe : describe.skip;

postgresDescribe("PostgreSQL active-flag integrity migration", () => {
  const databaseUrl = process.env.MIGRATOR_TEST_DATABASE_URL!;
  const adminPool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000 });
  let schemaName = "";
  let testPool: Pool | undefined;

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (schemaName) await adminPool.query('DROP SCHEMA IF EXISTS "' + schemaName + '" CASCADE');
    await adminPool.end();
  });

  it("normalizes legacy NULL flags and rejects future NULL values", async () => {
    const parsedUrl = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) ||
        !parsedUrl.pathname.replace(/^\//, "").endsWith("_test")) {
      throw new Error("Active-flag migration tests require a loopback *_test database URL.");
    }

    schemaName = "bg_active_flags_" + randomUUID().replace(/-/g, "");
    await adminPool.query('CREATE SCHEMA "' + schemaName + '"');
    testPool = new Pool({
      connectionString: databaseUrl,
      options: "-c search_path=" + schemaName,
      max: 2,
      connectionTimeoutMillis: 5000,
    });

    const allMigrations = loadMigrationsFromDir(path.resolve(__dirname));
    const targetMigration = allMigrations.find((migration) => migration.version === "015");
    if (!targetMigration) throw new Error("Migration 015 active-flag constraints was not found.");

    await runMigrations(testPool, { migrations: allMigrations.filter((migration) => migration.version !== "015") });

    const now = new Date().toISOString();
    await testPool.query('INSERT INTO companies (id, name) VALUES ($1, $2)', ["company-active-test", "Active test"]);
    await testPool.query(
      'INSERT INTO users (id, email, "fullName", "companyId", "isActive") VALUES ($1, $2, $3, $4, NULL)',
      ["user-active-test", "active-test@example.test", "Active test user", "company-active-test"],
    );
    await testPool.query(
      'INSERT INTO customers (id, "companyId", "displayName", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, NULL, $4, $4)',
      ["customer-active-test", "company-active-test", "Active test customer", now],
    );
    await testPool.query(
      'INSERT INTO locations (id, "companyId", "customerId", name, address, city, "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $7)',
      ["location-active-test", "company-active-test", "customer-active-test", "Test site", "Via Test 1", "Roma", now],
    );

    await runMigrations(testPool, { migrations: [targetMigration] });

    const flags = await testPool.query(
      'SELECT "isActive" FROM users WHERE id = $1 UNION ALL SELECT "isActive" FROM customers WHERE id = $2 UNION ALL SELECT "isActive" FROM locations WHERE id = $3',
      ["user-active-test", "customer-active-test", "location-active-test"],
    );
    expect(flags.rows).toHaveLength(3);
    expect(flags.rows.every((row) => row.isActive === false)).toBe(true);

    await expect(
      testPool.query(
        'INSERT INTO users (id, email, "fullName", "companyId", "isActive") VALUES ($1, $2, $3, $4, NULL)',
        ["user-null-test", "null-test@example.test", "Null test user", "company-active-test"],
      ),
    ).rejects.toMatchObject({ code: "23502" });

    await expect(
      testPool.query(
        'INSERT INTO customers (id, "companyId", "displayName", "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, NULL, $4, $4)',
        ["customer-null-test", "company-active-test", "Null test customer", now],
      ),
    ).rejects.toMatchObject({ code: "23502" });

    await expect(
      testPool.query(
        'INSERT INTO locations (id, "companyId", "customerId", name, address, city, "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $7)',
        ["location-null-test", "company-active-test", "customer-active-test", "Null test site", "Via Test 2", "Roma", now],
      ),
    ).rejects.toMatchObject({ code: "23502" });
  });
});
