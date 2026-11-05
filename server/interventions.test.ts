import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { tokenStore } from "./token-store";
import { generateTokens, generateCsrfToken, hashPassword } from "./security";
import { UserRole } from "./types";

let server: http.Server;
let baseUrl: string;

const companyA = "comp-tenant-alpha-001";
const companyB = "comp-tenant-beta-002";

beforeEach(async () => {
  process.env.JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";
  const { config } = await import("./config");
  config.EMAIL_VERIFICATION_ENABLED = false;
  db.seedInitialData?.();
  tokenStore.setAvailability(true);

  // Seed test companies so authenticate middleware resolves company
  (db as any).companies.set(companyA, {
    id: companyA,
    name: "Tenant Alpha Company",
    address: "Via Test 1, Roma",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  (db as any).companies.set(companyB, {
    id: companyB,
    name: "Tenant Beta Company",
    address: "Via Test 2, Roma",
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
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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

describe("Interventions Backend Module (P1.4)", () => {
  let adminA: any;
  let techA: any;
  let techA2: any;
  let adminB: any;
  let customerA: any;
  let locationA: any;
  let assetA: any;
  let customerB: any;
  let locationB: any;

  beforeEach(async () => {
    adminA = await createTestUserAndLogin(companyA, "admin");
    techA = await createTestUserAndLogin(companyA, "technician", "usr-tech-a1");
    techA2 = await createTestUserAndLogin(companyA, "technician", "usr-tech-a2");
    adminB = await createTestUserAndLogin(companyB, "admin");

    // Seed customer and location in Company A
    customerA = await db.createCustomer(companyA, {
      displayName: "Condominio Alpha",
      email: "info@alpha.it",
    });

    locationA = await db.createLocation(companyA, customerA.id, {
      name: "Centrale Termica Scala A",
      address: "Via Roma 1",
      city: "Milano",
    });

    assetA = await db.createAsset(companyA, customerA.id, locationA.id, {
      name: "Quadro Elettrico Generale",
      assetType: "quadro",
      status: "operativo",
    });

    // Seed customer and location in Company B
    customerB = await db.createCustomer(companyB, {
      displayName: "Impresa Beta",
      email: "info@beta.it",
    });

    locationB = await db.createLocation(companyB, customerB.id, {
      name: "Sede Operativa Beta",
      address: "Corso Italia 10",
      city: "Torino",
    });
  });

  describe("1. CRUD Base & Server-Authoritative Fields", () => {
    it("creates an intervention in status 'nuovo' with server-derived companyId and createdBy", async () => {
      const res = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          customerId: customerA.id,
          locationId: locationA.id,
          assetId: assetA.id,
          description: "Manutenzione ordinaria quadro",
          problem: "Riscaldamento anomalo interruttore generale",
          priority: "alta",
          scheduledStart: "2026-10-01T08:00:00.000Z",
          scheduledEnd: "2026-10-01T12:00:00.000Z",
          estimatedHours: 4,
          notes: "Portare DPI e guanti dielettrici",
          // Client attempts to spoof status & companyId
          status: "completato",
          companyId: "spoofed-company-id",
          createdBy: "spoofed-user-id",
        },
      });

      expect(res.status).toBe(201);
      expect(res.data.id).toBeDefined();
      expect(res.data.status).toBe("nuovo"); // Strictly server-authoritative
      expect(res.data.description).toBe("Manutenzione ordinaria quadro");
      expect(res.data.problem).toBe("Riscaldamento anomalo interruttore generale");
      expect(res.data.priority).toBe("alta");
      expect(res.data.createdBy).toBe(adminA.user.id);
      expect(res.data.companyId).toBeUndefined(); // companyId omitted from public response
    });

    it("returns 400 for malformed optional string fields instead of a server error", async () => {
      const nullCreateBody = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: null,
      });
      expect(nullCreateBody.status).toBe(400);

      const invalidCreate = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          customerId: customerA.id,
          locationId: locationA.id,
          description: "Controllo impianto",
          problem: { unexpected: "object" },
        },
      });
      expect(invalidCreate.status).toBe(400);

      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento per test input",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const nullUpdateBody = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "PUT",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: null,
      });
      expect(nullUpdateBody.status).toBe(400);

      const invalidUpdates = [
        { customerId: 42 },
        { assetId: { unexpected: "object" } },
        { notes: ["non", "string"] },
        { scheduledStart: 123456789 },
      ];

      for (const body of invalidUpdates) {
        const response = await apiRequest(`/api/v1/interventions/${created.id}`, {
          method: "PUT",
          cookies: adminA.cookies,
          headers: adminA.headers,
          body,
        });
        expect(response.status).toBe(400);
      }

      const nullTransitionBody = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: null,
      });
      expect(nullTransitionBody.status).toBe(400);

      for (const body of [
        { targetStatus: "da_assegnare", notes: { unexpected: "object" } },
        { targetStatus: "da_assegnare", technicianId: ["not", "a", "string"] },
      ]) {
        const response = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
          method: "POST",
          cookies: adminA.cookies,
          headers: adminA.headers,
          body,
        });
        expect(response.status).toBe(400);
      }

      const unchanged = await db.getInterventionByIdAndCompany(created.id, companyA);
      expect(unchanged?.description).toBe("Intervento per test input");
    });

    it("retrieves a single intervention by ID", async () => {
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Controllo periodico",
        priority: "media",
        status: "nuovo",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "GET",
        cookies: adminA.cookies,
      });

      expect(res.status).toBe(200);
      expect(res.data.id).toBe(created.id);
      expect(res.data.description).toBe("Controllo periodico");
      expect(res.data.customerName).toBe("Condominio Alpha");
      expect(res.data.locationName).toBe("Centrale Termica Scala A");
    });

    it("updates intervention fields via PUT while ignoring status manipulation", async () => {
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Descrizione iniziale",
        priority: "bassa",
        status: "nuovo",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "PUT",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          description: "Descrizione aggiornata",
          priority: "urgente",
          notes: "Aggiornate note operative",
          status: "fatturato", // Must be ignored
        },
      });

      expect(res.status).toBe(200);
      expect(res.data.description).toBe("Descrizione aggiornata");
      expect(res.data.priority).toBe("urgente");
      expect(res.data.notes).toBe("Aggiornate note operative");
      expect(res.data.status).toBe("nuovo"); // Status cannot be updated via PUT
    });
  });

  describe("Atomic intervention status transitions", () => {
    it("allows only one compare-and-set update from the same expected status", async () => {
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Test compare-and-set transizioni",
        priority: "media",
        status: "in_lavorazione",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const results = await Promise.all([
        db.updateIntervention(companyA, created.id, { status: "in_attesa", updatedBy: adminA.user.id }, "in_lavorazione"),
        db.updateIntervention(companyA, created.id, { status: "completato", actualHours: 2.5, notes: "Lavoro completato", updatedBy: adminA.user.id }, "in_lavorazione"),
      ]);

      expect(results.filter((result) => result !== null)).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(1);

      const persisted = await db.getInterventionByIdAndCompany(created.id, companyA);
      expect(persisted).not.toBeNull();
      expect(["in_attesa", "completato"]).toContain(persisted?.status);
      if (persisted?.status === "completato") {
        expect(persisted.actualHours).toBe(2.5);
        expect(persisted.notes).toBe("Lavoro completato");
      }
    });

    it("returns 409 instead of overwriting a concurrent status transition", async () => {
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Test race transition",
        priority: "media",
        status: "in_lavorazione",
        actualHours: 1.5,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const originalUpdate = db.updateIntervention.bind(db);
      const updateSpy = vi.spyOn(db, "updateIntervention").mockImplementation(
        async (companyId, interventionId, updates, expectedStatus) => {
          // Simulate another request changing the status after validation but before this write.
          await originalUpdate(companyId, interventionId, {
            status: "in_attesa",
            updatedBy: adminA.user.id,
          });
          return originalUpdate(companyId, interventionId, updates, expectedStatus);
        },
      );

      try {
        const response = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
          method: "POST",
          cookies: adminA.cookies,
          headers: adminA.headers,
          body: { targetStatus: "completato", actualHours: 2.5 },
        });

        expect(updateSpy).toHaveBeenCalledWith(
          companyA,
          created.id,
          expect.objectContaining({ status: "completato", actualHours: 2.5 }),
          "in_lavorazione",
        );
        expect(response.status).toBe(409);
        expect(response.data.detail).toMatch(/stato dell'intervento è cambiato/i);

        const persisted = await db.getInterventionByIdAndCompany(created.id, companyA);
        expect(persisted?.status).toBe("in_attesa");
        expect(persisted?.actualHours).toBe(1.5);
      } finally {
        updateSpy.mockRestore();
      }
    });
  });

    it("rejects hour values above the PostgreSQL NUMERIC(6,2) range before persistence", async () => {
      const invalidCreate = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          customerId: customerA.id,
          locationId: locationA.id,
          description: "Intervento con ore fuori intervallo",
          estimatedHours: 10000,
        },
      });
      expect(invalidCreate.status).toBe(400);

      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento per test limite ore",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
        estimatedHours: 4,
      });
      const invalidUpdate = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "PUT",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { estimatedHours: 10000, actualHours: 10000 },
      });
      expect(invalidUpdate.status).toBe(400);

      const persisted = await db.getInterventionByIdAndCompany(created.id, companyA);
      expect(persisted?.estimatedHours).toBe(4);
      expect(persisted?.actualHours ?? null).toBeNull();
    });

  describe("2. Tenant Isolation & Cross-Tenant Access Protection", () => {
    it("prevents Company B from listing Company A interventions", async () => {
      await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Segreto Company A",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest("/api/v1/interventions", {
        method: "GET",
        cookies: adminB.cookies,
      });

      expect(res.status).toBe(200);
      expect(res.data.items.length).toBe(0);
    });

    it("prevents Company B from accessing Company A intervention by ID (returns 404)", async () => {
      const createdA = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Company A",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest(`/api/v1/interventions/${createdA.id}`, {
        method: "GET",
        cookies: adminB.cookies,
      });

      expect(res.status).toBe(404);
    });

    it("prevents Company B from updating or transitioning Company A intervention (returns 404)", async () => {
      const createdA = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Company A",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const resUpdate = await apiRequest(`/api/v1/interventions/${createdA.id}`, {
        method: "PUT",
        cookies: adminB.cookies,
        headers: adminB.headers,
        body: { description: "Tentativo di manomissione" },
      });
      expect(resUpdate.status).toBe(404);

      const resTrans = await apiRequest(`/api/v1/interventions/${createdA.id}/transition`, {
        method: "POST",
        cookies: adminB.cookies,
        headers: adminB.headers,
        body: { targetStatus: "da_assegnare" },
      });
      expect(resTrans.status).toBe(404);

      // Both rejected requests must leave the tenant-owned record unchanged.
      const persisted = await db.getInterventionByIdAndCompany(createdA.id, companyA);
      expect(persisted).not.toBeNull();
      expect(persisted?.description).toBe("Intervento Company A");
      expect(persisted?.status).toBe(createdA.status);
      expect(persisted?.updatedBy).toBe(createdA.updatedBy);
    });
  });

  describe("3. Relational Consistency Validations (Customer -> Location -> Asset -> Technician)", () => {
    it("rejects creation if location does not belong to customer (returns 400)", async () => {
      // Create another customer in Company A
      const otherCustomerA = await db.createCustomer(companyA, {
        displayName: "Cliente 2",
      });

      const res = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          customerId: otherCustomerA.id, // Mismatched customer with locationA
          locationId: locationA.id,
          description: "Test inconsistenze",
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/non appartiene al cliente/i);
    });

    it("rejects creation if asset does not belong to customer and location (returns 400)", async () => {
      // Create second location for customer A
      const locationA2 = await db.createLocation(companyA, customerA.id, {
        name: "Sede Secondaria",
        address: "Via Roma 2",
        city: "Milano",
      });

      const res = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          customerId: customerA.id,
          locationId: locationA2.id,
          assetId: assetA.id, // assetA belongs to locationA, not locationA2!
          description: "Test asset non in location",
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/non appartiene/i);
    });

    it("rejects updating location when existing asset does not belong to new location (returns 400)", async () => {
      // Create second location for customer A
      const locationA2 = await db.createLocation(companyA, customerA.id, {
        name: "Sede Secondaria",
        address: "Via Roma 2",
        city: "Milano",
      });

      // Create intervention linked to assetA (which belongs to locationA)
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        assetId: assetA.id,
        description: "Intervento con asset",
        priority: "media",
        status: "nuovo",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // Attempt to update locationId to locationA2 without specifying assetId:
      // must fail because assetA belongs to locationA, not locationA2!
      const res = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "PUT",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          locationId: locationA2.id,
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/non appartiene/i);

      // Verify that explicitly clearing the asset via assetId: null allows changing location
      const resClearAsset = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "PUT",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          locationId: locationA2.id,
          assetId: null,
        },
      });
      expect(resClearAsset.status).toBe(200);
      expect(resClearAsset.data.locationId).toBe(locationA2.id);
      expect(resClearAsset.data.assetId).toBeUndefined();
    });

    it("rejects updating customer when existing asset belongs to previous customer (returns 400)", async () => {
      const otherCustomer = await db.createCustomer(companyA, {
        displayName: "Cliente Altro",
      });
      const otherLocation = await db.createLocation(companyA, otherCustomer.id, {
        name: "Sede Altro Cliente",
        address: "Via Napoli 1",
        city: "Napoli",
      });

      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        assetId: assetA.id,
        description: "Intervento con asset cliente A",
        priority: "media",
        status: "nuovo",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // Updating customerId and locationId without clearing or updating assetId must be rejected
      const res = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "PUT",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          customerId: otherCustomer.id,
          locationId: otherLocation.id,
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/non appartiene/i);
    });

    it("allows updating location when a valid asset belonging to target location is provided", async () => {
      const locationA2 = await db.createLocation(companyA, customerA.id, {
        name: "Sede Secondaria Con Asset",
        address: "Via Roma 3",
        city: "Milano",
      });
      const assetA2 = await db.createAsset(companyA, customerA.id, locationA2.id, {
        name: "Quadro Secondario",
        assetType: "quadro",
      });

      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        assetId: assetA.id,
        description: "Intervento con asset da trasferire",
        priority: "media",
        status: "nuovo",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "PUT",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          locationId: locationA2.id,
          assetId: assetA2.id,
        },
      });

      expect(res.status).toBe(200);
      expect(res.data.locationId).toBe(locationA2.id);
      expect(res.data.assetId).toBe(assetA2.id);
    });

    it("preserves assigned asset when updating non-relational fields on intervention", async () => {
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        assetId: assetA.id,
        description: "Descrizione iniziale",
        priority: "bassa",
        status: "nuovo",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "PUT",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          description: "Descrizione aggiornata",
          notes: "Note aggiuntive",
        },
      });

      expect(res.status).toBe(200);
      expect(res.data.description).toBe("Descrizione aggiornata");
      expect(res.data.assetId).toBe(assetA.id);
    });

    it("rejects assignment of technician belonging to another company (returns 404/400)", async () => {
      const techB = await createTestUserAndLogin(companyB, "technician");

      const res = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          customerId: customerA.id,
          locationId: locationA.id,
          description: "Test tecnico cross-tenant",
          technicianId: techB.user.id,
        },
      });

      expect([400, 404]).toContain(res.status);
    });

    it("rejects assignment of an inactive technician (returns 400)", async () => {
      const inactiveTech = await createTestUserAndLogin(
        companyA,
        "technician",
        "usr-tech-inactive",
        "inactive-tech@example.com",
        false
      );

      const res = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          customerId: customerA.id,
          locationId: locationA.id,
          description: "Test tecnico inattivo",
          technicianId: inactiveTech.user.id,
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/non è attivo/i);
    });

    it("rejects assignment of a user who is not a technician (returns 400)", async () => {
      const dispatcher = await createTestUserAndLogin(companyA, "dispatcher");

      const res = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          customerId: customerA.id,
          locationId: locationA.id,
          description: "Test ruolo errato",
          technicianId: dispatcher.user.id,
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/ruolo di tecnico/i);
    });

    it("rejects scheduledEnd that is before or equal to scheduledStart (returns 400)", async () => {
      const res = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          customerId: customerA.id,
          locationId: locationA.id,
          description: "Test date errate",
          scheduledStart: "2026-10-01T14:00:00.000Z",
          scheduledEnd: "2026-10-01T10:00:00.000Z", // End before start
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/successiva alla data di inizio/i);
    });
  });

  describe("4. Status State Machine & Controlled Transitions", () => {
    it("executes valid end-to-end status transitions correctly", async () => {
      // 1. Create -> 'nuovo'
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Flusso completo",
        priority: "media",
        status: "nuovo",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // 2. nuovo -> da_assegnare
      let res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "da_assegnare" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("da_assegnare");

      // 3. da_assegnare -> assegnato (with technician)
      res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "assegnato", technicianId: techA.user.id },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("assegnato");
      expect(res.data.technicianId).toBe(techA.user.id);

      // 4. assegnato -> in_viaggio
      res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "in_viaggio" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("in_viaggio");

      // 5. in_viaggio -> sul_posto
      res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "sul_posto" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("sul_posto");

      // 6. sul_posto -> in_lavorazione
      res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "in_lavorazione" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("in_lavorazione");

      // 7. in_lavorazione -> in_attesa
      res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "in_attesa", notes: "Attesa ricambio originale" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("in_attesa");

      // 8. in_attesa -> in_lavorazione
      res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "in_lavorazione" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("in_lavorazione");

      // 9. in_lavorazione -> completato (with actualHours)
      res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "completato", actualHours: 3.5, notes: "Intervento ultimato" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("completato");
      expect(res.data.actualHours).toBe(3.5);

      // 10. completato -> verificato
      res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "verificato" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("verificato");

      // Create linked report with signature and materials
      await db.createReport(companyA, {
        interventionId: created.id,
        customerId: created.customerId,
        locationId: created.locationId,
        status: "submitted",
        signatureBase64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        materialsStatus: "used",
        materialsUsed: [{ name: "Materiale Test", quantity: 1 }],
      });

      // 11. verificato -> pronto_per_fatturazione
      res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "pronto_per_fatturazione" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("pronto_per_fatturazione");

      // 12. pronto_per_fatturazione -> fatturato
      res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "fatturato" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("fatturato");
    });

    it("rejects illegal transitions (e.g. nuovo -> completato) with 400", async () => {
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Salto non valido",
        status: "nuovo",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "completato" },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/non consentita/i);
    });

    it("rejects completion when actual hours are missing or zero", async () => {
      const missingHoursIntervention = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Completamento senza ore",
        status: "in_lavorazione",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const missingHoursResponse = await apiRequest(
        `/api/v1/interventions/${missingHoursIntervention.id}/transition`,
        {
          method: "POST",
          cookies: adminA.cookies,
          headers: adminA.headers,
          body: { targetStatus: "completato" },
        }
      );

      expect(missingHoursResponse.status).toBe(400);
      expect(missingHoursResponse.data.detail).toMatch(/ore effettive maggiori di zero/i);
      const unchangedMissing = await db.getInterventionByIdAndCompany(missingHoursIntervention.id, companyA);
      expect(unchangedMissing?.status).toBe("in_lavorazione");

      const zeroHoursIntervention = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Completamento con zero ore",
        status: "in_lavorazione",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const zeroHoursResponse = await apiRequest(
        `/api/v1/interventions/${zeroHoursIntervention.id}/transition`,
        {
          method: "POST",
          cookies: adminA.cookies,
          headers: adminA.headers,
          body: { targetStatus: "completato", actualHours: 0 },
        }
      );

      expect(zeroHoursResponse.status).toBe(400);
      expect(zeroHoursResponse.data.detail).toMatch(/ore effettive maggiori di zero/i);
      const unchangedZero = await db.getInterventionByIdAndCompany(zeroHoursIntervention.id, companyA);
      expect(unchangedZero?.status).toBe("in_lavorazione");
    });

    it("rejects transition to 'assegnato' if no technician is assigned or provided", async () => {
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Senza tecnico",
        status: "da_assegnare",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: { targetStatus: "assegnato" }, // No technicianId provided!
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/richiede un tecnico valido/i);
    });
  });

  describe("5. RBAC Permissions Enforcement", () => {
    it("allows authorized read roles (responsabile_tecnico, dispatcher, technician, commerciale, amministrazione) to read", async () => {
      const roles: UserRole[] = [
        "responsabile_tecnico",
        "dispatcher",
        "technician",
        "commerciale",
        "amministrazione",
        "owner",
      ];

      for (const role of roles) {
        const user = await createTestUserAndLogin(companyA, role);
        const res = await apiRequest("/api/v1/interventions", {
          method: "GET",
          cookies: user.cookies,
        });
        expect(res.status).toBe(200);
      }
    });

    it("enforces that technician is read-only on write operations (POST, PUT, transition return 403)", async () => {
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Test RBAC Tech",
        status: "nuovo",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // POST create
      const resCreate = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: {
          customerId: customerA.id,
          locationId: locationA.id,
          description: "Tentativo creazione tech",
        },
      });
      expect(resCreate.status).toBe(403);

      // PUT update
      const resUpdate = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "PUT",
        cookies: techA.cookies,
        headers: techA.headers,
        body: { description: "Tentativo modifica tech" },
      });
      expect(resUpdate.status).toBe(403);

      // Transition
      const resTrans = await apiRequest(`/api/v1/interventions/${created.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: { targetStatus: "da_assegnare" },
      });
      expect(resTrans.status).toBe(403);
    });

    it("rejects role 'cliente' from both reading and writing interventions (returns 403)", async () => {
      const clientUser = await createTestUserAndLogin(companyA, "cliente");

      const resRead = await apiRequest("/api/v1/interventions", {
        method: "GET",
        cookies: clientUser.cookies,
      });
      expect(resRead.status).toBe(403);

      const resWrite = await apiRequest("/api/v1/interventions", {
        method: "POST",
        cookies: clientUser.cookies,
        headers: clientUser.headers,
        body: {
          customerId: customerA.id,
          locationId: locationA.id,
          description: "Tentativo cliente",
        },
      });
      expect(resWrite.status).toBe(403);
    });
  });

  describe("6. Pagination and Query Filters", () => {
    it.each([
      "/api/v1/interventions?cursor=not-a-valid-cursor",
      "/api/v1/interventions?cursor=aW52YWxpZDo6aWQ=",
    ])("rejects malformed pagination cursor: %s", async (url) => {
      const res = await apiRequest(url, {
        method: "GET",
        cookies: adminA.cookies,
      });

      expect(res.status).toBe(400);
      expect(res.data.detail).toMatch(/cursore di paginazione non valido/i);
    });

    it("filters interventions by status, priority, customerId, technicianId and search", async () => {
      await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Pompe di Calore",
        priority: "urgente",
        status: "nuovo",
        technicianId: techA.user.id,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Sostituzione Lampade LED",
        priority: "bassa",
        status: "completato",
        technicianId: techA2.user.id,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // Filter by search
      const resSearch = await apiRequest("/api/v1/interventions?search=Pompe", {
        method: "GET",
        cookies: adminA.cookies,
      });
      expect(resSearch.status).toBe(200);
      expect(resSearch.data.items.length).toBe(1);
      expect(resSearch.data.items[0].description).toContain("Pompe");

      // Filter by status
      const resStatus = await apiRequest("/api/v1/interventions?status=completato", {
        method: "GET",
        cookies: adminA.cookies,
      });
      expect(resStatus.status).toBe(200);
      expect(resStatus.data.items.length).toBe(1);
      expect(resStatus.data.items[0].status).toBe("completato");

      // Filter by priority
      const resPrio = await apiRequest("/api/v1/interventions?priority=urgente", {
        method: "GET",
        cookies: adminA.cookies,
      });
      expect(resPrio.status).toBe(200);
      expect(resPrio.data.items.length).toBe(1);
      expect(resPrio.data.items[0].priority).toBe("urgente");
    });

    it.each([
      "/api/v1/interventions?limit=1.5",
      "/api/v1/interventions?limit=10junk",
      "/api/v1/interventions?limit=1&limit=2",
      "/api/v1/interventions?limit=999999999999999999999",
    ])("rejects malformed pagination limit: %s", async (url) => {
      const res = await apiRequest(url, {
        method: "GET",
        cookies: adminA.cookies,
      });

      expect(res.status).toBe(400);
      expect(res.data.detail).toMatch(/limit non valido/i);
    });

    it("respects limit and returns stable cursor for pagination", async () => {
      for (let i = 1; i <= 5; i++) {
        await db.createIntervention(companyA, {
          customerId: customerA.id,
          locationId: locationA.id,
          description: `Intervento Paginated ${i}`,
          priority: "media",
          status: "nuovo",
          createdBy: adminA.user.id,
          updatedBy: adminA.user.id,
        });
      }

      const resPage1 = await apiRequest("/api/v1/interventions?limit=2", {
        method: "GET",
        cookies: adminA.cookies,
      });

      expect(resPage1.status).toBe(200);
      expect(resPage1.data.items.length).toBe(2);
      expect(resPage1.data.nextCursor).toBeDefined();
      expect(resPage1.data.totalCount).toBe(5); // totalCount does NOT decrease when limit=2 is applied

      const resPage2 = await apiRequest(`/api/v1/interventions?limit=2&cursor=${encodeURIComponent(resPage1.data.nextCursor)}`, {
        method: "GET",
        cookies: adminA.cookies,
      });

      expect(resPage2.status).toBe(200);
      expect(resPage2.data.items.length).toBe(2);
      // Items on page 2 should be different from page 1
      expect(resPage2.data.items[0].id).not.toBe(resPage1.data.items[0].id);
      expect(resPage2.data.totalCount).toBe(5); // Page 2 has the exact same totalCount as Page 1
    });

    it("ensures totalCount accurately reflects filtered dataset across paginated requests", async () => {
      // 3 urgent, 2 low
      for (let i = 1; i <= 3; i++) {
        await db.createIntervention(companyA, {
          customerId: customerA.id,
          locationId: locationA.id,
          description: `FilterCount Urgent ${i}`,
          priority: "urgente",
          status: "nuovo",
          createdBy: adminA.user.id,
          updatedBy: adminA.user.id,
        });
      }
      for (let i = 1; i <= 2; i++) {
        await db.createIntervention(companyA, {
          customerId: customerA.id,
          locationId: locationA.id,
          description: `FilterCount Low ${i}`,
          priority: "bassa",
          status: "nuovo",
          createdBy: adminA.user.id,
          updatedBy: adminA.user.id,
        });
      }

      const resFilteredPage1 = await apiRequest("/api/v1/interventions?priority=urgente&limit=2", {
        method: "GET",
        cookies: adminA.cookies,
      });

      expect(resFilteredPage1.status).toBe(200);
      expect(resFilteredPage1.data.items.length).toBe(2);
      expect(resFilteredPage1.data.totalCount).toBe(3); // 3 total matching the filter
      expect(resFilteredPage1.data.nextCursor).toBeDefined();

      const resFilteredPage2 = await apiRequest(`/api/v1/interventions?priority=urgente&limit=2&cursor=${resFilteredPage1.data.nextCursor}`, {
        method: "GET",
        cookies: adminA.cookies,
      });

      expect(resFilteredPage2.status).toBe(200);
      expect(resFilteredPage2.data.items.length).toBe(1);
      expect(resFilteredPage2.data.totalCount).toBe(3); // totalCount remains 3 on page 2
    });
  });

  describe("7. PostgreSQL Database Schema & Composite Constraint Verification (Migrations 003-006)", () => {
    it("verifies migrations contain all required composite unique and foreign key constraints", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const migrationsDir = path.resolve(process.cwd(), "server/migrations");
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
      const sqlContent = files.map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf-8")).join("\n\n");

      // Check composite unique constraints
      expect(sqlContent).toContain("uq_customers_id_company");
      expect(sqlContent).toContain("uq_locations_id_customer_company");
      expect(sqlContent).toContain("uq_assets_id_customer_location_company");
      expect(sqlContent).toContain("uq_users_id_company");

      // Check composite foreign key constraints on interventions
      expect(sqlContent).toContain("fk_interventions_customer_tenant_consistency");
      expect(sqlContent).toContain('FOREIGN KEY ("customerId", "companyId")');
      expect(sqlContent).toContain('REFERENCES customers (id, "companyId")');

      expect(sqlContent).toContain("fk_interventions_location_customer_tenant_consistency");
      expect(sqlContent).toContain('FOREIGN KEY ("locationId", "customerId", "companyId")');
      expect(sqlContent).toContain('REFERENCES locations (id, "customerId", "companyId")');

      expect(sqlContent).toContain("fk_interventions_asset_hierarchy_consistency");
      expect(sqlContent).toContain('FOREIGN KEY ("assetId", "customerId", "locationId", "companyId")');
      expect(sqlContent).toContain('REFERENCES assets (id, "customerId", "locationId", "companyId")');
      // Must specify column target for ON DELETE SET NULL to prevent wiping non-null tenant/customer/location columns
      expect(sqlContent).toContain('ON DELETE SET NULL ("assetId")');

      expect(sqlContent).toContain("fk_interventions_technician_tenant_consistency");
      expect(sqlContent).toContain('FOREIGN KEY ("technicianId", "companyId")');
      expect(sqlContent).toContain('REFERENCES users (id, "companyId")');
      // Must specify column target for ON DELETE SET NULL to prevent wiping non-null companyId
      expect(sqlContent).toContain('ON DELETE SET NULL ("technicianId")');

      // Verify that untargeted "ON DELETE SET NULL;" is NOT present for these composite constraints
      expect(sqlContent).not.toMatch(/fk_interventions_asset_hierarchy_consistency[\s\S]*?ON DELETE SET NULL;/);
      expect(sqlContent).not.toMatch(/fk_interventions_technician_tenant_consistency[\s\S]*?ON DELETE SET NULL;/);

      expect(sqlContent).toContain("fk_interventions_createdby_tenant_consistency");
      expect(sqlContent).toContain("fk_interventions_updatedby_tenant_consistency");
    });
  });

  describe("8. Field Technician Workflow & Mobile-First RBAC (P1.5)", () => {
    it("ensures technician GET /api/v1/interventions ONLY lists their assigned interventions, ignoring any attempted query manipulation", async () => {
      // Create 3 interventions
      // 1. Assigned to techA
      const intTechA = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento per Tecnico A1",
        status: "assegnato",
        technicianId: techA.user.id,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // 2. Assigned to techA2
      await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento per Tecnico A2",
        status: "assegnato",
        technicianId: techA2.user.id,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // 3. Unassigned
      await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Non Assegnato",
        status: "da_assegnare",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // techA requests list with no filters
      const resDefault = await apiRequest("/api/v1/interventions", {
        method: "GET",
        cookies: techA.cookies,
      });
      expect(resDefault.status).toBe(200);
      expect(resDefault.data.items.length).toBe(1);
      expect(resDefault.data.items[0].id).toBe(intTechA.id);
      expect(resDefault.data.items[0].technicianId).toBe(techA.user.id);

      // techA attempts to override filter with another technician's ID
      const resManipulated = await apiRequest(`/api/v1/interventions?technicianId=${techA2.user.id}`, {
        method: "GET",
        cookies: techA.cookies,
      });
      expect(resManipulated.status).toBe(200);
      expect(resManipulated.data.items.length).toBe(1);
      expect(resManipulated.data.items[0].id).toBe(intTechA.id);
    });

    it("ensures technician can ONLY get detail by ID for interventions assigned to them (returns 404 for unassigned or other tech)", async () => {
      const intTechA = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Assegnato A1",
        status: "assegnato",
        technicianId: techA.user.id,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const intTechA2 = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Assegnato A2",
        status: "assegnato",
        technicianId: techA2.user.id,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const intUnassigned = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Senza Tecnico",
        status: "nuovo",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // Access assigned intervention -> 200 OK with enriched data
      const resOk = await apiRequest(`/api/v1/interventions/${intTechA.id}`, {
        method: "GET",
        cookies: techA.cookies,
      });
      expect(resOk.status).toBe(200);
      expect(resOk.data.id).toBe(intTechA.id);
      expect(resOk.data.customerName).toBe(customerA.displayName);
      expect(resOk.data.locationName).toBe(locationA.name);

      // Access other technician's intervention -> 404 NotFound
      const resForbiddenOther = await apiRequest(`/api/v1/interventions/${intTechA2.id}`, {
        method: "GET",
        cookies: techA.cookies,
      });
      expect(resForbiddenOther.status).toBe(404);

      // Access unassigned intervention -> 404 NotFound
      const resForbiddenUnassigned = await apiRequest(`/api/v1/interventions/${intUnassigned.id}`, {
        method: "GET",
        cookies: techA.cookies,
      });
      expect(resForbiddenUnassigned.status).toBe(404);
    });

    it("allows technician to advance authorized operational transitions end-to-end and record hours and notes", async () => {
      const intervention = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Riparazione Climatizzatore",
        status: "assegnato",
        technicianId: techA.user.id,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // 1. assegnato -> in_viaggio
      let res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: { targetStatus: "in_viaggio" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("in_viaggio");

      // 2. in_viaggio -> sul_posto
      res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: { targetStatus: "sul_posto" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("sul_posto");

      // 3. sul_posto -> in_lavorazione
      res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: { targetStatus: "in_lavorazione" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("in_lavorazione");

      // 4. in_lavorazione -> in_attesa (with notes)
      res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: { targetStatus: "in_attesa", notes: "Attesa fornitura filtro specifico" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("in_attesa");
      expect(res.data.notes).toContain("Attesa fornitura filtro specifico");

      // 5. in_attesa -> in_lavorazione (resume)
      res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: { targetStatus: "in_lavorazione" },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("in_lavorazione");

      // 6. in_lavorazione -> completato (with actualHours and notes)
      res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: {
          targetStatus: "completato",
          actualHours: 3.5,
          notes: "Filtro installato e circuito igienizzato",
        },
      });
      expect(res.status).toBe(200);
      expect(res.data.status).toBe("completato");
      expect(res.data.actualHours).toBe(3.5);
      expect(res.data.notes).toContain("Attesa fornitura filtro specifico");
      expect(res.data.notes).toContain("Filtro installato e circuito igienizzato");
    });

    it("prevents technician from executing administrative transitions (verificato, pronto_per_fatturazione, fatturato) with 403", async () => {
      const intervention = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento da verificare",
        status: "completato",
        technicianId: techA.user.id,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // Attempt completato -> verificato
      const resVerificato = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: { targetStatus: "verificato" },
      });
      expect(resVerificato.status).toBe(403);

      // Attempt to pronto_per_fatturazione
      const resFattura = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: { targetStatus: "pronto_per_fatturazione" },
      });
      expect(resFattura.status).toBe(403);
    });

    it("prevents technician from assigning or reassigning technicians during transition with 403", async () => {
      const intervention = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Assegnato A1",
        status: "assegnato",
        technicianId: techA.user.id,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: {
          targetStatus: "in_viaggio",
          technicianId: techA2.user.id, // Attempt to reassign
        },
      });

      expect(res.status).toBe(403);
      expect(res.data.detail || res.data.error).toMatch(/non può assegnare o riassegnare/i);
    });

    it("prevents technician from transitioning an intervention assigned to another technician with 403", async () => {
      const intervention = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Assegnato A2",
        status: "assegnato",
        technicianId: techA2.user.id,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: { targetStatus: "in_viaggio" },
      });

      expect(res.status).toBe(403);
    });

    it("rejects technician actualHours during 'assegnato -> in_viaggio' with 400 and preserves state/hours", async () => {
      const intervention = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Test Ore In Viaggio",
        status: "assegnato",
        technicianId: techA.user.id,
        actualHours: 1.0,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // 1. Technician cannot send actualHours during assegnato -> in_viaggio
      const res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: {
          targetStatus: "in_viaggio",
          actualHours: 2.5,
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/ore effettive/i);

      // 3. Rejected request preserves both state and previously recorded actualHours
      const check = await db.getInterventionByIdAndCompany(intervention.id, companyA);
      expect(check?.status).toBe("assegnato");
      expect(check?.actualHours).toBe(1.0);
    });

    it("rejects technician actualHours during 'in_lavorazione -> in_attesa' with 400 and preserves state/hours", async () => {
      const intervention = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Test Ore In Attesa",
        status: "in_lavorazione",
        technicianId: techA.user.id,
        actualHours: 2.0,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // 2. Technician cannot send actualHours during in_lavorazione -> in_attesa
      const res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: {
          targetStatus: "in_attesa",
          actualHours: 4.0,
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/ore effettive/i);

      // 3. State and hours unchanged
      const check = await db.getInterventionByIdAndCompany(intervention.id, companyA);
      expect(check?.status).toBe("in_lavorazione");
      expect(check?.actualHours).toBe(2.0);
    });

    it("allows technician to record valid actualHours when transitioning to 'completato' (or 'in_lavorazione')", async () => {
      const intervention = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Completamento Ore Valide",
        status: "in_lavorazione",
        technicianId: techA.user.id,
        actualHours: 1.5,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // 4. Technician can record valid actualHours on transition to completato
      const res = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: {
          targetStatus: "completato",
          actualHours: 5.0,
          notes: "Tutto completato e funzionante",
        },
      });

      expect(res.status).toBe(200);
      expect(res.data.status).toBe("completato");
      expect(res.data.actualHours).toBe(5.0);

      const check = await db.getInterventionByIdAndCompany(intervention.id, companyA);
      expect(check?.status).toBe("completato");
      expect(check?.actualHours).toBe(5.0);
    });

    it("rejects negative and non-finite actualHours with 400 during transitions", async () => {
      const intervention = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento Ore Negative Non-finite",
        status: "in_lavorazione",
        technicianId: techA.user.id,
        actualHours: 2.0,
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      // 5a. Negative actualHours
      const resNegative = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: {
          targetStatus: "completato",
          actualHours: -3.5,
        },
      });
      expect(resNegative.status).toBe(400);
      expect(resNegative.data.detail || resNegative.data.error).toMatch(/comprese tra 0 e 9999,99/i);

      // 5b. Non-finite / invalid actualHours (string representing NaN/non-number in JSON)
      const resNonFinite = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: {
          targetStatus: "completato",
          actualHours: "non-un-numero",
        },
      });
      expect(resNonFinite.status).toBe(400);
      expect(resNonFinite.data.detail || resNonFinite.data.error).toMatch(/comprese tra 0 e 9999,99/i);

      // 5c. Above the PostgreSQL NUMERIC(6,2) upper bound
      const resAboveMaximum = await apiRequest(`/api/v1/interventions/${intervention.id}/transition`, {
        method: "POST",
        cookies: techA.cookies,
        headers: techA.headers,
        body: { targetStatus: "completato", actualHours: 10000 },
      });
      expect(resAboveMaximum.status).toBe(400);
      expect(resAboveMaximum.data.detail || resAboveMaximum.data.error).toMatch(/comprese tra 0 e 9999,99/i);

      // Verify no changes were made to the record
      const check = await db.getInterventionByIdAndCompany(intervention.id, companyA);
      expect(check?.status).toBe("in_lavorazione");
      expect(check?.actualHours).toBe(2.0);
    });
  });

  describe("9. Single-Date Validation in PUT Updates & Query Filter Validation", () => {
    it("rejects invalid scheduledStart on PUT update when scheduledEnd is undefined or null (returns 400)", async () => {
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Test update data inizio non valida",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "PUT",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          scheduledStart: "data-non-valida",
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/data inizio/i);

      const unchanged = await db.getInterventionByIdAndCompany(created.id, companyA);
      expect(unchanged?.scheduledStart).toBeUndefined();
    });

    it("rejects invalid scheduledEnd on PUT update when scheduledStart is undefined or null (returns 400)", async () => {
      const created = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Test update data fine non valida",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const res = await apiRequest(`/api/v1/interventions/${created.id}`, {
        method: "PUT",
        cookies: adminA.cookies,
        headers: adminA.headers,
        body: {
          scheduledEnd: "data-non-valida",
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.detail || res.data.error).toMatch(/data fine/i);

      const unchanged = await db.getInterventionByIdAndCompany(created.id, companyA);
      expect(unchanged?.scheduledEnd).toBeUndefined();
    });

    it("rejects invalid scheduledStartFrom or scheduledStartTo in GET list query filters (returns 400)", async () => {
      const resFrom = await apiRequest("/api/v1/interventions?scheduledStartFrom=invalid-date", {
        method: "GET",
        cookies: adminA.cookies,
      });
      expect(resFrom.status).toBe(400);
      expect(resFrom.data.detail || resFrom.data.error).toMatch(/data/i);

      const resTo = await apiRequest("/api/v1/interventions?scheduledStartTo=invalid-date", {
        method: "GET",
        cookies: adminA.cookies,
      });
      expect(resTo.status).toBe(400);
      expect(resTo.data.detail || resTo.data.error).toMatch(/data/i);
    });

    it("rejects inverted scheduledStartFrom and scheduledStartTo date range in GET list query filters (returns 400)", async () => {
      const resInverted = await apiRequest("/api/v1/interventions?scheduledStartFrom=2026-10-05T00:00:00.000Z&scheduledStartTo=2026-10-01T00:00:00.000Z", {
        method: "GET",
        cookies: adminA.cookies,
      });
      expect(resInverted.status).toBe(400);
      expect(resInverted.data.detail || resInverted.data.error).toMatch(/antecedente/i);
    });
  });

  describe("10. Database read failure handling for intervention enrichment", () => {
    it("fails the intervention list request when customer enrichment cannot be read", async () => {
      await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento per test errore lettura cliente",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const customerLookup = vi
        .spyOn(db, "getCustomersByIdsAndCompany")
        .mockRejectedValueOnce(new Error("simulated database read failure"));

      try {
        const response = await apiRequest("/api/v1/interventions", {
          cookies: adminA.cookies,
        });

        expect(response.status).toBe(500);
        expect(response.data.detail).toBe("Errore interno del server.");
      } finally {
        customerLookup.mockRestore();
      }
    });

    it("fails the intervention detail request when customer enrichment cannot be read", async () => {
      const intervention = await db.createIntervention(companyA, {
        customerId: customerA.id,
        locationId: locationA.id,
        description: "Intervento per test errore lettura dettaglio",
        createdBy: adminA.user.id,
        updatedBy: adminA.user.id,
      });

      const customerLookup = vi
        .spyOn(db, "getCustomerByIdAndCompany")
        .mockRejectedValueOnce(new Error("simulated database read failure"));

      try {
        const response = await apiRequest(`/api/v1/interventions/${intervention.id}`, {
          cookies: adminA.cookies,
        });

        expect(response.status).toBe(500);
        expect(response.data.detail).toBe("Errore interno del server.");
      } finally {
        customerLookup.mockRestore();
      }
    });
  });

  it("rejects repeated scalar list filters with a client error", async () => {
    const response = await apiRequest("/api/v1/interventions?status=nuovo&status=completato", {
      cookies: adminA.cookies,
    });
    expect(response.status).toBe(400);
  });

});

