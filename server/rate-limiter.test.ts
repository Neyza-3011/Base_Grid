import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { rateLimiter } from "./rate-limiter";
import { config } from "./config";

describe("Rate Limiter Middleware", () => {
  beforeEach(() => {
    // Reset local fallback map for tests if any
    (rateLimiter as any).localFallback.clear();
  });

  it("should allow requests under the limit", async () => {
    const app = express();
    app.set("trust proxy", 1);
    const limiter = rateLimiter.middleware({ points: 2, duration: 60, failClosed: true });
    app.get("/", limiter, (req, res) => { res.status(200).send("OK"); });

    const res1 = await request(app).get("/").set("X-Test-RateLimit", "enable").set("X-Test-RateLimit", "enable").set("X-Forwarded-For", "192.168.1.1");
    expect(res1.status).toBe(200);
    expect(res1.header["x-ratelimit-remaining"]).toBe("1");

    const res2 = await request(app).get("/").set("X-Test-RateLimit", "enable").set("X-Test-RateLimit", "enable").set("X-Forwarded-For", "192.168.1.1");
    expect(res2.status).toBe(200);
    expect(res2.header["x-ratelimit-remaining"]).toBe("0");
  });

  it("should block requests over the limit and return 429", async () => {
    const app = express();
    app.set("trust proxy", 1);
    const limiter = rateLimiter.middleware({ points: 2, duration: 60, errorMessage: "Too many" });
    app.get("/", limiter, (req, res) => { res.status(200).send("OK"); });

    await request(app).get("/").set("X-Test-RateLimit", "enable").set("X-Test-RateLimit", "enable").set("X-Forwarded-For", "192.168.1.2");
    await request(app).get("/").set("X-Test-RateLimit", "enable").set("X-Test-RateLimit", "enable").set("X-Forwarded-For", "192.168.1.2");
    const res3 = await request(app).get("/").set("X-Test-RateLimit", "enable").set("X-Test-RateLimit", "enable").set("X-Forwarded-For", "192.168.1.2");
    
    expect(res3.status).toBe(429);
    expect(res3.body.detail).toBe("Too many");
    expect(res3.header["retry-after"]).toBeDefined();
  });

  it("should not share limits across different IPs", async () => {
    const app = express();
    app.set("trust proxy", 1);
    const limiter = rateLimiter.middleware({ points: 1, duration: 60 });
    app.get("/", limiter, (req, res) => { res.status(200).send("OK"); });

    const res1 = await request(app).get("/").set("X-Test-RateLimit", "enable").set("X-Test-RateLimit", "enable").set("X-Forwarded-For", "10.0.0.1");
    expect(res1.status).toBe(200);

    const res2 = await request(app).get("/").set("X-Test-RateLimit", "enable").set("X-Test-RateLimit", "enable").set("X-Forwarded-For", "10.0.0.2");
    expect(res2.status).toBe(200);
  });
  
  it("should fail closed if Redis is offline in production and failClosed is true", async () => {
    // Mock production environment behavior for fallback
    const app = express();
    app.set("trust proxy", 1);
    const limiter = rateLimiter.middleware({ points: 2, duration: 60, failClosed: true });
    app.get("/", limiter, (req, res) => { res.status(200).send("OK"); });
    
    // Simulate redis offline and production env
    const originalEnv = config.NODE_ENV;
    const originalRedis = (rateLimiter as any).redisClient;
    config.NODE_ENV = "production";
    (rateLimiter as any).redisClient = null; // simulate no redis client 
    
    try {
      const res = await request(app).get("/").set("X-Test-RateLimit", "enable");
      expect(res.status).toBe(503);
      expect(res.body.detail).toContain("Servizio temporaneamente non disponibile");
    } finally {
      config.NODE_ENV = originalEnv;
      (rateLimiter as any).redisClient = originalRedis;
    }
  });

  it("should allow health endpoint without limit", async () => {
    // Import real app
    const { createApp } = await import("./app");
    const app = createApp();
    
    for (let i = 0; i < 15; i++) {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
    }
  });
});
