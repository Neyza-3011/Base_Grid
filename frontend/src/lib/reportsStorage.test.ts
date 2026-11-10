import { describe, expect, it } from "vitest";
import { formatLocalDateISO } from "./reportsStorage";

describe("formatLocalDateISO", () => {
  it("formats the local calendar date without converting through UTC", () => {
    const date = new Date(2026, 10, 10, 0, 15, 0);
    expect(formatLocalDateISO(date)).toBe("2026-11-10");
  });

  it("pads month and day", () => {
    expect(formatLocalDateISO(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });
});
