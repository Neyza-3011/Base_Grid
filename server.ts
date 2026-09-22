import express from "express";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import httpProxy from "http-proxy";
import { createApp } from "./server/app";
import { db } from "./server/db";
import { tokenStore } from "./server/token-store";
import { asyncHandler } from "./server/async-handler";


// Dynamically import Vite if not in production
const isProd = process.env.NODE_ENV === "production";

async function startServer() {
  const app = createApp();

  if (db.initDatabase && process.env.SKIP_DB_INIT !== "true") {
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
      resolve: {
        alias: {
          "@": path.resolve(process.cwd(), "frontend/src"),
        },
      },
    });
    app.use(vite.middlewares);

    // SSR handler for all frontend routes not handled by Express/API
    app.use(asyncHandler(async (req, res, next) => {
      // Never intercept /api/* or /health if somehow reached
      if (req.path.startsWith("/api") || req.path === "/health") {
        return next();
      }

      try {
        // 4. Convert Express request to standard Web Request
        const protocol = req.protocol || (req.headers["x-forwarded-proto"] as string) || "http";
        const host = req.get("host") || "localhost";
        const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;

        const headers = new Headers();
        for (const [key, val] of Object.entries(req.headers)) {
          if (val === undefined) continue;
          if (Array.isArray(val)) {
            for (const v of val) {
              headers.append(key, v);
            }
          } else {
            headers.set(key, val);
          }
        }

        const isGetOrHead = req.method === "GET" || req.method === "HEAD";
        let requestBody: any = undefined;
        if (!isGetOrHead && req.body) {
          if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
            requestBody = req.body;
          } else if (typeof req.body === "object" && Object.keys(req.body).length > 0) {
            requestBody = JSON.stringify(req.body);
          }
        }

        const webRequest = new Request(fullUrl, {
          method: req.method,
          headers,
          body: isGetOrHead ? undefined : requestBody,
        });

        // 3. Load TanStack Start server entry via Vite
        const entry = await vite.ssrLoadModule("/src/server.ts");
        const serverHandler = entry.default ?? entry;

        // 5. Fetch response from TanStack Start server entry
        const response: Response = await serverHandler.fetch(webRequest, {}, {});

        // Set status and statusText
        res.status(response.status);
        if (response.statusText) {
          res.statusMessage = response.statusText;
        }

        // Forward all headers
        response.headers.forEach((val: string, key: string) => {
          if (key.toLowerCase() === "set-cookie" && typeof (response.headers as any).getSetCookie === "function") {
            const cookies = (response.headers as any).getSetCookie();
            if (cookies && cookies.length > 0) {
              res.setHeader("set-cookie", cookies);
              return;
            }
          }
          res.setHeader(key, val);
        });

        // Stream or write response body
        if (!response.body) {
          res.end();
        } else if (typeof (Readable as any).fromWeb === "function") {
          const nodeStream = (Readable as any).fromWeb(response.body);
          nodeStream.on("error", (streamErr: any) => {
            vite.ssrFixStacktrace(streamErr);
            console.error("SSR streaming error:", streamErr);
            if (!res.headersSent) {
              res.status(500).send("SSR Streaming Error");
            } else {
              res.end();
            }
          });
          nodeStream.pipe(res);
        } else if (typeof response.body.getReader === "function") {
          const reader = response.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
            res.end();
          } catch (streamErr: any) {
            vite.ssrFixStacktrace(streamErr);
            console.error("SSR stream reader error:", streamErr);
            if (!res.headersSent) {
              res.status(500).send("SSR Streaming Error");
            } else {
              res.end();
            }
          } finally {
            reader.releaseLock();
          }
        } else {
          const buffer = Buffer.from(await response.arrayBuffer());
          res.end(buffer);
        }
      } catch (error: any) {
        // 6. Fix stack trace and log, then return HTTP 500 without crashing Node
        vite.ssrFixStacktrace(error);
        console.error("Vite SSR render error:", error);
        if (!res.headersSent) {
          res.status(500).send("<!DOCTYPE html><html><body><h1>Internal Server Error</h1></body></html>");
        } else {
          res.end();
        }
      }
    }));
  } else {
    // In production, start the Nitro server on a different port and proxy to it
    const { spawn } = await import("child_process");
    
    // Calculate internal Nitro port to avoid collision with main process PORT
    const nitroPort = process.env.NITRO_PORT
      ? Number(process.env.NITRO_PORT)
      : PORT === 3001
      ? 3002
      : 3001;
    const nitroEnv = {
      ...process.env,
      PORT: String(nitroPort),
      NITRO_PORT: String(nitroPort),
    };

    nitroProcess = spawn("node", [path.resolve(process.cwd(), "frontend/.output/server/index.mjs")], {
      env: nitroEnv,
      stdio: "inherit"
    });
    let nitroProcessExited = false;
    nitroProcess.on("error", (err: any) => {
      console.error("Nitro process error:", err);
      nitroProcessExited = true;
    });
    nitroProcess.on("exit", (code: number, signal: string) => {
      console.error(`Nitro process exited with code ${code}, signal ${signal}`);
      nitroProcessExited = true;
    });
    
    // Readiness check for Nitro
    console.log(`Waiting for Nitro frontend to become ready on port ${nitroPort}...`);
    let nitroReady = false;
    for (let i = 0; i < 30; i++) {
      if (nitroProcessExited) break;
      try {
        const res = await fetch(`http://127.0.0.1:${nitroPort}/`);
        // Any valid HTTP response means Nitro is listening and bound to the port
        if (res.ok || res.status === 404 || res.status === 200 || res.status === 500) {
          nitroReady = true;
          break;
        }
      } catch (err) {
        // Connection refused - still starting
      }
      // Wait 250ms before next check (max 7.5 seconds total)
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (!nitroReady) {
      console.error(`CRITICAL STARTUP ERROR: Nitro frontend failed to bind to port ${nitroPort} within 7.5 seconds.`);
      process.exit(1); // Fail-closed in production
    }
    console.log("Nitro frontend is ready.");
    
    // Use http-proxy to forward requests
    const createProxy = httpProxy.createProxyServer || (httpProxy as any).default?.createProxyServer;
    const proxy = createProxy.call(httpProxy);
    
    app.use((req, res) => {
      proxy.web(req, res, { target: `http://127.0.0.1:${nitroPort}` }, (e) => {
        res.status(502).send("Bad Gateway: Nitro Server not ready or failed.");
      });
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`BaseGrid Server running on http://0.0.0.0:${PORT}`);
  });

  // Graceful Shutdown Handler
  const gracefulShutdown = createShutdownHandler({
    server,
    nitroProcess,
    db,
    tokenStore,
    exit: (code) => process.exit(code),
    timeoutMs: 10000,
  });

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

export interface ShutdownDependencies {
  server: { close: (cb: (err?: Error) => void) => void };
  nitroProcess?: { kill: (sig: string) => boolean } | null;
  db?: { close?: () => Promise<void> };
  tokenStore?: { getAdapter?: () => { close?: () => Promise<void> } };
  exit?: (code: number) => void;
  timeoutMs?: number;
}

export function createShutdownHandler(deps: ShutdownDependencies) {
  let isShuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;

  return (signal: string): Promise<void> => {
    if (isShuttingDown && shutdownPromise) {
      console.log(`Shutdown already in progress. Ignoring duplicate signal ${signal}.`);
      return shutdownPromise;
    }
    isShuttingDown = true;
    console.log(`Received ${signal}. Initiating graceful shutdown...`);

    const timeoutMs = deps.timeoutMs ?? 10000;
    const exitFn = deps.exit ?? ((code: number) => process.exit(code));

    const forceTimer = setTimeout(() => {
      console.error(`CRITICAL: Graceful shutdown timed out after ${timeoutMs}ms. Forcing process exit.`);
      exitFn(1);
    }, timeoutMs);

    if (typeof (forceTimer as any).unref === "function") {
      (forceTimer as any).unref();
    }

    shutdownPromise = (async () => {
      try {
        // 1 & 2. Stop accepting new requests and allow in-flight active requests to drain
        await new Promise<void>((resolve) => {
          deps.server.close((err) => {
            if (err) {
              console.error("Error while closing Express server:", err);
            } else {
              console.log("Express server stopped accepting new connections and drained active requests.");
            }
            resolve();
          });
        });

        // 3. Terminate the spawned Nitro frontend process if present
        if (deps.nitroProcess) {
          console.log("Terminating Nitro frontend process...");
          try {
            deps.nitroProcess.kill("SIGTERM");
          } catch (err) {
            console.error("Error terminating Nitro process:", err);
          }
        }

        // 4. Close the DB adapter PostgreSQL connection pool
        if (deps.db && typeof deps.db.close === "function") {
          console.log("Closing PostgreSQL connection pool...");
          try {
            await deps.db.close();
          } catch (err) {
            console.error("Error closing PostgreSQL pool:", err);
          }
        }

        // 5. Complete existing Redis token store shutdown
        if (deps.tokenStore && typeof deps.tokenStore.getAdapter === "function") {
          try {
            const adapter = deps.tokenStore.getAdapter();
            if (adapter && typeof adapter.close === "function") {
              console.log("Closing Redis token store connection...");
              await adapter.close();
            }
          } catch (err) {
            console.error("Error closing Redis token store:", err);
          }
        }

        clearTimeout(forceTimer);
        console.log("Graceful shutdown sequence completed.");
        exitFn(0);
      } catch (err) {
        clearTimeout(forceTimer);
        console.error("Unexpected error during graceful shutdown:", err);
        exitFn(1);
      }
    })();

    return shutdownPromise;
  };
}

if (!process.argv[1]?.includes("vitest")) {
  startServer().catch((err) => {
    console.error("CRITICAL: Uncaught server startup failure:", err);
    process.exit(1);
  });
}


