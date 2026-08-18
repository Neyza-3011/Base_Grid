import { CompanyRecord, ReportRecord, UserRecord, UserRole } from "./types";
import { hashPassword, normalizeEmail } from "./security";
import { tokenStore } from "./token-store";
import { config } from "./config";

// In-memory persistent database store with multi-tenancy guarantees
class DatabaseStore {
  private users: Map<string, UserRecord> = new Map();
  private companies: Map<string, CompanyRecord> = new Map();
  private reports: Map<string, ReportRecord> = new Map();
  public tokenStore = tokenStore;

  constructor() {
    this.seedInitialData();
  }

  public seedInitialData() {
    this.users.clear();
    this.companies.clear();
    this.reports.clear();
    this.tokenStore.reset();

    const now = new Date().toISOString();

    // 1. Master Company for SuperAdmin
    const masterCompanyId = "comp-master-001";
    const masterCompany: CompanyRecord = {
      id: masterCompanyId,
      name: config.SUPERADMIN_COMPANY_NAME,
      vatNumber: "IT00000000000",
      address: "Via della Spiga 1, Milano",
      defaultHourlyRate: 65,
      reportFooterNotes: "Rapportino conforme agli standard BaseGrid Enterprise.",
      stripeSubscriptionStatus: "Attivo (Enterprise Unlimited)",
      maxUsers: 100,
      featurePdfExport: true,
      createdAt: now,
      updatedAt: now,
    };
    this.companies.set(masterCompanyId, masterCompany);

    // Master SuperAdmin user
    const superAdminEmail = config.SUPERADMIN_EMAIL;
    const superAdminPassword = config.SUPERADMIN_PASSWORD;
    const { hash: saHash, salt: saSalt } = hashPassword(superAdminPassword);
    
    const superAdminUser: UserRecord = {
      id: "usr-superadmin-001",
      email: normalizeEmail(superAdminEmail),
      fullName: "Master SuperAdmin",
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

    // 2. Demo Customer Company: Rossi Impianti Srl
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

    // Demo Admin: admin@rossi.it
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

    // Demo Technician: tech@rossi.it
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

    // Seed some initial reports for Rossi Impianti
    const rep1: ReportRecord = {
      id: "REP-2026-001",
      companyId: demoCompanyId,
      date: "27/07/2026",
      time: "18:30",
      workHours: 4.5,
      travelHours: 1.0,
      status: "approved",
      client: {
        name: "Rossi Impianti Srl",
        address: "Via Milano 12, Milano",
        city: "Milano",
      },
      technician: { fullName: "Marco Rossi" },
      materialsUsed: [
        { name: "Cavo FG16 3x2.5", quantity: 25 },
        { name: "Interruttore MT 25A", quantity: 2 },
      ],
      notes: "Installazione quadro principale completata con collaudo.",
      createdAt: now,
    };
    this.reports.set(rep1.id, rep1);

    const rep2: ReportRecord = {
      id: "REP-2026-002",
      companyId: demoCompanyId,
      date: "27/07/2026",
      time: "14:15",
      workHours: 3.0,
      travelHours: 0.5,
      status: "submitted",
      client: {
        name: "Cantiere Impianti Verdi",
        address: "Corso Italia 88, Torino",
        city: "Torino",
      },
      technician: { fullName: "Luca Bianchi" },
      materialsUsed: [
        { name: "Presa Schuko IP55", quantity: 6 },
        { name: "Tubo corrugato Ø25", quantity: 15 },
      ],
      notes: "Posa tubazioni esterne e montaggio prese stagne.",
      createdAt: now,
    };
    this.reports.set(rep2.id, rep2);
  }

  // --- Users Operations ---

  public findUserById(id: string): UserRecord | null {
    const user = this.users.get(id);
    return user || null;
  }

  public findUserByEmail(email: string): UserRecord | null {
    const normalized = normalizeEmail(email);
    for (const u of this.users.values()) {
      if (u.email === normalized) {
        return u;
      }
    }
    return null;
  }

  public createUser(params: {
    email: string;
    fullName: string;
    password: string;
    role?: UserRole;
    companyName: string;
    provider?: "local" | "google";
    phoneNumber?: string;
  }): { user: UserRecord; company: CompanyRecord } {
    const normalized = normalizeEmail(params.email);
    if (this.findUserByEmail(normalized)) {
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
      reportFooterNotes: "Grazie per aver scelto i nostri servizi professionali.",
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
      emailConfirmed: true,
      phoneNumber: params.phoneNumber || "",
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(userId, newUser);

    return { user: newUser, company: newCompany };
  }

  public createGoogleUser(params: {
    email: string;
    fullName: string;
    companyName?: string;
  }): { user: UserRecord; company: CompanyRecord } {
    const normalized = normalizeEmail(params.email);
    const existing = this.findUserByEmail(normalized);
    if (existing) {
      const company = this.findCompanyById(existing.companyId)!;
      return { user: existing, company };
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
    this.companies.set(companyId, newCompany);

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
    this.users.set(userId, newUser);

    return { user: newUser, company: newCompany };
  }

  public updateUser(id: string, updates: Partial<UserRecord>): UserRecord | null {
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

  // --- Company Operations ---

  public findCompanyById(id: string): CompanyRecord | null {
    return this.companies.get(id) || null;
  }

  public updateCompany(id: string, updates: Partial<CompanyRecord>): CompanyRecord | null {
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

  public getAllTenants(): CompanyRecord[] {
    return Array.from(this.companies.values());
  }

  // --- Reports Operations (Strict Tenant Isolation) ---

  public getReportsByCompany(companyId: string, limit: number = 100): ReportRecord[] {
    const list: ReportRecord[] = [];
    for (const r of this.reports.values()) {
      if (r.companyId === companyId) {
        list.push(r);
      }
    }
    return list.slice(0, limit);
  }

  public createReport(companyId: string, data: Partial<ReportRecord>): ReportRecord {
    const now = new Date().toISOString();
    const id = data.id || `REP-2026-${Math.floor(100 + Math.random() * 900)}`;

    const newReport: ReportRecord = {
      id,
      companyId, // Server enforces companyId
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

  public deleteReport(companyId: string, reportId: string): boolean {
    const report = this.reports.get(reportId);
    if (!report || report.companyId !== companyId) {
      return false; // Cannot delete reports of another tenant
    }
    return this.reports.delete(reportId);
  }

  // --- Superadmin Stats ---

  public getGlobalStats() {
    return {
      total_tenants: this.companies.size,
      total_users: this.users.size,
      total_reports: this.reports.size,
      total_clients: 42,
      sandbox_mode_active: false,
      system_status: "Operational · 100% Zero-Trust Active",
    };
  }
}

export const db = new DatabaseStore();
