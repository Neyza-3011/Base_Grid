import { getJwtSecret } from "./security";

export interface ServerConfig {
  NODE_ENV: "development" | "production" | "test";
  JWT_SECRET: string;
  REDIS_URL?: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  PORT: number;
  FRONTEND_URL: string;
  CORS_ORIGINS: string[];
  SUPERADMIN_EMAIL: string;
  SUPERADMIN_PASSWORD: string;
  SUPERADMIN_COMPANY_NAME: string;
}

export function loadConfig(env = process.env): ServerConfig {
  const isProduction = env.NODE_ENV === "production";
  
  // JWT Secret is handled strictly by security.ts (fail-closed in prod)
  const JWT_SECRET = getJwtSecret(env);

  let FRONTEND_URL = env.FRONTEND_URL;
  let CORS_ORIGINS_RAW = env.CORS_ORIGINS;
  let REDIS_URL = env.REDIS_URL;
  const REDIS_HOST = env.REDIS_HOST || "127.0.0.1";
  const REDIS_PORT = Number(env.REDIS_PORT) || 6379;

  let SUPERADMIN_EMAIL = env.SUPERADMIN_EMAIL;
  let SUPERADMIN_PASSWORD = env.SUPERADMIN_PASSWORD;
  const SUPERADMIN_COMPANY_NAME = env.SUPERADMIN_COMPANY_NAME || "BaseGrid Master Platform";

  if (isProduction) {
    if (!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) {
      throw new Error(
        "CRITICAL CONFIG ERROR: SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set in production to secure the master tenant."
      );
    }
    
    if (SUPERADMIN_PASSWORD.length < 12) {
      throw new Error(
        "CRITICAL CONFIG ERROR: SUPERADMIN_PASSWORD must be at least 12 characters long."
      );
    }

    if (!REDIS_URL) {
      throw new Error(
        "CRITICAL CONFIG ERROR: REDIS_URL must be provided in production for distributed token storage."
      );
    }

    if (!FRONTEND_URL) {
      throw new Error(
        "CRITICAL CONFIG ERROR: FRONTEND_URL must be provided in production."
      );
    }

    if (!CORS_ORIGINS_RAW) {
      // In production, we don't fallback to localhost if CORS_ORIGINS isn't set.
      // If FRONTEND_URL is set, we could use that, but strict requirement means we should require CORS_ORIGINS or derive it safely.
      // Let's enforce CORS_ORIGINS or use FRONTEND_URL.
      CORS_ORIGINS_RAW = FRONTEND_URL;
    }
    
    if (CORS_ORIGINS_RAW.includes("localhost") || CORS_ORIGINS_RAW.includes("127.0.0.1")) {
      throw new Error(
        "CRITICAL CONFIG ERROR: CORS_ORIGINS cannot contain localhost in production."
      );
    }
  } else {
    // Development / Test defaults
    if (!SUPERADMIN_EMAIL) SUPERADMIN_EMAIL = "saas@rapporti.it";
    if (!SUPERADMIN_PASSWORD) SUPERADMIN_PASSWORD = "SuperAdmin2026!";
    if (!FRONTEND_URL) FRONTEND_URL = "http://localhost:5173";
    if (!CORS_ORIGINS_RAW) CORS_ORIGINS_RAW = FRONTEND_URL;
  }

  const CORS_ORIGINS = CORS_ORIGINS_RAW.split(",").map((s) => s.trim()).filter(Boolean);

  return {
    NODE_ENV: (env.NODE_ENV as any) || "development",
    JWT_SECRET,
    REDIS_URL,
    REDIS_HOST,
    REDIS_PORT,
    PORT: Number(env.PORT) || 8000,
    FRONTEND_URL,
    CORS_ORIGINS,
    SUPERADMIN_EMAIL,
    SUPERADMIN_PASSWORD,
    SUPERADMIN_COMPANY_NAME,
  };
}

export const config = loadConfig();
