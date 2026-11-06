import { beforeEach, describe, expect, it, vi } from "vitest";
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
  function createIsolatedPlatformService() {
    const ceo = {
      id: "usr-platform-ceo-protection-test",
      email: "platform-ceo-test@example.test",
      fullName: "Platform CEO",
      role: "superadmin",
      platformRole: "ceo",
      companyId: "comp-master-protection-test",
      companyName: "Master Platform",
      passwordHash: "test-hash",
      salt: "test-salt",
      isActive: true,
      provider: "local",
      emailConfirmed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      authVersion: 0,
    };
    const updateTeamMember = vi.fn().mockImplementation(async () => ({
      ...ceo,
      role: "technician",
      isActive: false,
    }));
    const isolatedDb = {
      getUserByIdAndCompany: vi.fn(async (userId: string, targetCompanyId: string) =>
        userId === ceo.id && targetCompanyId === ceo.companyId ? ceo : null
      ),
      updateTeamMember,
    };
    return {
      service: new TeamService(isolatedDb as any),
      ceo,
      updateTeamMember,
    };
  }

  it("prevents a master-tenant admin from changing the platform CEO role", async () => {
    const { service: isolatedService, ceo, updateTeamMember } = createIsolatedPlatformService();

    await expect(
      isolatedService.updateTeamMember(ceo.companyId, ceo.id, "master-admin-test", { role: "technician" }),
    ).rejects.toThrow(/Account CEO\\/piattaforma non modificabile tramite la gestione team/i);

    expect(updateTeamMember).not.toHaveBeenCalled();
    expect(ceo.role).toBe("superadmin");
    expect(ceo.platformRole).toBe("ceo");
  });

  it("prevents a master-tenant admin from deactivating the platform CEO", async () => {
    const { service: isolatedService, ceo, updateTeamMember } = createIsolatedPlatformService();

    await expect(
      isolatedService.changeMemberStatus(ceo.companyId, ceo.id, "master-admin-test", false),
    ).rejects.toThrow(/Account CEO\\/piattaforma non modificabile tramite la gestione team/i);

    expect(updateTeamMember).not.toHaveBeenCalled();
    expect(ceo.isActive).toBe(true);
    expect(ceo.platformRole).toBe("ceo");
  });

});
