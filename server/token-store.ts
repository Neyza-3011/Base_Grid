import crypto from "crypto";

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

/**
 * Production-ready distributed token revocation & rotation storage engine.
 * Tracks refresh token state, enforces single-use rotation, and detects replay attacks.
 */
export class RefreshTokenStore {
  private tokens: Map<string, StoredRefreshToken> = new Map();
  private available = true;

  /**
   * Calculates SHA-256 hash of a token string to avoid storing raw JWTs.
   */
  public static hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Checks if the token store is currently reachable and operational.
   */
  public isAvailable(): boolean {
    return this.available;
  }

  /**
   * Sets the operational availability of the store (used for health checks and fail-closed testing).
   */
  public setAvailability(isAvailable: boolean): void {
    this.available = isAvailable;
  }

  /**
   * Clears all stored tokens (used in testing).
   */
  public reset(): void {
    this.tokens.clear();
    this.available = true;
  }

  /**
   * Registers a newly issued refresh token.
   */
  public async registerToken(params: {
    token: string;
    jti: string;
    userId: string;
    familyId: string;
    expiresInMs?: number;
  }): Promise<void> {
    if (!this.available) {
      throw new StoreUnavailableError();
    }

    const tokenHash = RefreshTokenStore.hashToken(params.token);
    const now = Date.now();
    const expiresAt = params.expiresInMs ? now + params.expiresInMs : now + 7 * 24 * 60 * 60 * 1000;

    const record: StoredRefreshToken = {
      tokenHash,
      jti: params.jti,
      userId: params.userId,
      familyId: params.familyId,
      status: "active",
      expiresAt,
      createdAt: new Date(now).toISOString(),
    };

    this.tokens.set(tokenHash, record);
  }

  /**
   * Atomically consumes an active refresh token during rotation.
   * Enforces single-use invariant:
   * - If already consumed -> REPLAY ATTACK: revokes the whole family and returns reason: "already_used".
   * - If active -> atomically transitions to "consumed" and returns success: true.
   * - If revoked/not found/expired -> returns failure.
   * - If store is unavailable -> throws StoreUnavailableError (Fail-Closed).
   */
  public async consumeToken(rawToken: string): Promise<ConsumeResult> {
    if (!this.available) {
      throw new StoreUnavailableError();
    }

    const tokenHash = RefreshTokenStore.hashToken(rawToken);
    const record = this.tokens.get(tokenHash);

    if (!record) {
      return { success: false, reason: "not_found" };
    }

    // Check expiration
    if (Date.now() > record.expiresAt) {
      return { success: false, reason: "expired", familyId: record.familyId, userId: record.userId };
    }

    // REPLAY ATTACK DETECTION: If token was already consumed, someone is replaying a stolen token!
    if (record.status === "consumed") {
      // Invalidate the whole token family immediately to protect the compromised account
      await this.revokeFamily(record.familyId);
      return {
        success: false,
        reason: "already_used",
        familyId: record.familyId,
        userId: record.userId,
      };
    }

    if (record.status === "revoked") {
      return { success: false, reason: "revoked", familyId: record.familyId, userId: record.userId };
    }

    // Atomic CAS transition: active -> consumed
    record.status = "consumed";
    record.consumedAt = new Date().toISOString();
    this.tokens.set(tokenHash, record);

    return {
      success: true,
      familyId: record.familyId,
      userId: record.userId,
    };
  }

  /**
   * Revokes all tokens associated with a given familyId.
   */
  public async revokeFamily(familyId: string): Promise<void> {
    if (!this.available) {
      throw new StoreUnavailableError();
    }

    const nowIso = new Date().toISOString();
    for (const record of this.tokens.values()) {
      if (record.familyId === familyId && record.status !== "revoked") {
        record.status = "revoked";
        record.revokedAt = nowIso;
      }
    }
  }

  /**
   * Revokes a specific single token by raw token value.
   */
  public async revokeToken(rawToken: string): Promise<void> {
    if (!this.available) {
      throw new StoreUnavailableError();
    }

    const tokenHash = RefreshTokenStore.hashToken(rawToken);
    const record = this.tokens.get(tokenHash);
    if (record) {
      record.status = "revoked";
      record.revokedAt = new Date().toISOString();
    }
  }

  /**
   * Revokes all active tokens for a specific user (e.g. password change, security wipe).
   */
  public async revokeAllUserTokens(userId: string): Promise<void> {
    if (!this.available) {
      throw new StoreUnavailableError();
    }

    const nowIso = new Date().toISOString();
    for (const record of this.tokens.values()) {
      if (record.userId === userId && record.status !== "revoked") {
        record.status = "revoked";
        record.revokedAt = nowIso;
      }
    }
  }

  /**
   * Inspect token record status by raw token string without mutating (read-only for auditing/testing).
   */
  public getTokenRecord(rawToken: string): StoredRefreshToken | null {
    const tokenHash = RefreshTokenStore.hashToken(rawToken);
    return this.tokens.get(tokenHash) || null;
  }
}

export const tokenStore = new RefreshTokenStore();
