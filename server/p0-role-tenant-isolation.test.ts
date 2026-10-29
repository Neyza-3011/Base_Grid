import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { CustomerService } from "./services/customer.service";
import { generateTokens } from "./security";
import { tokenStore } from "./token-store";

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
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function apiRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    accessToken?: string;
    csrfToken?: string;
  } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const cookies: string[] = [];
  if (options.accessToken) cookies.push(`access_token=${options.accessToken}`);
  if (options.csrfToken) {
    cookies.push(`csrf_token=${options.csrfToken}`);
    headers["x-csrf-token"] = options.csrfToken;
  }
  if (cookies.length) headers.cookie = cookies.join("; ");

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // Some error responses may not contain JSON.
  }
  return { status: response.status, body };
}

async function accessTokenFor(email: string): Promise<string> {
  const user = await db.findUserByEmail(email);
  if (!user) throw new Error(`Expected seeded test user ${email}`);
  return generateTokens(user).accessToken;
}

describe("P0-ROLE — tenant isolation and ordinary technician permissions", () => {
  it("prevents a company user from reading or updating another company's customer by ID", async () => {
    const registration = await apiRequest("/api/v1/auth/register", {
      method: "POST",
      body: {
        email: `tenant-b-${Date.now()}@example.test`,
        password: "SecurePassword123!",
        full_name: "Tenant B Owner",
        company_name: "Tenant B Impianti",
      },
    });
    expect(registration.status).toBe(201);

    const tenantBCustomer = await new CustomerService(db).createCustomer(
      registration.body.companyId,
      { displayName: "Customer belonging to tenant B" },
    );
    const tenantAAccessToken = await accessTokenFor("admin@rossi.it");
    const csrfToken = "test-csrf-token";

    const read = await apiRequest(`/api/v1/customers/${tenantBCustomer.id}`, {
      accessToken: tenantAAccessToken,
    });
    expect(read.status).toBe(404);

    const update = await apiRequest(`/api/v1/customers/${tenantBCustomer.id}`, {
      method: "PUT",
      accessToken: tenantAAccessToken,
      csrfToken,
      body: { displayName: "Unauthorized cross-tenant modification" },
    });
    expect(update.status).toBe(404);

    const persisted = await new CustomerService(db).getCustomerById(
      registration.body.companyId,
      tenantBCustomer.id,
    );
    expect(persisted.displayName).toBe("Customer belonging to tenant B");
  });

  it("rejects cross-tenant team-member updates without mutating the target user", async () => {
    const tenantBEmail = `tenant-b-team-${Date.now()}@example.test`;
    const registration = await apiRequest("/api/v1/auth/register", {
      method: "POST",
      body: {
        email: tenantBEmail,
        password: "SecurePassword123!",
        full_name: "Tenant B Owner",
        company_name: "Tenant B Team Company",
      },
    });
    expect(registration.status).toBe(201);

    const tenantBUser = await db.findUserByEmail(tenantBEmail);
    expect(tenantBUser).not.toBeNull();
    if (!tenantBUser) throw new Error("Expected registered Tenant B user");

    const tenantAAccessToken = await accessTokenFor("admin@rossi.it");
    const response = await apiRequest(`/api/v1/users/team/${tenantBUser.id}`, {
      method: "PUT",
      accessToken: tenantAAccessToken,
      csrfToken: "test-csrf-token",
      body: { fullName: "Unauthorized Team Update", role: "admin" },
    });

    expect(response.status).toBe(404);

    const persistedUser = await db.findUserByEmail(tenantBEmail);
    expect(persistedUser).not.toBeNull();
    expect(persistedUser?.id).toBe(tenantBUser.id);
    expect(persistedUser?.companyId).toBe(registration.body.companyId);
    expect(persistedUser?.fullName).toBe("Tenant B Owner");
    expect(persistedUser?.role).toBe("owner");
    expect(persistedUser?.isActive).toBe(true);
  });

  it("rejects cross-tenant team activation and deactivation without side effects", async () => {
    const tenantBEmail = `tenant-b-status-${Date.now()}@example.test`;
    const registration = await apiRequest("/api/v1/auth/register", {
      method: "POST",
      body: {
        email: tenantBEmail,
        password: "SecurePassword123!",
        full_name: "Tenant B Owner",
        company_name: "Tenant B Status Company",
      },
    });
    expect(registration.status).toBe(201);

    const tenantBUser = await db.findUserByEmail(tenantBEmail);
    expect(tenantBUser).not.toBeNull();
    if (!tenantBUser) throw new Error("Expected registered Tenant B user");

    const tenantAAccessToken = await accessTokenFor("admin@rossi.it");
    const csrfToken = "test-csrf-token";

    const deactivate = await apiRequest(`/api/v1/users/team/${tenantBUser.id}/deactivate`, {
      method: "POST",
      accessToken: tenantAAccessToken,
      csrfToken,
    });
    expect(deactivate.status).toBe(404);

    const activate = await apiRequest(`/api/v1/users/team/${tenantBUser.id}/activate`, {
      method: "POST",
      accessToken: tenantAAccessToken,
      csrfToken,
    });
    expect(activate.status).toBe(404);

    const persistedUser = await db.findUserByEmail(tenantBEmail);
    expect(persistedUser).not.toBeNull();
    expect(persistedUser?.id).toBe(tenantBUser.id);
    expect(persistedUser?.companyId).toBe(registration.body.companyId);
    expect(persistedUser?.fullName).toBe("Tenant B Owner");
    expect(persistedUser?.role).toBe("owner");
    expect(persistedUser?.isActive).toBe(true);
    expect(persistedUser?.authVersion).toBe(tenantBUser.authVersion);
  });

  it("keeps technicians out of company team-administration routes", async () => {
    const technicianAccessToken = await accessTokenFor("tech@rossi.it");

    const response = await apiRequest("/api/v1/users/team", {
      accessToken: technicianAccessToken,
    });

    expect(response.status).toBe(403);
  });
});
