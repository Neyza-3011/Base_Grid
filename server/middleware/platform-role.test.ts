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
      email: "jack.cardinali15@gmail.com",
      role: "owner",
      platformRole: "ceo",
    });

    expect(res.statusCode).toBe(200);
    expect(next).toHaveBeenCalledOnce();
  });

  it("denies requests when authentication middleware did not populate a user", () => {
    const { res, next } = runGuard(requirePlatformRole("ceo"), undefined);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      detail: "Accesso negato: permessi piattaforma insufficienti.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each(["superadmin", "admin", "owner", "", undefined])(
    "does not treat tenant or legacy role value %s as CEO platform authority",
    (platformRole) => {
      const { res, next } = runGuard(requirePlatformRole("ceo"), {
        id: "untrusted-role",
        role: "superadmin",
        platformRole,
      });

      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    },
  );

  it("keeps the legacy requireSuperAdmin alias restricted to the CEO platform role", () => {
    const { res, next } = runGuard(requireSuperAdmin, {
      id: "company-owner",
      role: "owner",
      platformRole: null,
    });

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
