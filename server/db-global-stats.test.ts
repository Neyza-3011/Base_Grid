import { describe, expect, it } from "vitest";
import { DatabaseStore } from "./db";

describe("in-memory global platform stats", () => {
  it("reports the actual number of customers rather than a fixed placeholder", async () => {
    const store = new DatabaseStore();
    const before = await store.getGlobalStats();

    await store.createCustomer("comp-rossi-001", { displayName: "Stats regression customer" });

    const after = await store.getGlobalStats();
    expect(after.total_clients).toBe(before.total_clients + 1);
  });
});
