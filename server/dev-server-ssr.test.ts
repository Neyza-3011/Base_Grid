import { describe, it, expect } from "vitest";
import { spawn } from "child_process";
import path from "path";

describe("Development Server SSR Integration", () => {
  it("starts development server, renders SSR for / and /dashboard, preserves Express /api/*, and serves Vite dev assets", async () => {
    const tsxBin = path.resolve(process.cwd(), "node_modules/.bin/tsx");
    const testPort = "3006";

    const child = spawn(tsxBin, ["server.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: testPort,
        JWT_SECRET: "test-secret-at-least-32-chars-long-here",
        SKIP_DB_INIT: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let serverStarted = false;
    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (data) => {
      const str = data.toString();
      stdoutData += str;
      if (str.includes("BaseGrid Server running")) {
        serverStarted = true;
      }
    });

    child.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    try {
      // 1. Verify dev server starts properly
      for (let i = 0; i < 40; i++) {
        if (serverStarted) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(serverStarted).toBe(true);

      // 2. GET / returns HTTP 200 and contains BaseGrid landing page, NOT "Cannot GET /"
      const resRoot = await fetch(`http://127.0.0.1:${testPort}/`);
      expect(resRoot.status).toBe(200);
      const htmlRoot = await resRoot.text();
      expect(htmlRoot).not.toContain("Cannot GET /");
      expect(htmlRoot).toContain("BaseGrid");

      // 3. GET /dashboard handled by router/server SSR and does not return "Cannot GET /"
      const resDashboard = await fetch(`http://127.0.0.1:${testPort}/dashboard`);
      expect(resDashboard.status).toBe(200);
      const htmlDashboard = await resDashboard.text();
      expect(htmlDashboard).not.toContain("Cannot GET /");

      // 4. /api/... and /health continue to be handled by backend Express
      const resHealth = await fetch(`http://127.0.0.1:${testPort}/health`);
      expect(resHealth.status).toBe(200);
      const healthJson = await resHealth.json();
      expect(healthJson.status).toBe("healthy");
      expect(healthJson.service).toBe("BaseGrid Server-Authoritative Backend");

      const resApi = await fetch(`http://127.0.0.1:${testPort}/api/v1/reports`);
      expect(resApi.status).toBe(401);
      const apiJson = await resApi.json();
      expect(apiJson.detail).toContain("Non autenticato");

      // 5. HMR / Vite dev assets continue to work
      const resViteClient = await fetch(`http://127.0.0.1:${testPort}/@vite/client`);
      expect(resViteClient.status).toBe(200);
    } finally {
      await new Promise<void>((resolve) => {
        child.on("exit", () => resolve());
        child.kill("SIGTERM");
        setTimeout(() => {
          try { child.kill("SIGKILL"); } catch {}
          resolve();
        }, 3000);
      });
    }
  }, 45000);
});
