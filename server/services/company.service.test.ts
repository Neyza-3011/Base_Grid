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
        if (id === sampleCompany.id) return { ...sampleCompany, logoDataUrl: null };
        return null;
      }),
      findCompanyWithLogoById: vi.fn().mockImplementation(async (id: string) => {
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

  it("uses the lightweight lookup when logo data is not requested", async () => {
    const result = await companyService.getCompanySettings("comp-001", false);
    expect(result.logoDataUrl).toBeNull();
    expect(mockDb.findCompanyById).toHaveBeenCalledWith("comp-001");
    expect(mockDb.findCompanyWithLogoById).not.toHaveBeenCalled();
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

  it.each([1.5, 0.5, 2_147_483_648])(
    "rejects non-integer or unsafe maxUsers value %s for superadmin",
    async (maxUsers) => {
      await expect(
        companyService.updateCompanySettings("comp-001", { maxUsers }, "superadmin")
      ).rejects.toThrow(ValidationError);
    },
  );

  it("persists a valid PNG company logo for PDF branding", async () => {
    const logoDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC";
    const updated = await companyService.updateCompanySettings(
      "comp-001",
      { logoDataUrl },
      "admin",
    );
    expect(updated.logoDataUrl).toBe(logoDataUrl);
  });

  it("rejects SVG or malformed company logo uploads", async () => {
    await expect(
      companyService.updateCompanySettings(
        "comp-001",
        { logoDataUrl: "data:image/svg+xml;base64,PHN2Zy8+" },
        "admin",
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects oversized JPEG logo dimensions before image decoding", async () => {
    const jpegHeader = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08,
      0x03, 0xe8, // height: 1000
      0x0b, 0xb8, // width: 3000
      0x01, 0x01, 0x11, 0x00,
    ]);
    const logoDataUrl = `data:image/jpeg;base64,${jpegHeader.toString("base64")}`;
    await expect(
      companyService.updateCompanySettings("comp-001", { logoDataUrl }, "admin"),
    ).rejects.toThrow("2048");
  });

  it("rejects oversized logo dimensions before image decoding", async () => {
    const pngHeader = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pngHeader, 0);
    pngHeader.writeUInt32BE(13, 8);
    pngHeader.write("IHDR", 12, "ascii");
    pngHeader.writeUInt32BE(4096, 16);
    pngHeader.writeUInt32BE(4096, 20);
    const logoDataUrl = `data:image/png;base64,${pngHeader.toString("base64")}`;
    await expect(
      companyService.updateCompanySettings("comp-001", { logoDataUrl }, "admin"),
    ).rejects.toThrow("2048");
  });
});
