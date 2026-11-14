import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import type Redis from "ioredis";
import { RateLimiterConfig, TestRateLimiter, rateLimiter } from "./rate-limiter";
import { config } from "./config";
import express, { Request, Response } from "express";
import request from "supertest";

const requireRealRedis = process.env.REQUIRE_REAL_REDIS_TESTS === "true";
const uniqueRunId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const runPrefix = `dist-rl-test:${uniqueRunId}`;
const loginIpSubnet = Math.floor(Math.random() * 512);
const loginIpStart = Math.floor(Math.random() * 244) + 1;
const loginTestIps = Array.from({ length: 12 }, (_, index) =>
  `198.${18 + Math.floor(loginIpSubnet / 256)}.${loginIpSubnet % 256}.${loginIpStart + index}`
);
const loginTestEmails = {
  primary: `distributed-${uniqueRunId}@test.com`,
  secondary: `other-${uniqueRunId}@test.com`,
};
const loginAccountKeys = Object.values(loginTestEmails).map((email) =>
  `ratelimit:rl:login:acct:${crypto.createHash("sha256").update(email.toLowerCase().trim()).digest("hex")}`
);

async function waitForRedisReady(client: Redis | null, timeoutMs = 5000): Promise<boolean> {
  if (!client) return false;
  if (client.status === "ready") return true;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.removeListener("ready", finish);
      resolve(client.status === "ready");
    };

    timeout = setTimeout(finish, timeoutMs);
    client.once("ready", finish);
    if (client.status === "ready") finish();
  });
}

describe("Distributed Rate Limiting (Redis Verification)", () => {
  let redisAvailable = false;
  let limiterA: TestRateLimiter;
  let limiterB: TestRateLimiter;

  beforeAll(async () => {
    limiterA = new TestRateLimiter();
    limiterB = new TestRateLimiter();

    try {
      const clients = await Promise.all([
        limiterA.getRedisClient(),
        limiterB.getRedisClient(),
        rateLimiter.getRedisClient(),
      ]);
      const readiness = await Promise.all(clients.map((client) => waitForRedisReady(client)));
      redisAvailable = readiness.every(Boolean);
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
      if (client && client.status === "ready") {
        await client.del(
          `ratelimit:${runPrefix}:dist-test:10.0.0.99`,
          `ratelimit:${runPrefix}:concurrent-test:10.0.0.100`,
          `ratelimit:${runPrefix}:ttl-test:10.0.0.101`,
          ...loginTestIps.map((ip) => `ratelimit:rl:login:${ip}`),
          ...loginAccountKeys
        );
      }
    }
    await Promise.all([limiterA?.close(), limiterB?.close(), rateLimiter.close()]);
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
      keyPrefix: `${runPrefix}:dist-test`,
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
      keyPrefix: `${runPrefix}:concurrent-test`,
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
      keyPrefix: `${runPrefix}:ttl-test`,
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
        .set("X-Forwarded-For", loginTestIps[i])
        .send({ email: loginTestEmails.primary, password: "wrong" });
       expect(res.status).toBe(200);
    }
    
    // 11th request from another IP should be blocked by account limiter
    const resBlocked = await request(app)
        .post("/login")
        .set("X-Test-RateLimit", "enable")
        .set("X-Forwarded-For", loginTestIps[10])
        .send({ email: loginTestEmails.primary, password: "wrong" });
        
    expect(resBlocked.status).toBe(429);
    expect(resBlocked.body.detail).toContain("account"); // errorMessage from loginAccountLimiter

    // Another email from a new IP should succeed
    const resOther = await request(app)
        .post("/login")
        .set("X-Test-RateLimit", "enable")
        .set("X-Forwarded-For", loginTestIps[11])
        .send({ email: loginTestEmails.secondary, password: "wrong" });
        
    expect(resOther.status).toBe(200);

    // Verify that the redis key for account limiter doesn't contain the raw email
    const client = await rateLimiter.getRedisClient();
    expect(client).not.toBeNull();
    const existingAccountKeys = await Promise.all(loginAccountKeys.map((key) => client!.exists(key)));
    expect(existingAccountKeys).toEqual([1, 1]);
    for (const key of loginAccountKeys) {
      expect(key).not.toContain(loginTestEmails.primary);
      expect(key).not.toContain(loginTestEmails.secondary);
    }
  });
});
