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
  const { config, PLATFORM_CEO_EMAIL } = await import("./config");
  config.EMAIL_VERIFICATION_ENABLED = false;
  config.SUPERADMIN_EMAIL = PLATFORM_CEO_EMAIL;
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

async function getWithUser(path: string, email: string) {
  const user = await db.findUserByEmail(email);
  if (!user) throw new Error(`Missing seeded test user: ${email}`);
  const { accessToken } = generateTokens(user);
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie: `access_token=${accessToken}` },
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON response is still represented by its HTTP status.
  }
  return { status: response.status, body };
}

describe("Platform admin endpoint authorization", () => {
  it.each(["/api/v1/admin/stats", "/api/v1/admin/tenants"])(
    "denies a company admin access to %s",
    async (path) => {
      const response = await getWithUser(path, "admin@rossi.it");

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        detail: "Accesso negato: permessi piattaforma insufficienti.",
      });
    },
  );

  it("allows the canonical platform CEO to read global stats and tenant summaries", async () => {
    const stats = await getWithUser("/api/v1/admin/stats", "jack.cardinali15@gmail.com");
    const tenants = await getWithUser("/api/v1/admin/tenants", "jack.cardinali15@gmail.com");

    expect(stats.status).toBe(200);
    expect(stats.body.total_tenants).toBeGreaterThan(0);
    expect(stats.body.total_users).toBeGreaterThan(0);

    expect(tenants.status).toBe(200);
    expect(Array.isArray(tenants.body)).toBe(true);
    expect(tenants.body.some((tenant: { id: string }) => tenant.id === "comp-rossi-001")).toBe(true);
  });
});
