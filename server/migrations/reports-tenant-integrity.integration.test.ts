import { randomUUID } from "crypto";
import path from "path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadMigrationsFromDir, runMigrations } from "../migrator";

// Only use a disposable PostgreSQL database. Never read DATABASE_URL here.
const postgresDescribe = process.env.MIGRATOR_TEST_DATABASE_URL ? describe : describe.skip;

postgresDescribe("PostgreSQL report customer/location tenant integrity", () => {
  const databaseUrl = process.env.MIGRATOR_TEST_DATABASE_URL!;
  const adminPool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000 });
  let schemaName = "";
  let testPool: Pool;

  beforeAll(async () => {
    schemaName = "bg_report_tenant_test_" + randomUUID().replace(/-/g, "");
    await adminPool.query('CREATE SCHEMA "' + schemaName + '"');
    testPool = new Pool({
      connectionString: databaseUrl,
      options: "-c search_path=" + schemaName,
      max: 2,
      connectionTimeoutMillis: 5000,
    });
    await runMigrations(testPool, { migrationsDir: path.resolve(__dirname) });
  });

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (schemaName) await adminPool.query('DROP SCHEMA IF EXISTS "' + schemaName + '" CASCADE');
    await adminPool.end();
  });

  async function seedCompany(id: string) {
    await testPool.query('INSERT INTO companies (id, name) VALUES ($1, $2)', [id, id]);
  }

  async function seedCustomer(id: string, companyId: string) {
    const now = new Date().toISOString();
    await testPool.query(
      'INSERT INTO customers (id, "companyId", "displayName", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $4)',
      [id, companyId, id, now],
    );
  }

  async function seedLocation(id: string, customerId: string, companyId: string) {
    const now = new Date().toISOString();
    await testPool.query(
      'INSERT INTO locations (id, "companyId", "customerId", name, address, city, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $7)',
      [id, companyId, customerId, id, "Via Test 1", "Roma", now],
    );
  }

  beforeAll(async () => {
    await seedCompany("company-a");
    await seedCompany("company-b");
    await seedCustomer("customer-a", "company-a");
    await seedCustomer("customer-a2", "company-a");
    await seedCustomer("customer-b", "company-b");
    await seedLocation("location-a", "customer-a", "company-a");
  });

  it("rejects a report whose customer belongs to another company", async () => {
    await expect(
      testPool.query(
        'INSERT INTO reports (id, "companyId", "customerId") VALUES ($1, $2, $3)',
        ["report-cross-customer", "company-a", "customer-b"],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a location that does not belong to the report customer", async () => {
    await expect(
      testPool.query(
        'INSERT INTO reports (id, "companyId", "customerId", "locationId") VALUES ($1, $2, $3, $4)',
        ["report-cross-location-customer", "company-a", "customer-a2", "location-a"],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects partial references that would bypass composite FKs", async () => {
    await expect(
      testPool.query(
        'INSERT INTO reports (id, "companyId", "customerId") VALUES ($1, NULL, $2)',
        ["report-customer-no-company", "customer-a"],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      testPool.query(
        'INSERT INTO reports (id, "companyId", "locationId") VALUES ($1, $2, $3)',
        ["report-location-no-customer", "company-a", "location-a"],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("preserves company/customer references when a linked location or customer is deleted", async () => {
    const reportId = "report-delete-targets";
    await testPool.query(
      'INSERT INTO reports (id, "companyId", "customerId", "locationId") VALUES ($1, $2, $3, $4)',
      [reportId, "company-a", "customer-a", "location-a"],
    );

    await testPool.query('DELETE FROM locations WHERE id = $1', ["location-a"]);
    let result = await testPool.query(
      'SELECT "companyId", "customerId", "locationId" FROM reports WHERE id = $1',
      [reportId],
    );
    expect(result.rows[0]).toEqual({
      companyId: "company-a",
      customerId: "customer-a",
      locationId: null,
    });

    await testPool.query('DELETE FROM customers WHERE id = $1', ["customer-a"]);
    result = await testPool.query(
      'SELECT "companyId", "customerId", "locationId" FROM reports WHERE id = $1',
      [reportId],
    );
    expect(result.rows[0]).toEqual({
      companyId: "company-a",
      customerId: null,
      locationId: null,
    });
  });

  it("rejects tenant-inconsistent updates as well as inserts", async () => {
    const reportId = "report-update-tenant-integrity";
    await testPool.query(
      'INSERT INTO reports (id, "companyId", "customerId") VALUES ($1, $2, $3)',
      [reportId, "company-a", "customer-a2"],
    );

    await expect(
      testPool.query(
        'UPDATE reports SET "customerId" = $1 WHERE id = $2',
        ["customer-b", reportId],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    await expect(
      testPool.query(
        'UPDATE reports SET "customerId" = $1, "locationId" = $2 WHERE id = $3',
        ["customer-a2", "location-a", reportId],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    await expect(
      testPool.query(
        'UPDATE reports SET "companyId" = NULL WHERE id = $1',
        [reportId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const result = await testPool.query(
      'SELECT "companyId", "customerId", "locationId" FROM reports WHERE id = $1',
      [reportId],
    );
    expect(result.rows[0]).toEqual({
      companyId: "company-a",
      customerId: "customer-a",
      locationId: null,
    });
  });

});
