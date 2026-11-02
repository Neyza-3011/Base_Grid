import { randomUUID } from "crypto";
import path from "path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAdapter } from "./db-postgres";
import { loadMigrationsFromDir, runMigrations } from "./migrator";

const testDatabaseUrl = process.env.MIGRATOR_TEST_DATABASE_URL;
const postgresDescribe = testDatabaseUrl ? describe : describe.skip;

postgresDescribe("P0-ROLE PostgreSQL last-admin concurrency", () => {
  let adminPool: Pool | undefined;
  let testPool: Pool | undefined;
  let adapter: PostgresAdapter | undefined;
  let schemaName = "";

  const runId = randomUUID().replace(/-/g, "");
  const companyId = `p0role-company-${runId}`;
  const firstUserId = `p0role-user-a-${runId}`;
  const secondUserId = `p0role-user-b-${runId}`;
  const deactivationCompanyId = `p0role-deactivate-company-${runId}`;
  const firstDeactivationUserId = `p0role-deactivate-user-a-${runId}`;
  const secondDeactivationUserId = `p0role-deactivate-user-b-${runId}`;

  beforeAll(async () => {
    if (!testDatabaseUrl) return;

    const parsedUrl = new URL(testDatabaseUrl);
    const databaseName = parsedUrl.pathname.replace(/^\//, "");
    if (
      !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname) ||
      !databaseName.endsWith("_test")
    ) {
      throw new Error("P0-ROLE concurrency tests require a loopback *_test database URL.");
    }

    adminPool = new Pool({ connectionString: testDatabaseUrl, max: 2 });
    schemaName = "bg_p0role_admin_guard_" + runId;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);

    testPool = new Pool({
      connectionString: testDatabaseUrl,
      options: `-c search_path=${schemaName}`,
      max: 4,
      connectionTimeoutMillis: 5000,
    });

    const migrations = loadMigrationsFromDir(path.resolve(__dirname, "migrations"));
    await runMigrations(testPool, { migrations });
    adapter = new PostgresAdapter(testPool);

    await testPool.query("INSERT INTO companies (id, name) VALUES ($1, $2)", [
      companyId,
      "P0-ROLE concurrent admin test",
    ]);
    await testPool.query(
      `INSERT INTO users
         (id, email, "fullName", role, "companyId", "companyName", "passwordHash", salt,
          "isActive", provider, "emailConfirmed", "phoneNumber", "createdAt", "updatedAt")
       VALUES
         ($1, $2, $3, 'admin', $4, $5, 'test-hash', 'test-salt', true, 'local', true, '', NOW(), NOW()),
         ($6, $7, $8, 'admin', $4, $5, 'test-hash', 'test-salt', true, 'local', true, '', NOW(), NOW())`,
      [
        firstUserId,
        `admin-a-${runId}@example.test`,
        "Admin A",
        companyId,
        "P0-ROLE concurrent admin test",
        secondUserId,
        `admin-b-${runId}@example.test`,
        "Admin B",
      ],
    );

    await testPool.query("INSERT INTO companies (id, name) VALUES ($1, $2)", [
      deactivationCompanyId,
      "P0-ROLE concurrent admin deactivation test",
    ]);
    await testPool.query(
      `INSERT INTO users
         (id, email, "fullName", role, "companyId", "companyName", "passwordHash", salt,
          "isActive", provider, "emailConfirmed", "phoneNumber", "createdAt", "updatedAt")
       VALUES
         ($1, $2, $3, 'admin', $4, $5, 'test-hash', 'test-salt', true, 'local', true, '', NOW(), NOW()),
         ($6, $7, $8, 'admin', $4, $5, 'test-hash', 'test-salt', true, 'local', true, '', NOW(), NOW())`,
      [
        firstDeactivationUserId,
        `deactivate-a-${runId}@example.test`,
        "Admin A Deactivation",
        deactivationCompanyId,
        "P0-ROLE concurrent admin deactivation test",
        secondDeactivationUserId,
        `deactivate-b-${runId}@example.test`,
        "Admin B Deactivation",
      ],
    );
  }, 60_000);

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    }
    if (adminPool) await adminPool.end();
  }, 15_000);

  it("serializes concurrent demotions and preserves one active administrator", async () => {
    const results = await Promise.allSettled([
      adapter!.updateTeamMember(firstUserId, companyId, { role: "technician" }),
      adapter!.updateTeamMember(secondUserId, companyId, { role: "technician" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toMatchObject({ statusCode: 403 });
      expect(rejected.reason.message).toMatch(/ultimo amministratore attivo/i);
    }

    const members = await adapter!.getUsersByCompany(companyId);
    const activeAdmins = members.filter(
      (member) => member.isActive && (member.role === "owner" || member.role === "admin"),
    );
    expect(activeAdmins).toHaveLength(1);
  });

  it("serializes concurrent deactivations and preserves one active administrator", async () => {
    const results = await Promise.allSettled([
      adapter!.updateTeamMember(firstDeactivationUserId, deactivationCompanyId, { isActive: false }),
      adapter!.updateTeamMember(secondDeactivationUserId, deactivationCompanyId, { isActive: false }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toMatchObject({ statusCode: 403 });
      expect(rejected.reason.message).toMatch(/ultimo amministratore attivo/i);
    }

    const members = await adapter!.getUsersByCompany(deactivationCompanyId);
    const activeAdmins = members.filter(
      (member) => member.isActive && (member.role === "owner" || member.role === "admin"),
    );
    expect(activeAdmins).toHaveLength(1);
  });
});
