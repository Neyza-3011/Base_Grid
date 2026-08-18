import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, ArrowRight, Mail } from "lucide-react";
import { verifyEmail, resendVerificationEmail } from "@/lib/auth";
import { BaseGridLogo } from "@/components/common/BaseGridLogo";
import { toast } from "sonner";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: typeof search.token === "string" ? search.token : "",
    };
  },
  head: () => ({
    meta: [
      { title: "Verifica Email · BaseGrid" },
      { name: "description", content: "Verifica il tuo indirizzo email su BaseGrid." },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { token } = Route.useSearch();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error",
  );
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "Nessun token di verifica fornito nella richiesta.",
  );
  const [resending, setResending] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    async function executeVerification() {
      try {
        const res = await verifyEmail(token);
        if (!mounted) return;
        if (res.success) {
          setStatus("success");
          toast.success("Email verificata con successo!");
        } else {
          setStatus("error");
          setErrorMessage(res.error || "Token di verifica non valido o scaduto.");
        }
      } catch {
        if (!mounted) return;
        setStatus("error");
        setErrorMessage("Errore di rete durante la verifica.");
      }
    }

    executeVerification();
    return () => {
      mounted = false;
    };
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;
    setResending(true);
    try {
      const res = await resendVerificationEmail(resendEmail);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.error || "Impossibile inviare l'email di verifica.");
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-white flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
        <div className="flex justify-center mb-6">
          <BaseGridLogo />
        </div>

        {status === "loading" && (
          <div className="text-center py-6 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">Verifica email in corso...</h2>
            <p className="text-sm text-white/60">
              Stiamo convalidando il tuo link di conferma sul server.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center py-4 space-y-5">
            <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Email Verificata!</h2>
              <p className="text-sm text-white/70 mt-2">
                Il tuo account BaseGrid è ora completamente verificato e attivo.
              </p>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition shadow-lg shadow-primary/25"
            >
              Vai alla Dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="text-center py-4 space-y-5">
            <div className="h-16 w-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-400">
              <XCircle className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Verifica non riuscita</h2>
              <p className="text-sm text-red-400/90 mt-2 font-medium">{errorMessage}</p>
            </div>

            <div className="pt-4 border-t border-white/10 text-left space-y-3">
              <h3 className="text-sm font-semibold text-white/90">
                Richiedi un nuovo link di verifica:
              </h3>
              <form onSubmit={handleResend} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <input
                    type="email"
                    required
                    placeholder="email@azienda.it"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    className="w-full h-10 rounded-xl bg-white/5 border border-white/10 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={resending}
                  className="w-full h-10 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-sm transition disabled:opacity-50"
                >
                  {resending ? "Invio in corso..." : "Invia nuovo link di conferma"}
                </button>
              </form>
            </div>

            <div className="pt-2">
              <Link to="/" className="text-xs text-white/60 hover:text-white transition">
                Torna alla pagina iniziale
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
