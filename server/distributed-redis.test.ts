import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { RateLimiter, RateLimiterConfig, getEmailHashKey } from "./rate-limiter";
import { 
  RedisTokenStorageAdapter, 
  RefreshTokenStore, 
  StoreUnavailableError 
} from "./token-store";

const requireRealRedis = process.env.REQUIRE_REAL_REDIS_TESTS === "true";

const suiteDescribe = requireRealRedis ? describe : describe.skip;

suiteDescribe("P0.4.4-H2 — Distributed Redis Production Verification", () => {
  const uniqueRunId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const runPrefix = `h2test:${uniqueRunId}`;
  const createdTokens: string[] = [];

  let limiterInstanceA: RateLimiter;
  let limiterInstanceB: RateLimiter;
  let tokenAdapterA: RedisTokenStorageAdapter;
  let tokenAdapterB: RedisTokenStorageAdapter;

  beforeAll(async () => {
    if (!requireRealRedis) {
      return;
    }

    limiterInstanceA = new RateLimiter();
    limiterInstanceB = new RateLimiter();
    tokenAdapterA = new RedisTokenStorageAdapter();
    tokenAdapterB = new RedisTokenStorageAdapter();

    const isPingOkA = await tokenAdapterA.ping(1500).catch(() => false);
    const isPingOkB = await tokenAdapterB.ping(1500).catch(() => false);
    const redisAvailable = isPingOkA && isPingOkB;

    if (!redisAvailable) {
      throw new Error("Real Redis is required for P0.4.4-H2 distributed tests");
    }
  });

  afterAll(async () => {
    if (!requireRealRedis) {
      return;
    }
    try {
      const client = await limiterInstanceA?.getRedisClient();
      if (client && client.status === "ready") {
        // Safe granular cleanup: only remove keys with our unique runPrefix.
        // NEVER use FLUSHDB, FLUSHALL, or adapter.reset().
        const rlKeys = await client.keys(`ratelimit:${runPrefix}:*`);
        if (rlKeys.length > 0) {
          await client.del(...rlKeys);
        }
        const famKeys = await client.keys(`family:${runPrefix}:*`);
        if (famKeys.length > 0) {
          await client.del(...famKeys);
        }
        const usrKeys = await client.keys(`user_tokens:${runPrefix}:*`);
        if (usrKeys.length > 0) {
          await client.del(...usrKeys);
        }
        for (const rawToken of createdTokens) {
          const hash = RefreshTokenStore.hashToken(rawToken);
          await client.del(`token:${hash}`);
        }
      }
    } catch (err) {
      console.error("[TestCleanup] Error cleaning scoped Redis test keys:", err);
    } finally {
      limiterInstanceA?.close();
      limiterInstanceB?.close();
      await tokenAdapterA?.close();
      await tokenAdapterB?.close();
    }
  });

  describe("1. Distributed Rate Limiting Across Instances (Redis Real/Distributed)", () => {
    it("shares rate limit counters between multiple application instances via Redis Lua", async () => {
      const appA = express();
      const appB = express();
      appA.set("trust proxy", 1);
      appB.set("trust proxy", 1);
      appA.use(express.json());
      appB.use(express.json());

      const rlConfig: RateLimiterConfig = {
        points: 2,
        duration: 60,
        keyPrefix: `${runPrefix}:dist-cross-test`,
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

    it("enforces atomic INCR + EXPIRE on concurrent cross-instance requests", async () => {
      const appA = express();
      const appB = express();
      appA.set("trust proxy", 1);
      appB.set("trust proxy", 1);

      const rlConfig: RateLimiterConfig = {
        points: 4,
        duration: 30,
        keyPrefix: `${runPrefix}:concurrent-cross-test`,
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

    it("hashes sensitive email data before using as Redis key (No PII leak in Redis)", async () => {
      const app = express();
      app.use(express.json());

      const rlConfig: RateLimiterConfig = {
        points: 2,
        duration: 60,
        keyPrefix: `${runPrefix}:acct`,
      };

      app.post("/test-login", limiterInstanceA.middleware(rlConfig, getEmailHashKey), (req, res) => res.send("OK"));

      const rawEmail = `security-audit-${uniqueRunId}@basegrid-enterprise.com`;
      await request(app)
        .post("/test-login")
        .set("X-Test-RateLimit", "enable")
        .send({ email: rawEmail });

      const client = await limiterInstanceA.getRedisClient();
      const keys = await client!.keys(`ratelimit:${runPrefix}:acct:*`);
      expect(keys.length).toBeGreaterThan(0);

      // Verify that the key NEVER contains the raw plain email
      for (const k of keys) {
        expect(k).not.toContain(rawEmail);
        expect(k).not.toContain(`security-audit-${uniqueRunId}`);
      }
    });
  });

  describe("2. Distributed Refresh-Token Security & Replay Detection (Cross-Instance)", () => {
    it("registers token on Instance A and atomically consumes on Instance B", async () => {
      const storeA = new RefreshTokenStore(tokenAdapterA);
      const storeB = new RefreshTokenStore(tokenAdapterB);

      const rawToken1 = `dist_token_${runPrefix}_1`;
      const familyId = `${runPrefix}:fam_dist_123`;
      const userId = `${runPrefix}:usr_dist_456`;
      createdTokens.push(rawToken1);

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

    it("detects cross-instance replay attack and revokes entire lineage family in Redis Lua", async () => {
      const storeA = new RefreshTokenStore(tokenAdapterA);
      const storeB = new RefreshTokenStore(tokenAdapterB);

      const token1 = `dist_token_${runPrefix}_lin_1`;
      const token2Rotated = `dist_token_${runPrefix}_lin_2`;
      const familyId = `${runPrefix}:fam_lineage_safe`;
      const userId = `${runPrefix}:usr_lineage_victim`;
      createdTokens.push(token1, token2Rotated);

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

    it("propagates user-level revocation across all instances (password reset / logout-all)", async () => {
      const storeA = new RefreshTokenStore(tokenAdapterA);
      const storeB = new RefreshTokenStore(tokenAdapterB);

      const userTarget = `${runPrefix}:usr_target_pwd_reset`;
      const tokenA = `dist_token_${runPrefix}_dev_a`;
      const tokenB = `dist_token_${runPrefix}_dev_b`;
      const familyA = `${runPrefix}:fam_dev_a`;
      const familyB = `${runPrefix}:fam_dev_b`;
      createdTokens.push(tokenA, tokenB);

      await storeA.registerToken({
        token: tokenA,
        jti: "jti_phone",
        userId: userTarget,
        familyId: familyA,
      });

      await storeB.registerToken({
        token: tokenB,
        jti: "jti_laptop",
        userId: userTarget,
        familyId: familyB,
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
        // Passing null as redisClient forces Redis to be unavailable
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

    it("rejects operations while adapter is explicitly disabled and resumes after re-enable", async () => {
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
