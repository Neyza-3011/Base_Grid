import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { generateTokens } from "./security";
import { tokenStore } from "./token-store";

const TEST_JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";
let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  const { config, PLATFORM_CEO_EMAIL } = await import("./config");
  config.EMAIL_VERIFICATION_ENABLED = false;
  config.SUPERADMIN_EMAIL = PLATFORM_CEO_EMAIL;
  tokenStore.setAvailability(true);
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
  tokenStore.setAvailability(true);
});

async function request(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {},
) {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {
    cookie: `access_token=${token}`,
    ...(options.body === undefined ? {} : { "content-type": "application/json" }),
  };
  if (method !== "GET") {
    headers.cookie += "; csrf_token=test-csrf-token";
    headers["x-csrf-token"] = "test-csrf-token";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // Keep the status for non-JSON responses.
  }
  return { status: response.status, body };
}

describe("Platform user lifecycle access-token revocation", () => {
  it("does not revive an access token issued before deactivate/reactivate", async () => {
    const ceo = await db.findUserByEmail("jack.cardinali15@gmail.com");
    const technician = await db.findUserByEmail("tech@rossi.it");
    expect(ceo).toBeTruthy();
    expect(technician).toBeTruthy();

    const ceoToken = generateTokens(ceo!).accessToken;
    const staleTechnicianToken = generateTokens(technician!).accessToken;
    const originalAuthVersion = technician!.authVersion;

    const deactivated = await request(
      `/api/v1/admin/tenants/comp-rossi-001/users/${technician!.id}/deactivate`,
      ceoToken,
      { method: "POST" },
    );
    expect(deactivated.status).toBe(200);
    expect((await db.findUserById(technician!.id))?.authVersion).toBe(originalAuthVersion + 1);

    const reactivated = await request(
      `/api/v1/admin/tenants/comp-rossi-001/users/${technician!.id}/activate`,
      ceoToken,
      { method: "POST" },
    );
    expect(reactivated.status).toBe(200);
    const currentUser = await db.findUserById(technician!.id);
    expect(currentUser?.isActive).toBe(true);
    expect(currentUser?.authVersion).toBe(originalAuthVersion + 2);

    const staleSession = await request("/api/v1/users/me", staleTechnicianToken);
    expect(staleSession.status).toBe(401);
    expect(staleSession.body.detail).toMatch(/Sessione invalidata/i);

    const freshToken = generateTokens(currentUser!).accessToken;
    const freshSession = await request("/api/v1/users/me", freshToken);
    expect(freshSession.status).toBe(200);
  });
});
