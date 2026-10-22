import { describe, it, expect, vi, beforeEach } from "vitest";
import { CompanyService } from "./company.service";
import { IDatabaseAdapter } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import { CompanyRecord } from "../types";

describe("CompanyService Domain Logic & Role Enforcement", () => {
  let mockDb: IDatabaseAdapter;
  let companyService: CompanyService;
  let sampleCompany: CompanyRecord;

  beforeEach(() => {
    sampleCompany = {
      id: "comp-001",
      name: "Impianti Alpha Srl",
      vatNumber: "12345678901",
      address: "Via Roma 10, Milano",
      defaultHourlyRate: 50,
      reportFooterNotes: "Note test",
      stripeSubscriptionStatus: "active",
      maxUsers: 5,
      featurePdfExport: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    mockDb = {
      findCompanyById: vi.fn().mockImplementation(async (id: string) => {
        if (id === sampleCompany.id) return { ...sampleCompany };
        return null;
      }),
      updateCompany: vi.fn().mockImplementation(async (id: string, updates: any) => {
        if (id === sampleCompany.id) {
          sampleCompany = { ...sampleCompany, ...updates };
          return { ...sampleCompany };
        }
        return null;
      }),
    } as unknown as IDatabaseAdapter;

    companyService = new CompanyService(mockDb);
  });

  it("retrieves company settings by ID", async () => {
    const res = await companyService.getCompanySettings("comp-001");
    expect(res.id).toBe("comp-001");
    expect(res.name).toBe("Impianti Alpha Srl");
  });

  it("throws NotFoundError if company does not exist", async () => {
    await expect(companyService.getCompanySettings("comp-999")).rejects.toThrow(NotFoundError);
  });

  it("updates standard settings for admin role", async () => {
    const updated = await companyService.updateCompanySettings(
      "comp-001",
      { name: "Alpha Renovated Srl", defaultHourlyRate: 60 },
      "admin"
    );
    expect(updated.name).toBe("Alpha Renovated Srl");
    expect(updated.defaultHourlyRate).toBe(60);
  });

  it("rejects invalid hourly rate", async () => {
    await expect(
      companyService.updateCompanySettings("comp-001", { defaultHourlyRate: -10 }, "admin")
    ).rejects.toThrow(ValidationError);
  });

  it("ignores maxUsers update if user is not superadmin", async () => {
    const updated = await companyService.updateCompanySettings(
      "comp-001",
      { maxUsers: 100 },
      "admin"
    );
    expect(updated.maxUsers).toBe(5); // unchanged
  });

  it("allows maxUsers update if user is superadmin", async () => {
    const updated = await companyService.updateCompanySettings(
      "comp-001",
      { maxUsers: 100 },
      "superadmin"
    );
    expect(updated.maxUsers).toBe(100);
  });
});
