import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import path from "path";
import { PostgresAdapter } from "./db-postgres";
import { runMigrations, loadMigrationsFromDir } from "./migrator";

const testDatabaseUrl = process.env.MIGRATOR_TEST_DATABASE_URL;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("PostgreSQL team last-admin invariant under concurrency", () => {
  let adminPool: Pool | undefined;
  let testPool: Pool | undefined;
  let adapter: PostgresAdapter | undefined;
  let schemaName = "";

  beforeAll(async () => {
    if (!testDatabaseUrl) return;

    const parsedUrl = new URL(testDatabaseUrl);
    const databaseName = parsedUrl.pathname.replace(/^\//, "");
    if (
      !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) ||
      !databaseName.endsWith("_test")
    ) {
      throw new Error("Team admin concurrency tests require a loopback *_test database URL.");
    }

    adminPool = new Pool({ connectionString: testDatabaseUrl, max: 2, connectionTimeoutMillis: 5000 });
    schemaName = "bg_team_admin_" + randomUUID().replace(/-/g, "");
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: testDatabaseUrl,
      options: `-c search_path=${schemaName}`,
      max: 4,
      connectionTimeoutMillis: 5000,
    });
    await runMigrations(testPool, {
      migrations: loadMigrationsFromDir(path.resolve(__dirname, "migrations")),
    });
    adapter = new PostgresAdapter(testPool);
  }, 60_000);

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    if (adminPool) await adminPool.end();
  }, 15_000);

  it("serializes concurrent demotions so an active tenant admin always remains", async () => {
    const companyOwner = await adapter!.createUser({
      email: `team-admin-owner-${randomUUID()}@example.test`,
      fullName: "Team Admin Owner",
      companyName: "Team Admin Concurrency Test",
      password: "Test-only-password-123!",
      role: "owner",
    });
    const companyId = companyOwner.company.id;
    const secondAdmin = await adapter!.createTeamMember({
      companyId,
      companyName: companyOwner.company.name,
      email: `team-admin-second-${randomUUID()}@example.test`,
      fullName: "Second Team Admin",
      role: "admin",
      passwordHash: "test-hash",
      salt: "test-salt",
      isActive: true,
      emailConfirmed: true,
    });

    const outcomes = await Promise.allSettled([
      adapter!.updateTeamMember(companyOwner.user.id, companyId, { role: "technician" }, { incrementAuthVersion: true }),
      adapter!.updateTeamMember(secondAdmin.id, companyId, { role: "technician" }, { incrementAuthVersion: true }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason?.message ?? rejected.reason)).toMatch(/ultimo amministratore attivo/i);

    const members = await adapter!.getUsersByCompany(companyId);
    expect(members.filter((member) => member.isActive && ["owner", "admin"].includes(member.role))).toHaveLength(1);
    expect(await adapter!.countAdminOwnersByCompany(companyId)).toBe(1);
  }, 30_000);
});
