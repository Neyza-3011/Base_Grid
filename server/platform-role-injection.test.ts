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
    // Non-JSON response.
  }
  return { status: response.status, body };
}

describe("Platform authority cannot be self-assigned through tenant APIs", () => {
  it("registration ignores client-supplied company and platform roles", async () => {
    const response = await apiRequest("/api/v1/auth/register", {
      method: "POST",
      body: {
        email: "role-injection-register@azienda.it",
        password: "SecurePassword123!",
        full_name: "Registration Probe",
        company_name: "Registration Probe Srl",
        role: "superadmin",
        platformRole: "ceo",
      },
    });

    expect(response.status).toBe(201);
    const createdUser = await db.findUserByEmail("role-injection-register@azienda.it");
    expect(createdUser?.role).toBe("owner");
    expect(createdUser?.platformRole ?? null).toBeNull();
  });

  it("team invitation rejects superadmin and does not accept a platformRole field", async () => {
    const admin = (await db.findUserByEmail("admin@rossi.it"))!;
    const { accessToken } = generateTokens(admin);

    const response = await apiRequest("/api/v1/users/team", {
      method: "POST",
      accessToken,
      csrfToken: "test-csrf",
      body: {
        email: "role-injection-invite@azienda.it",
        fullName: "Invitation Probe",
        role: "superadmin",
        platformRole: "ceo",
      },
    });

    expect(response.status).toBe(403);
    expect(await db.findUserByEmail("role-injection-invite@azienda.it")).toBeNull();
  });

  it("profile updates ignore attempts to change company role or platform authority", async () => {
    const admin = (await db.findUserByEmail("admin@rossi.it"))!;
    const { accessToken } = generateTokens(admin);

    const response = await apiRequest("/api/v1/users/me", {
      method: "PUT",
      accessToken,
      csrfToken: "test-csrf",
      body: {
        full_name: "Admin Profile Probe",
        role: "superadmin",
        platformRole: "ceo",
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.role).toBe("admin");
    expect(response.body.platformRole ?? null).toBeNull();

    const persistedUser = await db.findUserById(admin.id);
    expect(persistedUser?.role).toBe("admin");
    expect(persistedUser?.platformRole ?? null).toBeNull();
  });
});
