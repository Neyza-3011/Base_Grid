import { describe, it, expect } from "vitest";
import { spawn } from "child_process";
import path from "path";

const requiredEnv = {
  ...process.env,
  NODE_ENV: "production",
  JWT_SECRET: "test-secret-at-least-32-chars-long-here",
  DATABASE_URL: "postgres://fake:fake@127.0.0.1:5432/fake",
  REDIS_URL: "redis://127.0.0.1:6379",
  FRONTEND_URL: "https://app.basegrid.io",
  CORS_ORIGINS: "https://app.basegrid.io",
  SUPERADMIN_EMAIL: "superadmin@example.com",
  SUPERADMIN_PASSWORD: "SuperAdminPassword1234!",
  EMAIL_PROVIDER: "resend",
  EMAIL_API_KEY: "re_123456789_test_key",
  EMAIL_FROM: "no-reply@basegrid.io",
  SKIP_DB_INIT: "true",
};

describe("Production Startup Sequence — Fail-Closed Hardening", () => {
  it("fails closed (exit code 1) in production when database is unreachable, even if SKIP_DB_INIT=true is set", async () => {
    await new Promise<void>((resolve) => {
      const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
      const child = spawn(tsxBin, ["server.ts"], {
        env: {
          ...requiredEnv,
          PORT: "10007",
          NITRO_PORT: "10017",
          DATABASE_URL: "postgres://fake:fake@127.0.0.1:5432/fake_unreachable",
          SKIP_DB_INIT: "true",
        },
      });

      let output = "";
      child.stderr?.on("data", (data) => { output += data; });
      child.stdout?.on("data", (data) => { output += data; });

      child.on("exit", (code) => {
        expect(code).toBe(1);
        expect(output).toContain("CRITICAL STARTUP ERROR");
        expect(output).toContain("Database or Redis verification failed in production");
        resolve();
      });
    });
  }, 30000);

  it("fails closed (exit code 1) in production when Redis is unreachable, even if SKIP_DB_INIT=true is set", async () => {
    await new Promise<void>((resolve) => {
      const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
      const child = spawn(tsxBin, ["server.ts"], {
        env: {
          ...requiredEnv,
          PORT: "10008",
          NITRO_PORT: "10018",
          REDIS_URL: "redis://127.0.0.1:63999", // Unreachable port
          SKIP_DB_INIT: "true",
        },
      });

      let output = "";
      child.stderr?.on("data", (data) => { output += data; });
      child.stdout?.on("data", (data) => { output += data; });

      child.on("exit", (code) => {
        expect(code).toBe(1);
        expect(output).toContain("CRITICAL STARTUP ERROR");
        expect(output).toContain("Database or Redis verification failed in production");
        resolve();
      });
    });
  }, 30000);
});
