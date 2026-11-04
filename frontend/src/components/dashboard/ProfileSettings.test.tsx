import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UserSession } from "../../lib/auth";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

import { ProfileSettings } from "./ProfileSettings";

const currentUser: UserSession = {
  id: "user-1",
  email: "user@example.test",
  fullName: "Test User",
  role: "admin",
  companyId: "company-1",
  companyName: "Test Company",
};

describe("ProfileSettings notification preferences", () => {
  it("does not present local-only notification preferences as configurable", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ProfileSettings, {
        currentUser,
        onUpdate: () => undefined,
      }),
    );

    expect(markup).toContain("Le preferenze di notifica non sono ancora configurabili");
    expect(markup).not.toContain('name="emailNotifications"');
    expect(markup).not.toContain('name="reportApprovalAlerts"');
  });
});
