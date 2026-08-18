import crypto from "crypto";
import Redis, { RedisOptions } from "ioredis";
import { config } from "./config";

export class StoreUnavailableError extends Error {
  constructor(message = "Token storage is currently unavailable") {
    super(message);
    this.name = "StoreUnavailableError";
  }
}

export interface StoredRefreshToken {
  tokenHash: string; // SHA-256 hex digest of the raw refresh token
  jti: string;
  userId: string;
  familyId: string;
  status: "active" | "consumed" | "revoked";
  expiresAt: number; // UNIX epoch in ms
  createdAt: string; // ISO 8601
  consumedAt?: string;
  revokedAt?: string;
}

export type ConsumeResult =
  | { success: true; familyId: string; userId: string }
  | {
      success: false;
      reason: "not_found" | "already_used" | "revoked" | "expired";
      familyId?: string;
      userId?: string;
    };

export interface ITokenStorageAdapter {
  isAvailable(): boolean;
  setAvailability(isAvailable: boolean): void;
  registerToken(params: {
    tokenHash: string;
    jti: string;
    userId: string;
    familyId: string;
    expiresAt: number;
    createdAt: string;
    ttlSeconds: number;
  }): Promise<void>;
  consumeToken(params: {
    tokenHash: string;
    nowMs: number;
    nowIso: string;
  }): Promise<ConsumeResult>;
  revokeFamily(params: { familyId: string; nowIso: string }): Promise<void>;
  revokeToken(params: { tokenHash: string; nowIso: string }): Promise<void>;
  revokeAllUserTokens(params: { userId: string; nowIso: string }): Promise<void>;
  getTokenRecord(tokenHash: string): Promise<StoredRefreshToken | null>;
  reset(): Promise<void>;
  close?(): Promise<void>;
}

/**
 * Distributed Redis Storage Adapter.
 * Leverages Redis atomic Lua scripts (EVAL) to enforce:
 * 1. Single-use token consumption without local in-memory locks.
 * 2. Cross-instance atomic replay attack detection.
 * 3. Automatic token family invalidation on replay attempts.
 * 4. Distributed key expiration and revocation.
 */
export class RedisTokenStorageAdapter implements ITokenStorageAdapter {
  private client: Redis;
  private isExplicitlyDisabled = false;

  private static CONSUME_LUA = `
    local tokenKey = KEYS[1]
    local nowMs = tonumber(ARGV[1])
    local nowIso = ARGV[2]

    local exists = redis.call('EXISTS', tokenKey)
    if exists == 0 then
      return {'not_found'}
    end

    local status = redis.call('HGET', tokenKey, 'status')
    local expiresAt = tonumber(redis.call('HGET', tokenKey, 'expiresAt'))
    local familyId = redis.call('HGET', tokenKey, 'familyId')
    local userId = redis.call('HGET', tokenKey, 'userId')

    if expiresAt and nowMs > expiresAt then
      return {'expired', familyId or '', userId or ''}
    end

    if status == 'consumed' then
      if familyId and familyId ~= '' then
        local famKey = 'family:' .. familyId .. ':tokens'
        local tokens = redis.call('SMEMBERS', famKey)
        for _, th in ipairs(tokens) do
          local tKey = 'token:' .. th
          if redis.call('EXISTS', tKey) == 1 then
            redis.call('HSET', tKey, 'status', 'revoked', 'revokedAt', nowIso)
          end
        end
      end
      return {'already_used', familyId or '', userId or ''}
    end

    if status == 'revoked' then
      return {'revoked', familyId or '', userId or ''}
    end

    redis.call('HSET', tokenKey, 'status', 'consumed', 'consumedAt', nowIso)
    return {'success', familyId or '', userId or ''}
  `;

  private static REGISTER_LUA = `
    local tokenKey = KEYS[1]
    local famKey = KEYS[2]
    local userKey = KEYS[3]
    local tokenHash = ARGV[1]
    local jti = ARGV[2]
    local userId = ARGV[3]
    local familyId = ARGV[4]
    local expiresAt = ARGV[5]
    local createdAt = ARGV[6]
    local ttl = tonumber(ARGV[7])

    redis.call('HMSET', tokenKey,
      'tokenHash', tokenHash,
      'jti', jti,
      'userId', userId,
      'familyId', familyId,
      'status', 'active',
      'expiresAt', expiresAt,
      'createdAt', createdAt
    )
    if ttl > 0 then
      redis.call('EXPIRE', tokenKey, ttl)
      redis.call('EXPIRE', famKey, ttl)
      redis.call('EXPIRE', userKey, ttl)
    end
    redis.call('SADD', famKey, tokenHash)
    redis.call('SADD', userKey, tokenHash)
    return 'OK'
  `;

