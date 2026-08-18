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
  emailConfirmed?: boolean;
}): UserSession {
  return {
    id: data.id,
    email: data.email,
    fullName: data.fullName,
    role: data.role as "superadmin" | "admin" | "technician",
    companyId: data.companyId,
    companyName: data.companyName,
    provider: data.provider || "local",
    emailConfirmed: Boolean(data.emailConfirmed),
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
      return { success: true, user: parseUserSession(data) };
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
  Registers a new company and admin user on the backend.
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
      return { success: true, user: parseUserSession(data) };
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

/**
 * Verifies email using URL verification token.
 */
export async function verifyEmail(
  token: string,
): Promise<{ success: boolean; user?: UserSession; message?: string; error?: string }> {
  try {
    const res = await fetch("/api/v1/auth/verify-email", {
      method: "POST",
      headers: appendCsrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({ token }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return {
        success: true,
        user: data.user ? parseUserSession(data.user) : undefined,
        message: data.message || "Email verificata con successo.",
      };
    } else {
      return {
        success: false,
        error: data.detail || "Token di verifica non valido o scaduto.",
      };
    }
  } catch {
    return {
      success: false,
      error: "Errore di rete durante la verifica dell'email.",
    };
  }
}

/**
 * Requests sending a new email verification link.
 */
export async function resendVerificationEmail(
  email?: string,
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const res = await fetch("/api/v1/auth/resend-verification", {
      method: "POST",
      headers: appendCsrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({ email }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return {
        success: true,
        message: data.message || "Email di verifica inviata.",
      };
    } else {
      return {
        success: false,
        message: "",
        error: data.detail || "Impossibile inviare l'email di verifica.",
      };
    }
  } catch {
    return {
      success: false,
      message: "",
      error: "Errore di rete durante l'invio dell'email di verifica.",
    };
  }
}

/**
 * Requests password reset instructions.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const res = await fetch("/api/v1/auth/forgot-password", {
      method: "POST",
      headers: appendCsrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({ email }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return {
        success: true,
        message: data.message || "Istruzioni di recupero password inviate.",
      };
    } else {
      return {
        success: false,
        message: "",
        error: data.detail || "Impossibile elaborare la richiesta.",
      };
    }
  } catch {
    return {
      success: false,
      message: "",
      error: "Errore di rete durante la richiesta di recupero password.",
    };
  }
}

/**
 * Submits new password with reset token.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const res = await fetch("/api/v1/auth/reset-password", {
      method: "POST",
      headers: appendCsrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({ token, new_password: newPassword }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return {
        success: true,
        message: data.message || "Password reimpostata con successo.",
      };
    } else {
      return {
        success: false,
        message: "",
        error: data.detail || "Impossibile reimpostare la password.",
      };
    }
  } catch {
    return {
      success: false,
      message: "",
      error: "Errore di rete durante la reimpostazione della password.",
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
