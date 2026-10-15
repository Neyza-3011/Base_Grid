import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReportsService } from "./reports.service";
import { IDatabaseAdapter } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import { ReportRecord, CreateReportRequest } from "../types";

describe("ReportsService Domain Logic & Tenant Boundaries", () => {
  let mockDb: IDatabaseAdapter;
  let reportsService: ReportsService;
  let mockReports: Map<string, ReportRecord>;
  let mockCustomers: Map<string, any>;
  let mockLocations: Map<string, any>;
  let mockInterventions: Map<string, any>;

  beforeEach(() => {
    mockReports = new Map();
    mockCustomers = new Map();
    mockLocations = new Map();
    mockInterventions = new Map();

    mockCustomers.set("cust-tenant-a", {
      id: "cust-tenant-a",
      companyId: "comp-tenant-a",
      displayName: "Cliente A Tenant A",
      isActive: true,
    });

    mockCustomers.set("cust-tenant-b", {
      id: "cust-tenant-b",
      companyId: "comp-tenant-b",
      displayName: "Cliente B Tenant B",
      isActive: true,
    });

    mockCustomers.set("cust-2-tenant-a", {
      id: "cust-2-tenant-a",
      companyId: "comp-tenant-a",
      displayName: "Cliente 2 Tenant A",
      isActive: true,
    });

    mockLocations.set("loc-1-cust-a", {
      id: "loc-1-cust-a",
      companyId: "comp-tenant-a",
      customerId: "cust-tenant-a",
      name: "Sede Principale",
      address: "Via Roma 1",
      city: "Milano",
      isActive: true,
    });

    mockLocations.set("loc-2-cust-2", {
      id: "loc-2-cust-2",
      companyId: "comp-tenant-a",
      customerId: "cust-2-tenant-a",
      name: "Cantiere 2",
      address: "Via Verdi 2",
      city: "Torino",
      isActive: true,
    });

    mockLocations.set("loc-tenant-b", {
      id: "loc-tenant-b",
      companyId: "comp-tenant-b",
      customerId: "cust-tenant-b",
      name: "Sede Tenant B",
      address: "Corso Italia 10",
      city: "Roma",
      isActive: true,
    });

    mockInterventions.set("int-1-tenant-a", {
      id: "int-1-tenant-a",
      companyId: "comp-tenant-a",
      customerId: "cust-tenant-a",
      locationId: "loc-1-cust-a",
      description: "Riparazione quadro elettrico",
      status: "in_lavorazione",
      priority: "alta",
      createdBy: "usr-admin-1",
      updatedBy: "usr-admin-1",
      createdAt: "2026-09-26T08:00:00.000Z",
      updatedAt: "2026-09-26T08:00:00.000Z",
    });

    mockInterventions.set("int-tenant-b", {
      id: "int-tenant-b",
      companyId: "comp-tenant-b",
      customerId: "cust-tenant-b",
      locationId: "loc-tenant-b",
      description: "Intervento Tenant B",
      status: "in_lavorazione",
      priority: "media",
      createdBy: "usr-admin-b",
      updatedBy: "usr-admin-b",
      createdAt: "2026-09-26T08:00:00.000Z",
      updatedAt: "2026-09-26T08:00:00.000Z",
    });

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
      getCustomerByIdAndCompany: vi.fn().mockImplementation(async (customerId: string, companyId: string) => {
        const cust = mockCustomers.get(customerId);
        if (!cust || cust.companyId !== companyId) return null;
        return cust;
      }),
      getLocationByIdAndCompany: vi.fn().mockImplementation(async (locationId: string, companyId: string) => {
        const loc = mockLocations.get(locationId);
        if (!loc || loc.companyId !== companyId) return null;
        return loc;
      }),
      getInterventionByIdAndCompany: vi.fn().mockImplementation(async (interventionId: string, companyId: string) => {
        const item = mockInterventions.get(interventionId);
        if (!item || item.companyId !== companyId) return null;
        return item;
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

    it("creates a draft report from typed CreateReportRequest DTO", async () => {
      const draftPayload: CreateReportRequest = {
        client_name: "Officine Meccaniche SpA",
        client_address: "Corso Francia 100",
        client_city: "Torino",
        work_hours: 2,
        travel_hours: 1,
        date: "2026-09-26",
        time: "08:30",
        status: "draft",
        notes: "Bozza preliminare",
        materials_used: [{ name: "Guarnizioni", quantity: 4 }],
      };

      const result = await reportsService.createReport(
        "comp-tenant-a",
        "Marco Rossi",
        draftPayload
      );

      expect(result.id).toBe("rep-new-001");
      expect(result.status).toBe("draft");
      expect(result.client.name).toBe("Officine Meccaniche SpA");
      expect(result.work_hours).toBe(2);
      expect(result.travel_hours).toBe(1);
      expect(result.materials_used).toEqual([{ name: "Guarnizioni", quantity: 4 }]);
      expect(result.notes).toBe("Bozza preliminare");
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

    describe("customer and location tenant isolation & consistency", () => {
      it("Caso A: accepts report with valid customer_id belonging to the tenant", async () => {
        const payload: CreateReportRequest = {
          client_name: "Cliente A Tenant A",
          work_hours: 2,
          date: "2026-09-26",
          time: "10:00",
          customer_id: "cust-tenant-a",
        };

        const result = await reportsService.createReport("comp-tenant-a", "Luigi", payload);
        expect(result.customer_id).toBe("cust-tenant-a");
        expect(result.location_id).toBeUndefined();
      });

      it("Caso A: rejects report with NotFoundError when customer_id belongs to another tenant", async () => {
        const payload: CreateReportRequest = {
          client_name: "Cliente Altro Tenant",
          work_hours: 2,
          date: "2026-09-26",
          time: "10:00",
          customer_id: "cust-tenant-b", // belongs to comp-tenant-b
        };

        await expect(
          reportsService.createReport("comp-tenant-a", "Luigi", payload)
        ).rejects.toThrow(NotFoundError);
      });

      it("Caso A: rejects report with NotFoundError when customer_id does not exist", async () => {
        const payload: CreateReportRequest = {
          client_name: "Inesistente",
          work_hours: 2,
          date: "2026-09-26",
          time: "10:00",
          customer_id: "cust-nonexistent",
        };

        await expect(
          reportsService.createReport("comp-tenant-a", "Luigi", payload)
        ).rejects.toThrow(NotFoundError);
      });

      it("Caso B: accepts report with valid location_id belonging to the tenant", async () => {
        const payload: CreateReportRequest = {
          client_name: "Cliente",
          work_hours: 2,
          date: "2026-09-26",
          time: "10:00",
          location_id: "loc-1-cust-a",
        };

        const result = await reportsService.createReport("comp-tenant-a", "Luigi", payload);
        expect(result.location_id).toBe("loc-1-cust-a");
        expect(result.customer_id).toBeUndefined();
      });

      it("Caso B: rejects report with NotFoundError when location_id belongs to another tenant", async () => {
        const payload: CreateReportRequest = {
          client_name: "Cliente",
          work_hours: 2,
          date: "2026-09-26",
          time: "10:00",
          location_id: "loc-tenant-b", // belongs to comp-tenant-b
        };

        await expect(
          reportsService.createReport("comp-tenant-a", "Luigi", payload)
        ).rejects.toThrow(NotFoundError);
      });

      it("Caso B: rejects report with NotFoundError when location_id does not exist", async () => {
        const payload: CreateReportRequest = {
          client_name: "Cliente",
          work_hours: 2,
          date: "2026-09-26",
          time: "10:00",
          location_id: "loc-nonexistent",
        };

        await expect(
          reportsService.createReport("comp-tenant-a", "Luigi", payload)
        ).rejects.toThrow(NotFoundError);
      });

      it("Caso C: accepts report when both customer_id and location_id belong to same tenant and match", async () => {
        const payload: CreateReportRequest = {
          client_name: "Cliente A Tenant A",
          work_hours: 2,
          date: "2026-09-26",
          time: "10:00",
          customer_id: "cust-tenant-a",
          location_id: "loc-1-cust-a",
        };

        const result = await reportsService.createReport("comp-tenant-a", "Luigi", payload);
        expect(result.customer_id).toBe("cust-tenant-a");
        expect(result.location_id).toBe("loc-1-cust-a");
      });

      it("Caso C: rejects with ValidationError when location does not belong to the selected customer (even within same tenant)", async () => {
        const payload: CreateReportRequest = {
          client_name: "Cliente A Tenant A",
          work_hours: 2,
          date: "2026-09-26",
          time: "10:00",
          customer_id: "cust-tenant-a",
          location_id: "loc-2-cust-2", // belongs to cust-2-tenant-a, NOT cust-tenant-a
        };

        await expect(
          reportsService.createReport("comp-tenant-a", "Luigi", payload)
        ).rejects.toThrow(ValidationError);
      });

      it("Caso D: legacy mode accepts reports without customer_id and location_id", async () => {
        const payload: CreateReportRequest = {
          client_name: "Cliente Libero Legacy",
          work_hours: 3,
          date: "2026-09-26",
          time: "11:00",
        };

        const result = await reportsService.createReport("comp-tenant-a", "Luigi", payload);
        expect(result.customer_id).toBeUndefined();
        expect(result.location_id).toBeUndefined();
        expect(result.client.name).toBe("Cliente Libero Legacy");
      });

      it("Caso D: legacy mode accepts reports with empty string customer_id and location_id without DB lookup", async () => {
        const payload: any = {
          client_name: "Cliente Libero Stringa Vuota",
          work_hours: 1,
          date: "2026-09-26",
          time: "09:00",
          customer_id: "",
          location_id: "",
        };

        const result = await reportsService.createReport("comp-tenant-a", "Luigi", payload);
        expect(result.customer_id).toBeUndefined();
        expect(result.location_id).toBeUndefined();
      });

      it("enforces session companyId and ignores any companyId passed in body", async () => {
        const payload: any = {
          client_name: "Cliente Sicuro",
          work_hours: 2,
          date: "2026-09-26",
          time: "10:00",
          companyId: "malicious-tenant-attempt",
          company_id: "malicious-tenant-attempt-2",
        };

        await reportsService.createReport("comp-tenant-a", "Luigi", payload);
        expect(mockDb.createReport).toHaveBeenCalledWith(
          "comp-tenant-a",
          expect.not.objectContaining({ companyId: "malicious-tenant-attempt" })
        );
      });

      describe("Intervention Association (P1.6)", () => {
        it("creates a report successfully linked to a valid intervention and returns intervention_id", async () => {
          const payload: CreateReportRequest = {
            client_name: "Cliente A Tenant A",
            work_hours: 3.5,
            travel_hours: 0.5,
            date: "2026-09-26",
            time: "14:30",
            intervention_id: "int-1-tenant-a",
            customer_id: "cust-tenant-a",
            location_id: "loc-1-cust-a",
          };

          const result = await reportsService.createReport("comp-tenant-a", "Luigi", payload);
          expect(result.intervention_id).toBe("int-1-tenant-a");
          expect(result.customer_id).toBe("cust-tenant-a");
          expect(result.location_id).toBe("loc-1-cust-a");
          expect(mockDb.createReport).toHaveBeenCalledWith(
            "comp-tenant-a",
            expect.objectContaining({
              interventionId: "int-1-tenant-a",
              customerId: "cust-tenant-a",
              locationId: "loc-1-cust-a",
            })
          );
        });

        it("automatically derives customer, location, and client name from intervention when omitted", async () => {
          const payload: CreateReportRequest = {
            work_hours: 2,
            date: "2026-09-26",
            time: "10:00",
            intervention_id: "int-1-tenant-a",
          };

          const result = await reportsService.createReport("comp-tenant-a", "Luigi", payload);
          expect(result.intervention_id).toBe("int-1-tenant-a");
          expect(result.customer_id).toBe("cust-tenant-a");
          expect(result.location_id).toBe("loc-1-cust-a");
          expect(result.client.name).toBe("Cliente A Tenant A");
          expect(result.client.address).toBe("Via Roma 1");
          expect(result.client.city).toBe("Milano");
        });

        it("rejects when intervention does not exist with NotFoundError", async () => {
          const payload: CreateReportRequest = {
            client_name: "Cliente A Tenant A",
            work_hours: 2,
            date: "2026-09-26",
            time: "10:00",
            intervention_id: "int-nonexistent-999",
          };

          await expect(
            reportsService.createReport("comp-tenant-a", "Luigi", payload)
          ).rejects.toThrow(NotFoundError);
        });

        it("rejects when intervention belongs to another tenant with NotFoundError", async () => {
          const payload: CreateReportRequest = {
            client_name: "Cliente B Tenant B",
            work_hours: 2,
            date: "2026-09-26",
            time: "10:00",
            intervention_id: "int-tenant-b", // belongs to comp-tenant-b
          };

          await expect(
            reportsService.createReport("comp-tenant-a", "Luigi", payload)
          ).rejects.toThrow(NotFoundError);
        });

        it("rejects when customer_id does not match the intervention's customer with ValidationError", async () => {
          const payload: CreateReportRequest = {
            client_name: "Cliente Incoerente",
            work_hours: 2,
            date: "2026-09-26",
            time: "10:00",
            intervention_id: "int-1-tenant-a",
            customer_id: "cust-2-tenant-a",
          };

          await expect(
            reportsService.createReport("comp-tenant-a", "Luigi", payload)
          ).rejects.toThrow(ValidationError);
        });

        it("rejects when location_id does not match the intervention's location with ValidationError", async () => {
          const payload: CreateReportRequest = {
            client_name: "Cliente A Tenant A",
            work_hours: 2,
            date: "2026-09-26",
            time: "10:00",
            intervention_id: "int-1-tenant-a",
            customer_id: "cust-tenant-a",
            location_id: "loc-2-cust-2",
          };

          await expect(
            reportsService.createReport("comp-tenant-a", "Luigi", payload)
          ).rejects.toThrow(ValidationError);
        });

        it("maintains full backward compatibility for standalone reports without intervention_id", async () => {
          const payload: CreateReportRequest = {
            client_name: "Cliente Autonomo",
            work_hours: 4,
            travel_hours: 1,
            date: "2026-09-26",
            time: "09:00",
          };

          const result = await reportsService.createReport("comp-tenant-a", "Luigi", payload);
          expect(result.intervention_id).toBeUndefined();
          expect(result.client.name).toBe("Cliente Autonomo");
          expect(mockDb.createReport).toHaveBeenCalledWith(
            "comp-tenant-a",
            expect.objectContaining({
              interventionId: undefined,
            })
          );
        });

        it("returns intervention_id in listReports when report is linked", async () => {
          mockReports.set("rep-linked-01", {
            id: "rep-linked-01",
            companyId: "comp-tenant-a",
            customerId: "cust-tenant-a",
            locationId: "loc-1-cust-a",
            interventionId: "int-1-tenant-a",
            date: "2026-09-26",
            time: "16:00",
            workHours: 5,
            travelHours: 0,
            status: "submitted",
            client: { name: "ACME Corp" },
            technician: { fullName: "Mario Rossi" },
            materialsUsed: [],
            createdAt: "2026-09-26T16:00:00.000Z",
          });

          const list = await reportsService.listReports("comp-tenant-a");
          const found = list.find((r) => r.id === "rep-linked-01");
          expect(found).toBeDefined();
          expect(found?.intervention_id).toBe("int-1-tenant-a");
        });
      });
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
