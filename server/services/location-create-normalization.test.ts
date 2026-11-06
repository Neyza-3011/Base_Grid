import { describe, expect, it } from "vitest";
import { DatabaseStore } from "../db";
import { CustomerService } from "./customer.service";

describe("CustomerService location create normalization", () => {
  it("trims optional location fields before persistence", async () => {
    const service = new CustomerService(new DatabaseStore());
    const customer = await service.createCustomer("company-location-normalization", {
      displayName: "Cliente Test",
    });

    const location = await service.createLocation("company-location-normalization", customer.id, {
      name: "Sede Test",
      address: "Via Test 1",
      city: "Roma",
      province: " RM ",
      postalCode: " 00100 ",
      notes: "  Accesso dal retro  ",
    });

    expect(location.province).toBe("RM");
    expect(location.postalCode).toBe("00100");
    expect(location.notes).toBe("Accesso dal retro");
  });

  it("normalizes blank optional location fields to absent values", async () => {
    const service = new CustomerService(new DatabaseStore());
    const customer = await service.createCustomer("company-location-normalization", {
      displayName: "Cliente Test",
    });

    const location = await service.createLocation("company-location-normalization", customer.id, {
      name: "Sede Test",
      address: "Via Test 1",
      city: "Roma",
      province: "   ",
      postalCode: "",
      notes: "  ",
    });

    expect(location.province).toBeUndefined();
    expect(location.postalCode).toBeUndefined();
    expect(location.notes).toBeUndefined();
  });
});
