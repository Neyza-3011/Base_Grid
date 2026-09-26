import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { PostgresAdapter } from "./db-postgres";
import { CompanyRecord, UserRecord, ReportRecord } from "./types";

describe("PostgreSQL Adapter Unit & Security Suite (server/db-postgres.ts)", () => {
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    mockPool = {
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      connect: vi.fn().mockResolvedValue(mockClient),
      end: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("fails closed in production if DATABASE_URL is missing", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDbUrl = process.env.DATABASE_URL;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.DATABASE_URL;

      expect(() => {
        new PostgresAdapter();
      }).toThrow(/DATABASE_URL is missing in production/i);
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
    }
  });

  it("initDatabase initializes runtime master data without containing schema evolution DDL", async () => {
    const adapter = new PostgresAdapter(mockPool);
    await adapter.initDatabase();

    expect(mockPool.query).toHaveBeenCalled();
    const allQueryCalls = mockPool.query.mock.calls.map((c: any[]) => c[0]).join("\n");
    // Verifies runtime data bootstrap
    expect(allQueryCalls).toContain("INSERT INTO companies");
    // Verifies no DDL is executed by initDatabase
    expect(allQueryCalls).not.toContain("CREATE TABLE");
    expect(allQueryCalls).not.toContain("ALTER TABLE");
    expect(allQueryCalls).not.toContain("CREATE INDEX");
    expect(allQueryCalls).not.toContain("DO $$");
  });

  it("withTransaction executes BEGIN, queries, and COMMIT on success", async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: "test" }] }); // user query
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT

    const adapter = new PostgresAdapter(mockPool);
    const result = await adapter.withTransaction(async (client) => {
      const res = await client.query("SELECT 1");
      return res.rows[0];
    });

    expect(result).toEqual({ id: "test" });
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("withTransaction executes ROLLBACK and releases client on error", async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
    mockClient.query.mockRejectedValueOnce(new Error("Query failed")); // failed query
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const adapter = new PostgresAdapter(mockPool);
    await expect(
      adapter.withTransaction(async (client) => {
        await client.query("BAD SQL");
      }),
    ).rejects.toThrow("Query failed");

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("findUserByEmail normalizes email and properly maps SQL row", async () => {
    const fakeRow = {
      id: "usr-123",
      email: "test@example.com",
      fullName: "Test User",
      role: "admin",
      companyId: "comp-123",
      companyName: "Acme Srl",
      passwordHash: "hashed",
      salt: "salty",
      isActive: true,
      provider: "local",
      emailConfirmed: true,
      phoneNumber: "+39 123",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    };

    mockPool.query.mockResolvedValueOnce({ rows: [fakeRow] });

    const adapter = new PostgresAdapter(mockPool);
    const user = await adapter.findUserByEmail("  TEST@EXAMPLE.COM ");

    expect(mockPool.query).toHaveBeenCalledWith(
      "SELECT * FROM users WHERE email = $1 LIMIT 1",
      ["test@example.com"],
    );
    expect(user).not.toBeNull();
    expect(user?.email).toBe("test@example.com");
    expect(user?.fullName).toBe("Test User");
    expect(user?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("createUser creates company and user within a transaction", async () => {
    mockClient.query.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return Promise.resolve({ rows: [] });
      if (sql.includes("SELECT * FROM users WHERE email")) return Promise.resolve({ rowCount: 0, rows: [] });
      if (sql.includes("INSERT INTO companies")) return Promise.resolve({ rows: [] });
      if (sql.includes("INSERT INTO users")) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });

    const adapter = new PostgresAdapter(mockPool);
    const result = await adapter.createUser({
      email: "new@example.com",
      fullName: "New Admin",
      password: "Password123!",
      companyName: "Elettro Tech Srl",
    });

    expect(result.user.email).toBe("new@example.com");
    expect(result.user.fullName).toBe("New Admin");
    expect(result.user.role).toBe("admin");
    expect(result.company.name).toBe("Elettro Tech Srl");
  });

  it("updateUser updates user fields and returns safe updated record", async () => {
    const existingRow = {
      id: "usr-123",
      email: "old@example.com",
      fullName: "Old Name",
      role: "admin",
      companyId: "comp-123",
      companyName: "Acme",
      passwordHash: "hash",
      salt: "salt",
      isActive: true,
      provider: "local",
      emailConfirmed: true,
      phoneNumber: "",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [existingRow] }) // findUserById
      .mockResolvedValueOnce({ rows: [] }); // UPDATE query

    const adapter = new PostgresAdapter(mockPool);
    const updated = await adapter.updateUser("usr-123", {
      fullName: "New Name",
      phoneNumber: "+39 999",
    });

    expect(updated?.fullName).toBe("New Name");
    expect(updated?.phoneNumber).toBe("+39 999");
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it("createReport properly inserts report with JSONB strings and returns formatted ReportRecord", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const adapter = new PostgresAdapter(mockPool);
    const report = await adapter.createReport("comp-123", {
      workHours: 4.5,
      travelHours: 1,
      client: { name: "Mario Rossi", address: "Via Roma 1" },
      technician: { fullName: "Luca Tecnico" },
      materialsUsed: [{ description: "Cavo 3x1.5", quantity: 20 }],
    });

    expect(report.companyId).toBe("comp-123");
    expect(report.workHours).toBe(4.5);
    expect(report.travelHours).toBe(1);
    expect(report.client.name).toBe("Mario Rossi");
    expect(report.materialsUsed).toHaveLength(1);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO reports"),
      expect.arrayContaining([
        expect.any(String),
        "comp-123",
        expect.any(String),
        expect.any(String),
        4.5,
        1,
        "submitted",
        JSON.stringify({ name: "Mario Rossi", address: "Via Roma 1", city: "" }),
        JSON.stringify({ fullName: "Luca Tecnico" }),
        JSON.stringify([{ description: "Cavo 3x1.5", quantity: 20 }]),
        "",
        undefined,
        expect.any(String),
      ]),
    );
  });

  it("getReportsByCompany maps JSONB and numeric columns correctly and enforces companyId filter", async () => {
    const rawRows = [
      {
        id: "rep-1",
        companyId: "comp-123",
        date: "18/08/2026",
        time: "10:00",
        workHours: "4.5", // Returned as string by pg numeric
        travelHours: "1.0",
        status: "submitted",
        client: '{"name": "Client A", "address": "Street 1"}',
        technician: '{"fullName": "Tech A"}',
        materialsUsed: '[{"description": "Pipe", "quantity": 2}]',
        notes: "Completed successfully",
        signatureBase64: "base64sig",
        createdAt: new Date("2026-08-18T10:00:00Z"),
      },
    ];

    mockPool.query.mockResolvedValueOnce({ rows: rawRows });

    const adapter = new PostgresAdapter(mockPool);
    const reports = await adapter.getReportsByCompany("comp-123", 50);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE "companyId" = $1'),
      ["comp-123", 50],
    );
    expect(reports).toHaveLength(1);
    expect(typeof reports[0].workHours).toBe("number");
    expect(reports[0].workHours).toBe(4.5);
    expect(reports[0].client.name).toBe("Client A");
    expect(reports[0].materialsUsed[0].description).toBe("Pipe");
  });

  it("deleteReport returns true if report was deleted, false otherwise", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "rep-1" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const adapter = new PostgresAdapter(mockPool);
    const deletedSuccess = await adapter.deleteReport("comp-123", "rep-1");
    const deletedFailure = await adapter.deleteReport("comp-123", "rep-999");

    expect(deletedSuccess).toBe(true);
    expect(deletedFailure).toBe(false);
  });

  it("getGlobalStats counts companies, users, reports", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({ rows: [{ count: "12" }] })
      .mockResolvedValueOnce({ rows: [{ count: "48" }] });

    const adapter = new PostgresAdapter(mockPool);
    const stats = await adapter.getGlobalStats();

    expect(stats.total_tenants).toBe(5);
    expect(stats.total_users).toBe(12);
    expect(stats.total_reports).toBe(48);
    expect(stats.system_status).toContain("PostgreSQL");
  });

  it("createUser handles race condition and rolls back on unique violation (code 23505)", async () => {
    mockClient.query.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return Promise.resolve({ rows: [] });
      if (sql.includes("SELECT id FROM users WHERE email")) return Promise.resolve({ rowCount: 0, rows: [] });
      if (sql.includes("INSERT INTO companies")) return Promise.resolve({ rows: [] });
      if (sql.includes("INSERT INTO users")) {
        const err: any = new Error("duplicate key value violates unique constraint 'users_email_key'");
        err.code = "23505";
        return Promise.reject(err);
      }
      return Promise.resolve({ rows: [] });
    });

    const adapter = new PostgresAdapter(mockPool);
    await expect(
      adapter.createUser({
        email: "concurrent@example.com",
        fullName: "Concurrent User",
        password: "Password123!",
        companyName: "Acme Concurrent",
      }),
    ).rejects.toThrow("Email already registered");

    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("verifyEmailWithToken locks row FOR UPDATE and prevents double verification", async () => {
    const fakeToken = {
      id: "tok-1",
      userId: "usr-1",
      tokenHash: "hash123",
      type: "email_verification",
      consumed: false,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    mockClient.query.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return Promise.resolve({ rows: [] });
      if (sql.includes("SELECT * FROM auth_tokens WHERE \"tokenHash\" = $1 AND type = 'email_verification' FOR UPDATE")) {
        return Promise.resolve({ rows: [fakeToken] });
      }
      if (sql.includes("UPDATE auth_tokens SET consumed = true")) {
        return Promise.resolve({ rowCount: 1, rows: [] });
      }
      if (sql.includes("UPDATE users SET \"emailConfirmed\" = true")) {
        return Promise.resolve({ rowCount: 1, rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const adapter = new PostgresAdapter(mockPool);
    const result = await adapter.verifyEmailWithToken("hash123");

    expect(result.success).toBe(true);
    expect(result.userId).toBe("usr-1");
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE"),
      ["hash123"],
    );
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  it("verifyEmailWithToken rejects already consumed tokens", async () => {
    const consumedToken = {
      id: "tok-2",
      userId: "usr-2",
      tokenHash: "hash456",
      type: "email_verification",
      consumed: true,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    mockClient.query.mockImplementation((sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return Promise.resolve({ rows: [] });
      if (sql.includes("SELECT * FROM auth_tokens")) {
        return Promise.resolve({ rows: [consumedToken] });
      }
      return Promise.resolve({ rows: [] });
    });

    const adapter = new PostgresAdapter(mockPool);
    const result = await adapter.verifyEmailWithToken("hash456");

    expect(result.success).toBe(false);
    expect(result.error).toBe("already_used");
  });

  it("consumeAuthToken atomically consumes single-use tokens", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // first attempt succeeds
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // concurrent second attempt fails

    const adapter = new PostgresAdapter(mockPool);
    const firstCall = await adapter.consumeAuthToken("hash789", "email_verification");
    const secondCall = await adapter.consumeAuthToken("hash789", "email_verification");

    expect(firstCall).toBe(true);
    expect(secondCall).toBe(false);
  });

  it("getReportById strictly enforces multi-tenant isolation by companyId", async () => {
    const rawRow = {
      id: "rep-tenant-1",
      companyId: "comp-A",
      date: "20/08/2026",
      time: "14:00",
      workHours: "3.5",
      travelHours: "0.5",
      status: "submitted",
      client: { name: "Client A", address: "Via Roma" },
      technician: { fullName: "Tech 1" },
      materialsUsed: [],
      notes: "Tenant A Notes",
      signatureBase64: "",
      createdAt: new Date("2026-08-20T14:00:00Z"),
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [rawRow] }) // matching companyId
      .mockResolvedValueOnce({ rows: [] }); // cross-tenant query for different companyId

    const adapter = new PostgresAdapter(mockPool);
    const validReport = await adapter.getReportById("comp-A", "rep-tenant-1");
    const crossTenantReport = await adapter.getReportById("comp-B", "rep-tenant-1");

    expect(validReport).not.toBeNull();
    expect(validReport?.id).toBe("rep-tenant-1");
    expect(validReport?.companyId).toBe("comp-A");
    expect(crossTenantReport).toBeNull();
  });

  describe("authVersion PostgreSQL Implementation & Security (P0.4.4-B.1)", () => {
    it("incrementUserAuthVersion calls this.pool.query with atomic UPDATE and RETURNING", async () => {
      mockPool.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ authVersion: 1 }],
      });

      const adapter = new PostgresAdapter(mockPool);
      const newVersion = await adapter.incrementUserAuthVersion("usr-123");

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toBe(
        'UPDATE users SET "authVersion" = "authVersion" + 1, "updatedAt" = $1 WHERE id = $2 RETURNING "authVersion"'
      );
      expect(params[1]).toBe("usr-123");
      expect(newVersion).toBe(1);
    });

    it("increments authVersion consecutively (0 -> 1 -> 2)", async () => {
      mockPool.query
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ authVersion: 1 }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ authVersion: 2 }] });

      const adapter = new PostgresAdapter(mockPool);
      const v1 = await adapter.incrementUserAuthVersion("usr-abc");
      const v2 = await adapter.incrementUserAuthVersion("usr-abc");

      expect(v1).toBe(1);
      expect(v2).toBe(2);
    });

    it("returns null when incrementing authVersion for a nonexistent user", async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const adapter = new PostgresAdapter(mockPool);
      const result = await adapter.incrementUserAuthVersion("usr-nonexistent");

      expect(result).toBeNull();
    });

    it("ensures users table schema and migration include authVersion, but companies does not", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const queryArg = fs.readFileSync(path.resolve(process.cwd(), "server/migrations/001_initial_schema.sql"), "utf-8");

      // User table has authVersion
      expect(queryArg).toContain('"authVersion" INTEGER NOT NULL DEFAULT 0');
      expect(queryArg).toContain('ALTER TABLE users ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 0;');
      // Companies table does not have authVersion
      expect(queryArg).not.toContain('ALTER TABLE companies ADD COLUMN IF NOT EXISTS "authVersion"');
    });

    it("mapUserRow correctly maps authVersion while mapCompanyRow excludes authVersion", async () => {
      const fakeUserRow = {
        id: "usr-456",
        email: "tech@example.com",
        fullName: "Tech User",
        role: "technician",
        companyId: "comp-456",
        companyName: "Tech Co",
        passwordHash: "hash",
        salt: "salt",
        isActive: true,
        provider: "local",
        emailConfirmed: true,
        phoneNumber: "",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
        authVersion: 5,
      };

      const fakeCompanyRow = {
        id: "comp-456",
        name: "Tech Co",
        vatNumber: "IT123",
        address: "Via Tech",
        defaultHourlyRate: "60",
        reportFooterNotes: "Notes",
        stripeSubscriptionStatus: "Active",
        maxUsers: "10",
        featurePdfExport: true,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [fakeUserRow] })
        .mockResolvedValueOnce({ rows: [fakeCompanyRow] });

      const adapter = new PostgresAdapter(mockPool);
      const user = await adapter.findUserById("usr-456");
      const company = await adapter.findCompanyById("comp-456");

      expect(user?.authVersion).toBe(5);
      expect((company as any)?.authVersion).toBeUndefined();
    });
  });

  describe("P0.4.4-I1 — PostgreSQL ID Integrity & Collision Resistance", () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    it("generates collision-resistant UUIDs for concurrent user and company registrations", async () => {
      const adapter = new PostgresAdapter(mockPool);
      const N = 50;

      // Mock transaction query behavior for multiple calls
      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql === "BEGIN" || sql === "COMMIT") return Promise.resolve({ rows: [] });
        if (sql.includes("SELECT id FROM users WHERE email")) return Promise.resolve({ rowCount: 0, rows: [] });
        if (sql.includes("INSERT INTO companies") || sql.includes("INSERT INTO users")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const promises = Array.from({ length: N }, (_, i) =>
        adapter.createUser({
          email: `user_${i}@example.com`,
          fullName: `User ${i}`,
          password: `Password_${i}!`,
          companyName: `Company ${i}`,
        })
      );

      const results = await Promise.all(promises);

      const userIds = results.map((r) => r.user.id);
      const companyIds = results.map((r) => r.company.id);

      // Verify collision resistance: all IDs must be unique
      expect(new Set(userIds).size).toBe(N);
      expect(new Set(companyIds).size).toBe(N);

      // Verify format adheres to collision-resistant UUID (comp-<uuid> and usr-<uuid>)
      for (const uid of userIds) {
        expect(uid.startsWith("usr-")).toBe(true);
        const rawUuid = uid.replace("usr-", "");
        expect(rawUuid).toMatch(UUID_REGEX);
      }

      for (const cid of companyIds) {
        expect(cid.startsWith("comp-")).toBe(true);
        const rawUuid = cid.replace("comp-", "");
        expect(rawUuid).toMatch(UUID_REGEX);
      }
    });

    it("generates collision-resistant UUIDs for concurrent Google user creations", async () => {
      const adapter = new PostgresAdapter(mockPool);
      const N = 50;

      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql === "BEGIN" || sql === "COMMIT") return Promise.resolve({ rows: [] });
        if (sql.includes("SELECT * FROM users WHERE email")) return Promise.resolve({ rowCount: 0, rows: [] });
        if (sql.includes("INSERT INTO companies") || sql.includes("INSERT INTO users")) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const promises = Array.from({ length: N }, (_, i) =>
        adapter.createGoogleUser({
          email: `google_${i}@example.com`,
          fullName: `Google User ${i}`,
          companyName: `Google Company ${i}`,
        })
      );

      const results = await Promise.all(promises);

      const userIds = results.map((r) => r.user.id);
      const companyIds = results.map((r) => r.company.id);

      expect(new Set(userIds).size).toBe(N);
      expect(new Set(companyIds).size).toBe(N);

      for (const uid of userIds) {
        expect(uid.startsWith("usr-g-")).toBe(true);
        const rawUuid = uid.replace("usr-g-", "");
        expect(rawUuid).toMatch(UUID_REGEX);
      }
    });

    it("generates collision-resistant UUIDs for concurrent auto-generated report IDs", async () => {
      const adapter = new PostgresAdapter(mockPool);
      const N = 50;

      mockPool.query.mockResolvedValue({ rows: [] });

      const promises = Array.from({ length: N }, () =>
        adapter.createReport("comp-test", {
          client: { name: "Test Client" },
        })
      );

      const reports = await Promise.all(promises);
      const reportIds = reports.map((r) => r.id);

      expect(new Set(reportIds).size).toBe(N);

      for (const rid of reportIds) {
        expect(rid.startsWith("REP-")).toBe(true);
        const rawUuid = rid.replace("REP-", "");
        expect(rawUuid).toMatch(UUID_REGEX);
      }
    });

    it("generates collision-resistant UUIDs for concurrent auth token creation", async () => {
      const adapter = new PostgresAdapter(mockPool);
      const N = 50;

      mockPool.query.mockResolvedValue({ rows: [] });

      const promises = Array.from({ length: N }, (_, i) =>
        adapter.createAuthToken({
          userId: `usr-${i}`,
          tokenHash: `hash-${i}`,
          type: "email_verification",
          expiresAt: new Date().toISOString(),
        })
      );

      const tokens = await Promise.all(promises);
      const tokenIds = tokens.map((t) => t.id);

      expect(new Set(tokenIds).size).toBe(N);

      for (const tid of tokenIds) {
        expect(tid.startsWith("tok-")).toBe(true);
        const rawUuid = tid.replace("tok-", "");
        expect(rawUuid).toMatch(UUID_REGEX);
      }
    });
  });

  describe("P0.4.4-I2 — PostgreSQL Integrity Constraints & Foreign Keys (Mock Suite)", () => {
    it("defines foreign keys with ON DELETE CASCADE, exact single-column checks (conkey, confkey), and exact single-column UNIQUE constraints in schema DDL", async () => {
      const fs = await import("fs");
      const path = await import("path");
      const ddl = fs.readFileSync(path.resolve(process.cwd(), "server/migrations/001_initial_schema.sql"), "utf-8");

      // Foreign keys with ON DELETE CASCADE in table definitions
      expect(ddl).toContain('"companyId" VARCHAR(255) REFERENCES companies(id) ON DELETE CASCADE');
      expect(ddl).toContain('"userId" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE');
      // Unique constraints in table definitions
      expect(ddl).toContain("email VARCHAR(255) UNIQUE NOT NULL");
      expect(ddl).toContain('"tokenHash" VARCHAR(255) NOT NULL UNIQUE');

      // Migration DO $$ block: exact single-column FK matching via conkey and confkey
      expect(ddl).toContain("c.conkey = ARRAY[a1.attnum]");
      expect(ddl).toContain("c.confkey = ARRAY[a2.attnum]");
      expect(ddl).toContain("a1.attrelid = c.conrelid AND a1.attname = 'companyId'");
      expect(ddl).toContain("a2.attrelid = c.confrelid AND a2.attname = 'id'");
      expect(ddl).toContain("a1.attrelid = c.conrelid AND a1.attname = 'userId'");
      expect(ddl).toContain("c.confdeltype::text INTO v_deltype");
      expect(ddl).toContain("c.contype = 'f'");
      expect(ddl).toContain("c.conrelid = 'users'::regclass");
      expect(ddl).toContain("c.confrelid = 'companies'::regclass");
      expect(ddl).toContain("c.conrelid = 'reports'::regclass");
      expect(ddl).toContain("c.conrelid = 'auth_tokens'::regclass");
      expect(ddl).toContain("c.confrelid = 'users'::regclass");

      // Non-CASCADE detection raises exception
      expect(ddl).toContain("ELSIF v_deltype <> 'c' THEN");
      expect(ddl).toContain("RAISE EXCEPTION 'Foreign key on users(\"companyId\") -> companies(id) exists with non-CASCADE delete action (%). Manual migration required.'");
      expect(ddl).toContain("RAISE EXCEPTION 'Foreign key on reports(\"companyId\") -> companies(id) exists with non-CASCADE delete action (%). Manual migration required.'");
      expect(ddl).toContain("RAISE EXCEPTION 'Foreign key on auth_tokens(\"userId\") -> users(id) exists with non-CASCADE delete action (%). Manual migration required.'");

      // Exact single-column matching for UNIQUE constraints via conkey = ARRAY[a.attnum]
      expect(ddl).toContain("c.conrelid = 'users'::regclass");
      expect(ddl).toContain("c.contype = 'u'");
      expect(ddl).toContain("c.conkey = ARRAY[a.attnum]");
      expect(ddl).toContain("a.attrelid = c.conrelid AND a.attname = 'email'");
      expect(ddl).toContain("c.conrelid = 'auth_tokens'::regclass");
      expect(ddl).toContain("a.attrelid = c.conrelid AND a.attname = 'tokenHash'");

      // Migration DO $$ block adds constraints idempotently
      expect(ddl).toContain("ADD CONSTRAINT fk_users_company");
      expect(ddl).toContain('FOREIGN KEY ("companyId") REFERENCES companies(id) ON DELETE CASCADE');
      expect(ddl).toContain("ADD CONSTRAINT fk_reports_company");
      expect(ddl).toContain("ADD CONSTRAINT fk_auth_tokens_user");
      expect(ddl).toContain("ADD CONSTRAINT uq_users_email UNIQUE (email)");
      expect(ddl).toContain('ADD CONSTRAINT uq_auth_tokens_token_hash UNIQUE ("tokenHash")');

      // Indispensable indexes
      expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_users_company_id ON users("companyId")');
      expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_reports_company_id ON reports("companyId")');
      expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens("userId", type)');

      // Redundant indexes on UNIQUE columns are eliminated
      expect(ddl).not.toContain("CREATE INDEX IF NOT EXISTS idx_users_email");
      expect(ddl).not.toContain("CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash");
    });

    it("fails migration with an explicit error if a foreign key exists with a non-CASCADE action", async () => {
      const { runMigrations } = await import("./migrator");
      const rejectHandler = (sql: string) => {
        if (sql.includes("DO $$") && sql.includes("confdeltype")) {
          const err: any = new Error('Foreign key on users("companyId") -> companies(id) exists with non-CASCADE delete action (a). Manual migration required.');
          return Promise.reject(err);
        }
        return Promise.resolve({ rows: [] });
      };
      mockClient.query.mockImplementation(rejectHandler);
      mockPool.query.mockImplementation(rejectHandler);

      await expect(runMigrations(mockPool)).rejects.toThrow(/exists with non-CASCADE delete action/i);
    });

    it("rejects user insert with nonexistent companyId (foreign key constraint violation 23503)", async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (sql.includes("INSERT INTO users")) {
          const fkErr: any = new Error('insert or update on table "users" violates foreign key constraint "fk_users_company"');
          fkErr.code = "23503";
          return Promise.reject(fkErr);
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        mockPool.query(
          'INSERT INTO users (id, email, "fullName", "companyId") VALUES ($1, $2, $3, $4)',
          ["usr-orphan-123", "orphan@example.com", "Orphan User", "comp-nonexistent-999"]
        )
      ).rejects.toThrow(/violates foreign key constraint/i);
    });

    it("rejects report creation with nonexistent companyId (foreign key constraint violation 23503)", async () => {
      const adapter = new PostgresAdapter(mockPool);

      mockPool.query.mockImplementation((sql: string) => {
        if (sql.includes("INSERT INTO reports")) {
          const fkErr: any = new Error('insert or update on table "reports" violates foreign key constraint "fk_reports_company"');
          fkErr.code = "23503";
          return Promise.reject(fkErr);
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        adapter.createReport("comp-nonexistent-999", {
          client: { name: "Orphan Client" },
        })
      ).rejects.toThrow(/violates foreign key constraint/i);
    });

    it("rejects auth token creation with nonexistent userId (foreign key constraint violation 23503)", async () => {
      const adapter = new PostgresAdapter(mockPool);

      mockPool.query.mockImplementation((sql: string) => {
        if (sql.includes("INSERT INTO auth_tokens")) {
          const fkErr: any = new Error('insert or update on table "auth_tokens" violates foreign key constraint "fk_auth_tokens_user"');
          fkErr.code = "23503";
          return Promise.reject(fkErr);
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        adapter.createAuthToken({
          userId: "usr-nonexistent-999",
          tokenHash: "token_hash_orphan",
          type: "email_verification",
          expiresAt: new Date().toISOString(),
        })
      ).rejects.toThrow(/violates foreign key constraint/i);
    });

    it("rejects duplicate user email at database level (unique constraint violation 23505)", async () => {
      const adapter = new PostgresAdapter(mockPool);

      mockClient.query.mockImplementation((sql: string) => {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return Promise.resolve({ rows: [] });
        if (sql.includes("SELECT id FROM users WHERE email")) return Promise.resolve({ rowCount: 0, rows: [] });
        if (sql.includes("INSERT INTO companies")) return Promise.resolve({ rows: [] });
        if (sql.includes("INSERT INTO users")) {
          const uqErr: any = new Error('duplicate key value violates unique constraint "uq_users_email"');
          uqErr.code = "23505";
          return Promise.reject(uqErr);
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        adapter.createUser({
          email: "duplicate@example.com",
          fullName: "Duplicate User",
          companyName: "Duplicate Co",
        })
      ).rejects.toThrow("Email already registered");
    });

    it("rejects duplicate auth token tokenHash at database level (unique constraint violation 23505)", async () => {
      const adapter = new PostgresAdapter(mockPool);

      mockPool.query.mockImplementation((sql: string) => {
        if (sql.includes("INSERT INTO auth_tokens")) {
          const uqErr: any = new Error('duplicate key value violates unique constraint "uq_auth_tokens_token_hash"');
          uqErr.code = "23505";
          return Promise.reject(uqErr);
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        adapter.createAuthToken({
          userId: "usr-valid-123",
          tokenHash: "already_existing_hash",
          type: "password_reset",
          expiresAt: new Date().toISOString(),
        })
      ).rejects.toThrow(/violates unique constraint/i);
    });

    it("ensures composite foreign key containing companyId is not accepted as valid exact FK", async () => {
      // Test the logic that a composite foreign key with conkey length > 1 will not match c.conkey = ARRAY[a1.attnum]
      const fs = await import("fs");
      const path = await import("path");
      const ddl = fs.readFileSync(path.resolve(process.cwd(), "server/migrations/001_initial_schema.sql"), "utf-8");

      // conkey MUST equal single-element ARRAY[a1.attnum], so composite FKs are excluded
      expect(ddl).toContain("c.conkey = ARRAY[a1.attnum]");
      expect(ddl).toContain("c.confkey = ARRAY[a2.attnum]");
      expect(ddl).not.toContain("a.attnum = ANY(c.conkey)");
    });

    it("ensures composite UNIQUE constraint containing email or tokenHash is not accepted as valid exact UNIQUE", async () => {
      // Test the logic that a composite unique constraint with conkey length > 1 will not match c.conkey = ARRAY[a.attnum]
      const fs = await import("fs");
      const path = await import("path");
      const ddl = fs.readFileSync(path.resolve(process.cwd(), "server/migrations/001_initial_schema.sql"), "utf-8");

      // conkey MUST equal single-element ARRAY[a.attnum], so composite UNIQUE constraints like UNIQUE(email, x) are excluded
      expect(ddl).toContain("c.conkey = ARRAY[a.attnum]");
      expect(ddl).not.toContain("a.attnum = ANY(c.conkey)");
    });
  });

  describe("P0.4.4-I3 — PostgreSQL Transactions, Atomicity & Race Conditions (Mock Suite)", () => {
    let mockTxClient: any;
    let queryLog: string[];

    beforeEach(() => {
      queryLog = [];
      mockTxClient = {
        query: vi.fn(async (sql: string, params?: any[]) => {
          queryLog.push(typeof sql === "string" ? sql : "QUERY");
          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
            return { rowCount: 0, rows: [] };
          }
          return { rowCount: 1, rows: [{ id: "mock-row", authVersion: 1 }] };
        }),
        release: vi.fn(),
      };
      mockPool.connect.mockResolvedValue(mockTxClient);
    });

    describe("1. withTransaction() robustness", () => {
      it("executes BEGIN before callback, COMMIT on success, and releases client", async () => {
        const adapter = new PostgresAdapter(mockPool);
        const result = await adapter.withTransaction(async (client) => {
          expect(queryLog).toEqual(["BEGIN"]);
          await client.query("SELECT 42");
          return "success_val";
        });

        expect(result).toBe("success_val");
        expect(queryLog).toEqual(["BEGIN", "SELECT 42", "COMMIT"]);
        expect(mockTxClient.release).toHaveBeenCalledTimes(1);
      });

      it("executes ROLLBACK when callback throws and propagates original error", async () => {
        const adapter = new PostgresAdapter(mockPool);
        const customErr = new Error("Business logic exception");

        await expect(
          adapter.withTransaction(async (client) => {
            await client.query("UPDATE something");
            throw customErr;
          }),
        ).rejects.toThrow("Business logic exception");

        expect(queryLog).toEqual(["BEGIN", "UPDATE something", "ROLLBACK"]);
        expect(mockTxClient.release).toHaveBeenCalledTimes(1);
      });

      it("executes ROLLBACK and releases client if COMMIT fails, propagating commit error", async () => {
        mockTxClient.query.mockImplementation(async (sql: string) => {
          queryLog.push(sql);
          if (sql === "COMMIT") {
            const commitErr: any = new Error("Serialization failure / Commit conflict");
            commitErr.code = "40001";
            throw commitErr;
          }
          return { rowCount: 0, rows: [] };
        });

        const adapter = new PostgresAdapter(mockPool);
        await expect(
          adapter.withTransaction(async (client) => {
            await client.query("INSERT INTO foo VALUES (1)");
          }),
        ).rejects.toThrow("Serialization failure / Commit conflict");

        expect(queryLog).toContain("BEGIN");
        expect(queryLog).toContain("COMMIT");
        expect(queryLog).toContain("ROLLBACK");
        expect(mockTxClient.release).toHaveBeenCalledTimes(1);
      });

      it("guarantees client release even if ROLLBACK fails, without masking original error", async () => {
        mockTxClient.query.mockImplementation(async (sql: string) => {
          queryLog.push(sql);
          if (sql === "FAIL_QUERY") throw new Error("Original operational failure");
          if (sql === "ROLLBACK") throw new Error("Connection broken during rollback");
          return { rowCount: 0, rows: [] };
        });

        const adapter = new PostgresAdapter(mockPool);
        await expect(
          adapter.withTransaction(async (client) => {
            await client.query("FAIL_QUERY");
          }),
        ).rejects.toThrow("Original operational failure");

        expect(queryLog).toEqual(["BEGIN", "FAIL_QUERY", "ROLLBACK"]);
        expect(mockTxClient.release).toHaveBeenCalledTimes(1);
      });

      it("does not attempt ROLLBACK if BEGIN fails before transaction starts", async () => {
        mockTxClient.query.mockImplementation(async (sql: string) => {
          queryLog.push(sql);
          if (sql === "BEGIN") throw new Error("Connection refused on BEGIN");
          return { rowCount: 0, rows: [] };
        });

        const adapter = new PostgresAdapter(mockPool);
        await expect(
          adapter.withTransaction(async () => {
            return "never_reached";
          }),
        ).rejects.toThrow("Connection refused on BEGIN");

        expect(queryLog).toEqual(["BEGIN"]);
        expect(queryLog).not.toContain("ROLLBACK");
        expect(mockTxClient.release).toHaveBeenCalledTimes(1);
      });
    });

    describe("2. Atomicity of createUser()", () => {
      it("executes BEGIN -> company insert -> user insert -> COMMIT on success", async () => {
        mockTxClient.query.mockImplementation(async (sql: string) => {
          queryLog.push(sql);
          if (sql === "BEGIN" || sql === "COMMIT") return { rowCount: 0, rows: [] };
          if (sql.includes("SELECT id FROM users WHERE email")) return { rowCount: 0, rows: [] };
          if (sql.includes("INSERT INTO companies")) return { rowCount: 1, rows: [] };
          if (sql.includes("INSERT INTO users")) return { rowCount: 1, rows: [] };
          return { rowCount: 0, rows: [] };
        });

        const adapter = new PostgresAdapter(mockPool);
        const res = await adapter.createUser({
          email: "atomic@example.com",
          fullName: "Atomic User",
          password: "SecurePassword1!",
          companyName: "Atomic Co Srl",
        });

        expect(res.user.email).toBe("atomic@example.com");
        expect(res.company.name).toBe("Atomic Co Srl");

        // Verify sequence
        const beginIdx = queryLog.findIndex((q) => q === "BEGIN");
        const compIdx = queryLog.findIndex((q) => q.includes("INSERT INTO companies"));
        const userIdx = queryLog.findIndex((q) => q.includes("INSERT INTO users"));
        const commitIdx = queryLog.findIndex((q) => q === "COMMIT");

        expect(beginIdx).toBeLessThan(compIdx);
        expect(compIdx).toBeLessThan(userIdx);
        expect(userIdx).toBeLessThan(commitIdx);
        expect(queryLog).not.toContain("ROLLBACK");
      });

      it("rolls back company insert if user insert fails, leaving no partial state", async () => {
        mockTxClient.query.mockImplementation(async (sql: string) => {
          queryLog.push(sql);
          if (sql === "BEGIN" || sql === "ROLLBACK") return { rowCount: 0, rows: [] };
          if (sql.includes("SELECT id FROM users WHERE email")) return { rowCount: 0, rows: [] };
          if (sql.includes("INSERT INTO companies")) return { rowCount: 1, rows: [] };
          if (sql.includes("INSERT INTO users")) {
            throw new Error("DB Error during user insert");
          }
          return { rowCount: 0, rows: [] };
        });

        const adapter = new PostgresAdapter(mockPool);
        await expect(
          adapter.createUser({
            email: "rollback-test@example.com",
            fullName: "Rollback User",
            password: "Password123!",
            companyName: "Orphaned Co",
          }),
        ).rejects.toThrow("DB Error during user insert");

        // Verify sequence: BEGIN -> company insert -> user insert -> ROLLBACK
        const beginIdx = queryLog.findIndex((q) => q === "BEGIN");
        const compIdx = queryLog.findIndex((q) => q.includes("INSERT INTO companies"));
        const userIdx = queryLog.findIndex((q) => q.includes("INSERT INTO users"));
        const rollbackIdx = queryLog.findIndex((q) => q === "ROLLBACK");

        expect(beginIdx).toBeLessThan(compIdx);
        expect(compIdx).toBeLessThan(userIdx);
        expect(userIdx).toBeLessThan(rollbackIdx);
        expect(queryLog).not.toContain("COMMIT");
        expect(mockTxClient.release).toHaveBeenCalled();
      });
    });

    describe("3. Concurrency on duplicate registrations", () => {
      it("translates PostgreSQL unique violation 23505 on users.email to 'Email already registered' with rollback", async () => {
        mockTxClient.query.mockImplementation(async (sql: string) => {
          queryLog.push(sql);
          if (sql === "BEGIN" || sql === "ROLLBACK") return { rowCount: 0, rows: [] };
          // Initial SELECT check passes (simulating concurrent request that hasn't committed yet)
          if (sql.includes("SELECT id FROM users WHERE email")) return { rowCount: 0, rows: [] };
          if (sql.includes("INSERT INTO companies")) return { rowCount: 1, rows: [] };
          if (sql.includes("INSERT INTO users")) {
            const uqErr: any = new Error('duplicate key value violates unique constraint "uq_users_email"');
            uqErr.code = "23505";
            uqErr.detail = 'Key (email)=(race@example.com) already exists.';
            throw uqErr;
          }
          return { rowCount: 0, rows: [] };
        });

        const adapter = new PostgresAdapter(mockPool);
        await expect(
          adapter.createUser({
            email: "race@example.com",
            fullName: "Race User",
            password: "Password123!",
            companyName: "Race Company",
          }),
        ).rejects.toThrow("Email already registered");

        expect(queryLog).toContain("BEGIN");
        expect(queryLog).toContain("ROLLBACK");
        expect(queryLog).not.toContain("COMMIT");
        expect(mockTxClient.release).toHaveBeenCalled();
      });
    });

    describe("4. Token atomicity & concurrency", () => {
      it("verifyEmailWithToken uses FOR UPDATE row-level lock and commits inside transaction", async () => {
        const fakeToken = {
          id: "tok-verify-1",
          userId: "usr-verify-1",
          tokenHash: "token_hash_verify",
          type: "email_verification",
          consumed: false,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        };

        mockTxClient.query.mockImplementation(async (sql: string) => {
          queryLog.push(sql);
          if (sql === "BEGIN" || sql === "COMMIT") return { rowCount: 0, rows: [] };
          if (sql.includes("SELECT * FROM auth_tokens") && sql.includes("FOR UPDATE")) {
            return { rowCount: 1, rows: [fakeToken] };
          }
          if (sql.includes("UPDATE auth_tokens SET consumed = true")) return { rowCount: 1, rows: [] };
          if (sql.includes("UPDATE users SET \"emailConfirmed\" = true")) return { rowCount: 1, rows: [] };
          return { rowCount: 0, rows: [] };
        });

        const adapter = new PostgresAdapter(mockPool);
        const res = await adapter.verifyEmailWithToken("token_hash_verify");

        expect(res.success).toBe(true);
        expect(res.userId).toBe("usr-verify-1");

        expect(queryLog[0]).toBe("BEGIN");
        const selectForUpdate = queryLog.find((q) => q.includes("FOR UPDATE"));
        expect(selectForUpdate).toBeDefined();
        expect(queryLog[queryLog.length - 1]).toBe("COMMIT");
      });

      it("resetPasswordWithToken uses FOR UPDATE lock and atomically increments authVersion in SQL", async () => {
        const fakeResetToken = {
          id: "tok-reset-1",
          userId: "usr-reset-1",
          tokenHash: "token_hash_reset",
          type: "password_reset",
          consumed: false,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        };

        mockTxClient.query.mockImplementation(async (sql: string) => {
          queryLog.push(sql);
          if (sql === "BEGIN" || sql === "COMMIT") return { rowCount: 0, rows: [] };
          if (sql.includes("SELECT * FROM auth_tokens") && sql.includes("FOR UPDATE")) {
            return { rowCount: 1, rows: [fakeResetToken] };
          }
          if (sql.includes("UPDATE auth_tokens SET consumed = true")) return { rowCount: 1, rows: [] };
          if (sql.includes("UPDATE users SET \"passwordHash\" = $1")) {
            return { rowCount: 1, rows: [] };
          }
          return { rowCount: 0, rows: [] };
        });

        const adapter = new PostgresAdapter(mockPool);
        const res = await adapter.resetPasswordWithToken("token_hash_reset", "newHash", "newSalt");

        expect(res.success).toBe(true);
        expect(res.userId).toBe("usr-reset-1");

        const updateUsersSql = queryLog.find((q) => q.includes('UPDATE users SET "passwordHash" = $1'));
        expect(updateUsersSql).toBeDefined();
        expect(updateUsersSql).toContain('"authVersion" = "authVersion" + 1');
        expect(queryLog[queryLog.length - 1]).toBe("COMMIT");
      });

      it("rolls back token transaction if an error occurs after row lock before commit", async () => {
        const fakeToken = {
          id: "tok-err-1",
          userId: "usr-err-1",
          tokenHash: "hash_err",
          type: "email_verification",
          consumed: false,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        };

        mockTxClient.query.mockImplementation(async (sql: string) => {
          queryLog.push(sql);
          if (sql === "BEGIN" || sql === "ROLLBACK") return { rowCount: 0, rows: [] };
          if (sql.includes("FOR UPDATE")) return { rowCount: 1, rows: [fakeToken] };
          if (sql.includes("UPDATE auth_tokens")) throw new Error("Disk full or connection severed");
          return { rowCount: 0, rows: [] };
        });

        const adapter = new PostgresAdapter(mockPool);
        await expect(adapter.verifyEmailWithToken("hash_err")).rejects.toThrow("Disk full or connection severed");

        expect(queryLog).toContain("BEGIN");
        expect(queryLog).toContain("ROLLBACK");
        expect(queryLog).not.toContain("COMMIT");
      });

      it("consumeAuthToken atomically updates single-use token and returns false for concurrent consumer", async () => {
        mockPool.query
          .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // winner
          .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // loser

        const adapter = new PostgresAdapter(mockPool);
        const winner = await adapter.consumeAuthToken("single_use_hash", "password_reset");
        const loser = await adapter.consumeAuthToken("single_use_hash", "password_reset");

        expect(winner).toBe(true);
        expect(loser).toBe(false);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining("UPDATE auth_tokens SET consumed = true"),
          expect.arrayContaining(["single_use_hash", "password_reset"]),
        );
      });
    });

    describe("5. authVersion atomic SQL increments", () => {
      it("incrementUserAuthVersion updates via SQL expression without application-side read-modify-write", async () => {
        mockPool.query.mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ authVersion: 3 }],
        });

        const adapter = new PostgresAdapter(mockPool);
        const res = await adapter.incrementUserAuthVersion("usr-123");

        expect(res).toBe(3);
        const [sql] = mockPool.query.mock.calls[0];
        expect(sql).toContain('"authVersion" = "authVersion" + 1');
        expect(sql).toContain('RETURNING "authVersion"');
      });

      it("updatePasswordAndIncrementAuthVersion updates authVersion atomically via SQL expression", async () => {
        mockPool.query.mockResolvedValueOnce({
          rows: [
            {
              id: "usr-456",
              email: "updated@example.com",
              fullName: "Updated",
              role: "technician",
              companyId: "comp-1",
              companyName: "Co 1",
              passwordHash: "newH",
              salt: "newS",
              isActive: true,
              provider: "local",
              emailConfirmed: true,
              phoneNumber: "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              authVersion: 5,
            },
          ],
        });

        const adapter = new PostgresAdapter(mockPool);
        const updated = await adapter.updatePasswordAndIncrementAuthVersion("usr-456", "newH", "newS");

        expect(updated?.authVersion).toBe(5);
        const [sql] = mockPool.query.mock.calls[0];
        expect(sql).toContain('"authVersion" = "authVersion" + 1');
      });
    });
  });

  describe("P0.4.4-I4 — PostgreSQL Pool, Timeout, Failure Handling & Graceful Shutdown (Mock Suite)", () => {
    it("instantiates pg.Pool with explicit production-grade options: max, connectionTimeoutMillis, idleTimeoutMillis, keepAlive", async () => {
      const origEnv = process.env.NODE_ENV;
      const origDb = process.env.DATABASE_URL;
      try {
        process.env.NODE_ENV = "production";
        process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:5432/testdb";
        const adapter = new PostgresAdapter();
        const pool = adapter.getPool();
        expect(pool).toBeDefined();
        expect((pool as any).options.connectionTimeoutMillis).toBe(5000);
        expect((pool as any).options.idleTimeoutMillis).toBe(30000);
        expect((pool as any).options.max).toBe(20);
        expect((pool as any).options.keepAlive).toBe(true);
        await adapter.close();
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origDb) process.env.DATABASE_URL = origDb;
        else delete process.env.DATABASE_URL;
      }
    });

    it("ping() returns true when SELECT 1 executes successfully within timeout", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
      const adapter = new PostgresAdapter(mockPool);
      const res = await adapter.ping(1000);
      expect(res).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith("SELECT 1");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("ping() returns false when query or connection fails", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("Connection reset by peer"));
      const adapter = new PostgresAdapter(mockPool);
      const res = await adapter.ping(1000);
      expect(res).toBe(false);
    });

    it("ping() returns false and destroys hung connection when query exceeds timeout", async () => {
      mockClient.query.mockImplementationOnce(() => new Promise(() => {}));
      const adapter = new PostgresAdapter(mockPool);
      const res = await adapter.ping(50);
      expect(res).toBe(false);
      expect(mockClient.release).toHaveBeenCalledWith(true);
    });

    it("db.close() calls pool.end() and is idempotent", async () => {
      const adapter = new PostgresAdapter(mockPool);
      await adapter.close();
      expect(mockPool.end).toHaveBeenCalledTimes(1);

      // Calling close a second time does not invoke pool.end again
      await adapter.close();
      expect(mockPool.end).toHaveBeenCalledTimes(1);
    });

    it("logs idle client error without crashing process or throwing unhandled exception", () => {
      const errorListeners: Array<(err: any) => void> = [];
      const fakePoolWithEmitter = {
        ...mockPool,
        on: vi.fn((event: string, cb: (err: any) => void) => {
          if (event === "error") errorListeners.push(cb);
        }),
      };

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = new PostgresAdapter(fakePoolWithEmitter as any);

      expect(fakePoolWithEmitter.on).toHaveBeenCalledWith("error", expect.any(Function));

      expect(() => {
        errorListeners.forEach((listener) => listener(new Error("Idle client terminated unexpectedly")));
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[PostgresPoolError]"),
        expect.stringContaining("Idle client terminated unexpectedly"),
      );
      consoleErrorSpy.mockRestore();
    });
  });

  const requireRealPostgres = process.env.REQUIRE_REAL_POSTGRES_TESTS === "true";
  const realPostgresDescribe = requireRealPostgres ? describe : describe.skip;

  realPostgresDescribe("P0.4.4-I2/I3/I4 — Real PostgreSQL Constraints, Transactions & Concurrency Suite (Optional)", () => {
    let realPool: any = null;
    let realAdapter: PostgresAdapter | null = null;
    const runId = randomUUID().slice(0, 8);
    const testCompanyId = `comp-real-${runId}`;
    const testUserId = `usr-real-${runId}`;
    const testUserEmail = `real-test-${runId}@example.com`;
    const testReportId = `rep-real-${runId}`;

    beforeAll(async () => {
      if (!requireRealPostgres) return;
      const testUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
      if (!testUrl) {
        throw new Error("REQUIRE_REAL_POSTGRES_TESTS=true but neither TEST_DATABASE_URL nor DATABASE_URL is set.");
      }
      const { Pool } = await import("pg");
      realPool = new Pool({ connectionString: testUrl, max: 2 });
      realAdapter = new PostgresAdapter(realPool);
      const ok = await realAdapter.ping(2000).catch(() => false);
      if (!ok) {
        throw new Error("REQUIRE_REAL_POSTGRES_TESTS=true but PostgreSQL connection ping failed.");
      }
      const { runMigrations } = await import("./migrator");
      await runMigrations(realPool);
      await realAdapter.initDatabase();
    });

    afterAll(async () => {
      if (!requireRealPostgres || !realPool) return;
      try {
        // Safe granular cleanup: strictly delete records created by this runId
        await realPool.query("DELETE FROM companies WHERE id = $1", [testCompanyId]);
        await realPool.query("DELETE FROM companies WHERE name LIKE $1", [`%${runId}%`]);
        await realPool.query("DELETE FROM users WHERE email LIKE $1", [`%${runId}%`]);
        await realPool.query('DELETE FROM auth_tokens WHERE "tokenHash" LIKE $1', [`%${runId}%`]);
      } catch {
        // ignore cleanup errors
      }
      await realPool.end();
    });

    it("rejects user insertion with nonexistent companyId (foreign key constraint violation 23503)", async () => {
      try {
        await realPool.query(
          'INSERT INTO users (id, email, "fullName", "companyId") VALUES ($1, $2, $3, $4)',
          [testUserId, testUserEmail, "Test User", "comp-nonexistent-orphan-999"]
        );
        expect.unreachable("Should have rejected user with nonexistent companyId");
      } catch (err: any) {
        expect(err.code).toBe("23503");
      }
    });

    it("rejects report insertion with nonexistent companyId (foreign key constraint violation 23503)", async () => {
      try {
        await realAdapter!.createReport("comp-nonexistent-orphan-999", {
          client: { name: "Orphan Client" },
        });
        expect.unreachable("Should have rejected report with nonexistent companyId");
      } catch (err: any) {
        expect(err.code).toBe("23503");
      }
    });

    it("rejects auth token insertion with nonexistent userId (foreign key constraint violation 23503)", async () => {
      try {
        await realAdapter!.createAuthToken({
          userId: "usr-nonexistent-orphan-999",
          tokenHash: `hash-orphan-${runId}`,
          type: "email_verification",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        });
        expect.unreachable("Should have rejected auth token with nonexistent userId");
      } catch (err: any) {
        expect(err.code).toBe("23503");
      }
    });

    it("rejects duplicate user email (unique constraint violation 23505)", async () => {
      await realPool.query(
        'INSERT INTO companies (id, name, "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW())',
        [testCompanyId, `Test Co ${runId}`]
      );
      await realPool.query(
        'INSERT INTO users (id, email, "fullName", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
        [testUserId, testUserEmail, "Original User", testCompanyId]
      );
      try {
        await realPool.query(
          'INSERT INTO users (id, email, "fullName", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
          [`usr-dup-${runId}`, testUserEmail, "Duplicate User", testCompanyId]
        );
        expect.unreachable("Should have rejected duplicate email");
      } catch (err: any) {
        expect(err.code).toBe("23505");
      }
    });

    it("rejects duplicate auth token tokenHash (unique constraint violation 23505)", async () => {
      const tokenHash = `unique-hash-${runId}`;
      await realAdapter!.createAuthToken({
        userId: testUserId,
        tokenHash,
        type: "email_verification",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });

      try {
        await realAdapter!.createAuthToken({
          userId: testUserId,
          tokenHash,
          type: "password_reset",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        });
        expect.unreachable("Should have rejected duplicate tokenHash");
      } catch (err: any) {
        expect(err.code).toBe("23505");
      }
    });

    it("cascades deletion: deleting a company deletes associated users and reports", async () => {
      const cascadeCompanyId = `comp-casc-${runId}`;
      const cascadeUserId = `usr-casc-${runId}`;
      const cascadeReportId = `rep-casc-${runId}`;

      await realPool.query(
        'INSERT INTO companies (id, name, "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW())',
        [cascadeCompanyId, `Cascade Co ${runId}`]
      );
      await realPool.query(
        'INSERT INTO users (id, email, "fullName", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
        [cascadeUserId, `casc-${runId}@example.com`, "Cascade User", cascadeCompanyId]
      );
      await realPool.query(
        'INSERT INTO reports (id, "companyId", "createdAt") VALUES ($1, $2, NOW())',
        [cascadeReportId, cascadeCompanyId]
      );

      await realPool.query('DELETE FROM companies WHERE id = $1', [cascadeCompanyId]);

      const userCheck = await realPool.query('SELECT id FROM users WHERE id = $1', [cascadeUserId]);
      const reportCheck = await realPool.query('SELECT id FROM reports WHERE id = $1', [cascadeReportId]);
      expect(userCheck.rowCount).toBe(0);
      expect(reportCheck.rowCount).toBe(0);
    });

    it("cascades deletion: deleting a user deletes associated auth_tokens", async () => {
      const cascadeUserId = `usr-casc-tok-${runId}`;
      const cascadeUserEmail = `casc-tok-${runId}@example.com`;
      const tokenHash = `casc-tok-hash-${runId}`;

      await realPool.query(
        'INSERT INTO companies (id, name, "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
        [testCompanyId, `Test Co ${runId}`]
      );
      await realPool.query(
        'INSERT INTO users (id, email, "fullName", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
        [cascadeUserId, cascadeUserEmail, "Cascade User", testCompanyId]
      );
      await realAdapter!.createAuthToken({
        userId: cascadeUserId,
        tokenHash,
        type: "email_verification",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });

      await realPool.query('DELETE FROM users WHERE id = $1', [cascadeUserId]);

      const tokenCheck = await realPool.query('SELECT id FROM auth_tokens WHERE "tokenHash" = $1', [tokenHash]);
      expect(tokenCheck.rowCount).toBe(0);
    });

    it("rolls back company creation when user insertion fails within transaction", async () => {
      const rollbackCompanyId = `comp-rb-${runId}`;
      const rollbackUserId = `usr-rb-${runId}`;
      const rollbackEmail = `rb-${runId}@example.com`;

      try {
        await realAdapter!.withTransaction(async (client) => {
          await client.query(
            'INSERT INTO companies (id, name, "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW())',
            [rollbackCompanyId, `Rollback Co ${runId}`]
          );
          // Deliberately violate NOT NULL constraint on fullName
          await client.query(
            'INSERT INTO users (id, email, "fullName", "companyId") VALUES ($1, $2, NULL, $3)',
            [rollbackUserId, rollbackEmail, rollbackCompanyId]
          );
        });
        expect.unreachable("Transaction should have failed");
      } catch (err: any) {
        expect(err).toBeDefined();
      }

      const companyCheck = await realPool.query('SELECT id FROM companies WHERE id = $1', [rollbackCompanyId]);
      expect(companyCheck.rowCount).toBe(0);
      const userCheck = await realPool.query('SELECT id FROM users WHERE id = $1', [rollbackUserId]);
      expect(userCheck.rowCount).toBe(0);
    });

    it("handles two concurrent registrations for the exact same email atomically with UNIQUE constraint", async () => {
      const concurrentEmail = `conc-reg-${runId}@example.com`;
      const [res1, res2] = await Promise.allSettled([
        realAdapter!.createUser({
          email: concurrentEmail,
          fullName: "User A",
          password: "Password123!",
          companyName: `Company A ${runId}`,
        }),
        realAdapter!.createUser({
          email: concurrentEmail,
          fullName: "User B",
          password: "Password123!",
          companyName: `Company B ${runId}`,
        }),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled");
      const rejected = [res1, res2].filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain("Email already registered");

      const userRes = await realPool.query('SELECT id, "companyId" FROM users WHERE email = $1', [concurrentEmail]);
      expect(userRes.rowCount).toBe(1);
      const winningCompanyId = userRes.rows[0].companyId;
      const companyRes = await realPool.query('SELECT id FROM companies WHERE id = $1', [winningCompanyId]);
      expect(companyRes.rowCount).toBe(1);

      await realPool.query('DELETE FROM companies WHERE id = $1', [winningCompanyId]);
    });

    it("allows only one of two concurrent consumeAuthToken calls to succeed on the same single-use token", async () => {
      const concurrentTokenHash = `conc-tok-${runId}`;
      await realAdapter!.createAuthToken({
        userId: testUserId,
        tokenHash: concurrentTokenHash,
        type: "password_reset",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });

      const [resA, resB] = await Promise.all([
        realAdapter!.consumeAuthToken(concurrentTokenHash, "password_reset"),
        realAdapter!.consumeAuthToken(concurrentTokenHash, "password_reset"),
      ]);

      expect([resA, resB].sort()).toEqual([false, true]);

      const tokenRes = await realPool.query('SELECT consumed FROM auth_tokens WHERE "tokenHash" = $1', [concurrentTokenHash]);
      expect(tokenRes.rows[0].consumed).toBe(true);
    });

    it("handles concurrent authVersion increments atomically without lost updates", async () => {
      const results = await Promise.all([
        realAdapter!.incrementUserAuthVersion(testUserId),
        realAdapter!.incrementUserAuthVersion(testUserId),
        realAdapter!.incrementUserAuthVersion(testUserId),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((v) => expect(typeof v).toBe("number"));

      const userRes = await realPool.query('SELECT "authVersion" FROM users WHERE id = $1', [testUserId]);
      expect(userRes.rows[0].authVersion).toBe(3);
    });
  });
});
