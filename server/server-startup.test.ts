import { describe, it, expect } from "vitest";
import { spawn } from "child_process";
import fs from "fs";
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

describe("Production Startup Sequence", () => {
  it("Fails closed (exit code 1) when Nitro fails to start in production", async () => {
    const nitroPath = path.resolve(process.cwd(), "frontend/.output/server/index.mjs");
    const backupPath = nitroPath + ".backup";
    let moved = false;
    if (fs.existsSync(nitroPath)) {
      fs.renameSync(nitroPath, backupPath);
      moved = true;
    }

    try {
      await new Promise<void>((resolve) => {
        const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
        const child = spawn(tsxBin, ["server.ts"], {
          env: { ...requiredEnv, PORT: "10007", NITRO_PORT: "10017" },
        });

        let output = "";
        child.stderr?.on("data", (data) => { output += data; });
        child.stdout?.on("data", (data) => { output += data; });

        child.on("exit", (code) => {
          expect(code).toBe(1);
          expect(output).toContain("CRITICAL STARTUP ERROR");
          expect(output).toContain("Nitro frontend failed to bind");
          resolve();
        });
      });
    } finally {
      if (moved) {
        fs.renameSync(backupPath, nitroPath);
      }
    }
  }, 30000);

  it("Successfully binds and starts when Nitro is ready", async () => {
    await new Promise<void>((resolve) => {
      const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
      const child = spawn(tsxBin, ["server.ts"], {
        env: { ...requiredEnv, PORT: "10008", NITRO_PORT: "10018" },
      });

      let output = "";
      child.stderr?.on("data", (data) => { output += data; });
      child.stdout?.on("data", (data) => { output += data; });

      const checkInterval = setInterval(() => {
        if (output.includes("Nitro frontend is ready.")) {
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
});
