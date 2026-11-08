import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import path from "path";
import { PostgresAdapter } from "../db-postgres";
import { runMigrations, loadMigrationsFromDir } from "../migrator";
import { AssetService } from "./asset.service";

const testDatabaseUrl = process.env.MIGRATOR_TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("Asset linked-intervention integrity against PostgreSQL", () => {
  let adminPool: Pool | undefined;
  let testPool: Pool | undefined;
  let adapter: PostgresAdapter | undefined;
  let schemaName = "";

  beforeAll(async () => {
    if (!testDatabaseUrl) return;

    const parsedUrl = new URL(testDatabaseUrl);
    const databaseName = parsedUrl.pathname.replace(/^\//, "");
    if (
      !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) ||
      !databaseName.endsWith("_test")
    ) {
      throw new Error("Asset integrity tests require a loopback *_test database URL.");
    }

    adminPool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
    schemaName = "asset_intervention_fk_" + randomUUID().replace(/-/g, "");
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: testDatabaseUrl,
      options: `-c search_path=${schemaName}`,
      max: 4,
    });
    await runMigrations(testPool, {
      migrations: loadMigrationsFromDir(path.resolve(__dirname, "../migrations")),
    });
    adapter = new PostgresAdapter(testPool);
  }, 60_000);

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    if (adminPool) await adminPool.end();
  }, 15_000);

  it("returns a controlled 409 and preserves relationships when PostgreSQL blocks a concurrent asset move", async () => {
    const company = await adapter!.createUser({
      email: `asset-fk-admin-${randomUUID()}@example.test`,
      fullName: "Asset FK Admin",
      companyName: "Asset FK Test",
      password: "Test-only-password-123!",
      role: "admin",
    });
    const companyId = company.company.id;
    const customerA = await adapter!.createCustomer(companyId, { displayName: "Customer A" });
    const locationA = await adapter!.createLocation(companyId, customerA.id, {
      name: "Location A",
      address: "Address A",
      city: "Roma",
    });
    const asset = await adapter!.createAsset(companyId, customerA.id, locationA.id, {
      name: "Linked electrical panel",
      assetType: "quadro",
    });
    const technician = await adapter!.createTeamMember({
      companyId,
      companyName: company.company.name,
      email: `asset-fk-tech-${randomUUID()}@example.test`,
      fullName: "Asset FK Technician",
      role: "technician",
      passwordHash: "test-hash",
      salt: "test-salt",
      isActive: true,
      emailConfirmed: true,
    });
    const intervention = await adapter!.createIntervention(companyId, {
      customerId: customerA.id,
      locationId: locationA.id,
      assetId: asset.id,
      technicianId: technician.id,
      description: "Inspect linked panel",
      priority: "media",
      status: "nuovo",
      createdBy: company.user.id,
      updatedBy: company.user.id,
    });

    const customerB = await adapter!.createCustomer(companyId, { displayName: "Customer B" });
    const locationB = await adapter!.createLocation(companyId, customerB.id, {
      name: "Location B",
      address: "Address B",
      city: "Roma",
    });

    // Simulate the race after the service preflight read: the real PostgreSQL
    // composite FK still sees the linked intervention and must reject the move.
    const adapterWithStalePreflight = Object.create(adapter) as PostgresAdapter;
    (adapterWithStalePreflight as any).getInterventionsByCompany = vi.fn().mockResolvedValue({
      items: [],
      totalCount: 0,
    });
    const service = new AssetService(adapterWithStalePreflight);

    await expect(
      service.updateAsset(companyId, asset.id, {
        customerId: customerB.id,
        locationId: locationB.id,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const persistedAsset = await adapter!.getAssetByIdAndCompany(asset.id, companyId);
    const persistedIntervention = await adapter!.getInterventionByIdAndCompany(intervention.id, companyId);
    expect(persistedAsset).toMatchObject({
      customerId: customerA.id,
      locationId: locationA.id,
    });
    expect(persistedIntervention).toMatchObject({
      customerId: customerA.id,
      locationId: locationA.id,
      assetId: asset.id,
    });
  }, 30_000);
});
