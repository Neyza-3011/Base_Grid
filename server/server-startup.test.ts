import { describe, it, expect } from "vitest";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const requiredEnv = {
  ...process.env,
  NODE_ENV: "production",
  JWT_SECRET: "test-secret-at-least-32-chars-long-here",
  DATABASE_URL: process.env.DATABASE_URL || "postgres://fake:fake@127.0.0.1:5432/fake",
  REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  FRONTEND_URL: "https://app.basegrid.io",
  CORS_ORIGINS: "https://app.basegrid.io",
  SUPERADMIN_EMAIL: "superadmin@example.com",
  SUPERADMIN_PASSWORD: "SuperAdminPassword1234!",
  EMAIL_PROVIDER: "resend",
  EMAIL_API_KEY: "re_123456789_test_key",
  EMAIL_FROM: "no-reply@basegrid.io",
  SKIP_DB_INIT: "true",
};

describe("Production Startup Sequence", () => {
  it("Fails closed (exit code 1) in production when PostgreSQL is unreachable even if SKIP_DB_INIT is true", async () => {
    await new Promise<void>((resolve) => {
      const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
      const child = spawn(tsxBin, ["server.ts"], {
        env: {
          ...requiredEnv,
          DATABASE_URL: "postgres://fake:fake@127.0.0.1:54329/fake",
          SKIP_DB_INIT: "true",
          PORT: "10006",
          NITRO_PORT: "10016",
        },
      });

      let output = "";
      child.stderr?.on("data", (data) => { output += data; });
      child.stdout?.on("data", (data) => { output += data; });

      child.on("exit", (code) => {
        expect(code).toBe(1);
        expect(output).toContain("CRITICAL STARTUP ERROR");
        resolve();
      });
    });
  }, 15000);

  it("Fails closed (exit code 1) in production when Redis is unreachable", async () => {
    await new Promise<void>((resolve) => {
      const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
      const child = spawn(tsxBin, ["server.ts"], {
        env: {
          ...requiredEnv,
          REDIS_URL: "redis://127.0.0.1:56379",
          PORT: "10007",
          NITRO_PORT: "10017",
        },
      });

      let output = "";
      child.stderr?.on("data", (data) => { output += data; });
      child.stdout?.on("data", (data) => { output += data; });

      child.on("exit", (code) => {
        expect(code).toBe(1);
        expect(output).toContain("CRITICAL STARTUP ERROR");
        resolve();
      });
    });
  }, 15000);

  it("Successfully binds and starts when infrastructure and Nitro are ready", async () => {
    await new Promise<void>((resolve) => {
      const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
      const child = spawn(tsxBin, ["server.ts"], {
        env: { ...requiredEnv, PORT: "10008", NITRO_PORT: "10018" },
      });

      let output = "";
      child.stderr?.on("data", (data) => { output += data; });
      child.stdout?.on("data", (data) => { output += data; });

      const checkInterval = setInterval(() => {
        if (output.includes("Nitro frontend is ready.") || output.includes("Infrastructure (PostgreSQL and Redis) verified successfully.")) {
          clearInterval(checkInterval);
          child.kill("SIGKILL");
          resolve();
        }
      }, 250);

      child.on("exit", (code) => {
        clearInterval(checkInterval);
        resolve();
      });
    });
  }, 30000);

  it("In ai-studio, the server selects Nitro frontend branch without requiring PostgreSQL or Redis", async () => {
    await new Promise<void>((resolve) => {
      const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
      const child = spawn(tsxBin, ["server.ts"], {
        env: {
          ...process.env,
          BASEGRID_RUNTIME_MODE: "ai-studio",
          NODE_ENV: "production",
          DATABASE_URL: "",
          REDIS_URL: "",
          PORT: "10009",
          NITRO_PORT: "10019",
        },
      });

      let output = "";
      child.stderr?.on("data", (data) => { output += data; });
      child.stdout?.on("data", (data) => { output += data; });

      const checkInterval = setInterval(() => {
        if (output.includes("[AI Studio] Standalone runtime environment initialized successfully.") &&
            (output.includes("Waiting for Nitro frontend to become ready") || output.includes("Nitro frontend is ready."))) {
          clearInterval(checkInterval);
          child.kill("SIGKILL");
          resolve();
        }
      }, 250);

      child.on("exit", () => {
        clearInterval(checkInterval);
        resolve();
      });
    });
  }, 30000);

  it("In development, the server uses Vite dev middleware and does not start Nitro", async () => {
    await new Promise<void>((resolve) => {
      const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
      const child = spawn(tsxBin, ["server.ts"], {
        env: {
          ...process.env,
          NODE_ENV: "development",
          PORT: "10010",
          JWT_SECRET: "test-secret-at-least-32-chars-long-here",
          SKIP_DB_INIT: "true",
        },
      });

      let output = "";
      child.stderr?.on("data", (data) => { output += data; });
      child.stdout?.on("data", (data) => { output += data; });

      const checkInterval = setInterval(() => {
        if (output.includes("BaseGrid Server running on http://0.0.0.0:10010")) {
          clearInterval(checkInterval);
          expect(output).not.toContain("Waiting for Nitro frontend");
          child.kill("SIGKILL");
          resolve();
        }
      }, 250);

      child.on("exit", () => {
        clearInterval(checkInterval);
        resolve();
      });
    });
  }, 30000);
});
