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
  const { config, PLATFORM_CEO_EMAIL } = await import("./config");
  config.EMAIL_VERIFICATION_ENABLED = false;
  // Keep this suite deterministic even when the runner injects a legacy SUPERADMIN_EMAIL.
  config.SUPERADMIN_EMAIL = PLATFORM_CEO_EMAIL;
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


describe("P0-ROLE — platform authority cannot be granted through tenant flows", () => {
  it("seeds platform CEO authority only for the canonical trusted email", async () => {
    const master = await db.findUserById("usr-superadmin-001");
    expect(master?.email).toBe("jack.cardinali15@gmail.com");
    expect(master?.role).toBe("superadmin");
    expect(master?.platformRole).toBe("ceo");

    const legacyAddress = await db.findUserByEmail("saas@rapporti.it");
    if (legacyAddress) {
      expect(legacyAddress.platformRole ?? null).toBeNull();
    }
  });

  it("ignores client-supplied platformRole and superadmin role during registration", async () => {
    const email = `platform-escalation-${Date.now()}@buildcorp.it`;
    const res = await apiRequest("/api/v1/auth/register", {
      method: "POST",
      body: {
        email,
        password: "SecurePassword123!",
        full_name: "Test Registration",
        company_name: "Test Impianti Srl",
        role: "superadmin",
        platformRole: "ceo",
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("owner");
    expect(res.body.platformRole).toBeUndefined();

    const storedUser = await db.findUserByEmail(email);
    expect(storedUser?.role).toBe("owner");
    expect(storedUser?.platformRole ?? null).toBeNull();
  });

  it("rejects attempts to invite a member with a platform role as a company role", async () => {
    const inviter = (await db.findUserByEmail("admin@rossi.it"))!;
    const teamService = new TeamService(db);

    await expect(
      teamService.inviteTeamMember(
        inviter.companyId,
        inviter.companyName,
        inviter.id,
        {
          email: `ceo-invite-${Date.now()}@rossi.it`,
          fullName: "Unauthorized Platform User",
          role: "ceo",
        } as any,
      ),
    ).rejects.toThrow(/ruolo non valido o non assegnabile/i);
  });

  it("does not persist a client-supplied platformRole during ordinary team updates", async () => {
    const inviter = (await db.findUserByEmail("admin@rossi.it"))!;
    const teamService = new TeamService(db);
    const email = `platform-update-${Date.now()}@rossi.it`;
    const invited = await teamService.inviteTeamMember(
      inviter.companyId,
      inviter.companyName,
      inviter.id,
      { email, fullName: "Ordinary Team Member", role: "technician" },
    );

    const updated = await teamService.updateTeamMember(
      inviter.companyId,
      invited.member.id,
      inviter.id,
      { fullName: "Updated Team Member", platformRole: "ceo" } as any,
    );

    expect(updated.fullName).toBe("Updated Team Member");
    expect((await db.getUserByIdAndCompany(invited.member.id, inviter.companyId))?.platformRole ?? null).toBeNull();
  });
});

describe("P1.1-RUNTIME — Input Validation & Fail-Closed Error Handling", () => {
  it("inviteTeamMember rejects non-string, null, or out-of-bounds input payloads gracefully", async () => {
    const inviter = (await db.findUserByEmail("admin@rossi.it"))!;
    const teamService = new TeamService(db);

    // Non-object input
    await expect(
      teamService.inviteTeamMember(inviter.companyId, inviter.companyName, inviter.id, null as any),
    ).rejects.toThrow("I dati invito team inviati non sono validi.");

    // Non-string or short fullName
    await expect(
      teamService.inviteTeamMember(inviter.companyId, inviter.companyName, inviter.id, {
        email: "valid@rossi.it",
        fullName: 12345 as any,
        role: "technician",
      }),
    ).rejects.toThrow("Nome completo deve essere una stringa valida.");

    await expect(
      teamService.inviteTeamMember(inviter.companyId, inviter.companyName, inviter.id, {
        email: "valid@rossi.it",
        fullName: "A",
        role: "technician",
      }),
    ).rejects.toThrow("Nome completo non valido. Deve essere tra 2 e 100 caratteri.");

    // Non-string or invalid email
    await expect(
      teamService.inviteTeamMember(inviter.companyId, inviter.companyName, inviter.id, {
        email: { address: "invalid" } as any,
        fullName: "Valid Name",
        role: "technician",
      }),
    ).rejects.toThrow("Email deve essere una stringa valida.");

    await expect(
      teamService.inviteTeamMember(inviter.companyId, inviter.companyName, inviter.id, {
        email: "not-an-email",
        fullName: "Valid Name",
        role: "technician",
      }),
    ).rejects.toThrow("Formato email non valido.");

    // Non-string or overly long phoneNumber
    await expect(
      teamService.inviteTeamMember(inviter.companyId, inviter.companyName, inviter.id, {
        email: `phone-test-${Date.now()}@rossi.it`,
        fullName: "Valid Name",
        role: "technician",
        phoneNumber: 333123456 as any,
      }),
    ).rejects.toThrow("Telefono deve essere una stringa valida.");

    await expect(
      teamService.inviteTeamMember(inviter.companyId, inviter.companyName, inviter.id, {
        email: `phone-test-${Date.now()}@rossi.it`,
        fullName: "Valid Name",
        role: "technician",
        phoneNumber: "12345678901234567890123", // 23 chars (> 20)
      }),
    ).rejects.toThrow("Numero di telefono non valido (massimo 20 caratteri).");
  });

  it("updateTeamMember rejects non-string or out-of-bounds updates gracefully", async () => {
    const inviter = (await db.findUserByEmail("admin@rossi.it"))!;
    const tech = (await db.findUserByEmail("tech@rossi.it"))!;
    const teamService = new TeamService(db);

    // Non-object input
    await expect(
      teamService.updateTeamMember(inviter.companyId, tech.id, inviter.id, null as any),
    ).rejects.toThrow("I dati aggiornamento team inviati non sono validi.");

    // Non-string fullName
    await expect(
      teamService.updateTeamMember(inviter.companyId, tech.id, inviter.id, {
        fullName: 9999 as any,
      }),
    ).rejects.toThrow("Nome completo deve essere una stringa valida.");

    // Out-of-bounds fullName (<2 or >100)
    await expect(
      teamService.updateTeamMember(inviter.companyId, tech.id, inviter.id, {
        fullName: "X",
      }),
    ).rejects.toThrow("Nome completo non valido. Deve essere tra 2 e 100 caratteri.");

    // Non-string phoneNumber
    await expect(
      teamService.updateTeamMember(inviter.companyId, tech.id, inviter.id, {
        phoneNumber: { num: "3331234567" } as any,
      }),
    ).rejects.toThrow("Telefono deve essere una stringa valida.");

    // Overly long phoneNumber
    await expect(
      teamService.updateTeamMember(inviter.companyId, tech.id, inviter.id, {
        phoneNumber: "12345678901234567890123",
      }),
    ).rejects.toThrow("Numero di telefono non valido (massimo 20 caratteri).");
  });

  it("PUT /api/v1/users/me fails closed when tokenStore is unavailable during email update", async () => {
    const { config } = await import("./config");
    config.EMAIL_VERIFICATION_ENABLED = true;

    const user = (await db.findUserByEmail("admin@rossi.it"))!;
    const { generateTokens, generateCsrfToken } = await import("./security");
    const { accessToken } = generateTokens(user);
    const csrfToken = generateCsrfToken();
    const cookies = {
      access_token: accessToken,
      csrf_token: csrfToken,
    };

    // Disable token store
    tokenStore.setAvailability(false);

    const res = await apiRequest("/api/v1/users/me", {
      method: "PUT",
      cookies,
      headers: {
        "x-csrf-token": csrfToken,
      },
      body: {
        email: "new-email-failclosed@rossi.it",
      },
    });

    expect(res.status).toBe(503);
    expect(res.body.detail).toContain("Servizio di sicurezza temporaneamente non disponibile");

    // Verify email was NOT updated in DB
    const freshUser = await db.findUserById(user.id);
    expect(freshUser?.email).toBe("admin@rossi.it");

    // Re-enable token store
    tokenStore.setAvailability(true);
    config.EMAIL_VERIFICATION_ENABLED = false;
  });

});

describe("P0-ROLE — concurrent last-admin protection", () => {
  it("preserves one active admin when two admins concurrently demote each other", async () => {
    const teamService = new TeamService(db);
    const firstAdmin = (await db.findUserByEmail("admin@rossi.it"))!;
    const invited = await teamService.inviteTeamMember(
      firstAdmin.companyId,
      firstAdmin.companyName,
      firstAdmin.id,
      {
        email: `concurrent-admin-${Date.now()}@rossi.it`,
        fullName: "Second Admin",
        role: "admin",
      },
    );
    const secondAdmin = await db.getUserByIdAndCompany(invited.member.id, firstAdmin.companyId);
    expect(secondAdmin?.role).toBe("admin");

    const results = await Promise.allSettled([
      teamService.updateTeamMember(firstAdmin.companyId, firstAdmin.id, secondAdmin!.id, {
        role: "technician",
      }),
      teamService.updateTeamMember(firstAdmin.companyId, secondAdmin!.id, firstAdmin.id, {
        role: "technician",
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const activeAdmins = (await db.getUsersByCompany(firstAdmin.companyId)).filter(
      (member) => member.isActive && (member.role === "owner" || member.role === "admin"),
    );
    expect(activeAdmins).toHaveLength(1);
  });
});
