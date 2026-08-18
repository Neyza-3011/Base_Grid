import { describe, it, expect } from "vitest";
import { createDatabaseAdapter, DatabaseStore, PostgresAdapter } from "./db";

describe("Database Provider Factory (server/db.ts)", () => {
  it("selects DatabaseStore in development and test environments", () => {
    const devConfig: any = { NODE_ENV: "development" };
    const testConfig: any = { NODE_ENV: "test" };

    const devAdapter = createDatabaseAdapter(devConfig);
    const testAdapter = createDatabaseAdapter(testConfig);

    expect(devAdapter).toBeInstanceOf(DatabaseStore);
    expect(testAdapter).toBeInstanceOf(DatabaseStore);
  });

  it("selects PostgresAdapter in production environment", () => {
    const prodConfig: any = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb",
    };

    const prodAdapter = createDatabaseAdapter(prodConfig);
    expect(prodAdapter).toBeInstanceOf(PostgresAdapter);
  });

  it("fails closed in production if DatabaseStore is instantiated", () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(() => new DatabaseStore()).toThrow(
        /DatabaseStore \(in-memory\) cannot be used in production/i,
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("fails closed in production if PostgresAdapter is instantiated without DATABASE_URL", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalUrl = process.env.DATABASE_URL;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.DATABASE_URL;

      expect(() => new PostgresAdapter()).toThrow(
        /DATABASE_URL is missing in production/i,
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalUrl) process.env.DATABASE_URL = originalUrl;
    }
  });
});
