import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { config } from "./config";

// Exercise production CORS policy without requiring production secrets or Redis.
vi.mock("./security", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    assertValidJwtSecret: vi.fn(),
    getJwtSecret: vi.fn(() => "test-jwt-secret-at-least-32-chars-long"),
  };
});

describe("Production CORS allow-list integration", () => {
  const originalRuntimeMode = process.env.BASEGRID_RUNTIME_MODE;
  const originalCorsOrigins = [...config.CORS_ORIGINS];

  afterEach(() => {
    if (originalRuntimeMode === undefined) delete process.env.BASEGRID_RUNTIME_MODE;
    else process.env.BASEGRID_RUNTIME_MODE = originalRuntimeMode;
    config.CORS_ORIGINS = [...originalCorsOrigins];
  });

  function createProductionCorsApp() {
    process.env.BASEGRID_RUNTIME_MODE = "production";
    config.CORS_ORIGINS = ["https://allowed.example"];
    return createApp();
  }

  it("reflects an explicitly allowed production origin and enables credentials", async () => {
    const response = await request(createProductionCorsApp())
      .get("/health")
      .set("Origin", "https://allowed.example");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://allowed.example");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not grant browser access to an unlisted production origin", async () => {
    const response = await request(createProductionCorsApp())
      .get("/health")
      .set("Origin", "https://attacker.example");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("accepts preflight only for an explicitly allowed production origin", async () => {
    const response = await request(createProductionCorsApp())
      .options("/health")
      .set("Origin", "https://allowed.example")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,x-csrf-token");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://allowed.example");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-headers"]).toContain("x-csrf-token");
  });
});
