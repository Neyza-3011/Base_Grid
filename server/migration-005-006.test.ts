import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  calculateChecksum,
  loadMigrationsFromDir,
  getDefaultMigrationsDir,
  runMigrations,
  MigrationFile,
} from "./migrator";

/**
 * Tests verifying migration 005 immutability and migration 006 correctness.
 *
 * These tests use the real migration files on disk (for checksum/content tests)
 * and mock DB clients (for migrator behavior tests).
 * No live PostgreSQL connection is required.
 */
describe("Migration 005 Immutability & Migration 006 Correctness", () => {
  const migrationsDir = getDefaultMigrationsDir();

  // =========================================================================
  // 1. Migration 005 checksum must match the production-recorded value
  // =========================================================================
  describe("Migration 005 — Checksum Immutability", () => {
    const PRODUCTION_CHECKSUM_005 =
      "6994d3905cc6d3f4c0ebc6736adef9e89dddc1f7ac00ca3adf939519ca67393b";

    it("has a checksum matching the production-recorded value (LF-normalized)", () => {
      const filePath = path.join(migrationsDir, "005_interventions.sql");
      const raw = fs.readFileSync(filePath, "utf-8");
      // Normalize to LF — on Render (Linux) the file will have LF endings,
      // which is what production checksum was computed against.
      const normalized = raw.replace(/\r\n/g, "\n");
      const checksum = calculateChecksum(normalized);

      expect(checksum).toBe(PRODUCTION_CHECKSUM_005);
    });

    it("uses simple inline FKs (not composite) in the table definition", () => {
      const filePath = path.join(migrationsDir, "005_interventions.sql");
      const sql = fs.readFileSync(filePath, "utf-8");

      // The original 005 uses inline REFERENCES (single-column FK)
      expect(sql).toContain('REFERENCES customers(id)');
      expect(sql).toContain('REFERENCES assets(id)');
      expect(sql).toContain('REFERENCES users(id)');

      // It must NOT contain composite FK blocks or column-specific SET NULL
      expect(sql).not.toContain('fk_interventions_customer_tenant_consistency');
      expect(sql).not.toContain('fk_interventions_asset_hierarchy_consistency');
      expect(sql).not.toContain('fk_interventions_technician_tenant_consistency');
      expect(sql).not.toContain('ON DELETE SET NULL ("assetId")');
      expect(sql).not.toContain('ON DELETE SET NULL ("technicianId")');
    });
  });

  // =========================================================================
  // 2. Migrator still rejects checksum mismatches for all versions
  // =========================================================================
  describe("Migrator — Checksum enforcement is not bypassed", () => {
    let mockClient: any;
    let mockPool: any;
    let executedQueries: { sql: string; params?: any[] }[];

    beforeEach(() => {
      executedQueries = [];
      mockClient = {
        query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
          executedQueries.push({ sql, params });
          if (sql.includes("FROM schema_migrations") && sql.includes("SELECT")) {
            return {
              rows: [
                {
                  version: "005",
                  name: "005_interventions.sql",
                  applied_at: "2026-01-01",
                  checksum: "production_checksum_005",
                },
              ],
            };
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

    it("rejects a tampered migration 005 with mismatched checksum", async () => {
      const fakeMigrations: MigrationFile[] = [
        {
          version: "005",
          name: "005_interventions.sql",
          sql: "TAMPERED CONTENT;",
          checksum: "tampered_checksum_different_from_production",
        },
      ];

      await expect(
        runMigrations(mockPool, { migrations: fakeMigrations })
      ).rejects.toThrow(/checksum mismatch.*005/i);

      // No transaction started
      expect(executedQueries.find((q) => q.sql === "BEGIN")).toBeUndefined();
    });

    it("accepts migration 005 when its checksum matches the recorded value", async () => {
      const fakeMigrations: MigrationFile[] = [
        {
          version: "005",
          name: "005_interventions.sql",
          sql: "ORIGINAL CONTENT;",
          checksum: "production_checksum_005", // matches the mocked DB record
        },
      ];

      const result = await runMigrations(mockPool, { migrations: fakeMigrations });
      expect(result.alreadyApplied).toContain("005_interventions.sql");
      expect(result.applied).toEqual([]);
    });
  });

  // =========================================================================
  // 3. Migration 006 exists and contains the correct constraint operations
  // =========================================================================
  describe("Migration 006 — Content correctness", () => {
    let sql006: string;

    beforeEach(() => {
      const filePath = path.join(
        migrationsDir,
        "006_interventions_composite_fk_and_set_null_targets.sql"
      );
      sql006 = fs.readFileSync(filePath, "utf-8");
    });

    it("is loaded as version 006 by the migrator", () => {
      const migrations = loadMigrationsFromDir(migrationsDir);
      const m006 = migrations.find((m) => m.version === "006");
      expect(m006).toBeDefined();
      expect(m006!.name).toContain("006_interventions");
    });

    // --- Composite unique constraints (prerequisites) ---
    it("creates uq_assets_id_customer_location_company", () => {
      expect(sql006).toContain("uq_assets_id_customer_location_company");
    });

    it("creates uq_users_id_company", () => {
      expect(sql006).toContain("uq_users_id_company");
    });

    // --- Drop old simple inline FKs ---
    it("drops old simple FK interventions_customerId_fkey", () => {
      expect(sql006).toContain('interventions_customerId_fkey');
    });

    it("drops old simple FK interventions_locationId_fkey", () => {
      expect(sql006).toContain('interventions_locationId_fkey');
    });

    it("drops old simple FK interventions_assetId_fkey", () => {
      expect(sql006).toContain('interventions_assetId_fkey');
    });

    it("drops old simple FK interventions_technicianId_fkey", () => {
      expect(sql006).toContain('interventions_technicianId_fkey');
    });

    it("drops old simple FK interventions_createdBy_fkey", () => {
      expect(sql006).toContain('interventions_createdBy_fkey');
    });

    it("drops old simple FK interventions_updatedBy_fkey", () => {
      expect(sql006).toContain('interventions_updatedBy_fkey');
    });

    // --- New composite FK: asset hierarchy with column-specific SET NULL ---
    it("creates fk_interventions_asset_hierarchy_consistency with ON DELETE SET NULL (assetId only)", () => {
      expect(sql006).toContain("fk_interventions_asset_hierarchy_consistency");
      expect(sql006).toContain(
        'FOREIGN KEY ("assetId", "customerId", "locationId", "companyId")'
      );
      expect(sql006).toContain(
        'REFERENCES assets (id, "customerId", "locationId", "companyId") ON DELETE SET NULL ("assetId")'
      );
    });

    it("does NOT set customerId, locationId, or companyId to NULL when an asset is deleted", () => {
      // The SET NULL targets only "assetId", not the mandatory tenant identifiers
      const setNullAssetMatch = sql006.match(
        /ON DELETE SET NULL\s*\("assetId"\)/
      );
      expect(setNullAssetMatch).not.toBeNull();

      // Ensure no generic ON DELETE SET NULL without column restriction for the asset FK
      const assetFkSection = sql006.substring(
        sql006.indexOf("fk_interventions_asset_hierarchy_consistency"),
        sql006.indexOf("fk_interventions_technician_tenant_consistency")
      );
      // Should not contain a bare "ON DELETE SET NULL" (without parenthesized column)
      const bareSetNull = assetFkSection.match(/ON DELETE SET NULL(?!\s*\()/);
      expect(bareSetNull).toBeNull();
    });

    // --- New composite FK: technician with column-specific SET NULL ---
    it("creates fk_interventions_technician_tenant_consistency with ON DELETE SET NULL (technicianId only)", () => {
      expect(sql006).toContain("fk_interventions_technician_tenant_consistency");
      expect(sql006).toContain(
        'FOREIGN KEY ("technicianId", "companyId")'
      );
      expect(sql006).toContain(
        'REFERENCES users (id, "companyId") ON DELETE SET NULL ("technicianId")'
      );
    });

    it("does NOT set companyId to NULL when a technician is deleted", () => {
      const setNullTechMatch = sql006.match(
        /ON DELETE SET NULL\s*\("technicianId"\)/
      );
      expect(setNullTechMatch).not.toBeNull();

      // Ensure no generic ON DELETE SET NULL without column restriction for the technician FK
      const techFkSection = sql006.substring(
        sql006.indexOf("fk_interventions_technician_tenant_consistency"),
        sql006.indexOf("fk_interventions_createdby_tenant_consistency")
      );
      const bareSetNull = techFkSection.match(/ON DELETE SET NULL(?!\s*\()/);
      expect(bareSetNull).toBeNull();
    });

    // --- Other composite FKs ---
    it("creates customer tenant consistency FK", () => {
      expect(sql006).toContain("fk_interventions_customer_tenant_consistency");
      expect(sql006).toContain(
        'FOREIGN KEY ("customerId", "companyId")'
      );
    });

    it("creates location-customer-tenant consistency FK", () => {
      expect(sql006).toContain("fk_interventions_location_customer_tenant_consistency");
      expect(sql006).toContain(
        'FOREIGN KEY ("locationId", "customerId", "companyId")'
      );
    });

    it("creates createdBy tenant consistency FK", () => {
      expect(sql006).toContain("fk_interventions_createdby_tenant_consistency");
    });

    it("creates updatedBy tenant consistency FK", () => {
      expect(sql006).toContain("fk_interventions_updatedby_tenant_consistency");
    });

    // --- Additional indexes ---
    it("adds idx_interventions_asset_id index", () => {
      expect(sql006).toContain("idx_interventions_asset_id");
    });

    it("adds idx_interventions_pagination index", () => {
      expect(sql006).toContain("idx_interventions_pagination");
    });

    // --- No table recreation ---
    it("does NOT drop or recreate the interventions table", () => {
      // Strip comment lines before checking for DDL keywords
      const sqlStatements = sql006
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n");
      expect(sqlStatements).not.toContain("DROP TABLE");
      expect(sqlStatements).not.toContain("CREATE TABLE");
    });

    // --- No standalone BEGIN/COMMIT (migrator handles transactions) ---
    it("does not contain standalone BEGIN/COMMIT (migrator wraps in transaction)", () => {
      // Remove all DO $$ ... $$ blocks to check for standalone BEGIN/COMMIT
      const withoutDoBlocks = sql006.replace(/DO \$\$[\s\S]*?\$\$;/g, "");
      expect(withoutDoBlocks).not.toContain("BEGIN");
      expect(withoutDoBlocks).not.toContain("COMMIT");
      expect(withoutDoBlocks).not.toContain("ROLLBACK");
    });
  });

  // =========================================================================
  // 4. Migration 006 can be applied after 005 is already recorded
  // =========================================================================
  describe("Migration 006 — Sequential application after 005", () => {
    let mockClient: any;
    let mockPool: any;
    let executedQueries: { sql: string; params?: any[] }[];

    beforeEach(() => {
      executedQueries = [];
      mockClient = {
        query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
          executedQueries.push({ sql, params });
          if (sql.includes("FROM schema_migrations") && sql.includes("SELECT")) {
            // Simulate: migrations 001-005 already applied in production
            return {
              rows: [
                { version: "001", name: "001_initial_schema.sql", applied_at: "2026-01-01", checksum: "chk1" },
                { version: "002", name: "002_team_and_onboarding.sql", applied_at: "2026-01-02", checksum: "chk2" },
                { version: "003", name: "003_customers_and_locations.sql", applied_at: "2026-01-03", checksum: "chk3" },
                { version: "004", name: "004_assets.sql", applied_at: "2026-01-04", checksum: "chk4" },
                { version: "005", name: "005_interventions.sql", applied_at: "2026-01-05", checksum: "chk5" },
              ],
            };
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

    it("applies migration 006 as the only pending migration when 001-005 are already applied", async () => {
      const mockMigrations: MigrationFile[] = [
        { version: "001", name: "001_initial_schema.sql", sql: "...", checksum: "chk1" },
        { version: "002", name: "002_team_and_onboarding.sql", sql: "...", checksum: "chk2" },
        { version: "003", name: "003_customers_and_locations.sql", sql: "...", checksum: "chk3" },
        { version: "004", name: "004_assets.sql", sql: "...", checksum: "chk4" },
        { version: "005", name: "005_interventions.sql", sql: "...", checksum: "chk5" },
        {
          version: "006",
          name: "006_interventions_composite_fk_and_set_null_targets.sql",
          sql: "ALTER TABLE interventions ...;",
          checksum: "chk6",
        },
      ];

      const result = await runMigrations(mockPool, { migrations: mockMigrations });

      expect(result.alreadyApplied).toHaveLength(5);
      expect(result.applied).toEqual(["006_interventions_composite_fk_and_set_null_targets.sql"]);
      expect(result.total).toBe(6);

      // Verify transaction was used for 006
      const beginCalls = executedQueries.filter((q) => q.sql === "BEGIN");
      expect(beginCalls).toHaveLength(1);

      const commitCalls = executedQueries.filter((q) => q.sql === "COMMIT");
      expect(commitCalls).toHaveLength(1);

      // Verify the insert recorded version 006
      const insertCall = executedQueries.find(
        (q) => q.sql.includes("INSERT INTO schema_migrations") && q.params?.[0] === "006"
      );
      expect(insertCall).toBeDefined();
    });
  });

  // =========================================================================
  // 5. Full migration set loads in correct order
  // =========================================================================
  describe("Migration ordering — full set", () => {
    it("loads all migrations (001-007) in deterministic numerical order", () => {
      const migrations = loadMigrationsFromDir(migrationsDir);
      const versions = migrations.map((m) => m.version);

      expect(versions).toEqual(["001", "002", "003", "004", "005", "006", "007"]);
    });
  });
});
