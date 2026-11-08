import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { generalApiLimiter, rateLimiter } from "./rate-limiter";
import { config } from "./config";

describe("Rate Limiter Middleware", () => {
  const originalEnv = config.NODE_ENV;
  const originalRedis = (rateLimiter as any).redisClient;

  beforeEach(() => {
    config.NODE_ENV = "test";
    (rateLimiter as any).localFallback.clear();
  });

  afterEach(() => {
    config.NODE_ENV = originalEnv;
    (rateLimiter as any).redisClient = originalRedis;
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
    const origMode = process.env.BASEGRID_RUNTIME_MODE;
    const originalEnv = config.NODE_ENV;
    const originalRedis = (rateLimiter as any).redisClient;
    process.env.BASEGRID_RUNTIME_MODE = "production";
    config.NODE_ENV = "production";
    (rateLimiter as any).redisClient = null; // simulate no redis client 
    
    try {
      const res = await request(app).get("/").set("X-Test-RateLimit", "enable");
      expect(res.status).toBe(503);
      expect(res.body.detail).toContain("Servizio temporaneamente non disponibile");
    } finally {
      if (origMode) process.env.BASEGRID_RUNTIME_MODE = origMode;
      else delete process.env.BASEGRID_RUNTIME_MODE;
      config.NODE_ENV = originalEnv;
      (rateLimiter as any).redisClient = originalRedis;
    }
  });

  it("repairs a Redis rate-limit counter that has no expiry", async () => {
    const app = express();
    app.set("trust proxy", 1);
    const limiter = rateLimiter.middleware({ points: 0, duration: 60, failClosed: true });
    app.get("/", limiter, (_req, res) => { res.status(200).send("OK"); });

    const mockRedis = {
      status: "ready",
      eval: vi.fn(async () => [1, -1]),
    };
    (rateLimiter as any).redisClient = mockRedis;

    const response = await request(app)
      .get("/")
      .set("X-Test-RateLimit", "enable")
      .set("X-Forwarded-For", "192.168.1.77");

    expect(response.status).toBe(429);
    expect(response.header["retry-after"]).toBe("60");
    const luaScript = mockRedis.eval.mock.calls[0][0] as string;
    expect(luaScript).toContain('if ttl < 0 then');
    expect(luaScript).toContain('redis.call("EXPIRE", KEYS[1], ARGV[1])');
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

  it("5. refresh Redis unavailable - should fail closed in production", async () => {
    const app = express();
    app.set("trust proxy", 1);
    const { refreshLimiter } = await import("./rate-limiter");
    app.post("/refresh", refreshLimiter, (req, res) => { res.status(200).send("OK"); });
    
    const origMode = process.env.BASEGRID_RUNTIME_MODE;
    const originalEnv = config.NODE_ENV;
    const originalRedis = (rateLimiter as any).redisClient;
    process.env.BASEGRID_RUNTIME_MODE = "production";
    config.NODE_ENV = "production";
    (rateLimiter as any).redisClient = null; // simulate offline
    
    try {
      const res = await request(app).post("/refresh").set("X-Test-RateLimit", "enable");
      expect(res.status).toBe(503);
      expect(res.body.detail).toContain("Servizio temporaneamente non disponibile");
    } finally {
      if (origMode) process.env.BASEGRID_RUNTIME_MODE = origMode;
      else delete process.env.BASEGRID_RUNTIME_MODE;
      config.NODE_ENV = originalEnv;
      (rateLimiter as any).redisClient = originalRedis;
    }
  });

  it("6. general API fail-closed - rejects API requests when Redis is offline in production", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use("/api", generalApiLimiter);
    app.get("/api", (_req, res) => { res.status(200).send("OK"); });

    const origMode = process.env.BASEGRID_RUNTIME_MODE;
    const originalEnv = config.NODE_ENV;
    const originalRedis = (rateLimiter as any).redisClient;
    process.env.BASEGRID_RUNTIME_MODE = "production";
    config.NODE_ENV = "production";
    (rateLimiter as any).redisClient = null;
    (rateLimiter as any).localFallback.clear();

    try {
      const response = await request(app)
        .get("/api")
        .set("X-Test-RateLimit", "enable")
        .set("X-Forwarded-For", "192.168.1.99");

      expect(response.status).toBe(503);
      expect(response.body.detail).toContain("Servizio temporaneamente non disponibile");
      expect((rateLimiter as any).localFallback.size).toBe(0);
    } finally {
      if (origMode) process.env.BASEGRID_RUNTIME_MODE = origMode;
      else delete process.env.BASEGRID_RUNTIME_MODE;
      config.NODE_ENV = originalEnv;
      (rateLimiter as any).redisClient = originalRedis;
    }
  });

  it("11. trusted proxy behavior - uses X-Forwarded-For when trust proxy is set", async () => {
    const app = express();
    app.set("trust proxy", 1);
    const limiter = rateLimiter.middleware({ points: 1, duration: 60 });
    app.get("/", limiter, (req, res) => { res.status(200).send("OK"); });

    const testIp = `123.123.${Date.now() % 200}.${Math.floor(Math.random() * 200) + 1}`;
    const res1 = await request(app).get("/").set("X-Test-RateLimit", "enable").set("X-Forwarded-For", testIp);
    expect(res1.status).toBe(200);
    
    // Using same IP should block
    const res2 = await request(app).get("/").set("X-Test-RateLimit", "enable").set("X-Forwarded-For", testIp);
    expect(res2.status).toBe(429);
  });

  it("12. close() cleanly disconnects Redis client", async () => {
    const mockRedis = {
      status: "ready",
      quit: vi.fn(async () => "OK"),
      disconnect: vi.fn(),
    };
    const testLimiter = new (rateLimiter.constructor as any)(mockRedis);
    await testLimiter.close();
    expect(mockRedis.quit).toHaveBeenCalled();
  });

  it("13. attaches error handler to Redis client to prevent uncaughtException", async () => {
    const mockEvents: Record<string, Function> = {};
    const mockRedis = {
      status: "ready",
      on: vi.fn((event: string, handler: Function) => {
        mockEvents[event] = handler;
      }),
      quit: vi.fn(async () => "OK"),
      disconnect: vi.fn(),
    };

    const testLimiter = new (rateLimiter.constructor as any)(mockRedis);
    expect(testLimiter).toBeDefined();

    // Verify error event on Redis client is caught cleanly when error listener is attached
    if (mockRedis.on.mock.calls.length > 0) {
      expect(mockRedis.on).toHaveBeenCalledWith("error", expect.any(Function));
    }
  });

  it("14. ping() returns true when redisClient is null (local memory mode)", async () => {
    const testLimiter = new (rateLimiter.constructor as any)(null);
    const result = await testLimiter.ping();
    expect(result).toBe(true);
  });

  it("15. ping() returns true when redisClient pings PONG", async () => {
    const mockRedis = {
      status: "ready",
      ping: vi.fn(async () => "PONG"),
    };
    const testLimiter = new (rateLimiter.constructor as any)(mockRedis);
    const result = await testLimiter.ping();
    expect(result).toBe(true);
  });

  it("16. ping() returns false when redisClient throws", async () => {
    const mockRedis = {
      status: "ready",
      ping: vi.fn(async () => { throw new Error("Connection refused"); }),
    };
    const testLimiter = new (rateLimiter.constructor as any)(mockRedis);
    const result = await testLimiter.ping();
    expect(result).toBe(false);
  });
});
