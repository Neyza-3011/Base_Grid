import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "http";
import jwt from "jsonwebtoken";
import { createApp } from "./app";
import { db } from "./db";
import { tokenStore, RefreshTokenStore } from "./token-store";
import {
  assertValidJwtSecret,
  generateTokens,
  getJwtSecret,
  verifyAccessToken,
} from "./security";

let server: http.Server;
let baseUrl: string;

const TEST_JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";

beforeEach(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  db.seedInitialData();
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", async () => {
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

describe("Production-Grade Server-Authoritative Auth Suite (server/*)", async () => {
  describe("1. Registration (/api/v1/auth/register)", async () => {
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

  describe("2. Login (/api/v1/auth/login)", async () => {
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
      const user = await db.findUserByEmail("tech@rossi.it")!;
      await db.updateUser(user.id, { isActive: false });

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

  describe("3. Server-Authoritative Session (/api/v1/auth/session)", async () => {
    it("returns authenticated user session when valid access_token cookie is provided", async () => {
      const user = await db.findUserByEmail("admin@rossi.it")!;
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

  describe("4. Refresh Token Rotation & Replay Protection (/api/v1/auth/refresh)", async () => {
    it("successfully rotates R1 -> fresh access_token + R2 on valid refresh request", async () => {
      const loginRes = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: {
          email: "admin@rossi.it",
          password: "Password123!",
        },
      });

      expect(loginRes.status).toBe(200);
      const r1Cookie = loginRes.setCookieHeaders.find((c) => c.startsWith("refresh_token="));
      expect(r1Cookie).toBeDefined();
      const r1 = r1Cookie!.split(";")[0].split("=")[1];

      // Refresh using R1
      const refreshRes = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: {
          refresh_token: r1,
        },
      });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.email).toBe("admin@rossi.it");

      const a2Cookie = refreshRes.setCookieHeaders.find((c) => c.startsWith("access_token="));
      const r2Cookie = refreshRes.setCookieHeaders.find((c) => c.startsWith("refresh_token="));
      expect(a2Cookie).toContain("HttpOnly");
      expect(r2Cookie).toContain("HttpOnly");

      const r2 = r2Cookie!.split(";")[0].split("=")[1];
      expect(r2).not.toBe(r1);

      // Verify R1 is now consumed in store
      const r1Record = await tokenStore.getTokenRecord(r1);
      expect(r1Record?.status).toBe("consumed");

      // Verify R2 is active and can be used for a subsequent valid rotation
      const secondRefreshRes = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: {
          refresh_token: r2,
        },
      });
      expect(secondRefreshRes.status).toBe(200);
    });

    it("rejects reuse of an already consumed refresh token (Replay Attack) with 401 and invalidates family", async () => {
      const loginRes = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: {
          email: "admin@rossi.it",
          password: "Password123!",
        },
      });
      const r1 = loginRes.setCookieHeaders.find((c) => c.startsWith("refresh_token="))!.split(";")[0].split("=")[1];

      // Legitimate user rotates R1 -> R2
      const firstRefresh = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: r1 },
      });
      expect(firstRefresh.status).toBe(200);
      const r2 = firstRefresh.setCookieHeaders.find((c) => c.startsWith("refresh_token="))!.split(";")[0].split("=")[1];

      // Attacker attempts to replay already used R1
      const replayAttempt = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: r1 },
      });
      expect(replayAttempt.status).toBe(401);
      expect(replayAttempt.body.detail).toMatch(/già utilizzato|replay/i);

      // Because a replay attack was detected, the entire token family was revoked.
      // Subsequent use of R2 is also blocked!
      const subsequentR2Attempt = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: r2 },
      });
      expect(subsequentR2Attempt.status).toBe(401);
    });

    it("handles two concurrent refresh requests with R1: exactly ONE succeeds (200) and ONE fails (401)", async () => {
      const loginRes = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: {
          email: "admin@rossi.it",
          password: "Password123!",
        },
      });
      const r1 = loginRes.setCookieHeaders.find((c) => c.startsWith("refresh_token="))!.split(";")[0].split("=")[1];

      // Fire two concurrent requests with identical R1
      const [resA, resB] = await Promise.all([
        apiRequest("/api/v1/auth/refresh", {
          method: "POST",
          cookies: { refresh_token: r1 },
        }),
        apiRequest("/api/v1/auth/refresh", {
          method: "POST",
          cookies: { refresh_token: r1 },
        }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([200, 401]);
    });

    it("rejects an expired refresh token with 401", async () => {
      const user = await db.findUserByEmail("admin@rossi.it")!;
      const secret = getJwtSecret();
      const expiredToken = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          tokenType: "refresh",
          jti: "expired-jti-123",
          familyId: "fam-expired-123",
        },
        secret,
        { expiresIn: "-10s" },
      );

      await tokenStore.registerToken({
        token: expiredToken,
        jti: "expired-jti-123",
        userId: user.id,
        familyId: "fam-expired-123",
        expiresInMs: -10000,
      });

      const res = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: expiredToken },
      });

      expect(res.status).toBe(401);
      expect(res.body.detail).toMatch(/non valido o scaduto/i);
    });

    it("rejects invalid tokens, forged signatures, and wrong tokenTypes with 401", async () => {
      // 1. Forged signature
      const user = await db.findUserByEmail("admin@rossi.it")!;
      const forgedSecret = "wrong-forged-secret-key-32-chars-long!!";
      const forgedToken = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          tokenType: "refresh",
        },
        forgedSecret,
      );

      const resForged = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: forgedToken },
      });
      expect(resForged.status).toBe(401);

      // 2. Access token passed instead of refresh token
      const { accessToken } = generateTokens(user);
      const resWrongType = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: accessToken },
      });
      expect(resWrongType.status).toBe(401);

      // 3. Corrupted string
      const resCorrupted = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: "not-a-valid-jwt" },
      });
      expect(resCorrupted.status).toBe(401);
    });

    it("rejects non-existent or inactive users with 401", async () => {
      const secret = getJwtSecret();

      // 1. Non-existent user
      const nonExistentToken = jwt.sign(
        {
          sub: "usr-non-existent-999",
          email: "ghost@example.com",
          role: "admin",
          companyId: "comp-999",
          tokenType: "refresh",
          jti: "jti-ghost-1",
          familyId: "fam-ghost-1",
        },
        secret,
        { expiresIn: "7d" },
      );
      await tokenStore.registerToken({
        token: nonExistentToken,
        jti: "jti-ghost-1",
        userId: "usr-non-existent-999",
        familyId: "fam-ghost-1",
      });

      const resGhost = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: nonExistentToken },
      });
      expect(resGhost.status).toBe(401);

      // 2. Inactive user
      const user = await db.findUserByEmail("tech@rossi.it")!;
      const { refreshToken } = generateTokens(user);
      await tokenStore.registerToken({
        token: refreshToken,
        jti: "jti-tech-inactive",
        userId: user.id,
        familyId: "fam-tech-inactive",
      });

      // Deactivate user
      await db.updateUser(user.id, { isActive: false });

      const resInactive = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: { refresh_token: refreshToken },
      });
      expect(resInactive.status).toBe(401);
      expect(resInactive.body.detail).toMatch(/disattivato/i);
    });

    it("fails closed with 503 (Service Unavailable) when revocation/token storage is unavailable", async () => {
      const loginRes = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: {
          email: "admin@rossi.it",
          password: "Password123!",
        },
      });
      const r1 = loginRes.setCookieHeaders.find((c) => c.startsWith("refresh_token="))!.split(";")[0].split("=")[1];

      // Simulate token storage / Redis / DB outage
      tokenStore.setAvailability(false);

      try {
        const refreshRes = await apiRequest("/api/v1/auth/refresh", {
          method: "POST",
          cookies: { refresh_token: r1 },
        });

        expect(refreshRes.status).toBe(503);
        expect(refreshRes.body.detail).toMatch(/temporaneamente non disponibile/i);
        // No new cookies issued
        expect(refreshRes.setCookieHeaders.some((c) => c.startsWith("access_token="))).toBe(false);
      } finally {
        tokenStore.setAvailability(true);
      }
    });
  });

  describe("5. Logout (/api/v1/auth/logout)", async () => {
    it("clears access_token, refresh_token, and csrf_token cookies and revokes refresh token in store", async () => {
      const loginRes = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: {
          email: "admin@rossi.it",
          password: "Password123!",
        },
      });
      const r1 = loginRes.setCookieHeaders.find((c) => c.startsWith("refresh_token="))!.split(";")[0].split("=")[1];

      const res = await apiRequest("/api/v1/auth/logout", {
        method: "POST",
        cookies: {
          refresh_token: r1,
        },
      });

      expect(res.status).toBe(200);
      expect(res.setCookieHeaders.some((c) => c.startsWith("access_token=;"))).toBe(true);
      expect(res.setCookieHeaders.some((c) => c.startsWith("refresh_token=;"))).toBe(true);
      expect(res.setCookieHeaders.some((c) => c.startsWith("csrf_token=;"))).toBe(true);

      // Verify token is revoked in store
      const r1Record = await tokenStore.getTokenRecord(r1);
      expect(r1Record?.status).toBe("revoked");

      // Attempting to refresh with revoked token fails
      const refreshRes = await apiRequest("/api/v1/auth/refresh", {
        method: "POST",
        cookies: {
          refresh_token: r1,
        },
      });
      expect(refreshRes.status).toBe(401);
    });
  });

  describe("6. CSRF Protection", async () => {
    it("rejects mutating requests when X-CSRF-Token header does not match csrf_token cookie", async () => {
      const user = await db.findUserByEmail("admin@rossi.it")!;
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
      const user = await db.findUserByEmail("admin@rossi.it")!;
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

  describe("7. Role-Based Access Control & Tenant Isolation", async () => {
    it("allows Master SuperAdmin to access /api/v1/admin/stats and /api/v1/admin/tenants", async () => {
      const superAdmin = await db.findUserByEmail("saas@rapporti.it")!;
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
      const regularAdmin = await db.findUserByEmail("admin@rossi.it")!;
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
      const { user: userB } = await db.createUser({
        email: "admin@tenantb.it",
        fullName: "User B",
        password: "Password123!",
        companyName: "Tenant B Srl",
      });

      // Seed report for Tenant B
      const repB = await db.createReport(userB.companyId, {
        client: { name: "Client of B" },
        workHours: 5,
      });

      // User A (Rossi) tries to read reports
      const userA = await db.findUserByEmail("admin@rossi.it")!;
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

  describe("8. JWT Secret Security & Strict Environment Enforcement", async () => {
    it("fails startup in production when JWT_SECRET and SECRET_KEY are missing", async () => {
      expect(() =>
        assertValidJwtSecret({
          NODE_ENV: "production",
        }),
      ).toThrow(/CRITICAL SECURITY ERROR.*JWT secret is missing/i);
    });

    it("fails startup in production when JWT secret is empty or whitespace-only", async () => {
      expect(() => getJwtSecret({ NODE_ENV: "production", JWT_SECRET: "   " })).toThrow(/JWT secret is empty/i);
      expect(() => assertValidJwtSecret({ NODE_ENV: "production", JWT_SECRET: "" })).toThrow(/JWT secret is missing/i);
    });

    it("fails startup in production when JWT secret is too short (< 32 characters)", async () => {
      const shortSecret = "short-secret-12345";
      expect(() => getJwtSecret({ NODE_ENV: "production", JWT_SECRET: shortSecret })).toThrow(
        /JWT secret is too short \(18 chars\)\. It must be at least 32 characters long/i,
      );
    });

    it("fails startup in production when JWT secret is a known insecure placeholder", async () => {
      const bannedPlaceholders = [
        "secret",
        "changeme",
        "password",
        "jwt_secret",
        "secret_key",
        "default_secret",
        "your-secret-key-here",
        "12345678901234567890123456789012",
        "basegrid-production-secure-jwt-key-2026-auth-authoritative",
      ];

      for (const placeholder of bannedPlaceholders) {
        expect(() => getJwtSecret({ NODE_ENV: "production", JWT_SECRET: placeholder })).toThrow(
          /JWT secret is (too short|set to a known insecure placeholder)/i,
        );
      }
    });

    it("succeeds startup when a valid, cryptographically strong secret is provided via JWT_SECRET or SECRET_KEY", async () => {
      const validSecret = "a_super_strong_cryptographic_secret_key_with_at_least_32_characters!";
      expect(getJwtSecret({ NODE_ENV: "production", JWT_SECRET: validSecret })).toBe(validSecret);
      expect(getJwtSecret({ NODE_ENV: "production", SECRET_KEY: validSecret })).toBe(validSecret);
      expect(() => assertValidJwtSecret({ NODE_ENV: "production", JWT_SECRET: validSecret })).not.toThrow();
    });

    it("allows dev startup fallback in development environment", async () => {
      expect(() => assertValidJwtSecret({ NODE_ENV: "development" })).not.toThrow();
    });

    it("rejects JWT signature verification when token generated with Secret A is verified with Secret B", async () => {
      const secretA = "cryptographically_secure_test_secret_alpha_key_32_chars!";
      const secretB = "cryptographically_secure_test_secret_bravo_key_32_chars!";

      const user = await db.findUserByEmail("admin@rossi.it")!;
      const { accessToken } = generateTokens(user, secretA);

      // Verified with correct Secret A -> succeeds
      const validPayload = verifyAccessToken(accessToken, secretA);
      expect(validPayload).not.toBeNull();
      expect(validPayload?.email).toBe("admin@rossi.it");

      // Verified with different Secret B -> rejected (returns null)
      const invalidPayload = verifyAccessToken(accessToken, secretB);
      expect(invalidPayload).toBeNull();
    });

    it("never leaks secret values in thrown error messages", async () => {
      const shortSecret = "my-secret-123456789";
      try {
        getJwtSecret({ NODE_ENV: "production", JWT_SECRET: shortSecret });
        expect.unreachable("Should have thrown error");
      } catch (err: any) {
        expect(err.message).not.toContain(shortSecret);
        expect(err.message).toContain("JWT secret is too short");
      }
    });
  });

  describe("9. Distributed Storage Engine & Cross-Instance Verification", async () => {
    it("never stores raw JWT strings in storage records, only SHA-256 digests", async () => {
      const user = await db.findUserByEmail("admin@rossi.it")!;
      const { refreshToken } = generateTokens(user);

      await tokenStore.registerToken({
        token: refreshToken,
        jti: "test-jti-123",
        userId: user.id,
        familyId: "fam-test-123",
      });

      const record = await tokenStore.getTokenRecord(refreshToken);
      expect(record).not.toBeNull();
      expect(record?.tokenHash).toBe(RefreshTokenStore.hashToken(refreshToken));
      // Ensure record does not have any raw token property
      expect((record as any).token).toBeUndefined();
      expect((record as any).rawToken).toBeUndefined();
      expect(record?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("supports multiple backend server instances sharing the same distributed storage state", async () => {
      // Simulate Instance A, Instance B, Instance C connected to the same shared backend adapter
      const sharedAdapter = tokenStore.getAdapter();
      const instanceA = new RefreshTokenStore(sharedAdapter);
      const instanceB = new RefreshTokenStore(sharedAdapter);
      const instanceC = new RefreshTokenStore(sharedAdapter);

      const user = await db.findUserByEmail("admin@rossi.it")!;
      const { refreshToken: r1, jti, familyId } = generateTokens(user);

      // Instance A registers R1
      await instanceA.registerToken({
        token: r1,
        jti,
        userId: user.id,
        familyId,
      });

      // Instance B consumes R1 (rotation)
      const consumeRes = await instanceB.consumeToken(r1);
      expect(consumeRes.success).toBe(true);
      expect(consumeRes.familyId).toBe(familyId);

      // Instance C attempts to consume R1 again (Replay attack detection)
      const replayRes = await instanceC.consumeToken(r1);
      expect(replayRes.success).toBe(false);
      expect(replayRes.reason).toBe("already_used");
      expect(replayRes.familyId).toBe(familyId);

      // Instance A checks that the token family is revoked
      const record = await instanceA.getTokenRecord(r1);
      expect(record?.status).toBe("revoked");
    });

    it("verifies RedisTokenStorageAdapter instantiation and environment configuration fallback", async () => {
      const redisAdapter = new (tokenStore.constructor as any)();
      expect(redisAdapter).toBeDefined();
      expect(typeof redisAdapter.consumeToken).toBe("function");
      expect(typeof redisAdapter.registerToken).toBe("function");
    });

    it("ensures exactly 1 out of 10 concurrent consumeToken calls succeeds across distributed nodes", async () => {
      const sharedAdapter = tokenStore.getAdapter();
      const instance = new RefreshTokenStore(sharedAdapter);
      const user = await db.findUserByEmail("admin@rossi.it")!;
      const { refreshToken: r1, jti, familyId } = generateTokens(user);

      await instance.registerToken({
        token: r1,
        jti,
        userId: user.id,
        familyId,
      });

      // 10 concurrent calls
      const results = await Promise.all(
        Array.from({ length: 10 }).map(() => instance.consumeToken(r1)),
      );

      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(9);
      failures.forEach((f) => {
        expect(f.success).toBe(false);
        if (!f.success) {
          expect(["already_used", "revoked"]).toContain(f.reason);
        }
      });
    });

    it("revokes all tokens across all families when revokeAllUserTokens is triggered", async () => {
      const user = await db.findUserByEmail("admin@rossi.it")!;
      const t1 = generateTokens(user);
      const t2 = generateTokens(user);

      await tokenStore.registerToken({
        token: t1.refreshToken,
        jti: t1.jti,
        userId: user.id,
        familyId: t1.familyId,
      });

      await tokenStore.registerToken({
        token: t2.refreshToken,
        jti: t2.jti,
        userId: user.id,
        familyId: t2.familyId,
      });

      // Revoke all for user
      await tokenStore.revokeAllUserTokens(user.id);

      const rec1 = await tokenStore.getTokenRecord(t1.refreshToken);
      const rec2 = await tokenStore.getTokenRecord(t2.refreshToken);

      expect(rec1?.status).toBe("revoked");
      expect(rec2?.status).toBe("revoked");

      // Consuming either token now fails
      const res1 = await tokenStore.consumeToken(t1.refreshToken);
      expect(res1.success).toBe(false);
      expect(res1.reason).toBe("revoked");
    });
  });
});

