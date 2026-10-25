import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { DatabaseStore } from "./db";

describe("In-memory user creation concurrency contract", () => {
  it("allows at most one concurrent registration for the same normalized email", async () => {
    const db = new DatabaseStore();
    const email = `race-${randomUUID()}@example.test`;
    const params = {
      email,
      fullName: "Concurrent Registration",
      password: "TestPassword123!",
      companyName: "Concurrency Test",
    };

    const results = await Promise.allSettled([
      db.createUser(params),
      db.createUser({ ...params, email: ` ${email.toUpperCase()} ` }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await db.findUserByEmail(email)).not.toBeNull();
  });

  it("reuses the same Google user for concurrent sign-ins with the same normalized email", async () => {
    const db = new DatabaseStore();
    const email = `google-race-${randomUUID()}@example.test`;
    const params = { email, fullName: "Concurrent Google User" };

    const [first, second] = await Promise.all([
      db.createGoogleUser(params),
      db.createGoogleUser({ ...params, email: ` ${email.toUpperCase()} ` }),
    ]);

    expect(first.user.id).toBe(second.user.id);
    expect(await db.findUserByEmail(email)).toMatchObject({
      id: first.user.id,
      provider: "google",
    });
  });
});
