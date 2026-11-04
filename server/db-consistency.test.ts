import { randomUUID } from "crypto";
import { describe, expect, it, vi } from "vitest";
import { DatabaseStore } from "./db";

describe("In-memory user creation concurrency contract", () => {
  it("allows at most one concurrent registration for the same normalized email", async () => {
    const db = new DatabaseStore();
    const email = `race-${randomUUID()}@example.test`;
    const params = {
      email,
      fullName: "Concurrent Registration",
      password: "TestPassword123!",
      companyName: "Concurrency Test",
    };

    const results = await Promise.allSettled([
      db.createUser(params),
      db.createUser({ ...params, email: ` ${email.toUpperCase()} ` }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await db.findUserByEmail(email)).not.toBeNull();
  });

  it("allows at most one concurrent team invite for the same normalized email", async () => {
    const db = new DatabaseStore();
    const email = `invite-race-${randomUUID()}@example.test`;
    const params = {
      companyId: "comp-rossi-001",
      companyName: "Rossi Impianti Srl",
      inviterId: "usr-rossi-admin",
      email,
      fullName: "Concurrent Invite",
      role: "technician" as const,
      passwordHash: "test-hash",
      salt: "test-salt",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    const results = await Promise.allSettled([
      db.createTeamMemberWithInvite({ ...params, tokenHash: randomUUID() }),
      db.createTeamMemberWithInvite({ ...params, email: ` ${email.toUpperCase()} `, tokenHash: randomUUID() }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await db.findUserByEmail(email)).not.toBeNull();
  });

  it("reuses the same Google user for concurrent sign-ins with the same normalized email", async () => {
    const db = new DatabaseStore();
    const email = `google-race-${randomUUID()}@example.test`;
    const params = { email, fullName: "Concurrent Google User" };

    const [first, second] = await Promise.all([
      db.createGoogleUser(params),
      db.createGoogleUser({ ...params, email: ` ${email.toUpperCase()} ` }),
    ]);

    expect(first.user.id).toBe(second.user.id);
    expect(await db.findUserByEmail(email)).toMatchObject({
      id: first.user.id,
      provider: "google",
    });
  });

  it("rejects an email-verification token at its exact expiry timestamp", async () => {
    const db = new DatabaseStore();
    const expiresAt = new Date("2026-11-04T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(expiresAt);
    try {
      const user = await db.findUserByEmail("admin@rossi.it");
      expect(user).not.toBeNull();
      const emailConfirmedBefore = user!.emailConfirmed;
      await db.createAuthToken({
        userId: user!.id,
        tokenHash: "exact-expiry-verification-token",
        type: "email_verification",
        expiresAt: expiresAt.toISOString(),
      });

      await expect(
        db.verifyEmailWithToken("exact-expiry-verification-token"),
      ).resolves.toMatchObject({
        success: false,
        error: "expired_token",
      });
      expect((await db.findUserById(user!.id))?.emailConfirmed).toBe(emailConfirmedBefore);
    } finally {
      vi.useRealTimers();
    }
  });
});
