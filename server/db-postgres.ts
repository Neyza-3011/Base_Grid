import { Pool, PoolClient } from "pg";
import { config } from "./config";
import { CompanyRecord, ReportRecord, UserRecord, UserRole } from "./types";
import { tokenStore } from "./token-store";

// Tipizzazione per le transazioni
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
  deleteReport(companyId: string, reportId: string): Promise<boolean>;
  getGlobalStats(): Promise<any>;
  withTransaction<T>(callback: (client: TransactionClient) => Promise<T>): Promise<T>;
}

export class PostgresAdapter implements IDatabaseAdapter {
  private pool: Pool;
  public tokenStore = tokenStore;

  constructor() {
    if (!config.DATABASE_URL) {
      if (config.NODE_ENV === "production") {
        throw new Error("CRITICAL SECURITY ERROR: DATABASE_URL is missing in production.");
      }
    }
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      ssl: config.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });
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
    return res.rows[0] || null;
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    const res = await this.pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [email]);
    return res.rows[0] || null;
  }

  public async createUser(params: any): Promise<{ user: UserRecord; company: CompanyRecord }> {
    return this.withTransaction(async (client) => {
      // Postgres implementazione reale qui
      throw new Error("Not implemented fully yet");
    });
  }

  public async createGoogleUser(params: any): Promise<{ user: UserRecord; company: CompanyRecord }> {
    return this.withTransaction(async (client) => {
      throw new Error("Not implemented fully yet");
    });
  }

  public async updateUser(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null> {
    throw new Error("Not implemented fully yet");
  }

  // --- Company Operations ---
  public async findCompanyById(id: string): Promise<CompanyRecord | null> {
    const res = await this.pool.query("SELECT * FROM companies WHERE id = $1 LIMIT 1", [id]);
    return res.rows[0] || null;
  }

  public async updateCompany(id: string, updates: Partial<CompanyRecord>): Promise<CompanyRecord | null> {
    throw new Error("Not implemented fully yet");
  }

  public async getAllTenants(): Promise<CompanyRecord[]> {
    const res = await this.pool.query("SELECT * FROM companies");
    return res.rows;
  }

  // --- Reports Operations ---
  public async getReportsByCompany(companyId: string, limit: number = 100): Promise<ReportRecord[]> {
    const res = await this.pool.query("SELECT * FROM reports WHERE company_id = $1 LIMIT $2", [companyId, limit]);
    return res.rows;
  }

  public async createReport(companyId: string, data: Partial<ReportRecord>): Promise<ReportRecord> {
    throw new Error("Not implemented fully yet");
  }

  public async deleteReport(companyId: string, reportId: string): Promise<boolean> {
    const res = await this.pool.query("DELETE FROM reports WHERE id = $1 AND company_id = $2 RETURNING id", [reportId, companyId]);
    return (res.rowCount ?? 0) > 0;
  }

  public async getGlobalStats(): Promise<any> {
    throw new Error("Not implemented fully yet");
  }
}
