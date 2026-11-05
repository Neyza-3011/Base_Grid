import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { generateTokens } from "./security";

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";
  const { config, PLATFORM_CEO_EMAIL } = await import("./config");
  config.EMAIL_VERIFICATION_ENABLED = false;
  config.SUPERADMIN_EMAIL = PLATFORM_CEO_EMAIL;
  db.seedInitialData?.();

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

async function adminRequest(path: string, method: string, body: unknown) {
  const admin = await db.findUserByEmail("admin@rossi.it");
  if (!admin) throw new Error("Missing seeded admin user");
  const accessToken = generateTokens(admin).accessToken;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: `access_token=${accessToken}; csrf_token=test-csrf-token`,
      "x-csrf-token": "test-csrf-token",
    },
    body: JSON.stringify(body),
  });
  let responseBody: any = null;
  try { responseBody = await response.json(); } catch { /* Preserve status. */ }
  return { status: response.status, body: responseBody };
}

describe("Team owner-role authorization", () => {
  it("prevents a tenant admin from inviting a new owner", async () => {
    const response = await adminRequest("/api/v1/users/team", "POST", {
      email: `new-owner-${Date.now()}@example.test`,
      fullName: "Unauthorized Owner",
      role: "owner",
    });
    expect(response.status).toBe(403);
    expect(response.body.detail).toMatch(/titolare/i);
  });

  it("prevents a tenant admin from promoting another member to owner", async () => {
    const response = await adminRequest("/api/v1/users/team/usr-rossi-tech", "PUT", {
      role: "owner",
    });
    expect(response.status).toBe(403);
    expect(response.body.detail).toMatch(/titolare/i);
    const unchanged = await db.getUserByIdAndCompany("usr-rossi-tech", "comp-rossi-001");
    expect(unchanged?.role).toBe("technician");
  });
});
