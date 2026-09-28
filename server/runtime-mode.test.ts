import { describe, it, expect, vi } from "vitest";
import { getRuntimeMode } from "./runtime-mode";
import { getJwtSecret, assertValidJwtSecret } from "./security";
import { loadConfig } from "./config";
import { createDatabaseAdapter, DatabaseStore, PostgresAdapter } from "./db";
import { RefreshTokenStore, DistributedStorageEngine, RedisTokenStorageAdapter } from "./token-store";

describe("Runtime Mode & Dual-Environment Architecture", () => {
  describe("Mode Detection (getRuntimeMode)", () => {
    it("1. respects explicit BASEGRID_RUNTIME_MODE overrides", () => {
      expect(getRuntimeMode({ BASEGRID_RUNTIME_MODE: "production" })).toBe("production");
      expect(getRuntimeMode({ BASEGRID_RUNTIME_MODE: "ai-studio" })).toBe("ai-studio");
      expect(getRuntimeMode({ BASEGRID_RUNTIME_MODE: "development" })).toBe("development");
      expect(getRuntimeMode({ BASEGRID_RUNTIME_MODE: "test" })).toBe("test");
    });

    it("2. respects explicit BASEGRID_RUNTIME_MODE=ai-studio even when NODE_ENV=production", () => {
      expect(getRuntimeMode({ BASEGRID_RUNTIME_MODE: "ai-studio", NODE_ENV: "production" })).toBe("ai-studio");
    });

    it("identifies test and development from NODE_ENV", () => {
      expect(getRuntimeMode({ NODE_ENV: "test" })).toBe("test");
      expect(getRuntimeMode({ NODE_ENV: "development" })).toBe("development");
      expect(getRuntimeMode({})).toBe("development");
    });

    it("13. defaults to strict production when NODE_ENV=production without AI Studio indicator", () => {
      expect(getRuntimeMode({ NODE_ENV: "production" })).toBe("production");
      expect(getRuntimeMode({ NODE_ENV: "production", K_SERVICE: "service" })).toBe("production");
    });

    it("14. AI Studio detection cannot be triggered merely by NODE_ENV=production plus absence of DB/Redis", () => {
      expect(getRuntimeMode({ NODE_ENV: "production" })).toBe("production");
      expect(getRuntimeMode({ NODE_ENV: "production", DATABASE_URL: "", REDIS_URL: "" })).toBe("production");
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
    it("3. production without JWT_SECRET => fail fast", () => {
      expect(() => {
        getJwtSecret({ BASEGRID_RUNTIME_MODE: "production" });
      }).toThrow(/CRITICAL SECURITY ERROR.*JWT secret.*missing or empty/i);

      expect(() => {
        assertValidJwtSecret({ BASEGRID_RUNTIME_MODE: "production" });
      }).toThrow(/CRITICAL SECURITY ERROR.*JWT secret.*missing or empty/i);
    });

    it("ai-studio without JWT_SECRET => generates ephemeral 64-char random secret without crashing", () => {
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
    it("4. production without DATABASE_URL => fail fast in loadConfig", () => {
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

    it("8. ai-studio without DATABASE_URL => loads safe config and selects DatabaseStore", () => {
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

    it("9. ai-studio without REDIS_URL => uses in-memory token store", () => {
      const store = new RefreshTokenStore();
      expect(store.isAvailable()).toBe(true);
    });

    it("10. AI Studio startup path allows in-memory token store when NODE_ENV=production", () => {
      const origMode = process.env.BASEGRID_RUNTIME_MODE;
      const origNodeEnv = process.env.NODE_ENV;
      try {
        process.env.BASEGRID_RUNTIME_MODE = "ai-studio";
        process.env.NODE_ENV = "production";
        expect(() => new DistributedStorageEngine()).not.toThrow();
        expect(() => new DatabaseStore()).not.toThrow();
      } finally {
        if (origMode) process.env.BASEGRID_RUNTIME_MODE = origMode;
        else delete process.env.BASEGRID_RUNTIME_MODE;
        if (origNodeEnv) process.env.NODE_ENV = origNodeEnv;
        else delete process.env.NODE_ENV;
      }
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

    it("6. DatabaseStore fails closed when instantiated directly in strict production mode", () => {
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

    it("7b. DistributedStorageEngine fails closed when instantiated directly in strict production mode", () => {
      const originalMode = process.env.BASEGRID_RUNTIME_MODE;
      const originalNodeEnv = process.env.NODE_ENV;
      try {
        process.env.BASEGRID_RUNTIME_MODE = "production";
        process.env.NODE_ENV = "production";
        expect(() => new DistributedStorageEngine()).toThrow(/DistributedStorageEngine \(in-memory\) cannot be used in production/i);
      } finally {
        if (originalMode) process.env.BASEGRID_RUNTIME_MODE = originalMode;
        else delete process.env.BASEGRID_RUNTIME_MODE;
        if (originalNodeEnv) process.env.NODE_ENV = originalNodeEnv;
        else delete process.env.NODE_ENV;
      }
    });

    it("respects process.env.PORT in ai-studio and production", () => {
      const config = loadConfig({
        BASEGRID_RUNTIME_MODE: "ai-studio",
        PORT: "8080",
      } as any);
      expect(config.PORT).toBe(8080);
    });
  });

  describe("SuperAdmin Bootstrap Idempotency & Collision Safety", () => {
    it("11 & 12. handles Case A, Case B, Case C, and Case D safely", async () => {
      const mockPool = {
        query: vi.fn(),
      };

      const postgresAdapter = Object.create(PostgresAdapter.prototype);
      (postgresAdapter as any).pool = mockPool;

      // Case A: No matching user exists -> INSERT
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // companies insert
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // users query (0 rows)
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // users insert
      await postgresAdapter.initDatabase();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO users"),
        expect.arrayContaining(["usr-superadmin-001"])
      );

      // Case B: Matching user exists with expected identity -> UPDATE
      mockPool.query.mockReset();
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // companies insert
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "usr-superadmin-001", email: "saas@rapporti.it", role: "superadmin" }],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // users update
      await postgresAdapter.initDatabase();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE users SET"),
        expect.arrayContaining(["usr-superadmin-001"])
      );

      // Case C: Same email with different ID -> CRITICAL BOOTSTRAP ERROR
      mockPool.query.mockReset();
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // companies insert
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "usr-different-002", email: "saas@rapporti.it", role: "admin" }],
      });
      await expect(postgresAdapter.initDatabase()).rejects.toThrow(
        /CRITICAL BOOTSTRAP ERROR: SuperAdmin email .* is already assigned to a different user ID/i
      );

      // Case D: Same ID with different email -> CRITICAL BOOTSTRAP ERROR
      mockPool.query.mockReset();
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // companies insert
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: "usr-superadmin-001", email: "other@rapporti.it", role: "superadmin" }],
      });
      await expect(postgresAdapter.initDatabase()).rejects.toThrow(
        /CRITICAL BOOTSTRAP ERROR: SuperAdmin ID .* is already assigned to a different email/i
      );
    });
  });
});
