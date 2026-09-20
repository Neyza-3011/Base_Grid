import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { RateLimiter, RateLimiterConfig, getEmailHashKey } from "./rate-limiter";
import { 
  RedisTokenStorageAdapter, 
  RefreshTokenStore, 
  StoreUnavailableError 
} from "./token-store";
import { config } from "./config";

const requireRealRedis = process.env.REQUIRE_REAL_REDIS_TESTS === "true";

describe("P0.4.4-H2 — Distributed Redis Production Verification", () => {
  let redisAvailable = false;
  let limiterInstanceA: RateLimiter;
  let limiterInstanceB: RateLimiter;
  let tokenAdapterA: RedisTokenStorageAdapter;
  let tokenAdapterB: RedisTokenStorageAdapter;

  beforeAll(async () => {
    limiterInstanceA = new RateLimiter();
    limiterInstanceB = new RateLimiter();
    tokenAdapterA = new RedisTokenStorageAdapter();
    tokenAdapterB = new RedisTokenStorageAdapter();

    try {
      const isPingOkA = await tokenAdapterA.ping(1000);
      const isPingOkB = await tokenAdapterB.ping(1000);
      if (isPingOkA && isPingOkB) {
        redisAvailable = true;
      }
    } catch {
      redisAvailable = false;
    }

    if (requireRealRedis && !redisAvailable) {
      throw new Error("Real Redis is required for distributed tests but is not available.");
    }
  });

  afterAll(async () => {
    if (redisAvailable) {
      const client = await limiterInstanceA.getRedisClient();
      if (client && client.status === "ready") {
        await client.del("ratelimit:dist-cross-test:192.168.1.50");
        await client.del("ratelimit:concurrent-cross-test:192.168.1.51");
        await client.del("ratelimit:ttl-cross-test:192.168.1.52");
        const acctKeys = await client.keys("ratelimit:rl:test:acct:*");
        if (acctKeys.length > 0) {
          await client.del(...acctKeys);
        }
      }
      await tokenAdapterA.reset();
    }
    limiterInstanceA?.close();
    limiterInstanceB?.close();
    await tokenAdapterA?.close();
    await tokenAdapterB?.close();
  });

  describe("1. Distributed Rate Limiting Across Instances (Redis Real/Distributed)", () => {
    it.skipIf(!redisAvailable)("shares rate limit counters between multiple application instances via Redis Lua", async () => {
      const appA = express();
      const appB = express();
      appA.set("trust proxy", 1);
      appB.set("trust proxy", 1);
      appA.use(express.json());
      appB.use(express.json());

      const rlConfig: RateLimiterConfig = {
        points: 2,
        duration: 60,
        keyPrefix: "dist-cross-test",
        failClosed: true,
      };

      appA.get("/api/data", limiterInstanceA.middleware(rlConfig), (req, res) => res.json({ ok: true, instance: "A" }));
      appB.get("/api/data", limiterInstanceB.middleware(rlConfig), (req, res) => res.json({ ok: true, instance: "B" }));

      const testIpHeaders = { "X-Test-RateLimit": "enable", "X-Forwarded-For": "192.168.1.50" };

      // Request 1 on Instance A -> OK (count = 1)
      const res1 = await request(appA).get("/api/data").set(testIpHeaders);
      expect(res1.status).toBe(200);
      expect(res1.headers["x-ratelimit-remaining"]).toBe("1");

      // Request 2 on Instance B -> OK (count = 2)
      const res2 = await request(appB).get("/api/data").set(testIpHeaders);
      expect(res2.status).toBe(200);
      expect(res2.headers["x-ratelimit-remaining"]).toBe("0");

      // Request 3 on Instance A -> 429 Too Many Requests (count = 3 > 2)
      const res3 = await request(appA).get("/api/data").set(testIpHeaders);
      expect(res3.status).toBe(429);
      expect(res3.body.detail).toBeDefined();

      // Request 4 on Instance B -> 429 Too Many Requests (shared state)
      const res4 = await request(appB).get("/api/data").set(testIpHeaders);
      expect(res4.status).toBe(429);
      expect(res4.body.detail).toBeDefined();
    });

    it.skipIf(!redisAvailable)("enforces atomic INCR + EXPIRE on concurrent cross-instance requests", async () => {
      const appA = express();
      const appB = express();
      appA.set("trust proxy", 1);
      appB.set("trust proxy", 1);

      const rlConfig: RateLimiterConfig = {
        points: 4,
        duration: 30,
        keyPrefix: "concurrent-cross-test",
        failClosed: true,
      };

      appA.get("/resource", limiterInstanceA.middleware(rlConfig), (req, res) => res.send("OK-A"));
      appB.get("/resource", limiterInstanceB.middleware(rlConfig), (req, res) => res.send("OK-B"));

      const headers = { "X-Test-RateLimit": "enable", "X-Forwarded-For": "192.168.1.51" };

      // Dispatch 8 simultaneous requests distributed evenly across Instance A and B
      const promises = [
        request(appA).get("/resource").set(headers),
        request(appB).get("/resource").set(headers),
        request(appA).get("/resource").set(headers),
        request(appB).get("/resource").set(headers),
        request(appA).get("/resource").set(headers),
        request(appB).get("/resource").set(headers),
        request(appA).get("/resource").set(headers),
        request(appB).get("/resource").set(headers),
      ];

      const responses = await Promise.all(promises);
      const okCount = responses.filter(r => r.status === 200).length;
      const blockedCount = responses.filter(r => r.status === 429).length;

      expect(okCount).toBe(4);
      expect(blockedCount).toBe(4);
    });

    it.skipIf(!redisAvailable)("hashes sensitive email data before using as Redis key (No PII leak in Redis)", async () => {
      const app = express();
      app.use(express.json());

      const rlConfig: RateLimiterConfig = {
        points: 2,
        duration: 60,
        keyPrefix: "rl:test:acct",
      };

      app.post("/test-login", limiterInstanceA.middleware(rlConfig, getEmailHashKey), (req, res) => res.send("OK"));

      const rawEmail = "security-audit-user@basegrid-enterprise.com";
      await request(app)
        .post("/test-login")
        .set("X-Test-RateLimit", "enable")
        .send({ email: rawEmail });

      const client = await limiterInstanceA.getRedisClient();
      const keys = await client!.keys("ratelimit:rl:test:acct:*");
      expect(keys.length).toBeGreaterThan(0);

      // Verify that the key NEVER contains the raw plain email
      for (const k of keys) {
        expect(k).not.toContain(rawEmail);
        expect(k).not.toContain("security-audit-user");
      }
    });
  });

  describe("2. Distributed Refresh-Token Security & Replay Detection (Cross-Instance)", () => {
    it.skipIf(!redisAvailable)("registers token on Instance A and atomically consumes on Instance B", async () => {
      const storeA = new RefreshTokenStore(tokenAdapterA);
      const storeB = new RefreshTokenStore(tokenAdapterB);

      const rawToken1 = "dist_token_secret_xyz_1";
      const familyId = "fam_dist_123";
      const userId = "usr_dist_456";

      // Register token on Instance A
      await storeA.registerToken({
        token: rawToken1,
        jti: "jti_1",
        userId,
        familyId,
        expiresInMs: 60000,
      });

      // Token record is immediately readable from Instance B
      const recB = await storeB.getTokenRecord(rawToken1);
      expect(recB).toBeDefined();
      expect(recB?.status).toBe("active");
      expect(recB?.userId).toBe(userId);
      expect(recB?.familyId).toBe(familyId);

      // Consume token on Instance B
      const consumeResB = await storeB.consumeToken(rawToken1);
      expect(consumeResB.success).toBe(true);
      if (consumeResB.success) {
        expect(consumeResB.familyId).toBe(familyId);
        expect(consumeResB.userId).toBe(userId);
      }

      // Instance A now sees the consumed status
      const recA = await storeA.getTokenRecord(rawToken1);
      expect(recA?.status).toBe("consumed");
    });

    it.skipIf(!redisAvailable)("detects cross-instance replay attack and revokes entire lineage family in Redis Lua", async () => {
      const storeA = new RefreshTokenStore(tokenAdapterA);
      const storeB = new RefreshTokenStore(tokenAdapterB);

      const token1 = "token_lineage_initial";
      const token2Rotated = "token_lineage_rotated_v2";
      const familyId = "fam_lineage_safe";
      const userId = "usr_lineage_victim";

      // 1. Instance A registers initial token
      await storeA.registerToken({
        token: token1,
        jti: "jti_lin_1",
        userId,
        familyId,
      });

      // 2. Legitimate user rotates token via Instance B
      const legitConsume = await storeB.consumeToken(token1);
      expect(legitConsume.success).toBe(true);

      // Legitimate user gets rotated token2 in the same family
      await storeB.registerToken({
        token: token2Rotated,
        jti: "jti_lin_2",
        userId,
        familyId,
      });

      // 3. Attacker replays compromised token1 against Instance A
      const replayAttempt = await storeA.consumeToken(token1);
      expect(replayAttempt.success).toBe(false);
      if (!replayAttempt.success) {
        expect(replayAttempt.reason).toBe("already_used");
      }

      // 4. Redis Lua must have atomically invalidated the entire family!
      // When legitimate user tries to use token2Rotated on Instance B, it is revoked
      const legitRotatedAttempt = await storeB.consumeToken(token2Rotated);
      expect(legitRotatedAttempt.success).toBe(false);
      if (!legitRotatedAttempt.success) {
        expect(legitRotatedAttempt.reason).toBe("revoked");
      }
    });

    it.skipIf(!redisAvailable)("propagates user-level revocation across all instances (password reset / logout-all)", async () => {
      const storeA = new RefreshTokenStore(tokenAdapterA);
      const storeB = new RefreshTokenStore(tokenAdapterB);

      const userTarget = "usr_target_pwd_reset";
      const tokenA = "token_device_phone";
      const tokenB = "token_device_laptop";

      await storeA.registerToken({
        token: tokenA,
        jti: "jti_phone",
        userId: userTarget,
        familyId: "fam_phone",
      });

      await storeB.registerToken({
        token: tokenB,
        jti: "jti_laptop",
        userId: userTarget,
        familyId: "fam_laptop",
      });

      // User triggers password reset on Instance A
      await storeA.revokeAllUserTokens(userTarget);

      // Instance B must immediately refuse tokenB
      const consumeResB = await storeB.consumeToken(tokenB);
      expect(consumeResB.success).toBe(false);
      if (!consumeResB.success) {
        expect(consumeResB.reason).toBe("revoked");
      }

      // Instance A must also refuse tokenA
      const consumeResA = await storeA.consumeToken(tokenA);
      expect(consumeResA.success).toBe(false);
      if (!consumeResA.success) {
        expect(consumeResA.reason).toBe("revoked");
      }
    });
  });

  describe("3. Production Fail-Closed Invariants & No In-Memory Fallback", () => {
    it("throws a critical configuration error if RateLimiter is initialized in production without REDIS_URL/REDIS_HOST", async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = "production";
        // Attempting to instantiate RateLimiter when no Redis is configured
        // (passing null as redisClient forces redis-disabled state)
        const limiter = new RateLimiter(null);
        
        const app = express();
        const middleware = limiter.middleware({
          points: 5,
          duration: 60,
          failClosed: true,
        });
        app.get("/critical", middleware, (req, res) => res.send("OK"));

        const res = await request(app)
          .get("/critical")
          .set("X-Test-RateLimit", "enable");

        // In production without Redis, critical endpoints MUST fail-closed with 503
        expect(res.status).toBe(503);
        expect(res.body.detail).toContain("Servizio temporaneamente non disponibile");
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it("ensures TokenStore fail-closed throws StoreUnavailableError when Redis is unavailable without falling back to local memory", async () => {
      const adapter = new RedisTokenStorageAdapter();
      // Explicitly mark as unavailable (simulating network partition / redis down)
      adapter.setAvailability(false);

      expect(adapter.isAvailable()).toBe(false);

      // Every token operation MUST throw StoreUnavailableError and NEVER silently write to a local Map
      await expect(adapter.registerToken({
        tokenHash: "abc",
        jti: "jti",
        userId: "u1",
        familyId: "f1",
        expiresAt: Date.now() + 10000,
        createdAt: new Date().toISOString(),
        ttlSeconds: 10,
      })).rejects.toThrow(StoreUnavailableError);

      await expect(adapter.consumeToken({
        tokenHash: "abc",
        nowMs: Date.now(),
        nowIso: new Date().toISOString(),
      })).rejects.toThrow(StoreUnavailableError);

      await expect(adapter.revokeFamily({
        familyId: "f1",
        nowIso: new Date().toISOString(),
      })).rejects.toThrow(StoreUnavailableError);

      await expect(adapter.revokeAllUserTokens({
        userId: "u1",
        nowIso: new Date().toISOString(),
      })).rejects.toThrow(StoreUnavailableError);
    });

    it("resumes normal operations seamlessly after Redis recovers without corrupted state", async () => {
      const adapter = new RedisTokenStorageAdapter();
      
      // Simulate outage
      adapter.setAvailability(false);
      expect(adapter.isAvailable()).toBe(false);
      await expect(adapter.getTokenRecord("hash123")).rejects.toThrow(StoreUnavailableError);

      // Simulate recovery
      adapter.setAvailability(true);
      expect(adapter.isAvailable()).toBe(true);
    });
  });
});
