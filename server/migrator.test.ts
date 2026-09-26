import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  runMigrations,
  loadMigrationsFromDir,
  calculateChecksum,
  MigrationFile,
  getDefaultMigrationsDir,
} from "./migrator";

describe("PostgreSQL Versioned Migration Runner (server/migrator.ts)", () => {
  let mockClient: any;
  let mockPool: any;
  let executedQueries: { sql: string; params?: any[] }[];
  let appliedRowsInDb: any[];
  let queryErrorTrigger: ((sql: string) => Error | null) | null = null;

  beforeEach(() => {
    executedQueries = [];
    appliedRowsInDb = [];
    queryErrorTrigger = null;

    mockClient = {
      query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
        executedQueries.push({ sql, params });

        if (queryErrorTrigger) {
          const err = queryErrorTrigger(sql);
          if (err) throw err;
        }

        if (sql.includes("FROM schema_migrations") && sql.includes("SELECT")) {
          return { rows: [...appliedRowsInDb] };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };

    mockPool = {
      query: (...args: any[]) => mockClient.query(...args),
      connect: vi.fn().mockResolvedValue(mockClient),
    };
  });

  describe("Directory & Migration File Loader", () => {
    it("loads and deterministically orders migrations from disk", () => {
      const dir = getDefaultMigrationsDir();
      expect(fs.existsSync(dir)).toBe(true);

      const migrations = loadMigrationsFromDir(dir);
      expect(migrations.length).toBeGreaterThan(0);
      expect(migrations[0].version).toBe("001");
      expect(migrations[0].name).toBe("001_initial_schema.sql");
      expect(migrations[0].checksum).toBe(calculateChecksum(migrations[0].sql));
    });

    it("verifies 001_initial_schema.sql matches canonical production schema", () => {
      const dir = getDefaultMigrationsDir();
      const filePath = path.join(dir, "001_initial_schema.sql");
      const sql = fs.readFileSync(filePath, "utf-8");

      // Verify core domain tables exist
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS companies");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS users");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS reports");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS auth_tokens");

      // Verify foreign keys & constraints
      expect(sql).toContain("fk_users_company");
      expect(sql).toContain("fk_reports_company");
      expect(sql).toContain("fk_auth_tokens_user");
      expect(sql).toContain("uq_users_email");
      expect(sql).toContain("uq_auth_tokens_token_hash");

      // Verify indexes
      expect(sql).toContain("idx_users_company_id");
      expect(sql).toContain("idx_reports_company_id");
      expect(sql).toContain("idx_auth_tokens_user_type");
    });
  });

  describe("Migration Execution & Ordering", () => {
    it("creates schema_migrations tracking table and applies migrations in numerical order", async () => {
      const mockMigrations: MigrationFile[] = [
        { version: "001", name: "001_first.sql", sql: "CREATE TABLE t1 (id int);", checksum: "hash1" },
        { version: "002", name: "002_second.sql", sql: "CREATE TABLE t2 (id int);", checksum: "hash2" },
      ];

      const result = await runMigrations(mockPool, { migrations: mockMigrations });

      expect(result.applied).toEqual(["001_first.sql", "002_second.sql"]);
      expect(result.alreadyApplied).toEqual([]);
      expect(result.total).toBe(2);

      // Verify tracking table creation
      const ddlQuery = executedQueries.find((q) => q.sql.includes("CREATE TABLE IF NOT EXISTS schema_migrations"));
      expect(ddlQuery).toBeDefined();

      // Verify transaction sequence for 001
      const q1Index = executedQueries.findIndex((q) => q.sql === "CREATE TABLE t1 (id int);");
      expect(q1Index).toBeGreaterThan(0);
      expect(executedQueries[q1Index - 1].sql).toBe("BEGIN");
      expect(executedQueries[q1Index + 1].sql).toContain("INSERT INTO schema_migrations");
      expect(executedQueries[q1Index + 1].params).toEqual(["001", "001_first.sql", "hash1"]);
      expect(executedQueries[q1Index + 2].sql).toBe("COMMIT");

      // Verify transaction sequence for 002 follows 001
      const q2Index = executedQueries.findIndex((q) => q.sql === "CREATE TABLE t2 (id int);");
      expect(q2Index).toBeGreaterThan(q1Index);
      expect(executedQueries[q2Index - 1].sql).toBe("BEGIN");
      expect(executedQueries[q2Index + 1].sql).toContain("INSERT INTO schema_migrations");
      expect(executedQueries[q2Index + 1].params).toEqual(["002", "002_second.sql", "hash2"]);
      expect(executedQueries[q2Index + 2].sql).toBe("COMMIT");
    });

    it("is strictly idempotent: does not re-apply previously applied migrations", async () => {
      // Pre-seed applied migration in schema_migrations
      appliedRowsInDb = [
        { version: "001", name: "001_first.sql", applied_at: "2026-01-01", checksum: "hash1" },
      ];

      const mockMigrations: MigrationFile[] = [
        { version: "001", name: "001_first.sql", sql: "CREATE TABLE t1 (id int);", checksum: "hash1" },
      ];

      const result = await runMigrations(mockPool, { migrations: mockMigrations });

      expect(result.applied).toEqual([]);
      expect(result.alreadyApplied).toEqual(["001_first.sql"]);
      expect(result.total).toBe(1);

      // Verify no BEGIN or COMMIT or migration SQL was executed
      const beginCall = executedQueries.find((q) => q.sql === "BEGIN");
      expect(beginCall).toBeUndefined();
    });

    it("applies only new pending migrations when earlier migrations exist", async () => {
      appliedRowsInDb = [
        { version: "001", name: "001_first.sql", applied_at: "2026-01-01", checksum: "hash1" },
      ];

      const mockMigrations: MigrationFile[] = [
        { version: "001", name: "001_first.sql", sql: "CREATE TABLE t1 (id int);", checksum: "hash1" },
        { version: "002", name: "002_second.sql", sql: "CREATE TABLE t2 (id int);", checksum: "hash2" },
      ];

      const result = await runMigrations(mockPool, { migrations: mockMigrations });

      expect(result.applied).toEqual(["002_second.sql"]);
      expect(result.alreadyApplied).toEqual(["001_first.sql"]);
      expect(result.total).toBe(2);

      // Verify only t2 was executed
      const t1Query = executedQueries.find((q) => q.sql.includes("CREATE TABLE t1"));
      const t2Query = executedQueries.find((q) => q.sql.includes("CREATE TABLE t2"));
      expect(t1Query).toBeUndefined();
      expect(t2Query).toBeDefined();
    });
  });

  describe("Failure Handling & Rollback Safety", () => {
    it("rolls back transaction and does NOT record migration on failure", async () => {
      queryErrorTrigger = (sql: string) => {
        if (sql.includes("SYNTAX ERROR")) {
          return new Error("syntax error at or near 'SYNTAX'");
        }
        return null;
      };

      const mockMigrations: MigrationFile[] = [
        { version: "001", name: "001_fail.sql", sql: "SYNTAX ERROR IN SQL;", checksum: "badhash" },
        { version: "002", name: "002_never_reached.sql", sql: "CREATE TABLE t2 (id int);", checksum: "hash2" },
      ];

      await expect(
        runMigrations(mockPool, { migrations: mockMigrations })
      ).rejects.toThrow(/Migration 001_fail.sql \(version 001\) failed: syntax error/i);

      // Verify ROLLBACK was executed
      const rollbackCall = executedQueries.find((q) => q.sql === "ROLLBACK");
      expect(rollbackCall).toBeDefined();

      // Verify INSERT into schema_migrations was NOT called for failed migration
      const insertCall = executedQueries.find((q) => q.sql.includes("INSERT INTO schema_migrations"));
      expect(insertCall).toBeUndefined();

      // Verify migration 002 was never started
      const t2Query = executedQueries.find((q) => q.sql.includes("CREATE TABLE t2"));
      expect(t2Query).toBeUndefined();
    });

    it("releases client on pool connection even when migration throws", async () => {
      queryErrorTrigger = (sql: string) => {
        if (sql.includes("FAILING SQL")) {
          return new Error("Table constraint violation");
        }
        return null;
      };

      const mockMigrations: MigrationFile[] = [
        { version: "001", name: "001_fail.sql", sql: "FAILING SQL;", checksum: "hash" },
      ];

      await expect(
        runMigrations(mockPool, { migrations: mockMigrations })
      ).rejects.toThrow(/Table constraint violation/);

      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
