import { describe, it, expect, beforeEach } from "vitest";
import { InterventionService } from "./intervention.service";
import { DatabaseStore } from "../db";
import { IDatabaseAdapter } from "../types";

describe("InterventionService Performance & Query Optimization", () => {
  let dbStore: DatabaseStore;
  let service: InterventionService;

  const companyId = "comp-perf-001";

  beforeEach(async () => {
    dbStore = new DatabaseStore();
    service = new InterventionService(dbStore);
  });

  it("efficiently batch-fetches distinct entities and avoids N+1 database queries when listing interventions", async () => {
    // 1. Seed 2 customers, 3 locations, 2 assets, 2 technicians
    const customer1 = await dbStore.createCustomer(companyId, { displayName: "Cliente Alfa" });
    const customer2 = await dbStore.createCustomer(companyId, { displayName: "Cliente Beta" });

    const location1 = await dbStore.createLocation(companyId, customer1.id, { name: "Sede Alfa 1", address: "Via Roma 1", city: "Milano" });
    const location2 = await dbStore.createLocation(companyId, customer1.id, { name: "Sede Alfa 2", address: "Via Roma 2", city: "Milano" });
    const location3 = await dbStore.createLocation(companyId, customer2.id, { name: "Sede Beta 1", address: "Corso Italia 10", city: "Torino" });

    const asset1 = await dbStore.createAsset(companyId, customer1.id, location1.id, { name: "Quadro Elettrico Principal", assetType: "quadro" });
    const asset2 = await dbStore.createAsset(companyId, customer2.id, location3.id, { name: "Inverter Fotovoltaico", assetType: "inverter" });

    const tech1 = await dbStore.createTeamMember({
      companyId,
      companyName: "Perf Company",
      email: "tech1@perf.it",
      fullName: "Mario Rossi",
      role: "technician",
      passwordHash: "hash",
      salt: "salt",
      isActive: true,
      emailConfirmed: true,
    });

    const tech2 = await dbStore.createTeamMember({
      companyId,
      companyName: "Perf Company",
      email: "tech2@perf.it",
      fullName: "Luigi Verde",
      role: "technician",
      passwordHash: "hash",
      salt: "salt",
      isActive: true,
      emailConfirmed: true,
    });

    // 2. Create 20 interventions referencing these shared entities
    for (let i = 1; i <= 20; i++) {
      const isEven = i % 2 === 0;
      const targetCustomer = isEven ? customer2 : customer1;
      const targetLocation = isEven ? location3 : (i === 3 ? location2 : location1);
      const targetAsset = isEven ? asset2 : asset1;
      const targetTech = isEven ? tech2.id : tech1.id;

      await dbStore.createIntervention(companyId, {
        customerId: targetCustomer.id,
        locationId: targetLocation.id,
        assetId: targetAsset.id,
        technicianId: targetTech,
        description: `Intervento Perf ${i}`,
        priority: "media",
        status: "nuovo",
        createdBy: "usr-admin",
        updatedBy: "usr-admin",
      });
    }

    // 3. Instrument DB adapter methods to track call counts
    const callCounts = {
      getCustomer: 0,
      getLocation: 0,
      getAsset: 0,
      getUser: 0,
      getReport: 0,
    };

    const origGetCustomer = dbStore.getCustomerByIdAndCompany.bind(dbStore);
    dbStore.getCustomerByIdAndCompany = async (cid, compId) => {
      callCounts.getCustomer++;
      return origGetCustomer(cid, compId);
    };

    const origGetLocation = dbStore.getLocationByIdAndCompany.bind(dbStore);
    dbStore.getLocationByIdAndCompany = async (lid, compId) => {
      callCounts.getLocation++;
      return origGetLocation(lid, compId);
    };

    const origGetAsset = dbStore.getAssetByIdAndCompany.bind(dbStore);
    dbStore.getAssetByIdAndCompany = async (aid, compId) => {
      callCounts.getAsset++;
      return origGetAsset(aid, compId);
    };

    const origGetUser = dbStore.getUserByIdAndCompany.bind(dbStore);
    dbStore.getUserByIdAndCompany = async (uid, compId) => {
      callCounts.getUser++;
      return origGetUser(uid, compId);
    };

    const origGetReport = dbStore.getReportByInterventionId.bind(dbStore);
    dbStore.getReportByInterventionId = async (compId, iid) => {
      callCounts.getReport++;
      return origGetReport(compId, iid);
    };

    // 4. Call getInterventions for a page of 20 items
    const result = await service.getInterventions(companyId, { limit: 50 });

    expect(result.items.length).toBe(20);

    // 5. Verify correctness of enriched properties
    for (const item of result.items) {
      expect(item.customerName).toBeDefined();
      expect(item.locationName).toBeDefined();
      expect(item.assetName).toBeDefined();
      expect(item.technicianName).toBeDefined();
      expect(item.jobCompleteScore).toBeDefined();
    }

    // 6. Assert query count efficiency:
    // With 20 interventions referencing 2 customers, 3 locations, 2 assets, 2 technicians:
    // - Unoptimized N+1 would execute:
    //   20 customer queries + 20 location queries + 20 asset queries + 20 technician queries + 20 report queries + 20 duplicate asset queries = 120 queries!
    // - Optimized batch implementation executes ONLY:
    //   2 customer queries (1 per distinct customer)
    //   3 location queries (1 per distinct location)
    //   2 asset queries (1 per distinct asset)
    //   2 technician queries (1 per distinct technician)
    //   20 report queries
    //   0 duplicate asset queries!
    expect(callCounts.getCustomer).toBe(2); // Exactly 2 distinct customers
    expect(callCounts.getLocation).toBe(3);  // Exactly 3 distinct locations
    expect(callCounts.getAsset).toBe(2);     // Exactly 2 distinct assets (reused without duplicate query)
    expect(callCounts.getUser).toBe(2);      // Exactly 2 distinct technicians

    const totalEnrichmentQueries = callCounts.getCustomer + callCounts.getLocation + callCounts.getAsset + callCounts.getUser;
    expect(totalEnrichmentQueries).toBe(9);  // 9 queries total instead of 100 queries! (91% reduction!)
  });
});
