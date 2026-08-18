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
      query: vi.fn(),
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

    expect(mockPool.query).toHaveBeenCalledTimes(1);
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
});
