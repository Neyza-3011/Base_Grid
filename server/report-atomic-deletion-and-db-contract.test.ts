import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseStore, PostgresAdapter, IDatabaseAdapter, DeleteReportWithRegressionResult } from "./db";
import { ReportRecord, InterventionRecord } from "./types";

describe("P1.7 Database Contract & Atomic Report Deletion with Intervention Regression", () => {
  describe("A. In-Memory DatabaseStore Adapter Implementation", () => {
    let store: DatabaseStore;
    const companyA = "comp-alpha-123";
    const companyB = "comp-beta-456";

    beforeEach(() => {
      store = new DatabaseStore();
    });

    // 1. Normal method signatures
    it("1. supports ordinary calls to getReportById, deleteReport, getInterventionByIdAndCompany, updateIntervention", async () => {
      const rep = await store.createReport(companyA, {
        date: "2026-10-19",
        time: "10:00",
        workHours: 3,
        travelHours: 1,
        status: "submitted",
        materialsStatus: "used",
        materialsUsed: [{ name: "Filtro", quantity: 2 }],
      });
      expect(rep.id).toBeDefined();

      // getReportById(companyId, reportId)
      const fetchedRep = await store.getReportById(companyA, rep.id);
      expect(fetchedRep).not.toBeNull();
      expect(fetchedRep?.id).toBe(rep.id);

      // getInterventionByIdAndCompany(interventionId, companyId)
      const int = await store.createIntervention(companyA, {
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Manutenzione ordinaria",
        createdBy: "usr-admin-1",
        updatedBy: "usr-admin-1",
      });
      const fetchedInt = await store.getInterventionByIdAndCompany(int.id, companyA);
      expect(fetchedInt).not.toBeNull();
      expect(fetchedInt?.id).toBe(int.id);

      // updateIntervention(companyId, interventionId, data)
      const updatedInt = await store.updateIntervention(companyA, int.id, {
        description: "Descrizione aggiornata",
        notes: "Note aggiuntive",
        updatedBy: "usr-admin-2",
      });
      expect(updatedInt).not.toBeNull();
      expect(updatedInt?.description).toBe("Descrizione aggiornata");
      expect(updatedInt?.notes).toBe("Note aggiuntive");
      expect(updatedInt?.updatedBy).toBe("usr-admin-2");

      // deleteReport(companyId, reportId)
      const deleted = await store.deleteReport(companyA, rep.id);
      expect(deleted).toBe(true);
      const afterDelete = await store.getReportById(companyA, rep.id);
      expect(afterDelete).toBeNull();
    });

    // 2. Successful deletion of a standalone rapportino
    it("2. deletes a standalone report successfully without intervention link", async () => {
      const rep = await store.createReport(companyA, {
        date: "2026-10-19",
        time: "11:00",
        workHours: 2,
        travelHours: 0,
        status: "submitted",
      });

      const res = await store.deleteReportWithInterventionRegression(
        companyA,
        rep.id,
        "Note regressione",
        "usr-admin-1"
      );
      expect(res.status).toBe("deleted");
      expect(res.regressedToInterventionId).toBeUndefined();

      const afterDelete = await store.getReportById(companyA, rep.id);
      expect(afterDelete).toBeNull();
    });

    // 3. Blocking when linked intervention is 'fatturato'
    it("3. blocks deletion when linked intervention status is 'fatturato' and preserves report and intervention", async () => {
      const int = await store.createIntervention(companyA, {
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Intervento già fatturato",
        createdBy: "usr-1",
        updatedBy: "usr-1",
      });
      await store.updateIntervention(companyA, int.id, {
        status: "fatturato",
        updatedBy: "usr-admin-1",
      });

      const rep = await store.createReport(companyA, {
        interventionId: int.id,
        date: "2026-10-19",
        time: "10:00",
        workHours: 4,
        travelHours: 0,
        status: "submitted",
      });

      const res = await store.deleteReportWithInterventionRegression(
        companyA,
        rep.id,
        "Note regressione",
        "usr-admin-1"
      );
      expect(res.status).toBe("blocked_fatturato");

      // Verify final data state: neither report nor intervention was modified/deleted
      const repStillExists = await store.getReportById(companyA, rep.id);
      expect(repStillExists).not.toBeNull();

      const intStillFatturato = await store.getInterventionByIdAndCompany(int.id, companyA);
      expect(intStillFatturato?.status).toBe("fatturato");
    });

    // 4. Regression to 'verificato' when linked intervention is 'pronto_per_fatturazione'
    it("4. regresses linked intervention from 'pronto_per_fatturazione' to 'verificato' when report is deleted", async () => {
      const int = await store.createIntervention(companyA, {
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Intervento pronto",
        createdBy: "usr-1",
        updatedBy: "usr-1",
      });
      await store.updateIntervention(companyA, int.id, {
        status: "pronto_per_fatturazione",
        notes: "Note preesistenti",
        updatedBy: "usr-admin-1",
      });

      const rep = await store.createReport(companyA, {
        interventionId: int.id,
        date: "2026-10-19",
        time: "10:00",
        workHours: 5,
        travelHours: 1,
        status: "submitted",
      });

      const res = await store.deleteReportWithInterventionRegression(
        companyA,
        rep.id,
        "[Sistema] Stato regredito a 'verificato' per cancellazione rapportino.",
        "usr-auditor-99"
      );
      expect(res.status).toBe("deleted");
      expect(res.regressedToInterventionId).toBe(int.id);

      // Verify final data state
      const repAfterDelete = await store.getReportById(companyA, rep.id);
      expect(repAfterDelete).toBeNull();

      const intAfterRegression = await store.getInterventionByIdAndCompany(int.id, companyA);
      expect(intAfterRegression).not.toBeNull();
      expect(intAfterRegression?.status).toBe("verificato");
      expect(intAfterRegression?.updatedBy).toBe("usr-auditor-99");
      expect(intAfterRegression?.notes).toContain("Note preesistenti");
      expect(intAfterRegression?.notes).toContain("[Sistema] Stato regredito a 'verificato'");
    });

    // 5. Rollback when deletion fails after regression in DatabaseStore
    it("5. rolls back intervention regression if report deletion fails", async () => {
      const int = await store.createIntervention(companyA, {
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Intervento pronto",
        createdBy: "usr-1",
        updatedBy: "usr-1",
      });
      await store.updateIntervention(companyA, int.id, {
        status: "pronto_per_fatturazione",
        notes: "Original notes",
        updatedBy: "usr-admin-1",
      });

      const rep = await store.createReport(companyA, {
        interventionId: int.id,
        date: "2026-10-19",
        time: "10:00",
        workHours: 2,
        travelHours: 0,
        status: "submitted",
      });

      // Simulate a deletion error in storage
      const originalDelete = (store as any).reports.delete.bind((store as any).reports);
      (store as any).reports.delete = vi.fn().mockImplementation(() => {
        throw new Error("Disk / Memory failure during delete");
      });

      await expect(
        store.deleteReportWithInterventionRegression(companyA, rep.id, "Regression note", "usr-auditor")
      ).rejects.toThrow("Disk / Memory failure during delete");

      // Restore delete
      (store as any).reports.delete = originalDelete;

      // Verify that intervention was restored and is NOT left in 'verificato'
      const intReverted = await store.getInterventionByIdAndCompany(int.id, companyA);
      expect(intReverted?.status).toBe("pronto_per_fatturazione");
      expect(intReverted?.notes).toBe("Original notes");
    });

    // 6. Multi-tenant strict isolation
    it("6. guarantees strict multi-tenant isolation (company A cannot delete or regress company B)", async () => {
      const intB = await store.createIntervention(companyB, {
        customerId: "cust-b",
        locationId: "loc-b",
        description: "Intervento Azienda B",
        createdBy: "usr-b",
        updatedBy: "usr-b",
      });
      await store.updateIntervention(companyB, intB.id, {
        status: "pronto_per_fatturazione",
        updatedBy: "usr-b",
      });

      const repB = await store.createReport(companyB, {
        interventionId: intB.id,
        date: "2026-10-19",
        time: "14:00",
        workHours: 3,
        travelHours: 0,
        status: "submitted",
      });

      // Company A attempts deletion of Company B report
      const res = await store.deleteReportWithInterventionRegression(
        companyA,
        repB.id,
        "Tentativo cross-tenant",
        "usr-a"
      );
      expect(res.status).toBe("not_found");

      // Verify Company B data is untouched
      const repBCheck = await store.getReportById(companyB, repB.id);
      expect(repBCheck).not.toBeNull();

      const intBCheck = await store.getInterventionByIdAndCompany(intB.id, companyB);
      expect(intBCheck?.status).toBe("pronto_per_fatturazione");
    });
  });

  describe("B. PostgreSQL PostgresAdapter Implementation (Transactional & Unit Verification)", () => {
    let mockPool: any;
    let mockClient: any;
    let adapter: PostgresAdapter;
    const companyId = "comp-pg-123";
    const reportId = "rep-pg-456";
    const interventionId = "int-pg-789";

    beforeEach(() => {
      mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };

      mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
        connect: vi.fn().mockResolvedValue(mockClient),
        end: vi.fn().mockResolvedValue(undefined),
      };

      adapter = new PostgresAdapter(mockPool);
    });

    it("1. supports ordinary calls to getReportById, deleteReport, getInterventionByIdAndCompany, updateIntervention", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: reportId,
          companyId,
          status: "submitted",
          workHours: 2,
          travelHours: 1,
          client: JSON.stringify({ name: "Cliente PG" }),
          technician: JSON.stringify({ fullName: "Tecnico PG" }),
          materialsStatus: "none",
          materialsUsed: "[]",
          notes: "Tutto ok",
          createdAt: new Date().toISOString(),
        }],
      });

      const rep = await adapter.getReportById(companyId, reportId);
      expect(rep).not.toBeNull();
      expect(rep?.id).toBe(reportId);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM reports WHERE id = $1 AND \"companyId\" = $2"),
        [reportId, companyId]
      );

      // deleteReport
      mockPool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: reportId }] });
      const deleted = await adapter.deleteReport(companyId, reportId);
      expect(deleted).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM reports WHERE id = $1 AND \"companyId\" = $2"),
        [reportId, companyId]
      );

      // getInterventionByIdAndCompany
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: interventionId,
          companyId,
          customerId: "cust-1",
          locationId: "loc-1",
          description: "Test PG",
          priority: "media",
          status: "nuovo",
          createdBy: "usr-1",
          updatedBy: "usr-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      });
      const int = await adapter.getInterventionByIdAndCompany(interventionId, companyId);
      expect(int).not.toBeNull();
      expect(int?.id).toBe(interventionId);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM interventions WHERE id = $1 AND \"companyId\" = $2"),
        [interventionId, companyId]
      );

      // updateIntervention
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: interventionId,
          companyId,
          customerId: "cust-1",
          locationId: "loc-1",
          description: "Updated PG",
          priority: "media",
          status: "assegnato",
          createdBy: "usr-1",
          updatedBy: "usr-2",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      });
      const updated = await adapter.updateIntervention(companyId, interventionId, {
        description: "Updated PG",
        status: "assegnato",
        updatedBy: "usr-2",
      });
      expect(updated).not.toBeNull();
      expect(updated?.description).toBe("Updated PG");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE interventions SET"),
        expect.arrayContaining([interventionId, companyId])
      );
    });

    it("2. executes locked read, regression and deletion inside a single PostgreSQL transaction on success", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      // 1. SELECT report FOR UPDATE
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: reportId,
          companyId,
          interventionId,
          status: "submitted",
          workHours: 3,
          travelHours: 0,
          client: JSON.stringify({ name: "Cliente" }),
          technician: JSON.stringify({ fullName: "Tecnico" }),
          materialsStatus: "none",
          materialsUsed: "[]",
          createdAt: new Date().toISOString(),
        }],
      });
      // 2. SELECT intervention FOR UPDATE
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: interventionId,
          companyId,
          customerId: "cust-1",
          locationId: "loc-1",
          description: "Pronto",
          priority: "alta",
          status: "pronto_per_fatturazione",
          notes: "Note",
          createdBy: "usr-1",
          updatedBy: "usr-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      });
      // 3. UPDATE interventions SET status = 'verificato'
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: interventionId }] });
      // 4. DELETE reports
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: reportId }] });
      // 5. COMMIT
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res = await adapter.deleteReportWithInterventionRegression(
        companyId,
        reportId,
        "Regressione per cancellazione",
        "usr-auditor-1"
      );

      expect(res.status).toBe("deleted");
      expect(res.regressedToInterventionId).toBe(interventionId);
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("3. aborts deletion and returns blocked_fatturato without mutating records if intervention is fatturato", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      // 1. SELECT report FOR UPDATE
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: reportId,
          companyId,
          interventionId,
          status: "submitted",
          workHours: 3,
          travelHours: 0,
          client: JSON.stringify({ name: "Cliente" }),
          technician: JSON.stringify({ fullName: "Tecnico" }),
          materialsStatus: "none",
          materialsUsed: "[]",
          createdAt: new Date().toISOString(),
        }],
      });
      // 2. SELECT intervention FOR UPDATE -> status is fatturato
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: interventionId,
          companyId,
          customerId: "cust-1",
          locationId: "loc-1",
          description: "Fatturato",
          priority: "alta",
          status: "fatturato",
          createdBy: "usr-1",
          updatedBy: "usr-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      });
      // 3. COMMIT (no mutations were made)
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res = await adapter.deleteReportWithInterventionRegression(
        companyId,
        reportId,
        "Regressione",
        "usr-auditor-1"
      );

      expect(res.status).toBe("blocked_fatturato");
      // Ensure DELETE was NEVER called
      const deleteCalls = mockClient.query.mock.calls.filter((call: any[]) =>
        typeof call[0] === "string" && call[0].includes("DELETE FROM reports")
      );
      expect(deleteCalls.length).toBe(0);
    });

    it("4. executes ROLLBACK if DELETE reports fails after regression UPDATE", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      // 1. SELECT report FOR UPDATE
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: reportId,
          companyId,
          interventionId,
          status: "submitted",
          workHours: 2,
          travelHours: 0,
          client: JSON.stringify({ name: "Cliente" }),
          technician: JSON.stringify({ fullName: "Tecnico" }),
          materialsStatus: "none",
          materialsUsed: "[]",
          createdAt: new Date().toISOString(),
        }],
      });
      // 2. SELECT intervention FOR UPDATE
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: interventionId,
          companyId,
          customerId: "cust-1",
          locationId: "loc-1",
          description: "Pronto",
          priority: "alta",
          status: "pronto_per_fatturazione",
          createdBy: "usr-1",
          updatedBy: "usr-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      });
      // 3. UPDATE interventions succeeds
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: interventionId }] });
      // 4. DELETE reports FAILS with database error
      mockClient.query.mockRejectedValueOnce(new Error("FK violation or lock timeout during delete"));
      // 5. ROLLBACK
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        adapter.deleteReportWithInterventionRegression(companyId, reportId, "Regressione", "usr-auditor-1")
      ).rejects.toThrow("FK violation or lock timeout during delete");

      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("5. executes ROLLBACK if regression UPDATE fails (concurrent change detection)", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      // 1. SELECT report FOR UPDATE
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: reportId,
          companyId,
          interventionId,
          status: "submitted",
          workHours: 2,
          travelHours: 0,
          client: JSON.stringify({ name: "Cliente" }),
          technician: JSON.stringify({ fullName: "Tecnico" }),
          materialsStatus: "none",
          materialsUsed: "[]",
          createdAt: new Date().toISOString(),
        }],
      });
      // 2. SELECT intervention FOR UPDATE
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: interventionId,
          companyId,
          customerId: "cust-1",
          locationId: "loc-1",
          description: "Pronto",
          priority: "alta",
          status: "pronto_per_fatturazione",
          createdBy: "usr-1",
          updatedBy: "usr-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      });
      // 3. UPDATE interventions returns rowCount = 0 (concurrent state change)
      mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      // 4. ROLLBACK
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        adapter.deleteReportWithInterventionRegression(companyId, reportId, "Regressione", "usr-auditor-1")
      ).rejects.toThrow("RETRY_REQUIRED: intervento modificato concorrentemente");

      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
      // DELETE must not be executed
      const deleteCalls = mockClient.query.mock.calls.filter((call: any[]) =>
        typeof call[0] === "string" && call[0].includes("DELETE FROM reports")
      );
      expect(deleteCalls.length).toBe(0);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("C. Strict Contract Compatibility (IDatabaseAdapter)", () => {
    it("ensures both DatabaseStore and PostgresAdapter satisfy IDatabaseAdapter without transactional parameter demands", () => {
      const memoryAdapter: IDatabaseAdapter = new DatabaseStore();
      const mockPool: any = { query: vi.fn(), connect: vi.fn(), end: vi.fn() };
      const postgresAdapter: IDatabaseAdapter = new PostgresAdapter(mockPool);

      expect(typeof memoryAdapter.getReportById).toBe("function");
      expect(typeof memoryAdapter.deleteReport).toBe("function");
      expect(typeof memoryAdapter.getInterventionByIdAndCompany).toBe("function");
      expect(typeof memoryAdapter.updateIntervention).toBe("function");
      expect(typeof memoryAdapter.deleteReportWithInterventionRegression).toBe("function");

      expect(typeof postgresAdapter.getReportById).toBe("function");
      expect(typeof postgresAdapter.deleteReport).toBe("function");
      expect(typeof postgresAdapter.getInterventionByIdAndCompany).toBe("function");
      expect(typeof postgresAdapter.updateIntervention).toBe("function");
      expect(typeof postgresAdapter.deleteReportWithInterventionRegression).toBe("function");
    });
  });
});
