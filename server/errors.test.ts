import { describe, it, expect } from "vitest";
import {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "./errors";

describe("Application Error Model (server/errors.ts)", () => {
  it("creates AppError with custom message and status code", () => {
    const err = new AppError("Something went wrong", 500);
    expect(err.message).toBe("Something went wrong");
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe("AppError");
  });

  it("creates BadRequestError with 400 status code", () => {
    const err = new BadRequestError("Invalid payload");
    expect(err.message).toBe("Invalid payload");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("BadRequestError");
  });

  it("creates ValidationError with 400 status code", () => {
    const err = new ValidationError("Email format is invalid");
    expect(err.message).toBe("Email format is invalid");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("ValidationError");
  });

  it("creates UnauthorizedError with 401 status code", () => {
    const err = new UnauthorizedError();
    expect(err.message).toBe("Authentication required");
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe("UnauthorizedError");
  });

  it("creates ForbiddenError with 403 status code", () => {
    const err = new ForbiddenError("Insufficient permissions");
    expect(err.message).toBe("Insufficient permissions");
    expect(err.statusCode).toBe(403);
    expect(err.name).toBe("ForbiddenError");
  });

  it("creates NotFoundError with 404 status code", () => {
    const err = new NotFoundError("Report not found");
    expect(err.message).toBe("Report not found");
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe("NotFoundError");
  });

  it("creates ConflictError with 409 status code", () => {
    const err = new ConflictError("Email already registered");
    expect(err.message).toBe("Email already registered");
    expect(err.statusCode).toBe(409);
    expect(err.name).toBe("ConflictError");
  });

  it("handles AppError properly in Express app for unauthenticated route", async () => {
    const request = (await import("supertest")).default;
    const { createApp } = await import("./app");
    const app = createApp();

    const res = await request(app).get("/api/v1/reports");
    expect(res.status).toBe(401);
    expect(res.body.detail).toBe("Non autenticato o sessione scaduta.");
  });

  it("masks 5xx internal error details from client and prevents sensitive log leakage", async () => {
    const request = (await import("supertest")).default;
    const { vi } = await import("vitest");
    const { createApp } = await import("./app");
    const { reportsService } = await import("./services");
    const { generateTokens } = await import("./security");

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock reportsService.listReports to throw sensitive 500 error
    const listSpy = vi.spyOn(reportsService, "listReports").mockImplementationOnce(() => {
      throw new Error("FATAL: password authentication failed for postgres://admin:SuperSecret123@db.internal:5432/prod_db");
    });

    const testUser = {
      id: "test-user-500",
      email: "user@test.com",
      fullName: "Test User",
      role: "technician" as const,
      companyId: "comp-500",
      companyName: "Test Co",
      passwordHash: "hash",
      salt: "salt",
      isActive: true,
      provider: "local" as const,
      emailConfirmed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      authVersion: 1,
    };

    const { db } = await import("./db");
    const findUserSpy = vi.spyOn(db, "findUserById").mockResolvedValue(testUser);
    const findCompSpy = vi.spyOn(db, "findCompanyById").mockResolvedValue({
      id: "comp-500",
      name: "Test Co",
      vatNumber: "12345678901",
      address: "Via Roma 1",
      defaultHourlyRate: 50,
      reportFooterNotes: "",
      stripeSubscriptionStatus: "active",
      maxUsers: 5,
      featurePdfExport: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { accessToken } = generateTokens(testUser);

    const app = createApp();
    const res = await request(app)
      .get("/api/v1/reports")
      .set("Cookie", [`access_token=${accessToken}`]);
    
    // Client must receive safe masked message
    expect(res.status).toBe(500);
    expect(res.body.detail).toBe("Errore interno del server.");
    expect(res.body.detail).not.toContain("SuperSecret123");
    expect(res.body.detail).not.toContain("postgres://");

    // Server log must NOT contain the sensitive message or credentials
    const loggedCalls = consoleErrorSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(loggedCalls).not.toContain("SuperSecret123");
    expect(loggedCalls).not.toContain("postgres://");
    expect(loggedCalls).not.toContain("FATAL: password");
    expect(loggedCalls).toContain("[ServerError]");

    listSpy.mockRestore();
    findUserSpy.mockRestore();
    findCompSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
