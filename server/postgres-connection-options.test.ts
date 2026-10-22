import { describe, expect, it } from "vitest";
import { getPostgresConnectionOptions } from "./postgres-connection-options";

describe("getPostgresConnectionOptions", () => {
  it("keeps certificate verification enabled for production PostgreSQL", () => {
    const options = getPostgresConnectionOptions(
      "postgres://user:pass@db.example.com:5432/app?sslmode=require&application_name=basegrid",
      true,
    );

    expect(options.ssl).toEqual({ rejectUnauthorized: true });
    expect(options.connectionString).toContain("application_name=basegrid");
    expect(options.connectionString).not.toMatch(/sslmode=/i);
  });

  it("supports an explicit provider CA without disabling certificate verification", () => {
    const ca = "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----";
    const options = getPostgresConnectionOptions(
      "postgres://user:pass@db.example.com:5432/app?sslmode=verify-full",
      true,
      ca,
    );

    expect(options.ssl).toEqual({ rejectUnauthorized: true, ca });
    expect(options.connectionString).not.toMatch(/sslmode=/i);
  });

  it.each(["disable", "allow", "prefer", "no-verify", "unknown"])(
    "rejects production sslmode=%s",
    (sslmode) => {
      expect(() =>
        getPostgresConnectionOptions(
          `postgres://user:pass@db.example.com:5432/app?sslmode=${sslmode}`,
          true,
        ),
      ).toThrow(/cannot use a PostgreSQL sslmode/i);
    },
  );

  it("rejects local database hosts in production even when sslmode is set", () => {
    expect(() =>
      getPostgresConnectionOptions("postgres://user:pass@localhost:5432/app?sslmode=disable", true),
    ).toThrow(/remote PostgreSQL host/i);
  });

  it.each(["sslrootcert", "sslcert", "sslkey"])(
    "rejects production URL parameter %s so TLS settings cannot be overridden",
    (parameter) => {
      expect(() =>
        getPostgresConnectionOptions(
          `postgres://user:pass@db.example.com:5432/app?${parameter}=custom.pem`,
          true,
        ),
      ).toThrow(/must not override TLS certificate settings/i);
    },
  );

  it("preserves non-production local development without requiring TLS", () => {
    expect(
      getPostgresConnectionOptions("postgres://localhost:5432/app?sslmode=disable", false),
    ).toEqual({
      connectionString: "postgres://localhost:5432/app?sslmode=disable",
      ssl: false,
    });
  });

  it("rejects a missing production database URL", () => {
    expect(() => getPostgresConnectionOptions(undefined, true)).toThrow(/DATABASE_URL is missing/i);
  });
});
