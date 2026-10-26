import { randomUUID } from "crypto";
import path from "path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAdapter } from "./db-postgres";
import { loadMigrationsFromDir, runMigrations } from "./migrator";

const testDatabaseUrl = process.env.MIGRATOR_TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("P1.4 report draft persistence with PostgreSQL", () => {
  let adminPool: Pool | undefined;
  let testPool: Pool | undefined;
  let adapter: PostgresAdapter | undefined;
  let schemaName = "";
  const runId = randomUUID().replace(/-/g, "");
  const companyA = `p14-company-a-${runId}`;
  const companyB = `p14-company-b-${runId}`;

  beforeAll(async () => {
    if (!testDatabaseUrl) return;

    const parsedUrl = new URL(testDatabaseUrl);
    const databaseName = parsedUrl.pathname.replace(/^\//, "");
    if (
      !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) ||
      !databaseName.endsWith("_test")
    ) {
      throw new Error("P1.4 report persistence tests require a loopback *_test database URL.");
    }

    adminPool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
    schemaName = "bg_p14_report_drafts_" + runId;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);

    testPool = new Pool({
      connectionString: testDatabaseUrl,
      options: `-c search_path=${schemaName}`,
      max: 2,
      connectionTimeoutMillis: 5000,
    });

    const migrations = loadMigrationsFromDir(path.resolve(__dirname, "migrations"));
    await runMigrations(testPool, { migrations });
    adapter = new PostgresAdapter(testPool);

    await testPool.query("INSERT INTO companies (id, name) VALUES ($1, $2), ($3, $4)", [
      companyA,
      "P1.4 Test Company A",
      companyB,
      "P1.4 Test Company B",
    ]);
  }, 60_000);

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    if (adminPool) await adminPool.end();
  }, 15_000);

  it("persists a draft update and reloads it from PostgreSQL without crossing tenants", async () => {
    const reportId = `report-draft-${runId}`;
    await adapter!.createReport(companyA, {
      id: reportId,
      date: "2026-10-26",
      time: "09:15",
      workHours: 0,
      travelHours: 0,
      status: "draft",
      client: { name: "Cliente iniziale", address: "Via iniziale 1", city: "Roma" },
      technician: { fullName: "Tecnico server" },
      materialsStatus: "unverified",
      materialsUsed: [],
      notes: "Prima bozza",
    });

    const beforeUpdate = await adapter!.getReportById(companyA, reportId);
    expect(beforeUpdate).toMatchObject({
      id: reportId,
      companyId: companyA,
      status: "draft",
      client: { name: "Cliente iniziale", address: "Via iniziale 1", city: "Roma" },
      technician: { fullName: "Tecnico server" },
      notes: "Prima bozza",
    });

    const updateResult = await adapter!.updateDraftReport(companyA, reportId, {
      date: "2026-10-27",
      time: "10:45",
      workHours: 2.5,
      travelHours: 0.5,
      status: "draft",
      client: { name: "Cliente aggiornato", address: "Via aggiornata 2", city: "Milano" },
      materialsStatus: "used",
      materialsUsed: [{ name: "Cavo", quantity: 3 }],
      notes: "Bozza aggiornata",
    });

    expect(updateResult.status).toBe("updated");
    if (updateResult.status !== "updated") {
      throw new Error("Expected the draft update to be persisted.");
    }
    expect(updateResult.report).toMatchObject({
      id: reportId,
      companyId: companyA,
      status: "draft",
      date: "2026-10-27",
      time: "10:45",
      workHours: 2.5,
      travelHours: 0.5,
      client: { name: "Cliente aggiornato", address: "Via aggiornata 2", city: "Milano" },
      technician: { fullName: "Tecnico server" },
      materialsStatus: "used",
      materialsUsed: [{ name: "Cavo", quantity: 3 }],
      notes: "Bozza aggiornata",
    });

    // A separate read proves the updated values survive beyond the UPDATE result.
    const reloaded = await adapter!.getReportById(companyA, reportId);
    expect(reloaded).toMatchObject({
      id: reportId,
      companyId: companyA,
      status: "draft",
      date: "2026-10-27",
      time: "10:45",
      workHours: 2.5,
      travelHours: 0.5,
      materialsUsed: [{ name: "Cavo", quantity: 3 }],
      notes: "Bozza aggiornata",
    });

    expect(await adapter!.getReportById(companyB, reportId)).toBeNull();
    expect((await adapter!.updateDraftReport(companyB, reportId, { notes: "Tentativo cross-tenant" })).status)
      .toBe("not_found");

    const stillOwnedByA = await adapter!.getReportById(companyA, reportId);
    expect(stillOwnedByA?.notes).toBe("Bozza aggiornata");
  });

  it("does not allow another draft update after the report has been submitted", async () => {
    const reportId = `report-submitted-${runId}`;
    await adapter!.createReport(companyA, {
      id: reportId,
      date: "2026-10-26",
      time: "11:00",
      workHours: 1,
      travelHours: 0,
      status: "draft",
      client: { name: "Cliente invio" },
      technician: { fullName: "Tecnico server" },
      materialsStatus: "none",
      materialsUsed: [],
      notes: "Pronto per invio",
    });

    const submitResult = await adapter!.updateDraftReport(companyA, reportId, {
      status: "submitted",
      workHours: 1,
    });
    expect(submitResult.status).toBe("updated");

    const attemptedEdit = await adapter!.updateDraftReport(companyA, reportId, {
      notes: "Modifica successiva non consentita",
    });
    expect(attemptedEdit.status).toBe("not_draft");

    const reloaded = await adapter!.getReportById(companyA, reportId);
    expect(reloaded?.status).toBe("submitted");
    expect(reloaded?.notes).toBe("Pronto per invio");
  });
});
