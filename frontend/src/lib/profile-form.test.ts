import { describe, expect, it } from "vitest";
import { buildProfileUpdatePayload } from "./profile-form";

describe("buildProfileUpdatePayload", () => {
  it("submits the editable phone number using the backend field name", () => {
    expect(
      buildProfileUpdatePayload({
        fullName: "Mario Rossi",
        email: "mario@example.it",
        phone: "  +39 333 1234567  ",
        newPassword: "",
        currentPassword: "",
      }),
    ).toEqual({
      full_name: "Mario Rossi",
      email: "mario@example.it",
      phone_number: "+39 333 1234567",
    });
  });

  it("sends the current password whenever a new password is requested", () => {
    expect(
      buildProfileUpdatePayload({
        fullName: "Mario Rossi",
        email: "mario@example.it",
        phone: "+39 333 1234567",
        newPassword: "NewSecurePassword123!",
        currentPassword: "CurrentSecurePassword123!",
      }),
    ).toEqual({
      full_name: "Mario Rossi",
      email: "mario@example.it",
      phone_number: "+39 333 1234567",
      password: "NewSecurePassword123!",
      current_password: "CurrentSecurePassword123!",
    });
  });
});
