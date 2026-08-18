import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";

describe("App Express Error Handler & Health Check", () => {
  it("Error handler does not expose err.message for 500 internal errors and logs safely", async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = express();
    
    // Route that throws a 500 error
    app.get("/trigger-error", (req, res, next) => {
      const err = new Error("SUPER_SECRET_DATABASE_PASSWORD_LEAK");
      (err as any).status = 500;
      next(err);
    });

    // The handler under test
    app.use((err: any, _req: any, res: any, _next: any) => {
      const status = err.status || 500;
      const safeMessage = status < 500 ? (err.message || "Richiesta non valida.") : "Errore interno del server.";
      
      if (status >= 500) {
        console.error(`[ServerError] ${err.name || "Error"}: Internal Server Error`);
      } else {
        console.error(`[ServerError] ${err.name || "Error"}:`, err.message);
      }
      
      res.status(status).json({ detail: safeMessage });
    });

    const response = await request(app).get("/trigger-error");
    expect(response.status).toBe(500);
    expect(response.body.detail).toBe("Errore interno del server.");
    expect(response.body.detail).not.toContain("SUPER_SECRET_DATABASE_PASSWORD_LEAK");
    
    // Verify console log doesn't contain the secret
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[ServerError]"));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining("SUPER_SECRET_DATABASE_PASSWORD_LEAK"));
    
    consoleSpy.mockRestore();
  });

  it("Error handler exposes err.message for expected client errors (400) and logs the message", async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = express();
    
    // Route that throws a 400 error
    app.get("/trigger-400", (req, res, next) => {
      const err: any = new Error("Invalid payload format");
      err.status = 400;
      next(err);
    });

    // The handler under test
    app.use((err: any, _req: any, res: any, _next: any) => {
      const status = err.status || 500;
      const safeMessage = status < 500 ? (err.message || "Richiesta non valida.") : "Errore interno del server.";
      
      if (status >= 500) {
        console.error(`[ServerError] ${err.name || "Error"}: Internal Server Error`);
      } else {
        console.error(`[ServerError] ${err.name || "Error"}:`, err.message);
      }
      
      res.status(status).json({ detail: safeMessage });
    });

    const response = await request(app).get("/trigger-400");
    expect(response.status).toBe(400);
    expect(response.body.detail).toBe("Invalid payload format");
    
    // Verify console log DOES contain the error details for 400
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[ServerError]"), "Invalid payload format");
    
    consoleSpy.mockRestore();
  });
});
