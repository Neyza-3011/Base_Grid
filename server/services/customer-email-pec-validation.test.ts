import { describe, expect, it } from "vitest";
import { DatabaseStore } from "../db";
import { BadRequestError } from "../errors";
import { CustomerService } from "./customer.service";

describe("CustomerService email and PEC validation", () => {
  it("rejects malformed customer email on create", async () => {
    const service = new CustomerService(new DatabaseStore());
    await expect(service.createCustomer("company-email-validation", {
      displayName: "Cliente Test",
      email: "not-an-email",
    })).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects malformed PEC on create", async () => {
    const service = new CustomerService(new DatabaseStore());
    await expect(service.createCustomer("company-email-validation", {
      displayName: "Cliente Test",
      pec: "pec-invalid",
    })).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects malformed email and PEC on update without changing existing values", async () => {
    const db = new DatabaseStore();
    const service = new CustomerService(db);
    const customer = await service.createCustomer("company-email-validation", {
      displayName: "Cliente Test",
      email: "cliente@example.it",
      pec: "cliente@pec.example.it",
    });

    await expect(service.updateCustomer("company-email-validation", customer.id, {
      email: "bad-email",
    })).rejects.toBeInstanceOf(BadRequestError);
    await expect(service.updateCustomer("company-email-validation", customer.id, {
      pec: "bad-pec",
    })).rejects.toBeInstanceOf(BadRequestError);

    const unchanged = await service.getCustomerById("company-email-validation", customer.id);
    expect(unchanged.email).toBe("cliente@example.it");
    expect(unchanged.pec).toBe("cliente@pec.example.it");
  });

  it("continues to allow clearing optional email and PEC values", async () => {
    const db = new DatabaseStore();
    const service = new CustomerService(db);
    const customer = await service.createCustomer("company-email-validation", {
      displayName: "Cliente Test",
      email: "cliente@example.it",
      pec: "cliente@pec.example.it",
    });

    const updated = await service.updateCustomer("company-email-validation", customer.id, {
      email: "",
      pec: "",
    });
    expect(updated.email).toBeUndefined();
    expect(updated.pec).toBeUndefined();
  });
});
