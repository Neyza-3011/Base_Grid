import express from "express";
import path from "path";
import fs from "fs";
import { createApp } from "./server/app";
import { db } from "./server/db";
import { tokenStore } from "./server/token-store";

// Dynamically import Vite if not in production
const isProd = process.env.NODE_ENV === "production";

async function startServer() {
  const app = createApp();

  if (db.initDatabase) {
    try {
      await db.initDatabase();
      console.log("Database initialized successfully.");
    } catch (err) {
      console.error("CRITICAL STARTUP ERROR: Database initialization failed:", err);
      if (isProd) {
        process.exit(1);
      }
    }
  }

  const PORT = Number(process.env.PORT) || 3000;
  let nitroProcess: any = null;

  // --- Vite / Frontend Serving ---
  if (!isProd) {
    // Dynamic import to avoid including Vite in production bundle
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
      root: path.resolve(process.cwd(), "frontend"),
    });
    app.use(vite.middlewares);
  } else {
    // In production, start the Nitro server on a different port and proxy to it
    const { spawn } = await import("child_process");
    
    // Spawn Nitro on port 3001
    const nitroEnv = { ...process.env, PORT: "3001" };
    nitroProcess = spawn("node", [path.resolve(process.cwd(), "frontend/.output/server/index.mjs")], {
      env: nitroEnv,
      stdio: "inherit"
    });
    
    // Readiness check for Nitro
    console.log("Waiting for Nitro frontend to become ready...");
    let nitroReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch("http://127.0.0.1:3001/");
        // Any valid HTTP response means Nitro is listening and bound to the port
        if (res.ok || res.status === 404 || res.status === 200 || res.status === 500) {
          nitroReady = true;
          break;
        }
      } catch (err) {
        // Connection refused - still starting
      }
      // Wait 500ms before next check (max 15 seconds total)
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!nitroReady) {
      console.error("CRITICAL STARTUP ERROR: Nitro frontend failed to bind to port 3001 within 15 seconds.");
      process.exit(1); // Fail-closed in production
    }
    console.log("Nitro frontend is ready.");
    
    // Use http-proxy to forward requests
    const httpProxy = await import("http-proxy");
    const proxy = httpProxy.createProxyServer();
    
    app.use((req, res) => {
      proxy.web(req, res, { target: "http://127.0.0.1:3001" }, (e) => {
        res.status(502).send("Bad Gateway: Nitro Server not ready or failed.");
      });
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`BaseGrid Server running on http://0.0.0.0:${PORT}`);
  });

  // Graceful Shutdown Handler
  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`Received ${signal}. Initiating graceful shutdown...`);

    // 1. Close Express server to stop accepting new requests
    server.close(() => {
      console.log("Express server stopped accepting new connections.");
    });

    // 2. Kill the spawned Nitro frontend process
    if (nitroProcess) {
      console.log("Terminating Nitro frontend process...");
      try {
        nitroProcess.kill("SIGTERM");
      } catch (err) {
        console.error("Error killing Nitro process:", err);
      }
    }

    // 3. Close the DB adapter connection pool
    try {
      if (db && typeof db.close === "function") {
        console.log("Closing PostgreSQL connection pool...");
        await db.close();
      }
    } catch (err) {
      console.error("Error closing PostgreSQL pool:", err);
    }

    // 4. Close the tokenStore (Redis) adapter
    try {
      const adapter = tokenStore.getAdapter();
      if (adapter && typeof adapter.close === "function") {
        console.log("Closing Redis token store connection...");
        await adapter.close();
      }
    } catch (err) {
      console.error("Error closing Redis token store:", err);
    }

    console.log("Graceful shutdown sequence completed.");
    process.exit(0);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer().catch((err) => {
  console.error("CRITICAL: Uncaught server startup failure:", err);
  process.exit(1);
});


