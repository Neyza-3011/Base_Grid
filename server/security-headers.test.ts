import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { createSecurityHeadersMiddleware } from "./middleware/security-headers";
import express from "express";

// Mock assertValidJwtSecret and getJwtSecret so createApp can initialize cleanly in tests
vi.mock("./security", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    assertValidJwtSecret: vi.fn(),
    getJwtSecret: vi.fn(() => "test-jwt-secret-at-least-32-chars-long"),
  };
});

describe("P0.4.4-G — HTTP Security Hardening", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("Unit: Security Headers Middleware", () => {
    it("sets baseline security headers in development environment without HSTS", async () => {
      const app = express();
      app.use(createSecurityHeadersMiddleware({ isProduction: false }));
      app.get("/test", (_req, res) => res.json({ ok: true }));

      const res = await request(app).get("/test");

      expect(res.status).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(res.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=()");
      expect(res.headers["strict-transport-security"]).toBeUndefined();
    });

    it("sets Strict-Transport-Security in production environment with max-age and includeSubDomains", async () => {
      const app = express();
      app.use(createSecurityHeadersMiddleware({ isProduction: true }));
      app.get("/test", (_req, res) => res.json({ ok: true }));

      const res = await request(app).get("/test");

      expect(res.status).toBe(200);
      expect(res.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
    });
  });

  describe("Integration: Express Application API & Health Headers", () => {
    it("ensures API responses contain all required security headers (development/test mode)", async () => {
      process.env.NODE_ENV = "test";
      const app = createApp();

      // Test against an existing unauthenticated API endpoint
      const res = await request(app).get("/api/v1/auth/csrf-token");

      expect(res.status).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(res.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=()");
      // HSTS must not be set in development / test
      expect(res.headers["strict-transport-security"]).toBeUndefined();
      // X-Powered-By must be removed
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("ensures /health responds normally and includes security headers without HSTS in development", async () => {
      process.env.NODE_ENV = "development";
      const app = createApp();

      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          status: "healthy",
          service: "BaseGrid Server-Authoritative Backend",
        })
      );
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(res.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=()");
      expect(res.headers["strict-transport-security"]).toBeUndefined();
    });

    it("ensures HSTS is present in production environment for API and health endpoints", async () => {
      process.env.NODE_ENV = "production";
      const app = createApp();

      const resHealth = await request(app).get("/health");
      expect(resHealth.status).toBe(200);
      expect(resHealth.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
      expect(resHealth.headers["x-content-type-options"]).toBe("nosniff");
      expect(resHealth.headers["x-frame-options"]).toBe("DENY");

      const resApi = await request(app).get("/api/v1/auth/csrf-token");
      expect(resApi.status).toBe(200);
      expect(resApi.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
    });

    it("ensures existing API routes continue to function normally with tenant isolation & auth guards", async () => {
      process.env.NODE_ENV = "test";
      const app = createApp();

      // Protected route returns 401 unauthenticated with security headers intact
      const res = await request(app).get("/api/v1/reports");
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("detail");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(res.headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    });

    it("ensures 404 unhandled API endpoints include security headers", async () => {
      process.env.NODE_ENV = "test";
      const app = createApp();

      const res = await request(app).get("/api/v1/non-existent-endpoint");
      expect(res.status).toBe(404);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
    });
  });
});
