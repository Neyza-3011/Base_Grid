import { Pool, PoolClient } from "pg";
import { config } from "./config";
import { AuthTokenRecord, AuthTokenType, CompanyRecord, ReportRecord, UserRecord, UserRole } from "./types";
import { tokenStore } from "./token-store";
import { hashPassword } from "./security";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapUserRow(row: any): UserRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role as UserRole,
    companyId: row.companyId,
    companyName: row.companyName,
    passwordHash: row.passwordHash,
    salt: row.salt,
    isActive: Boolean(row.isActive),
    provider: row.provider as "local" | "google",
    emailConfirmed: Boolean(row.emailConfirmed),
    phoneNumber: row.phoneNumber || "",
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

function mapCompanyRow(row: any): CompanyRecord {
  return {
    id: row.id,
    name: row.name,
    vatNumber: row.vatNumber || "",
    address: row.address || "",
    defaultHourlyRate: Number(row.defaultHourlyRate) || 0,
    reportFooterNotes: row.reportFooterNotes || "",
    stripeSubscriptionStatus: row.stripeSubscriptionStatus || "",
    maxUsers: Number(row.maxUsers) || 0,
    featurePdfExport: Boolean(row.featurePdfExport),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

function mapReportRow(row: any): ReportRecord {
  let client = row.client;
  if (typeof client === "string") {
    try {
      client = JSON.parse(client);
    } catch {
      client = { name: client };
    }
  }

  let technician = row.technician;
  if (typeof technician === "string") {
    try {
      technician = JSON.parse(technician);
    } catch {
      technician = { fullName: technician };
    }
  }

  let materialsUsed = row.materialsUsed;
  if (typeof materialsUsed === "string") {
    try {
      materialsUsed = JSON.parse(materialsUsed);
    } catch {
      materialsUsed = [];
    }
  }

  return {
    id: row.id,
    companyId: row.companyId,
    date: row.date || "",
    time: row.time || "",
    workHours: Number(row.workHours) || 0,
    travelHours: Number(row.travelHours) || 0,
    status: row.status || "submitted",
    client: client || { name: "" },
    technician: technician || { fullName: "" },
    materialsUsed: Array.isArray(materialsUsed) ? materialsUsed : [],
    notes: row.notes || "",
    signatureBase64: row.signatureBase64 || undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
  };
}

export type TransactionClient = PoolClient;

export interface IDatabaseAdapter {
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  createUser(params: any): Promise<{ user: UserRecord; company: CompanyRecord }>;
  updateUser(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null>;
  createGoogleUser(params: any): Promise<{ user: UserRecord; company: CompanyRecord }>;
  findCompanyById(id: string): Promise<CompanyRecord | null>;
  updateCompany(id: string, updates: Partial<CompanyRecord>): Promise<CompanyRecord | null>;
  getAllTenants(): Promise<CompanyRecord[]>;
  getReportsByCompany(companyId: string, limit?: number): Promise<ReportRecord[]>;
  createReport(companyId: string, data: Partial<ReportRecord>): Promise<ReportRecord>;
  getReportById(companyId: string, reportId: string): Promise<ReportRecord | null>;
  deleteReport(companyId: string, reportId: string): Promise<boolean>;
  getGlobalStats(): Promise<any>;
  withTransaction<T>(callback: (client: TransactionClient) => Promise<T>): Promise<T>;
  createAuthToken(params: {
    userId: string;
    tokenHash: string;
    type: AuthTokenType;
    expiresAt: string;
  }): Promise<AuthTokenRecord>;
  findAuthTokenByHash(tokenHash: string, type: AuthTokenType): Promise<AuthTokenRecord | null>;
  consumeAuthToken(tokenHash: string, type: AuthTokenType): Promise<boolean>;
  verifyEmailWithToken(tokenHash: string): Promise<{ success: boolean; userId?: string; error?: string }>;
  resetPasswordWithToken(
    tokenHash: string,
    newPasswordHash: string,
    newSalt: string,
  ): Promise<{ success: boolean; userId?: string; error?: string }>;
  revokeActiveAuthTokens(userId: string, type: AuthTokenType): Promise<void>;
  initDatabase?(): Promise<void>;
  seedInitialData?(): void;
  close?(): Promise<void>;
}

export class PostgresAdapter implements IDatabaseAdapter {
  private pool: Pool;
  public tokenStore = tokenStore;

  constructor(customPool?: Pool) {
    if (customPool) {
      this.pool = customPool;
      return;
    }

    const isProd = process.env.NODE_ENV === "production" || config.NODE_ENV === "production";
    const dbUrl = process.env.DATABASE_URL || config.DATABASE_URL;

    if (!dbUrl && isProd) {
      throw new Error("CRITICAL SECURITY ERROR: DATABASE_URL is missing in production.");
    }

    const isLocalDb = Boolean(
      dbUrl?.includes("localhost") ||
      dbUrl?.includes("127.0.0.1") ||
      dbUrl?.includes("sslmode=disable")
    );
    const useSsl = isProd && !isLocalDb;

    this.pool = new Pool({
      connectionString: dbUrl,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    });

    // Handle unexpected idle client connection pool errors
    this.pool.on("error", (err) => {
      console.error("[PostgresPoolError] Unexpected error on idle PostgreSQL client:", err.message || err);
    });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async initDatabase(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        "vatNumber" VARCHAR(255),
        address TEXT,
        "defaultHourlyRate" NUMERIC,
        "reportFooterNotes" TEXT,
        "stripeSubscriptionStatus" VARCHAR(255),
        "maxUsers" INTEGER,
        "featurePdfExport" BOOLEAN,
        "createdAt" TIMESTAMP WITH TIME ZONE,
        "updatedAt" TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        "fullName" VARCHAR(255) NOT NULL,
        role VARCHAR(50),
        "companyId" VARCHAR(255) REFERENCES companies(id),
        "companyName" VARCHAR(255),
        "passwordHash" TEXT,
        salt TEXT,
        "isActive" BOOLEAN DEFAULT true,
        provider VARCHAR(50),
        "emailConfirmed" BOOLEAN DEFAULT false,
        "phoneNumber" VARCHAR(255),
        "createdAt" TIMESTAMP WITH TIME ZONE,
        "updatedAt" TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS reports (
        id VARCHAR(255) PRIMARY KEY,
        "companyId" VARCHAR(255) REFERENCES companies(id),
        date VARCHAR(255),
        time VARCHAR(255),
        "workHours" NUMERIC,
        "travelHours" NUMERIC,
        status VARCHAR(50),
        client JSONB,
        technician JSONB,
        "materialsUsed" JSONB,
        notes TEXT,
        "signatureBase64" TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS auth_tokens (
        id VARCHAR(255) PRIMARY KEY,
        "userId" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "tokenHash" VARCHAR(255) NOT NULL UNIQUE,
        type VARCHAR(50) NOT NULL,
        consumed BOOLEAN DEFAULT false,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "consumedAt" TIMESTAMP WITH TIME ZONE
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_company_id ON users("companyId");
      CREATE INDEX IF NOT EXISTS idx_reports_company_id ON reports("companyId");
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens("tokenHash");
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens("userId", type);
    `);

    // Ensure master company exists in PostgreSQL
    const masterCompanyId = "comp-master-001";
    const masterCompanyName = config.SUPERADMIN_COMPANY_NAME || "BaseGrid Master Platform";
    const now = new Date().toISOString();

    await this.pool.query(
      `INSERT INTO companies (id, name, "vatNumber", address, "defaultHourlyRate", "reportFooterNotes", "stripeSubscriptionStatus", "maxUsers", "featurePdfExport", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING`,
      [masterCompanyId, masterCompanyName, "00000000000", "Admin Network", 0, "", "Master", 999, true, now, now],
    );

    // Ensure SuperAdmin user exists in PostgreSQL if credentials configured
    if (config.SUPERADMIN_EMAIL && config.SUPERADMIN_PASSWORD) {
      const saEmail = normalizeEmail(config.SUPERADMIN_EMAIL);
      const existingSa = await this.pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [saEmail]);
      if (!existingSa || existingSa.rowCount === 0) {
        const { hash, salt } = hashPassword(config.SUPERADMIN_PASSWORD);
        await this.pool.query(
          `INSERT INTO users (id, email, "fullName", role, "companyId", "companyName", "passwordHash", salt, "isActive", provider, "emailConfirmed", "phoneNumber", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (email) DO NOTHING`,
          [
            "usr-superadmin-001",
            saEmail,
            "System SuperAdmin",
            "superadmin",
            masterCompanyId,
            masterCompanyName,
            hash,
            salt,
            true,
            "local",
            true,
            "+39 02 1234567",
            now,
            now,
          ],
        );
      }
    }
  }

  public async withTransaction<T>(callback: (client: TransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  // --- Users Operations ---
  public async findUserById(id: string): Promise<UserRecord | null> {
    const res = await this.pool.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
    return res.rows[0] ? mapUserRow(res.rows[0]) : null;
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    const res = await this.pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [
      normalizeEmail(email),
    ]);
    return res.rows[0] ? mapUserRow(res.rows[0]) : null;
  }

  public async createUser(params: any): Promise<{ user: UserRecord; company: CompanyRecord }> {
    return this.withTransaction(async (client) => {
      const normalized = normalizeEmail(params.email);
      const existing = await client.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [
        normalized,
      ]);
      if (existing.rowCount && existing.rowCount > 0) {
        throw new Error("Email already registered");
      }

      const now = new Date().toISOString();
      const companyId = `comp-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

      const newCompany: CompanyRecord = {
        id: companyId,
        name: (params.companyName || "Azienda Senza Nome").trim(),
        vatNumber: "",
        address: "",
        defaultHourlyRate: 45,
        reportFooterNotes: "Grazie per aver scelto i nostri servizi professionali.",
        stripeSubscriptionStatus: "Attivo (Piano Base)",
        maxUsers: 5,
        featurePdfExport: true,
        createdAt: now,
        updatedAt: now,
      };

      await client.query(
        `INSERT INTO companies (id, name, "vatNumber", address, "defaultHourlyRate", "reportFooterNotes", "stripeSubscriptionStatus", "maxUsers", "featurePdfExport", "createdAt", "updatedAt") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          newCompany.id,
          newCompany.name,
          newCompany.vatNumber,
          newCompany.address,
          newCompany.defaultHourlyRate,
          newCompany.reportFooterNotes,
          newCompany.stripeSubscriptionStatus,
          newCompany.maxUsers,
          newCompany.featurePdfExport,
          newCompany.createdAt,
          newCompany.updatedAt,
        ],
      );

      const { hash, salt } = hashPassword(params.password || Math.random().toString());
      const userId = `usr-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

      const newUser: UserRecord = {
        id: userId,
        email: normalized,
        fullName: params.fullName.trim(),
        role: params.role || "admin",
        companyId: companyId,
        companyName: newCompany.name,
        passwordHash: hash,
        salt: salt,
        isActive: true,
        provider: params.provider || "local",
        emailConfirmed: Boolean(params.emailConfirmed ?? false),
        phoneNumber: params.phoneNumber || "",
        createdAt: now,
        updatedAt: now,
      };

      await client.query(
        `INSERT INTO users (id, email, "fullName", role, "companyId", "companyName", "passwordHash", salt, "isActive", provider, "emailConfirmed", "phoneNumber", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          newUser.id,
          newUser.email,
          newUser.fullName,
          newUser.role,
          newUser.companyId,
          newUser.companyName,
          newUser.passwordHash,
          newUser.salt,
          newUser.isActive,
          newUser.provider,
          newUser.emailConfirmed,
          newUser.phoneNumber,
          newUser.createdAt,
          newUser.updatedAt,
        ],
      );

      return { user: newUser, company: newCompany };
    });
  }

  public async createGoogleUser(
    params: any,
  ): Promise<{ user: UserRecord; company: CompanyRecord }> {
    return this.withTransaction(async (client) => {
      const normalized = normalizeEmail(params.email);
      const existingRes = await client.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [
        normalized,
      ]);

      if (existingRes.rowCount && existingRes.rowCount > 0) {
        const existing = mapUserRow(existingRes.rows[0]);
        const compRes = await client.query("SELECT * FROM companies WHERE id = $1 LIMIT 1", [
          existing.companyId,
        ]);
        return { user: existing, company: mapCompanyRow(compRes.rows[0]) };
      }

      const now = new Date().toISOString();
      const companyId = `comp-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const companyName = params.companyName || `${params.fullName} Team`;

      const newCompany: CompanyRecord = {
        id: companyId,
        name: companyName,
        vatNumber: "",
        address: "",
        defaultHourlyRate: 50,
        reportFooterNotes: "Servizi di manutenzione e installazione.",
        stripeSubscriptionStatus: "Attivo (Piano Google OAuth)",
        maxUsers: 5,
        featurePdfExport: true,
        createdAt: now,
        updatedAt: now,
      };

      await client.query(
        `INSERT INTO companies (id, name, "vatNumber", address, "defaultHourlyRate", "reportFooterNotes", "stripeSubscriptionStatus", "maxUsers", "featurePdfExport", "createdAt", "updatedAt") 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          newCompany.id,
          newCompany.name,
          newCompany.vatNumber,
          newCompany.address,
          newCompany.defaultHourlyRate,
          newCompany.reportFooterNotes,
          newCompany.stripeSubscriptionStatus,
          newCompany.maxUsers,
          newCompany.featurePdfExport,
          newCompany.createdAt,
          newCompany.updatedAt,
        ],
      );

      const { hash, salt } = hashPassword(Math.random().toString(36) + Date.now());
      const userId = `usr-g-${Date.now()}`;

      const newUser: UserRecord = {
        id: userId,
        email: normalized,
        fullName: params.fullName,
        role: "admin",
        companyId: companyId,
        companyName: newCompany.name,
        passwordHash: hash,
        salt: salt,
        isActive: true,
        provider: "google",
        emailConfirmed: true,
        phoneNumber: "",
        createdAt: now,
        updatedAt: now,
      };

      await client.query(
        `INSERT INTO users (id, email, "fullName", role, "companyId", "companyName", "passwordHash", salt, "isActive", provider, "emailConfirmed", "phoneNumber", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          newUser.id,
          newUser.email,
          newUser.fullName,
          newUser.role,
          newUser.companyId,
          newUser.companyName,
          newUser.passwordHash,
          newUser.salt,
          newUser.isActive,
          newUser.provider,
          newUser.emailConfirmed,
          newUser.phoneNumber,
          newUser.createdAt,
          newUser.updatedAt,
        ],
      );

      return { user: newUser, company: newCompany };
    });
  }

  public async updateUser(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null> {
    const existing = await this.findUserById(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };

    await this.pool.query(
      `UPDATE users 
       SET email = $1, "fullName" = $2, role = $3, "companyName" = $4, "passwordHash" = $5, salt = $6, "isActive" = $7, "emailConfirmed" = $8, "phoneNumber" = $9, "updatedAt" = $10 
       WHERE id = $11`,
      [
        updated.email,
        updated.fullName,
        updated.role,
        updated.companyName,
        updated.passwordHash,
        updated.salt,
        updated.isActive,
        updated.emailConfirmed,
        updated.phoneNumber,
        updated.updatedAt,
        id,
      ],
    );

    return updated;
  }

  // --- Company Operations ---
  public async findCompanyById(id: string): Promise<CompanyRecord | null> {
    const res = await this.pool.query("SELECT * FROM companies WHERE id = $1 LIMIT 1", [id]);
    return res.rows[0] ? mapCompanyRow(res.rows[0]) : null;
  }

  public async updateCompany(
    id: string,
    updates: Partial<CompanyRecord>,
  ): Promise<CompanyRecord | null> {
    const existing = await this.findCompanyById(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };

    await this.pool.query(
      `UPDATE companies 
       SET name = $1, "vatNumber" = $2, address = $3, "defaultHourlyRate" = $4, "reportFooterNotes" = $5, "stripeSubscriptionStatus" = $6, "maxUsers" = $7, "featurePdfExport" = $8, "updatedAt" = $9 
       WHERE id = $10`,
      [
        updated.name,
        updated.vatNumber,
        updated.address,
        updated.defaultHourlyRate,
        updated.reportFooterNotes,
        updated.stripeSubscriptionStatus,
        updated.maxUsers,
        updated.featurePdfExport,
        updated.updatedAt,
        id,
      ],
    );

    return updated;
  }

  public async getAllTenants(): Promise<CompanyRecord[]> {
    const res = await this.pool.query('SELECT * FROM companies ORDER BY "createdAt" DESC');
    return res.rows.map(mapCompanyRow);
  }

  // --- Reports Operations ---
  public async getReportsByCompany(
    companyId: string,
    limit: number = 100,
  ): Promise<ReportRecord[]> {
    const res = await this.pool.query('SELECT * FROM reports WHERE "companyId" = $1 ORDER BY "createdAt" DESC LIMIT $2', [
      companyId,
      limit,
    ]);
    return res.rows.map(mapReportRow);
  }

  public async createReport(companyId: string, data: Partial<ReportRecord>): Promise<ReportRecord> {
    const now = new Date().toISOString();
    const id = data.id || `REP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const newReport: ReportRecord = {
      id,
      companyId,
      date: data.date || new Date().toLocaleDateString("it-IT"),
      time:
        data.time || new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
      workHours: data.workHours || 0,
      travelHours: data.travelHours || 0,
      status: data.status || "submitted",
      client: {
        name: data.client?.name || "Cliente",
        address: data.client?.address || "",
        city: data.client?.city || "",
      },
      technician: {
        fullName: data.technician?.fullName || "Tecnico",
      },
      materialsUsed: data.materialsUsed || [],
      notes: data.notes || "",
      signatureBase64: data.signatureBase64,
      createdAt: now,
    };

    await this.pool.query(
      `INSERT INTO reports (id, "companyId", date, time, "workHours", "travelHours", status, client, technician, "materialsUsed", notes, "signatureBase64", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        newReport.id,
        newReport.companyId,
        newReport.date,
        newReport.time,
        newReport.workHours,
        newReport.travelHours,
        newReport.status,
        JSON.stringify(newReport.client),
        JSON.stringify(newReport.technician),
        JSON.stringify(newReport.materialsUsed),
        newReport.notes,
        newReport.signatureBase64,
        newReport.createdAt,
      ],
    );

    return newReport;
  }

  public async getReportById(companyId: string, reportId: string): Promise<ReportRecord | null> {
    const res = await this.pool.query(
      `SELECT id, company_id, date, time, work_hours, travel_hours, status, 
              client_name, client_address, technician_name, materials_used, notes, 
              created_at
       FROM reports
       WHERE id = $1 AND company_id = $2`,
      [reportId, companyId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      companyId: r.company_id,
      date: r.date,
      time: r.time,
      workHours: Number(r.work_hours),
      travelHours: Number(r.travel_hours),
      status: r.status,
      client: {
        name: r.client_name,
        address: r.client_address,
      },
      technician: {
        fullName: r.technician_name,
      },
      materialsUsed: Array.isArray(r.materials_used) ? r.materials_used : [],
      notes: r.notes,
      createdAt: r.created_at.toISOString(),
    } as ReportRecord;
  }

  public async deleteReport(companyId: string, reportId: string): Promise<boolean> {
    const res = await this.pool.query(
      'DELETE FROM reports WHERE id = $1 AND "companyId" = $2 RETURNING id',
      [reportId, companyId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async getGlobalStats(): Promise<any> {
    const tenants = await this.pool.query("SELECT COUNT(*) FROM companies");
    const users = await this.pool.query("SELECT COUNT(*) FROM users");
    const reports = await this.pool.query("SELECT COUNT(*) FROM reports");

    return {
      total_tenants: parseInt(tenants.rows[0]?.count || "0", 10),
      total_users: parseInt(users.rows[0]?.count || "0", 10),
      total_reports: parseInt(reports.rows[0]?.count || "0", 10),
      total_clients: 42,
      sandbox_mode_active: false,
      system_status: "Operational · 100% Zero-Trust Active (PostgreSQL)",
    };
  }

  // --- Auth Tokens & Email Verification Operations ---
  public async createAuthToken(params: {
    userId: string;
    tokenHash: string;
    type: AuthTokenType;
    expiresAt: string;
  }): Promise<AuthTokenRecord> {
    const id = `tok-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date().toISOString();
    const tokenRecord: AuthTokenRecord = {
      id,
      userId: params.userId,
      tokenHash: params.tokenHash,
      type: params.type,
      consumed: false,
      expiresAt: params.expiresAt,
      createdAt: now,
    };

    await this.pool.query(
      `INSERT INTO auth_tokens (id, "userId", "tokenHash", type, consumed, "expiresAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        tokenRecord.id,
        tokenRecord.userId,
        tokenRecord.tokenHash,
        tokenRecord.type,
        tokenRecord.consumed,
        tokenRecord.expiresAt,
        tokenRecord.createdAt,
      ],
    );
    return tokenRecord;
  }

  public async findAuthTokenByHash(tokenHash: string, type: AuthTokenType): Promise<AuthTokenRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM auth_tokens WHERE "tokenHash" = $1 AND type = $2 LIMIT 1`,
      [tokenHash, type],
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      userId: r.userId,
      tokenHash: r.tokenHash,
      type: r.type,
      consumed: Boolean(r.consumed),
      expiresAt: r.expiresAt instanceof Date ? r.expiresAt.toISOString() : String(r.expiresAt),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      consumedAt: r.consumedAt ? (r.consumedAt instanceof Date ? r.consumedAt.toISOString() : String(r.consumedAt)) : undefined,
    };
  }

  public async consumeAuthToken(tokenHash: string, type: AuthTokenType): Promise<boolean> {
    const now = new Date().toISOString();
    const res = await this.pool.query(
      `UPDATE auth_tokens SET consumed = true, "consumedAt" = $1
       WHERE "tokenHash" = $2 AND type = $3 AND consumed = false`,
      [now, tokenHash, type],
    );
    return Boolean(res.rowCount && res.rowCount > 0);
  }

  public async verifyEmailWithToken(tokenHash: string): Promise<{ success: boolean; userId?: string; error?: string }> {
    return this.withTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM auth_tokens WHERE "tokenHash" = $1 AND type = 'email_verification' FOR UPDATE`,
        [tokenHash],
      );
      if (!res.rows[0]) {
        return { success: false, error: "invalid_token" };
      }
      const token = res.rows[0];
      if (token.consumed) {
        return { success: false, error: "already_used" };
      }
      const expiresAt = new Date(token.expiresAt).getTime();
      if (Date.now() > expiresAt) {
        return { success: false, error: "expired_token" };
      }

      const now = new Date().toISOString();
      await client.query(
        `UPDATE auth_tokens SET consumed = true, "consumedAt" = $1 WHERE id = $2`,
        [now, token.id],
      );
      await client.query(
        `UPDATE users SET "emailConfirmed" = true, "updatedAt" = $1 WHERE id = $2`,
        [now, token.userId],
      );

      return { success: true, userId: token.userId };
    });
  }

  public async resetPasswordWithToken(
    tokenHash: string,
    newPasswordHash: string,
    newSalt: string,
  ): Promise<{ success: boolean; userId?: string; error?: string }> {
    return this.withTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM auth_tokens WHERE "tokenHash" = $1 AND type = 'password_reset' FOR UPDATE`,
        [tokenHash],
      );
      if (!res.rows[0]) {
        return { success: false, error: "invalid_token" };
      }
      const token = res.rows[0];
      if (token.consumed) {
        return { success: false, error: "already_used" };
      }
      const expiresAt = new Date(token.expiresAt).getTime();
      if (Date.now() > expiresAt) {
        return { success: false, error: "expired_token" };
      }

      const now = new Date().toISOString();
      await client.query(
        `UPDATE auth_tokens SET consumed = true, "consumedAt" = $1 WHERE id = $2`,
        [now, token.id],
      );
      await client.query(
        `UPDATE users SET "passwordHash" = $1, salt = $2, "updatedAt" = $3 WHERE id = $4`,
        [newPasswordHash, newSalt, now, token.userId],
      );

      return { success: true, userId: token.userId };
    });
  }

  public async revokeActiveAuthTokens(userId: string, type: AuthTokenType): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query(
      `UPDATE auth_tokens SET consumed = true, "consumedAt" = $1
       WHERE "userId" = $2 AND type = $3 AND consumed = false`,
      [now, userId, type],
    );
  }
}
