import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticate } from "./auth";
import { config } from "../config";
import { db } from "../db";
import { generateTokens } from "../security";

describe("authentication middleware canonical CEO identity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not let a non-canonical user with a stale ceo role bypass tenant suspension", async () => {
    process.env.JWT_SECRET = "test-cryptographic-jwt-secret-key-must-be-32-chars-long-secure!";
    config.EMAIL_VERIFICATION_ENABLED = false;

    const user = {
      id: "usr-stale-ceo",
      email: "not-the-ceo@example.com",
      fullName: "Stale CEO Flag",
      role: "owner",
      platformRole: "ceo",
      companyId: "comp-suspended-test",
      companyName: "Suspended Tenant",
      passwordHash: "not-used",
      salt: "not-used",
      isActive: true,
      provider: "local",
      emailConfirmed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      authVersion: 0,
    };
    const company = {
      id: user.companyId,
      name: "Suspended Tenant",
      address: "Via Test 1",
      isActive: false,
    };

    vi.spyOn(db, "findUserById").mockResolvedValue(user as any);
    vi.spyOn(db, "findCompanyById").mockResolvedValue(company as any);

    const { accessToken } = generateTokens(user as any);
    const response = {
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
    let nextCalled = false;
    let finish!: () => void;
    const completed = new Promise<void>((resolve) => {
      finish = resolve;
    });

    authenticate(
      {
        cookies: { access_token: accessToken },
        path: "/api/v1/reports",
        baseUrl: "",
      } as any,
      response as any,
      (() => {
        nextCalled = true;
        finish();
      }) as any,
    );

    // Resolve when the middleware writes a response, or when next() is called.
    const originalJson = response.json.bind(response);
    response.json = (body: unknown) => {
      originalJson(body);
      finish();
      return response;
    };
    await completed;

    expect(nextCalled).toBe(false);
    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({
      code: "COMPANY_SUSPENDED",
      detail: "L'accesso all'azienda è stato sospeso dalla piattaforma.",
    });
  });
});
