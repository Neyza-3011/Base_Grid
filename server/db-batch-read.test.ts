import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseStore } from "./db";

describe("DatabaseStore batched tenant-scoped reads", () => {
  let db: DatabaseStore;

  beforeEach(() => {
    db = new DatabaseStore();
  });

  async function seedTenant(companyId: string, prefix: string) {
    const customer = await db.createCustomer(companyId, {
      id: `${prefix}-customer`,
      displayName: `${prefix} customer`,
    });
    const location = await db.createLocation(companyId, customer.id, {
      id: `${prefix}-location`,
      name: `${prefix} location`,
    });
    const asset = await db.createAsset(companyId, customer.id, location.id, {
      id: `${prefix}-asset`,
      name: `${prefix} asset`,
    });
    const technician = await db.createTeamMember({
      companyId,
      companyName: `${prefix} company`,
      email: `${prefix}@example.test`,
      fullName: `${prefix} technician`,
      role: "technician",
      passwordHash: "test-hash",
      salt: "test-salt",
      isActive: true,
      emailConfirmed: true,
    });
    const intervention = await db.createIntervention(companyId, {
      id: `${prefix}-intervention`,
      customerId: customer.id,
      locationId: location.id,
      assetId: asset.id,
      technicianId: technician.id,
      description: `${prefix} intervention`,
      priority: "media",
      status: "nuovo",
      createdBy: `${prefix}-admin`,
      updatedBy: `${prefix}-admin`,
    });
    const report = await db.createReport(companyId, {
      id: `${prefix}-report`,
      interventionId: intervention.id,
      customerId: customer.id,
      locationId: location.id,
      client: { name: customer.displayName },
      technician: { fullName: technician.fullName },
      materialsStatus: "none",
      materialsUsed: [],
    });
    return { customer, location, asset, technician, intervention, report };
  }

  it("returns only matching tenant records for all five batch methods", async () => {
    const tenantA = await seedTenant("company-a", "a");
    const tenantB = await seedTenant("company-b", "b");

    expect(await db.getCustomersByIdsAndCompany([tenantA.customer.id, tenantB.customer.id], "company-a"))
      .toEqual([tenantA.customer]);
    expect(await db.getLocationsByIdsAndCompany([tenantA.location.id, tenantB.location.id], "company-a"))
      .toEqual([tenantA.location]);
    expect(await db.getAssetsByIdsAndCompany([tenantA.asset.id, tenantB.asset.id], "company-a"))
      .toEqual([tenantA.asset]);
    expect((await db.getUsersByIdsAndCompany([tenantA.technician.id, tenantB.technician.id], "company-a"))
      .map((user) => user.id)).toEqual([tenantA.technician.id]);
    expect(await db.getReportsByInterventionIdsAndCompany(
      [tenantA.intervention.id, tenantB.intervention.id],
      "company-a",
    )).toEqual([tenantA.report]);
  });

  it("returns empty arrays for empty or missing IDs and rejects a missing tenant ID", async () => {
    expect(await db.getCustomersByIdsAndCompany([], "company-a")).toEqual([]);
    expect(await db.getLocationsByIdsAndCompany(["missing"], "company-a")).toEqual([]);
    expect(await db.getAssetsByIdsAndCompany(["missing"], "company-a")).toEqual([]);
    expect(await db.getUsersByIdsAndCompany(["missing"], "company-a")).toEqual([]);
    expect(await db.getReportsByInterventionIdsAndCompany(["missing"], "company-a")).toEqual([]);

    await expect(db.getCustomersByIdsAndCompany(["a-customer"], "")).rejects.toThrow("missing companyId");
    await expect(db.getLocationsByIdsAndCompany(["a-location"], "")).rejects.toThrow("missing companyId");
    await expect(db.getAssetsByIdsAndCompany(["a-asset"], "")).rejects.toThrow("missing companyId");
    await expect(db.getUsersByIdsAndCompany(["a-user"], "")).rejects.toThrow("missing companyId");
    await expect(db.getReportsByInterventionIdsAndCompany(["a-intervention"], "")).rejects.toThrow("missing companyId");
  });
});
