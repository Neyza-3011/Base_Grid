import { config } from "./config";

/**
 * Escapes special HTML characters to prevent XSS/HTML injection in email templates.
 */
export function escapeHtml(value: string): string {
  if (!value) return "";
  return value.replace(/[&<>"']/g, (match) => {
    switch (match) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return match;
    }
  });
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  type?: "email_verification" | "password_reset" | "notification";
  token?: string;
}

export interface IEmailService {
  sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }>;
  sendVerificationEmail(to: string, token: string, fullName?: string): Promise<{ success: boolean; error?: string }>;
  sendPasswordResetEmail(to: string, token: string, fullName?: string): Promise<{ success: boolean; error?: string }>;
}

/**
 * Dev & Test Email Adapter.
 * Captures sent emails in-memory for testing and development assertions.
 * Never leaks credentials or secrets to unmonitored sinks.
 */
export class DevEmailService implements IEmailService {
  public sentEmails: SendEmailOptions[] = [];

  public async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string }> {
    const messageId = `msg-dev-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    this.sentEmails.push(options);
    if (config.NODE_ENV !== "test") {
      console.log(`[DevEmailService] Email queued for ${options.to}: "${options.subject}"`);
    }
    return { success: true, messageId };
  }

  public async sendVerificationEmail(to: string, token: string, fullName?: string): Promise<{ success: boolean; error?: string }> {
    const frontendUrl = config.FRONTEND_URL || "http://localhost:5173";
    const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;
    const rawName = fullName ? fullName.trim() : "Gentile Utente";
    const safeName = escapeHtml(rawName);
    const safeVerificationUrl = escapeHtml(verificationUrl);

    const subject = "Conferma il tuo account BaseGrid";
    const text = `Ciao ${rawName},\n\nGrazie per esserti registrato su BaseGrid. Per confermare il tuo indirizzo email, visita il seguente link:\n${verificationUrl}\n\nIl link scadrà tra 24 ore.\n\nIl Team di BaseGrid`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #0f172a; font-size: 24px; font-weight: 700; margin: 0;">BaseGrid</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Piattaforma Gestione Rapportini & Interventi B2B</p>
        </div>
        <div style="background-color: #ffffff; padding: 32px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Conferma il tuo indirizzo email</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">
            Ciao <strong>${safeName}</strong>,<br>
            Grazie per aver creato il tuo account aziendale su BaseGrid. Per attivare tutte le funzionalità e completare la verifica, clicca sul pulsante qui sotto:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${safeVerificationUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
              Conferma Account
            </a>
          </div>
          <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 24px;">
            Se il pulsante non funziona, copia e incolla questo indirizzo nel tuo browser:<br>
            <a href="${safeVerificationUrl}" style="color: #2563eb; word-break: break-all;">${safeVerificationUrl}</a>
          </p>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 16px; border-top: 1px solid #f1f5f9; pt: 12px;">
            Questo link scadrà tra 24 ore. Se non hai richiesto tu questa registrazione, puoi ignorare questa email.
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      text,
      html,
      type: "email_verification",
      token,
    });
  }

  public async sendPasswordResetEmail(to: string, token: string, fullName?: string): Promise<{ success: boolean; error?: string }> {
    const frontendUrl = config.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const rawName = fullName ? fullName.trim() : "Gentile Utente";
    const safeName = escapeHtml(rawName);
    const safeResetUrl = escapeHtml(resetUrl);

    const subject = "Reimposta la password del tuo account BaseGrid";
    const text = `Ciao ${rawName},\n\nAbbiamo ricevuto una richiesta di reimpostazione della password per il tuo account BaseGrid.\n\nPer creare una nuova password, visita il seguente link:\n${resetUrl}\n\nIl link scadrà tra 1 ora.\n\nSe non hai richiesto tu la reimpostazione, puoi ignorare questo messaggio.\n\nIl Team di BaseGrid`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #0f172a; font-size: 24px; font-weight: 700; margin: 0;">BaseGrid</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Piattaforma Gestione Rapportini & Interventi B2B</p>
        </div>
        <div style="background-color: #ffffff; padding: 32px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Reimpostazione Password</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">
            Ciao <strong>${safeName}</strong>,<br>
            Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account BaseGrid. Clicca sul pulsante qui sotto per impostarne una nuova:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${safeResetUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
              Reimposta Password
            </a>
          </div>
          <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 24px;">
            Se il pulsante non funziona, copia e incolla questo indirizzo nel tuo browser:<br>
            <a href="${safeResetUrl}" style="color: #2563eb; word-break: break-all;">${safeResetUrl}</a>
          </p>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 16px; border-top: 1px solid #f1f5f9; pt: 12px;">
            Questo link è valido per 1 ora. Se non hai richiesto tu la reimpostazione della password, puoi ignorare in tutta sicurezza questa email.
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      text,
      html,
      type: "password_reset",
      token,
    });
  }

  public getLastEmail(): SendEmailOptions | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  public clear(): void {
    this.sentEmails = [];
  }
}

/**
 * Production-Grade Email Service using Resend.
 * Implements real HTTP API dispatch to Resend with timeout, error handling,
 * fail-closed security, and zero logging of raw tokens or credentials.
 */
export class ProductionEmailService implements IEmailService {
  private provider: string;

  constructor() {
    const env = process.env.NODE_ENV || config.NODE_ENV;
    const provider = process.env.EMAIL_PROVIDER || config.EMAIL_PROVIDER || "resend";
    const apiKey = process.env.EMAIL_API_KEY || config.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM || config.EMAIL_FROM;
    const frontendUrl = process.env.FRONTEND_URL || config.FRONTEND_URL;

    this.provider = provider;

    if (env === "production") {
      if (this.provider !== "resend") {
        throw new Error("CRITICAL EMAIL CONFIG ERROR: EMAIL_PROVIDER must be 'resend' in production.");
      }
      if (!process.env.EMAIL_API_KEY) {
        throw new Error("CRITICAL EMAIL CONFIG ERROR: EMAIL_API_KEY is required in production.");
      }
      if (!process.env.EMAIL_FROM) {
        throw new Error("CRITICAL EMAIL CONFIG ERROR: EMAIL_FROM is required in production.");
      }
      if (!process.env.FRONTEND_URL) {
        throw new Error("CRITICAL EMAIL CONFIG ERROR: FRONTEND_URL is required in production.");
      }
    }
  }

  public async sendEmail(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const provider = process.env.EMAIL_PROVIDER || config.EMAIL_PROVIDER || "resend";
    const apiKey = process.env.EMAIL_API_KEY || config.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM || config.EMAIL_FROM;
    const env = process.env.NODE_ENV || config.NODE_ENV;

    if (provider !== "resend") {
      if (env === "production") {
        throw new Error("CRITICAL EMAIL CONFIG ERROR: Unsupported EMAIL_PROVIDER in production.");
      }
      return { success: false, error: "email_provider_not_supported" };
    }

    if (!apiKey) {
      if (env === "production") {
        throw new Error("CRITICAL EMAIL CONFIG ERROR: EMAIL_API_KEY is missing in production.");
      }
      return { success: false, error: "missing_email_api_key" };
    }

    if (!from) {
      if (env === "production") {
        throw new Error("CRITICAL EMAIL CONFIG ERROR: EMAIL_FROM is missing in production.");
      }
      return { success: false, error: "missing_email_from" };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const status = response.status;
        if (config.NODE_ENV !== "test") {
          console.error(`[ProductionEmailService] Resend API HTTP error ${status}`);
        }
        return { success: false, error: `provider_error_${status}` };
      }

      const data = await response.json();
      if (!data || typeof data.id !== "string" || !data.id) {
        if (config.NODE_ENV !== "test") {
          console.error("[ProductionEmailService] Resend API response missing valid message id");
        }
        return { success: false, error: "invalid_provider_response" };
      }

      return { success: true, messageId: data.id };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        if (config.NODE_ENV !== "test") {
          console.error("[ProductionEmailService] Resend API request timed out");
        }
        return { success: false, error: "provider_timeout" };
      }
      if (config.NODE_ENV !== "test") {
        console.error("[ProductionEmailService] Resend API network error");
      }
      return { success: false, error: "provider_network_error" };
    }
  }

  public async sendVerificationEmail(to: string, token: string, fullName?: string): Promise<{ success: boolean; error?: string }> {
    const frontendUrl = config.FRONTEND_URL || "https://app.basegrid.io";
    const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;
    const rawName = fullName ? fullName.trim() : "Gentile Utente";
    const safeName = escapeHtml(rawName);
    const safeVerificationUrl = escapeHtml(verificationUrl);

    const subject = "Conferma il tuo account BaseGrid";
    const text = `Ciao ${rawName},\n\nGrazie per esserti registrato su BaseGrid. Per confermare il tuo indirizzo email, visita il seguente link:\n${verificationUrl}\n\nIl link scadrà tra 24 ore.\n\nIl Team di BaseGrid`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #0f172a; font-size: 24px; font-weight: 700; margin: 0;">BaseGrid</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Piattaforma Gestione Rapportini & Interventi B2B</p>
        </div>
        <div style="background-color: #ffffff; padding: 32px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Conferma il tuo indirizzo email</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">
            Ciao <strong>${safeName}</strong>,<br>
            Grazie per aver creato il tuo account aziendale su BaseGrid. Per attivare tutte le funzionalità e completare la verifica, clicca sul pulsante qui sotto:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${safeVerificationUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
              Conferma Account
            </a>
          </div>
          <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 24px;">
            Se il pulsante non funziona, copia e incolla questo indirizzo nel tuo browser:<br>
            <a href="${safeVerificationUrl}" style="color: #2563eb; word-break: break-all;">${safeVerificationUrl}</a>
          </p>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 16px; border-top: 1px solid #f1f5f9; pt: 12px;">
            Questo link scadrà tra 24 ore. Se non hai richiesto tu questa registrazione, puoi ignorare questa email.
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      text,
      html,
      type: "email_verification",
      token,
    });
  }

  public async sendPasswordResetEmail(to: string, token: string, fullName?: string): Promise<{ success: boolean; error?: string }> {
    const frontendUrl = config.FRONTEND_URL || "https://app.basegrid.io";
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const rawName = fullName ? fullName.trim() : "Gentile Utente";
    const safeName = escapeHtml(rawName);
    const safeResetUrl = escapeHtml(resetUrl);

    const subject = "Reimposta la password del tuo account BaseGrid";
    const text = `Ciao ${rawName},\n\nAbbiamo ricevuto una richiesta di reimpostazione della password per il tuo account BaseGrid.\n\nPer creare una nuova password, visita il seguente link:\n${resetUrl}\n\nIl link scadrà tra 1 ora.\n\nSe non hai richiesto tu la reimpostazione, puoi ignorare questo messaggio.\n\nIl Team di BaseGrid`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #0f172a; font-size: 24px; font-weight: 700; margin: 0;">BaseGrid</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Piattaforma Gestione Rapportini & Interventi B2B</p>
        </div>
        <div style="background-color: #ffffff; padding: 32px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Reimpostazione Password</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">
            Ciao <strong>${safeName}</strong>,<br>
            Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account BaseGrid. Clicca sul pulsante qui sotto per impostarne una nuova:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${safeResetUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
              Reimposta Password
            </a>
          </div>
          <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 24px;">
            Se il pulsante non funziona, copia e incolla questo indirizzo nel tuo browser:<br>
            <a href="${safeResetUrl}" style="color: #2563eb; word-break: break-all;">${safeResetUrl}</a>
          </p>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 16px; border-top: 1px solid #f1f5f9; pt: 12px;">
            Questo link è valido per 1 ora. Se non hai richiesto tu la reimpostazione della password, puoi ignorare in tutta sicurezza questa email.
          </p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      text,
      html,
      type: "password_reset",
      token,
    });
  }
}

export function createEmailService(): IEmailService {
  if (config.NODE_ENV === "production" || config.EMAIL_PROVIDER === "resend") {
    return new ProductionEmailService();
  }
  return new DevEmailService();
}

export const emailService = createEmailService();
