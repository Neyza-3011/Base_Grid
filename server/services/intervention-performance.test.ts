import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import { PostgresAdapter } from "../db-postgres";
import { runMigrations } from "../migrator";
import { InterventionService } from "./intervention.service";

const testDatabaseUrl = process.env.MIGRATOR_TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("InterventionService PostgreSQL query-count regression", () => {
  let adminPool: Pool | undefined;
  let testPool: Pool | undefined;
  let adapter: PostgresAdapter;
  let service: InterventionService;
  let schemaName = "";
  let captureQueries = false;
  let failBatchTable: "reports" | "assets" | null = null;
  const capturedQueries: string[] = [];
  let companyA = "";
  let adminA = "";
  let companyB = "";
  let customerBId = "";
  let locationBId = "";
  let assetBId = "";
  let technicianBId = "";
  let interventionBId = "";
  const seededInterventionIds: string[] = [];

  beforeAll(async () => {
    if (!testDatabaseUrl) return;

    const parsedUrl = new URL(testDatabaseUrl);
    const databaseName = parsedUrl.pathname.replace(/^\//, "");
    // Guard against accidentally running destructive test cleanup against a live database.
    if (
      !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) ||
      !databaseName.endsWith("_test")
    ) {
      throw new Error("PostgreSQL performance tests require a loopback *_test database URL.");
    }

    adminPool = new Pool({ connectionString: testDatabaseUrl });
    schemaName = `intervention_perf_${randomUUID().replace(/-/g, "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: testDatabaseUrl,
      options: `-c search_path=${schemaName}`,
      max: 10,
    });
    await runMigrations(testPool);
    adapter = new PostgresAdapter(testPool);
    service = new InterventionService(adapter);

    const tenantA = await adapter.createUser({
      email: `perf-admin-${randomUUID()}@example.test`,
      fullName: "Performance Test Admin",
      companyName: "Performance Test A",
      password: "Test-only-password-123!",
      role: "admin",
    });
    companyA = tenantA.company.id;
    adminA = tenantA.user.id;

    // Each intervention deliberately has its own customer, location, asset and
    // technician so repeated shared references cannot hide per-ID query fan-out.
    for (let i = 0; i < 100; i++) {
      const customer = await adapter.createCustomer(companyA, {
        displayName: `Perf customer ${i}`,
      });
      const location = await adapter.createLocation(companyA, customer.id, {
        name: `Perf location ${i}`,
        address: `Test address ${i}`,
        city: "Test City",
      });
      const asset = await adapter.createAsset(companyA, customer.id, location.id, {
        name: `Perf asset ${i}`,
        assetType: "altro",
      });
      const technician = await adapter.createTeamMember({
        companyId: companyA,
        companyName: tenantA.company.name,
        email: `perf-tech-${i}-${randomUUID()}@example.test`,
        fullName: `Perf technician ${i}`,
        role: "technician",
        passwordHash: "test-hash",
        salt: "test-salt",
        isActive: true,
        emailConfirmed: true,
      });
      const intervention = await adapter.createIntervention(companyA, {
        customerId: customer.id,
        locationId: location.id,
        assetId: asset.id,
        technicianId: technician.id,
        description: `Performance intervention ${i}`,
        priority: "media",
        status: "nuovo",
        createdBy: adminA,
        updatedBy: adminA,
      });
      seededInterventionIds.push(intervention.id);
      await adapter.createReport(companyA, {
        interventionId: intervention.id,
        customerId: customer.id,
        locationId: location.id,
        client: { name: customer.displayName },
        technician: { fullName: technician.fullName },
        materialsStatus: "none",
        materialsUsed: [],
      });
    }

    const tenantB = await adapter.createUser({
      email: `perf-admin-b-${randomUUID()}@example.test`,
      fullName: "Performance Test Admin B",
      companyName: "Performance Test B",
      password: "Test-only-password-123!",
      role: "admin",
    });
    companyB = tenantB.company.id;
    const customerB = await adapter.createCustomer(companyB, { displayName: "Tenant B customer" });
    customerBId = customerB.id;
    const locationB = await adapter.createLocation(companyB, customerB.id, { name: "Tenant B location" });
    locationBId = locationB.id;
    const assetB = await adapter.createAsset(companyB, customerB.id, locationB.id, { name: "Tenant B asset" });
    assetBId = assetB.id;
    const technicianB = await adapter.createTeamMember({
      companyId: companyB,
      companyName: tenantB.company.name,
      email: `perf-tech-b-${randomUUID()}@example.test`,
      fullName: "Tenant B technician",
      role: "technician",
      passwordHash: "test-hash",
      salt: "test-salt",
      isActive: true,
      emailConfirmed: true,
    });
    technicianBId = technicianB.id;
    const interventionB = await adapter.createIntervention(companyB, {
      customerId: customerB.id,
      locationId: locationB.id,
      assetId: assetB.id,
      technicianId: technicianB.id,
      description: "Tenant B intervention",
      priority: "media",
      status: "nuovo",
      createdBy: tenantB.user.id,
      updatedBy: tenantB.user.id,
    });
    interventionBId = interventionB.id;
    await adapter.createReport(companyB, {
      interventionId: interventionB.id,
      customerId: customerB.id,
      locationId: locationB.id,
      client: { name: customerB.displayName },
      technician: { fullName: technicianB.fullName },
      materialsStatus: "none",
      materialsUsed: [],
    });

    // Count calls sent through the real pg Pool, not in-memory adapter methods.
    const poolWithSpy = testPool as any;
    const originalQuery = testPool.query.bind(testPool);
    poolWithSpy.query = (...args: any[]) => {
      const sql = typeof args[0] === "string" ? args[0] : String(args[0]?.text || "");
      if (captureQueries) capturedQueries.push(sql);
      const isTargetBatchQuery =
        (failBatchTable === "reports" && /FROM\s+reports\b/i.test(sql)) ||
        (failBatchTable === "assets" && /FROM\s+assets\b/i.test(sql));
      if (failBatchTable && isTargetBatchQuery && /ANY\s*\(/i.test(sql)) {
        return Promise.reject(new Error(`simulated ${failBatchTable} batch read failure`));
      }
      return originalQuery(...args);
    };
  }, 120_000);

  afterAll(async () => {
    if (adapter) {
      await adapter.close();
    } else if (testPool) {
      await testPool.end();
    }
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    if (adminPool) await adminPool.end();
  }, 30_000);

  it.each([20, 50, 100])(
    "uses a constant number of real PostgreSQL queries for a page of %i distinct relations",
    async (pageSize) => {
      capturedQueries.length = 0;
      captureQueries = true;
      let result;
      try {
        result = await service.getInterventions(companyA, { limit: pageSize });
      } finally {
        captureQueries = false;
      }

      expect(result.items).toHaveLength(pageSize);
      expect(new Set(result.items.map((item) => item.customerId)).size).toBe(pageSize);
      expect(new Set(result.items.map((item) => item.locationId)).size).toBe(pageSize);
      expect(new Set(result.items.map((item) => item.assetId)).size).toBe(pageSize);
      expect(new Set(result.items.map((item) => item.technicianId)).size).toBe(pageSize);
      for (const item of result.items) {
        expect(item.customerName).toBeDefined();
        expect(item.locationName).toBeDefined();
        expect(item.assetName).toBeDefined();
        expect(item.technicianName).toBeDefined();
        expect(item.jobCompleteScore).toBeDefined();
      }

      const enrichmentQueries = capturedQueries.filter((sql) =>
        /FROM\s+(customers|locations|assets|users|reports)\b/i.test(sql),
      );
      // Two base-page statements (COUNT + SELECT) plus exactly one query for
      // each related table, including reports. These are measured pg Pool calls.
      expect(capturedQueries).toHaveLength(7);
      expect(enrichmentQueries).toHaveLength(5);
      expect(enrichmentQueries.filter((sql) => /FROM\s+reports\b/i.test(sql))).toHaveLength(1);
      expect(enrichmentQueries.filter((sql) => /ANY\s*\(/i.test(sql))).toHaveLength(5);
    },
    30_000,
  );

  it("keeps every batched lookup tenant-scoped and treats missing relations as absent", async () => {
    expect(await adapter.getCustomersByIdsAndCompany([customerBId], companyA)).toEqual([]);
    expect(await adapter.getLocationsByIdsAndCompany([locationBId], companyA)).toEqual([]);
    expect(await adapter.getAssetsByIdsAndCompany([assetBId], companyA)).toEqual([]);
    expect(await adapter.getUsersByIdsAndCompany([technicianBId], companyA)).toEqual([]);
    expect(await adapter.getReportsByInterventionIdsAndCompany([interventionBId], companyA)).toEqual([]);

    expect(await adapter.getCustomersByIdsAndCompany(["missing-customer"], companyA)).toEqual([]);
    expect(await adapter.getLocationsByIdsAndCompany(["missing-location"], companyA)).toEqual([]);
    expect(await adapter.getAssetsByIdsAndCompany(["missing-asset"], companyA)).toEqual([]);
    expect(await adapter.getUsersByIdsAndCompany(["missing-user"], companyA)).toEqual([]);
    expect(await adapter.getReportsByInterventionIdsAndCompany(["missing-intervention"], companyA)).toEqual([]);
  });

  it("preserves incomplete score behavior for a genuinely missing optional relation", async () => {
    const customer = await adapter.createCustomer(companyA, { displayName: "Missing relation customer" });
    const location = await adapter.createLocation(companyA, customer.id, { name: "Missing relation location" });
    const intervention = await adapter.createIntervention(companyA, {
      customerId: customer.id,
      locationId: location.id,
      description: "No optional asset, technician or report",
      priority: "media",
      status: "nuovo",
      createdBy: adminA,
      updatedBy: adminA,
    });

    const result = await service.getInterventions(companyA, { limit: 100 });
    const item = result.items.find((candidate) => candidate.id === intervention.id);
    expect(item).toBeDefined();
    expect(item?.assetName).toBeUndefined();
    expect(item?.technicianName).toBeUndefined();
    expect(item?.jobCompleteScore?.readyForBilling).toBe(false);
    expect(item?.jobCompleteScore?.checks.find((check) => check.id === "report_linked")?.passed).toBe(false);
  });

  it.each(["reports", "assets"] as const)(
    "propagates PostgreSQL %s batch failures instead of fabricating a missing relation",
    async (table) => {
      failBatchTable = table;
      try {
        await expect(service.getInterventions(companyA, { limit: 10 })).rejects.toThrow(
          `simulated ${table} batch read failure`,
        );
      } finally {
        failBatchTable = null;
      }
    },
  );
});
