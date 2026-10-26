import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { tokenStore } from "./token-store";
import { generateTokens, generateCsrfToken, hashPassword } from "./security";
import { UserRole, InterventionRecord, ReportRecord, AssetRecord } from "./types";
import { calculateJobCompleteScore } from "./services/job-complete-score.domain";

let server: http.Server;
let baseUrl: string;

const companyA = "comp-score-tenant-a";
const companyB = "comp-score-tenant-b";

beforeEach(async () => {
  process.env.JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";
  const { config } = await import("./config");
  config.EMAIL_VERIFICATION_ENABLED = false;
  db.seedInitialData?.();
  tokenStore.setAvailability(true);

  // Seed test companies
  (db as any).companies.set(companyA, {
    id: companyA,
    name: "Score Tenant A",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  (db as any).companies.set(companyB, {
    id: companyB,
    name: "Score Tenant B",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

async function createTestUserAndLogin(
  companyId: string,
  role: UserRole,
  userId = `usr-${role}-${Math.random().toString(36).slice(2, 7)}`,
  email = `${role}-${Math.random().toString(36).slice(2, 7)}@example.com`,
  isActive = true
) {
  const { hash, salt } = hashPassword("TestPassword123!");
  const user = {
    id: userId,
    email,
    fullName: `Test ${role}`,
    role,
    companyId,
    companyName: "Test Company",
    passwordHash: hash,
    salt,
    isActive,
    emailConfirmed: true,
    authVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  (db as any).users.set(user.id, user);

  const { accessToken } = generateTokens(user as any);
  const csrfToken = generateCsrfToken();

  return {
    user,
    token: accessToken,
    csrfToken,
    cookies: {
      access_token: accessToken,
      csrf_token: csrfToken,
    },
    headers: {
      "x-csrf-token": csrfToken,
    },
  };
}

async function apiRequest(
  path: string,
  options: {
    method?: string;
    body?: any;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {}
) {
  const method = options.method || "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (options.cookies) {
    const cookieStr = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    headers["Cookie"] = cookieStr;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let json: any = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }

  return {
    status: res.status,
    body: json,
  };
}

describe("P1.7 Job Complete Score Suite", () => {
  describe("Pure Domain Logic (calculateJobCompleteScore)", () => {
    it("1. Empty intervention: low score and readyForBilling = false", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Manutenzione",
        priority: "media",
        status: "nuovo",
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, null, null);

      expect(result.readyForBilling).toBe(false);
      expect(result.missingMandatoryCount).toBe(5); // technician, hours, report, signature, materials
      expect(result.score).toBeLessThan(30);
    });

    it("2. Partially complete intervention: score reflects checks and billing is blocked", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Manutenzione",
        priority: "media",
        status: "in_lavorazione",
        technicianId: "tech-1",
        actualHours: 2.5,
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, null, null);

      expect(result.readyForBilling).toBe(false); // report, signature, materials still missing
      expect(result.checks.find((c) => c.id === "assignment")?.passed).toBe(true);
      expect(result.checks.find((c) => c.id === "actual_hours")?.passed).toBe(true);
      expect(result.checks.find((c) => c.id === "report_linked")?.passed).toBe(false);
    });

    it("3. Fully complete intervention: 100% score and readyForBilling = true", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Manutenzione",
        priority: "media",
        status: "completato",
        technicianId: "tech-1",
        actualHours: 3.5,
        notes: "Lavoro completato regolarmente.",
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report: ReportRecord = {
        id: "rep-1",
        companyId: "comp-1",
        interventionId: "int-1",
        customerId: "cust-1",
        locationId: "loc-1",
        date: "2025-01-01",
        time: "10:00",
        workHours: 3.5,
        travelHours: 0.5,
        status: "submitted",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico Rossi" },
        materialsStatus: "used" as const,
        materialsUsed: [{ name: "Cavo 3x2.5", quantity: 10 }],
        signatureBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        createdAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, report, null);

      expect(result.readyForBilling).toBe(true);
      expect(result.score).toBe(100);
      expect(result.missingMandatoryCount).toBe(0);
    });

    it("blocks billing when intervention customer or location IDs are missing", () => {
      const intervention: InterventionRecord = {
        id: "int-missing-relations",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Manutenzione",
        priority: "media",
        status: "completato",
        technicianId: "tech-1",
        actualHours: 2,
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report: ReportRecord = {
        id: "rep-missing-relations",
        companyId: "comp-1",
        interventionId: intervention.id,
        customerId: "cust-1",
        locationId: "loc-1",
        date: "2025-01-01",
        time: "10:00",
        workHours: 2,
        travelHours: 0,
        status: "submitted",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico Rossi" },
        materialsStatus: "none",
        materialsUsed: [],
        signatureBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        createdAt: new Date().toISOString(),
      };

      const missingCustomer = calculateJobCompleteScore(
        { ...intervention, customerId: undefined as unknown as string },
        report,
        null
      );
      const customerCheck = missingCustomer.checks.find((check) => check.id === "report_linked");
      expect(customerCheck?.passed).toBe(false);
      expect(customerCheck?.missingDataReason).toContain("Cliente dell'intervento");
      expect(missingCustomer.readyForBilling).toBe(false);

      const missingLocation = calculateJobCompleteScore(
        { ...intervention, locationId: undefined as unknown as string },
        report,
        null
      );
      const locationCheck = missingLocation.checks.find((check) => check.id === "report_linked");
      expect(locationCheck?.passed).toBe(false);
      expect(locationCheck?.missingDataReason).toContain("Sede dell'intervento");
      expect(missingLocation.readyForBilling).toBe(false);
    });

    it("4. Explicit confirmation of zero materials used (materialsStatus 'none') passes", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Manutenzione",
        priority: "media",
        status: "completato",
        technicianId: "tech-1",
        actualHours: 1,
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report: ReportRecord = {
        id: "rep-1",
        companyId: "comp-1",
        interventionId: "int-1",
        customerId: "cust-1",
        locationId: "loc-1",
        date: "2025-01-01",
        time: "10:00",
        workHours: 1,
        travelHours: 0,
        status: "submitted",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico Rossi" },
        materialsStatus: "none" as const,
        materialsUsed: [], // Empty array with materialsStatus 'none' = confirmed no materials used
        signatureBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        createdAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, report, null);

      const matCheck = result.checks.find((c) => c.id === "materials");
      expect(matCheck?.passed).toBe(true);
      expect(matCheck?.details).toContain("Confermato nessun materiale");
      expect(result.readyForBilling).toBe(true);
    });

    it("4b. Unverified materials status fails mandatory materials check and blocks billing", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Manutenzione",
        priority: "media",
        status: "completato",
        technicianId: "tech-1",
        actualHours: 1,
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report: ReportRecord = {
        id: "rep-1",
        companyId: "comp-1",
        interventionId: "int-1",
        customerId: "cust-1",
        locationId: "loc-1",
        date: "2025-01-01",
        time: "10:00",
        workHours: 1,
        travelHours: 0,
        status: "submitted",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico Rossi" },
        materialsStatus: "unverified" as const,
        materialsUsed: [],
        signatureBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        createdAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, report, null);

      const matCheck = result.checks.find((c) => c.id === "materials");
      expect(matCheck?.passed).toBe(false);
      expect(matCheck?.missingDataReason).toContain("Verifica materiali non eseguita");
      expect(result.readyForBilling).toBe(false);
    });

    it("4c. Materials status 'used' with array containing only quantity 0 fails and blocks billing", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Manutenzione",
        priority: "media",
        status: "completato",
        technicianId: "tech-1",
        actualHours: 1,
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report: ReportRecord = {
        id: "rep-1",
        companyId: "comp-1",
        interventionId: "int-1",
        customerId: "cust-1",
        locationId: "loc-1",
        date: "2025-01-01",
        time: "10:00",
        workHours: 1,
        travelHours: 0,
        status: "submitted",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico Rossi" },
        materialsStatus: "used" as const,
        materialsUsed: [{ name: "Cavo", quantity: 0 }], // Quantity 0 is invalid for 'used'
        signatureBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        createdAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, report, null);

      const matCheck = result.checks.find((c) => c.id === "materials");
      expect(matCheck?.passed).toBe(false);
      expect(matCheck?.missingDataReason).toContain("quantità positiva");
      expect(result.readyForBilling).toBe(false);
    });

    it("5. Asset serial number check: fails if asset is linked but serial is missing", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        assetId: "ast-1",
        description: "Manutenzione Inverter",
        priority: "media",
        status: "completato",
        technicianId: "tech-1",
        actualHours: 2,
        notes: "Sostituita scheda",
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const asset: AssetRecord = {
        id: "ast-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        assetType: "inverter",
        name: "Inverter Principale",
        status: "operativo",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report: ReportRecord = {
        id: "rep-1",
        companyId: "comp-1",
        interventionId: "int-1",
        customerId: "cust-1",
        locationId: "loc-1",
        date: "2025-01-01",
        time: "10:00",
        workHours: 2,
        travelHours: 0,
        status: "submitted",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico Rossi" },
        materialsStatus: "none" as const,
        materialsUsed: [],
        signatureBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        createdAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, report, asset);

      const assetCheck = result.checks.find((c) => c.id === "checklist_photos_serials");
      expect(assetCheck?.passed).toBe(false);
      expect(assetCheck?.missingDataReason).toContain("Numero di serie non specificato");
      // Optional check should NOT block billing
      expect(result.readyForBilling).toBe(true);
      expect(result.score).toBe(90); // 100 - 10
    });

    it("6. Azienda discordante: report with mismatched companyId fails and blocks billing", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Test",
        priority: "media",
        status: "completato",
        technicianId: "tech-1",
        actualHours: 2,
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report: ReportRecord = {
        id: "rep-1",
        companyId: "comp-discordant",
        interventionId: "int-1",
        customerId: "cust-1",
        locationId: "loc-1",
        date: "2025-01-01",
        time: "10:00",
        workHours: 2,
        travelHours: 0,
        status: "submitted",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico" },
        materialsUsed: [],
        signatureBase64: "data:image/png;base64,valid",
        createdAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, report, null);
      expect(result.readyForBilling).toBe(false);
      expect(result.checks.find(c => c.id === "report_linked")?.passed).toBe(false);
      expect(result.checks.find(c => c.id === "report_linked")?.missingDataReason).toContain("Azienda");
    });

    it("7. ID intervento mancante o discordante: report with wrong interventionId fails", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Test",
        priority: "media",
        status: "completato",
        technicianId: "tech-1",
        actualHours: 2,
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report: ReportRecord = {
        id: "rep-1",
        companyId: "comp-1",
        interventionId: "int-wrong",
        customerId: "cust-1",
        locationId: "loc-1",
        date: "2025-01-01",
        time: "10:00",
        workHours: 2,
        travelHours: 0,
        status: "submitted",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico" },
        materialsUsed: [],
        signatureBase64: "data:image/png;base64,valid",
        createdAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, report, null);
      expect(result.readyForBilling).toBe(false);
      expect(result.checks.find(c => c.id === "report_linked")?.passed).toBe(false);
      expect(result.checks.find(c => c.id === "report_linked")?.missingDataReason).toContain("ID intervento");
    });

    it("8. Cliente mancante o discordante: report with wrong customerId fails", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Test",
        priority: "media",
        status: "completato",
        technicianId: "tech-1",
        actualHours: 2,
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report: ReportRecord = {
        id: "rep-1",
        companyId: "comp-1",
        interventionId: "int-1",
        customerId: "cust-wrong",
        locationId: "loc-1",
        date: "2025-01-01",
        time: "10:00",
        workHours: 2,
        travelHours: 0,
        status: "submitted",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico" },
        materialsUsed: [],
        signatureBase64: "data:image/png;base64,valid",
        createdAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, report, null);
      expect(result.readyForBilling).toBe(false);
      expect(result.checks.find(c => c.id === "report_linked")?.passed).toBe(false);
      expect(result.checks.find(c => c.id === "report_linked")?.missingDataReason).toContain("Cliente");
    });

    it("9. Sede mancante o discordante: report with wrong locationId fails", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Test",
        priority: "media",
        status: "completato",
        technicianId: "tech-1",
        actualHours: 2,
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report: ReportRecord = {
        id: "rep-1",
        companyId: "comp-1",
        interventionId: "int-1",
        customerId: "cust-1",
        locationId: "loc-wrong",
        date: "2025-01-01",
        time: "10:00",
        workHours: 2,
        travelHours: 0,
        status: "submitted",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico" },
        materialsUsed: [],
        signatureBase64: "data:image/png;base64,valid",
        createdAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, report, null);
      expect(result.readyForBilling).toBe(false);
      expect(result.checks.find(c => c.id === "report_linked")?.passed).toBe(false);
      expect(result.checks.find(c => c.id === "report_linked")?.missingDataReason).toContain("Sede");
    });

    it("10. Rapportino in bozza: report with draft status fails and blocks billing", () => {
      const intervention: InterventionRecord = {
        id: "int-1",
        companyId: "comp-1",
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Test",
        priority: "media",
        status: "completato",
        technicianId: "tech-1",
        actualHours: 2,
        createdBy: "usr-1",
        updatedBy: "usr-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const report: ReportRecord = {
        id: "rep-1",
        companyId: "comp-1",
        interventionId: "int-1",
        customerId: "cust-1",
        locationId: "loc-1",
        date: "2025-01-01",
        time: "10:00",
        workHours: 2,
        travelHours: 0,
        status: "draft",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico" },
        materialsUsed: [],
        signatureBase64: "data:image/png;base64,valid",
        createdAt: new Date().toISOString(),
      };

      const result = calculateJobCompleteScore(intervention, report, null);
      expect(result.readyForBilling).toBe(false);
      expect(result.checks.find(c => c.id === "report_linked")?.passed).toBe(false);
      expect(result.checks.find(c => c.id === "report_linked")?.missingDataReason).toContain("stato 'bozza'");
    });
  });

  describe("API Endpoints & Billing Transition Enforcement", () => {
    it("6. GET /api/v1/interventions/:id/score returns score and checks breakdown", async () => {
      const admin = await createTestUserAndLogin(companyA, "admin");

      const intervention: InterventionRecord = {
        id: "int-score-1",
        companyId: companyA,
        customerId: "cust-score-1",
        locationId: "loc-score-1",
        description: "Intervento di prova score",
        priority: "media",
        status: "nuovo",
        createdBy: admin.user.id,
        updatedBy: admin.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (db as any).interventions.set(intervention.id, intervention);

      const res = await apiRequest(`/api/v1/interventions/${intervention.id}/score`, {
        method: "GET",
        cookies: admin.cookies,
        headers: admin.headers,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("score");
      expect(res.body).toHaveProperty("readyForBilling", false);
      expect(Array.isArray(res.body.checks)).toBe(true);
      expect(res.body.checks).toHaveLength(7);
    });

    it("7. Transition to 'pronto_per_fatturazione' is BLOCKED when mandatory checks fail (400)", async () => {
      const admin = await createTestUserAndLogin(companyA, "admin");

      const intervention: InterventionRecord = {
        id: "int-block-1",
        companyId: companyA,
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Intervento incompleto",
        priority: "media",
        status: "verificato",
        technicianId: "tech-1",
        actualHours: 2,
        createdBy: admin.user.id,
        updatedBy: admin.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (db as any).interventions.set(intervention.id, intervention);

      // Attempt transition to pronto_per_fatturazione without report or signature
      const res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: admin.cookies,
        headers: admin.headers,
        body: { targetStatus: "pronto_per_fatturazione" },
      });

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain("Impossibile portare l'intervento nello stato 'pronto_per_fatturazione'");
      expect(res.body.detail).toContain("Rapportino di lavoro non creato");

      // Verify status was NOT changed in DB
      const persisted = await db.getInterventionByIdAndCompany(intervention.id, companyA);
      expect(persisted?.status).toBe("verificato");
    });

    it("8. Transition to 'pronto_per_fatturazione' SUCCEEDS when all mandatory checks are satisfied", async () => {
      const admin = await createTestUserAndLogin(companyA, "admin");

      const intervention: InterventionRecord = {
        id: "int-allow-1",
        companyId: companyA,
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Intervento completo",
        priority: "media",
        status: "verificato",
        technicianId: "tech-1",
        actualHours: 4,
        notes: "Lavoro svolto a regola d'arte.",
        createdBy: admin.user.id,
        updatedBy: admin.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (db as any).interventions.set(intervention.id, intervention);

      // Create linked report with signature and materials
      const report: ReportRecord = {
        id: "rep-allow-1",
        companyId: companyA,
        interventionId: intervention.id,
        customerId: "cust-1",
        locationId: "loc-1",
        date: "2025-01-01",
        time: "10:00",
        workHours: 4,
        travelHours: 0,
        status: "submitted",
        client: { name: "Cliente Srl" },
        technician: { fullName: "Tecnico Rossi" },
        materialsStatus: "used" as const,
        materialsUsed: [{ name: "Materiale A", quantity: 1 }],
        signatureBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        createdAt: new Date().toISOString(),
      };

      (db as any).reports.set(report.id, report);

      const res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: admin.cookies,
        headers: admin.headers,
        body: { targetStatus: "pronto_per_fatturazione" },
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("pronto_per_fatturazione");

      // Verify updated status in DB
      const persisted = await db.getInterventionByIdAndCompany(intervention.id, companyA);
      expect(persisted?.status).toBe("pronto_per_fatturazione");
    });

    it("9. Multi-tenant Isolation: Tenant B cannot query or transition Tenant A intervention score", async () => {
      const adminA = await createTestUserAndLogin(companyA, "admin");
      const adminB = await createTestUserAndLogin(companyB, "admin");

      const interventionA: InterventionRecord = {
        id: "int-tenant-a",
        companyId: companyA,
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Intervento Tenant A",
        priority: "media",
        status: "nuovo",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (db as any).interventions.set(interventionA.id, interventionA);

      // Tenant B queries Tenant A score
      const resGet = await apiRequest(`/api/v1/interventions/${interventionA.id}/score`, {
        method: "GET",
        cookies: adminB.cookies,
        headers: adminB.headers,
      });

      expect(resGet.status).toBe(404);

      // Tenant B attempts transition on Tenant A intervention
      const resTrans = await apiRequest(`/api/v1/interventions/${interventionA.id}/transition`, {
        method: "POST",
        cookies: adminB.cookies,
        headers: adminB.headers,
        body: { targetStatus: "pronto_per_fatturazione" },
      });

      expect(resTrans.status).toBe(404);
    });

    it("10. Technician Role Restrictions: Technician cannot transition to pronto_per_fatturazione (403)", async () => {
      const techUser = await createTestUserAndLogin(companyA, "technician");

      const intervention: InterventionRecord = {
        id: "int-tech-1",
        companyId: companyA,
        customerId: "cust-1",
        locationId: "loc-1",
        description: "Intervento assegnato a tecnico",
        priority: "media",
        status: "completato",
        technicianId: techUser.user.id,
        actualHours: 2,
        createdBy: "admin-1",
        updatedBy: "admin-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      (db as any).interventions.set(intervention.id, intervention);

      const res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techUser.cookies,
        headers: techUser.headers,
        body: { targetStatus: "pronto_per_fatturazione" },
      });

      expect(res.status).toBe(403);
    });

    it("covers the intervention-to-report-to-PDF-to-score API workflow", async () => {
      const admin = await createTestUserAndLogin(companyA, "admin");
      const technician = await createTestUserAndLogin(companyA, "technician");
      const customer = await db.createCustomer(companyA, { displayName: "Cliente Workflow E2E" });
      const location = await db.createLocation(companyA, customer.id, {
        name: "Sede Workflow E2E",
        address: "Via Roma 25",
        city: "Roma",
      });
      const intervention: InterventionRecord = {
        id: "int-workflow-report-pdf-score",
        companyId: companyA,
        customerId: customer.id,
        locationId: location.id,
        description: "Verifica impianto workflow",
        priority: "media",
        status: "verificato",
        technicianId: technician.user.id,
        actualHours: 2,
        notes: "Verifica conclusa",
        createdBy: admin.user.id,
        updatedBy: admin.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      (db as any).interventions.set(intervention.id, intervention);

      const createReport = await apiRequest("/api/v1/reports", {
        method: "POST",
        cookies: technician.cookies,
        headers: technician.headers,
        body: {
          client_name: customer.displayName,
          client_address: location.address,
          client_city: location.city,
          work_hours: 2,
          travel_hours: 0,
          date: "2026-10-26",
          time: "10:30",
          notes: "Verifica impianto workflow",
          status: "submitted",
          materials_status: "used",
          materials_used: [{ name: "Cavo", quantity: 2 }],
          signature_base64:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          intervention_id: intervention.id,
        },
      });

      expect(createReport.status).toBe(201);
      expect(createReport.body.intervention_id).toBe(intervention.id);
      expect(createReport.body.customer_id).toBe(customer.id);
      expect(createReport.body.location_id).toBe(location.id);
      expect(createReport.body.signature_base64).toBeUndefined();
      expect(createReport.body.companyId).toBeUndefined();

      const pdf = await apiRequest(`/api/v1/reports/${createReport.body.id}/pdf`, {
        cookies: admin.cookies,
        headers: admin.headers,
      });
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get("content-type")).toContain("application/pdf");
      expect(typeof pdf.data).toBe("string");
      expect(pdf.data.startsWith("%PDF-")).toBe(true);
      expect(pdf.data.trimEnd().endsWith("%%EOF")).toBe(true);

      const score = await apiRequest(`/api/v1/interventions/${intervention.id}/score`, {
        cookies: admin.cookies,
        headers: admin.headers,
      });
      expect(score.status).toBe(200);
      expect(score.body.readyForBilling).toBe(true);
      expect(score.body.missingMandatoryCount).toBe(0);
      expect(score.body.checks.find((check: { id: string }) => check.id === "report_linked")?.passed)
        .toBe(true);
      expect(score.body.checks.find((check: { id: string }) => check.id === "signature")?.passed)
        .toBe(true);
      expect(score.body.checks.find((check: { id: string }) => check.id === "materials")?.passed)
        .toBe(true);
    });
  });
});
