import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { db } from "./db";
import { tokenStore } from "./token-store";
import { config } from "./config";

describe("P0.4.4-H1 — Production Readiness & Liveness (/health vs /ready)", () => {
  const app = createApp();

  beforeEach(() => {
    // Reset availability to true before each test
    if (typeof db.setAvailability === "function") {
      db.setAvailability(true);
    }
    tokenStore.setAvailability(true);
  });

  afterEach(() => {
    if (typeof db.setAvailability === "function") {
      db.setAvailability(true);
    }
    tokenStore.setAvailability(true);
    vi.restoreAllMocks();
  });

  describe("1. /health (Liveness Probe)", () => {
    it("returns 200 OK when DB and Redis are available", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.service).toBe("BaseGrid Server-Authoritative Backend");
    });

    it("returns 200 OK even when DB is completely unavailable", async () => {
      if (typeof db.setAvailability === "function") {
        db.setAvailability(false);
      }
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });

    it("returns 200 OK even when Redis/TokenStore is completely unavailable", async () => {
      tokenStore.setAvailability(false);
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });

    it("returns 200 OK even when BOTH DB and Redis are down", async () => {
      if (typeof db.setAvailability === "function") {
        db.setAvailability(false);
      }
      tokenStore.setAvailability(false);
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
    });

    it("includes required security headers on /health", async () => {
      const res = await request(app).get("/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(res.headers["permissions-policy"]).toBeDefined();
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });
  });

  describe("2. /ready (Readiness Probe)", () => {
    it("returns 200 with { status: 'ready' } when both PostgreSQL and Redis are available", async () => {
      const res = await request(app).get("/ready");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ready" });
    });

    it("fails closed with 503 and { status: 'not_ready' } when DB ping fails", async () => {
      if (typeof db.setAvailability === "function") {
        db.setAvailability(false);
      }
      const res = await request(app).get("/ready");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: "not_ready" });
    });

    it("fails closed with 503 and { status: 'not_ready' } when DB ping throws an exception", async () => {
      vi.spyOn(db, "ping").mockRejectedValueOnce(new Error("FATAL: connection terminated unexpectedly"));
      const res = await request(app).get("/ready");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: "not_ready" });
    });

    it("fails closed with 503 and { status: 'not_ready' } when Redis ping fails", async () => {
      tokenStore.setAvailability(false);
      const res = await request(app).get("/ready");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: "not_ready" });
    });

    it("fails closed with 503 and { status: 'not_ready' } when Redis ping throws an exception", async () => {
      vi.spyOn(tokenStore, "ping").mockRejectedValueOnce(new Error("ECONNREFUSED 127.0.0.1:6379"));
      const res = await request(app).get("/ready");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: "not_ready" });
    });

    it("fails closed with 503 when both DB and Redis are down", async () => {
      if (typeof db.setAvailability === "function") {
        db.setAvailability(false);
      }
      tokenStore.setAvailability(false);
      const res = await request(app).get("/ready");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: "not_ready" });
    });

    it("includes required security headers on /ready", async () => {
      const res = await request(app).get("/ready");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(res.headers["permissions-policy"]).toBeDefined();
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("never leaks secrets, credentials, hostnames, passwords or internal errors in 503 responses", async () => {
      vi.spyOn(db, "ping").mockRejectedValueOnce(new Error("postgres://user:super_secret_password@db.internal:5432/proddb"));
      vi.spyOn(tokenStore, "ping").mockRejectedValueOnce(new Error("redis://:redis_secret_token@redis.internal:6379/0"));

      const res = await request(app).get("/ready");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: "not_ready" });

      const text = JSON.stringify(res.body);
      expect(text).not.toContain("postgres");
      expect(text).not.toContain("super_secret_password");
      expect(text).not.toContain("redis");
      expect(text).not.toContain("redis_secret_token");
      expect(text).not.toContain("internal");
    });
  });

  describe("3. Production Environment Gate", () => {
    it("fails closed (503) in production if DATABASE_URL is missing", async () => {
      const originalEnv = config.NODE_ENV;
      const originalDbUrl = config.DATABASE_URL;
      const originalRedisUrl = config.REDIS_URL;

      try {
        (config as any).NODE_ENV = "production";
        (config as any).DATABASE_URL = "";
        (config as any).REDIS_URL = "redis://localhost:6379";

        const res = await request(app).get("/ready");
        expect(res.status).toBe(503);
        expect(res.body).toEqual({ status: "not_ready" });
      } finally {
        (config as any).NODE_ENV = originalEnv;
        (config as any).DATABASE_URL = originalDbUrl;
        (config as any).REDIS_URL = originalRedisUrl;
      }
    });

    it("fails closed (503) in production if REDIS_URL is missing", async () => {
      const originalEnv = config.NODE_ENV;
      const originalDbUrl = config.DATABASE_URL;
      const originalRedisUrl = config.REDIS_URL;
      const originalRedisHost = config.REDIS_HOST;

      try {
        (config as any).NODE_ENV = "production";
        (config as any).DATABASE_URL = "postgres://user:pass@localhost:5432/db";
        (config as any).REDIS_URL = "";
        (config as any).REDIS_HOST = "127.0.0.1";

        const res = await request(app).get("/ready");
        expect(res.status).toBe(503);
        expect(res.body).toEqual({ status: "not_ready" });
      } finally {
        (config as any).NODE_ENV = originalEnv;
        (config as any).DATABASE_URL = originalDbUrl;
        (config as any).REDIS_URL = originalRedisUrl;
        (config as any).REDIS_HOST = originalRedisHost;
      }
    });
  });
});
