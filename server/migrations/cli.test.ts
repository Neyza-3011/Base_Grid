import { describe, expect, it } from "vitest";
import { getMigrationCliPoolOptions } from "./cli";

describe("migration CLI PostgreSQL connection security", () => {
  it("keeps TLS certificate verification enabled in production", () => {
    const options = getMigrationCliPoolOptions(
      "postgres://user:pass@db.example.com:5432/app?sslmode=require&application_name=basegrid-migrator",
      true,
    );

    expect(options.ssl).toEqual({ rejectUnauthorized: true });
    expect(options.connectionString).not.toMatch(/sslmode=/i);
    expect(options.connectionString).toContain("application_name=basegrid-migrator");
    expect(options.max).toBe(2);
    expect(options.connectionTimeoutMillis).toBe(5000);
  });

  it("passes a provider CA without disabling certificate verification", () => {
    const ca = "-----BEGIN CERTIFICATE-----\\nexample\\n-----END CERTIFICATE-----";
    const options = getMigrationCliPoolOptions(
      "postgres://user:pass@db.example.com:5432/app?sslmode=verify-full",
      true,
      ca,
    );

    expect(options.ssl).toEqual({ rejectUnauthorized: true, ca });
  });

  it("keeps local development TLS behavior unchanged", () => {
    expect(getMigrationCliPoolOptions("postgres://localhost:5432/app", false).ssl).toBe(false);
  });
});
