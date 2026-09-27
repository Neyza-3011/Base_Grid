import { describe, it, expect } from "vitest";
import { getJwtSecret, assertValidJwtSecret } from "./security";

describe("JWT Secret Management & Security Hardening", () => {
  const validSecret = "secure-production-jwt-secret-key-at-least-32-chars-long!";

  describe("Production Environment (NODE_ENV=production)", () => {
    it("throws when secret is missing in production", () => {
      expect(() => {
        getJwtSecret({
          NODE_ENV: "production",
        });
      }).toThrow(/CRITICAL SECURITY ERROR.*JWT secret.*missing or empty/i);

      expect(() => {
        assertValidJwtSecret({
          NODE_ENV: "production",
        });
      }).toThrow(/CRITICAL SECURITY ERROR.*JWT secret.*missing or empty/i);
    });

    it("throws when secret is empty string or whitespace in production", () => {
      expect(() => {
        getJwtSecret({
          NODE_ENV: "production",
          JWT_SECRET: "",
        });
      }).toThrow(/CRITICAL SECURITY ERROR.*JWT secret.*(missing or empty|empty)/i);

      expect(() => {
        getJwtSecret({
          NODE_ENV: "production",
          JWT_SECRET: "   ",
        });
      }).toThrow(/CRITICAL SECURITY ERROR.*JWT secret.*(missing or empty|empty|whitespace)/i);

      expect(() => {
        assertValidJwtSecret({
          NODE_ENV: "production",
          JWT_SECRET: "",
        });
      }).toThrow(/CRITICAL SECURITY ERROR.*JWT secret.*(missing or empty|empty)/i);
    });

    it("throws when secret is too short (< 32 chars) in production", () => {
      expect(() => {
        getJwtSecret({
          NODE_ENV: "production",
          JWT_SECRET: "short-key-less-than-32-chars",
        });
      }).toThrow(/CRITICAL SECURITY ERROR.*at least 32 characters/i);

      expect(() => {
        assertValidJwtSecret({
          NODE_ENV: "production",
          SECRET_KEY: "short-key-less-than-32-chars",
        });
      }).toThrow(/CRITICAL SECURITY ERROR.*at least 32 characters/i);
    });

    it("throws when secret is a known insecure placeholder in production", () => {
      const placeholders = [
        "secret",
        "changeme",
        "password",
        "jwt_secret",
        "secret_key",
        "default_secret",
        "your-secret-key-here",
        "12345678901234567890123456789012",
        "basegrid-production-secure-jwt-key-2026-auth-authoritative",
      ];

      for (const placeholder of placeholders) {
        expect(() => {
          getJwtSecret({
            NODE_ENV: "production",
            JWT_SECRET: placeholder,
          });
        }).toThrow(/CRITICAL SECURITY ERROR/i);

        expect(() => {
          assertValidJwtSecret({
            NODE_ENV: "production",
            JWT_SECRET: placeholder,
          });
        }).toThrow(/CRITICAL SECURITY ERROR/i);
      }
    });

    it("accepts a valid, high-entropy secret in production (from JWT_SECRET or SECRET_KEY)", () => {
      const secret1 = getJwtSecret({
        NODE_ENV: "production",
        JWT_SECRET: validSecret,
      });
      expect(secret1).toBe(validSecret);

      const secret2 = getJwtSecret({
        NODE_ENV: "production",
        SECRET_KEY: validSecret,
      });
      expect(secret2).toBe(validSecret);

      expect(() => {
        assertValidJwtSecret({
          NODE_ENV: "production",
          JWT_SECRET: validSecret,
        });
      }).not.toThrow();
    });
  });

  describe("Development / Test Environment (NODE_ENV !== production)", () => {
    it("returns stable local development fallback when secret is missing in development", () => {
      const devSecret = getJwtSecret({
        NODE_ENV: "development",
      });
      expect(typeof devSecret).toBe("string");
      expect(devSecret.length).toBeGreaterThanOrEqual(32);

      expect(() => {
        assertValidJwtSecret({
          NODE_ENV: "development",
        });
      }).not.toThrow();
    });

    it("returns stable local development fallback when secret is missing in test", () => {
      const testSecret = getJwtSecret({
        NODE_ENV: "test",
      });
      expect(typeof testSecret).toBe("string");
      expect(testSecret.length).toBeGreaterThanOrEqual(32);

      expect(() => {
        assertValidJwtSecret({
          NODE_ENV: "test",
        });
      }).not.toThrow();
    });

    it("uses explicitly provided valid secret in dev/test if available", () => {
      const customDevSecret = getJwtSecret({
        NODE_ENV: "development",
        JWT_SECRET: validSecret,
      });
      expect(customDevSecret).toBe(validSecret);
    });
  });
});
