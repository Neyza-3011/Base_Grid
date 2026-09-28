export type UserRole =
  | "superadmin"
  | "owner"
  | "admin"
  | "responsabile_tecnico"
  | "dispatcher"
  | "technician"
  | "amministrazione"
  | "commerciale"
  | "cliente";

/** Roles that can administer the team (add/edit/activate/deactivate members) */
export const TEAM_ADMIN_ROLES: readonly UserRole[] = ["superadmin", "owner", "admin"] as const;

/** Roles that a tenant admin/owner is allowed to assign to team members */
export const ASSIGNABLE_ROLES: readonly UserRole[] = [
  "owner",
  "admin",
  "responsabile_tecnico",
  "dispatcher",
  "technician",
  "amministrazione",
  "commerciale",
  "cliente",
] as const;

/** Roles considered as admin/owner for self-protection (cannot deactivate last one) */
export const ADMIN_OWNER_ROLES: readonly UserRole[] = ["owner", "admin"] as const;

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
  authVersion: number;
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

export interface CustomerRecord {
  id: string;
  companyId: string;
  displayName: string;
  legalName?: string;
  vatNumber?: string;
  taxCode?: string;
  email?: string;
  phoneNumber?: string;
  pec?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocationRecord {
  id: string;
  companyId: string;
  customerId: string;
  name: string;
  address: string;
  city: string;
  province?: string;
  postalCode?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerInput {
  displayName: string;
  legalName?: string;
  vatNumber?: string;
  taxCode?: string;
  email?: string;
  phoneNumber?: string;
  pec?: string;
  notes?: string;
}

export interface UpdateCustomerInput {
  displayName?: string;
  legalName?: string;
  vatNumber?: string;
  taxCode?: string;
  email?: string;
  phoneNumber?: string;
  pec?: string;
  notes?: string;
}

export interface CreateLocationInput {
  name: string;
  address: string;
  city: string;
  province?: string;
  postalCode?: string;
  notes?: string;
}

export interface UpdateLocationInput {
  name?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  notes?: string;
}

export interface CustomerResponse extends Omit<CustomerRecord, "companyId"> {}
export interface LocationResponse extends Omit<LocationRecord, "companyId"> {}

// ==============================================================================
// Asset Types (P1.3 Equipment / Impianti)
// ==============================================================================

export type AssetType =
  | "quadro"
  | "fotovoltaico"
  | "inverter"
  | "batteria"
  | "wallbox"
  | "climatizzazione"
  | "automazione"
  | "allarme"
  | "rete_cablaggio"
  | "altro";

export type AssetStatus =
  | "operativo"
  | "manutenzione"
  | "fuori_servizio"
  | "dismesso";

export interface AssetRecord {
  id: string;
  companyId: string;
  customerId: string;
  locationId: string;
  assetType: AssetType;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyEndDate?: string;
  status: AssetStatus;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetResponse extends Omit<AssetRecord, "companyId"> {}

export interface CreateAssetInput {
  customerId: string;
  locationId: string;
  assetType: AssetType;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyEndDate?: string;
  status?: AssetStatus;
  notes?: string;
}

export interface UpdateAssetInput {
  customerId?: string;
  locationId?: string;
  assetType?: AssetType;
  name?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyEndDate?: string;
  status?: AssetStatus;
  notes?: string;
}

export interface ReportRecord {
  id: string;
  companyId: string;
  customerId?: string;
  locationId?: string;
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

export interface CreateReportRequest {
  client_name: string;
  client_address?: string;
  client_city?: string;
  customer_id?: string;
  location_id?: string;
  work_hours: number;
  travel_hours?: number;
  date: string;
  time: string;
  notes?: string;
  materials_used?: { name: string; quantity: number }[];
  status?: "draft" | "submitted" | "approved";
  signature_base64?: string;
}

export interface ReportResponseDTO {
  id: string;
  customer_id?: string;
  location_id?: string;
  date: string;
  time: string;
  work_hours: number;
  travel_hours: number;
  status: "draft" | "submitted" | "approved";
  client: {
    name: string;
    address?: string;
    city?: string;
  };
  technician: {
    full_name: string;
  };
  materials_used: { name: string; quantity: number }[];
  notes?: string;
  created_at: string;
}

export interface UpdateCompanyInput {
  name?: string;
  vatNumber?: string;
  address?: string;
  defaultHourlyRate?: number;
  reportFooterNotes?: string;
  maxUsers?: number;
  featurePdfExport?: boolean;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  role: UserRole;
  password?: string;
  phoneNumber?: string;
}

export interface UpdateUserInput {
  fullName?: string;
  role?: UserRole;
  phoneNumber?: string;
  isActive?: boolean;
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
  authVersion?: number;
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

// --- Team Management Types ---

/**
 * Public response for a team member — NEVER includes passwordHash, salt, authVersion, or tokens.
 */
export interface TeamMemberResponse {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  phoneNumber: string;
  isActive: boolean;
  provider: string;
  emailConfirmed: boolean;
  createdAt: string;
}

/**
 * Input for creating/inviting a new team member.
 * companyId is NEVER accepted from the client — derived server-side from auth context.
 */
export interface CreateTeamMemberInput {
  email: string;
  fullName: string;
  role: UserRole;
  phoneNumber?: string;
}

/**
 * Input for updating an existing team member.
 * email changes are NOT supported in this task.
 * companyId changes are NEVER allowed.
 */
export interface UpdateTeamMemberInput {
  fullName?: string;
  role?: UserRole;
  phoneNumber?: string;
  isActive?: boolean;
}

/**
 * Invite token record for secure team member invitations.
 * Raw token is never stored — only its SHA-256 hash.
 */
export interface InviteTokenRecord {
  id: string;
  companyId: string;
  invitedEmail: string;
  tokenHash: string;
  role: UserRole;
  fullName: string;
  phoneNumber?: string;
  invitedBy: string;
  consumed: boolean;
  revoked: boolean;
  expiresAt: string;
  createdAt: string;
  consumedAt?: string;
}

/**
 * Team stats for dashboard display.
 */
export interface TeamStats {
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  pendingInvites: number;
  roleBreakdown: Record<string, number>;
}

/**
 * Public response for invitation information before password setup.
 */
export interface InviteInfoResponse {
  email: string;
  fullName: string;
  role: UserRole;
  companyName: string;
  expiresAt: string;
}

/**
 * Parameters for atomic team member and invite token creation.
 */
export interface CreateTeamMemberWithInviteParams {
  companyId: string;
  companyName: string;
  inviterId: string;
  email: string;
  fullName: string;
  role: UserRole;
  phoneNumber?: string;
  passwordHash: string;
  salt: string;
  tokenHash: string;
  expiresAt: string;
}

