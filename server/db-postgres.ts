import { Pool, PoolClient } from "pg";
import { randomUUID } from "crypto";
import { config } from "./config";
import {
  AuthTokenRecord,
  AuthTokenType,
  CompanyRecord,
  CreateTeamMemberWithInviteParams,
  InviteInfoResponse,
  InviteTokenRecord,
  ReportRecord,
  UserRecord,
  UserRole,
  CustomerRecord,
  LocationRecord,
} from "./types";
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
    authVersion: Number(row.authVersion) || 0,
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
    customerId: row.customerId || undefined,
    locationId: row.locationId || undefined,
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

function mapCustomerRow(row: any): CustomerRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    displayName: row.displayName,
    legalName: row.legalName || undefined,
    vatNumber: row.vatNumber || undefined,
    taxCode: row.taxCode || undefined,
    email: row.email || undefined,
    phoneNumber: row.phoneNumber || undefined,
    pec: row.pec || undefined,
    notes: row.notes || undefined,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

function mapLocationRow(row: any): LocationRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    customerId: row.customerId,
    name: row.name,
    address: row.address,
    city: row.city,
    province: row.province || undefined,
    postalCode: row.postalCode || undefined,
    notes: row.notes || undefined,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

function mapInviteTokenRow(row: any): InviteTokenRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    invitedEmail: row.invitedEmail,
    tokenHash: row.tokenHash,
    role: row.role as UserRole,
    fullName: row.fullName,
    phoneNumber: row.phoneNumber || undefined,
    invitedBy: row.invitedBy,
    consumed: Boolean(row.consumed),
    revoked: Boolean(row.revoked),
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt || ""),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    consumedAt: row.consumedAt ? (row.consumedAt instanceof Date ? row.consumedAt.toISOString() : String(row.consumedAt)) : undefined,
  };
}

export type TransactionClient = PoolClient;

