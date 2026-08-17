export type UserSession = {
  id: string;
  email: string;
  fullName: string;
  role: "superadmin" | "admin" | "technician";
  companyId: string;
  companyName: string;
  provider?: string;
  emailConfirmed?: boolean;
};

// Clean up obsolete localStorage authentication keys from previous sessions
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("basegrid_user_session");
    localStorage.removeItem("rapportini_user_session");
    localStorage.removeItem("rapportini_registered_users");
  } catch {
    // Ignore storage restriction errors
  }
}

// Helper to parse backend user JSON into UserSession type
function parseUserSession(data: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  companyId: string;
  companyName: string;
  provider?: string;
}): UserSession {
  return {
    id: data.id,
    email: data.email,
    fullName: data.fullName,
    role: data.role as "superadmin" | "admin" | "technician",
    companyId: data.companyId,
    companyName: data.companyName,
    provider: data.provider || "local",
    emailConfirmed: true,
  };
}

/**
 * Triggers refresh of access token via HttpOnly refresh cookie.
 * On 200 OK, server updates access_token and refresh_token cookies (rotated).
 */
export async function refreshSession(): Promise<UserSession | null> {
  try {
    const res = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: appendCsrfHeaders({ Accept: "application/json" }),
      credentials: "include",
    });

    if (res.ok) {
      const data = await res.json();
      return parseUserSession(data);
    }
  } catch {
    // Network error or server unreachable - return null (unauthenticated)
  }
  return null;
}

/**
  Fetch current authenticated session strictly from the backend server via HttpOnly cookie.
  If access_token is expired (401) and allowRefresh is true, attempts a single token refresh.
  Returns UserSession on 200 OK, or null if unauthenticated or network error.
 */
export async function fetchServerSession(
  allowRefresh: boolean = true,
): Promise<UserSession | null> {
  try {
    const res = await fetch("/api/v1/auth/session", {
      method: "GET",
      headers: appendCsrfHeaders({ Accept: "application/json" }),
      credentials: "include",
    });

    if (res.ok) {
      const data = await res.json();
      return parseUserSession(data);
    } else if (res.status === 401 && allowRefresh) {
      // Access token expired - attempt automatic refresh once
      return await refreshSession();
    }
  } catch {
    // Network error or server unreachable - return null (unauthenticated)
  }

  // Strictly server-authoritative: return null on 401 or network failure
  return null;
}

/**
  Terminates user session on backend server and revokes HttpOnly cookies.
 */
export async function logoutUser(): Promise<void> {
  try {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: appendCsrfHeaders(),
      credentials: "include",
    });
  } catch {
    // Silent network failure on logout
  }
}

/**
  Authenticates user credentials against FastAPI backend.
 */
export async function loginUser(
  email: string,
  pass: string,
): Promise<{ success: boolean; user?: UserSession; error?: string }> {
  try {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: appendCsrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({ email, password: pass }),
    });

    if (res.ok) {
      const data = await res.json();
      const user: UserSession = {
        id: data.id,
        email: data.email,
        fullName: data.fullName,
        role: data.role as "superadmin" | "admin" | "technician",
        companyId: data.companyId,
        companyName: data.companyName,
        provider: data.provider || "local",
        emailConfirmed: true,
      };
      return { success: true, user };
    } else {
      const errorData = await res.json().catch(() => ({ detail: "Credenziali non valide." }));
      return {
        success: false,
        error: errorData.detail || "Email o password non validi.",
      };
    }
  } catch {
    return {
      success: false,
      error: "Errore di rete. Impossibile contattare il server.",
    };
  }
}

/**
  Registers a new company and admin user on the FastAPI backend.
 */
export async function signupUser(
  email: string,
  pass: string,
  fullName: string,
  companyName?: string,
): Promise<{ success: boolean; user?: UserSession; error?: string }> {
  try {
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: appendCsrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({
        email,
        password: pass,
        full_name: fullName,
        company_name: companyName || "BaseGrid Workspace",
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const user: UserSession = {
        id: data.id,
        email: data.email,
        fullName: data.fullName,
        role: data.role as "superadmin" | "admin" | "technician",
        companyId: data.companyId,
        companyName: data.companyName,
        provider: data.provider || "local",
        emailConfirmed: true,
      };
      return { success: true, user };
    } else {
      const errorData = await res
        .json()
        .catch(() => ({ detail: "Errore durante la registrazione." }));
      return {
        success: false,
        error: errorData.detail || "Email già registrata o non valida.",
      };
    }
  } catch {
    return {
      success: false,
      error: "Errore di rete. Impossibile contattare il server.",
    };
  }
}
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^|;\s*)csrf_token=([^;]+)/);
  return match ? match[2] : null;
}

export function appendCsrfHeaders(headers: HeadersInit = {}): HeadersInit {
  const csrf = getCsrfToken();
  if (csrf) {
    return { ...headers, "X-CSRF-Token": csrf };
  }
  return headers;
}
