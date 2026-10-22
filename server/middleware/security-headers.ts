import { Request, Response, NextFunction, RequestHandler } from "express";
import { config } from "../config";

export interface SecurityHeadersOptions {
  isProduction?: boolean;
}

/**
 * Note on Content-Security-Policy (CSP):
 * TanStack Start / Nitro / Vite dev runtime generate dynamic inline hydration scripts
 * and route stream barriers (<script> tags injected by TanStack Router without nonces).
 * Introducing a strict CSP at this stage would require either:
 *  a) 'unsafe-inline' / 'unsafe-eval' (which creates a false sense of security and violates security standards), or
 *  b) breaking SSR hydration and Vite development HMR / client preamble.
 * Therefore, per enterprise architecture governance (P0.4.4-G requirement 2),
 * CSP is left out-of-scope and documented for a subsequent dedicated hardening pipeline
 * with dynamic nonce injection through Nitro/TanStack transformers.
 */

/**
 * Centralized HTTP Security Headers Middleware.
 * Enforces baseline HTTP security headers across API and frontend responses:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
 * - Strict-Transport-Security: max-age=31536000; includeSubDomains (production HTTPS only)
 */
export function createSecurityHeadersMiddleware(options?: SecurityHeadersOptions): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction): void => {
    // 1. Prevent MIME-type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");

    // 2. Prevent clickjacking
    res.setHeader("X-Frame-Options", "DENY");

    // 3. Referrer leak protection
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // 4. Feature / Permissions policy for unused browser capabilities
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );

    // 5. HTTP Strict Transport Security (HSTS)
    // Applied in production only. Strictly omitted in development and local environments.
    const isProd =
      options?.isProduction !== undefined
        ? options.isProduction
        : process.env.NODE_ENV === "production" || config.NODE_ENV === "production";

    if (isProd) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
  };
}

export const securityHeaders = createSecurityHeadersMiddleware();
