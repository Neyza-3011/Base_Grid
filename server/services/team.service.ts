import { IDatabaseAdapter } from "../db";
import {
  CreateTeamMemberInput,
  InviteInfoResponse,
  InviteTokenRecord,
  TeamMemberResponse,
  UpdateTeamMemberInput,
  UserRecord,
  UserRole,
  ASSIGNABLE_ROLES,
  ADMIN_OWNER_ROLES,
  CreateAdminAuditEventInput,
} from "../types";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { generateSecureToken, hashPassword, hashToken, isValidEmail, normalizeEmail, validatePasswordPolicy } from "../security";
import crypto from "crypto";

function validateInputObject(input: unknown, entityName = "I dati"): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError(`${entityName} inviati non sono validi.`);
  }
}

function validateOptionalStringField(value: unknown, fieldName: string, nullable = false): void {
  if (value === undefined || (nullable && value === null)) return;
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} deve essere una stringa valida.`);
  }
}

export class TeamService {
  constructor(private readonly db: IDatabaseAdapter) { }

  /**
   * Converts a user record to a safe public response, stripping all sensitive fields.
   */
  private toTeamMemberResponse(user: UserRecord): TeamMemberResponse {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      phoneNumber: user.phoneNumber || "",
      isActive: user.isActive,
      provider: user.provider,
      emailConfirmed: user.emailConfirmed,
      createdAt: user.createdAt,
    };
  }

  /**
   * Lists all team members for a given company.
   */
  async listTeamMembers(companyId: string): Promise<TeamMemberResponse[]> {
    if (!companyId) throw new ValidationError("Company ID is required");
    const users = await this.db.getUsersByCompany(companyId);
    return users.map(this.toTeamMemberResponse);
  }

  /**
   * Gets a specific team member.
   */
  async getTeamMember(companyId: string, userId: string): Promise<TeamMemberResponse> {
    if (!companyId || !userId) throw new ValidationError("Company ID and User ID are required");

    const user = await this.db.getUserByIdAndCompany(userId, companyId);
    if (!user) {
      throw new NotFoundError("Utente non trovato in questa azienda.");
    }

    return this.toTeamMemberResponse(user);
  }

  /**
   * Atomically creates a new team member and an invitation token in a single transaction.
   * If either user creation or token creation fails, both roll back.
   * Returns the created member and the raw invitation token (to be displayed to the admin).
   */
  async inviteTeamMember(
    companyId: string,
    companyName: string,
    inviterId: string,
    input: CreateTeamMemberInput
  ): Promise<{ member: TeamMemberResponse; inviteToken: string }> {
    if (!companyId) throw new ValidationError("Company ID is required");

    validateInputObject(input, "I dati invito team");
    validateOptionalStringField(input.fullName, "Nome completo");
    validateOptionalStringField(input.email, "Email");
    validateOptionalStringField(input.phoneNumber, "Telefono", true);

    if (!input.fullName || typeof input.fullName !== "string" || input.fullName.trim().length < 2 || input.fullName.trim().length > 100) {
      throw new ValidationError("Nome completo non valido. Deve essere tra 2 e 100 caratteri.");
    }

    if (!input.email || typeof input.email !== "string") {
      throw new ValidationError("Email non valida.");
    }

    const normalizedEmail = normalizeEmail(input.email);
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      throw new ValidationError("Formato email non valido.");
    }

    if (!input.role || typeof input.role !== "string" || !ASSIGNABLE_ROLES.includes(input.role as any)) {
      throw new ForbiddenError("Ruolo non valido o non assegnabile.");
    }

    if (input.phoneNumber !== undefined && input.phoneNumber !== null && (typeof input.phoneNumber !== "string" || input.phoneNumber.trim().length > 20)) {
      throw new ValidationError("Numero di telefono non valido (massimo 20 caratteri).");
    }

    const existingUser = await this.db.findUserByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictError("Questa email è già registrata nel sistema.");
    }

    // Temporary password (user will set their real password upon accepting invite)
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const { hash, salt } = hashPassword(randomPassword);

    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);

    // Expires in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { user: newUser } = await this.db.createTeamMemberWithInvite({
      companyId,
      companyName,
      inviterId,
      email: normalizedEmail,
      fullName: input.fullName,
      role: input.role,
      phoneNumber: input.phoneNumber,
      passwordHash: hash,
      salt,
      tokenHash,
      expiresAt,
    });

    return {
      member: this.toTeamMemberResponse(newUser),
      inviteToken: rawToken,
    };
  }

  /**
   * Updates a team member's profile and role.
   * Atomically updates user state AND increments authVersion in the same DB mutation.
   */
  async updateTeamMember(
    companyId: string,
    userId: string,
    executorId: string,
    input: UpdateTeamMemberInput,
    audit?: CreateAdminAuditEventInput,
  ): Promise<TeamMemberResponse> {
    if (!companyId || !userId) throw new ValidationError("Company ID and User ID are required");

    validateInputObject(input, "I dati aggiornamento team");
    validateOptionalStringField(input.fullName, "Nome completo", true);
    validateOptionalStringField(input.phoneNumber, "Telefono", true);

    const user = await this.db.getUserByIdAndCompany(userId, companyId);
    if (!user) {
      throw new NotFoundError("Utente non trovato in questa azienda.");
    }
    if (user.platformRole === "ceo" || user.role === "superadmin") {
      throw new ForbiddenError("Account CEO/piattaforma non modificabile tramite la gestione team.");
    }

    const updates: Partial<UpdateTeamMemberInput> = {};

    if (input.fullName !== undefined && input.fullName !== null) {
      if (typeof input.fullName !== "string" || input.fullName.trim().length < 2 || input.fullName.trim().length > 100) {
        throw new ValidationError("Nome completo non valido. Deve essere tra 2 e 100 caratteri.");
      }
      updates.fullName = input.fullName.trim();
    }

    if (input.phoneNumber !== undefined && input.phoneNumber !== null) {
      if (typeof input.phoneNumber !== "string" || input.phoneNumber.trim().length > 20) {
        throw new ValidationError("Numero di telefono non valido (massimo 20 caratteri).");
      }
      updates.phoneNumber = input.phoneNumber.trim();
    }

    if (input.role !== undefined && input.role !== user.role) {
      if (user.role === "owner") {
        const executor = await this.db.getUserByIdAndCompany(executorId, companyId);
        if (!executor || executor.role !== "owner") {
          throw new ForbiddenError("Solo il titolare può modificare il ruolo di un altro titolare.");
        }
      }

      if (!ASSIGNABLE_ROLES.includes(input.role)) {
        throw new ForbiddenError("Ruolo non valido o non assegnabile.");
      }

      // Self-protection: cannot change own role
      if (userId === executorId) {
        throw new ForbiddenError("Non puoi modificare il tuo stesso ruolo. Contatta un altro amministratore.");
      }

      // Self-protection: if removing admin/owner role, ensure it's not the last one
      if (ADMIN_OWNER_ROLES.includes(user.role) && !ADMIN_OWNER_ROLES.includes(input.role)) {
        const adminCount = await this.db.countAdminOwnersByCompany(companyId, userId);
        if (adminCount === 0) {
          throw new ForbiddenError("Impossibile rimuovere il ruolo di amministratore: sei l'ultimo amministratore attivo dell'azienda.");
        }
      }

      updates.role = input.role;
    }

    // Atomically updates user state AND increments authVersion if role changed
    const shouldIncrementAuthVersion = updates.role !== undefined;
    const updatedUser = await this.db.updateTeamMember(userId, companyId, updates, {
      incrementAuthVersion: shouldIncrementAuthVersion,
      ...(audit ? { audit } : {}),
    });
    if (!updatedUser) {
      throw new Error("Errore durante l'aggiornamento dell'utente.");
    }

    return this.toTeamMemberResponse(updatedUser);
  }

  /**
   * Activates or deactivates a team member.
   * Atomically updates user status AND increments authVersion in the same DB mutation.
   */
  async changeMemberStatus(
    companyId: string,
    userId: string,
    executorId: string,
    isActive: boolean,
    audit?: CreateAdminAuditEventInput,
  ): Promise<TeamMemberResponse> {
    if (!companyId || !userId) throw new ValidationError("Company ID and User ID are required");

    // Self-protection: cannot deactivate self
    if (userId === executorId && !isActive) {
      throw new ForbiddenError("Non puoi disattivare il tuo stesso account.");
    }

    const user = await this.db.getUserByIdAndCompany(userId, companyId);
    if (!user) {
      throw new NotFoundError("Utente non trovato in questa azienda.");
    }
    if (user.platformRole === "ceo" || user.role === "superadmin") {
      throw new ForbiddenError("Account CEO/piattaforma non modificabile tramite la gestione team.");
    }

    if (user.role === "owner") {
      const executor = await this.db.getUserByIdAndCompany(executorId, companyId);
      if (!executor || executor.role !== "owner") {
        throw new ForbiddenError("Solo il titolare può modificare lo stato di un altro titolare.");
      }
    }

    if (user.isActive === isActive) {
      return this.toTeamMemberResponse(user);
    }

    // Self-protection: if deactivating an admin/owner, ensure it's not the last one
    if (!isActive && ADMIN_OWNER_ROLES.includes(user.role)) {
      const adminCount = await this.db.countAdminOwnersByCompany(companyId, userId);
      if (adminCount === 0) {
        throw new ForbiddenError("Impossibile disattivare l'account: sei l'ultimo amministratore attivo dell'azienda.");
      }
    }

    // Atomically updates isActive AND increments authVersion in single mutation
    const updatedUser = await this.db.updateTeamMember(userId, companyId, { isActive }, {
      incrementAuthVersion: true,
      ...(audit ? { audit } : {}),
    });
    if (!updatedUser) {
      throw new Error("Errore durante l'aggiornamento dello stato dell'utente.");
    }

    return this.toTeamMemberResponse(updatedUser);
  }

  /**
   * Retrieves safe invitation info by raw token.
   * Token is hashed before lookup.
   */
  async getInviteInfo(rawToken: string): Promise<InviteInfoResponse> {
    if (!rawToken || typeof rawToken !== "string") {
      throw new ValidationError("Token di invito non fornito.");
    }
    const tokenHash = hashToken(rawToken);
    const info = await this.db.getInviteTokenInfo(tokenHash);
    if (!info) {
      throw new NotFoundError("Invito non valido o scaduto.");
    }
    return {
      email: info.invite.invitedEmail,
      fullName: info.invite.fullName,
      role: info.invite.role,
      companyName: info.companyName,
      expiresAt: info.invite.expiresAt,
    };
  }

  /**
   * Accepts an invitation and sets the user's password.
   * Validates token existence, non-consumed, non-revoked, and non-expired.
   * Atomically consumes the token, sets the password, marks emailConfirmed=true,
   * increments user authVersion, and revokes other pending invites.
   */
  async acceptInvite(rawToken: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!rawToken || typeof rawToken !== "string") {
      throw new ValidationError("Token di invito non fornito.");
    }

    const passwordValidation = validatePasswordPolicy(newPassword);
    if (!passwordValidation.valid) {
      throw new ValidationError(passwordValidation.message || "Password non valida.");
    }

    const tokenHash = hashToken(rawToken);
    const { hash: passwordHash, salt } = hashPassword(newPassword);

    await this.db.acceptInviteAndSetPassword(tokenHash, passwordHash, salt);

    return {
      success: true,
      message: "Invito accettato con successo. Ora puoi effettuare il login.",
    };
  }
}
