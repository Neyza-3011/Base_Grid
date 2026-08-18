import { getJwtSecret } from "./security";

export interface ServerConfig {
  NODE_ENV: "development" | "production" | "test";
  JWT_SECRET: string;
  DATABASE_URL?: string;
  REDIS_URL?: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  PORT: number;
  FRONTEND_URL: string;
  CORS_ORIGINS: string[];
  SUPERADMIN_EMAIL: string;
  SUPERADMIN_PASSWORD: string;
  SUPERADMIN_COMPANY_NAME: string;
  EMAIL_PROVIDER: string;
  EMAIL_FROM: string;
  EMAIL_API_KEY?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
}

export function loadConfig(env = process.env): ServerConfig {
  const isProduction = env.NODE_ENV === "production";
  
  // JWT Secret is handled strictly by security.ts (fail-closed in prod)
  const JWT_SECRET = getJwtSecret(env);

  let FRONTEND_URL = env.FRONTEND_URL;
  let CORS_ORIGINS_RAW = env.CORS_ORIGINS;
  let DATABASE_URL = env.DATABASE_URL;
  let REDIS_URL = env.REDIS_URL;
  const REDIS_HOST = env.REDIS_HOST || "127.0.0.1";
  const REDIS_PORT = Number(env.REDIS_PORT) || 6379;

  let SUPERADMIN_EMAIL = env.SUPERADMIN_EMAIL;
  let SUPERADMIN_PASSWORD = env.SUPERADMIN_PASSWORD;
  const SUPERADMIN_COMPANY_NAME = env.SUPERADMIN_COMPANY_NAME || "BaseGrid Master Platform";

  const EMAIL_PROVIDER = env.EMAIL_PROVIDER || (isProduction ? "" : "dev");
  const EMAIL_FROM = env.EMAIL_FROM || "no-reply@basegrid.io";
  const EMAIL_API_KEY = env.EMAIL_API_KEY;
  const SMTP_HOST = env.SMTP_HOST;
  const SMTP_PORT = env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined;
  const SMTP_USER = env.SMTP_USER;
  const SMTP_PASS = env.SMTP_PASS;

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

    if (!DATABASE_URL) {
      throw new Error(
        "CRITICAL CONFIG ERROR: DATABASE_URL must be provided in production for PostgreSQL persistence."
      );
    }

    if (!FRONTEND_URL) {
      throw new Error(
        "CRITICAL CONFIG ERROR: FRONTEND_URL must be provided in production."
      );
    }

    if (!CORS_ORIGINS_RAW) {
      throw new Error(
        "CRITICAL CONFIG ERROR: CORS_ORIGINS must be explicitly provided in production."
      );
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
    DATABASE_URL,
    REDIS_URL,
    REDIS_HOST,
    REDIS_PORT,
    PORT: Number(env.PORT) || 3000,
    FRONTEND_URL,
    CORS_ORIGINS,
    SUPERADMIN_EMAIL,
    SUPERADMIN_PASSWORD,
    SUPERADMIN_COMPANY_NAME,
    EMAIL_PROVIDER,
    EMAIL_FROM,
    EMAIL_API_KEY,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
  };
}

export const config = loadConfig();
