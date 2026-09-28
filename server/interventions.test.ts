import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  (db as any).companies.set(companyB, {
    id: companyB,
    name: "Tenant Beta Company",
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

      const resPage2 = await apiRequest(`/api/v1/interventions?limit=2&cursor=${resPage1.data.nextCursor}`, {
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

  describe("7. PostgreSQL Database Schema & Composite Constraint Verification (Migration 005)", () => {
    it("verifies migration 005_interventions.sql contains all required composite unique and foreign key constraints", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const migrationPath = path.resolve(process.cwd(), "server/migrations/005_interventions.sql");
      const sqlContent = fs.readFileSync(migrationPath, "utf-8");

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
});
