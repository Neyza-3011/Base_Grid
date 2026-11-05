import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { generateTokens } from "./security";

let server: http.Server;
let baseUrl: string;

const TEST_JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";

beforeEach(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  const { config } = await import("./config");
  config.EMAIL_VERIFICATION_ENABLED = false;
  db.seedInitialData();

  await new Promise<void>((resolve) => {
    server = http.createServer(createApp());
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

async function tokenFor(email: string): Promise<string> {
  const user = await db.findUserByEmail(email);
  if (!user) throw new Error(`Missing seeded test user: ${email}`);
  return generateTokens(user).accessToken;
}

async function apiRequest(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string } = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.accessToken) headers.cookie = `access_token=${options.accessToken}`;
  if (options.method && options.method !== "GET") {
    // Test CSRF middleware contract: the cookie and header must match.
    headers.cookie = [headers.cookie, "csrf_token=test-csrf-token"].filter(Boolean).join("; ");
    headers["x-csrf-token"] = "test-csrf-token";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // Preserve status for non-JSON error responses.
  }
  return { status: response.status, body };
}

describe("Company settings HTTP authorization and tenant boundary", () => {
  it("requires authentication for company settings reads and writes", async () => {
    const read = await apiRequest("/api/v1/company/settings");
    const write = await apiRequest("/api/v1/company/settings", {
      method: "PUT",
      body: { name: "Unauthenticated mutation" },
    });

    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });

  it("ignores client-supplied companyId and blocks non-platform roles from changing subscription status", async () => {
    const tenantBEmail = `tenant-b-company-settings-${Date.now()}@example.test`;
    const registration = await apiRequest("/api/v1/auth/register", {
      method: "POST",
      body: {
        email: tenantBEmail,
        password: "SecurePassword123!",
        full_name: "Tenant B Owner",
        company_name: "Tenant B Original",
      },
    });
    expect(registration.status).toBe(201);
    expect(registration.body.companyId).toBeTruthy();

    const tenantBCompanyId = registration.body.companyId as string;
    const accessToken = await tokenFor(tenantBEmail);

    const companyABefore = await db.findCompanyById("comp-rossi-001");
    const companyBBefore = await db.findCompanyById(tenantBCompanyId);
    expect(companyABefore).toBeTruthy();
    expect(companyBBefore).toBeTruthy();

    const update = await apiRequest("/api/v1/company/settings", {
      method: "PUT",
      accessToken,
      body: {
        companyId: "comp-rossi-001",
        name: "Tenant B Updated",
        stripe_subscription_status: "canceled",
        logo_data_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
      },
    });

    expect(update.status).toBe(200);
    const companyAAfter = await db.findCompanyWithLogoById("comp-rossi-001");
    const companyBAfter = await db.findCompanyWithLogoById(tenantBCompanyId);
    expect(companyAAfter?.name).toBe(companyABefore?.name);
    expect(companyBAfter?.name).toBe("Tenant B Updated");
    expect(companyBAfter?.stripeSubscriptionStatus).toBe(companyBBefore?.stripeSubscriptionStatus);
    expect(companyAAfter?.logoDataUrl ?? null).toBeNull();
    expect(companyBAfter?.logoDataUrl).toContain("data:image/png;base64,");
  });

  it("rejects malformed runtime field types without mutating the company", async () => {
    const before = await db.findCompanyById("comp-rossi-001");
    const accessToken = await tokenFor("admin@rossi.it");

    const objectName = await apiRequest("/api/v1/company/settings", {
      method: "PUT",
      accessToken,
      body: { name: { nested: "not a string" } },
    });
    const stringRate = await apiRequest("/api/v1/company/settings", {
      method: "PUT",
      accessToken,
      body: { default_hourly_rate: "75" },
    });
    const numericAddress = await apiRequest("/api/v1/company/settings", {
      method: "PUT",
      accessToken,
      body: { address: 123 },
    });

    expect(objectName.status).toBe(400);
    expect(stringRate.status).toBe(400);
    expect(numericAddress.status).toBe(400);
    const after = await db.findCompanyById("comp-rossi-001");
    expect(after?.name).toBe(before?.name);
    expect(after?.address).toBe(before?.address);
    expect(after?.defaultHourlyRate).toBe(before?.defaultHourlyRate);
  });

  it("rejects repeated include_logo query parameters", async () => {
    const accessToken = await tokenFor("admin@rossi.it");
    const response = await apiRequest(
      "/api/v1/company/settings?include_logo=false&include_logo=false",
      { accessToken },
    );

    expect(response.status).toBe(400);
  });

  it.each([
    ["/api/v1/company/settings?include_logo=maybe", 400],
    ["/api/v1/company/settings?include_logo=", 400],
    ["/api/v1/company/settings?include_logo=true", 200],
    ["/api/v1/company/settings?include_logo=false", 200],
  ] as const)("validates include_logo boolean: %s", async (path, expectedStatus) => {
    const accessToken = await tokenFor("admin@rossi.it");
    const response = await apiRequest(path, { accessToken });
    expect(response.status).toBe(expectedStatus);
  });

});
