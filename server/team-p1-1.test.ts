import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "http";
import { createApp } from "./app";
import { db } from "./db";
import { tokenStore } from "./token-store";
import { TeamService } from "./services/team.service";
import { generateSecureToken, hashPassword, hashToken } from "./security";

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
    // Non-JSON
  }

  return {
    status: res.status,
    body: jsonBody,
    setCookieHeaders: rawSetCookies,
  };
}

describe("P1.1 — Team & Onboarding Foundation Tests", () => {
  describe("1. Company Onboarding & Owner Creation", () => {
    it("registration creates initial user with role 'owner' belonging to the new company", async () => {
      const email = `owner-${Date.now()}@buildcorp.it`;
      const res = await apiRequest("/api/v1/auth/register", {
        method: "POST",
        body: {
          email,
          password: "SecurePassword123!",
          full_name: "Giuseppe Verdi",
          company_name: "Verdi Costruzioni Srl",
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe(email);
      expect(res.body.fullName).toBe("Giuseppe Verdi");
      expect(res.body.role).toBe("owner");
      expect(res.body.companyId).toBeDefined();
      expect(res.body.companyName).toBe("Verdi Costruzioni Srl");

      // Verify user in DB belongs to newly created company
      const dbUser = await db.findUserByEmail(email);
      expect(dbUser).toBeDefined();
      expect(dbUser?.role).toBe("owner");
      expect(dbUser?.companyId).toBe(res.body.companyId);
    });

    it("duplicate registration does not create duplicate company or user records", async () => {
      const email = `dupl-owner-${Date.now()}@test.it`;
      const payload = {
        email,
        password: "Password1234!",
        full_name: "Carlo Rossi",
        company_name: "Rossi & Co",
      };

      const firstRes = await apiRequest("/api/v1/auth/register", {
        method: "POST",
        body: payload,
      });
      expect(firstRes.status).toBe(201);
      const companyId = firstRes.body.companyId;

      const secondRes = await apiRequest("/api/v1/auth/register", {
        method: "POST",
        body: payload,
      });
      expect(secondRes.status).toBe(409);

      // Verify no duplicate user was created
      const allUsers = await db.getUsersByCompany(companyId);
      const matchingUsers = allUsers.filter((u) => u.email === email);
      expect(matchingUsers.length).toBe(1);
    });
  });

  describe("2. Invite Acceptance Flow", () => {
    it("allows invited user to view invite info and accept with a valid password", async () => {
      const teamService = new TeamService(db);
      const inviter = (await db.findUserByEmail("admin@rossi.it"))!;

      const invitedEmail = `tech-${Date.now()}@rossi.it`;
      const inviteRes = await teamService.inviteTeamMember(
        inviter.companyId,
        inviter.companyName,
        inviter.id,
        {
          email: invitedEmail,
          fullName: "Franco Baresi",
          role: "technician",
        },
      );

      const rawToken = inviteRes.inviteToken;
      expect(rawToken).toBeDefined();
      expect(typeof rawToken).toBe("string");

      // 1. Fetch info with raw token (unauthenticated)
      const infoRes = await apiRequest(`/api/v1/auth/invite?token=${rawToken}`);
      expect(infoRes.status).toBe(200);
      expect(infoRes.body.valid).toBe(true);
      expect(infoRes.body.email).toBe(invitedEmail);
      expect(infoRes.body.fullName).toBe("Franco Baresi");
      expect(infoRes.body.role).toBe("technician");
      expect(infoRes.body.companyName).toBe(inviter.companyName);

      // Verify secrets are NOT leaked in invite info response
      expect(infoRes.body.tokenHash).toBeUndefined();
      expect(infoRes.body.passwordHash).toBeUndefined();
      expect(infoRes.body.salt).toBeUndefined();

      // 2. Accept invite with new password
      const acceptRes = await apiRequest("/api/v1/auth/accept-invite", {
        method: "POST",
        body: {
          token: rawToken,
          password: "MyNewPassword123!",
        },
      });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.success).toBe(true);
      expect(acceptRes.body.tokenHash).toBeUndefined();
      expect(acceptRes.body.passwordHash).toBeUndefined();
      expect(acceptRes.body.salt).toBeUndefined();

      // 3. Verify user can now log in with the new password
      const loginRes = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: {
          email: invitedEmail,
          password: "MyNewPassword123!",
        },
      });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.email).toBe(invitedEmail);
      expect(loginRes.body.fullName).toBe("Franco Baresi");
      expect(loginRes.body.role).toBe("technician");
      expect(loginRes.body.emailConfirmed).toBe(true);
    });

    it("rejects expired invite tokens at lookup and consume time", async () => {
      const inviter = (await db.findUserByEmail("admin@rossi.it"))!;
      const email = `expired-${Date.now()}@rossi.it`;
      const rawToken = generateSecureToken();
      const tokenHash = hashToken(rawToken);

      // Create invite expired 1 day ago
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { hash, salt } = hashPassword("dummy-pass");

      await db.createTeamMemberWithInvite({
        companyId: inviter.companyId,
        companyName: inviter.companyName,
        inviterId: inviter.id,
        email,
        fullName: "Expired User",
        role: "technician",
        passwordHash: hash,
        salt,
        tokenHash,
        expiresAt: pastDate,
      });

      // GET should reject expired token
      const getRes = await apiRequest(`/api/v1/auth/invite?token=${rawToken}`);
      expect(getRes.status).toBe(404);

      // POST consume should reject expired token
      const acceptRes = await apiRequest("/api/v1/auth/accept-invite", {
        method: "POST",
        body: {
          token: rawToken,
          password: "ValidPassword123!",
        },
      });
      expect(acceptRes.status).toBe(400);
    });

    it("rejects revoked invite tokens", async () => {
      const teamService = new TeamService(db);
      const inviter = (await db.findUserByEmail("admin@rossi.it"))!;
      const email = `reinvite-${Date.now()}@rossi.it`;

      // Invite user first time
      const firstInvite = await teamService.inviteTeamMember(
        inviter.companyId,
        inviter.companyName,
        inviter.id,
        { email, fullName: "Reinvited User", role: "technician" },
      );

      // Admin reinvites / creates new token, revoking the first one
      const rawToken1 = firstInvite.inviteToken;
      await db.revokeInviteTokensByEmail(inviter.companyId, email);

      // First token should now be rejected as revoked
      const getRes = await apiRequest(`/api/v1/auth/invite?token=${rawToken1}`);
      expect(getRes.status).toBe(404);

      const acceptRes = await apiRequest("/api/v1/auth/accept-invite", {
        method: "POST",
        body: {
          token: rawToken1,
          password: "ValidPassword123!",
        },
      });
      expect(acceptRes.status).toBe(400);
    });

    it("prevents reuse of an already-consumed invite token (Single-Use Enforcement)", async () => {
      const teamService = new TeamService(db);
      const inviter = (await db.findUserByEmail("admin@rossi.it"))!;
      const email = `singleuse-${Date.now()}@rossi.it`;

      const invite = await teamService.inviteTeamMember(
        inviter.companyId,
        inviter.companyName,
        inviter.id,
        { email, fullName: "Single Use User", role: "technician" },
      );

      // Consume first time
      const firstAccept = await apiRequest("/api/v1/auth/accept-invite", {
        method: "POST",
        body: {
          token: invite.inviteToken,
          password: "FirstPassword123!",
        },
      });
      expect(firstAccept.status).toBe(200);

      // Try consuming a second time with the same token
      const secondAccept = await apiRequest("/api/v1/auth/accept-invite", {
        method: "POST",
        body: {
          token: invite.inviteToken,
          password: "SecondPassword123!",
        },
      });
      expect(secondAccept.status).toBe(400);
    });

    it("rejects invalid, malformed, or nonexistent tokens", async () => {
      const getRes = await apiRequest("/api/v1/auth/invite?token=nonexistent-invalid-token");
      expect(getRes.status).toBe(404);

      const postRes = await apiRequest("/api/v1/auth/accept-invite", {
        method: "POST",
        body: {
          token: "nonexistent-token",
          password: "ValidPassword123!",
        },
      });
      expect(postRes.status).toBe(400);
    });
  });

  describe("3. Atomicity & Tenant Isolation", () => {
    it("invite creation is atomic: rolls back if email already exists without partial user", async () => {
      const teamService = new TeamService(db);
      const inviter = (await db.findUserByEmail("admin@rossi.it"))!;

      // Attempt to invite an email that already exists
      await expect(
        teamService.inviteTeamMember(
          inviter.companyId,
          inviter.companyName,
          inviter.id,
          { email: "tech@rossi.it", fullName: "Duplicate Email", role: "technician" },
        ),
      ).rejects.toThrow();

      // Ensure no dangling invite was created
      const pending = await db.getPendingInvitesByCompany(inviter.companyId);
      const dangling = pending.find((p) => p.invitedEmail === "tech@rossi.it");
      expect(dangling).toBeUndefined();
    });

    it("enforces tenant isolation: company A cannot update or access company B team members", async () => {
      const teamService = new TeamService(db);

      // Create company B
      const regRes = await apiRequest("/api/v1/auth/register", {
        method: "POST",
        body: {
          email: `comp-b-${Date.now()}@test.it`,
          password: "Password1234!",
          full_name: "Company B Owner",
          company_name: "Company B Srl",
        },
      });
      const companyBId = regRes.body.companyId;

      // User from Company A (Rossi Impianti Srl)
      const userA = (await db.findUserByEmail("tech@rossi.it"))!;

      // Company B tries to access User A
      await expect(
        teamService.getTeamMember(companyBId, userA.id),
      ).rejects.toThrow("Utente non trovato in questa azienda.");

      // Company B tries to update User A's role
      await expect(
        teamService.updateTeamMember(companyBId, userA.id, "some-executor", { role: "admin" }),
      ).rejects.toThrow("Utente non trovato in questa azienda.");

      // Verify User A role is unchanged
      const freshUserA = await db.findUserById(userA.id);
      expect(freshUserA?.role).toBe("technician");
    });

    it("atomically updates role/status and increments authVersion in the same mutation", async () => {
      const teamService = new TeamService(db);
      const user = (await db.findUserByEmail("tech@rossi.it"))!;
      const initialAuthVersion = user.authVersion || 0;

      // 1. Role update
      const updated = await teamService.updateTeamMember(
        user.companyId,
        user.id,
        "admin-executor-id",
        { role: "responsabile_tecnico" },
      );
      expect(updated.role).toBe("responsabile_tecnico");

      const dbUserAfterRole = (await db.findUserById(user.id))!;
      expect(dbUserAfterRole.role).toBe("responsabile_tecnico");
      expect(dbUserAfterRole.authVersion).toBe(initialAuthVersion + 1);

      // 2. Status update (deactivate)
      const deactivated = await teamService.changeMemberStatus(
        user.companyId,
        user.id,
        "admin-executor-id",
        false,
      );
      expect(deactivated.isActive).toBe(false);

      const dbUserAfterStatus = (await db.findUserById(user.id))!;
      expect(dbUserAfterStatus.isActive).toBe(false);
      expect(dbUserAfterStatus.authVersion).toBe(initialAuthVersion + 2);
    });
  });
});
