import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReportsService } from "./reports.service";
import { IDatabaseAdapter } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import { ReportRecord } from "../types";

describe("ReportsService Domain Logic & Tenant Boundaries", () => {
  let mockDb: IDatabaseAdapter;
  let reportsService: ReportsService;
  let mockReports: Map<string, ReportRecord>;

  beforeEach(() => {
    mockReports = new Map();

    const sampleReport: ReportRecord = {
      id: "rep-001",
      companyId: "comp-tenant-a",
      date: "2026-09-26",
      time: "10:00",
      workHours: 4,
      travelHours: 1,
      status: "submitted",
      client: { name: "ACME Corp", address: "Via Roma 1", city: "Milano" },
      technician: { fullName: "Mario Rossi" },
      materialsUsed: [{ name: "Cavi", quantity: 10 }],
      notes: "Lavoro completato",
      createdAt: "2026-09-26T10:00:00.000Z",
    };
    mockReports.set(sampleReport.id, sampleReport);

    mockDb = {
      getReportsByCompany: vi.fn().mockImplementation(async (companyId: string, limit: number) => {
        return Array.from(mockReports.values()).filter((r) => r.companyId === companyId).slice(0, limit);
      }),
      getReportById: vi.fn().mockImplementation(async (companyId: string, reportId: string) => {
        const report = mockReports.get(reportId);
        if (!report || report.companyId !== companyId) return null;
        return report;
      }),
      createReport: vi.fn().mockImplementation(async (companyId: string, data: any) => {
        const record: ReportRecord = {
          id: "rep-new-001",
          companyId,
          ...data,
          createdAt: new Date().toISOString(),
        };
        mockReports.set(record.id, record);
        return record;
      }),
      deleteReport: vi.fn().mockImplementation(async (companyId: string, reportId: string) => {
        const report = mockReports.get(reportId);
        if (!report || report.companyId !== companyId) return false;
        return mockReports.delete(reportId);
      }),
    } as unknown as IDatabaseAdapter;

    reportsService = new ReportsService(mockDb);
  });

  describe("listReports", () => {
    it("returns reports strictly belonging to the companyId in safe DTO format", async () => {
      const reports = await reportsService.listReports("comp-tenant-a");
      expect(reports.length).toBe(1);
      expect(reports[0].id).toBe("rep-001");
      expect(reports[0].work_hours).toBe(4);
      expect(reports[0].travel_hours).toBe(1);
      expect(reports[0].technician.full_name).toBe("Mario Rossi");
      expect(reports[0].client.name).toBe("ACME Corp");
    });

    it("returns empty array for a different tenant", async () => {
      const reports = await reportsService.listReports("comp-tenant-b");
      expect(reports.length).toBe(0);
    });

    it("throws ValidationError if companyId is missing", async () => {
      await expect(reportsService.listReports("")).rejects.toThrow(ValidationError);
    });
  });

  describe("getReportById", () => {
    it("returns report when companyId matches", async () => {
      const report = await reportsService.getReportById("comp-tenant-a", "rep-001");
      expect(report.id).toBe("rep-001");
      expect(report.companyId).toBe("comp-tenant-a");
    });

    it("throws NotFoundError when trying to access another tenant's report", async () => {
      await expect(
        reportsService.getReportById("comp-tenant-b", "rep-001")
      ).rejects.toThrow(NotFoundError);
    });

    it("throws NotFoundError for nonexistent report ID", async () => {
      await expect(
        reportsService.getReportById("comp-tenant-a", "rep-nonexistent")
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createReport", () => {
    it("creates a report and enforces server-owned companyId and technician name", async () => {
      const validPayload = {
        client_name: "Nuovo Cliente Srl",
        client_address: "Via Torino 5",
        client_city: "Torino",
        work_hours: 3.5,
        travel_hours: 0.5,
        date: "2026-09-26",
        time: "14:30",
        notes: "Installazione completata",
        materials_used: [{ name: "Tubi", quantity: 5 }],
      };

      const result = await reportsService.createReport(
        "comp-tenant-a",
        "Luigi Bianchi",
        validPayload
      );

      expect(result.id).toBe("rep-new-001");
      expect(result.client.name).toBe("Nuovo Cliente Srl");
      expect(result.technician.full_name).toBe("Luigi Bianchi");
      expect(result.work_hours).toBe(3.5);
      expect(result.travel_hours).toBe(0.5);
      expect(result.status).toBe("submitted");
    });

    it("rejects invalid date format", async () => {
      const invalidPayload = {
        client_name: "Cliente",
        work_hours: 2,
        date: "invalid-date",
        time: "10:00",
      };

      await expect(
        reportsService.createReport("comp-tenant-a", "Luigi", invalidPayload)
      ).rejects.toThrow(/Data non valida/);
    });

    it("rejects invalid time format", async () => {
      const invalidPayload = {
        client_name: "Cliente",
        work_hours: 2,
        date: "2026-09-26",
        time: "25:99",
      };

      await expect(
        reportsService.createReport("comp-tenant-a", "Luigi", invalidPayload)
      ).rejects.toThrow(/Ora non valida/);
    });

    it("rejects 'approved' status at report creation", async () => {
      const invalidPayload = {
        client_name: "Cliente",
        work_hours: 2,
        date: "2026-09-26",
        time: "10:00",
        status: "approved",
      };

      await expect(
        reportsService.createReport("comp-tenant-a", "Luigi", invalidPayload)
      ).rejects.toThrow(/Lo stato 'approved' non è consentito/);
    });

    it("rejects materials_used with extra disallowed fields", async () => {
      const invalidPayload = {
        client_name: "Cliente",
        work_hours: 2,
        date: "2026-09-26",
        time: "10:00",
        materials_used: [{ name: "Tubi", quantity: 5, maliciousKey: "bad" }],
      };

      await expect(
        reportsService.createReport("comp-tenant-a", "Luigi", invalidPayload)
      ).rejects.toThrow(/Campi non supportati nell'oggetto materiale/);
    });

    it("rejects invalid signature format with 400 status code", async () => {
      const invalidPayload = {
        client_name: "Cliente",
        work_hours: 2,
        date: "2026-09-26",
        time: "10:00",
        signature_base64: "not-a-data-url",
      };

      try {
        await reportsService.createReport("comp-tenant-a", "Luigi", invalidPayload);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.status).toBe(400);
      }
    });

    it("rejects oversized signature with 413 status code", async () => {
      const invalidPayload = {
        client_name: "Cliente",
        work_hours: 2,
        date: "2026-09-26",
        time: "10:00",
        signature_base64: "data:image/png;base64," + "A".repeat(500001),
      };

      try {
        await reportsService.createReport("comp-tenant-a", "Luigi", invalidPayload);
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.statusCode).toBe(413);
        expect(err.status).toBe(413);
      }
    });
  });

  describe("deleteReport", () => {
    it("deletes report successfully when companyId matches", async () => {
      await reportsService.deleteReport("comp-tenant-a", "rep-001");
      expect(mockReports.has("rep-001")).toBe(false);
    });

    it("throws NotFoundError when trying to delete another tenant's report", async () => {
      await expect(
        reportsService.deleteReport("comp-tenant-b", "rep-001")
      ).rejects.toThrow(NotFoundError);
      expect(mockReports.has("rep-001")).toBe(true);
    });
  });
});
