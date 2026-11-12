import { randomUUID } from "crypto";
import path from "path";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { loadMigrationsFromDir, runMigrations } from "../migrator";

// Only run against the disposable loopback *_test PostgreSQL database configured in CI.
const postgresDescribe = process.env.MIGRATOR_TEST_DATABASE_URL ? describe : describe.skip;

postgresDescribe("PostgreSQL company setup profile migration", () => {
  const databaseUrl = process.env.MIGRATOR_TEST_DATABASE_URL!;
  const adminPool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000 });
  let schemaName = "";
  let testPool: Pool | undefined;

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (schemaName) await adminPool.query('DROP SCHEMA IF EXISTS "' + schemaName + '" CASCADE');
    await adminPool.end();
  });

  it("adds safe defaults for existing tenants and enforces a JSON array for service categories", async () => {
    const parsedUrl = new URL(databaseUrl);
    if (
      !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) ||
      !parsedUrl.pathname.replace(/^\//, "").endsWith("_test")
    ) {
      throw new Error("Company profile migration tests require a loopback *_test database URL.");
    }

    schemaName = "bg_company_profile_" + randomUUID().replace(/-/g, "");
    await adminPool.query('CREATE SCHEMA "' + schemaName + '"');
    testPool = new Pool({
      connectionString: databaseUrl,
      options: "-c search_path=" + schemaName,
      max: 2,
      connectionTimeoutMillis: 5000,
    });

    const migrations = loadMigrationsFromDir(path.resolve(__dirname));
    const target = migrations.find((migration) => migration.version === "017");
    if (!target) throw new Error("Migration 017 company setup profile was not found.");

    await runMigrations(testPool, {
      migrations: migrations.filter((migration) => migration.version !== "017"),
    });

    await testPool.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [
      "company-profile-legacy",
      "Legacy tenant",
    ]);

    await runMigrations(testPool, { migrations: [target] });

    const result = await testPool.query(
      'SELECT "contactEmail", "contactPhone", "serviceArea", "serviceCategories", locale, "timeZone" FROM companies WHERE id = $1',
      ["company-profile-legacy"],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      contactEmail: "",
      contactPhone: "",
      serviceArea: "",
      serviceCategories: [],
      locale: "it-IT",
      timeZone: "Europe/Rome",
    });

    await expect(
      testPool.query(
        'UPDATE companies SET "serviceCategories" = $1::jsonb WHERE id = $2',
        ['{"not":"an-array"}', "company-profile-legacy"],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
