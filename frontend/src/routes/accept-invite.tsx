import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Lock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  KeyRound,
  User,
  Building,
  Mail,
  Shield,
  Loader2,
} from "lucide-react";
import { fetchInviteInfo, acceptInvite, InviteInfo } from "@/lib/api/team";
import { BaseGridLogo } from "@/components/common/BaseGridLogo";
import { toast } from "sonner";

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: typeof search.token === "string" ? search.token : "",
    };
  },
  head: () => ({
    meta: [
      { title: "Accetta Invito · BaseGrid" },
      { name: "description", content: "Attiva il tuo account BaseGrid e imposta la tua password." },
    ],
  }),
  component: AcceptInvitePage,
});

export function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setInviteError("Token di invito non fornito. Verifica il link ricevuto.");
      setLoadingInvite(false);
      return;
    }

    let isMounted = true;
    setLoadingInvite(true);
    setInviteError(null);

    fetchInviteInfo(token)
      .then((info) => {
        if (isMounted) {
          setInviteInfo(info);
          setLoadingInvite(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setInviteError(err.message || "Invito non valido o scaduto.");
          setLoadingInvite(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error("Token di invito mancante.");
      return;
    }

    if (password.length < 8) {
      toast.error("La password deve contenere almeno 8 caratteri.");
      return;
    }

    if (password.length > 128) {
      toast.error("La password non può superare i 128 caratteri.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Le password inserite non coincidono.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await acceptInvite(token, password);
      if (res.success) {
        setSuccess(true);
        toast.success(res.message || "Account attivato con successo!");
        setTimeout(() => {
          navigate({ to: "/" });
        }, 2500);
      } else {
        toast.error("Impossibile attivare l'account.");
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Errore durante l'attivazione dell'account.";
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <BaseGridLogo />
        </div>
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-white">
          Attivazione Collaboratore
        </h2>
        <p className="mt-2 text-center text-sm text-white/60">
          Imposta la tua password per accedere alla piattaforma aziendale
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {loadingInvite ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-white/70">Verifica del link di invito in corso...</p>
            </div>
          ) : inviteError ? (
            <div className="space-y-6 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
                <XCircle className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white">Invito non valido o scaduto</h3>
                <p className="text-sm text-white/60">{inviteError}</p>
                <p className="text-xs text-white/40 pt-2">
                  Questo link potrebbe essere già stato utilizzato o il periodo di validità (7
                  giorni) potrebbe essere terminato. Contatta l'amministratore della tua azienda per
                  farti inviare un nuovo invito.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/"
                  className="w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-medium text-sm transition-colors"
                >
                  Torna alla schermata di accesso
                </Link>
              </div>
            </div>
          ) : success ? (
            <div className="space-y-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white">Account Attivato con Successo!</h3>
                <p className="text-sm text-white/60">
                  La tua password è stata configurata. Verrai reindirizzato alla pagina di login tra
                  pochi istanti.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/"
                  className="w-full inline-flex justify-center items-center gap-2 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm transition-all shadow-lg shadow-primary/25"
                >
                  <span>Accedi subito</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Invited user card */}
              {inviteInfo && (
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-white/50 border-b border-white/5 pb-2">
                    <span className="flex items-center gap-1.5 font-medium text-white/70">
                      <Building className="h-3.5 w-3.5 text-primary" />
                      {inviteInfo.companyName}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary-300 font-medium">
                      <Shield className="h-3 w-3" />
                      {inviteInfo.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                      {inviteInfo.fullName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-white/50 inline" />
                        {inviteInfo.fullName}
                      </p>
                      <p className="text-xs text-white/60 truncate flex items-center gap-1.5">
                        <Mail className="h-3 w-3 text-white/40 inline" />
                        {inviteInfo.email}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/80 uppercase tracking-wider mb-1.5">
                    Nuova Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-white/40">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Almeno 8 caratteri"
                      minLength={8}
                      maxLength={128}
                      disabled={submitting}
                      className="w-full bg-slate-950/60 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/80 uppercase tracking-wider mb-1.5">
                    Conferma Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-white/40">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ripeti la password"
                      minLength={8}
                      maxLength={128}
                      disabled={submitting}
                      className="w-full bg-slate-950/60 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div className="text-xs text-white/50 space-y-1 bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="font-medium text-white/70">Requisiti di sicurezza:</p>
                  <p className={password.length >= 8 ? "text-emerald-400" : "text-white/40"}>
                    • Minimo 8 caratteri
                  </p>
                  <p
                    className={
                      password && password === confirmPassword
                        ? "text-emerald-400"
                        : "text-white/40"
                    }
                  >
                    • Le due password devono coincidere
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting || password.length < 8 || password !== confirmPassword}
                  className="w-full flex justify-center items-center gap-2 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm transition-all shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Attivazione in corso...</span>
                    </>
                  ) : (
                    <>
                      <span>Attiva Account e Accedi</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="text-center pt-2">
                <Link
                  to="/"
                  className="text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  Hai già un account attivo? Accedi
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
