import { randomUUID } from "crypto";
import path from "path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMigrationsFromDir, runMigrations } from "../migrator";

const testDatabaseUrl = process.env.MIGRATOR_TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("Migration 010 preflight for existing report data", () => {
  let adminPool: Pool | undefined;
  let testPool: Pool | undefined;
  let schemaName = "";
  let migrations: ReturnType<typeof loadMigrationsFromDir> = [];

  beforeAll(async () => {
    if (!testDatabaseUrl) return;

    const parsedUrl = new URL(testDatabaseUrl);
    const databaseName = parsedUrl.pathname.replace(/^\//, "");
    if (
      !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) ||
      !databaseName.endsWith("_test")
    ) {
      throw new Error("Migration 010 preflight tests require a loopback *_test database URL.");
    }

    adminPool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
    schemaName = "bg_migration_010_preflight_" + randomUUID().replace(/-/g, "");
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: testDatabaseUrl,
      options: `-c search_path=${schemaName}`,
      max: 2,
      connectionTimeoutMillis: 5000,
    });

    migrations = loadMigrationsFromDir(path.resolve(__dirname));
    expect(migrations.some((migration) => migration.version === "010")).toBe(true);
    const priorMigrations = migrations.filter((migration) => Number(migration.version) < 10);
    expect(priorMigrations.length).toBeGreaterThan(0);
    await runMigrations(testPool, { migrations: priorMigrations });

    await testPool.query("INSERT INTO companies (id, name) VALUES ($1, $2), ($3, $4)", [
      "company-a",
      "Company A",
      "company-b",
      "Company B",
    ]);
    const now = new Date().toISOString();
    await testPool.query(
      'INSERT INTO customers (id, "companyId", "displayName", "createdAt", "updatedAt") VALUES ($1, $2, $3, $6, $6), ($4, $5, $7, $6, $6), ($8, $2, $9, $6, $6)',
      ["customer-a", "company-a", "Customer A", "customer-a2", "company-a", "customer-a2", "Customer A2", "customer-b", "Customer B", now],
    );
    await testPool.query(
      'INSERT INTO locations (id, "companyId", "customerId", name, address, city, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $7)',
      ["location-a", "company-a", "customer-a", "Location A", "Via Test 1", "Roma", now],
    );

    // Migration 010 is intentionally not applied yet: these represent legacy rows
    // that passed the pre-010 schema but violate the new tenant consistency rules.
    await testPool.query(
      'INSERT INTO reports (id, "companyId", "customerId") VALUES ($1, $2, $3)',
      ["report-cross-company-customer", "company-a", "customer-b"],
    );
    await testPool.query(
      'INSERT INTO reports (id, "companyId", "customerId", "locationId") VALUES ($1, $2, $3, $4)',
      ["report-cross-customer-location", "company-a", "customer-a2", "location-a"],
    );
  }, 60_000);

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    if (adminPool) await adminPool.end();
  }, 15_000);

  async function expectMigration010NotRecorded() {
    const result = await testPool!.query(
      "SELECT version FROM schema_migrations WHERE version = $1",
      ["010"],
    );
    expect(result.rows).toHaveLength(0);
  }

  it("fails closed on legacy tenant mismatches, rolls back constraints, and can be retried after repair", async () => {
    await expect(
      runMigrations(testPool!, { migrations }),
    ).rejects.toThrow(/Migration 010.*customerId\/companyId tenant mismatches/i);
    await expectMigration010NotRecorded();

    let constraints = await testPool!.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'reports'::regclass AND conname = ANY($1::text[])",
      [[
        "chk_reports_customer_requires_company",
        "chk_reports_location_requires_customer_company",
        "fk_reports_customer_tenant_consistency",
        "fk_reports_location_customer_tenant_consistency",
      ]],
    );
    expect(constraints.rows).toHaveLength(0);

    await testPool!.query('DELETE FROM reports WHERE id = $1', ["report-cross-company-customer"]);
    await expect(
      runMigrations(testPool!, { migrations }),
    ).rejects.toThrow(/Migration 010.*locationId\/customerId\/companyId mismatches/i);
    await expectMigration010NotRecorded();

    await testPool!.query('DELETE FROM reports WHERE id = $1', ["report-cross-customer-location"]);
    const result = await runMigrations(testPool!, { migrations });
    expect(result.applied).toContain("010_reports_customer_location_tenant_consistency.sql");

    constraints = await testPool!.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'reports'::regclass AND conname = ANY($1::text[])",
      [[
        "chk_reports_customer_requires_company",
        "chk_reports_location_requires_customer_company",
        "fk_reports_customer_tenant_consistency",
        "fk_reports_location_customer_tenant_consistency",
      ]],
    );
    expect(constraints.rows.map((row) => row.conname).sort()).toEqual([
      "chk_reports_customer_requires_company",
      "chk_reports_location_customer_tenant_consistency",
      "fk_reports_customer_tenant_consistency",
      "fk_reports_location_customer_tenant_consistency",
    ].sort());
  }, 30_000);
});
