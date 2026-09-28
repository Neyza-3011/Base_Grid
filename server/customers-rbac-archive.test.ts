import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { tokenStore } from "./token-store";
import { generateTokens, generateCsrfToken, hashPassword } from "./security";
import { UserRole } from "./types";

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";
  const { config } = await import("./config");
  config.EMAIL_VERIFICATION_ENABLED = false;
  db.seedInitialData?.();
  tokenStore.setAvailability(true);

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
  email = `${role}-${Math.random().toString(36).slice(2, 7)}@example.com`
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
    isActive: true,
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
  const reqHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...(options.headers || {}),
  };

  if (options.cookies) {
    reqHeaders["cookie"] = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: reqHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get("content-type") || "";
  let data: any = null;
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data, headers: res.headers };
}

describe("Customers & Locations Server-Side RBAC, Archive/Reactivate & Tenant Isolation", () => {
  const companyA = "comp-tenant-a";
  const companyB = "comp-tenant-b";

  beforeEach(async () => {
    (db as any).companies.set(companyA, {
      id: companyA,
      name: "Tenant A Company",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    (db as any).companies.set(companyB, {
      id: companyB,
      name: "Tenant B Company",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe("Server-Side RBAC Matrix", () => {
    const writeRoles: UserRole[] = [
      "owner",
      "admin",
      "responsabile_tecnico",
      "dispatcher",
      "commerciale",
      "amministrazione",
      "superadmin",
    ];

    it.each(writeRoles)("allows write role '%s' to create, update, archive and reactivate customer", async (role) => {
      const auth = await createTestUserAndLogin(companyA, role);

      // Create
      const createRes = await apiRequest("/api/v1/customers", {
        method: "POST",
        body: { displayName: `Customer for ${role}` },
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(createRes.status).toBe(201);
      const customerId = createRes.data.id;

      // Update
      const updateRes = await apiRequest(`/api/v1/customers/${customerId}`, {
        method: "PUT",
        body: { displayName: `Updated Customer for ${role}` },
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(updateRes.status).toBe(200);

      // Archive
      const archiveRes = await apiRequest(`/api/v1/customers/${customerId}/archive`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(archiveRes.status).toBe(200);
      expect(archiveRes.data.isActive).toBe(false);

      // Reactivate
      const reactivateRes = await apiRequest(`/api/v1/customers/${customerId}/reactivate`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.data.isActive).toBe(true);
    });

    it("enforces read-only access for 'technician' role (GET allowed, mutations return 403)", async () => {
      const adminAuth = await createTestUserAndLogin(companyA, "admin");
      const techAuth = await createTestUserAndLogin(companyA, "technician");

      // Setup customer & location as admin
      const cust = await db.createCustomer(companyA, { displayName: "ACME Corp", isActive: true });
      const loc = await db.createLocation(companyA, cust.id, { name: "Sede Centrale", address: "Via Roma", city: "Milano" });

      // Technician CAN read customers list
      const listRes = await apiRequest("/api/v1/customers", { cookies: techAuth.cookies });
      expect(listRes.status).toBe(200);

      // Technician CAN read single customer
      const getCustRes = await apiRequest(`/api/v1/customers/${cust.id}`, { cookies: techAuth.cookies });
      expect(getCustRes.status).toBe(200);

      // Technician CAN read locations list
      const listLocRes = await apiRequest(`/api/v1/customers/${cust.id}/locations`, { cookies: techAuth.cookies });
      expect(listLocRes.status).toBe(200);

      // Technician CAN read single location
      const getLocRes = await apiRequest(`/api/v1/customers/locations/${loc.id}`, { cookies: techAuth.cookies });
      expect(getLocRes.status).toBe(200);

      // Technician CANNOT create customer -> 403
      const createCustRes = await apiRequest("/api/v1/customers", {
        method: "POST",
        body: { displayName: "Malicious Tech Customer" },
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(createCustRes.status).toBe(403);

      // Technician CANNOT update customer -> 403
      const updateCustRes = await apiRequest(`/api/v1/customers/${cust.id}`, {
        method: "PUT",
        body: { displayName: "Hacked Customer" },
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(updateCustRes.status).toBe(403);

      // Technician CANNOT archive customer -> 403
      const archCustRes = await apiRequest(`/api/v1/customers/${cust.id}/archive`, {
        method: "POST",
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(archCustRes.status).toBe(403);

      // Technician CANNOT reactivate customer -> 403
      const reactCustRes = await apiRequest(`/api/v1/customers/${cust.id}/reactivate`, {
        method: "POST",
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(reactCustRes.status).toBe(403);

      // Technician CANNOT create location -> 403
      const createLocRes = await apiRequest(`/api/v1/customers/${cust.id}/locations`, {
        method: "POST",
        body: { name: "Tech Location", address: "Via X", city: "Torino" },
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(createLocRes.status).toBe(403);

      // Technician CANNOT update location -> 403
      const updateLocRes = await apiRequest(`/api/v1/customers/locations/${loc.id}`, {
        method: "PUT",
        body: { name: "Hacked Location" },
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(updateLocRes.status).toBe(403);

      // Technician CANNOT archive location -> 403
      const archLocRes = await apiRequest(`/api/v1/customers/locations/${loc.id}/archive`, {
        method: "POST",
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(archLocRes.status).toBe(403);

      // Technician CANNOT reactivate location -> 403
      const reactLocRes = await apiRequest(`/api/v1/customers/locations/${loc.id}/reactivate`, {
        method: "POST",
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(reactLocRes.status).toBe(403);
    });

    it("rejects 'cliente' role from all internal Customer/Location APIs (403)", async () => {
      const clientAuth = await createTestUserAndLogin(companyA, "cliente");
      const cust = await db.createCustomer(companyA, { displayName: "ACME Corp", isActive: true });
      const loc = await db.createLocation(companyA, cust.id, { name: "Sede", address: "Via Roma", city: "Milano" });

      // GET customers -> 403
      const getList = await apiRequest("/api/v1/customers", { cookies: clientAuth.cookies });
      expect(getList.status).toBe(403);

      // GET single customer -> 403
      const getCust = await apiRequest(`/api/v1/customers/${cust.id}`, { cookies: clientAuth.cookies });
      expect(getCust.status).toBe(403);

      // POST customer -> 403
      const postCust = await apiRequest("/api/v1/customers", {
        method: "POST",
        body: { displayName: "Cliente Attempt" },
        cookies: clientAuth.cookies,
        headers: clientAuth.headers,
      });
      expect(postCust.status).toBe(403);

      // GET locations -> 403
      const getLocs = await apiRequest(`/api/v1/customers/${cust.id}/locations`, { cookies: clientAuth.cookies });
      expect(getLocs.status).toBe(403);

      // GET single location -> 403
      const getLoc = await apiRequest(`/api/v1/customers/locations/${loc.id}`, { cookies: clientAuth.cookies });
      expect(getLoc.status).toBe(403);
    });

    it("rejects unauthenticated requests (401)", async () => {
      const res = await apiRequest("/api/v1/customers");
      expect(res.status).toBe(401);
    });
  });

  describe("Archive & Reactivate Customer Domain & Safety", () => {
    it("archives and reactivates a customer without deleting or deleting locations", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");

      const cust = await db.createCustomer(companyA, { displayName: "Test Customer", isActive: true });
      const loc = await db.createLocation(companyA, cust.id, { name: "Cantiere 1", address: "Via 1", city: "Milano" });

      // Archive customer
      const archRes = await apiRequest(`/api/v1/customers/${cust.id}/archive`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(archRes.status).toBe(200);
      expect(archRes.data.isActive).toBe(false);

      // Check customer in DB: isActive is false, record still exists, updatedAt updated
      const inDb = await db.getCustomerByIdAndCompany(cust.id, companyA);
      expect(inDb).not.toBeNull();
      expect(inDb?.isActive).toBe(false);
      expect(inDb?.displayName).toBe("Test Customer");

      // Verify location is NOT deleted
      const locInDb = await db.getLocationByIdAndCompany(loc.id, companyA);
      expect(locInDb).not.toBeNull();
      expect(locInDb?.name).toBe("Cantiere 1");

      // Reactivate customer
      const reactRes = await apiRequest(`/api/v1/customers/${cust.id}/reactivate`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(reactRes.status).toBe(200);
      expect(reactRes.data.isActive).toBe(true);

      const reactInDb = await db.getCustomerByIdAndCompany(cust.id, companyA);
      expect(reactInDb?.isActive).toBe(true);
    });
  });

  describe("Archive & Reactivate Location Domain & Safety", () => {
    it("archives and reactivates a location without deleting", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");

      const cust = await db.createCustomer(companyA, { displayName: "Test Customer", isActive: true });
      const loc = await db.createLocation(companyA, cust.id, { name: "Cantiere A", address: "Via A", city: "Milano" });

      // Archive location
      const archRes = await apiRequest(`/api/v1/customers/locations/${loc.id}/archive`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(archRes.status).toBe(200);
      expect(archRes.data.isActive).toBe(false);

      const locInDb = await db.getLocationByIdAndCompany(loc.id, companyA);
      expect(locInDb?.isActive).toBe(false);

      // Reactivate location
      const reactRes = await apiRequest(`/api/v1/customers/locations/${loc.id}/reactivate`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(reactRes.status).toBe(200);
      expect(reactRes.data.isActive).toBe(true);

      const reactInDb = await db.getLocationByIdAndCompany(loc.id, companyA);
      expect(reactInDb?.isActive).toBe(true);
    });
  });

  describe("Cross-Tenant Isolation on Customers & Locations", () => {
    it("prevents Tenant B from reading, updating, archiving or reactivating Tenant A's customer", async () => {
      const authA = await createTestUserAndLogin(companyA, "admin");
      const authB = await createTestUserAndLogin(companyB, "admin");

      const custA = await db.createCustomer(companyA, { displayName: "Tenant A Secret Customer" });

      // Tenant B reads single customer -> 404
      const getRes = await apiRequest(`/api/v1/customers/${custA.id}`, { cookies: authB.cookies });
      expect(getRes.status).toBe(404);

      // Tenant B updates customer -> 404
      const updateRes = await apiRequest(`/api/v1/customers/${custA.id}`, {
        method: "PUT",
        body: { displayName: "Hijacked Customer" },
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(updateRes.status).toBe(404);

      // Tenant B archives customer -> 404
      const archRes = await apiRequest(`/api/v1/customers/${custA.id}/archive`, {
        method: "POST",
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(archRes.status).toBe(404);

      // Tenant B reactivates customer -> 404
      const reactRes = await apiRequest(`/api/v1/customers/${custA.id}/reactivate`, {
        method: "POST",
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(reactRes.status).toBe(404);
    });

    it("prevents Tenant B from reading, updating, archiving or reactivating Tenant A's location", async () => {
      const authA = await createTestUserAndLogin(companyA, "admin");
      const authB = await createTestUserAndLogin(companyB, "admin");

      const custA = await db.createCustomer(companyA, { displayName: "Tenant A Customer" });
      const locA = await db.createLocation(companyA, custA.id, { name: "Tenant A Location", address: "Via A", city: "Milano" });

      // Tenant B reads location -> 404
      const getRes = await apiRequest(`/api/v1/customers/locations/${locA.id}`, { cookies: authB.cookies });
      expect(getRes.status).toBe(404);

      // Tenant B updates location -> 404
      const updateRes = await apiRequest(`/api/v1/customers/locations/${locA.id}`, {
        method: "PUT",
        body: { name: "Hijacked Location" },
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(updateRes.status).toBe(404);

      // Tenant B archives location -> 404
      const archRes = await apiRequest(`/api/v1/customers/locations/${locA.id}/archive`, {
        method: "POST",
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(archRes.status).toBe(404);

      // Tenant B reactivates location -> 404
      const reactRes = await apiRequest(`/api/v1/customers/locations/${locA.id}/reactivate`, {
        method: "POST",
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(reactRes.status).toBe(404);
    });
  });

  describe("activeOnly Filter Semantics", () => {
    it("filters active customers when activeOnly=true, includes archived when activeOnly=false", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");

      const activeCust = await db.createCustomer(companyA, { displayName: "Attivo 1", isActive: true });
      const archivedCust = await db.createCustomer(companyA, { displayName: "Archiviato 1", isActive: false });

      // activeOnly=true
      const activeRes = await apiRequest("/api/v1/customers?activeOnly=true", { cookies: auth.cookies });
      expect(activeRes.status).toBe(200);
      const activeIds = activeRes.data.map((c: any) => c.id);
      expect(activeIds).toContain(activeCust.id);
      expect(activeIds).not.toContain(archivedCust.id);

      // activeOnly=false
      const allRes = await apiRequest("/api/v1/customers?activeOnly=false", { cookies: auth.cookies });
      expect(allRes.status).toBe(200);
      const allIds = allRes.data.map((c: any) => c.id);
      expect(allIds).toContain(activeCust.id);
      expect(allIds).toContain(archivedCust.id);
    });

    it("filters active locations when activeOnly=true, includes archived when activeOnly=false", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");

      const cust = await db.createCustomer(companyA, { displayName: "Test Multi Loc" });
      const activeLoc = await db.createLocation(companyA, cust.id, { name: "Sede Attiva", address: "Via 1", city: "Milano", isActive: true });
      const archivedLoc = await db.createLocation(companyA, cust.id, { name: "Sede Archiviata", address: "Via 2", city: "Milano", isActive: false });

      // activeOnly=true
      const activeRes = await apiRequest(`/api/v1/customers/${cust.id}/locations?activeOnly=true`, { cookies: auth.cookies });
      expect(activeRes.status).toBe(200);
      const activeIds = activeRes.data.map((l: any) => l.id);
      expect(activeIds).toContain(activeLoc.id);
      expect(activeIds).not.toContain(archivedLoc.id);

      // activeOnly=false
      const allRes = await apiRequest(`/api/v1/customers/${cust.id}/locations?activeOnly=false`, { cookies: auth.cookies });
      expect(allRes.status).toBe(200);
      const allIds = allRes.data.map((l: any) => l.id);
      expect(allIds).toContain(activeLoc.id);
      expect(allIds).toContain(archivedLoc.id);
    });
  });

  describe("Canonical Location Item Endpoints (/api/v1/locations/:id)", () => {
    it("1 & 7. supports GET canonical /api/v1/locations/:id and customer locations collection", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");
      const cust = await db.createCustomer(companyA, { displayName: "Acme Corp" });
      const loc = await db.createLocation(companyA, cust.id, {
        name: "Cantiere Centrale",
        address: "Via Roma 1",
        city: "Milano",
      });

      // Collection route works
      const collRes = await apiRequest(`/api/v1/customers/${cust.id}/locations`, { cookies: auth.cookies });
      expect(collRes.status).toBe(200);
      expect(collRes.data.length).toBe(1);
      expect(collRes.data[0].id).toBe(loc.id);

      // Canonical item GET works
      const getRes = await apiRequest(`/api/v1/locations/${loc.id}`, { cookies: auth.cookies });
      expect(getRes.status).toBe(200);
      expect(getRes.data.id).toBe(loc.id);
      expect(getRes.data.name).toBe("Cantiere Centrale");
      expect(getRes.data.companyId).toBeUndefined(); // companyId not leaked
    });

    it("2. supports PUT canonical /api/v1/locations/:id", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");
      const cust = await db.createCustomer(companyA, { displayName: "Acme Corp" });
      const loc = await db.createLocation(companyA, cust.id, {
        name: "Sede Iniziale",
        address: "Via Roma 1",
        city: "Milano",
      });

      const updateRes = await apiRequest(`/api/v1/locations/${loc.id}`, {
        method: "PUT",
        body: { name: "Sede Modificata", notes: "Nuova nota" },
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(updateRes.status).toBe(200);
      expect(updateRes.data.name).toBe("Sede Modificata");
      expect(updateRes.data.notes).toBe("Nuova nota");

      // Verify persistence via GET
      const verifyRes = await apiRequest(`/api/v1/locations/${loc.id}`, { cookies: auth.cookies });
      expect(verifyRes.data.name).toBe("Sede Modificata");
    });

    it("3 & 4. supports POST canonical /api/v1/locations/:id/archive and /reactivate", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");
      const cust = await db.createCustomer(companyA, { displayName: "Acme Corp" });
      const loc = await db.createLocation(companyA, cust.id, {
        name: "Sede Operativa",
        address: "Via Garibaldi 10",
        city: "Torino",
        isActive: true,
      });

      // Archive via canonical endpoint
      const archRes = await apiRequest(`/api/v1/locations/${loc.id}/archive`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(archRes.status).toBe(200);
      expect(archRes.data.isActive).toBe(false);

      // Reactivate via canonical endpoint
      const reactRes = await apiRequest(`/api/v1/locations/${loc.id}/reactivate`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(reactRes.status).toBe(200);
      expect(reactRes.data.isActive).toBe(true);
    });

    it("5. enforces RBAC on canonical endpoints (technician read-only, cliente forbidden)", async () => {
      const techAuth = await createTestUserAndLogin(companyA, "technician");
      const clientAuth = await createTestUserAndLogin(companyA, "cliente");
      const cust = await db.createCustomer(companyA, { displayName: "Acme Corp" });
      const loc = await db.createLocation(companyA, cust.id, {
        name: "Cantiere Nord",
        address: "Via Po 5",
        city: "Torino",
      });

      // Technician can read
      const techGet = await apiRequest(`/api/v1/locations/${loc.id}`, { cookies: techAuth.cookies });
      expect(techGet.status).toBe(200);

      // Technician cannot write (403)
      const techPut = await apiRequest(`/api/v1/locations/${loc.id}`, {
        method: "PUT",
        body: { name: "Tech Exploit" },
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(techPut.status).toBe(403);

      const techArch = await apiRequest(`/api/v1/locations/${loc.id}/archive`, {
        method: "POST",
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(techArch.status).toBe(403);

      // Cliente forbidden completely (403)
      const cliGet = await apiRequest(`/api/v1/locations/${loc.id}`, { cookies: clientAuth.cookies });
      expect(cliGet.status).toBe(403);
    });

    it("6. prevents cross-tenant access on canonical endpoints", async () => {
      const authB = await createTestUserAndLogin(companyB, "admin");
      const custA = await db.createCustomer(companyA, { displayName: "Tenant A Customer" });
      const locA = await db.createLocation(companyA, custA.id, {
        name: "Tenant A Location",
        address: "Via Roma",
        city: "Milano",
      });

      // Tenant B GET -> 404
      const getRes = await apiRequest(`/api/v1/locations/${locA.id}`, { cookies: authB.cookies });
      expect(getRes.status).toBe(404);

      // Tenant B PUT -> 404
      const putRes = await apiRequest(`/api/v1/locations/${locA.id}`, {
        method: "PUT",
        body: { name: "Hijacked" },
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(putRes.status).toBe(404);

      // Tenant B archive -> 404
      const archRes = await apiRequest(`/api/v1/locations/${locA.id}/archive`, {
        method: "POST",
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(archRes.status).toBe(404);

      // Tenant B reactivate -> 404
      const reactRes = await apiRequest(`/api/v1/locations/${locA.id}/reactivate`, {
        method: "POST",
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(reactRes.status).toBe(404);
    });

    it("8. ensures legacy alias /api/v1/customers/locations/:id continues to work equivalently", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");
      const cust = await db.createCustomer(companyA, { displayName: "Acme Corp" });
      const loc = await db.createLocation(companyA, cust.id, {
        name: "Sede Alias Test",
        address: "Via Duomo 1",
        city: "Milano",
      });

      // Legacy GET works
      const legacyGet = await apiRequest(`/api/v1/customers/locations/${loc.id}`, { cookies: auth.cookies });
      expect(legacyGet.status).toBe(200);
      expect(legacyGet.data.name).toBe("Sede Alias Test");

      // Legacy PUT works
      const legacyPut = await apiRequest(`/api/v1/customers/locations/${loc.id}`, {
        method: "PUT",
        body: { name: "Sede Alias Aggiornata" },
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(legacyPut.status).toBe(200);
      expect(legacyPut.data.name).toBe("Sede Alias Aggiornata");

      // Legacy archive works
      const legacyArch = await apiRequest(`/api/v1/customers/locations/${loc.id}/archive`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(legacyArch.status).toBe(200);
      expect(legacyArch.data.isActive).toBe(false);

      // Legacy reactivate works
      const legacyReact = await apiRequest(`/api/v1/customers/locations/${loc.id}/reactivate`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(legacyReact.status).toBe(200);
      expect(legacyReact.data.isActive).toBe(true);
    });
  });
});
