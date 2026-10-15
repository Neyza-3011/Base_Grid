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
 * P1.6 Referential Integrity Tests:
 * - Migration 007 composite FK preservation
 * - Migration 008 CHECK constraint ("interventionId" IS NULL OR "companyId" IS NOT NULL)
 * - Immutability of migrations 001-007
 * - Backward compatibility for reports without interventions
 */
describe("P1.6 Migration 007 & 008 Referential Integrity & Immutability", () => {
  const migrationsDir = getDefaultMigrationsDir();

  // Recorded checksums of migrations 001 to 007
  const RECORDED_CHECKSUMS: Record<string, string> = {
    "001": "dfae062272c3fe6daf76dcca7edcbf26cd91bca0ffefcd2fb3ba636b4bc4f080",
    "002": "312019dc6a599a7fac74f1e1d76c5a2a8ba9750d31bdd6ff01eed077fbb64d0c",
    "003": "61a68567f12ad8b130889ba496840108cd7cf7ecdac0fcb6837c409a64ce8e4f",
    "004": "6af85b033882d02f000a313e9c3c904b0938849dc372d442ef9042a0b19ad9db",
    "005": "6994d3905cc6d3f4c0ebc6736adef9e89dddc1f7ac00ca3adf939519ca67393b",
    "006": "64ea0f8105771240d4a9a8ca50b5a07b06e83f0dc7d4d7258bb9284137ba9a30",
    "007": "eb8d6d695f812c5b9c43ee00365c24b7ca2703aee128e60d4eaed95149061fc3",
  };

  // Helper evaluating the boolean logic of the SQL CHECK constraint
  function evaluateCheckConstraint(
    interventionId: string | null | undefined,
    companyId: string | null | undefined
  ): boolean {
    const isInterventionNull = interventionId === null || interventionId === undefined;
    const isCompanyNotNull = companyId !== null && companyId !== undefined;
    return isInterventionNull || isCompanyNotNull;
  }

  // =========================================================================
  // 1. Il vincolo sia presente nella migration che lo introduce
  // =========================================================================
  describe("1. CHECK constraint definition in Migration 008", () => {
    let sql008: string;

    beforeEach(() => {
      const filePath = path.join(
        migrationsDir,
        "008_reports_intervention_company_check.sql"
      );
      sql008 = fs.readFileSync(filePath, "utf-8");
    });

    it("is loaded as version 008 by the migrator", () => {
      const migrations = loadMigrationsFromDir(migrationsDir);
      const m008 = migrations.find((m) => m.version === "008");
      expect(m008).toBeDefined();
      expect(m008!.name).toBe("008_reports_intervention_company_check.sql");
    });

    it("defines the CHECK constraint with explicit name chk_reports_intervention_company_not_null", () => {
      expect(sql008).toContain("chk_reports_intervention_company_not_null");
      expect(sql008).toContain(
        'CHECK ("interventionId" IS NULL OR "companyId" IS NOT NULL)'
      );
    });

    it("targets the reports table for the constraint", () => {
      expect(sql008).toContain("ALTER TABLE reports");
      expect(sql008).toContain(
        "ADD CONSTRAINT chk_reports_intervention_company_not_null"
      );
    });

    it("is idempotent and checks both constraint name and table name", () => {
      // Must check pg_constraint conname AND table name
      expect(sql008).toContain("FROM pg_constraint c");
      expect(sql008).toContain("JOIN pg_class t ON c.conrelid = t.oid");
      expect(sql008).toContain(
        "c.conname = 'chk_reports_intervention_company_not_null'"
      );
      expect(sql008).toContain("t.relname = 'reports'");
      expect(sql008).toContain("DO $$");
      expect(sql008).toContain("IF NOT EXISTS");
    });

    it("does not drop or recreate tables", () => {
      const nonCommentLines = sql008
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("--"))
        .join("\n");
      expect(nonCommentLines).not.toContain("DROP TABLE");
      expect(nonCommentLines).not.toContain("CREATE TABLE");
    });

    it("does not contain standalone BEGIN / COMMIT (migrator manages transaction)", () => {
      const withoutDoBlocks = sql008.replace(/DO \$\$[\s\S]*?\$\$;/g, "");
      expect(withoutDoBlocks).not.toContain("BEGIN");
      expect(withoutDoBlocks).not.toContain("COMMIT");
      expect(withoutDoBlocks).not.toContain("ROLLBACK");
    });
  });

  // =========================================================================
  // 2. Un rapportino collegato a un intervento non possa avere companyId nullo
  // =========================================================================
  describe("2. Linked report cannot have NULL companyId", () => {
    it("rejects records with interventionId set and companyId null or undefined", () => {
      expect(evaluateCheckConstraint("intervention-123", null)).toBe(false);
      expect(evaluateCheckConstraint("intervention-123", undefined)).toBe(false);
    });

    it("accepts records with interventionId set and companyId set", () => {
      expect(evaluateCheckConstraint("intervention-123", "company-abc")).toBe(true);
    });

    it("simulates DB reject when attempting insert of interventionId with NULL companyId", async () => {
      // Simulation of a DB constraint validator mirroring PostgreSQL CHECK behavior
      const insertReport = (row: { interventionId?: string | null; companyId?: string | null }) => {
        if (!evaluateCheckConstraint(row.interventionId, row.companyId)) {
          throw new Error(
            'new row for relation "reports" violates check constraint "chk_reports_intervention_company_not_null"'
          );
        }
        return { success: true, row };
      };

      expect(() =>
        insertReport({ interventionId: "int-xyz", companyId: null })
      ).toThrow(/violates check constraint "chk_reports_intervention_company_not_null"/);

      expect(
        insertReport({ interventionId: "int-xyz", companyId: "comp-456" })
      ).toEqual({
        success: true,
        row: { interventionId: "int-xyz", companyId: "comp-456" },
      });
    });
  });

  // =========================================================================
  // 3. I rapportini senza interventionId rimangano compatibili anche se companyId è nullo
  // =========================================================================
  describe("3. Backward compatibility: reports without interventionId can have null companyId", () => {
    it("allows reports without interventionId even if companyId is null", () => {
      expect(evaluateCheckConstraint(null, null)).toBe(true);
      expect(evaluateCheckConstraint(undefined, null)).toBe(true);
      expect(evaluateCheckConstraint(null, undefined)).toBe(true);
      expect(evaluateCheckConstraint(undefined, undefined)).toBe(true);
    });

    it("allows reports without interventionId when companyId is present", () => {
      expect(evaluateCheckConstraint(null, "company-123")).toBe(true);
      expect(evaluateCheckConstraint(undefined, "company-123")).toBe(true);
    });
  });

  // =========================================================================
  // 4. La foreign key composta e ON DELETE RESTRICT rimangano invariati
  // =========================================================================
  describe("4. Composite Foreign Key & ON DELETE RESTRICT preservation", () => {
    let sql007: string;
    let sql008: string;

    beforeEach(() => {
      sql007 = fs.readFileSync(
        path.join(migrationsDir, "007_reports_intervention_link.sql"),
        "utf-8"
      );
      sql008 = fs.readFileSync(
        path.join(migrationsDir, "008_reports_intervention_company_check.sql"),
        "utf-8"
      );
    });

    it("migration 007 defines composite FK with ON DELETE RESTRICT", () => {
      expect(sql007).toContain("fk_reports_intervention_tenant_consistency");
      expect(sql007).toContain(
        'FOREIGN KEY ("interventionId", "companyId")'
      );
      expect(sql007).toContain(
        'REFERENCES interventions (id, "companyId") ON DELETE RESTRICT'
      );
    });

    it("migration 007 ensures prerequisite composite unique constraint on interventions", () => {
      expect(sql007).toContain("uq_interventions_id_company");
      expect(sql007).toContain(
        'ALTER TABLE interventions ADD CONSTRAINT uq_interventions_id_company UNIQUE (id, "companyId")'
      );
    });

    it("migration 008 does NOT drop or alter composite FK or prerequisite constraints", () => {
      expect(sql008).not.toContain("DROP CONSTRAINT");
      expect(sql008).not.toContain("fk_reports_intervention_tenant_consistency");
      expect(sql008).not.toContain("uq_interventions_id_company");
    });
  });

  // =========================================================================
  // 5. Le migration precedenti non siano state modificate
  // =========================================================================
  describe("5. Immutability of previous migrations (001-007)", () => {
    it.each([
      ["001", "001_initial_schema.sql"],
      ["002", "002_team_and_onboarding.sql"],
      ["003", "003_customers_and_locations.sql"],
      ["004", "004_assets.sql"],
      ["005", "005_interventions.sql"],
      ["006", "006_interventions_composite_fk_and_set_null_targets.sql"],
      ["007", "007_reports_intervention_link.sql"],
    ])("migration %s (%s) matches its immutable recorded checksum", (version, filename) => {
      const filePath = path.join(migrationsDir, filename);
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = fs.readFileSync(filePath, "utf-8");
      const normalized = raw.replace(/\r\n/g, "\n");
      const checksum = calculateChecksum(normalized);

      expect(checksum).toBe(RECORDED_CHECKSUMS[version]);
    });

    it("migrator applies migration 008 sequentially when 001-007 are already applied", async () => {
      const executedQueries: { sql: string; params?: any[] }[] = [];
      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
          executedQueries.push({ sql, params });
          if (sql.includes("FROM schema_migrations") && sql.includes("SELECT")) {
            return {
              rows: [
                { version: "001", name: "001_initial_schema.sql", applied_at: "2026-01-01", checksum: RECORDED_CHECKSUMS["001"] },
                { version: "002", name: "002_team_and_onboarding.sql", applied_at: "2026-01-02", checksum: RECORDED_CHECKSUMS["002"] },
                { version: "003", name: "003_customers_and_locations.sql", applied_at: "2026-01-03", checksum: RECORDED_CHECKSUMS["003"] },
                { version: "004", name: "004_assets.sql", applied_at: "2026-01-04", checksum: RECORDED_CHECKSUMS["004"] },
                { version: "005", name: "005_interventions.sql", applied_at: "2026-01-05", checksum: RECORDED_CHECKSUMS["005"] },
                { version: "006", name: "006_interventions_composite_fk_and_set_null_targets.sql", applied_at: "2026-01-06", checksum: RECORDED_CHECKSUMS["006"] },
                { version: "007", name: "007_reports_intervention_link.sql", applied_at: "2026-01-07", checksum: RECORDED_CHECKSUMS["007"] },
              ],
            };
          }
          return { rows: [], rowCount: 1 };
        }),
        release: vi.fn(),
      };

      const mockPool = {
        query: (...args: any[]) => mockClient.query(...args),
        connect: vi.fn().mockResolvedValue(mockClient),
      };

      const result = await runMigrations(mockPool, { migrationsDir });

      expect(result.alreadyApplied).toHaveLength(7);
      expect(result.applied).toEqual(["008_reports_intervention_company_check.sql"]);
      expect(result.total).toBe(8);

      // Verify transaction was properly wrapped
      const begins = executedQueries.filter((q) => q.sql === "BEGIN");
      const commits = executedQueries.filter((q) => q.sql === "COMMIT");
      expect(begins).toHaveLength(1);
      expect(commits).toHaveLength(1);

      // Verify version 008 was recorded in schema_migrations
      const insertRecord = executedQueries.find(
        (q) => q.sql.includes("INSERT INTO schema_migrations") && q.params?.[0] === "008"
      );
      expect(insertRecord).toBeDefined();
    });
  });
});
