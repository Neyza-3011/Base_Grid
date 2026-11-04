export type ProfileUpdateFormData = {
  fullName: string;
  email: string;
  phone: string;
  newPassword: string;
  currentPassword: string;
};

export type ProfileUpdatePayload = {
  full_name: string;
  email: string;
  phone_number: string;
  password?: string;
  current_password?: string;
};

/** Map the editable profile form to the server's /users/me contract. */
export function buildProfileUpdatePayload(formData: ProfileUpdateFormData): ProfileUpdatePayload {
  const payload: ProfileUpdatePayload = {
    full_name: formData.fullName,
    email: formData.email,
    phone_number: formData.phone.trim(),
  };

  if (formData.newPassword) {
    payload.password = formData.newPassword;
    payload.current_password = formData.currentPassword;
  }

  return payload;
}
