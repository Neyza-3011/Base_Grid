import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { db } from "./db";

const TEST_JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";

describe("CSRF middleware integration in the real application", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    db.seedInitialData();
  });

  it("rejects a state-changing API request without CSRF before authentication", async () => {
    const response = await request(createApp())
      .post("/api/v1/reports")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.detail).toMatch(/CSRF/i);
  });

  it("allows a matching CSRF pair through the global middleware to route authentication", async () => {
    const response = await request(createApp())
      .post("/api/v1/reports")
      .set("Cookie", "csrf_token=integration-test-token")
      .set("x-csrf-token", "integration-test-token")
      .send({});

    // CSRF passed; the protected route then rejects the missing access session.
    expect(response.status).toBe(401);
    expect(response.body.detail).not.toMatch(/CSRF/i);
  });

  it("rejects a mismatched CSRF pair in the real application", async () => {
    const response = await request(createApp())
      .patch("/api/v1/reports/report-test")
      .set("Cookie", "csrf_token=cookie-token")
      .set("x-csrf-token", "header-token")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.detail).toMatch(/CSRF/i);
  });

  it("keeps the login lifecycle endpoint reachable without a CSRF token", async () => {
    const response = await request(createApp())
      .post("/api/v1/auth/login")
      .send({});

    // The endpoint is reached and validates its request body instead of failing CSRF.
    expect(response.status).toBe(400);
    expect(response.body.detail).not.toMatch(/CSRF/i);
  });

  it("does not require CSRF for safe methods, while authentication remains enforced", async () => {
    const response = await request(createApp()).get("/api/v1/reports");

    expect(response.status).toBe(401);
    expect(response.body.detail).not.toMatch(/CSRF/i);
  });
});
