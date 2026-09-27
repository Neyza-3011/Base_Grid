import { IDatabaseAdapter } from "../db";
import { CreateTeamMemberInput, InviteTokenRecord, TeamMemberResponse, UpdateTeamMemberInput, UserRecord, UserRole, ASSIGNABLE_ROLES, ADMIN_OWNER_ROLES } from "../types";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { generateSecureToken, hashPassword, hashToken, normalizeEmail } from "../security";
import crypto from "crypto";

export class TeamService {
  constructor(private readonly db: IDatabaseAdapter) {}

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
   * Creates a new team member and an invitation token.
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

    // Revoke any pending invites for this email in this company
    await this.db.revokeInviteTokensByEmail(companyId, normalizedEmail);

    // Create user with a secure random password (they don't know it, must use invite link to set it)
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const { hash, salt } = hashPassword(randomPassword);

    const newUser = await this.db.createTeamMember({
      companyId,
      companyName,
      email: normalizedEmail,
      fullName: input.fullName,
      role: input.role,
      phoneNumber: input.phoneNumber,
      passwordHash: hash,
      salt,
      provider: "local",
      isActive: true, // Active, but emailConfirmed is false
      emailConfirmed: false,
    });

    // Create invite token
    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);
    
    // Expires in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await this.db.createInviteToken({
      companyId,
      invitedEmail: normalizedEmail,
      tokenHash,
      role: input.role,
      fullName: input.fullName,
      phoneNumber: input.phoneNumber,
      invitedBy: inviterId,
      expiresAt,
    });

    return {
      member: this.toTeamMemberResponse(newUser),
      inviteToken: rawToken,
    };
  }

  /**
   * Updates a team member's profile and role.
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

    // Role changes require session invalidation
    if (updates.role !== undefined) {
      await this.db.incrementUserAuthVersion(userId);
    }

    const updatedUser = await this.db.updateTeamMember(userId, companyId, updates);
    if (!updatedUser) {
      throw new Error("Errore durante l'aggiornamento dell'utente.");
    }

    return this.toTeamMemberResponse(updatedUser);
  }

  /**
   * Activates or deactivates a team member.
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

    // Status change requires session invalidation
    await this.db.incrementUserAuthVersion(userId);

    const updatedUser = await this.db.updateTeamMember(userId, companyId, { isActive });
    if (!updatedUser) {
      throw new Error("Errore durante l'aggiornamento dello stato dell'utente.");
    }

    return this.toTeamMemberResponse(updatedUser);
  }
}
