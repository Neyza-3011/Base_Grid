import { describe, expect, it } from "vitest";
import { DatabaseStore } from "../db";
import { CustomerService } from "./customer.service";

describe("CustomerService create input allowlisting", () => {
  it("trims optional customer metadata and normalizes blank values on create", async () => {
    const db = new DatabaseStore();
    const service = new CustomerService(db);
    const customer = await service.createCustomer("company-allowlist", {
      displayName: "Cliente Test",
      legalName: "  ACME Srl  ",
      vatNumber: " IT12345678901 ",
      taxCode: " RSSMRA80A01H501U ",
      phoneNumber: " 3331234567 ",
      notes: "  Cliente con accesso su appuntamento  ",
    });

    expect(customer.legalName).toBe("ACME Srl");
    expect(customer.vatNumber).toBe("IT12345678901");
    expect(customer.taxCode).toBe("RSSMRA80A01H501U");
    expect(customer.phoneNumber).toBe("3331234567");
    expect(customer.notes).toBe("Cliente con accesso su appuntamento");

    const blank = await service.createCustomer("company-allowlist", {
      displayName: "Cliente Senza Metadati",
      legalName: "  ",
      vatNumber: "",
      taxCode: " ",
      phoneNumber: "  ",
      notes: "",
    });
    expect(blank.legalName).toBeUndefined();
    expect(blank.vatNumber).toBeUndefined();
    expect(blank.taxCode).toBeUndefined();
    expect(blank.phoneNumber).toBeUndefined();
    expect(blank.notes).toBeUndefined();
  });

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
