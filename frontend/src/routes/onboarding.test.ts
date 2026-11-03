import { describe, expect, it, vi } from "vitest";
import { loadCompanySettings } from "./onboarding";

describe("loadCompanySettings", () => {
  it("loads and normalizes persisted company settings without requesting the logo", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: "  Impianti Alpha Srl  ",
        vat_number: null,
        address: "Via Roma 10",
        default_hourly_rate: "42.5",
        report_footer_notes: "Note",
      }),
    } as unknown as Response);

    await expect(loadCompanySettings(fetcher)).resolves.toEqual({
      name: "  Impianti Alpha Srl  ",
      vat_number: "",
      address: "Via Roma 10",
      default_hourly_rate: 42.5,
      report_footer_notes: "Note",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/company/settings?include_logo=false",
      expect.objectContaining({
        credentials: "include",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it.each([null, undefined, ""])("defaults an absent hourly rate to zero (%s)", async (rate) => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ default_hourly_rate: rate }),
    } as unknown as Response);

    await expect(loadCompanySettings(fetcher)).resolves.toMatchObject({
      default_hourly_rate: 0,
    });
  });

  it.each(["not-a-number", -1, 10001, true, {}])(
    "rejects an invalid persisted hourly rate (%s)",
    async (rate) => {
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ default_hourly_rate: rate }),
      } as unknown as Response);

      await expect(loadCompanySettings(fetcher)).rejects.toThrow(
        "La tariffa oraria predefinita ricevuta non è valida.",
      );
    },
  );

  it("rejects a non-success response so the onboarding screen can offer retry", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as unknown as Response);

    await expect(loadCompanySettings(fetcher)).rejects.toThrow(
      "Impossibile leggere le impostazioni aziendali.",
    );
  });

  it("propagates network failures instead of converting them into empty settings", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(loadCompanySettings(fetcher)).rejects.toThrow("Failed to fetch");
  });
});
