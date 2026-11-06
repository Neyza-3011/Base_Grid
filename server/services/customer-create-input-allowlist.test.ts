import { describe, expect, it } from "vitest";
import { DatabaseStore } from "../db";
import { CustomerService } from "./customer.service";

describe("CustomerService create input allowlisting", () => {
  it("does not accept caller-controlled id or isActive when creating a customer", async () => {
    const db = new DatabaseStore();
    const service = new CustomerService(db);

    const customer = await service.createCustomer("company-allowlist", {
      displayName: "Cliente Test",
      id: "attacker-chosen-customer-id",
      isActive: false,
    } as any);

    expect(customer.id).not.toBe("attacker-chosen-customer-id");
    expect(customer.isActive).toBe(true);
  });

  it("does not accept caller-controlled id or isActive when creating a location", async () => {
    const db = new DatabaseStore();
    const service = new CustomerService(db);
    const customer = await service.createCustomer("company-allowlist", {
      displayName: "Cliente Test",
    });

    const location = await service.createLocation("company-allowlist", customer.id, {
      name: "Sede Test",
      address: "Via Test 1",
      city: "Roma",
      id: "attacker-chosen-location-id",
      isActive: false,
    } as any);

    expect(location.id).not.toBe("attacker-chosen-location-id");
    expect(location.isActive).toBe(true);
  });
});
