import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Router } from "express";
import { asyncHandler } from "./async-handler";
import { createApp } from "./app";
import { authRouter } from "./routes/auth";

// Mock security module for JWT secret check in createApp
vi.mock("./security", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    assertValidJwtSecret: vi.fn(),
    getJwtSecret: vi.fn(() => "test-secret-value"),
  };
});

describe("P0.4.4-F — Async Error Propagation & asyncHandler helper", () => {
  describe("Unit: asyncHandler", () => {
    it("calls the wrapped async handler with req, res, next", async () => {
      const mockReq = { test: true } as any;
      const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
      const mockNext = vi.fn();

      const fn = vi.fn(async (req, res, next) => {
        res.status(200).json({ ok: true });
      });

      const wrapped = asyncHandler(fn);
      await wrapped(mockReq, mockRes, mockNext);

      expect(fn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ ok: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("catches rejected promises and forwards error to next(err)", async () => {
      const mockReq = {} as any;
      const mockRes = {} as any;
      const mockNext = vi.fn();
      const testError = new Error("Async failure");

      const fn = vi.fn(async () => {
        throw testError;
      });

      const wrapped = asyncHandler(fn);
      await wrapped(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(testError);
    });

    it("catches Promise.reject and forwards error to next(err)", async () => {
      const mockReq = {} as any;
      const mockRes = {} as any;
      const mockNext = vi.fn();
      const testError = new Error("Promise rejected directly");

      const fn = vi.fn(() => Promise.reject(testError));

      const wrapped = asyncHandler(fn);
      await wrapped(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(testError);
    });

    it("works with synchronous functions returning non-promise", async () => {
      const mockReq = {} as any;
      const mockRes = { send: vi.fn() } as any;
      const mockNext = vi.fn();

      const fn = vi.fn((_req: any, res: any) => {
        res.send("sync result");
      });

      const wrapped = asyncHandler(fn);
      await wrapped(mockReq, mockRes, mockNext);

      expect(fn).toHaveBeenCalled();
      expect(mockRes.send).toHaveBeenCalledWith("sync result");
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("Integration: Express Central Error Handler with asyncHandler", () => {
    it("catches unhandled async exceptions in route handlers and responds with 500 without hanging", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Mount directly on authRouter which is mounted inside createApp before 404 handler
      authRouter.get(
        "/test-async-crash",
        asyncHandler(async () => {
          // Simulate an async operation throwing an unexpected runtime exception
          await new Promise((resolve) => setTimeout(resolve, 5));
          throw new Error("Simulated async database connection dropped");
        })
      );

      const app = createApp();
      const response = await request(app).get("/api/v1/auth/test-async-crash");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ detail: "Errore interno del server." });
      // Error message is sanitized from client
      expect(response.text).not.toContain("Simulated async database connection dropped");

      consoleSpy.mockRestore();
    });

    it("catches unhandled async rejections with custom HTTP status (e.g. 404, 400)", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      authRouter.get(
        "/test-async-custom-error",
        asyncHandler(async () => {
          await Promise.resolve();
          const err: any = new Error("Risorsa richiesta non trovata.");
          err.status = 404;
          throw err;
        })
      );

      const app = createApp();
      const response = await request(app).get("/api/v1/auth/test-async-custom-error");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ detail: "Risorsa richiesta non trovata." });

      consoleSpy.mockRestore();
    });

    it("catches async exceptions in middleware and forwards to central error handler before reaching route", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const failingAsyncMiddleware = asyncHandler(async () => {
        await Promise.resolve();
        throw new Error("Async middleware token verification fault");
      });

      const routeHandler = vi.fn(async (_req, res) => {
        res.status(200).json({ reached: true });
      });

      authRouter.get("/test-guarded-route", failingAsyncMiddleware, asyncHandler(routeHandler));

      const app = createApp();
      const response = await request(app).get("/api/v1/auth/test-guarded-route");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ detail: "Errore interno del server." });
      expect(routeHandler).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("ensures normal async handlers continue to work and return successful response", async () => {
      authRouter.get(
        "/test-async-success",
        asyncHandler(async (_req, res) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          res.status(200).json({ status: "success", data: [1, 2, 3] });
        })
      );

      const app = createApp();
      const response = await request(app).get("/api/v1/auth/test-async-success");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "success", data: [1, 2, 3] });
    });
  });
});
