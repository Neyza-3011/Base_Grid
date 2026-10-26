import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { InterventionsView } from "./InterventionsView";
import { UserSession } from "@/lib/auth";

const mockAdminUser: UserSession = {
  id: "usr-1",
  companyId: "comp-1",
  companyName: "Test Company",
  email: "admin@test.com",
  role: "admin",
  fullName: "Admin User",
};

describe("InterventionsView Component Accessibility and Semantics", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], total: 0 }),
    });
  });

  it("exports InterventionsView function", () => {
    expect(typeof InterventionsView).toBe("function");
  });

  it("renders accessible filter bar with aria-label attributes", () => {
    const html = renderToString(
      React.createElement(InterventionsView, {
        currentUser: mockAdminUser,
      }),
    );

    expect(html).toContain('aria-label="Cerca interventi per descrizione, problema o note"');
    expect(html).toContain('aria-label="Filtra per stato intervento"');
    expect(html).toContain('aria-label="Filtra per priorità"');
    expect(html).toContain('aria-label="Filtra per cliente"');
    expect(html).toContain('aria-label="Filtra per tecnico"');
  });

  it("renders header and action controls properly", () => {
    const html = renderToString(
      React.createElement(InterventionsView, {
        currentUser: mockAdminUser,
      }),
    );

    expect(html).toContain("Interventi");
    expect(html).toContain("Nuovo Intervento");
  });
});
