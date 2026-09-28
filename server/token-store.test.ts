import { describe, it, expect, vi } from "vitest";
import { RedisTokenStorageAdapter, DistributedStorageEngine } from "./token-store";

describe("Token Store — Safe Scoped Redis Reset", () => {
  it("reset() deletes ONLY token store keys (token:*, family:*:tokens, user:*:tokens) and leaves unrelated Redis keys intact", async () => {
    // Simulated Redis key-value storage
    const redisDb = new Map<string, string>([
      ["token:sha256-hash-token-1", "token-record-1"],
      ["token:sha256-hash-token-2", "token-record-2"],
      ["family:fam-abc-123:tokens", "family-set"],
      ["user:usr-456-def:tokens", "user-set"],
      // Unrelated keys belonging to other subsystems or external services
      ["unrelated:cache:reports", "cached-report-data"],
      ["ratelimit:rl:login:192.168.1.1", "ratelimit-counter"],
      ["session:external-app:999", "external-session"],
      ["other:tenant:config", "config-value"],
    ]);

    const flushdbSpy = vi.fn();

    // Mock Redis client simulating SCAN + DEL semantics
    const mockRedisClient = {
      status: "ready",
      eval: vi.fn(),
      flushdb: flushdbSpy,
      scan: vi.fn(async (cursor: string, matchKeyword: string, pattern: string, countKeyword: string, count: number) => {
        expect(matchKeyword).toBe("MATCH");
        expect(countKeyword).toBe("COUNT");
        expect(count).toBe(100);

        // Convert Redis glob pattern (e.g. "token:*", "family:*:tokens") to RegExp
        const regexStr = "^" + pattern.replace(/\*/g, ".*") + "$";
        const regex = new RegExp(regexStr);

        const matchingKeys: string[] = [];
        for (const key of redisDb.keys()) {
          if (regex.test(key)) {
            matchingKeys.push(key);
          }
        }

        // Return cursor "0" indicating full iteration completed for this pattern
        return ["0", matchingKeys];
      }),
      del: vi.fn(async (...keys: string[]) => {
        for (const k of keys) {
          redisDb.delete(k);
        }
        return keys.length;
      }),
    };

    const adapter = new RedisTokenStorageAdapter(mockRedisClient as any);

    // Execute reset
    await adapter.reset();

    // 1. Verify FLUSHDB was NEVER called
    expect(flushdbSpy).not.toHaveBeenCalled();

    // 2. Verify SCAN was called for exactly the three managed patterns
    expect(mockRedisClient.scan).toHaveBeenCalledWith("0", "MATCH", "token:*", "COUNT", 100);
    expect(mockRedisClient.scan).toHaveBeenCalledWith("0", "MATCH", "family:*:tokens", "COUNT", 100);
    expect(mockRedisClient.scan).toHaveBeenCalledWith("0", "MATCH", "user:*:tokens", "COUNT", 100);

    // 3. Verify token store keys were deleted
    expect(redisDb.has("token:sha256-hash-token-1")).toBe(false);
    expect(redisDb.has("token:sha256-hash-token-2")).toBe(false);
    expect(redisDb.has("family:fam-abc-123:tokens")).toBe(false);
    expect(redisDb.has("user:usr-456-def:tokens")).toBe(false);

    // 4. Verify ALL unrelated keys remain completely intact
    expect(redisDb.has("unrelated:cache:reports")).toBe(true);
    expect(redisDb.get("unrelated:cache:reports")).toBe("cached-report-data");

    expect(redisDb.has("ratelimit:rl:login:192.168.1.1")).toBe(true);
    expect(redisDb.get("ratelimit:rl:login:192.168.1.1")).toBe("ratelimit-counter");

    expect(redisDb.has("session:external-app:999")).toBe(true);
    expect(redisDb.get("session:external-app:999")).toBe("external-session");

    expect(redisDb.has("other:tenant:config")).toBe(true);
    expect(redisDb.get("other:tenant:config")).toBe("config-value");
  });

  it("handles multi-cursor SCAN pagination properly without dropping batches", async () => {
    const keysBatch1 = ["token:batch1-a", "token:batch1-b"];
    const keysBatch2 = ["token:batch2-c"];
    const deletedKeys: string[] = [];

    const mockRedisClient = {
      status: "ready",
      eval: vi.fn(),
      scan: vi.fn(async (cursor: string, _matchKeyword: string, pattern: string) => {
        if (pattern === "token:*") {
          if (cursor === "0") {
            return ["42", keysBatch1]; // return next cursor "42"
          }
          if (cursor === "42") {
            return ["0", keysBatch2]; // return final cursor "0"
          }
        }
        return ["0", []];
      }),
      del: vi.fn(async (...keys: string[]) => {
        deletedKeys.push(...keys);
        return keys.length;
      }),
    };

    const adapter = new RedisTokenStorageAdapter(mockRedisClient as any);
    await adapter.reset();

    expect(deletedKeys).toContain("token:batch1-a");
    expect(deletedKeys).toContain("token:batch1-b");
    expect(deletedKeys).toContain("token:batch2-c");
    expect(deletedKeys).toHaveLength(3);
  });

  it("DistributedStorageEngine.reset() cleans memory store cleanly", async () => {
    const engine = new DistributedStorageEngine();
    await engine.registerToken({
      tokenHash: "test-hash",
      jti: "test-jti",
      userId: "usr-1",
      familyId: "fam-1",
      expiresAt: Date.now() + 60000,
      createdAt: new Date().toISOString(),
      ttlSeconds: 60,
    });

    const recordBefore = await engine.getTokenRecord("test-hash");
    expect(recordBefore).not.toBeNull();

    await engine.reset();

    const recordAfter = await engine.getTokenRecord("test-hash");
    expect(recordAfter).toBeNull();
  });
});
