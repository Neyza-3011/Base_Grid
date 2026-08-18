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
  SUPERADMIN_EMAIL?: string;
  SUPERADMIN_PASSWORD?: string;
  SUPERADMIN_COMPANY_NAME: string;
}

export function loadConfig(env = process.env): ServerConfig {
  const isProduction = env.NODE_ENV === "production";
  
  // JWT Secret is handled strictly by security.ts (fail-closed in prod)
  const JWT_SECRET = getJwtSecret(env);

  const CORS_ORIGINS_RAW = env.CORS_ORIGINS || env.FRONTEND_URL || "http://localhost:5173";
  const CORS_ORIGINS = CORS_ORIGINS_RAW.split(",").map((s) => s.trim()).filter(Boolean);

  // Redis
  const REDIS_URL = env.REDIS_URL;
  const REDIS_HOST = env.REDIS_HOST || "127.0.0.1";
  const REDIS_PORT = Number(env.REDIS_PORT) || 6379;

  // SuperAdmin
  const SUPERADMIN_EMAIL = env.SUPERADMIN_EMAIL;
  const SUPERADMIN_PASSWORD = env.SUPERADMIN_PASSWORD;
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
  }

  return {
    NODE_ENV: (env.NODE_ENV as any) || "development",
    JWT_SECRET,
    REDIS_URL,
    REDIS_HOST,
    REDIS_PORT,
    PORT: Number(env.PORT) || 8000,
    FRONTEND_URL: env.FRONTEND_URL || "http://localhost:5173",
    CORS_ORIGINS,
    SUPERADMIN_EMAIL,
    SUPERADMIN_PASSWORD,
    SUPERADMIN_COMPANY_NAME,
  };
}

export const config = loadConfig();
