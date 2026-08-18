export type UserRole = "superadmin" | "admin" | "technician";

export interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  passwordHash: string;
  salt: string;
  isActive: boolean;
  provider: "local" | "google";
  emailConfirmed: boolean;
  phoneNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyRecord {
  id: string;
  name: string;
  vatNumber: string;
  address: string;
  defaultHourlyRate: number;
  reportFooterNotes: string;
  stripeSubscriptionStatus: string;
  maxUsers: number;
  featurePdfExport: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReportRecord {
  id: string;
  companyId: string;
  date: string;
  time: string;
  workHours: number;
  travelHours: number;
  status: "draft" | "submitted" | "approved";
  client: {
    name: string;
    address?: string;
    city?: string;
  };
  technician: {
    fullName: string;
  };
  materialsUsed: { name: string; quantity: number }[];
  notes?: string;
  signatureBase64?: string;
  createdAt: string;
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: UserRole;
  companyId: string;
  tokenType: "access" | "refresh";
  jti?: string; // unique JWT ID
  familyId?: string; // token rotation lineage family ID
  iat?: number;
  exp?: number;
}

export interface SafeUserSession {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  provider: string;
  emailConfirmed: boolean;
  phoneNumber?: string;
}

export type AuthTokenType = "email_verification" | "password_reset";

export interface AuthTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  type: AuthTokenType;
  consumed: boolean;
  expiresAt: string;
  createdAt: string;
  consumedAt?: string;
}
