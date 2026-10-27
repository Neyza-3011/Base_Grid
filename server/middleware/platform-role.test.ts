import { describe, expect, it, vi } from "vitest";
import { requirePlatformRole, requireSuperAdmin } from "./auth";

function runGuard(guard: (req: any, res: any, next: any) => void, user: any) {
  const req = { user };
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const next = vi.fn();
  guard(req as any, res as any, next);
  return { res, next };
}

describe("platform role authorization", () => {
  it("denies a legacy superadmin role without trusted platformRole", () => {
    const { res, next } = runGuard(requireSuperAdmin, {
      id: "legacy-user",
      role: "superadmin",
      platformRole: null,
    });

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("denies a company admin without platform authority", () => {
    const { res, next } = runGuard(requirePlatformRole("ceo"), {
      id: "tenant-admin",
      role: "admin",
      platformRole: null,
    });

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("authorizes platform authority independently of the tenant role", () => {
    const { res, next } = runGuard(requirePlatformRole("ceo"), {
      id: "platform-ceo",
      role: "owner",
      platformRole: "ceo",
    });

    expect(res.statusCode).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });
});
