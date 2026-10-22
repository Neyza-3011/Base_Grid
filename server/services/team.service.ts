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
} from "../types";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { generateSecureToken, hashPassword, hashToken, normalizeEmail, validatePasswordPolicy } from "../security";
import crypto from "crypto";

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

    const normalizedEmail = normalizeEmail(input.email);
    if (!normalizedEmail) {
      throw new ValidationError("Email non valida.");
    }

    if (!ASSIGNABLE_ROLES.includes(input.role)) {
      throw new ForbiddenError("Ruolo non valido o non assegnabile.");
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
    input: UpdateTeamMemberInput
  ): Promise<TeamMemberResponse> {
    if (!companyId || !userId) throw new ValidationError("Company ID and User ID are required");

    const user = await this.db.getUserByIdAndCompany(userId, companyId);
    if (!user) {
      throw new NotFoundError("Utente non trovato in questa azienda.");
    }

    const updates: Partial<UpdateTeamMemberInput> = {};

    if (input.fullName !== undefined) {
      updates.fullName = input.fullName.trim();
    }

    if (input.phoneNumber !== undefined) {
      updates.phoneNumber = input.phoneNumber.trim();
    }

    if (input.role !== undefined && input.role !== user.role) {
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
    isActive: boolean
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
