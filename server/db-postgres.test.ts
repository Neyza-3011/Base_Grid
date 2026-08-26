import { describe, it, expect, vi, beforeEach } from "vitest";
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

  it("initDatabase creates necessary tables with correct schema and indices", async () => {
    const adapter = new PostgresAdapter(mockPool);
    await adapter.initDatabase();

    expect(mockPool.query).toHaveBeenCalled();
    const queryArg = mockPool.query.mock.calls[0][0];
    expect(queryArg).toContain("CREATE TABLE IF NOT EXISTS companies");
    expect(queryArg).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(queryArg).toContain("CREATE TABLE IF NOT EXISTS reports");
    expect(queryArg).toContain("CREATE INDEX IF NOT EXISTS idx_users_email");
    expect(queryArg).toContain("CREATE INDEX IF NOT EXISTS idx_reports_company_id");
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
      const adapter = new PostgresAdapter(mockPool);
      await adapter.initDatabase();

      const queryArg = mockPool.query.mock.calls[0][0];
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

    it("updatePasswordAndIncrementAuthVersion executes a single parameterized atomic UPDATE and returns mapped user (P0.4.4-B.2)", async () => {
      const fakeUpdatedUserRow = {
        id: "usr-pwd-1",
        email: "atomic@example.com",
        fullName: "Atomic User",
        role: "admin",
        companyId: "comp-1",
        companyName: "Atomic Co",
        passwordHash: "new-hash-xyz",
        salt: "new-salt-123",
        isActive: true,
        provider: "local",
        emailConfirmed: true,
        phoneNumber: "",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
        authVersion: 3,
      };

      mockPool.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [fakeUpdatedUserRow],
      });

      const adapter = new PostgresAdapter(mockPool);
      const result = await adapter.updatePasswordAndIncrementAuthVersion(
        "usr-pwd-1",
        "new-hash-xyz",
        "new-salt-123"
      );

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockPool.query.mock.calls[0];
      expect(sql).toContain('UPDATE users');
      expect(sql).toContain('"passwordHash" = $1');
      expect(sql).toContain('salt = $2');
      expect(sql).toContain('"authVersion" = "authVersion" + 1');
      expect(sql).toContain('"updatedAt" = $3');
      expect(sql).toContain('WHERE id = $4');
      expect(sql).toContain('RETURNING *');
      expect(params).toEqual(["new-hash-xyz", "new-salt-123", expect.any(String), "usr-pwd-1"]);

      expect(result).not.toBeNull();
      expect(result?.passwordHash).toBe("new-hash-xyz");
      expect(result?.salt).toBe("new-salt-123");
      expect(result?.authVersion).toBe(3);
    });

    it("updatePasswordAndIncrementAuthVersion returns null when user does not exist", async () => {
      mockPool.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      const adapter = new PostgresAdapter(mockPool);
      const result = await adapter.updatePasswordAndIncrementAuthVersion(
        "usr-nonexistent",
        "hash",
        "salt"
      );

      expect(result).toBeNull();
    });

    it("updatePasswordAndIncrementAuthVersion propagates DB errors on failure", async () => {
      mockPool.query.mockRejectedValueOnce(new Error("Connection reset by peer"));

      const adapter = new PostgresAdapter(mockPool);
      await expect(
        adapter.updatePasswordAndIncrementAuthVersion("usr-pwd-1", "hash", "salt")
      ).rejects.toThrow("Connection reset by peer");
    });
  });
});
