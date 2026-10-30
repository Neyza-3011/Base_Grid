import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { DatabaseStore } from "./db";

describe("Platform admin audit event persistence contract", () => {
  it("persists safe event metadata and returns events newest-first with a bounded limit", async () => {
    const store = new DatabaseStore();
    const actor = await store.findUserByEmail("jack.cardinali15@gmail.com");
    expect(actor).toBeTruthy();

    const first = await store.createAdminAuditEvent({
      actorUserId: actor!.id,
      action: "tenant.profile.updated",
      targetType: "company",
      targetId: "comp-rossi-001",
      metadata: { fields: "name,address", changed_count: 2 },
    });
    await store.createAdminAuditEvent({
      actorUserId: actor!.id,
      action: "tenant.user.deactivated",
      targetType: "user",
      targetId: "usr-rossi-tech",
      metadata: { reason: "admin_action" },
    });

    const events = await store.getAdminAuditEvents(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorUserId: actor!.id,
      action: "tenant.user.deactivated",
      targetType: "user",
      targetId: "usr-rossi-tech",
      metadata: { reason: "admin_action" },
    });
    expect(first.id).toMatch(/^audit-/);
    expect(JSON.stringify(events)).not.toContain("passwordHash");
    expect(JSON.stringify(events)).not.toContain("tokenHash");
  });

  it("rejects audit events with a nonexistent actor", async () => {
    const store = new DatabaseStore();
    await expect(store.createAdminAuditEvent({
      actorUserId: "missing-actor",
      action: "tenant.profile.updated",
      targetType: "company",
      targetId: "comp-rossi-001",
    })).rejects.toThrow("ADMIN_AUDIT_ACTOR_NOT_FOUND");
    expect(await store.getAdminAuditEvents()).toHaveLength(0);
  });

  it("defines a durable PostgreSQL audit table with constrained target type and actor retention", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "migrations/012_admin_audit_events.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS admin_audit_events");
    expect(sql).toContain('REFERENCES users(id) ON DELETE RESTRICT');
    expect(sql).toContain("CHECK (\"targetType\" IN ('company', 'user', 'platform'))");
    expect(sql).toContain("CHECK (jsonb_typeof(metadata) = 'object')");
    expect(sql).toContain('idx_admin_audit_events_target');
  });
});
