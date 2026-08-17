import crypto from "crypto";
import jwt from "jsonwebtoken";
import { JwtPayload, SafeUserSession, UserRecord } from "./types";

// Cryptographic Secret for JWTs
const JWT_SECRET = process.env.JWT_SECRET || process.env.SECRET_KEY || "basegrid-production-secure-jwt-key-2026-auth-authoritative";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

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
 * Generates signed Access and Refresh JWTs
 */
export function generateTokens(user: UserRecord): { accessToken: string; refreshToken: string } {
  const accessPayload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    tokenType: "access",
  };

  const refreshPayload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    tokenType: "refresh",
  };

  const accessToken = jwt.sign(accessPayload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign(refreshPayload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

  return { accessToken, refreshToken };
}

/**
 * Verifies an Access Token
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
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
export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
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
      path: "/", // Set to "/" so all auth and refresh endpoints have access
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
