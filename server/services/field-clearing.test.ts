import { describe, it, expect, beforeEach, vi } from "vitest";
import { DatabaseStore, PostgresAdapter } from "../db";
import { InterventionService } from "./intervention.service";
import { AssetService } from "./asset.service";
import { CustomerService } from "./customer.service";

describe("Field Clearing & Null Safety Suite", () => {
  let db: DatabaseStore;
  let interventionService: InterventionService;
  let assetService: AssetService;
  let customerService: CustomerService;
  const companyId = "comp-test-clearing-1";

  beforeEach(async () => {
    db = new DatabaseStore();
    interventionService = new InterventionService(db);
    assetService = new AssetService(db);
    customerService = new CustomerService(db);

    await db.createCustomer(companyId, {
      id: "cust-1",
      displayName: "Customer 1",
      legalName: "Legal Name Srl",
      vatNumber: "IT12345678901",
      taxCode: "TXX123456789",
      email: "info@cust1.it",
      phoneNumber: "+39 02 123456",
      pec: "pec@cust1.it",
      notes: "Customer notes",
    });

    await db.createLocation(companyId, "cust-1", {
      id: "loc-1",
      name: "Location 1",
      address: "Via Roma 1",
      city: "Milano",
      province: "MI",
      postalCode: "20100",
      notes: "Location notes",
    });

    await db.createAsset(companyId, "cust-1", "loc-1", {
      id: "asset-1",
      name: "Asset 1",
      assetType: "quadro",
      manufacturer: "Siemens",
      model: "S7-1200",
      serialNumber: "SN-98765",
      installationDate: "2023-01-15",
      warrantyEndDate: "2025-01-15",
      notes: "Asset notes",
    });

    await db.createTeamMember({
      companyId,
      companyName: "Company Test 1",
      email: "tech1@test.com",
      fullName: "Tech One",
      role: "technician",
      passwordHash: "hash",
      salt: "salt",
      isActive: true,
      emailConfirmed: true,
    });
  });

  describe("AssetService.updateAsset", () => {
    it("should safely clear optional string fields with null or whitespace strings without throwing", async () => {
      const initial = await assetService.getAssetById(companyId, "asset-1");
      expect(initial.manufacturer).toBe("Siemens");
      expect(initial.model).toBe("S7-1200");
      expect(initial.serialNumber).toBe("SN-98765");
      expect(initial.installationDate).toBe("2023-01-15");
      expect(initial.warrantyEndDate).toBe("2025-01-15");
      expect(initial.notes).toBe("Asset notes");

      const updated = await assetService.updateAsset(companyId, "asset-1", {
        manufacturer: null as any,
        model: "   ",
        serialNumber: null as any,
        installationDate: "",
        warrantyEndDate: null as any,
        notes: "   ",
      });

      expect(updated.manufacturer).toBeUndefined();
      expect(updated.model).toBeUndefined();
      expect(updated.serialNumber).toBeUndefined();
      expect(updated.installationDate).toBeUndefined();
      expect(updated.warrantyEndDate).toBeUndefined();
      expect(updated.notes).toBeUndefined();
    });

    it("should leave fields unchanged when undefined is passed", async () => {
      const updated = await assetService.updateAsset(companyId, "asset-1", {
        name: "Asset Renamed",
      });

      expect(updated.name).toBe("Asset Renamed");
      expect(updated.manufacturer).toBe("Siemens");
      expect(updated.model).toBe("S7-1200");
    });
  });

  describe("InterventionService.updateIntervention", () => {
    it("should safely clear optional fields (assetId, technicianId, problem, notes, scheduled dates, hours) with null or empty strings", async () => {
      const users = await db.getUsersByCompany(companyId);
      const tech = users.find((u) => u.role === "technician")!;

      const created = await interventionService.createIntervention(companyId, "user-admin", {
        customerId: "cust-1",
        locationId: "loc-1",
        assetId: "asset-1",
        technicianId: tech.id,
        description: "Initial description",
        problem: "Initial problem",
        scheduledStart: "2025-03-01T08:00:00.000Z",
        scheduledEnd: "2025-03-01T12:00:00.000Z",
        estimatedHours: 4,
        notes: "Initial notes",
      });

      expect(created.assetId).toBe("asset-1");
      expect(created.technicianId).toBe(tech.id);
      expect(created.problem).toBe("Initial problem");
      expect(created.scheduledStart).toBe("2025-03-01T08:00:00.000Z");
      expect(created.scheduledEnd).toBe("2025-03-01T12:00:00.000Z");
      expect(created.estimatedHours).toBe(4);
      expect(created.notes).toBe("Initial notes");

      const updated = await interventionService.updateIntervention(companyId, "user-admin", created.id, {
        assetId: null,
        technicianId: null,
        problem: null,
        scheduledStart: null,
        scheduledEnd: null,
        estimatedHours: null,
        actualHours: null,
        notes: "",
      });

      expect(updated.assetId).toBeUndefined();
      expect(updated.technicianId).toBeUndefined();
      expect(updated.problem).toBeUndefined();
      expect(updated.scheduledStart).toBeUndefined();
      expect(updated.scheduledEnd).toBeUndefined();
      expect(updated.estimatedHours).toBeUndefined();
      expect(updated.actualHours).toBeUndefined();
      expect(updated.notes).toBeUndefined();
    });

    it("should preserve existing values when fields are omitted or undefined", async () => {
      const created = await interventionService.createIntervention(companyId, "user-admin", {
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Initial description",
        problem: "Initial problem",
        estimatedHours: 4,
      });

      const updated = await interventionService.updateIntervention(companyId, "user-admin", created.id, {
        description: "Updated description",
      });

      expect(updated.description).toBe("Updated description");
      expect(updated.problem).toBe("Initial problem");
      expect(updated.estimatedHours).toBe(4);
    });
  });

  describe("CustomerService.updateCustomer & updateLocation", () => {
    it("should clear optional fields on customer and location when null or empty string passed", async () => {
      const customer = await customerService.updateCustomer(companyId, "cust-1", {
        legalName: null as any,
        vatNumber: "",
        taxCode: null as any,
        email: "",
        phoneNumber: null as any,
        pec: "",
        notes: null as any,
      });

      expect(customer.legalName).toBeUndefined();
      expect(customer.vatNumber).toBeUndefined();
      expect(customer.taxCode).toBeUndefined();
      expect(customer.email).toBeUndefined();
      expect(customer.phoneNumber).toBeUndefined();
      expect(customer.pec).toBeUndefined();
      expect(customer.notes).toBeUndefined();

      const location = await customerService.updateLocation(companyId, "loc-1", {
        province: null as any,
        postalCode: "",
        notes: null as any,
      });

      expect(location.province).toBeUndefined();
      expect(location.postalCode).toBeUndefined();
      expect(location.notes).toBeUndefined();
    });
  });

  describe("Required location fields", () => {
    it.each([
      ["name", ""],
      ["name", "   "],
      ["name", null],
      ["address", ""],
      ["address", "   "],
      ["address", null],
      ["city", ""],
      ["city", "   "],
      ["city", null],
    ])("rejects an empty required %s update instead of silently preserving stale data", async (field, value) => {
      await expect(
        customerService.updateLocation(companyId, "loc-1", { [field]: value } as any),
      ).rejects.toThrow();
    });
  });

  describe("PostgresAdapter Query Generation Parity", () => {
    it("should generate SQL containing NULL assignments when null fields are passed to PostgresAdapter", async () => {
      const mockQuery = vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [
          {
            id: "int-123",
            companyId,
            customerId: "cust-1",
            locationId: "loc-1",
            assetId: null,
            description: "Test",
            problem: null,
            priority: "media",
            status: "nuovo",
            scheduledStart: null,
            scheduledEnd: null,
            technicianId: null,
            estimatedHours: null,
            actualHours: null,
            notes: null,
            createdBy: "admin",
            updatedBy: "admin",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      });

      const fakePool = { query: mockQuery };
      const pgAdapter = new PostgresAdapter(fakePool as any);

      await pgAdapter.updateIntervention(companyId, "int-123", {
        updatedBy: "admin",
        assetId: null as any,
        technicianId: null as any,
        problem: null as any,
        notes: null as any,
      });

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0];

      expect(sql).toContain('"assetId" =');
      expect(sql).toContain('"technicianId" =');
      expect(sql).toContain('"problem" =');
      expect(sql).toContain('"notes" =');
      expect(params).toContain(null);
    });
  });
});
