import { describe, expect, it } from "vitest";
import { DatabaseStore } from "./db";

describe("DatabaseStore.consumeAuthToken expiry", () => {
  it("does not consume an expired token", async () => {
    const db = new DatabaseStore();
    await db.createAuthToken({
      userId: "user-expired",
      tokenHash: "expired-token-hash",
      type: "email_verification",
      expiresAt: new Date(Date.now() - 1).toISOString(),
    });

    await expect(db.consumeAuthToken("expired-token-hash", "email_verification")).resolves.toBe(false);
    await expect(db.findAuthTokenByHash("expired-token-hash", "email_verification")).resolves.toMatchObject({
      consumed: false,
    });
  });

  it("still consumes a valid token exactly once", async () => {
    const db = new DatabaseStore();
    await db.createAuthToken({
      userId: "user-valid",
      tokenHash: "valid-token-hash",
      type: "email_verification",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(db.consumeAuthToken("valid-token-hash", "email_verification")).resolves.toBe(true);
    await expect(db.consumeAuthToken("valid-token-hash", "email_verification")).resolves.toBe(false);
  });
});
