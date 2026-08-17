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
