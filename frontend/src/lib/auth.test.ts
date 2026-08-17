import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchServerSession, loginUser, signupUser, logoutUser, UserSession } from "./auth";

// Mock localStorage and sessionStorage for node environment
if (typeof globalThis.localStorage === "undefined") {
  const store: Record<string, string> = {};
  (globalThis as unknown as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => {
      store[key] = val;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
  };
}

if (typeof globalThis.sessionStorage === "undefined") {
  const store: Record<string, string> = {};
  (globalThis as unknown as Record<string, unknown>).sessionStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => {
      store[key] = val;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
  };
}

/**
  Frontend Authentication System Verification Suite
  
  Tests:
  1. app initialises auth with server fetch and loading state
  2. session valid (200 OK) -> authenticated UserSession returned
  3. 401 response -> returns null (unauthenticated)
  4. network error -> returns null (error state, NOT authenticated)
  5. login calls backend /api/v1/auth/login with credentials: "include"
  6. logout calls backend /api/v1/auth/logout with credentials: "include"
  7. no auth function uses localStorage or sessionStorage
  8. no token or secret is stored or exposed in UserSession
 */

describe("Server-Authoritative Auth Client (frontend/src/lib/auth.ts)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("1 & 2. fetchServerSession returns UserSession on 200 OK", async () => {
    const mockUser: UserSession = {
      id: "usr-123",
      email: "test@company.it",
      fullName: "Test User",
      role: "admin",
      companyId: "cmp-456",
      companyName: "Test Company Srl",
      provider: "local",
      emailConfirmed: true,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockUser,
    } as Response);

    const session = await fetchServerSession();
    expect(global.fetch).toHaveBeenCalledWith("/api/v1/auth/session", {
      method: "GET",
      credentials: "include",
      headers: expect.any(Object),
    });
    expect(session).toEqual(mockUser);
  });

  it("3. fetchServerSession returns null on 401 Unauthorized", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Not authenticated" }),
    } as Response);

    const session = await fetchServerSession();
    expect(session).toBeNull();
  });

  it("4. fetchServerSession returns null on network error without throwing or falling back", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network failed"));

    const session = await fetchServerSession();
    expect(session).toBeNull();
  });

  it("5. loginUser sends credentials: include to /api/v1/auth/login", async () => {
    const mockUser = {
      id: "usr-123",
      email: "test@company.it",
      fullName: "Test User",
      role: "admin",
      companyId: "cmp-456",
      companyName: "Test Company",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockUser,
    } as Response);

    const result = await loginUser("test@company.it", "password123");
    expect(global.fetch).toHaveBeenCalledWith("/api/v1/auth/login", {
      method: "POST",
      credentials: "include",
      headers: expect.any(Object),
      body: JSON.stringify({ email: "test@company.it", password: "password123" }),
    });
    expect(result.success).toBe(true);
    expect(result.user?.email).toBe("test@company.it");
  });

  it("6. logoutUser sends credentials: include to /api/v1/auth/logout", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: "Logged out" }),
    } as Response);

    await logoutUser();
    expect(global.fetch).toHaveBeenCalledWith("/api/v1/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: expect.any(Object),
    });
  });

  it("7. no auth function uses localStorage to save or read session", async () => {
    const setItemSpy = vi.spyOn(localStorage, "setItem");
    const getItemSpy = vi.spyOn(localStorage, "getItem");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "usr-1",
        email: "a@b.com",
        fullName: "A B",
        role: "admin",
        companyId: "c-1",
        companyName: "C",
      }),
    } as Response);

    await fetchServerSession();
    await loginUser("a@b.com", "pass");
    await signupUser("a@b.com", "pass", "A B");
    await logoutUser();

    expect(setItemSpy).not.toHaveBeenCalledWith("basegrid_user_session", expect.anything());
    expect(getItemSpy).not.toHaveBeenCalledWith("basegrid_user_session");
  });

  it("8. no token parameter exists on returned UserSession object", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "usr-1",
        email: "a@b.com",
        fullName: "A B",
        role: "admin",
        companyId: "c-1",
        companyName: "C",
      }),
    } as Response);

    const session = await fetchServerSession();
    expect(session).not.toBeNull();
    const rawRecord = session as unknown as Record<string, unknown>;
    expect(rawRecord.access_token).toBeUndefined();
    expect(rawRecord.token).toBeUndefined();
    expect(rawRecord.refreshToken).toBeUndefined();
  });

  it("9. fetchServerSession automatically triggers refresh when session returns 401", async () => {
    const mockUser = {
      id: "usr-refreshed",
      email: "refreshed@company.it",
      fullName: "Refreshed User",
      role: "admin",
      companyId: "cmp-456",
      companyName: "Refreshed Company",
    };

    global.fetch = vi
      .fn()
      // First call to /api/v1/auth/session returns 401
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Access token expired" }),
      } as Response)
      // Second call to /api/v1/auth/refresh succeeds with 200 OK
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUser,
      } as Response);

    const session = await fetchServerSession();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/v1/auth/session", {
      method: "GET",
      credentials: "include",
      headers: expect.any(Object),
    });
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: expect.any(Object),
    });
    expect(session?.id).toBe("usr-refreshed");
  });
});
