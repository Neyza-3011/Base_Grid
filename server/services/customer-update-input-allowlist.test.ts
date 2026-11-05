import { describe, expect, it } from "vitest";
import { DatabaseStore } from "../db";
import { CustomerService } from "./customer.service";

describe("CustomerService update input allowlisting", () => {
  it("ignores caller-controlled isActive when updating a customer", async () => {
    const db = new DatabaseStore();
    const service = new CustomerService(db);
    const customer = await service.createCustomer("company-allowlist-update", {
      displayName: "Cliente Test",
    });

    const updated = await service.updateCustomer("company-allowlist-update", customer.id, {
      notes: "Nota aggiornata",
      isActive: false,
    } as any);

    expect(updated.isActive).toBe(true);
    expect(updated.notes).toBe("Nota aggiornata");
  });

  it("ignores caller-controlled isActive when updating a location", async () => {
    const db = new DatabaseStore();
    const service = new CustomerService(db);
    const customer = await service.createCustomer("company-allowlist-update", {
      displayName: "Cliente Test",
    });
    const location = await service.createLocation("company-allowlist-update", customer.id, {
      name: "Sede Test",
      address: "Via Test 1",
      city: "Roma",
    });

    const updated = await service.updateLocation("company-allowlist-update", location.id, {
      notes: "Nota aggiornata",
      isActive: false,
    } as any);

    expect(updated.isActive).toBe(true);
    expect(updated.notes).toBe("Nota aggiornata");
  });
});
