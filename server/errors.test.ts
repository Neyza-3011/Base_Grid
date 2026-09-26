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
});
