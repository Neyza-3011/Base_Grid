import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { rateLimiter } from "./rate-limiter";
import { db } from "./db";

const app = createApp();

describe("P0.4.4-D - Production Rate Limiting & Abuse Protection", () => {
  const originalRedis = (rateLimiter as any).redisClient;

  beforeEach(async () => {
    delete process.env.BASEGRID_RUNTIME_MODE;
    (rateLimiter as any).redisClient = null;
    await rateLimiter.reset();
  });

  afterEach(async () => {
    await rateLimiter.reset();
    (rateLimiter as any).redisClient = originalRedis;
  });

  it("should return 429 when login limit is exceeded", async () => {
    // loginLimiter: 10 requests per 15 minutes
    const testIp = `192.168.250.${Math.floor(Math.random() * 100) + 1}`;
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Test-RateLimit", "enable")
        .set("X-Forwarded-For", testIp)
        .send({ email: "login-limit-test@test.com", password: "wrong" });
      expect(res.status).not.toBe(429);
    }
    
    // 11th request should be 429
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-Test-RateLimit", "enable")
      .set("X-Forwarded-For", testIp)
      .send({ email: "login-limit-test@test.com", password: "wrong" });
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
    (rateLimiter as any).localFallback.set("ratelimit:rl:api:127.0.0.1", entry);
    (rateLimiter as any).localFallback.set("ratelimit:rl:api:::1", entry);

    const redis = await rateLimiter.getRedisClient();
    if (redis && redis.status === "ready") {
      await redis.set("ratelimit:rl:api:::ffff:127.0.0.1", 1000, "EX", 60);
      await redis.set("ratelimit:rl:api:127.0.0.1", 1000, "EX", 60);
      await redis.set("ratelimit:rl:api:::1", 1000, "EX", 60);
    }

    try {
      const apiRes = await request(app).get("/api/v1/users/me").set("X-Test-RateLimit", "enable");
      expect(apiRes.status).toBe(429);
      
      const healthRes = await request(app).get("/health");
      expect(healthRes.status).toBe(200);
    } finally {
      if (redis && redis.status === "ready") {
        await redis.del(
          "ratelimit:rl:api:::ffff:127.0.0.1",
          "ratelimit:rl:api:127.0.0.1",
          "ratelimit:rl:api:::1",
        ).catch(() => {});
      }
    }
  });

  it("should return 429 when login email/account limit is exceeded independently of IP", async () => {
    // 10 requests from different IPs (spoofted via X-Forwarded-For) but same email
    const uniqueAccountEmail = `account-limit-${Date.now()}-${Math.floor(Math.random() * 1000)}@test.com`;
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Test-RateLimit", "enable")
        .set("X-Forwarded-For", `192.168.2.${i}`)
        .send({ email: uniqueAccountEmail, password: "wrong" });
      expect(res.status).not.toBe(429);
    }
    
    // 11th request from another IP but SAME email should be blocked by account limiter
    const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Test-RateLimit", "enable")
        .set("X-Forwarded-For", `192.168.2.11`)
        .send({ email: uniqueAccountEmail, password: "wrong" });
        
    expect(res.status).toBe(429);
    expect(res.body.detail).toContain("account");
  });
});
