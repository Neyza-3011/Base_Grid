import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseStore } from "../db";
import { InterventionService } from "./intervention.service";

describe("InterventionService Job Complete Score dependency reads", () => {
  let dbStore: DatabaseStore;
  let service: InterventionService;
  let companyId: string;
  let interventionId: string;
  let assetId: string;

  beforeEach(async () => {
    dbStore = new DatabaseStore();
    service = new InterventionService(dbStore);
    companyId = "comp-score-read-errors";

    const customer = await dbStore.createCustomer(companyId, {
      displayName: "Cliente Test",
    });
    const location = await dbStore.createLocation(companyId, customer.id, {
      name: "Sede Test",
      address: "Via Test 1",
      city: "Roma",
    });
    const asset = await dbStore.createAsset(companyId, customer.id, location.id, {
      name: "Asset Test",
      assetType: "quadro",
    });
    assetId = asset.id;

    const intervention = await dbStore.createIntervention(companyId, {
      customerId: customer.id,
      locationId: location.id,
      assetId,
      description: "Verifica quadro elettrico",
      priority: "media",
      status: "nuovo",
      createdBy: "usr-score-test",
      updatedBy: "usr-score-test",
    });
    interventionId = intervention.id;
  });

  it("preserves incomplete-score behavior when the report lookup legitimately returns null", async () => {
    const result = await service.getInterventions(companyId);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].jobCompleteScore).toBeDefined();
    expect(result.items[0].jobCompleteScore?.readyForBilling).toBe(false);
    expect(
      result.items[0].jobCompleteScore?.checks.find((check) => check.id === "report_linked")?.passed
    ).toBe(false);
    expect(result.items[0].assetName).toBe("Asset Test");
  });

  it("propagates report read failures instead of calculating a score with an artificial null report", async () => {
    (dbStore as any).getReportByInterventionId = async () => {
      throw new Error("report read failed");
    };

    await expect(service.getInterventions(companyId)).rejects.toThrow("report read failed");
  });

  it("propagates asset read failures instead of classifying the asset as absent", async () => {
    (dbStore as any).getAssetByIdAndCompany = async () => {
      throw new Error("asset read failed");
    };

    await expect(service.getInterventions(companyId)).rejects.toThrow("asset read failed");
  });

  it("continues to calculate a score when required reads succeed and the report is genuinely absent", async () => {
    const getReport = dbStore.getReportByInterventionId.bind(dbStore);
    (dbStore as any).getReportByInterventionId = async (tenantId: string, id: string) => {
      expect(tenantId).toBe(companyId);
      expect(id).toBe(interventionId);
      return getReport(tenantId, id);
    };

    const getAsset = dbStore.getAssetByIdAndCompany.bind(dbStore);
    (dbStore as any).getAssetByIdAndCompany = async (id: string, tenantId: string) => {
      expect(tenantId).toBe(companyId);
      expect(id).toBe(assetId);
      return getAsset(id, tenantId);
    };

    const result = await service.getInterventions(companyId);

    expect(result.items[0].jobCompleteScore).toBeDefined();
    expect(result.items[0].assetName).toBe("Asset Test");
    expect(result.items[0].jobCompleteScore?.readyForBilling).toBe(false);
  });
});
