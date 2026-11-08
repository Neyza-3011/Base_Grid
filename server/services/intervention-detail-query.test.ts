import { describe, expect, it, vi } from "vitest";
import { InterventionService } from "./intervention.service";

describe("Intervention detail query reuse", () => {
  it("reads a linked asset once for both display data and the completion score", async () => {
    const intervention = {
      id: "intervention-1",
      companyId: "company-1",
      customerId: "customer-1",
      locationId: "location-1",
      assetId: "asset-1",
      technicianId: "technician-1",
      description: "Inspect electrical panel",
      priority: "media",
      status: "in_lavorazione",
      createdBy: "admin-1",
      updatedBy: "admin-1",
      createdAt: "2026-11-08T10:00:00.000Z",
      updatedAt: "2026-11-08T10:00:00.000Z",
      actualHours: 1,
    };
    const asset = {
      id: "asset-1",
      companyId: "company-1",
      customerId: "customer-1",
      locationId: "location-1",
      assetType: "altro",
      name: "Quadro elettrico",
      status: "attivo",
      isActive: true,
      createdAt: "2026-11-08T10:00:00.000Z",
      updatedAt: "2026-11-08T10:00:00.000Z",
    };
    const db = {
      getInterventionByIdAndCompany: vi.fn().mockResolvedValue(intervention),
      getCustomerByIdAndCompany: vi.fn().mockResolvedValue({ id: "customer-1", displayName: "Cliente Test", phoneNumber: "" }),
      getLocationByIdAndCompany: vi.fn().mockResolvedValue({ id: "location-1", name: "Sede Test", address: "Via Test 1", city: "Roma" }),
      getAssetByIdAndCompany: vi.fn().mockResolvedValue(asset),
      getUserByIdAndCompany: vi.fn().mockResolvedValue({ id: "technician-1", fullName: "Tecnico Test" }),
      getReportByInterventionId: vi.fn().mockResolvedValue(null),
    };

    const service = new InterventionService(db as any);
    const response = await service.getInterventionById("company-1", "intervention-1");

    expect(db.getAssetByIdAndCompany).toHaveBeenCalledTimes(1);
    expect(response.assetName).toBe("Quadro elettrico");
    expect(response.jobCompleteScore).toBeDefined();
  });
});
