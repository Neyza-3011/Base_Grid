import { appendCsrfHeaders } from "../auth";
import { UserRole } from "../../../server/types"; // using the same types from server

export interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  phoneNumber: string;
  isActive: boolean;
  provider: string;
  emailConfirmed: boolean;
  createdAt: string;
}

export interface CreateTeamMemberInput {
  email: string;
  fullName: string;
  role: UserRole;
  phoneNumber?: string;
}

export interface UpdateTeamMemberInput {
  fullName?: string;
  role?: UserRole;
  phoneNumber?: string;
}

export interface InviteResponse {
  member: TeamMember;
  inviteToken: string;
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const res = await fetch("/api/v1/users/team", {
    headers: appendCsrfHeaders({ Accept: "application/json" }),
    credentials: "include",
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Impossibile caricare il team." }));
    throw new Error(errorData.detail || "Impossibile caricare il team.");
  }
  return res.json();
}

export async function createTeamMember(data: CreateTeamMemberInput): Promise<InviteResponse> {
  const res = await fetch("/api/v1/users/team", {
    method: "POST",
    headers: appendCsrfHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Impossibile creare il membro del team." }));
    throw new Error(errorData.detail || "Impossibile creare il membro del team.");
  }
  return res.json();
}

export async function updateTeamMember(id: string, data: UpdateTeamMemberInput): Promise<TeamMember> {
  const res = await fetch(`/api/v1/users/team/${id}`, {
    method: "PUT",
    headers: appendCsrfHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Impossibile aggiornare il membro del team." }));
    throw new Error(errorData.detail || "Impossibile aggiornare il membro del team.");
  }
  return res.json();
}

export async function activateTeamMember(id: string): Promise<TeamMember> {
  const res = await fetch(`/api/v1/users/team/${id}/activate`, {
    method: "POST",
    headers: appendCsrfHeaders({ Accept: "application/json" }),
    credentials: "include",
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Impossibile attivare il membro." }));
    throw new Error(errorData.detail || "Impossibile attivare il membro.");
  }
  return res.json();
}

export async function deactivateTeamMember(id: string): Promise<TeamMember> {
  const res = await fetch(`/api/v1/users/team/${id}/deactivate`, {
    method: "POST",
    headers: appendCsrfHeaders({ Accept: "application/json" }),
    credentials: "include",
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "Impossibile disattivare il membro." }));
    throw new Error(errorData.detail || "Impossibile disattivare il membro.");
  }
  return res.json();
}