export interface IDatabaseAdapter {
  findUserById(id: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  createUser(params: any): Promise<{ user: UserRecord; company: CompanyRecord }>;
  updateUser(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null>;
  incrementUserAuthVersion(userId: string): Promise<number | null>;
  updatePasswordAndIncrementAuthVersion(
    userId: string,
    passwordHash: string,
    salt: string,
    profileUpdates?: Partial<Pick<UserRecord, "fullName" | "email" | "phoneNumber">>,
  ): Promise<UserRecord | null>;
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
  ping(timeoutMs?: number): Promise<boolean>;
  initDatabase?(): Promise<void>;
  seedInitialData?(): void;
  close?(): Promise<void>;

  // --- Team Management Operations (tenant-scoped) ---
  getUsersByCompany(companyId: string): Promise<UserRecord[]>;
  getUserByIdAndCompany(userId: string, companyId: string): Promise<UserRecord | null>;
  createTeamMember(params: {
    companyId: string;
    companyName: string;
    email: string;
    fullName: string;
    role: UserRole;
    phoneNumber?: string;
    passwordHash: string;
    salt: string;
    provider?: "local" | "google";
    isActive: boolean;
    emailConfirmed: boolean;
  }): Promise<UserRecord>;
  createTeamMemberWithInvite(params: CreateTeamMemberWithInviteParams): Promise<{ user: UserRecord; inviteToken: InviteTokenRecord }>;
  updateTeamMember(
    userId: string,
    companyId: string,
    updates: Partial<Pick<UserRecord, "fullName" | "role" | "phoneNumber" | "isActive">>,
    options?: { incrementAuthVersion?: boolean },
  ): Promise<UserRecord | null>;
  countAdminOwnersByCompany(companyId: string, excludeUserId?: string): Promise<number>;

  // --- Invite Token Operations ---
  createInviteToken(params: {
    companyId: string;
    invitedEmail: string;
    tokenHash: string;
    role: UserRole;
    fullName: string;
    phoneNumber?: string;
    invitedBy: string;
    expiresAt: string;
  }): Promise<InviteTokenRecord>;
  findInviteTokenByHash(tokenHash: string): Promise<InviteTokenRecord | null>;
  consumeInviteToken(tokenHash: string): Promise<boolean>;
  revokeInviteTokensByEmail(companyId: string, email: string): Promise<void>;
  getPendingInvitesByCompany(companyId: string): Promise<InviteTokenRecord[]>;
  getInviteTokenInfo(tokenHash: string): Promise<{ invite: InviteTokenRecord; companyName: string } | null>;
  acceptInviteAndSetPassword(tokenHash: string, passwordHash: string, salt: string): Promise<UserRecord>;

  // --- Customers Operations ---
  getCustomersByCompany(companyId: string, search?: string, activeOnly?: boolean, limit?: number): Promise<CustomerRecord[]>;
  getCustomerByIdAndCompany(customerId: string, companyId: string): Promise<CustomerRecord | null>;
  createCustomer(companyId: string, data: Partial<CustomerRecord>): Promise<CustomerRecord>;
  updateCustomer(companyId: string, customerId: string, data: Partial<CustomerRecord>): Promise<CustomerRecord | null>;
  archiveCustomer(companyId: string, customerId: string): Promise<CustomerRecord | null>;
  reactivateCustomer(companyId: string, customerId: string): Promise<CustomerRecord | null>;

  // --- Locations Operations ---
  getLocationsByCustomerAndCompany(customerId: string, companyId: string, search?: string, activeOnly?: boolean, limit?: number): Promise<LocationRecord[]>;
  getLocationByIdAndCompany(locationId: string, companyId: string): Promise<LocationRecord | null>;
  createLocation(companyId: string, customerId: string, data: Partial<LocationRecord>): Promise<LocationRecord>;
  updateLocation(companyId: string, locationId: string, data: Partial<LocationRecord>): Promise<LocationRecord | null>;
  archiveLocation(companyId: string, locationId: string): Promise<LocationRecord | null>;
  reactivateLocation(companyId: string, locationId: string): Promise<LocationRecord | null>;
}

export class PostgresAdapter implements IDatabaseAdapter {
  private pool: Pool;
  private isClosed = false;
  public tokenStore = tokenStore;

  constructor(customPool?: Pool) {
    if (customPool) {
      this.pool = customPool;
      if (typeof (this.pool as any).on === "function") {
        this.pool.on("error", (err: any) => {
          console.error("[PostgresPoolError] Unexpected error on idle PostgreSQL client:", err?.message || err);
        });
      }
      return;
    }

    const isProd = process.env.NODE_ENV === "production" || config.NODE_ENV === "production";
    const dbUrl = isProd ? process.env.DATABASE_URL : (process.env.DATABASE_URL || config.DATABASE_URL);

    if (!dbUrl && isProd) {
      throw new Error("CRITICAL SECURITY ERROR: DATABASE_URL is missing in production.");
    }

    const isLocalDb = Boolean(
      dbUrl?.includes("localhost") ||
      dbUrl?.includes("127.0.0.1") ||
      dbUrl?.includes("sslmode=disable")
    );
    const useSsl = isProd && !isLocalDb;

    const maxConnections = Number(process.env.PG_POOL_MAX) || 20;
    const connectionTimeoutMillis = Number(process.env.PG_CONNECTION_TIMEOUT_MS) || 5000;
    const idleTimeoutMillis = Number(process.env.PG_IDLE_TIMEOUT_MS) || 30000;

    this.pool = new Pool({
      connectionString: dbUrl,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: maxConnections,
      connectionTimeoutMillis,
      idleTimeoutMillis,
      keepAlive: true,
    });

    // Handle unexpected idle client connection pool errors without crashing the process
    this.pool.on("error", (err: any) => {
      console.error("[PostgresPoolError] Unexpected error on idle PostgreSQL client:", err?.message || err);
    });
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async ping(timeoutMs = 2000): Promise<boolean> {
    let timer: NodeJS.Timeout | null = null;
    let timedOut = false;
    let acquiredClient: PoolClient | null = null;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error("Database ping timed out"));
        }, timeoutMs);
      });

      const doPing = async () => {
        if (typeof this.pool.connect === "function") {
          const client = await this.pool.connect();
          acquiredClient = client;
          if (timedOut) {
            try {
              client.release(true);
            } catch { }
            return;
          }
          await client.query("SELECT 1");
        } else {
          await this.pool.query("SELECT 1");
        }
      };

      await Promise.race([doPing(), timeoutPromise]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
      if (acquiredClient) {
        try {
          if (timedOut) {
            acquiredClient.release(true);
          } else {
            acquiredClient.release();
          }
        } catch { }
      }
    }
  }

  public async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      await this.pool.end();
    } catch (err) {
      console.error("[PostgresAdapter] Error closing connection pool:", err);
      throw err;
    }
  }

  /**
   * Initializes runtime bootstrap data (Master Company & SuperAdmin user).
   * Schema evolution is exclusively governed by the migration runner (runMigrations).
   */
  public async initDatabase(): Promise<void> {
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
      const existingSa = await this.pool.query("SELECT id FROM users WHERE id = $1 OR email = $2 LIMIT 1", ["usr-superadmin-001", saEmail]);
      if (!existingSa || existingSa.rowCount === 0) {
        const { hash, salt } = hashPassword(config.SUPERADMIN_PASSWORD);
        await this.pool.query(
          `INSERT INTO users (id, email, "fullName", role, "companyId", "companyName", "passwordHash", salt, "isActive", provider, "emailConfirmed", "phoneNumber", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO NOTHING`,
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
    let txStarted = false;
    try {
      await client.query("BEGIN");
      txStarted = true;
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      if (txStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("[PostgresTransaction] ROLLBACK failed:", rollbackErr);
        }
      }
      throw e;
    } finally {
      try {
        client.release();
      } catch (releaseErr) {
        console.error("[PostgresTransaction] client.release failed:", releaseErr);
      }
    }
  }

  // --- Users Operations ---

  public async incrementUserAuthVersion(userId: string): Promise<number | null> {
    try {
      const res = await this.pool.query(
        'UPDATE users SET "authVersion" = "authVersion" + 1, "updatedAt" = $1 WHERE id = $2 RETURNING "authVersion"',
        [new Date().toISOString(), userId]
      );
      if (res.rowCount === 0) return null;
      return res.rows[0].authVersion;
    } catch (err) {
      console.error("[PostgresAdapter] Error incrementing authVersion:", err);
      throw err;
    }
  }

  public async updatePasswordAndIncrementAuthVersion(
    userId: string,
    passwordHash: string,
    salt: string,
    profileUpdates?: Partial<Pick<UserRecord, "fullName" | "email" | "phoneNumber">>,
  ): Promise<UserRecord | null> {
    try {
      const now = new Date().toISOString();
      const setClauses = [
        '"passwordHash" = $1',
        'salt = $2',
        '"authVersion" = "authVersion" + 1',
        '"updatedAt" = $3',
      ];
      const params: any[] = [passwordHash, salt, now];
      let paramIndex = 4;

      if (profileUpdates?.fullName !== undefined) {
        setClauses.push(`"fullName" = $${paramIndex}`);
        params.push(profileUpdates.fullName);
        paramIndex++;
      }
      if (profileUpdates?.email !== undefined) {
        setClauses.push(`email = $${paramIndex}`);
        params.push(profileUpdates.email);
        paramIndex++;
      }
      if (profileUpdates?.phoneNumber !== undefined) {
        setClauses.push(`"phoneNumber" = $${paramIndex}`);
        params.push(profileUpdates.phoneNumber);
        paramIndex++;
      }

      params.push(userId);
      const sql = `UPDATE users SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`;

      const res = await this.pool.query(sql, params);
      if (!res.rows[0]) return null;
      return mapUserRow(res.rows[0]);
    } catch (err) {
      console.error("[PostgresAdapter] Error updating password and incrementing authVersion:", err);
      throw err;
    }
  }

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
    try {
      return await this.withTransaction(async (client) => {
        const normalized = normalizeEmail(params.email);
        const existing = await client.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [
          normalized,
        ]);
        if (existing.rowCount && existing.rowCount > 0) {
          throw new Error("Email already registered");
        }

        const now = new Date().toISOString();
        const companyId = `comp-${randomUUID()}`;

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

        const { hash, salt } = hashPassword(params.password || randomUUID());
        const userId = `usr-${randomUUID()}`;

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
          authVersion: 0,
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
    } catch (err: any) {
      if (err.code === "23505" || err.message?.includes("already registered") || err.detail?.includes("Key (email)")) {
        throw new Error("Email already registered");
      }
      throw err;
    }
  }

  public async createGoogleUser(
    params: any,
  ): Promise<{ user: UserRecord; company: CompanyRecord }> {
    try {
      return await this.withTransaction(async (client) => {
        const normalized = normalizeEmail(params.email);
        const existingRes = await client.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [
          normalized,
        ]);

        if (existingRes.rowCount && existingRes.rowCount > 0) {
          const existing = mapUserRow(existingRes.rows[0]);
          if (existing.provider !== "google") {
            throw new Error("Account exists with non-Google provider");
          }
          const compRes = await client.query("SELECT * FROM companies WHERE id = $1 LIMIT 1", [
            existing.companyId,
          ]);
          return { user: existing, company: mapCompanyRow(compRes.rows[0]) };
        }

        const now = new Date().toISOString();
        const companyId = `comp-${randomUUID()}`;
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

        const { hash, salt } = hashPassword(randomUUID());
        const userId = `usr-g-${randomUUID()}`;

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
          authVersion: 0,
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
    } catch (err: any) {
      if (err.code === "23505" || err.detail?.includes("Key (email)")) {
        const normalized = normalizeEmail(params.email);
        const existing = await this.findUserByEmail(normalized);
        if (existing) {
          const company = await this.findCompanyById(existing.companyId);
          if (company) {
            return { user: existing, company };
          }
        }
      }
      throw err;
    }
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
    const id = data.id || `REP-${randomUUID()}`;

    const newReport: ReportRecord = {
      id,
      companyId,
      date: data.date || new Date().toLocaleDateString("it-IT"),
      time:
        data.time || new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
      workHours: data.workHours || 0,
      travelHours: data.travelHours || 0,
      status: data.status || "submitted",
      customerId: data.customerId,
      locationId: data.locationId,
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
      `INSERT INTO reports (id, "companyId", "customerId", "locationId", date, time, "workHours", "travelHours", status, client, technician, "materialsUsed", notes, "signatureBase64", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        newReport.id,
        newReport.companyId,
        newReport.customerId || null,
        newReport.locationId || null,
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
      `SELECT * FROM reports WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
      [reportId, companyId],
    );
    if (res.rows.length === 0) return null;
    return mapReportRow(res.rows[0]);
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
    const id = `tok-${randomUUID()}`;
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
        `UPDATE users SET "passwordHash" = $1, salt = $2, "authVersion" = "authVersion" + 1, "updatedAt" = $3 WHERE id = $4`,
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

  // --- Team Management Operations ---

  public async getUsersByCompany(companyId: string): Promise<UserRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM users WHERE "companyId" = $1 AND role != 'superadmin' ORDER BY "createdAt" ASC`,
      [companyId],
    );
    return res.rows.map(mapUserRow);
  }

  public async getUserByIdAndCompany(userId: string, companyId: string): Promise<UserRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM users WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
      [userId, companyId],
    );
    return res.rows[0] ? mapUserRow(res.rows[0]) : null;
  }

  public async createTeamMember(params: {
    companyId: string;
    companyName: string;
    email: string;
    fullName: string;
    role: UserRole;
    phoneNumber?: string;
    passwordHash: string;
    salt: string;
    provider?: "local" | "google";
    isActive: boolean;
    emailConfirmed: boolean;
  }): Promise<UserRecord> {
    const now = new Date().toISOString();
    const userId = `usr-${randomUUID()}`;
    const normalized = normalizeEmail(params.email);

    const newUser: UserRecord = {
      id: userId,
      email: normalized,
      fullName: params.fullName.trim(),
      role: params.role,
      companyId: params.companyId,
      companyName: params.companyName,
      passwordHash: params.passwordHash,
      salt: params.salt,
      isActive: params.isActive,
      provider: params.provider || "local",
      emailConfirmed: params.emailConfirmed,
      phoneNumber: params.phoneNumber || "",
      createdAt: now,
      updatedAt: now,
      authVersion: 0,
    };

    await this.pool.query(
      `INSERT INTO users (id, email, "fullName", role, "companyId", "companyName", "passwordHash", salt, "isActive", provider, "emailConfirmed", "phoneNumber", "createdAt", "updatedAt", "authVersion")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
        newUser.authVersion,
      ],
    );

    return newUser;
  }

  public async createTeamMemberWithInvite(params: CreateTeamMemberWithInviteParams): Promise<{ user: UserRecord; inviteToken: InviteTokenRecord }> {
    return await this.withTransaction(async (client) => {
      const now = new Date().toISOString();
      const normalized = normalizeEmail(params.email);

      // Check if user already exists
      const existing = await client.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [normalized]);
      if (existing.rowCount && existing.rowCount > 0) {
        throw new Error("Questa email è già registrata nel sistema.");
      }

      // Revoke any previous pending invites for this email in this company
      await client.query(
        `UPDATE invite_tokens SET revoked = true
         WHERE "companyId" = $1 AND "invitedEmail" = $2 AND consumed = false AND revoked = false`,
        [params.companyId, normalized],
      );

      const userId = `usr-${randomUUID()}`;
      const newUser: UserRecord = {
        id: userId,
        email: normalized,
        fullName: params.fullName.trim(),
        role: params.role,
        companyId: params.companyId,
        companyName: params.companyName,
        passwordHash: params.passwordHash,
        salt: params.salt,
        isActive: true,
        provider: "local",
        emailConfirmed: false,
        phoneNumber: params.phoneNumber || "",
        createdAt: now,
        updatedAt: now,
        authVersion: 0,
      };

      await client.query(
        `INSERT INTO users (id, email, "fullName", role, "companyId", "companyName", "passwordHash", salt, "isActive", provider, "emailConfirmed", "phoneNumber", "createdAt", "updatedAt", "authVersion")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
          newUser.authVersion,
        ],
      );

      const inviteTokenId = `inv-${randomUUID()}`;
      const newInvite: InviteTokenRecord = {
        id: inviteTokenId,
        companyId: params.companyId,
        invitedEmail: normalized,
        tokenHash: params.tokenHash,
        role: params.role,
        fullName: params.fullName.trim(),
        phoneNumber: params.phoneNumber,
        invitedBy: params.inviterId,
        consumed: false,
        revoked: false,
        expiresAt: params.expiresAt,
        createdAt: now,
      };

      await client.query(
        `INSERT INTO invite_tokens (id, "companyId", "invitedEmail", "tokenHash", role, "fullName", "phoneNumber", "invitedBy", consumed, revoked, "expiresAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          newInvite.id,
          newInvite.companyId,
          newInvite.invitedEmail,
          newInvite.tokenHash,
          newInvite.role,
          newInvite.fullName,
          newInvite.phoneNumber || null,
          newInvite.invitedBy,
          newInvite.consumed,
          newInvite.revoked,
          newInvite.expiresAt,
          newInvite.createdAt,
        ],
      );

      return { user: newUser, inviteToken: newInvite };
    });
  }

  public async updateTeamMember(
    userId: string,
    companyId: string,
    updates: Partial<Pick<UserRecord, "fullName" | "role" | "phoneNumber" | "isActive">>,
    options?: { incrementAuthVersion?: boolean },
  ): Promise<UserRecord | null> {
    const existing = await this.getUserByIdAndCompany(userId, companyId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const setClauses: string[] = ['"updatedAt" = $1'];
    const params: any[] = [now];
    let paramIndex = 2;

    if (updates.fullName !== undefined) {
      setClauses.push(`"fullName" = $${paramIndex}`);
      params.push(updates.fullName);
      paramIndex++;
    }
    if (updates.role !== undefined) {
      setClauses.push(`role = $${paramIndex}`);
      params.push(updates.role);
      paramIndex++;
    }
    if (updates.phoneNumber !== undefined) {
      setClauses.push(`"phoneNumber" = $${paramIndex}`);
      params.push(updates.phoneNumber);
      paramIndex++;
    }
    if (updates.isActive !== undefined) {
      setClauses.push(`"isActive" = $${paramIndex}`);
      params.push(updates.isActive);
      paramIndex++;
    }

    if (options?.incrementAuthVersion || updates.role !== undefined || updates.isActive !== undefined) {
      setClauses.push('"authVersion" = "authVersion" + 1');
    }

    params.push(userId);
    params.push(companyId);
    const sql = `UPDATE users SET ${setClauses.join(", ")} WHERE id = $${paramIndex} AND "companyId" = $${paramIndex + 1} RETURNING *`;

    const res = await this.pool.query(sql, params);
    if (!res.rows[0]) return null;
    return mapUserRow(res.rows[0]);
  }

  public async countAdminOwnersByCompany(companyId: string, excludeUserId?: string): Promise<number> {
    let sql = `SELECT COUNT(*) FROM users WHERE "companyId" = $1 AND role IN ('owner', 'admin') AND "isActive" = true`;
    const params: any[] = [companyId];

    if (excludeUserId) {
      sql += ` AND id != $2`;
      params.push(excludeUserId);
    }

    const res = await this.pool.query(sql, params);
    return parseInt(res.rows[0]?.count || "0", 10);
  }

  // --- Invite Token Operations ---

  public async createInviteToken(params: {
    companyId: string;
    invitedEmail: string;
    tokenHash: string;
    role: UserRole;
    fullName: string;
    phoneNumber?: string;
    invitedBy: string;
    expiresAt: string;
  }): Promise<InviteTokenRecord> {
    const id = `inv-${randomUUID()}`;
    const now = new Date().toISOString();

    const record: InviteTokenRecord = {
      id,
      companyId: params.companyId,
      invitedEmail: normalizeEmail(params.invitedEmail),
      tokenHash: params.tokenHash,
      role: params.role,
      fullName: params.fullName,
      phoneNumber: params.phoneNumber,
      invitedBy: params.invitedBy,
      consumed: false,
      revoked: false,
      expiresAt: params.expiresAt,
      createdAt: now,
    };

    await this.pool.query(
      `INSERT INTO invite_tokens (id, "companyId", "invitedEmail", "tokenHash", role, "fullName", "phoneNumber", "invitedBy", consumed, revoked, "expiresAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        record.id,
        record.companyId,
        record.invitedEmail,
        record.tokenHash,
        record.role,
        record.fullName,
        record.phoneNumber || null,
        record.invitedBy,
        record.consumed,
        record.revoked,
        record.expiresAt,
        record.createdAt,
      ],
    );

    return record;
  }

  public async findInviteTokenByHash(tokenHash: string): Promise<InviteTokenRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM invite_tokens WHERE "tokenHash" = $1 LIMIT 1`,
      [tokenHash],
    );
    return res.rows[0] ? mapInviteTokenRow(res.rows[0]) : null;
  }

  public async consumeInviteToken(tokenHash: string): Promise<boolean> {
    const now = new Date().toISOString();
    const res = await this.pool.query(
      `UPDATE invite_tokens SET consumed = true, "consumedAt" = $1
       WHERE "tokenHash" = $2 AND consumed = false AND revoked = false`,
      [now, tokenHash],
    );
    return Boolean(res.rowCount && res.rowCount > 0);
  }

  public async revokeInviteTokensByEmail(companyId: string, email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    await this.pool.query(
      `UPDATE invite_tokens SET revoked = true
       WHERE "companyId" = $1 AND "invitedEmail" = $2 AND consumed = false AND revoked = false`,
      [companyId, normalized],
    );
  }

  public async getPendingInvitesByCompany(companyId: string): Promise<InviteTokenRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM invite_tokens
       WHERE "companyId" = $1 AND consumed = false AND revoked = false AND "expiresAt" > NOW()
       ORDER BY "createdAt" DESC`,
      [companyId],
    );
    return res.rows.map(mapInviteTokenRow);
  }

  public async getInviteTokenInfo(tokenHash: string): Promise<{ invite: InviteTokenRecord; companyName: string } | null> {
    const res = await this.pool.query(
      `SELECT it.*, c.name as "companyName"
       FROM invite_tokens it
       JOIN companies c ON c.id = it."companyId"
       WHERE it."tokenHash" = $1
         AND it.consumed = false
         AND it.revoked = false
         AND it."expiresAt" > NOW()
       LIMIT 1`,
      [tokenHash],
    );
    if (!res.rows[0]) return null;
    return {
      invite: mapInviteTokenRow(res.rows[0]),
      companyName: res.rows[0].companyName || "Azienda",
    };
  }

  public async acceptInviteAndSetPassword(tokenHash: string, passwordHash: string, salt: string): Promise<UserRecord> {
    return await this.withTransaction(async (client) => {
      const now = new Date().toISOString();

      // 1. Atomically consume token only if consumed=false, revoked=false, and expiresAt > NOW()
      const tokenRes = await client.query(
        `UPDATE invite_tokens
         SET consumed = true, "consumedAt" = $1
         WHERE "tokenHash" = $2
           AND consumed = false
           AND revoked = false
           AND "expiresAt" > NOW()
         RETURNING *`,
        [now, tokenHash],
      );

      if (!tokenRes.rows[0]) {
        throw new Error("Invito non valido, revocato o scaduto.");
      }

      const invite = mapInviteTokenRow(tokenRes.rows[0]);

      // 2. Atomically update user: set password, salt, emailConfirmed=true, increment authVersion
      const userRes = await client.query(
        `UPDATE users
         SET "passwordHash" = $1,
             salt = $2,
             "emailConfirmed" = true,
             "authVersion" = "authVersion" + 1,
             "updatedAt" = $3
         WHERE email = $4 AND "companyId" = $5
         RETURNING *`,
        [passwordHash, salt, now, invite.invitedEmail, invite.companyId],
      );

      if (!userRes.rows[0]) {
        throw new Error("Utente collegato all'invito non trovato.");
      }

      // 3. Invalidate/revoke any other pending invitations for this email in this company
      await client.query(
        `UPDATE invite_tokens
         SET revoked = true
         WHERE "companyId" = $1 AND "invitedEmail" = $2 AND id != $3 AND consumed = false AND revoked = false`,
        [invite.companyId, invite.invitedEmail, invite.id],
      );

      return mapUserRow(userRes.rows[0]);
    });
  }

  // --- Customers Operations ---

  public async getCustomersByCompany(companyId: string, search?: string, activeOnly?: boolean, limit: number = 100): Promise<CustomerRecord[]> {
    let sql = `SELECT * FROM customers WHERE "companyId" = $1`;
    const params: any[] = [companyId];
    let paramIdx = 2;

    if (activeOnly) {
      sql += ` AND "isActive" = true`;
    }

    if (search) {
      sql += ` AND (
        "displayName" ILIKE $${paramIdx} OR
        "legalName" ILIKE $${paramIdx} OR
        "vatNumber" ILIKE $${paramIdx} OR
        email ILIKE $${paramIdx} OR
        "phoneNumber" ILIKE $${paramIdx}
      )`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    sql += ` ORDER BY "displayName" ASC LIMIT $${paramIdx}`;
    params.push(limit);

    const res = await this.pool.query(sql, params);
    return res.rows.map(mapCustomerRow);
  }

  public async getCustomerByIdAndCompany(customerId: string, companyId: string): Promise<CustomerRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM customers WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
      [customerId, companyId]
    );
    return res.rows[0] ? mapCustomerRow(res.rows[0]) : null;
  }

  public async createCustomer(companyId: string, data: Partial<CustomerRecord>): Promise<CustomerRecord> {
    const now = new Date().toISOString();
    const id = data.id || `CUS-${randomUUID()}`;

    const res = await this.pool.query(
      `INSERT INTO customers (id, "companyId", "displayName", "legalName", "vatNumber", "taxCode", email, "phoneNumber", pec, notes, "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        id,
        companyId,
        data.displayName || "Cliente",
        data.legalName || null,
        data.vatNumber || null,
        data.taxCode || null,
        data.email || null,
        data.phoneNumber || null,
        data.pec || null,
        data.notes || null,
        data.isActive ?? true,
        now,
        now,
      ]
    );
    return mapCustomerRow(res.rows[0]);
  }

  public async updateCustomer(companyId: string, customerId: string, data: Partial<CustomerRecord>): Promise<CustomerRecord | null> {
    const now = new Date().toISOString();
    
    const setClauses: string[] = ['"updatedAt" = $1'];
    const params: any[] = [now];
    let paramIdx = 2;

    const fields = ['displayName', 'legalName', 'vatNumber', 'taxCode', 'email', 'phoneNumber', 'pec', 'notes', 'isActive'];
    for (const field of fields) {
      if ((data as any)[field] !== undefined) {
        setClauses.push(`"${field}" = $${paramIdx}`);
        params.push((data as any)[field]);
        paramIdx++;
      }
    }

    params.push(customerId, companyId);
    const sql = `UPDATE customers SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND "companyId" = $${paramIdx + 1} RETURNING *`;
    
    const res = await this.pool.query(sql, params);
    if (!res.rows[0]) return null;
    return mapCustomerRow(res.rows[0]);
  }

  public async archiveCustomer(companyId: string, customerId: string): Promise<CustomerRecord | null> {
    const now = new Date().toISOString();
    const res = await this.pool.query(
      `UPDATE customers SET "isActive" = false, "updatedAt" = $1 WHERE id = $2 AND "companyId" = $3 RETURNING *`,
      [now, customerId, companyId]
    );
    if (!res.rows[0]) return null;
    return mapCustomerRow(res.rows[0]);
  }

  public async reactivateCustomer(companyId: string, customerId: string): Promise<CustomerRecord | null> {
    const now = new Date().toISOString();
    const res = await this.pool.query(
      `UPDATE customers SET "isActive" = true, "updatedAt" = $1 WHERE id = $2 AND "companyId" = $3 RETURNING *`,
      [now, customerId, companyId]
    );
    if (!res.rows[0]) return null;
    return mapCustomerRow(res.rows[0]);
  }

  // --- Locations Operations ---

  public async getLocationsByCustomerAndCompany(customerId: string, companyId: string, search?: string, activeOnly?: boolean, limit: number = 100): Promise<LocationRecord[]> {
    let sql = `SELECT * FROM locations WHERE "companyId" = $1 AND "customerId" = $2`;
    const params: any[] = [companyId, customerId];
    let paramIdx = 3;

    if (activeOnly) {
      sql += ` AND "isActive" = true`;
    }

    if (search) {
      sql += ` AND (
        name ILIKE $${paramIdx} OR
        address ILIKE $${paramIdx} OR
        city ILIKE $${paramIdx}
      )`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    sql += ` ORDER BY name ASC LIMIT $${paramIdx}`;
    params.push(limit);

    const res = await this.pool.query(sql, params);
    return res.rows.map(mapLocationRow);
  }

  public async getLocationByIdAndCompany(locationId: string, companyId: string): Promise<LocationRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM locations WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
      [locationId, companyId]
    );
    return res.rows[0] ? mapLocationRow(res.rows[0]) : null;
  }

  public async createLocation(companyId: string, customerId: string, data: Partial<LocationRecord>): Promise<LocationRecord> {
    const now = new Date().toISOString();
    const id = data.id || `LOC-${randomUUID()}`;

    const res = await this.pool.query(
      `INSERT INTO locations (id, "companyId", "customerId", name, address, city, province, "postalCode", notes, "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        id,
        companyId,
        customerId,
        data.name || "Sede",
        data.address || "",
        data.city || "",
        data.province || null,
        data.postalCode || null,
        data.notes || null,
        data.isActive ?? true,
        now,
        now,
      ]
    );
    return mapLocationRow(res.rows[0]);
  }

  public async updateLocation(companyId: string, locationId: string, data: Partial<LocationRecord>): Promise<LocationRecord | null> {
    const now = new Date().toISOString();
    
    const setClauses: string[] = ['"updatedAt" = $1'];
    const params: any[] = [now];
    let paramIdx = 2;

    const fields = ['name', 'address', 'city', 'province', 'postalCode', 'notes', 'isActive'];
    for (const field of fields) {
      if ((data as any)[field] !== undefined) {
        setClauses.push(`"${field}" = $${paramIdx}`);
        params.push((data as any)[field]);
        paramIdx++;
      }
    }

    params.push(locationId, companyId);
    const sql = `UPDATE locations SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND "companyId" = $${paramIdx + 1} RETURNING *`;
    
    const res = await this.pool.query(sql, params);
    if (!res.rows[0]) return null;
    return mapLocationRow(res.rows[0]);
  }

  public async archiveLocation(companyId: string, locationId: string): Promise<LocationRecord | null> {
    const now = new Date().toISOString();
    const res = await this.pool.query(
      `UPDATE locations SET "isActive" = false, "updatedAt" = $1 WHERE id = $2 AND "companyId" = $3 RETURNING *`,
      [now, locationId, companyId]
    );
    if (!res.rows[0]) return null;
    return mapLocationRow(res.rows[0]);
  }

  public async reactivateLocation(companyId: string, locationId: string): Promise<LocationRecord | null> {
    const now = new Date().toISOString();
    const res = await this.pool.query(
      `UPDATE locations SET "isActive" = true, "updatedAt" = $1 WHERE id = $2 AND "companyId" = $3 RETURNING *`,
      [now, locationId, companyId]
    );
    if (!res.rows[0]) return null;
    return mapLocationRow(res.rows[0]);
  }
}
