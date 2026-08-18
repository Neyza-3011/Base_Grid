import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

describe("Configuration Security", () => {
  it("fails in production when SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD are missing", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        CORS_ORIGINS: "https://example.com",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set/i);
  });

  it("fails in production when SUPERADMIN_PASSWORD is too short", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "admin@example.com",
        SUPERADMIN_PASSWORD: "short",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: SUPERADMIN_PASSWORD must be at least 12 characters/i);
  });

  it("fails in production when REDIS_URL is missing", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "admin@example.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: REDIS_URL must be provided/i);
  });

  it("fails in production when DATABASE_URL is missing", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "admin@example.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: DATABASE_URL must be provided/i);
  });

  it("fails in production when CORS_ORIGINS contains localhost or is missing", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        SUPERADMIN_EMAIL: "admin@example.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: CORS_ORIGINS must be explicitly provided/i);

    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "http://localhost:5173",
        SUPERADMIN_EMAIL: "admin@example.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: CORS_ORIGINS cannot contain localhost/i);
  });

  it("fails in production when EMAIL_PROVIDER is missing or not resend", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "admin@example.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: EMAIL_PROVIDER must be provided/i);

    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "admin@example.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
        EMAIL_PROVIDER: "smtp",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: EMAIL_PROVIDER must be 'resend'/i);
  });

  it("fails in production when EMAIL_API_KEY or EMAIL_FROM is missing", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "admin@example.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
        EMAIL_PROVIDER: "resend",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: EMAIL_API_KEY must be provided/i);

    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "admin@example.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
        EMAIL_PROVIDER: "resend",
        EMAIL_API_KEY: "re_123456",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: EMAIL_FROM must be provided/i);
  });

  it("loads valid production configuration safely without leaking", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
      REDIS_URL: "redis://127.0.0.1:6379",
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      FRONTEND_URL: "https://example.com",
      CORS_ORIGINS: "https://example.com,https://api.example.com",
      SUPERADMIN_EMAIL: "admin@example.com",
      SUPERADMIN_PASSWORD: "super-secure-password",
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "re_123456789_test_key",
      EMAIL_FROM: "no-reply@example.com",
    } as any);

    expect(config.NODE_ENV).toBe("production");
    expect(config.SUPERADMIN_EMAIL).toBe("admin@example.com");
    expect(config.EMAIL_PROVIDER).toBe("resend");
    expect(config.CORS_ORIGINS).toEqual(["https://example.com", "https://api.example.com"]);
  });

  it("allows development defaults", () => {
    const config = loadConfig({
      NODE_ENV: "development",
    } as any);
    
    expect(config.NODE_ENV).toBe("development");
    expect(config.SUPERADMIN_EMAIL).toBe("saas@rapporti.it"); // Has fallback
    expect(config.CORS_ORIGINS).toContain("http://localhost:5173");
    expect(config.PORT).toBe(3000);
  });

  it("uses process.env.PORT as source of truth and falls back to 3000", () => {
    const customPortConfig = loadConfig({
      NODE_ENV: "production",
      JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
      REDIS_URL: "redis://127.0.0.1:6379",
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      FRONTEND_URL: "https://example.com",
      CORS_ORIGINS: "https://example.com",
      SUPERADMIN_EMAIL: "admin@example.com",
      SUPERADMIN_PASSWORD: "super-secure-password",
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "re_123456789_test_key",
      EMAIL_FROM: "no-reply@example.com",
      PORT: "10000",
    } as any);
    expect(customPortConfig.PORT).toBe(10000);

    const defaultPortConfig = loadConfig({
      NODE_ENV: "development",
    } as any);
    expect(defaultPortConfig.PORT).toBe(3000);
  });
});
