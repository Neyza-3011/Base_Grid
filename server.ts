import express from "express";
import path from "path";
import fs from "fs";
import { createApp } from "./server/app";
import { db } from "./server/db";

// Dynamically import Vite if not in production
const isProd = process.env.NODE_ENV === "production";

async function startServer() {
  const app = createApp();
  if (db.initDatabase) {
    await db.initDatabase();
    console.log("Database initialized.");
  }
  const PORT = 3000;

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
    const nitroProcess = spawn("node", [path.resolve(process.cwd(), "frontend/.output/server/index.mjs")], {
      env: nitroEnv,
      stdio: "inherit"
    });
    
    // Use http-proxy to forward requests
    const httpProxy = await import("http-proxy");
    const proxy = httpProxy.createProxyServer();
    
    app.use((req, res) => {
      proxy.web(req, res, { target: "http://127.0.0.1:3001" }, (e) => {
        res.status(502).send("Bad Gateway: Nitro Server not ready or failed.");
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BaseGrid Server running on http://localhost:${PORT}`);
  });
}

startServer();

