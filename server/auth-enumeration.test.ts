import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { config } from "./config";
import { db } from "./db";
import { emailService } from "./email-service";

const app = createApp();
let previousEmailVerificationEnabled = false;

beforeEach(() => {
  previousEmailVerificationEnabled = config.EMAIL_VERIFICATION_ENABLED;
  config.EMAIL_VERIFICATION_ENABLED = true;
  db.seedInitialData();
});

afterEach(() => {
  vi.restoreAllMocks();
  config.EMAIL_VERIFICATION_ENABLED = previousEmailVerificationEnabled;
});

async function createKnownAccount() {
  const { user } = await db.createUser({
    email: "reset-enumeration-" + randomUUID() + "@example.com",
    fullName: "Password Reset Test",
    password: "Password123!",
    companyName: "Reset Test Company",
    emailConfirmed: true,
    role: "owner",
  });
  return user;
}

describe("Password reset account enumeration protection", () => {
  it("returns the same response when the email provider reports failure", async () => {
    const user = await createKnownAccount();
    vi.spyOn(emailService, "sendPasswordResetEmail").mockResolvedValue({
      success: false,
      error: "provider unavailable",
    });

    const knownAccount = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email });
    const unknownAccount = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "not-registered@example.com" });

    expect(knownAccount.status).toBe(200);
    expect(unknownAccount.status).toBe(200);
    expect(knownAccount.body).toEqual(unknownAccount.body);
  });

  it("returns the same response when the email provider throws", async () => {
    const user = await createKnownAccount();
    vi.spyOn(emailService, "sendPasswordResetEmail").mockRejectedValue(
      new Error("provider unavailable"),
    );

    const knownAccount = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email });
    const unknownAccount = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "not-registered@example.com" });

    expect(knownAccount.status).toBe(200);
    expect(unknownAccount.status).toBe(200);
    expect(knownAccount.body).toEqual(unknownAccount.body);
  });
});
