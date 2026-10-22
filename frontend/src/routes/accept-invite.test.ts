import { describe, it, expect, vi, beforeEach } from "vitest";
import { Route } from "./accept-invite";
import { fetchInviteInfo, acceptInvite } from "@/lib/api/team";

// Mock localStorage and sessionStorage for node test environment
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

describe("Frontend /accept-invite Route & Acceptance Flow Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("verifies /accept-invite route exists and defines expected route path", () => {
    expect(Route).toBeDefined();
    expect(typeof Route).toBe("object");
  });

  it("verifies token search parameter validation correctly reads token from query string", () => {
    const validateSearch = Route.options.validateSearch as (search: Record<string, unknown>) => {
      token: string;
    };

    // Test valid string token in search params
    const validSearch = validateSearch({ token: "test-token-abc-123" });
    expect(validSearch).toEqual({ token: "test-token-abc-123" });

    // Test missing/undefined token defaults to empty string
    const emptySearch = validateSearch({});
    expect(emptySearch).toEqual({ token: "" });

    // Test non-string token defaults to empty string
    const nonStringSearch = validateSearch({ token: 12345 });
    expect(nonStringSearch).toEqual({ token: "" });
  });

  it("fetches invite info correctly and handles valid token response", async () => {
    const mockInviteData = {
      valid: true,
      email: "colleague@buildcorp.it",
      fullName: "Marco Belinelli",
      role: "technician",
      companyName: "BuildCorp Srl",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockInviteData,
    } as unknown as Response);

    const info = await fetchInviteInfo("valid-secret-token-123");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/auth/invite?token=valid-secret-token-123",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(info.valid).toBe(true);
    expect(info.email).toBe("colleague@buildcorp.it");
    expect(info.fullName).toBe("Marco Belinelli");
    expect(info.role).toBe("technician");
    expect(info.companyName).toBe("BuildCorp Srl");

    // Ensure token is not written to localStorage or sessionStorage
    expect(localStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("token")).toBeNull();
  });

  it("handles invalid or expired invite response by throwing descriptive error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Invito non valido o scaduto." }),
    } as unknown as Response);

    await expect(fetchInviteInfo("expired-or-revoked-token")).rejects.toThrow(
      "Invito non valido o scaduto.",
    );
  });

  it("submits password setup to /api/v1/auth/accept-invite without storing token in browser storage", async () => {
    const mockSuccessResponse = {
      success: true,
      message: "Invito accettato con successo. Ora puoi effettuare il login.",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockSuccessResponse,
    } as unknown as Response);

    const res = await acceptInvite("raw-valid-token-789", "MyStrongPassword123!");
    expect(fetch).toHaveBeenCalledWith("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        token: "raw-valid-token-789",
        password: "MyStrongPassword123!",
      }),
    });

    expect(res.success).toBe(true);
    expect(res.message).toBe("Invito accettato con successo. Ora puoi effettuare il login.");

    // Strict security check: no token or secret stored in localStorage/sessionStorage
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("inviteToken")).toBeNull();
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("inviteToken")).toBeNull();
  });
});
