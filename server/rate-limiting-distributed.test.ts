import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RateLimiterConfig, TestRateLimiter, rateLimiter } from "./rate-limiter";
import { config } from "./config";
import express, { Request, Response } from "express";
import request from "supertest";

const requireRealRedis = process.env.REQUIRE_REAL_REDIS_TESTS === "true";

describe("Distributed Rate Limiting (Redis Verification)", () => {
  let redisAvailable = false;
  let limiterA: TestRateLimiter;
  let limiterB: TestRateLimiter;

  beforeAll(async () => {
    limiterA = new TestRateLimiter();
    limiterB = new TestRateLimiter();

    try {
      const client = await limiterA.getRedisClient();
      if (client && client.status === "ready") {
         redisAvailable = true;
      }
    } catch (e) {
      console.log("Redis not available for distributed testing");
    }

    if (requireRealRedis && !redisAvailable) {
      throw new Error("Real Redis is required for these tests but is not available.");
    }
  });

  afterAll(async () => {
    if (redisAvailable) {
       const client = await limiterA.getRedisClient();
       if (client) {
         await client.del("ratelimit:dist-test:10.0.0.99");
         await client.del("ratelimit:concurrent-test:10.0.0.100");
         await client.del("ratelimit:ttl-test:10.0.0.101");
         
         const keys = await client.keys("ratelimit:rl:login:acct:*");
         if (keys.length > 0) {
           await client.del(...keys);
         }
       }
    }
    limiterA?.close();
    limiterB?.close();
  });

  it.skipIf(!requireRealRedis && !redisAvailable)("should share rate limit counters between multiple instances", async () => {
    if (!redisAvailable) {
      // In case skipIf doesn't prevent execution in older vitest
      expect(requireRealRedis).toBe(false);
      return;
    }

    const appA = express();
    const appB = express();
    appA.set("trust proxy", 1);
    appB.set("trust proxy", 1);
    appA.use(express.json());
    appB.use(express.json());

    const rlConfig: RateLimiterConfig = {
      points: 2,
      duration: 60,
      keyPrefix: "dist-test",
    };

    appA.get("/", limiterA.middleware(rlConfig), (req, res) => { res.send("OK A"); });
    appB.get("/", limiterB.middleware(rlConfig), (req, res) => { res.send("OK B"); });

    const headers = { "X-Test-RateLimit": "enable", "X-Forwarded-For": "10.0.0.99" };

    const res1 = await request(appA).get("/").set(headers);
    expect(res1.status).toBe(200);

    const res2 = await request(appB).get("/").set(headers);
    expect(res2.status).toBe(200);

    const res3 = await request(appA).get("/").set(headers);
    expect(res3.status).toBe(429);

    const res4 = await request(appB).get("/").set(headers);
    expect(res4.status).toBe(429);
  });

  it.skipIf(!requireRealRedis && !redisAvailable)("should correctly handle concurrent requests via Lua script", async () => {
    if (!redisAvailable) return;

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());

    const rlConfig: RateLimiterConfig = {
      points: 5,
      duration: 60,
      keyPrefix: "concurrent-test",
    };

    app.get("/", limiterA.middleware(rlConfig), (req, res) => { res.send("OK"); });

    const headers = { "X-Test-RateLimit": "enable", "X-Forwarded-For": "10.0.0.100" };

    const reqs = [];
    for(let i=0; i<10; i++) {
       reqs.push(request(app).get("/").set(headers));
    }
    const responses = await Promise.all(reqs);
    
    let okCount = 0;
    let rateLimitedCount = 0;

    for (const res of responses) {
      if (res.status === 200) okCount++;
      if (res.status === 429) rateLimitedCount++;
    }

    expect(okCount).toBe(5);
    expect(rateLimitedCount).toBe(5);
  });

  it.skipIf(!requireRealRedis && !redisAvailable)("should verify TTL correctly via Redis", async () => {
    if (!redisAvailable) return;

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    
    const rlConfig: RateLimiterConfig = {
      points: 1,
      duration: 10,
      keyPrefix: "ttl-test",
    };

    app.get("/", limiterA.middleware(rlConfig), (req, res) => { res.send("OK"); });
    
    const headers = { "X-Test-RateLimit": "enable", "X-Forwarded-For": "10.0.0.101" };

    const res1 = await request(app).get("/").set(headers);
    expect(res1.status).toBe(200);
    
    const res2 = await request(app).get("/").set(headers);
    expect(res2.status).toBe(429);
    
    const retryAfter = res2.header["retry-after"];
    expect(retryAfter).toBeDefined();
    expect(parseInt(retryAfter, 10)).toBeLessThanOrEqual(10);
    expect(parseInt(retryAfter, 10)).toBeGreaterThan(0);
    
    // Check TTL manually in Redis
    const client = await limiterA.getRedisClient();
    const ttl = await client!.ttl("ratelimit:ttl-test:10.0.0.101");
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);
  });

  it.skipIf(!requireRealRedis && !redisAvailable)("should enforce account-based limiting independently of IP", async () => {
    if (!redisAvailable) return;

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());
    
    const { loginLimiter, loginAccountLimiter } = await import("./rate-limiter");
    
    app.post("/login", [loginLimiter, loginAccountLimiter], (req, res) => { res.send("OK"); });

    // Send 10 requests for the same email from different IPs
    for (let i = 0; i < 10; i++) {
       const res = await request(app)
        .post("/login")
        .set("X-Test-RateLimit", "enable")
        .set("X-Forwarded-For", `192.168.100.${i}`)
        .send({ email: "distributed@test.com", password: "wrong" });
       expect(res.status).toBe(200);
    }
    
    // 11th request from another IP should be blocked by account limiter
    const resBlocked = await request(app)
        .post("/login")
        .set("X-Test-RateLimit", "enable")
        .set("X-Forwarded-For", `192.168.100.11`)
        .send({ email: "distributed@test.com", password: "wrong" });
        
    expect(resBlocked.status).toBe(429);
    expect(resBlocked.body.detail).toContain("account"); // errorMessage from loginAccountLimiter

    // Another email from a new IP should succeed
    const resOther = await request(app)
        .post("/login")
        .set("X-Test-RateLimit", "enable")
        .set("X-Forwarded-For", `192.168.100.12`)
        .send({ email: "other@test.com", password: "wrong" });
        
    expect(resOther.status).toBe(200);

    // Verify that the redis key for account limiter doesn't contain the raw email
    const client = await limiterA.getRedisClient();
    const keys = await client!.keys("ratelimit:rl:login:acct:*");
    expect(keys.length).toBeGreaterThan(0);
    
    let foundRawEmail = false;
    for (const key of keys) {
      if (key.includes("distributed@test.com")) {
        foundRawEmail = true;
      }
    }
    expect(foundRawEmail).toBe(false);
  });
});
