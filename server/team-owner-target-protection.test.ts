import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { TeamService } from "./services/team.service";

describe("Team owner account protection", () => {
  let service: TeamService;
  let adminId: string;
  let companyId: string;
  let companyName: string;

  beforeEach(async () => {
    db.seedInitialData?.();
    service = new TeamService(db);
    const admin = await db.findUserByEmail("admin@rossi.it");
    if (!admin) throw new Error("Missing seeded admin user");
    adminId = admin.id;
    companyId = admin.companyId;
    companyName = admin.companyName;
  });

  async function createOwner() {
    const result = await service.inviteTeamMember(companyId, companyName, adminId, {
      email: `owner-target-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
      fullName: "Target Owner",
      role: "owner",
    });
    return result.member;
  }

  it("prevents an admin from changing another owner's role", async () => {
    const owner = await createOwner();
    await expect(
      service.updateTeamMember(companyId, owner.id, adminId, { role: "technician" }),
    ).rejects.toThrow(/Solo il titolare/i);
    const unchanged = await db.getUserByIdAndCompany(owner.id, companyId);
    expect(unchanged?.role).toBe("owner");
  });

  it("prevents an admin from deactivating another owner", async () => {
    const owner = await createOwner();
    await expect(
      service.changeMemberStatus(companyId, owner.id, adminId, false),
    ).rejects.toThrow(/Solo il titolare/i);
    const unchanged = await db.getUserByIdAndCompany(owner.id, companyId);
    expect(unchanged?.isActive).toBe(true);
  });
  async function createMasterTenantAdmin() {
    const ceo = await db.findUserByEmail("jack.cardinali15@gmail.com");
    if (!ceo) throw new Error("Missing seeded platform CEO");
    return db.createTeamMember({
      companyId: ceo.companyId,
      companyName: ceo.companyName,
      email: `master-admin-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`,
      fullName: "Master Tenant Admin",
      role: "admin",
      passwordHash: "test-hash",
      salt: "test-salt",
      isActive: true,
      emailConfirmed: true,
    });
  }

  it("prevents a master-tenant admin from changing the platform CEO role", async () => {
    const ceo = await db.findUserByEmail("jack.cardinali15@gmail.com");
    if (!ceo) throw new Error("Missing seeded platform CEO");
    const masterAdmin = await createMasterTenantAdmin();

    await expect(
      service.updateTeamMember(ceo.companyId, ceo.id, masterAdmin.id, { role: "technician" }),
    ).rejects.toThrow(/Account CEO\/piattaforma non modificabile tramite la gestione team/i);

    const unchanged = await db.findUserById(ceo.id);
    expect(unchanged?.role).toBe("superadmin");
    expect(unchanged?.platformRole).toBe("ceo");
  });

  it("prevents a master-tenant admin from deactivating the platform CEO", async () => {
    const ceo = await db.findUserByEmail("jack.cardinali15@gmail.com");
    if (!ceo) throw new Error("Missing seeded platform CEO");
    const masterAdmin = await createMasterTenantAdmin();

    await expect(
      service.changeMemberStatus(ceo.companyId, ceo.id, masterAdmin.id, false),
    ).rejects.toThrow(/Account CEO\/piattaforma non modificabile tramite la gestione team/i);

    const unchanged = await db.findUserById(ceo.id);
    expect(unchanged?.isActive).toBe(true);
    expect(unchanged?.platformRole).toBe("ceo");
  });

});
