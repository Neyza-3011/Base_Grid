import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { verifyCsrf } from "./auth";

function createCsrfTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use(verifyCsrf);
  app.all("/api/v1/reports", (_req, res) => res.status(200).json({ ok: true }));
  app.all("/api/v1/auth/login", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

const mutatingRequest = (
  app: express.Express,
  method: "post" | "put" | "patch" | "delete",
  path: string,
) => {
  switch (method) {
    case "post": return request(app).post(path);
    case "put": return request(app).put(path);
    case "patch": return request(app).patch(path);
    case "delete": return request(app).delete(path);
  }
};

describe("CSRF middleware method coverage", () => {
  const app = createCsrfTestApp();

  it.each(["post", "put", "patch", "delete"] as const)(
    "rejects %s requests when the CSRF cookie/header pair is missing",
    async (method) => {
      const response = await mutatingRequest(app, method, "/api/v1/reports");
      expect(response.status).toBe(403);
      expect(response.body.detail).toMatch(/CSRF/i);
    },
  );

  it.each(["post", "put", "patch", "delete"] as const)(
    "accepts %s requests only when the CSRF header matches the cookie",
    async (method) => {
      const response = await mutatingRequest(app, method, "/api/v1/reports")
        .set("Cookie", "csrf_token=csrf-test-value")
        .set("x-csrf-token", "csrf-test-value");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    },
  );

  it("rejects a mismatched CSRF header and cookie", async () => {
    const response = await request(app)
      .post("/api/v1/reports")
      .set("Cookie", "csrf_token=cookie-value")
      .set("x-csrf-token", "different-header-value");

    expect(response.status).toBe(403);
  });

  it.each(["get", "head", "options"] as const)(
    "does not require CSRF for the safe %s method",
    async (method) => {
      const response = await request(app)[method]("/api/v1/reports");
      expect(response.status).toBe(200);
    },
  );

  it("keeps the explicitly exempt login lifecycle endpoint accessible without a CSRF token", async () => {
    const response = await request(app).post("/api/v1/auth/login");
    expect(response.status).toBe(200);
  });
});
