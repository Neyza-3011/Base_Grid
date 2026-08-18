import { AuthTokenRecord, AuthTokenType, CompanyRecord, ReportRecord, UserRecord, UserRole } from "./types";
import { hashPassword, normalizeEmail } from "./security";
import { tokenStore } from "./token-store";
import { config, ServerConfig } from "./config";
import { IDatabaseAdapter, TransactionClient, PostgresAdapter } from "./db-postgres";

export { IDatabaseAdapter, TransactionClient, PostgresAdapter };

export class DatabaseStore implements IDatabaseAdapter {
  private users: Map<string, UserRecord> = new Map();
  private companies: Map<string, CompanyRecord> = new Map();
  private reports: Map<string, ReportRecord> = new Map();
  private authTokens: Map<string, AuthTokenRecord> = new Map();
  public tokenStore = tokenStore;

  constructor() {
    const isProd = process.env.NODE_ENV === "production" || config.NODE_ENV === "production";
    if (isProd) {
      throw new Error("CRITICAL SECURITY ERROR: DatabaseStore (in-memory) cannot be used in production. PostgreSQL adapter is required.");
    }
    this.seedInitialData();
  }

  public seedInitialData() {
    this.users.clear();
    this.companies.clear();
    this.reports.clear();
    this.authTokens.clear();
    this.tokenStore.reset();

    const now = new Date().toISOString();

    const masterCompanyId = "comp-master-001";
    const masterCompany: CompanyRecord = {
      id: masterCompanyId,
      name: config.SUPERADMIN_COMPANY_NAME,
      vatNumber: "00000000000",
      address: "Admin Network",
      defaultHourlyRate: 0,
      reportFooterNotes: "",
      stripeSubscriptionStatus: "Master",
      maxUsers: 999,
      featurePdfExport: true,
      createdAt: now,
      updatedAt: now,
    };
    this.companies.set(masterCompanyId, masterCompany);

    const { hash: saHash, salt: saSalt } = hashPassword(config.SUPERADMIN_PASSWORD);
    const superAdminUser: UserRecord = {
      id: "usr-superadmin-001",
      email: normalizeEmail(config.SUPERADMIN_EMAIL),
      fullName: "System SuperAdmin",
      role: "superadmin",
      companyId: masterCompanyId,
      companyName: masterCompany.name,
      passwordHash: saHash,
      salt: saSalt,
      isActive: true,
      provider: "local",
      emailConfirmed: true,
      phoneNumber: "+39 02 1234567",
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(superAdminUser.id, superAdminUser);

    const demoCompanyId = "comp-rossi-001";
    const demoCompany: CompanyRecord = {
      id: demoCompanyId,
      name: "Rossi Impianti Srl",
      vatNumber: "IT12345678901",
      address: "Via Milano 12, Milano",
      defaultHourlyRate: 50,
      reportFooterNotes: "Garanzia 24 mesi su tutti i lavori e materiali installati.",
      stripeSubscriptionStatus: "Attivo (Piano Team Pro)",
      maxUsers: 10,
      featurePdfExport: true,
      createdAt: now,
      updatedAt: now,
    };
    this.companies.set(demoCompanyId, demoCompany);

    const { hash: admHash, salt: admSalt } = hashPassword("Password123!");
    const adminUser: UserRecord = {
      id: "usr-rossi-admin",
      email: normalizeEmail("admin@rossi.it"),
      fullName: "Marco Rossi",
      role: "admin",
      companyId: demoCompanyId,
      companyName: demoCompany.name,
      passwordHash: admHash,
      salt: admSalt,
      isActive: true,
      provider: "local",
      emailConfirmed: true,
      phoneNumber: "+39 333 1234567",
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(adminUser.id, adminUser);

    const { hash: techHash, salt: techSalt } = hashPassword("Password123!");
    const techUser: UserRecord = {
      id: "usr-rossi-tech",
      email: normalizeEmail("tech@rossi.it"),
      fullName: "Luca Bianchi",
      role: "technician",
      companyId: demoCompanyId,
      companyName: demoCompany.name,
      passwordHash: techHash,
      salt: techSalt,
      isActive: true,
      provider: "local",
      emailConfirmed: true,
      phoneNumber: "+39 333 7654321",
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(techUser.id, techUser);
  }

  public async findUserById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user || null;
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = normalizeEmail(email);
    for (const u of this.users.values()) {
      if (u.email === normalized) {
        return u;
      }
    }
    return null;
  }

  public async createUser(params: any): Promise<{ user: UserRecord; company: CompanyRecord }> {
    const normalized = normalizeEmail(params.email);
    if (await this.findUserByEmail(normalized)) {
      throw new Error("Email already registered");
    }

    const now = new Date().toISOString();
    const companyId = `comp-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const newCompany: CompanyRecord = {
      id: companyId,
      name: params.companyName.trim() || "Azienda Senza Nome",
      vatNumber: "",
      address: "",
      defaultHourlyRate: 45,
      reportFooterNotes: "",
      stripeSubscriptionStatus: "Attivo (Piano Base)",
      maxUsers: 5,
      featurePdfExport: true,
      createdAt: now,
      updatedAt: now,
    };
    this.companies.set(companyId, newCompany);

    const { hash, salt } = hashPassword(params.password);
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
    this.users.set(userId, newUser);

    return { user: newUser, company: newCompany };
  }

  public async createGoogleUser(params: any): Promise<{ user: UserRecord; company: CompanyRecord }> {
    const normalized = normalizeEmail(params.email);
    const existing = await this.findUserByEmail(normalized);
    if (existing) {
      const company = await this.findCompanyById(existing.companyId);
      return { user: existing, company: company! };
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
      reportFooterNotes: "",
      stripeSubscriptionStatus: "Attivo (Piano Google OAuth)",
      maxUsers: 5,
      featurePdfExport: true,
      createdAt: now,
      updatedAt: now,
    };
    this.companies.set(companyId, newCompany);

    const { hash, salt } = hashPassword(Math.random().toString(36) + Date.now().toString());
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
    this.users.set(userId, newUser);

    return { user: newUser, company: newCompany };
  }

  public async updateUser(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updated: UserRecord = {
      ...user,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.users.set(id, updated);
    return updated;
  }

  public async findCompanyById(id: string): Promise<CompanyRecord | null> {
    return this.companies.get(id) || null;
  }

  public async updateCompany(id: string, updates: Partial<CompanyRecord>): Promise<CompanyRecord | null> {
    const company = this.companies.get(id);
    if (!company) return null;

    const updated: CompanyRecord = {
      ...company,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.companies.set(id, updated);
    return updated;
  }

  public async getAllTenants(): Promise<CompanyRecord[]> {
    return Array.from(this.companies.values());
  }

  public async getReportsByCompany(companyId: string, limit: number = 100): Promise<ReportRecord[]> {
    const list: ReportRecord[] = [];
    for (const r of this.reports.values()) {
      if (r.companyId === companyId) {
        list.push(r);
      }
    }
    return list.slice(0, limit);
  }

  public async createReport(companyId: string, data: Partial<ReportRecord>): Promise<ReportRecord> {
    const now = new Date().toISOString();
    const id = data.id || `REP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const newReport: ReportRecord = {
      id,
      companyId,
      date: data.date || new Date().toLocaleDateString("it-IT"),
      time: data.time || new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
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

    this.reports.set(id, newReport);
    return newReport;
  }

  public async deleteReport(companyId: string, reportId: string): Promise<boolean> {
    const report = this.reports.get(reportId);
    if (!report || report.companyId !== companyId) {
      return false;
    }
    return this.reports.delete(reportId);
  }

  public async getGlobalStats(): Promise<any> {
    return {
      total_tenants: this.companies.size,
      total_users: this.users.size,
      total_reports: this.reports.size,
      total_clients: 42,
      sandbox_mode_active: false,
      system_status: "Operational · 100% Zero-Trust Active (In-Memory)",
    };
  }

  public async withTransaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    return callback({});
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
    this.authTokens.set(tokenRecord.tokenHash, tokenRecord);
    return tokenRecord;
  }

  public async findAuthTokenByHash(tokenHash: string, type: AuthTokenType): Promise<AuthTokenRecord | null> {
    const token = this.authTokens.get(tokenHash);
    if (!token || token.type !== type) return null;
    return token;
  }

  public async consumeAuthToken(tokenHash: string, type: AuthTokenType): Promise<boolean> {
    const token = this.authTokens.get(tokenHash);
    if (!token || token.type !== type || token.consumed) return false;
    token.consumed = true;
    token.consumedAt = new Date().toISOString();
    this.authTokens.set(tokenHash, token);
    return true;
  }

  public async verifyEmailWithToken(tokenHash: string): Promise<{ success: boolean; userId?: string; error?: string }> {
    const token = this.authTokens.get(tokenHash);
    if (!token || token.type !== "email_verification") {
      return { success: false, error: "invalid_token" };
    }
    if (token.consumed) {
      return { success: false, error: "already_used" };
    }
    const expiresAt = new Date(token.expiresAt).getTime();
    if (Date.now() > expiresAt) {
      return { success: false, error: "expired_token" };
    }

    token.consumed = true;
    token.consumedAt = new Date().toISOString();
    this.authTokens.set(tokenHash, token);

    const user = this.users.get(token.userId);
    if (user) {
      user.emailConfirmed = true;
      user.updatedAt = new Date().toISOString();
      this.users.set(user.id, user);
    }

    return { success: true, userId: token.userId };
  }

  public async resetPasswordWithToken(
    tokenHash: string,
    newPasswordHash: string,
    newSalt: string,
  ): Promise<{ success: boolean; userId?: string; error?: string }> {
    const token = this.authTokens.get(tokenHash);
    if (!token || token.type !== "password_reset") {
      return { success: false, error: "invalid_token" };
    }
    if (token.consumed) {
      return { success: false, error: "already_used" };
    }
    const expiresAt = new Date(token.expiresAt).getTime();
    if (Date.now() > expiresAt) {
      return { success: false, error: "expired_token" };
    }

    token.consumed = true;
    token.consumedAt = new Date().toISOString();
    this.authTokens.set(tokenHash, token);

    const user = this.users.get(token.userId);
    if (user) {
      user.passwordHash = newPasswordHash;
      user.salt = newSalt;
      user.updatedAt = new Date().toISOString();
      this.users.set(user.id, user);
    }

    return { success: true, userId: token.userId };
  }

  public async revokeActiveAuthTokens(userId: string, type: AuthTokenType): Promise<void> {
    for (const [hash, tok] of this.authTokens.entries()) {
      if (tok.userId === userId && tok.type === type && !tok.consumed) {
        tok.consumed = true;
        tok.consumedAt = new Date().toISOString();
        this.authTokens.set(hash, tok);
      }
    }
  }
}

/**
 * Database Provider Factory:
 * Strictly selects PostgresAdapter in production and DatabaseStore in development/test.
 */
export function createDatabaseAdapter(envConfig: ServerConfig = config): IDatabaseAdapter {
  const isProd = process.env.NODE_ENV === "production" || envConfig.NODE_ENV === "production";
  if (isProd) {
    return new PostgresAdapter();
  }
  return new DatabaseStore();
}

export const db: IDatabaseAdapter = createDatabaseAdapter();
