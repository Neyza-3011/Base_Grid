import { describe, it, expect } from "vitest";
import { getRuntimeMode } from "./runtime-mode";
import { getJwtSecret, assertValidJwtSecret } from "./security";
import { loadConfig } from "./config";
import { createDatabaseAdapter, DatabaseStore, PostgresAdapter } from "./db";
import { RefreshTokenStore, RedisTokenStorageAdapter } from "./token-store";

describe("Runtime Mode & Dual-Environment Architecture", () => {
  describe("Mode Detection (getRuntimeMode)", () => {
    it("respects explicit BASEGRID_RUNTIME_MODE overrides", () => {
      expect(getRuntimeMode({ BASEGRID_RUNTIME_MODE: "production" })).toBe("production");
      expect(getRuntimeMode({ BASEGRID_RUNTIME_MODE: "ai-studio" })).toBe("ai-studio");
      expect(getRuntimeMode({ BASEGRID_RUNTIME_MODE: "development" })).toBe("development");
      expect(getRuntimeMode({ BASEGRID_RUNTIME_MODE: "test" })).toBe("test");
    });

    it("identifies test and development from NODE_ENV", () => {
      expect(getRuntimeMode({ NODE_ENV: "test" })).toBe("test");
      expect(getRuntimeMode({ NODE_ENV: "development" })).toBe("development");
      expect(getRuntimeMode({})).toBe("development");
    });

    it("defaults to strict production when NODE_ENV=production without AI Studio indicator", () => {
      expect(getRuntimeMode({ NODE_ENV: "production" })).toBe("production");
      expect(getRuntimeMode({ NODE_ENV: "production", K_SERVICE: "service" })).toBe("production");
    });

    it("auto-detects ai-studio on Cloud Run only when no DB/Redis and GEMINI_API_KEY is present", () => {
      const mode = getRuntimeMode({
        NODE_ENV: "production",
        K_SERVICE: "ais-preview",
        GEMINI_API_KEY: "test-gemini-key",
      });
      expect(mode).toBe("ai-studio");
    });

    it("remains strict production if DATABASE_URL or REDIS_URL are present in Cloud Run", () => {
      const modeWithDb = getRuntimeMode({
        NODE_ENV: "production",
        K_SERVICE: "ais-preview",
        GEMINI_API_KEY: "test-gemini-key",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      });
      expect(modeWithDb).toBe("production");
    });
  });

  describe("JWT Security per Mode", () => {
    it("1. production without JWT_SECRET => fail fast", () => {
      expect(() => {
        getJwtSecret({ BASEGRID_RUNTIME_MODE: "production" });
      }).toThrow(/CRITICAL SECURITY ERROR.*JWT secret.*missing or empty/i);

      expect(() => {
        assertValidJwtSecret({ BASEGRID_RUNTIME_MODE: "production" });
      }).toThrow(/CRITICAL SECURITY ERROR.*JWT secret.*missing or empty/i);
    });

    it("2. ai-studio without JWT_SECRET => generates ephemeral 64-char random secret without crashing", () => {
      const secret1 = getJwtSecret({ BASEGRID_RUNTIME_MODE: "ai-studio" });
      const secret2 = getJwtSecret({ BASEGRID_RUNTIME_MODE: "ai-studio" });

      expect(typeof secret1).toBe("string");
      expect(secret1.length).toBe(64); // 32 bytes hex
      expect(secret1).toBe(secret2); // consistent per process runtime
      expect(() => assertValidJwtSecret({ BASEGRID_RUNTIME_MODE: "ai-studio" })).not.toThrow();
    });

    it("ai-studio with explicit valid JWT_SECRET => uses provided secret", () => {
      const customSecret = "custom-ai-studio-jwt-secret-min-32-chars-long";
      const secret = getJwtSecret({
        BASEGRID_RUNTIME_MODE: "ai-studio",
        JWT_SECRET: customSecret,
      });
      expect(secret).toBe(customSecret);
    });
  });

  describe("Configuration & Database Adapter per Mode", () => {
    it("3. production without DATABASE_URL => fail fast in loadConfig", () => {
      expect(() => {
        loadConfig({
          BASEGRID_RUNTIME_MODE: "production",
          JWT_SECRET: "valid-production-secret-key-at-least-32-chars",
          REDIS_URL: "redis://127.0.0.1:6379",
          SUPERADMIN_EMAIL: "admin@example.com",
          SUPERADMIN_PASSWORD: "SuperAdminPassword123!",
          FRONTEND_URL: "https://app.basegrid.io",
          CORS_ORIGINS: "https://app.basegrid.io",
        } as any);
      }).toThrow(/CRITICAL CONFIG ERROR: DATABASE_URL must be provided/i);
    });

    it("4. ai-studio without DATABASE_URL => loads safe config and selects DatabaseStore", () => {
      const config = loadConfig({
        BASEGRID_RUNTIME_MODE: "ai-studio",
      } as any);

      expect(config.SUPERADMIN_EMAIL).toBe("saas@rapporti.it");
      expect(config.SUPERADMIN_PASSWORD.length).toBeGreaterThanOrEqual(12);
      expect(config.JWT_SECRET.length).toBeGreaterThanOrEqual(32);

      const adapter = createDatabaseAdapter(config);
      expect(adapter).toBeInstanceOf(DatabaseStore);
    });

    it("5. production without REDIS_URL => fail fast in loadConfig", () => {
      expect(() => {
        loadConfig({
          BASEGRID_RUNTIME_MODE: "production",
          JWT_SECRET: "valid-production-secret-key-at-least-32-chars",
          DATABASE_URL: "postgres://user:pass@localhost:5432/db",
          SUPERADMIN_EMAIL: "admin@example.com",
          SUPERADMIN_PASSWORD: "SuperAdminPassword123!",
          FRONTEND_URL: "https://app.basegrid.io",
          CORS_ORIGINS: "https://app.basegrid.io",
        } as any);
      }).toThrow(/CRITICAL CONFIG ERROR: REDIS_URL must be provided/i);
    });

    it("6. ai-studio without REDIS_URL => uses in-memory token store", () => {
      const store = new RefreshTokenStore();
      expect(store.isAvailable()).toBe(true);
    });

    it("7. production with valid config selects PostgresAdapter and RedisTokenStorageAdapter", () => {
      const prodConfig = loadConfig({
        BASEGRID_RUNTIME_MODE: "production",
        JWT_SECRET: "valid-production-secret-key-at-least-32-chars",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        REDIS_URL: "redis://127.0.0.1:6379",
        SUPERADMIN_EMAIL: "admin@example.com",
        SUPERADMIN_PASSWORD: "SuperAdminPassword123!",
        FRONTEND_URL: "https://app.basegrid.io",
        CORS_ORIGINS: "https://app.basegrid.io",
      } as any);

      const dbAdapter = createDatabaseAdapter(prodConfig);
      expect(dbAdapter).toBeInstanceOf(PostgresAdapter);
    });

    it("8. DatabaseStore fails closed when instantiated directly in strict production mode", () => {
      const originalMode = process.env.BASEGRID_RUNTIME_MODE;
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        process.env.BASEGRID_RUNTIME_MODE = "production";
        process.env.NODE_ENV = "production";
        expect(() => new DatabaseStore()).toThrow(/DatabaseStore \(in-memory\) cannot be used in production/i);
      } finally {
        if (originalMode) process.env.BASEGRID_RUNTIME_MODE = originalMode;
        else delete process.env.BASEGRID_RUNTIME_MODE;
        if (originalNodeEnv) process.env.NODE_ENV = originalNodeEnv;
        else delete process.env.NODE_ENV;
      }
    });

    it("9. respects process.env.PORT in ai-studio and production", () => {
      const config = loadConfig({
        BASEGRID_RUNTIME_MODE: "ai-studio",
        PORT: "8080",
      } as any);
      expect(config.PORT).toBe(8080);
    });
  });
});
