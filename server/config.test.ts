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
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
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
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
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
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
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
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
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
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: CORS_ORIGINS cannot contain localhost/i);

    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "*",
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: CORS_ORIGINS cannot contain wildcard/i);
  });

  it("rejects empty or whitespace-only production CORS origin lists", () => {
    const validBase = {
      NODE_ENV: "production",
      JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
      REDIS_URL: "redis://127.0.0.1:6379",
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      FRONTEND_URL: "https://example.com",
      SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
      SUPERADMIN_PASSWORD: "super-secure-password",
    };

    expect(() =>
      loadConfig({ ...validBase, CORS_ORIGINS: "   " } as any)
    ).toThrow(/CORS_ORIGINS must contain at least one valid HTTPS origin/i);

    expect(() =>
      loadConfig({ ...validBase, CORS_ORIGINS: " , " } as any)
    ).toThrow(/CORS_ORIGINS must contain at least one valid HTTPS origin/i);
  });

  it("rejects plaintext HTTP frontend URLs in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "http://example.com",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
      } as any)
    ).toThrow(/FRONTEND_URL must be a valid HTTPS URL/i);
  });

  it("rejects plaintext HTTP and non-origin entries in production CORS configuration", () => {
    const validBase = {
      NODE_ENV: "production",
      JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
      REDIS_URL: "redis://127.0.0.1:6379",
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      FRONTEND_URL: "https://example.com",
      SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
      SUPERADMIN_PASSWORD: "super-secure-password",
    };

    expect(() =>
      loadConfig({ ...validBase, CORS_ORIGINS: "http://example.com" } as any)
    ).toThrow(/CORS_ORIGINS entry must be an HTTPS origin/i);

    expect(() =>
      loadConfig({ ...validBase, CORS_ORIGINS: "https://example.com/dashboard" } as any)
    ).toThrow(/CORS_ORIGINS entry must be an HTTPS origin/i);
  });

  it("allows production startup without email verification or Resend configuration", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
      REDIS_URL: "redis://127.0.0.1:6379",
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      FRONTEND_URL: "https://example.com",
      CORS_ORIGINS: "https://example.com",
      SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
      SUPERADMIN_PASSWORD: "super-secure-password",
      EMAIL_VERIFICATION_ENABLED: "false",
    } as any);

    expect(config.EMAIL_VERIFICATION_ENABLED).toBe(false);
    expect(config.EMAIL_PROVIDER).toBe("none");
    expect(config.EMAIL_API_KEY).toBeUndefined();
  });

  it("fails in production when EMAIL_PROVIDER is missing or not resend (when EMAIL_VERIFICATION_ENABLED is true)", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
        EMAIL_VERIFICATION_ENABLED: "true",
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
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
        EMAIL_PROVIDER: "smtp",
        EMAIL_VERIFICATION_ENABLED: "true",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: EMAIL_PROVIDER must be 'resend'/i);
  });

  it("fails in production when EMAIL_API_KEY or EMAIL_FROM is missing (when EMAIL_VERIFICATION_ENABLED is true)", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
        EMAIL_PROVIDER: "resend",
        EMAIL_VERIFICATION_ENABLED: "true",
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
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
        EMAIL_PROVIDER: "resend",
        EMAIL_API_KEY: "re_123456",
        EMAIL_VERIFICATION_ENABLED: "true",
      } as any)
    ).toThrow(/CRITICAL CONFIG ERROR: EMAIL_FROM must be provided/i);
  });

  it("allows production startup without email config when EMAIL_VERIFICATION_ENABLED is false", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
      REDIS_URL: "redis://127.0.0.1:6379",
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      FRONTEND_URL: "https://example.com",
      CORS_ORIGINS: "https://example.com",
      SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
      SUPERADMIN_PASSWORD: "super-secure-password",
      EMAIL_VERIFICATION_ENABLED: "false", // or not set
    } as any);

    expect(config.NODE_ENV).toBe("production");
    expect(config.EMAIL_VERIFICATION_ENABLED).toBe(false);
  });

  it("loads valid production configuration safely without leaking", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
      REDIS_URL: "redis://127.0.0.1:6379",
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      FRONTEND_URL: "https://example.com",
      CORS_ORIGINS: "https://example.com,https://api.example.com",
      SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
      SUPERADMIN_PASSWORD: "super-secure-password",
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "re_123456789_test_key",
      EMAIL_FROM: "no-reply@example.com",
    } as any);

    expect(config.NODE_ENV).toBe("production");
    expect(config.SUPERADMIN_EMAIL).toBe("jack.cardinali15@gmail.com");
    expect(config.EMAIL_PROVIDER).toBe("resend");
    expect(config.CORS_ORIGINS).toEqual(["https://example.com", "https://api.example.com"]);
  });

  it("allows development defaults", () => {
    const config = loadConfig({
      NODE_ENV: "development",
    } as any);
    
    expect(config.NODE_ENV).toBe("development");
    expect(config.SUPERADMIN_EMAIL).toBe("jack.cardinali15@gmail.com"); // Has fallback
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
      SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
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

  describe("Google OAuth Configuration Security", () => {
    it("defaults GOOGLE_AUTH_ENABLED to false when not provided", () => {
      const config = loadConfig({
        NODE_ENV: "development",
      } as any);
      expect(config.GOOGLE_AUTH_ENABLED).toBe(false);
      expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
    });

    it("fails in production when GOOGLE_AUTH_ENABLED is true and GOOGLE_CLIENT_ID is missing", () => {
      expect(() =>
        loadConfig({
          NODE_ENV: "production",
          JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
          REDIS_URL: "redis://127.0.0.1:6379",
          DATABASE_URL: "postgres://user:pass@localhost:5432/db",
          FRONTEND_URL: "https://example.com",
          CORS_ORIGINS: "https://example.com",
          SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
          SUPERADMIN_PASSWORD: "super-secure-password",
          GOOGLE_AUTH_ENABLED: "true",
          // GOOGLE_CLIENT_ID is missing
        } as any)
      ).toThrow(/CRITICAL CONFIG ERROR: GOOGLE_CLIENT_ID must be provided in production when GOOGLE_AUTH_ENABLED is true/i);
    });

    it("succeeds in production when GOOGLE_AUTH_ENABLED is true and GOOGLE_CLIENT_ID is provided", () => {
      const config = loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
        GOOGLE_AUTH_ENABLED: "true",
        GOOGLE_CLIENT_ID: "123456789-test.apps.googleusercontent.com",
      } as any);

      expect(config.GOOGLE_AUTH_ENABLED).toBe(true);
      expect(config.GOOGLE_CLIENT_ID).toBe("123456789-test.apps.googleusercontent.com");
    });

    it("allows production startup without GOOGLE_CLIENT_ID when GOOGLE_AUTH_ENABLED is false", () => {
      const config = loadConfig({
        NODE_ENV: "production",
        JWT_SECRET: "secure-long-jwt-secret-key-that-is-at-least-32-chars",
        REDIS_URL: "redis://127.0.0.1:6379",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        FRONTEND_URL: "https://example.com",
        CORS_ORIGINS: "https://example.com",
        SUPERADMIN_EMAIL: "jack.cardinali15@gmail.com",
        SUPERADMIN_PASSWORD: "super-secure-password",
        GOOGLE_AUTH_ENABLED: "false",
      } as any);

      expect(config.GOOGLE_AUTH_ENABLED).toBe(false);
      expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
    });
  });

  it("normalizes escaped newlines in DATABASE_SSL_CA", () => {
    const ca = loadConfig({
      NODE_ENV: "development",
      DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\\nTEST-CA-DATA\\n-----END CERTIFICATE-----",
    } as any);

    expect(ca.DATABASE_SSL_CA).toBe("-----BEGIN CERTIFICATE-----\nTEST-CA-DATA\n-----END CERTIFICATE-----");
  });
});

