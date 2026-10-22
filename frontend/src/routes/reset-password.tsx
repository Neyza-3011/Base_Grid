import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, CheckCircle2, XCircle, ArrowRight, KeyRound } from "lucide-react";
import { resetPassword } from "@/lib/auth";
import { BaseGridLogo } from "@/components/common/BaseGridLogo";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: typeof search.token === "string" ? search.token : "",
    };
  },
  head: () => ({
    meta: [
      { title: "Reimposta Password · BaseGrid" },
      { name: "description", content: "Reimposta la password del tuo account BaseGrid." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error("Token di recupero password mancante.");
      return;
    }

    if (password.length < 8) {
      toast.error("La password deve contenere almeno 8 caratteri.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Le password inserite non coincidono.");
      return;
    }

    setLoading(true);
    try {
      const res = await resetPassword(token, password);
      if (res.success) {
        setSuccess(true);
        toast.success(res.message || "Password aggiornata con successo!");
      } else {
        toast.error(res.error || "Impossibile reimpostare la password.");
      }
    } catch {
      toast.error("Errore di connessione durante la reimpostazione della password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-white flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">
        <div className="flex justify-center mb-6">
          <BaseGridLogo />
        </div>

        {!token && (
          <div className="text-center py-4 space-y-4">
            <div className="h-16 w-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-400">
              <XCircle className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Link Non Valido</h2>
              <p className="text-sm text-white/60 mt-2">
                Nessun token di reimpostazione password presente nella richiesta.
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-sm transition"
            >
              Torna al login
            </Link>
          </div>
        )}

        {token && !success && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-center">Nuova Password</h2>
              <p className="text-sm text-white/60 text-center mt-1">
                Inserisci una nuova password sicura per il tuo account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Nuova Password (min. 8 caratteri)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Conferma Password
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-primary text-white font-medium btn-glow hover:bg-primary/90 transition disabled:opacity-50 mt-2"
              >
                {loading ? "Aggiornamento in corso..." : "Reimposta Password"}
              </button>
            </form>
          </div>
        )}

        {token && success && (
          <div className="text-center py-4 space-y-5">
            <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Password Aggiornata!</h2>
              <p className="text-sm text-white/70 mt-2">
                La tua password è stata modificata con successo. Ora puoi effettuare il login.
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition shadow-lg shadow-primary/25"
            >
              Accedi con la nuova password <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
