import { randomUUID } from "crypto";
import {
  AuthTokenRecord,
  AuthTokenType,
  CompanyRecord,
  CreateTeamMemberWithInviteParams,
  InviteTokenRecord,
  ReportRecord,
  UserRecord,
  UserRole,
  CustomerRecord,
  LocationRecord,
  AssetRecord,
  AssetType,
  AssetStatus,
} from "./types";
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
  private inviteTokens: Map<string, InviteTokenRecord> = new Map();
  private customers: Map<string, CustomerRecord> = new Map();
  private locations: Map<string, LocationRecord> = new Map();
  private assets: Map<string, AssetRecord> = new Map();
  public tokenStore = tokenStore;

  constructor(allowInMemoryInProd = false) {
    const isProd =
      (process.env.NODE_ENV === "production" || config.NODE_ENV === "production") &&
      !allowInMemoryInProd &&
      process.env.ALLOW_IN_MEMORY_DB !== "true";
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
    this.inviteTokens.clear();
    this.customers.clear();
    this.locations.clear();
    this.assets.clear();
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
      authVersion: 0,
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
      authVersion: 0,
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
      authVersion: 0,
    };
    this.users.set(techUser.id, techUser);
  }


  public async incrementUserAuthVersion(userId: string): Promise<number | null> {
    const user = this.users.get(userId);
    if (!user) return null;
    user.authVersion = (user.authVersion || 0) + 1;
    user.updatedAt = new Date().toISOString();
    this.users.set(userId, user);
    return user.authVersion;
  }

  public async updatePasswordAndIncrementAuthVersion(
    userId: string,
    passwordHash: string,
    salt: string,
    profileUpdates?: Partial<Pick<UserRecord, "fullName" | "email" | "phoneNumber">>,
  ): Promise<UserRecord | null> {
    const user = this.users.get(userId);
    if (!user) return null;

    user.passwordHash = passwordHash;
    user.salt = salt;
    user.authVersion = (user.authVersion || 0) + 1;
    user.updatedAt = new Date().toISOString();

    if (profileUpdates?.fullName !== undefined) user.fullName = profileUpdates.fullName;
    if (profileUpdates?.email !== undefined) user.email = profileUpdates.email;
    if (profileUpdates?.phoneNumber !== undefined) user.phoneNumber = profileUpdates.phoneNumber;

    this.users.set(userId, user);
    return { ...user };
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
    const companyId = `comp-${randomUUID()}`;

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
    this.users.set(userId, newUser);

    return { user: newUser, company: newCompany };
  }

  public async createGoogleUser(params: any): Promise<{ user: UserRecord; company: CompanyRecord }> {
    const normalized = normalizeEmail(params.email);
    const existing = await this.findUserByEmail(normalized);
    if (existing) {
      if (existing.provider !== "google") {
        throw new Error("Account exists with non-Google provider");
      }
      const company = await this.findCompanyById(existing.companyId);
      return { user: existing, company: company! };
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
      reportFooterNotes: "",
      stripeSubscriptionStatus: "Attivo (Piano Google OAuth)",
      maxUsers: 5,
      featurePdfExport: true,
      createdAt: now,
      updatedAt: now,
    };
    this.companies.set(companyId, newCompany);

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
    const id = data.id || `REP-${randomUUID()}`;

    const newReport: ReportRecord = {
      id,
      companyId,
      date: data.date || new Date().toLocaleDateString("it-IT"),
      time: data.time || new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
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

    this.reports.set(id, newReport);
    return newReport;
  }

  public async getReportById(companyId: string, reportId: string): Promise<ReportRecord | null> {
    const report = this.reports.get(reportId);
    if (!report || report.companyId !== companyId) {
      return null;
    }
    return report;
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
      user.authVersion = (user.authVersion || 0) + 1;
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

  // --- Team Management Operations ---

  public async getUsersByCompany(companyId: string): Promise<UserRecord[]> {
    const list: UserRecord[] = [];
    for (const u of this.users.values()) {
      if (u.companyId === companyId && u.role !== "superadmin") {
        list.push(u);
      }
    }
    return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  public async getUserByIdAndCompany(userId: string, companyId: string): Promise<UserRecord | null> {
    const user = this.users.get(userId);
    if (!user || user.companyId !== companyId) return null;
    return { ...user };
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
    const normalized = normalizeEmail(params.email);
    for (const u of this.users.values()) {
      if (u.email === normalized) {
        throw new Error("Email already registered");
      }
    }

    const now = new Date().toISOString();
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
      isActive: params.isActive,
      provider: params.provider || "local",
      emailConfirmed: params.emailConfirmed,
      phoneNumber: params.phoneNumber || "",
      createdAt: now,
      updatedAt: now,
      authVersion: 0,
    };

    this.users.set(userId, newUser);
    return { ...newUser };
  }

  public async createTeamMemberWithInvite(params: CreateTeamMemberWithInviteParams): Promise<{ user: UserRecord; inviteToken: InviteTokenRecord }> {
    const normalized = normalizeEmail(params.email);
    for (const u of this.users.values()) {
      if (u.email === normalized) {
        throw new Error("Questa email è già registrata nel sistema.");
      }
    }

    const now = new Date().toISOString();

    // Revoke previous pending invites
    await this.revokeInviteTokensByEmail(params.companyId, normalized);

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

    this.users.set(userId, newUser);
    this.inviteTokens.set(newInvite.tokenHash, newInvite);

    return { user: { ...newUser }, inviteToken: { ...newInvite } };
  }

  public async updateTeamMember(
    userId: string,
    companyId: string,
    updates: Partial<Pick<UserRecord, "fullName" | "role" | "phoneNumber" | "isActive">>,
    options?: { incrementAuthVersion?: boolean },
  ): Promise<UserRecord | null> {
    const user = this.users.get(userId);
    if (!user || user.companyId !== companyId) return null;

    const shouldIncrementAuthVersion = options?.incrementAuthVersion || updates.role !== undefined || updates.isActive !== undefined;
    const updatedUser: UserRecord = {
      ...user,
      ...updates,
      authVersion: shouldIncrementAuthVersion ? (user.authVersion || 0) + 1 : (user.authVersion || 0),
      updatedAt: new Date().toISOString(),
    };

    this.users.set(userId, updatedUser);
    return { ...updatedUser };
  }

  public async countAdminOwnersByCompany(companyId: string, excludeUserId?: string): Promise<number> {
    let count = 0;
    for (const u of this.users.values()) {
      if (
        u.companyId === companyId &&
        (u.role === "owner" || u.role === "admin") &&
        u.isActive &&
        u.id !== excludeUserId
      ) {
        count++;
      }
    }
    return count;
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
    const tokenRecord: InviteTokenRecord = {
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
    this.inviteTokens.set(tokenRecord.tokenHash, tokenRecord);
    return { ...tokenRecord };
  }

  public async findInviteTokenByHash(tokenHash: string): Promise<InviteTokenRecord | null> {
    const token = this.inviteTokens.get(tokenHash);
    return token ? { ...token } : null;
  }

  public async consumeInviteToken(tokenHash: string): Promise<boolean> {
    const token = this.inviteTokens.get(tokenHash);
    if (!token || token.consumed || token.revoked) return false;
    token.consumed = true;
    token.consumedAt = new Date().toISOString();
    this.inviteTokens.set(tokenHash, token);
    return true;
  }

  public async revokeInviteTokensByEmail(companyId: string, email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    for (const [hash, tok] of this.inviteTokens.entries()) {
      if (tok.companyId === companyId && tok.invitedEmail === normalized && !tok.consumed && !tok.revoked) {
        tok.revoked = true;
        this.inviteTokens.set(hash, tok);
      }
    }
  }

  public async getPendingInvitesByCompany(companyId: string): Promise<InviteTokenRecord[]> {
    const list: InviteTokenRecord[] = [];
    const now = Date.now();
    for (const tok of this.inviteTokens.values()) {
      if (
        tok.companyId === companyId &&
        !tok.consumed &&
        !tok.revoked &&
        new Date(tok.expiresAt).getTime() > now
      ) {
        list.push({ ...tok });
      }
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public async getInviteTokenInfo(tokenHash: string): Promise<{ invite: InviteTokenRecord; companyName: string } | null> {
    const invite = this.inviteTokens.get(tokenHash);
    if (!invite || invite.consumed || invite.revoked || new Date(invite.expiresAt).getTime() <= Date.now()) {
      return null;
    }
    const company = this.companies.get(invite.companyId);
    return {
      invite: { ...invite },
      companyName: company?.name || "Azienda",
    };
  }

  public async acceptInviteAndSetPassword(tokenHash: string, passwordHash: string, salt: string): Promise<UserRecord> {
    const invite = this.inviteTokens.get(tokenHash);
    if (!invite || invite.consumed || invite.revoked || new Date(invite.expiresAt).getTime() <= Date.now()) {
      throw new Error("Invito non valido, revocato o scaduto.");
    }

    const user = Array.from(this.users.values()).find(
      (u) => u.email === invite.invitedEmail && u.companyId === invite.companyId,
    );
    if (!user) {
      throw new Error("Utente collegato all'invito non trovato.");
    }

    // Atomically consume token
    invite.consumed = true;
    invite.consumedAt = new Date().toISOString();
    this.inviteTokens.set(tokenHash, invite);

    // Atomically update user
    user.passwordHash = passwordHash;
    user.salt = salt;
    user.emailConfirmed = true;
    user.authVersion = (user.authVersion || 0) + 1;
    user.updatedAt = new Date().toISOString();
    this.users.set(user.id, user);

    // Revoke any other pending invites for this email/company
    for (const [hash, tok] of this.inviteTokens.entries()) {
      if (
        tok.companyId === invite.companyId &&
        tok.invitedEmail === invite.invitedEmail &&
        tok.id !== invite.id &&
        !tok.consumed &&
        !tok.revoked
      ) {
        tok.revoked = true;
        this.inviteTokens.set(hash, tok);
      }
    }

    return { ...user };
  }

  // --- Customers & Locations ---

  public async getCustomersByCompany(companyId: string, search?: string, activeOnly?: boolean, limit: number = 100): Promise<CustomerRecord[]> {
    const list: CustomerRecord[] = [];
    const searchLower = search?.toLowerCase();
    
    for (const c of this.customers.values()) {
      if (c.companyId === companyId) {
        if (activeOnly && !c.isActive) continue;
        
        if (searchLower) {
          const match = c.displayName.toLowerCase().includes(searchLower) ||
                        c.legalName?.toLowerCase().includes(searchLower) ||
                        c.vatNumber?.toLowerCase().includes(searchLower) ||
                        c.email?.toLowerCase().includes(searchLower) ||
                        c.phoneNumber?.toLowerCase().includes(searchLower);
          if (!match) continue;
        }
        
        list.push(c);
      }
    }
    return list.slice(0, limit);
  }

  public async getCustomerByIdAndCompany(customerId: string, companyId: string): Promise<CustomerRecord | null> {
    const customer = this.customers.get(customerId);
    if (!customer || customer.companyId !== companyId) return null;
    return customer;
  }

  public async createCustomer(companyId: string, data: Partial<CustomerRecord>): Promise<CustomerRecord> {
    const now = new Date().toISOString();
    const id = data.id || `CUS-${randomUUID()}`;

    const newCustomer: CustomerRecord = {
      id,
      companyId,
      displayName: data.displayName || "Cliente",
      legalName: data.legalName,
      vatNumber: data.vatNumber,
      taxCode: data.taxCode,
      email: data.email,
      phoneNumber: data.phoneNumber,
      pec: data.pec,
      notes: data.notes,
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.customers.set(id, newCustomer);
    return newCustomer;
  }

  public async updateCustomer(companyId: string, customerId: string, data: Partial<CustomerRecord>): Promise<CustomerRecord | null> {
    const customer = await this.getCustomerByIdAndCompany(customerId, companyId);
    if (!customer) return null;

    const updatedCustomer: CustomerRecord = {
      ...customer,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    this.customers.set(customerId, updatedCustomer);
    return updatedCustomer;
  }

  public async archiveCustomer(companyId: string, customerId: string): Promise<CustomerRecord | null> {
    const customer = await this.getCustomerByIdAndCompany(customerId, companyId);
    if (!customer) return null;

    const updatedCustomer: CustomerRecord = {
      ...customer,
      isActive: false,
      updatedAt: new Date().toISOString(),
    };

    this.customers.set(customerId, updatedCustomer);
    return updatedCustomer;
  }

  public async reactivateCustomer(companyId: string, customerId: string): Promise<CustomerRecord | null> {
    const customer = await this.getCustomerByIdAndCompany(customerId, companyId);
    if (!customer) return null;

    const updatedCustomer: CustomerRecord = {
      ...customer,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    this.customers.set(customerId, updatedCustomer);
    return updatedCustomer;
  }

  public async getLocationsByCustomerAndCompany(customerId: string, companyId: string, search?: string, activeOnly?: boolean, limit: number = 100): Promise<LocationRecord[]> {
    const list: LocationRecord[] = [];
    const searchLower = search?.toLowerCase();

    for (const loc of this.locations.values()) {
      if (loc.companyId === companyId && loc.customerId === customerId) {
        if (activeOnly && !loc.isActive) continue;

        if (searchLower) {
          const match = loc.name.toLowerCase().includes(searchLower) ||
                        loc.address.toLowerCase().includes(searchLower) ||
                        loc.city.toLowerCase().includes(searchLower);
          if (!match) continue;
        }

        list.push(loc);
      }
    }
    return list.slice(0, limit);
  }

  public async getLocationByIdAndCompany(locationId: string, companyId: string): Promise<LocationRecord | null> {
    const location = this.locations.get(locationId);
    if (!location || location.companyId !== companyId) return null;
    return location;
  }

  public async createLocation(companyId: string, customerId: string, data: Partial<LocationRecord>): Promise<LocationRecord> {
    const now = new Date().toISOString();
    const id = data.id || `LOC-${randomUUID()}`;

    const newLocation: LocationRecord = {
      id,
      companyId,
      customerId,
      name: data.name || "Sede",
      address: data.address || "",
      city: data.city || "",
      province: data.province,
      postalCode: data.postalCode,
      notes: data.notes,
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.locations.set(id, newLocation);
    return newLocation;
  }

  public async updateLocation(companyId: string, locationId: string, data: Partial<LocationRecord>): Promise<LocationRecord | null> {
    const location = await this.getLocationByIdAndCompany(locationId, companyId);
    if (!location) return null;

    const updatedLocation: LocationRecord = {
      ...location,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    this.locations.set(locationId, updatedLocation);
    return updatedLocation;
  }

  public async archiveLocation(companyId: string, locationId: string): Promise<LocationRecord | null> {
    const location = await this.getLocationByIdAndCompany(locationId, companyId);
    if (!location) return null;

    const updatedLocation: LocationRecord = {
      ...location,
      isActive: false,
      updatedAt: new Date().toISOString(),
    };

    this.locations.set(locationId, updatedLocation);
    return updatedLocation;
  }

  public async reactivateLocation(companyId: string, locationId: string): Promise<LocationRecord | null> {
    const location = await this.getLocationByIdAndCompany(locationId, companyId);
    if (!location) return null;

    const updatedLocation: LocationRecord = {
      ...location,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    this.locations.set(locationId, updatedLocation);
    return updatedLocation;
  }

  // --- Assets Operations ---

  public async getAssetsByCompany(
    companyId: string,
    filters?: {
      search?: string;
      customerId?: string;
      locationId?: string;
      assetType?: string;
      status?: string;
      activeOnly?: boolean;
      limit?: number;
    }
  ): Promise<AssetRecord[]> {
    const list: AssetRecord[] = [];
    for (const asset of this.assets.values()) {
      if (asset.companyId !== companyId) continue;

      if (filters?.customerId && asset.customerId !== filters.customerId) {
        continue;
      }
      if (filters?.locationId && asset.locationId !== filters.locationId) {
        continue;
      }
      if (filters?.assetType && asset.assetType !== filters.assetType) {
        continue;
      }
      if (filters?.status && asset.status !== filters.status) {
        continue;
      }
      if (filters?.activeOnly && !asset.isActive) {
        continue;
      }
      if (filters?.search) {
        const s = filters.search.toLowerCase();
        const matches =
          asset.name.toLowerCase().includes(s) ||
          (asset.manufacturer && asset.manufacturer.toLowerCase().includes(s)) ||
          (asset.model && asset.model.toLowerCase().includes(s)) ||
          (asset.serialNumber && asset.serialNumber.toLowerCase().includes(s)) ||
          (asset.notes && asset.notes.toLowerCase().includes(s));
        if (!matches) continue;
      }

      list.push(asset);
    }

    list.sort((a, b) => a.name.localeCompare(b.name));
    const limit = filters?.limit ? filters.limit : 200;
    return list.slice(0, limit);
  }

  public async getAssetByIdAndCompany(assetId: string, companyId: string): Promise<AssetRecord | null> {
    const asset = this.assets.get(assetId);
    if (!asset || asset.companyId !== companyId) return null;
    return asset;
  }

  public async createAsset(
    companyId: string,
    customerId: string,
    locationId: string,
    data: Partial<AssetRecord>
  ): Promise<AssetRecord> {
    // Verify that location exists and belongs to both customer and company
    const loc = this.locations.get(locationId);
    if (!loc || loc.companyId !== companyId || loc.customerId !== customerId) {
      throw new Error("Invalid location or customer: location does not belong to customer within company.");
    }

    const now = new Date().toISOString();
    const id = data.id || `AST-${randomUUID()}`;

    const newAsset: AssetRecord = {
      id,
      companyId,
      customerId,
      locationId,
      assetType: (data.assetType as AssetType) || "altro",
      name: data.name || "Impianto",
      manufacturer: data.manufacturer,
      model: data.model,
      serialNumber: data.serialNumber,
      installationDate: data.installationDate,
      warrantyEndDate: data.warrantyEndDate,
      status: (data.status as AssetStatus) || "operativo",
      notes: data.notes,
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.assets.set(id, newAsset);
    return newAsset;
  }

  public async updateAsset(
    companyId: string,
    assetId: string,
    data: Partial<AssetRecord>
  ): Promise<AssetRecord | null> {
    const asset = await this.getAssetByIdAndCompany(assetId, companyId);
    if (!asset) return null;

    if (data.customerId !== undefined || data.locationId !== undefined) {
      const targetCustomer = data.customerId !== undefined ? data.customerId : asset.customerId;
      const targetLocation = data.locationId !== undefined ? data.locationId : asset.locationId;
      const loc = this.locations.get(targetLocation);
      if (!loc || loc.companyId !== companyId || loc.customerId !== targetCustomer) {
        throw new Error("Invalid location or customer: location does not belong to customer within company.");
      }
    }

    const updatedAsset: AssetRecord = {
      ...asset,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    this.assets.set(assetId, updatedAsset);
    return updatedAsset;
  }

  public async archiveAsset(companyId: string, assetId: string): Promise<AssetRecord | null> {
    const asset = await this.getAssetByIdAndCompany(assetId, companyId);
    if (!asset) return null;

    const updatedAsset: AssetRecord = {
      ...asset,
      isActive: false,
      updatedAt: new Date().toISOString(),
    };

    this.assets.set(assetId, updatedAsset);
    return updatedAsset;
  }

  public async reactivateAsset(companyId: string, assetId: string): Promise<AssetRecord | null> {
    const asset = await this.getAssetByIdAndCompany(assetId, companyId);
    if (!asset) return null;

    const updatedAsset: AssetRecord = {
      ...asset,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    this.assets.set(assetId, updatedAsset);
    return updatedAsset;
  }

  private isExplicitlyDisabled = false;

  public setAvailability(isAvailable: boolean): void {
    this.isExplicitlyDisabled = !isAvailable;
  }

  public async ping(_timeoutMs = 2000): Promise<boolean> {
    return !this.isExplicitlyDisabled;
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
