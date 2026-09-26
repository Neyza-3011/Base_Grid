import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchReports,
  createReport,
  deleteReport,
  fetchReportPdfBlob,
  ReportsApiError,
  mapDtoToReport,
  formatReportDateTime,
} from "./reports";
import { getReports, addReport, removeReport } from "../reportsStorage";

describe("Frontend Reports API Client (frontend/src/lib/api/reports.ts & reportsStorage.ts)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("formatReportDateTime & mapDtoToReport", () => {
    it("formats ISO date string into DD/MM/YYYY and HH:mm", () => {
      const res = formatReportDateTime("2026-09-26", "14:30");
      expect(res.date).toBe("26/09/2026");
      expect(res.time).toBe("14:30");
      expect(res.dateTimeFormatted).toBe("26/09/2026 14:30");
    });

    it("correctly maps server DTO to frontend view model", () => {
      const serverDto = {
        id: "rep-100",
        date: "2026-09-26",
        time: "15:00",
        work_hours: 4.5,
        travel_hours: 1.0,
        status: "submitted" as const,
        client: {
          name: "Acme SpA",
          address: "Via Roma 1",
          city: "Milano",
        },
        technician: {
          full_name: "Mario Rossi",
        },
        materials_used: [{ name: "Cavo", quantity: 5 }],
        notes: "Installazione completata",
        created_at: "2026-09-26T15:00:00.000Z",
      };

      const mapped = mapDtoToReport(serverDto);
      expect(mapped.id).toBe("rep-100");
      expect(mapped.date).toBe("26/09/2026");
      expect(mapped.time).toBe("15:00");
      expect(mapped.work_hours).toBe(4.5);
      expect(mapped.travel_hours).toBe(1.0);
      expect(mapped.client.name).toBe("Acme SpA");
      expect(mapped.technician.full_name).toBe("Mario Rossi");
      expect(mapped.materials_used).toEqual([{ name: "Cavo", quantity: 5 }]);
    });
  });

  describe("fetchReports & getReports (Server-Authoritative)", () => {
    it("fetches reports from /api/v1/reports and returns mapped array", async () => {
      const mockReportsDto = [
        {
          id: "rep-001",
          date: "2026-09-26",
          time: "10:00",
          work_hours: 3,
          travel_hours: 0.5,
          status: "approved",
          client: { name: "Cliente Alpha", address: "Via 1" },
          technician: { full_name: "Tecnico 1" },
          materials_used: [],
          created_at: "2026-09-26T10:00:00.000Z",
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockReportsDto,
      });

      const result = await fetchReports();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/reports?limit=1000"),
        expect.objectContaining({
          method: "GET",
          credentials: "include",
        }),
      );
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("rep-001");
      expect(result[0].client.name).toBe("Cliente Alpha");
    });

    it("returns empty array when server returns empty array (no mock seeds fallback)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      });

      const result = await getReports();
      expect(result).toEqual([]);
    });

    it("throws ReportsApiError on 500 server error without returning mock data", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ detail: "Database connection failed" }),
      });

      await expect(getReports()).rejects.toThrow("Errore interno del server.");
    });

    it("throws ReportsApiError on network failure", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

      await expect(getReports()).rejects.toThrow(/Failed to fetch|Impossibile connettersi/);
    });
  });

  describe("createReport & addReport", () => {
    it("sends POST with snake_case payload and returns server-created report", async () => {
      const createdServerDto = {
        id: "rep-created-999",
        date: "2026-09-26",
        time: "14:00",
        work_hours: 5,
        travel_hours: 1,
        status: "submitted",
        client: { name: "Nuova Impresa Srl", address: "Corso Francia 10" },
        technician: { full_name: "Tecnico Server" },
        materials_used: [{ name: "Tubi", quantity: 3 }],
        notes: "Lavori eseguiti",
        created_at: "2026-09-26T14:00:00.000Z",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => createdServerDto,
      });

      const result = await addReport({
        clientName: "Nuova Impresa Srl",
        clientAddress: "Corso Francia 10",
        hours: 5,
        travelHours: 1,
        date: "2026-09-26",
        time: "14:00",
        notes: "Lavori eseguiti",
        materials: [{ name: "Tubi", quantity: 3 }],
        status: "submitted",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/reports",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: JSON.stringify({
            client_name: "Nuova Impresa Srl",
            client_address: "Corso Francia 10",
            work_hours: 5,
            travel_hours: 1,
            date: "2026-09-26",
            time: "14:00",
            status: "submitted",
            notes: "Lavori eseguiti",
            materials_used: [{ name: "Tubi", quantity: 3 }],
          }),
        }),
      );

      expect(result.id).toBe("rep-created-999");
      expect(result.client.name).toBe("Nuova Impresa Srl");
    });

    it("throws ReportsApiError on 400 validation failure and propagates server message", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ detail: "Nome cliente non valido o vuoto." }),
      });

      await expect(
        addReport({
          clientName: "",
          hours: 2,
        }),
      ).rejects.toThrow("Nome cliente non valido o vuoto.");
    });
  });

  describe("deleteReport & removeReport", () => {
    it("sends DELETE request to /api/v1/reports/:id and succeeds on 200", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: "Rapportino eliminato con successo" }),
      });

      const res = await removeReport("rep-delete-01");
      expect(res).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/reports/rep-delete-01",
        expect.objectContaining({
          method: "DELETE",
          credentials: "include",
        }),
      );
    });

    it("throws ReportsApiError when DELETE fails with 404", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: "Rapportino non trovato" }),
      });

      await expect(removeReport("rep-nonexistent")).rejects.toThrow("Rapportino non trovato.");
    });
  });

  describe("fetchReportPdfBlob", () => {
    it("fetches PDF blob successfully", async () => {
      const mockBlob = new Blob(["%PDF-1.4 mock content"], { type: "application/pdf" });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => mockBlob,
      });

      const blob = await fetchReportPdfBlob("rep-001");
      expect(blob).toBe(mockBlob);
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/reports/rep-001/pdf",
        expect.objectContaining({
          method: "GET",
          credentials: "include",
        }),
      );
    });
  });
});
