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
});
