import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { tokenStore } from "./token-store";
import { generateTokens, generateCsrfToken, hashPassword } from "./security";
import { UserRole } from "./types";

let server: http.Server;
let baseUrl: string;

const companyA = "comp-tenant-alpha-reports";
const companyB = "comp-tenant-beta-reports";

beforeEach(async () => {
  process.env.JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";
  const { config } = await import("./config");
  config.EMAIL_VERIFICATION_ENABLED = false;
  db.seedInitialData?.();
  tokenStore.setAvailability(true);

  // Seed test companies
  (db as any).companies.set(companyA, {
    id: companyA,
    name: "Alpha Servizi Tecnici",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  (db as any).companies.set(companyB, {
    id: companyB,
    name: "Beta Costruzioni Edili",
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

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data: any = null;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
  };
}

describe("Reports RBAC & Multi-Tenant Authorization (server/routes/reports.ts)", () => {
  const validReportPayload = {
    client_name: "Cliente Rossi SpA",
    client_address: "Via Roma 10, Milano",
    client_city: "Milano",
    work_hours: 3.5,
    travel_hours: 1.0,
    date: "2026-10-17",
    time: "10:30",
    notes: "Intervento manutenzione caldaia",
    status: "submitted",
    materials_used: [{ name: "Guarnizione", quantity: 2 }],
  };

  describe("1. Unauthenticated Requests (401 Unauthorized)", () => {
    const anonCsrfToken = generateCsrfToken();
    const anonCookies = { csrf_token: anonCsrfToken };
    const anonHeaders = { "x-csrf-token": anonCsrfToken };

    it("rejects unauthenticated GET /api/v1/reports with 401", async () => {
      const res = await apiRequest("/api/v1/reports");
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated POST /api/v1/reports with 401 (with CSRF)", async () => {
      const res = await apiRequest("/api/v1/reports", {
        method: "POST",
        body: validReportPayload,
        cookies: anonCookies,
        headers: anonHeaders,
      });
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated GET /api/v1/reports/:id with 401", async () => {
      const res = await apiRequest("/api/v1/reports/rep-12345");
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated GET /api/v1/reports/:id/pdf with 401", async () => {
      const res = await apiRequest("/api/v1/reports/rep-12345/pdf");
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated DELETE /api/v1/reports/:id with 401 (with CSRF)", async () => {
      const res = await apiRequest("/api/v1/reports/rep-12345", {
        method: "DELETE",
        cookies: anonCookies,
        headers: anonHeaders,
      });
      expect(res.status).toBe(401);
    });
  });

  describe("2. Cliente Role Complete Exclusion (403 Forbidden across all endpoints)", () => {
    it("rejects cliente from GET /api/v1/reports (403)", async () => {
      const client = await createTestUserAndLogin(companyA, "cliente");
      const res = await apiRequest("/api/v1/reports", {
        cookies: client.cookies,
        headers: client.headers,
      });
      expect(res.status).toBe(403);
      expect(res.data.detail).toContain("Accesso negato");
    });

    it("rejects cliente from POST /api/v1/reports (403)", async () => {
      const client = await createTestUserAndLogin(companyA, "cliente");
      const res = await apiRequest("/api/v1/reports", {
        method: "POST",
        cookies: client.cookies,
        headers: client.headers,
        body: validReportPayload,
      });
      expect(res.status).toBe(403);
      expect(res.data.detail).toContain("Accesso negato");
    });

    it("rejects cliente from GET /api/v1/reports/:id (403)", async () => {
      const client = await createTestUserAndLogin(companyA, "cliente");
      const res = await apiRequest("/api/v1/reports/rep-12345", {
        cookies: client.cookies,
        headers: client.headers,
      });
      expect(res.status).toBe(403);
      expect(res.data.detail).toContain("Accesso negato");
    });

    it("rejects cliente from GET /api/v1/reports/:id/pdf (403)", async () => {
      const client = await createTestUserAndLogin(companyA, "cliente");
      const res = await apiRequest("/api/v1/reports/rep-12345/pdf", {
        cookies: client.cookies,
        headers: client.headers,
      });
      expect(res.status).toBe(403);
      expect(res.data.detail).toContain("Accesso negato");
    });

    it("rejects cliente from DELETE /api/v1/reports/:id (403)", async () => {
      const client = await createTestUserAndLogin(companyA, "cliente");
      const res = await apiRequest("/api/v1/reports/rep-12345", {
        method: "DELETE",
        cookies: client.cookies,
        headers: client.headers,
      });
      expect(res.status).toBe(403);
      expect(res.data.detail).toContain("Accesso negato");
    });
  });

  describe("3. Technician Permissions (Read-Only: can read/pdf, cannot create or delete)", () => {
    it("allows technician to read reports list (200)", async () => {
      const tech = await createTestUserAndLogin(companyA, "technician");
      const res = await apiRequest("/api/v1/reports", {
        cookies: tech.cookies,
        headers: tech.headers,
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it("allows technician to read report by id and download pdf (200)", async () => {
      const tech = await createTestUserAndLogin(companyA, "technician");
      const report = await db.createReport(companyA, {
        client: { name: "Cliente Mario", address: "Via Roma", city: "Milano" },
        workHours: 2,
        travelHours: 0.5,
        status: "submitted",
      });

      const getRes = await apiRequest(`/api/v1/reports/${report.id}`, {
        cookies: tech.cookies,
        headers: tech.headers,
      });
      expect(getRes.status).toBe(200);
      expect(getRes.data.id).toBe(report.id);

      const pdfRes = await apiRequest(`/api/v1/reports/${report.id}/pdf`, {
        cookies: tech.cookies,
        headers: tech.headers,
      });
      expect(pdfRes.status).toBe(200);
    });

    it("strictly forbids technician from creating reports (403)", async () => {
      const tech = await createTestUserAndLogin(companyA, "technician");
      const res = await apiRequest("/api/v1/reports", {
        method: "POST",
        cookies: tech.cookies,
        headers: tech.headers,
        body: validReportPayload,
      });
      expect(res.status).toBe(403);
      expect(res.data.detail).toContain("Accesso negato");
    });

    it("strictly forbids technician from deleting reports (403)", async () => {
      const tech = await createTestUserAndLogin(companyA, "technician");
      const report = await db.createReport(companyA, {
        client: { name: "Cliente Protetto", address: "Via Po", city: "Torino" },
        workHours: 1,
      });

      const res = await apiRequest(`/api/v1/reports/${report.id}`, {
        method: "DELETE",
        cookies: tech.cookies,
        headers: tech.headers,
      });
      expect(res.status).toBe(403);
      expect(res.data.detail).toContain("Accesso negato");

      // Verify report was not deleted
      const check = await db.getReportById(companyA, report.id);
      expect(check).not.toBeNull();
    });
  });

  describe("4. Operational Roles (Create & Read allowed, Deletion forbidden)", () => {
    const operationalRoles: UserRole[] = [
      "responsabile_tecnico",
      "dispatcher",
      "commerciale",
      "amministrazione",
    ];

    for (const role of operationalRoles) {
      it(`allows '${role}' to create reports (201) and read (200), but rejects delete (403)`, async () => {
        const auth = await createTestUserAndLogin(companyA, role);

        // 1. Create -> 201
        const createRes = await apiRequest("/api/v1/reports", {
          method: "POST",
          cookies: auth.cookies,
          headers: auth.headers,
          body: {
            ...validReportPayload,
            client_name: `Committente da ${role}`,
          },
        });
        expect(createRes.status).toBe(201);
        const reportId = createRes.data.id;
        expect(reportId).toBeDefined();

        // 2. Read list -> 200
        const listRes = await apiRequest("/api/v1/reports", {
          cookies: auth.cookies,
          headers: auth.headers,
        });
        expect(listRes.status).toBe(200);

        // 3. Read single -> 200
        const getRes = await apiRequest(`/api/v1/reports/${reportId}`, {
          cookies: auth.cookies,
          headers: auth.headers,
        });
        expect(getRes.status).toBe(200);

        // 4. Delete -> 403 Forbidden
        const deleteRes = await apiRequest(`/api/v1/reports/${reportId}`, {
          method: "DELETE",
          cookies: auth.cookies,
          headers: auth.headers,
        });
        expect(deleteRes.status).toBe(403);
        expect(deleteRes.data.detail).toContain("Accesso negato");

        // Verify report was not deleted
        const check = await db.getReportById(companyA, reportId);
        expect(check).not.toBeNull();
      });
    }
  });

  describe("5. Admin & Owner Roles (Full permissions: Read, Create, Delete)", () => {
    const adminRoles: UserRole[] = ["owner", "admin", "superadmin"];

    for (const role of adminRoles) {
      it(`allows '${role}' full lifecycle: create (201), read (200), pdf (200), and delete (200)`, async () => {
        const auth = await createTestUserAndLogin(companyA, role);

        // 1. Create -> 201
        const createRes = await apiRequest("/api/v1/reports", {
          method: "POST",
          cookies: auth.cookies,
          headers: auth.headers,
          body: {
            ...validReportPayload,
            client_name: `Committente creato da ${role}`,
          },
        });
        expect(createRes.status).toBe(201);
        const reportId = createRes.data.id;

        // 2. Read single -> 200
        const getRes = await apiRequest(`/api/v1/reports/${reportId}`, {
          cookies: auth.cookies,
          headers: auth.headers,
        });
        expect(getRes.status).toBe(200);

        // 3. Read PDF -> 200
        const pdfRes = await apiRequest(`/api/v1/reports/${reportId}/pdf`, {
          cookies: auth.cookies,
          headers: auth.headers,
        });
        expect(pdfRes.status).toBe(200);

        // 4. Delete -> 200
        const deleteRes = await apiRequest(`/api/v1/reports/${reportId}`, {
          method: "DELETE",
          cookies: auth.cookies,
          headers: auth.headers,
        });
        expect(deleteRes.status).toBe(200);
        expect(deleteRes.data.message).toContain("eliminato");

        // Verify report is deleted
        const check = await db.getReportById(companyA, reportId);
        expect(check).toBeNull();
      });
    }
  });

  describe("6. Multi-Tenant Strict Isolation", () => {
    it("ensures reports created by Company A cannot be seen or accessed by Company B", async () => {
      const adminA = await createTestUserAndLogin(companyA, "admin");
      const adminB = await createTestUserAndLogin(companyB, "admin");

      // Admin A creates report in Company A
      const createRes = await apiRequest("/api/v1/reports", {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          ...validReportPayload,
          client_name: "Cliente Riservato Azienda A",
        },
      });
      expect(createRes.status).toBe(201);
      const reportAId = createRes.data.id;

      // Admin B lists reports -> report A must NOT be in the list
      const listBRes = await apiRequest("/api/v1/reports", {
        cookies: adminB.cookies,
        headers: adminB.headers,
      });
      expect(listBRes.status).toBe(200);
      const foundInListB = listBRes.data.some((r: any) => r.id === reportAId);
      expect(foundInListB).toBe(false);

      // Admin B tries to get report A directly by ID -> 404 Not Found
      const getSingleBRes = await apiRequest(`/api/v1/reports/${reportAId}`, {
        cookies: adminB.cookies,
        headers: adminB.headers,
      });
      expect(getSingleBRes.status).toBe(404);

      // Admin B tries to download report A's PDF -> 404 Not Found
      const getPdfBRes = await apiRequest(`/api/v1/reports/${reportAId}/pdf`, {
        cookies: adminB.cookies,
        headers: adminB.headers,
      });
      expect(getPdfBRes.status).toBe(404);

      // Admin B tries to delete report A -> 404 Not Found
      const deleteBRes = await apiRequest(`/api/v1/reports/${reportAId}`, {
        method: "DELETE",
        cookies: adminB.cookies,
        headers: adminB.headers,
      });
      expect(deleteBRes.status).toBe(404);

      // Verify report A is intact in Company A
      const checkA = await db.getReportById(companyA, reportAId);
      expect(checkA).not.toBeNull();
      expect(checkA?.companyId).toBe(companyA);
    });
  });
});
