import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { generateTokens } from "./security";

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  db.seedInitialData();
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

async function apiRequest(
  path: string,
  options: {
    method?: string;
    body?: any;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
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

  const rawSetCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  let jsonBody: any = null;
  try {
    jsonBody = await res.json();
  } catch {
    // Non-JSON response
  }

  return {
    status: res.status,
    body: jsonBody,
    setCookieHeaders: rawSetCookies,
  };
}

describe("Production-Grade Server-Authoritative Auth Suite (server/*)", () => {
  describe("1. Registration (/api/v1/auth/register)", () => {
    it("creates new user & company and sets HttpOnly cookies without leaking token in JSON body", async () => {
      const res = await apiRequest("/api/v1/auth/register", {
        method: "POST",
        body: {
          email: "nuovo.cliente@azienda.it",
          password: "SecurePassword123!",
          full_name: "Mario Rossi",
          company_name: "Elettro Rossi Srl",
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe("nuovo.cliente@azienda.it");
      expect(res.body.fullName).toBe("Mario Rossi");
      expect(res.body.role).toBe("admin");
      expect(res.body.companyName).toBe("Elettro Rossi Srl");
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.salt).toBeUndefined();
      expect(res.body.access_token).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();

      // Check cookies set: access_token, refresh_token (HttpOnly) & csrf_token
      const accessCookie = res.setCookieHeaders.find((c) => c.startsWith("access_token="));
      const refreshCookie = res.setCookieHeaders.find((c) => c.startsWith("refresh_token="));
      const csrfCookie = res.setCookieHeaders.find((c) => c.startsWith("csrf_token="));

      expect(accessCookie).toBeDefined();
      expect(accessCookie).toContain("HttpOnly");
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain("HttpOnly");
      expect(csrfCookie).toBeDefined();
    });

    it("rejects invalid emails and weak passwords (<8 chars)", async () => {
      const invalidEmailRes = await apiRequest("/api/v1/auth/register", {
        method: "POST",
        body: {
          email: "not-an-email",
          password: "ValidPass123!",
          full_name: "Mario",
          company_name: "Azienda",
        },
      });
      expect(invalidEmailRes.status).toBe(400);

      const weakPassRes = await apiRequest("/api/v1/auth/register", {
        method: "POST",
        body: {
          email: "test@azienda.it",
          password: "short",
          full_name: "Mario",
          company_name: "Azienda",
        },
      });
      expect(weakPassRes.status).toBe(400);
    });

    it("rejects duplicate email registrations with 409 Conflict", async () => {
      const first = await apiRequest("/api/v1/auth/register", {
        method: "POST",
        body: {
          email: "duplicato@azienda.it",
          password: "Password123!",
          full_name: "Mario",
          company_name: "Azienda",
        },
      });
      expect(first.status).toBe(201);

      const second = await apiRequest("/api/v1/auth/register", {
        method: "POST",
        body: {
          email: "DUPLICATO@AZIENDA.IT", // Test case insensitivity
          password: "Password123!",
          full_name: "Mario 2",
          company_name: "Azienda 2",
        },
      });
      expect(second.status).toBe(409);
    });
  });

  describe("2. Login (/api/v1/auth/login)", () => {
    it("authenticates valid credentials, sets HttpOnly cookies, and returns safe user session", async () => {
      const res = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: {
          email: "admin@rossi.it",
          password: "Password123!",
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe("admin@rossi.it");
      expect(res.body.fullName).toBe("Marco Rossi");
      expect(res.body.role).toBe("admin");
      expect(res.body.passwordHash).toBeUndefined();

      const accessCookie = res.setCookieHeaders.find((c) => c.startsWith("access_token="));
      const refreshCookie = res.setCookieHeaders.find((c) => c.startsWith("refresh_token="));
      expect(accessCookie).toContain("HttpOnly");
      expect(refreshCookie).toContain("HttpOnly");
    });

    it("rejects incorrect passwords with 401 Unauthorized", async () => {
      const res = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: {
          email: "admin@rossi.it",
          password: "WrongPassword!",
        },
      });

      expect(res.status).toBe(401);
      expect(res.body.detail).toBe("Email o password non corretti.");
    });

    it("rejects nonexistent user emails with 401 Unauthorized", async () => {
      const res = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: {
          email: "unknown.user@nonexistent.com",
          password: "Password123!",
        },
      });

      expect(res.status).toBe(401);
    });

    it("rejects inactive users with 401", async () => {
      const user = db.findUserByEmail("tech@rossi.it")!;
      db.updateUser(user.id, { isActive: false });

      const res = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: {
          email: "tech@rossi.it",
          password: "Password123!",
        },
      });

      expect(res.status).toBe(401);
      expect(res.body.detail).toContain("disattivato");
    });
  });

  describe("3. Server-Authoritative Session (/api/v1/auth/session)", () => {
    it("returns authenticated user session when valid access_token cookie is provided", async () => {
      const user = db.findUserByEmail("admin@rossi.it")!;
      const { accessToken } = generateTokens(user);

      const res = await apiRequest("/api/v1/auth/session", {
        cookies: {
          access_token: accessToken,
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe("admin@rossi.it");
      expect(res.body.fullName).toBe("Marco Rossi");
      expect(res.body.role).toBe("admin");
    });

    it("returns 401 when access_token cookie is missing", async () => {
      const res = await apiRequest("/api/v1/auth/session");

      expect(res.status).toBe(401);
      expect(res.body.detail).toContain("Non autenticato");
    });

    it("returns 401 when access_token cookie is forged or invalid", async () => {
      const res = await apiRequest("/api/v1/auth/session", {
        cookies: {
          access_token: "forged.fake.jwt.token",
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("4. Refresh Token Rotation (/api/v1/auth/refresh)", () => {
    it("rotates access and refresh tokens when valid refresh_token cookie is sent", async () => {
      const user = db.findUserByEmail("admin@rossi.it")!;
      const { refreshToken } = generateTokens(user);

      const res = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: {
          refresh_token: refreshToken,
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.email).toBe("admin@rossi.it");

      const newAccessCookie = res.setCookieHeaders.find((c) => c.startsWith("access_token="));
      const newRefreshCookie = res.setCookieHeaders.find((c) => c.startsWith("refresh_token="));
      expect(newAccessCookie).toContain("HttpOnly");
      expect(newRefreshCookie).toContain("HttpOnly");
    });

    it("rejects forged or missing refresh token with 401", async () => {
      const res = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: {
          refresh_token: "invalid.refresh.token",
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("5. Logout (/api/v1/auth/logout)", () => {
    it("clears access_token, refresh_token, and csrf_token cookies", async () => {
      const res = await apiRequest("/api/v1/auth/logout", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(res.setCookieHeaders.some((c) => c.startsWith("access_token=;"))).toBe(true);
      expect(res.setCookieHeaders.some((c) => c.startsWith("refresh_token=;"))).toBe(true);
      expect(res.setCookieHeaders.some((c) => c.startsWith("csrf_token=;"))).toBe(true);
    });
  });

  describe("6. CSRF Protection", () => {
    it("rejects mutating requests when X-CSRF-Token header does not match csrf_token cookie", async () => {
      const user = db.findUserByEmail("admin@rossi.it")!;
      const { accessToken } = generateTokens(user);

      const res = await apiRequest("/api/v1/users/me", {
        method: "PUT",
        cookies: {
          access_token: accessToken,
          csrf_token: "valid-csrf-token-123",
        },
        headers: {
          "x-csrf-token": "wrong-token-456",
        },
        body: {
          full_name: "Hacked Name",
        },
      });

      expect(res.status).toBe(403);
      expect(res.body.detail).toContain("CSRF");
    });

    it("allows mutating requests when X-CSRF-Token matches csrf_token cookie", async () => {
      const user = db.findUserByEmail("admin@rossi.it")!;
      const { accessToken } = generateTokens(user);
      const csrf = "valid-csrf-token-123";

      const res = await apiRequest("/api/v1/users/me", {
        method: "PUT",
        cookies: {
          access_token: accessToken,
          csrf_token: csrf,
        },
        headers: {
          "x-csrf-token": csrf,
        },
        body: {
          full_name: "Marco Rossi Aggiornato",
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.fullName).toBe("Marco Rossi Aggiornato");
    });
  });

  describe("7. Role-Based Access Control & Tenant Isolation", () => {
    it("allows Master SuperAdmin to access /api/v1/admin/stats and /api/v1/admin/tenants", async () => {
      const superAdmin = db.findUserByEmail("saas@rapporti.it")!;
      const { accessToken } = generateTokens(superAdmin);

      const res = await apiRequest("/api/v1/admin/stats", {
        cookies: {
          access_token: accessToken,
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.system_status).toContain("Zero-Trust");
    });

    it("forbids regular admin and technician from accessing /api/v1/admin/stats", async () => {
      const regularAdmin = db.findUserByEmail("admin@rossi.it")!;
      const { accessToken } = generateTokens(regularAdmin);

      const res = await apiRequest("/api/v1/admin/stats", {
        cookies: {
          access_token: accessToken,
        },
      });

      expect(res.status).toBe(403);
    });

    it("enforces tenant isolation on reports: tenant A cannot see or delete tenant B reports", async () => {
      // Create Tenant B
      const { user: userB } = db.createUser({
        email: "admin@tenantb.it",
        fullName: "User B",
        password: "Password123!",
        companyName: "Tenant B Srl",
      });

      // Seed report for Tenant B
      const repB = db.createReport(userB.companyId, {
        client: { name: "Client of B" },
        workHours: 5,
      });

      // User A (Rossi) tries to read reports
      const userA = db.findUserByEmail("admin@rossi.it")!;
      const { accessToken: tokenA } = generateTokens(userA);

      const resA = await apiRequest("/api/v1/reports", {
        cookies: {
          access_token: tokenA,
        },
      });

      expect(resA.status).toBe(200);
      const repIds = resA.body.map((r: any) => r.id);
      expect(repIds).not.toContain(repB.id);

      // User A tries to delete Tenant B report
      const deleteRes = await apiRequest(`/api/v1/reports/${repB.id}`, {
        method: "DELETE",
        cookies: {
          access_token: tokenA,
          csrf_token: "csrf",
        },
        headers: {
          "x-csrf-token": "csrf",
        },
      });

      expect(deleteRes.status).toBe(404);
    });
  });
});