  private static REVOKE_FAMILY_LUA = `
    local famKey = KEYS[1]
    local nowIso = ARGV[1]
    local tokens = redis.call('SMEMBERS', famKey)
    for _, th in ipairs(tokens) do
      local tKey = 'token:' .. th
      if redis.call('EXISTS', tKey) == 1 then
        redis.call('HSET', tKey, 'status', 'revoked', 'revokedAt', nowIso)
      end
    end
    return 'OK'
  `;

  private static REVOKE_USER_LUA = `
    local userKey = KEYS[1]
    local nowIso = ARGV[1]
    local tokens = redis.call('SMEMBERS', userKey)
    for _, th in ipairs(tokens) do
      local tKey = 'token:' .. th
      if redis.call('EXISTS', tKey) == 1 then
        redis.call('HSET', tKey, 'status', 'revoked', 'revokedAt', nowIso)
      end
    end
    return 'OK'
  `;

  constructor(redisUrlOrOptions?: string | RedisOptions) {
    if (typeof redisUrlOrOptions === "string") {
      this.client = new Redis(redisUrlOrOptions, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
    } else if (redisUrlOrOptions) {
      this.client = new Redis({
        ...redisUrlOrOptions,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
    } else {
      const url = config.REDIS_URL;
      if (url) {
        this.client = new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
      } else {
        if (config.NODE_ENV === "production") {
          throw new Error("CRITICAL SECURITY ERROR: REDIS_URL is required in production for distributed token revocation.");
        }
        const host = config.REDIS_HOST;
        const port = config.REDIS_PORT;
        this.client = new Redis({
          host,
          port,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        });
      }
    }

    // Attach silent error listener to prevent uncaught exception process crashes
    this.client.on("error", (err) => {
      console.error("[RedisError] Unexpected error on Redis connection:", err.message || err);
    });
  }

  public isAvailable(): boolean {
    if (this.isExplicitlyDisabled) return false;
    const status = this.client.status;
    return (
      status === "ready" ||
      status === "connect" ||
      status === "connecting" ||
      status === "wait" ||
      status === "reconnecting"
    );
  }

  public setAvailability(isAvailable: boolean): void {
    this.isExplicitlyDisabled = !isAvailable;
  }

  public async registerToken(params: {
    tokenHash: string;
    jti: string;
    userId: string;
    familyId: string;
    expiresAt: number;
    createdAt: string;
    ttlSeconds: number;
  }): Promise<void> {
    if (!this.isAvailable()) {
      throw new StoreUnavailableError();
    }
    try {
      const tokenKey = `token:${params.tokenHash}`;
      const famKey = `family:${params.familyId}:tokens`;
      const userKey = `user:${params.userId}:tokens`;

      await this.client.eval(
        RedisTokenStorageAdapter.REGISTER_LUA,
        3,
        tokenKey,
        famKey,
        userKey,
        params.tokenHash,
        params.jti,
        params.userId,
        params.familyId,
        params.expiresAt.toString(),
        params.createdAt,
        params.ttlSeconds.toString(),
      );
    } catch (err) {
      throw new StoreUnavailableError(
        `Redis error while registering token: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public async consumeToken(params: {
    tokenHash: string;
    nowMs: number;
    nowIso: string;
  }): Promise<ConsumeResult> {
    if (!this.isAvailable()) {
      throw new StoreUnavailableError();
    }
    try {
      const tokenKey = `token:${params.tokenHash}`;
      const res = (await this.client.eval(
        RedisTokenStorageAdapter.CONSUME_LUA,
        1,
        tokenKey,
        params.nowMs.toString(),
        params.nowIso,
      )) as string[];

      const [status, familyId, userId] = res;

      if (status === "success") {
        return { success: true, familyId, userId };
      }

      return {
        success: false,
        reason: status as "not_found" | "already_used" | "revoked" | "expired",
        familyId: familyId || undefined,
        userId: userId || undefined,
      };
    } catch (err) {
      throw new StoreUnavailableError(
        `Redis error while consuming token: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public async revokeFamily(params: { familyId: string; nowIso: string }): Promise<void> {
    if (!this.isAvailable()) {
      throw new StoreUnavailableError();
    }
    try {
      const famKey = `family:${params.familyId}:tokens`;
      await this.client.eval(RedisTokenStorageAdapter.REVOKE_FAMILY_LUA, 1, famKey, params.nowIso);
    } catch (err) {
      throw new StoreUnavailableError(
        `Redis error while revoking family: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public async revokeToken(params: { tokenHash: string; nowIso: string }): Promise<void> {
    if (!this.isAvailable()) {
      throw new StoreUnavailableError();
    }
    try {
      const tokenKey = `token:${params.tokenHash}`;
      const exists = await this.client.exists(tokenKey);
      if (exists) {
        await this.client.hmset(tokenKey, "status", "revoked", "revokedAt", params.nowIso);
      }
    } catch (err) {
      throw new StoreUnavailableError(
        `Redis error while revoking token: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public async revokeAllUserTokens(params: { userId: string; nowIso: string }): Promise<void> {
    if (!this.isAvailable()) {
      throw new StoreUnavailableError();
    }
    try {
      const userKey = `user:${params.userId}:tokens`;
      await this.client.eval(RedisTokenStorageAdapter.REVOKE_USER_LUA, 1, userKey, params.nowIso);
    } catch (err) {
      throw new StoreUnavailableError(
        `Redis error while revoking user tokens: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public async getTokenRecord(tokenHash: string): Promise<StoredRefreshToken | null> {
    if (!this.isAvailable()) {
      throw new StoreUnavailableError();
    }
    try {
      const tokenKey = `token:${tokenHash}`;
      const data = await this.client.hgetall(tokenKey);
      if (!data || !data.tokenHash) return null;

      return {
        tokenHash: data.tokenHash,
        jti: data.jti,
        userId: data.userId,
        familyId: data.familyId,
        status: data.status as "active" | "consumed" | "revoked",
        expiresAt: Number(data.expiresAt),
        createdAt: data.createdAt,
        consumedAt: data.consumedAt || undefined,
        revokedAt: data.revokedAt || undefined,
      };
    } catch (err) {
      throw new StoreUnavailableError(
        `Redis error while fetching token: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public async reset(): Promise<void> {
    if (this.client.status === "ready" || this.client.status === "connect") {
      await this.client.flushdb();
    }
  }

  public async close(): Promise<void> {
    await this.client.quit();
  }
}

/**
 * Distributed-Equivalent Storage Engine.
 * Implements the exact atomic Lua CAS transaction semantics and family lineage tracking.
 * Used for testing and environments where an external Redis daemon is not yet provisioned.
 */
export class DistributedStorageEngine implements ITokenStorageAdapter {
  private records: Map<string, StoredRefreshToken> = new Map();
  private familyTokens: Map<string, Set<string>> = new Map();
  private userTokens: Map<string, Set<string>> = new Map();
  private available = true;

  public isAvailable(): boolean {
    return this.available;
  }

  public setAvailability(isAvailable: boolean): void {
    this.available = isAvailable;
  }

  public async registerToken(params: {
    tokenHash: string;
    jti: string;
    userId: string;
    familyId: string;
    expiresAt: number;
    createdAt: string;
    ttlSeconds: number;
  }): Promise<void> {
    if (!this.available) {
      throw new StoreUnavailableError();
    }

    const record: StoredRefreshToken = {
      tokenHash: params.tokenHash,
      jti: params.jti,
      userId: params.userId,
      familyId: params.familyId,
      status: "active",
      expiresAt: params.expiresAt,
      createdAt: params.createdAt,
    };

    this.records.set(params.tokenHash, record);

    if (!this.familyTokens.has(params.familyId)) {
      this.familyTokens.set(params.familyId, new Set());
    }
    this.familyTokens.get(params.familyId)!.add(params.tokenHash);

    if (!this.userTokens.has(params.userId)) {
      this.userTokens.set(params.userId, new Set());
    }
    this.userTokens.get(params.userId)!.add(params.tokenHash);
  }

  public async consumeToken(params: {
    tokenHash: string;
    nowMs: number;
    nowIso: string;
  }): Promise<ConsumeResult> {
    if (!this.available) {
      throw new StoreUnavailableError();
    }

    const record = this.records.get(params.tokenHash);
    if (!record) {
      return { success: false, reason: "not_found" };
    }

    if (params.nowMs > record.expiresAt) {
      return {
        success: false,
        reason: "expired",
        familyId: record.familyId,
        userId: record.userId,
      };
    }

    // Atomic Replay Attack Detection
    if (record.status === "consumed") {
      await this.revokeFamily({ familyId: record.familyId, nowIso: params.nowIso });
      return {
        success: false,
        reason: "already_used",
        familyId: record.familyId,
        userId: record.userId,
      };
    }

    if (record.status === "revoked") {
      return {
        success: false,
        reason: "revoked",
        familyId: record.familyId,
        userId: record.userId,
      };
    }

    // Atomic CAS transition: active -> consumed
    record.status = "consumed";
    record.consumedAt = params.nowIso;
    this.records.set(params.tokenHash, record);

    return {
      success: true,
      familyId: record.familyId,
      userId: record.userId,
    };
  }

  public async revokeFamily(params: { familyId: string; nowIso: string }): Promise<void> {
    if (!this.available) {
      throw new StoreUnavailableError();
    }

    const tokenHashes = this.familyTokens.get(params.familyId);
    if (tokenHashes) {
      for (const th of tokenHashes) {
        const rec = this.records.get(th);
        if (rec && rec.status !== "revoked") {
          rec.status = "revoked";
          rec.revokedAt = params.nowIso;
        }
      }
    }
  }

  public async revokeToken(params: { tokenHash: string; nowIso: string }): Promise<void> {
    if (!this.available) {
      throw new StoreUnavailableError();
    }

    const rec = this.records.get(params.tokenHash);
    if (rec && rec.status !== "revoked") {
      rec.status = "revoked";
      rec.revokedAt = params.nowIso;
    }
  }

  public async revokeAllUserTokens(params: { userId: string; nowIso: string }): Promise<void> {
    if (!this.available) {
      throw new StoreUnavailableError();
    }

    const tokenHashes = this.userTokens.get(params.userId);
    if (tokenHashes) {
      for (const th of tokenHashes) {
        const rec = this.records.get(th);
        if (rec && rec.status !== "revoked") {
          rec.status = "revoked";
          rec.revokedAt = params.nowIso;
        }
      }
    }
  }

  public async getTokenRecord(tokenHash: string): Promise<StoredRefreshToken | null> {
    if (!this.available) {
      throw new StoreUnavailableError();
    }
    return this.records.get(tokenHash) || null;
  }

  public async reset(): Promise<void> {
    this.records.clear();
    this.familyTokens.clear();
    this.userTokens.clear();
    this.available = true;
  }
}

/**
 * Production-ready distributed token revocation & rotation storage engine.
 * Automatically selects RedisTokenStorageAdapter when REDIS_URL is configured,
 * falling back to the distributed-equivalent engine for isolated testing/local dev.
 */
export class RefreshTokenStore {
  private adapter: ITokenStorageAdapter;

  constructor(customAdapter?: ITokenStorageAdapter) {
    if (customAdapter) {
      this.adapter = customAdapter;
    } else if (config.REDIS_URL || config.REDIS_HOST !== "127.0.0.1") {
      this.adapter = new RedisTokenStorageAdapter();
    } else {
      if (config.NODE_ENV === "production") {
        throw new Error("CRITICAL SECURITY ERROR: REDIS_URL or REDIS_HOST must be provided in production for distributed token storage.");
      }
      // Fallback local memory storage for development / testing when Redis is not provided
      this.adapter = new DistributedStorageEngine();
    }
  }

  public setAdapter(adapter: ITokenStorageAdapter): void {
    this.adapter = adapter;
  }

  public getAdapter(): ITokenStorageAdapter {
    return this.adapter;
  }

  public static hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  public isAvailable(): boolean {
    return this.adapter.isAvailable();
  }

  public setAvailability(isAvailable: boolean): void {
    this.adapter.setAvailability(isAvailable);
  }

  public async reset(): Promise<void> {
    await this.adapter.reset();
  }

  public async registerToken(params: {
    token: string;
    jti: string;
    userId: string;
    familyId: string;
    expiresInMs?: number;
  }): Promise<void> {
    const tokenHash = RefreshTokenStore.hashToken(params.token);
    const now = Date.now();
    const expiresInMs = params.expiresInMs ?? 7 * 24 * 60 * 60 * 1000;
    const expiresAt = now + expiresInMs;
    const ttlSeconds = Math.max(1, Math.ceil(expiresInMs / 1000));

    await this.adapter.registerToken({
      tokenHash,
      jti: params.jti,
      userId: params.userId,
      familyId: params.familyId,
      expiresAt,
      createdAt: new Date(now).toISOString(),
      ttlSeconds,
    });
  }

  public async consumeToken(rawToken: string): Promise<ConsumeResult> {
    const tokenHash = RefreshTokenStore.hashToken(rawToken);
    const now = Date.now();
    return this.adapter.consumeToken({
      tokenHash,
      nowMs: now,
      nowIso: new Date(now).toISOString(),
    });
  }

  public async revokeFamily(familyId: string): Promise<void> {
    await this.adapter.revokeFamily({
      familyId,
      nowIso: new Date().toISOString(),
    });
  }

  public async revokeToken(rawToken: string): Promise<void> {
    const tokenHash = RefreshTokenStore.hashToken(rawToken);
    await this.adapter.revokeToken({
      tokenHash,
      nowIso: new Date().toISOString(),
    });
  }

  public async revokeAllUserTokens(userId: string): Promise<void> {
    await this.adapter.revokeAllUserTokens({
      userId,
      nowIso: new Date().toISOString(),
    });
  }

  public async getTokenRecord(rawToken: string): Promise<StoredRefreshToken | null> {
    const tokenHash = RefreshTokenStore.hashToken(rawToken);
    return this.adapter.getTokenRecord(tokenHash);
  }
}

export const tokenStore = new RefreshTokenStore();
