import { describe, it, expect, beforeEach } from "vitest";
import { CustomerService } from "./customer.service";
import { AssetService } from "./asset.service";
import { ReportsService } from "./reports.service";
import { db } from "../db";
import { BadRequestError } from "../errors";

describe("QA Validation & Standalone Report Address Fallback", () => {
  const companyId = "comp-qa-test-1";
  let customerService: CustomerService;
  let assetService: AssetService;
  let reportsService: ReportsService;

  beforeEach(() => {
    db.seedInitialData?.();
    customerService = new CustomerService(db);
    assetService = new AssetService(db);
    reportsService = new ReportsService(db);

    (db as any).companies?.set?.(companyId, {
      id: companyId,
      name: "QA Test Company",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe("CustomerService Runtime Input Validation", () => {
    it("rejects non-object or missing/non-string displayName in createCustomer with BadRequestError", async () => {
      await expect(customerService.createCustomer(companyId, null as any)).rejects.toThrow(BadRequestError);
      await expect(customerService.createCustomer(companyId, { displayName: 123 } as any)).rejects.toThrow(BadRequestError);
      await expect(customerService.createCustomer(companyId, { displayName: "   " })).rejects.toThrow(BadRequestError);
    });

    it("rejects non-string optional fields in createCustomer with BadRequestError", async () => {
      await expect(
        customerService.createCustomer(companyId, { displayName: "Valid Name", notes: 123 as any })
      ).rejects.toThrow(BadRequestError);
    });

    it("rejects non-string or whitespace displayName and invalid optional fields in updateCustomer", async () => {
      const cust = await customerService.createCustomer(companyId, { displayName: "Valid Initial Customer" });

      await expect(customerService.updateCustomer(companyId, cust.id, { displayName: 123 as any })).rejects.toThrow(BadRequestError);
      await expect(customerService.updateCustomer(companyId, cust.id, { displayName: "   " })).rejects.toThrow(BadRequestError);
      await expect(customerService.updateCustomer(companyId, cust.id, { notes: 999 as any })).rejects.toThrow(BadRequestError);
    });

    it("rejects non-string or whitespace required/optional fields in createLocation", async () => {
      const cust = await customerService.createCustomer(companyId, { displayName: "Location Owner Cust" });

      await expect(
        customerService.createLocation(companyId, cust.id, { name: 123, address: "Via Roma", city: "Milano" } as any)
      ).rejects.toThrow(BadRequestError);

      await expect(
        customerService.createLocation(companyId, cust.id, { name: "Sede", address: true, city: "Milano" } as any)
      ).rejects.toThrow(BadRequestError);

      await expect(
        customerService.createLocation(companyId, cust.id, { name: "Sede", address: "Via Roma", city: "  " } as any)
      ).rejects.toThrow(BadRequestError);
    });

    it("rejects non-string fields in updateLocation", async () => {
      const cust = await customerService.createCustomer(companyId, { displayName: "Update Loc Cust" });
      const loc = await customerService.createLocation(companyId, cust.id, {
        name: "Sede Iniziale",
        address: "Via Roma 1",
        city: "Milano",
      });

      await expect(customerService.updateLocation(companyId, loc.id, { name: 123 as any })).rejects.toThrow(BadRequestError);
      await expect(customerService.updateLocation(companyId, loc.id, { name: "   " })).rejects.toThrow(BadRequestError);
      await expect(customerService.updateLocation(companyId, loc.id, { address: false as any })).rejects.toThrow(BadRequestError);
    });
  });

  describe("AssetService Runtime Input Validation", () => {
    it("rejects non-string optional fields in createAsset with BadRequestError", async () => {
      const cust = await customerService.createCustomer(companyId, { displayName: "Asset Cust" });
      const loc = await customerService.createLocation(companyId, cust.id, {
        name: "Asset Loc",
        address: "Via Milano 2",
        city: "Milano",
      });

      await expect(
        assetService.createAsset(companyId, {
          name: "Inverter Solar",
          customerId: cust.id,
          locationId: loc.id,
          assetType: "inverter",
          manufacturer: 12345 as any,
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("rejects non-string name or optional fields in updateAsset with BadRequestError", async () => {
      const cust = await customerService.createCustomer(companyId, { displayName: "Asset Cust Update" });
      const loc = await customerService.createLocation(companyId, cust.id, {
        name: "Asset Loc Update",
        address: "Via Torino 5",
        city: "Torino",
      });
      const asset = await assetService.createAsset(companyId, {
        name: "Quadro Elettrico",
        customerId: cust.id,
        locationId: loc.id,
        assetType: "quadro",
      });

      await expect(assetService.updateAsset(companyId, asset.id, { name: 123 as any })).rejects.toThrow(BadRequestError);
      await expect(assetService.updateAsset(companyId, asset.id, { name: " " })).rejects.toThrow(BadRequestError);
      await expect(assetService.updateAsset(companyId, asset.id, { model: true as any })).rejects.toThrow(BadRequestError);
    });
  });

  describe("ReportsService Standalone Report Address Fallback", () => {
    it("automatically populates client address and city from locationRecord for standalone reports", async () => {
      const cust = await customerService.createCustomer(companyId, { displayName: "Acme Standalone Client" });
      const loc = await customerService.createLocation(companyId, cust.id, {
        name: "Cantiere Principale",
        address: "Via Alessandro Volta 42",
        city: "Bologna",
      });

      // Create a standalone report (no intervention_id) supplying location_id and customer_id but omitting client_address/client_city
      const report = await reportsService.createReport(companyId, "Tecnico Mario", {
        customer_id: cust.id,
        location_id: loc.id,
        date: "2026-10-27",
        time: "10:30",
        work_hours: 2,
        status: "submitted",
      });

      expect(report.client.name).toBe("Acme Standalone Client");
      expect(report.client.address).toBe("Via Alessandro Volta 42");
      expect(report.client.city).toBe("Bologna");
    });
  });
});
