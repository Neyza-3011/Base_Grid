import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { rateLimiter } from "./rate-limiter";
import { db } from "./db";

const app = createApp();

describe("P0.4.4-D - Production Rate Limiting & Abuse Protection", () => {
  beforeEach(async () => {
    (rateLimiter as any).localFallback.clear();
  });

  afterEach(() => {
    (rateLimiter as any).localFallback.clear();
  });

  it("should return 429 when login limit is exceeded", async () => {
    // loginLimiter: 10 requests per 15 minutes
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post("/api/v1/auth/login").set("X-Test-RateLimit", "enable").send({ email: "tech@rossi.it", password: "wrong" });
      expect(res.status).not.toBe(429);
    }
    
    // 11th request should be 429
    const res = await request(app).post("/api/v1/auth/login").set("X-Test-RateLimit", "enable").send({ email: "tech@rossi.it", password: "wrong" });
    expect(res.status).toBe(429);
    expect(res.body.detail).toContain("Troppi tentativi di accesso");
  });

  it("should return 429 when register limit is exceeded", async () => {
    // registerLimiter: 5 requests per hour
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post("/api/v1/auth/register").set("X-Test-RateLimit", "enable").send({ 
        email: `new${i}@test.com`, password: "Password123!", full_name: "Test", company_name: "Test Co" 
      });
      expect(res.status).not.toBe(429);
    }
    
    const res = await request(app).post("/api/v1/auth/register").set("X-Test-RateLimit", "enable").send({ 
        email: `new6@test.com`, password: "Password123!", full_name: "Test", company_name: "Test Co" 
      });
    expect(res.status).toBe(429);
    expect(res.body.detail).toContain("Troppe registrazioni");
  });

  it("should not block /health even if API limit is exceeded", async () => {
    // generalApiLimiter: 1000 requests per 5 mins.
    // Let's just manually override the limit for the test
    const entry = { count: 1000, expiresAt: Date.now() + 60000 };
    (rateLimiter as any).localFallback.set("ratelimit:rl:api:::ffff:127.0.0.1", entry);

    const apiRes = await request(app).get("/api/v1/users/me").set("X-Test-RateLimit", "enable");
    expect(apiRes.status).toBe(429);
    
    const healthRes = await request(app).get("/health");
    expect(healthRes.status).toBe(200);
  });

  it("should return 429 when login email/account limit is exceeded independently of IP", async () => {
    // 10 requests from different IPs (spoofted via X-Forwarded-For) but same email
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Test-RateLimit", "enable")
        .set("X-Forwarded-For", `192.168.2.${i}`)
        .send({ email: "target@rossi.it", password: "wrong" });
      expect(res.status).not.toBe(429);
    }
    
    // 11th request from another IP but SAME email should be blocked by account limiter
    const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Test-RateLimit", "enable")
        .set("X-Forwarded-For", `192.168.2.11`)
        .send({ email: "target@rossi.it", password: "wrong" });
        
    expect(res.status).toBe(429);
    expect(res.body.detail).toContain("account");
  });
});
