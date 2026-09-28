import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "http";
import fs from "fs";
import path from "path";
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
  const method = options.method || "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  if (options.cookies) {
    headers["Cookie"] = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get("content-type");
  let data: any = null;
  if (contentType && contentType.includes("application/json")) {
    data = await res.json();
  }

  return {
    status: res.status,
    data,
  };
}

describe("P1.3 Assets / Site Equipment Suite", () => {
  it("verifies migration 004_assets.sql exists and enforces composite foreign keys", () => {
    const migrationPath = path.resolve(process.cwd(), "server/migrations/004_assets.sql");
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, "utf-8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS assets");
    expect(sql).toContain('"companyId" VARCHAR(255) NOT NULL REFERENCES companies(id)');
    expect(sql).toContain('"customerId" VARCHAR(255) NOT NULL REFERENCES customers(id)');
    expect(sql).toContain('"locationId" VARCHAR(255) NOT NULL REFERENCES locations(id)');
    expect(sql).toContain("fk_assets_tenant_location_consistency");
    expect(sql).toContain('FOREIGN KEY ("locationId", "customerId", "companyId")');
    expect(sql).toContain('REFERENCES locations (id, "customerId", "companyId")');
  });

  describe("Relational Consistency (Customer -> Location -> Asset)", () => {
    it("successfully creates an asset when Customer and Location belong together", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");
      const customer = await db.createCustomer(companyA, { displayName: "Alpha Corp" });
      const location = await db.createLocation(companyA, customer.id, {
        name: "Sede Milano",
        address: "Via Montenapoleone 1",
        city: "Milano",
      });

      const res = await apiRequest("/api/v1/assets", {
        method: "POST",
        body: {
          customerId: customer.id,
          locationId: location.id,
          assetType: "fotovoltaico",
          name: "Impianto Solare Tetto",
          manufacturer: "SolarEdge",
          model: "SE10K",
          serialNumber: "SN-998822",
          notes: "10 kWp su falda sud",
        },
        cookies: auth.cookies,
        headers: auth.headers,
      });

      expect(res.status).toBe(201);
      expect(res.data.id).toBeDefined();
      expect(res.data.name).toBe("Impianto Solare Tetto");
      expect(res.data.customerId).toBe(customer.id);
      expect(res.data.locationId).toBe(location.id);
      expect(res.data.status).toBe("operativo");
      expect(res.data.isActive).toBe(true);
      expect(res.data.companyId).toBeUndefined(); // companyId not leaked
    });

    it("rejects asset creation if Location belongs to a different Customer (400)", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");
      const customer1 = await db.createCustomer(companyA, { displayName: "Customer 1" });
      const customer2 = await db.createCustomer(companyA, { displayName: "Customer 2" });
      const locationOfCust2 = await db.createLocation(companyA, customer2.id, {
        name: "Sede Cust 2",
        address: "Via Roma 2",
        city: "Roma",
      });

      // Attempting Customer 1 + Location of Customer 2
      const res = await apiRequest("/api/v1/assets", {
        method: "POST",
        body: {
          customerId: customer1.id,
          locationId: locationOfCust2.id,
          assetType: "quadro",
          name: "Quadro Illecito",
        },
        cookies: auth.cookies,
        headers: auth.headers,
      });

      expect(res.status).toBe(400);
      expect(res.data.detail).toContain("non appartiene al cliente indicato");
    });

    it("rejects asset creation if Location belongs to a different Tenant (404)", async () => {
      const authA = await createTestUserAndLogin(companyA, "admin");
      const customerA = await db.createCustomer(companyA, { displayName: "Customer A" });

      const customerB = await db.createCustomer(companyB, { displayName: "Customer B" });
      const locationB = await db.createLocation(companyB, customerB.id, {
        name: "Sede Tenant B",
        address: "Via B 1",
        city: "Bari",
      });

      // Tenant A attempts to use Tenant B's location
      const res = await apiRequest("/api/v1/assets", {
        method: "POST",
        body: {
          customerId: customerA.id,
          locationId: locationB.id,
          assetType: "wallbox",
          name: "Wallbox Cross Tenant",
        },
        cookies: authA.cookies,
        headers: authA.headers,
      });

      expect(res.status).toBe(404);
      expect(res.data.detail).toContain("non trovato");
    });

    it("ignores any client-provided companyId and assigns authenticated user companyId", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");
      const customer = await db.createCustomer(companyA, { displayName: "Alpha Corp" });
      const location = await db.createLocation(companyA, customer.id, {
        name: "Sede Centro",
        address: "Via Po 10",
        city: "Torino",
      });

      const res = await apiRequest("/api/v1/assets", {
        method: "POST",
        body: {
          companyId: "hacked-company-id-999", // Client attempt to override companyId
          customerId: customer.id,
          locationId: location.id,
          assetType: "batteria",
          name: "Accumulo Tesla",
        },
        cookies: auth.cookies,
        headers: auth.headers,
      });

      expect(res.status).toBe(201);
      // Verify record is stored under companyA, not hacked-company-id
      const storedAsset = await db.getAssetByIdAndCompany(res.data.id, companyA);
      expect(storedAsset).not.toBeNull();
      expect(storedAsset?.companyId).toBe(companyA);
    });
  });

  describe("CRUD, Filters, Archive and Reactivate", () => {
    it("lists assets with search, filters and activeOnly flag", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");
      const customer = await db.createCustomer(companyA, { displayName: "Acme SpA" });
      const loc1 = await db.createLocation(companyA, customer.id, { name: "Sede 1", address: "A", city: "C" });
      const loc2 = await db.createLocation(companyA, customer.id, { name: "Sede 2", address: "B", city: "C" });

      const a1 = await db.createAsset(companyA, customer.id, loc1.id, {
        name: "Inverter Principale",
        assetType: "inverter",
        status: "operativo",
        isActive: true,
      });

      const a2 = await db.createAsset(companyA, customer.id, loc2.id, {
        name: "Wallbox Esterna",
        assetType: "wallbox",
        status: "manutenzione",
        isActive: false, // archived
      });

      // Filter active only (default)
      const activeRes = await apiRequest("/api/v1/assets?activeOnly=true", { cookies: auth.cookies });
      expect(activeRes.status).toBe(200);
      const activeIds = activeRes.data.map((x: any) => x.id);
      expect(activeIds).toContain(a1.id);
      expect(activeIds).not.toContain(a2.id);

      // Filter activeOnly = false (all)
      const allRes = await apiRequest("/api/v1/assets?activeOnly=false", { cookies: auth.cookies });
      expect(allRes.status).toBe(200);
      const allIds = allRes.data.map((x: any) => x.id);
      expect(allIds).toContain(a1.id);
      expect(allIds).toContain(a2.id);

      // Filter by assetType
      const typeRes = await apiRequest("/api/v1/assets?assetType=inverter&activeOnly=false", { cookies: auth.cookies });
      expect(typeRes.status).toBe(200);
      expect(typeRes.data.length).toBe(1);
      expect(typeRes.data[0].id).toBe(a1.id);

      // Search by text
      const searchRes = await apiRequest("/api/v1/assets?search=Esterna&activeOnly=false", { cookies: auth.cookies });
      expect(searchRes.status).toBe(200);
      expect(searchRes.data.length).toBe(1);
      expect(searchRes.data[0].id).toBe(a2.id);
    });

    it("updates an asset including name, serialNumber and status", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");
      const customer = await db.createCustomer(companyA, { displayName: "Acme SpA" });
      const location = await db.createLocation(companyA, customer.id, { name: "Sede 1", address: "A", city: "C" });
      const asset = await db.createAsset(companyA, customer.id, location.id, {
        name: "Quadro Vecchio",
        assetType: "quadro",
      });

      const updateRes = await apiRequest(`/api/v1/assets/${asset.id}`, {
        method: "PUT",
        body: {
          name: "Quadro Rinnovato 2026",
          status: "manutenzione",
          serialNumber: "SN-MOD-4411",
        },
        cookies: auth.cookies,
        headers: auth.headers,
      });

      expect(updateRes.status).toBe(200);
      expect(updateRes.data.name).toBe("Quadro Rinnovato 2026");
      expect(updateRes.data.status).toBe("manutenzione");
      expect(updateRes.data.serialNumber).toBe("SN-MOD-4411");
    });

    it("archives and reactivates an asset non-destructively", async () => {
      const auth = await createTestUserAndLogin(companyA, "admin");
      const customer = await db.createCustomer(companyA, { displayName: "Acme SpA" });
      const location = await db.createLocation(companyA, customer.id, { name: "Sede 1", address: "A", city: "C" });
      const asset = await db.createAsset(companyA, customer.id, location.id, {
        name: "Pompa di Calore",
        assetType: "climatizzazione",
        isActive: true,
      });

      // Archive
      const archRes = await apiRequest(`/api/v1/assets/${asset.id}/archive`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(archRes.status).toBe(200);
      expect(archRes.data.isActive).toBe(false);

      // Reactivate
      const reactRes = await apiRequest(`/api/v1/assets/${asset.id}/reactivate`, {
        method: "POST",
        cookies: auth.cookies,
        headers: auth.headers,
      });
      expect(reactRes.status).toBe(200);
      expect(reactRes.data.isActive).toBe(true);
    });
  });

  describe("Role-Based Access Control (RBAC)", () => {
    it("allows write roles (owner, admin, responsabile_tecnico, dispatcher, commerciale, amministrazione, superadmin)", async () => {
      const writeRoles: UserRole[] = [
        "owner",
        "admin",
        "responsabile_tecnico",
        "dispatcher",
        "commerciale",
        "amministrazione",
        "superadmin",
      ];

      for (const role of writeRoles) {
        const auth = await createTestUserAndLogin(companyA, role);
        const customer = await db.createCustomer(companyA, { displayName: `Cust for ${role}` });
        const location = await db.createLocation(companyA, customer.id, { name: "Sede", address: "A", city: "B" });

        const createRes = await apiRequest("/api/v1/assets", {
          method: "POST",
          body: {
            customerId: customer.id,
            locationId: location.id,
            assetType: "allarme",
            name: `Asset created by ${role}`,
          },
          cookies: auth.cookies,
          headers: auth.headers,
        });

        expect(createRes.status).toBe(201);
      }
    });

    it("enforces read-only access for 'technician' (GET ok, POST/PUT/archive return 403)", async () => {
      const techAuth = await createTestUserAndLogin(companyA, "technician");
      const customer = await db.createCustomer(companyA, { displayName: "Cust Tech" });
      const location = await db.createLocation(companyA, customer.id, { name: "Sede", address: "A", city: "B" });
      const asset = await db.createAsset(companyA, customer.id, location.id, {
        name: "Asset for Tech Test",
        assetType: "rete_cablaggio",
      });

      // GET list -> 200
      const listRes = await apiRequest("/api/v1/assets", { cookies: techAuth.cookies });
      expect(listRes.status).toBe(200);

      // GET single -> 200
      const getRes = await apiRequest(`/api/v1/assets/${asset.id}`, { cookies: techAuth.cookies });
      expect(getRes.status).toBe(200);

      // POST create -> 403
      const createRes = await apiRequest("/api/v1/assets", {
        method: "POST",
        body: { customerId: customer.id, locationId: location.id, assetType: "altro", name: "Tech Write Attempt" },
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(createRes.status).toBe(403);

      // PUT update -> 403
      const updateRes = await apiRequest(`/api/v1/assets/${asset.id}`, {
        method: "PUT",
        body: { name: "Hacked by tech" },
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(updateRes.status).toBe(403);

      // Archive -> 403
      const archRes = await apiRequest(`/api/v1/assets/${asset.id}/archive`, {
        method: "POST",
        cookies: techAuth.cookies,
        headers: techAuth.headers,
      });
      expect(archRes.status).toBe(403);
    });

    it("completely rejects 'cliente' role from all Assets APIs (403)", async () => {
      const clientAuth = await createTestUserAndLogin(companyA, "cliente");
      const customer = await db.createCustomer(companyA, { displayName: "Cust Client Test" });
      const location = await db.createLocation(companyA, customer.id, { name: "Sede", address: "A", city: "B" });
      const asset = await db.createAsset(companyA, customer.id, location.id, {
        name: "Asset Client Forbidden",
        assetType: "quadro",
      });

      // GET list -> 403
      const listRes = await apiRequest("/api/v1/assets", { cookies: clientAuth.cookies });
      expect(listRes.status).toBe(403);

      // GET single -> 403
      const getRes = await apiRequest(`/api/v1/assets/${asset.id}`, { cookies: clientAuth.cookies });
      expect(getRes.status).toBe(403);

      // POST -> 403
      const postRes = await apiRequest("/api/v1/assets", {
        method: "POST",
        body: { customerId: customer.id, locationId: location.id, assetType: "quadro", name: "Client Create Attempt" },
        cookies: clientAuth.cookies,
        headers: clientAuth.headers,
      });
      expect(postRes.status).toBe(403);
    });
  });

  describe("Cross-Tenant Isolation", () => {
    it("prevents Tenant B from reading, updating, archiving or reactivating Tenant A's asset", async () => {
      const authA = await createTestUserAndLogin(companyA, "admin");
      const authB = await createTestUserAndLogin(companyB, "admin");

      const custA = await db.createCustomer(companyA, { displayName: "Customer Tenant A" });
      const locA = await db.createLocation(companyA, custA.id, { name: "Sede A", address: "Via A", city: "MI" });
      const assetA = await db.createAsset(companyA, custA.id, locA.id, {
        name: "Quadro Elettrico Tenant A",
        assetType: "quadro",
      });

      // Tenant B GET -> 404
      const getRes = await apiRequest(`/api/v1/assets/${assetA.id}`, { cookies: authB.cookies });
      expect(getRes.status).toBe(404);

      // Tenant B list -> does not include assetA
      const listRes = await apiRequest("/api/v1/assets?activeOnly=false", { cookies: authB.cookies });
      expect(listRes.status).toBe(200);
      const bIds = listRes.data.map((x: any) => x.id);
      expect(bIds).not.toContain(assetA.id);

      // Tenant B PUT -> 404
      const putRes = await apiRequest(`/api/v1/assets/${assetA.id}`, {
        method: "PUT",
        body: { name: "Hijacked by Tenant B" },
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(putRes.status).toBe(404);

      // Tenant B Archive -> 404
      const archRes = await apiRequest(`/api/v1/assets/${assetA.id}/archive`, {
        method: "POST",
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(archRes.status).toBe(404);

      // Tenant B Reactivate -> 404
      const reactRes = await apiRequest(`/api/v1/assets/${assetA.id}/reactivate`, {
        method: "POST",
        cookies: authB.cookies,
        headers: authB.headers,
      });
      expect(reactRes.status).toBe(404);
    });
  });
});
