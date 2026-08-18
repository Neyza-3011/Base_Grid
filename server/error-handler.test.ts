import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { authRouter } from "./routes/auth";

// Mock security module
vi.mock("./security", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    assertValidJwtSecret: vi.fn(),
    getJwtSecret: vi.fn(() => "test-secret-value"),
  };
});

describe("App Express Error Handler Integration", () => {
  it("Error handler does not expose err.message for 500 internal errors and logs safely with correlation ID", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    
    // Register route on authRouter which is mounted before the error handler in createApp
    authRouter.get("/test-trigger-500", (_req, _res, next) => {
      const err: any = new Error("SUPER_SECRET_DATABASE_PASSWORD_LEAK");
      err.status = 500;
      next(err);
    });

    const app = createApp();
    const response = await request(app).get("/api/v1/auth/test-trigger-500");
    
    expect(response.status).toBe(500);
    expect(response.body.detail).toBe("Errore interno del server.");
    expect(response.text).not.toContain("SUPER_SECRET_DATABASE_PASSWORD_LEAK");
    
    // Verify console log contains correlation ID and not the secret
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[ServerError\] Error: Internal Server Error \(ID: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)/)
    );
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("SUPER_SECRET_DATABASE_PASSWORD_LEAK")
    );
    
    consoleSpy.mockRestore();
  });

  it("Error handler exposes err.message for expected client errors (400)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    
    authRouter.get("/test-trigger-400", (_req, _res, next) => {
      const err: any = new Error("Invalid payload format");
      err.status = 400;
      next(err);
    });

    const app = createApp();
    const response = await request(app).get("/api/v1/auth/test-trigger-400");
    
    expect(response.status).toBe(400);
    expect(response.body.detail).toBe("Invalid payload format");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ServerError]"),
      "Invalid payload format"
    );
    
    consoleSpy.mockRestore();
  });
});
