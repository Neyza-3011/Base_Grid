import crypto from "crypto";
import jwt from "jsonwebtoken";
import { JwtPayload, SafeUserSession, UserRecord } from "./types";

const MIN_SECRET_LENGTH = 32;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

// Known insecure placeholder patterns that must never be allowed as production secrets
const INSECURE_PLACEHOLDERS = new Set([
  "secret",
  "changeme",
  "password",
  "jwt_secret",
  "secret_key",
  "default_secret",
  "your-secret-key-here",
  "12345678901234567890123456789012",
  "basegrid-production-secure-jwt-key-2026-auth-authoritative",
]);

/**
 * Retrieves the cryptographic JWT secret.
 * - In production (NODE_ENV === "production"): strictly requires a valid, high-entropy
 *   JWT_SECRET or SECRET_KEY environment variable (>= 32 chars, not a placeholder) and fails fast.
 * - In development / testing: if not provided via env, uses a stable local dev fallback
 *   so the local development server starts reliably without manual env injection.
 * - Never leaks or prints secret values in error messages or logs.
 */
export function getJwtSecret(customEnv?: NodeJS.ProcessEnv): string {
  const env = customEnv || process.env;
  const isProduction = env.NODE_ENV === "production";
  const rawSecret = env.JWT_SECRET || env.SECRET_KEY;

  if (!rawSecret || typeof rawSecret !== "string") {
    if (isProduction) {
      throw new Error(
        "CRITICAL SECURITY ERROR: JWT secret is missing. Set the JWT_SECRET or SECRET_KEY environment variable."
      );
    }
    // In local development / preview environment, fallback to a stable local secret
    return "dev-local-basegrid-auth-secret-key-do-not-use-in-prod-2026";
  }

  const trimmed = rawSecret.trim();
  if (trimmed.length === 0) {
    if (isProduction) {
      throw new Error(
        "CRITICAL SECURITY ERROR: JWT secret is empty. Set a valid JWT_SECRET or SECRET_KEY environment variable."
      );
    }
    return "dev-local-basegrid-auth-secret-key-do-not-use-in-prod-2026";
  }

  if (trimmed.length < MIN_SECRET_LENGTH) {
    if (isProduction) {
      throw new Error(
        `CRITICAL SECURITY ERROR: JWT secret is too short (${trimmed.length} chars). It must be at least ${MIN_SECRET_LENGTH} characters long.`
      );
    }
  }

  if (isProduction && INSECURE_PLACEHOLDERS.has(trimmed.toLowerCase())) {
    throw new Error(
      "CRITICAL SECURITY ERROR: JWT secret is set to a known insecure placeholder. Provide a cryptographically strong random secret."
    );
  }

  return trimmed;
}

/**
 * Validates JWT configuration at server startup.
 * Throws immediately if secret is not properly configured in the environment.
 */
export function assertValidJwtSecret(customEnv?: NodeJS.ProcessEnv): void {
  getJwtSecret(customEnv);
}

// Cookie durations
export const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000; // 15 minutes
export const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CSRF_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Normalizes email address to lower case and trimmed string
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

/**
 * Validate standard email format
 */
export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(normalized);
}

/**
 * Hashes password using PBKDF2 with 100,000 iterations and random salt
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return { hash, salt };
}

/**
 * Verifies password using constant-time comparison to prevent timing attacks
 */
export function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  try {
    const hash = crypto.pbkdf2Sync(password, storedSalt, 100000, 64, "sha512").toString("hex");
    const hashBuffer = Buffer.from(hash, "hex");
    const storedBuffer = Buffer.from(storedHash, "hex");
    if (hashBuffer.length !== storedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(hashBuffer, storedBuffer);
  } catch {
    return false;
  }
}

/**
 * Calculates SHA-256 hash of a token string (never logs or indexes raw JWTs)
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates signed Access and Refresh JWTs with unique JTI and Family ID for rotation tracking
 */
export function generateTokens(
  user: UserRecord,
  optionsOrSecret?: string | { familyId?: string; secretOverride?: string },
): { accessToken: string; refreshToken: string; jti: string; familyId: string } {
  const secretOverride =
    typeof optionsOrSecret === "string" ? optionsOrSecret : optionsOrSecret?.secretOverride;
  const familyIdOverride = typeof optionsOrSecret === "object" ? optionsOrSecret?.familyId : undefined;

  const secret = secretOverride || getJwtSecret();
  const accessJti = crypto.randomBytes(16).toString("hex");
  const refreshJti = crypto.randomBytes(16).toString("hex");
  const familyId = familyIdOverride || `fam-${crypto.randomBytes(16).toString("hex")}`;

  const accessPayload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    tokenType: "access",
    jti: accessJti,
  };

  const refreshPayload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    tokenType: "refresh",
    jti: refreshJti,
    familyId: familyId,
  };

  const accessToken = jwt.sign(accessPayload, secret, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign(refreshPayload, secret, { expiresIn: REFRESH_TOKEN_EXPIRY });

  return { accessToken, refreshToken, jti: refreshJti, familyId };
}

/**
 * Verifies an Access Token
 */
export function verifyAccessToken(token: string, secretOverride?: string): JwtPayload | null {
  try {
    const secret = secretOverride || getJwtSecret();
    const decoded = jwt.verify(token, secret) as JwtPayload;
    if (decoded.tokenType !== "access") {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Verifies a Refresh Token
 */
export function verifyRefreshToken(token: string, secretOverride?: string): JwtPayload | null {
  try {
    const secret = secretOverride || getJwtSecret();
    const decoded = jwt.verify(token, secret) as JwtPayload;
    if (decoded.tokenType !== "refresh") {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Generates a cryptographically strong CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Returns cookie options for access_token, refresh_token, and csrf_token
 */
export function getCookieSettings(isProd: boolean) {
  // Use SameSite=lax for standard web requests. Secure=true in production/HTTPS.
  return {
    accessCookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax" as const,
      path: "/",
      maxAge: ACCESS_COOKIE_MAX_AGE,
    },
    refreshCookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax" as const,
      path: "/api/v1/auth",
      maxAge: REFRESH_COOKIE_MAX_AGE,
    },
    csrfCookie: {
      httpOnly: false, // Must be readable by client JS to attach in X-CSRF-Token header
      secure: isProd,
      sameSite: "lax" as const,
      path: "/",
      maxAge: CSRF_COOKIE_MAX_AGE,
    },
  };
}

/**
 * Converts internal UserRecord into a safe client UserSession (stripping secrets)
 */
export function toSafeUserSession(user: UserRecord): SafeUserSession {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    companyId: user.companyId,
    companyName: user.companyName,
    provider: user.provider,
    emailConfirmed: user.emailConfirmed,
    phoneNumber: user.phoneNumber || "",
  };
}
