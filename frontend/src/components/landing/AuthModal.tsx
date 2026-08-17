import { useEffect, useState } from "react";
import { X, Mail, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { loginUser, signupUser } from "@/lib/auth";

export function AuthModal({
  open,
  mode,
  onClose,
  onSwitch,
}: {
  open: boolean;
  mode: "login" | "signup";
  onClose: () => void;
  onSwitch: (m: "login" | "signup") => void;
}) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "login") {
        const res = await loginUser(email, password);
        if (res.success && res.user) {
          toast.success(`Accesso effettuato! Benvenuto ${res.user.fullName}`);
          onClose();
          navigate({ to: "/dashboard" });
        } else {
          toast.error(res.error || "Credenziali non valide.");
        }
      } else {
        const res = await signupUser(email, password, fullName);
        if (res.success && res.user) {
          toast.success(
            "Account registrato! Email di conferma inviata con successo. Controlla la tua casella di posta.",
          );
          onClose();
          navigate({ to: "/dashboard" });
        } else {
          toast.error(res.error || "Errore durante la registrazione.");
        }
      }
    } catch {
      toast.error("Si è verificato un errore di connessione.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl glass-dark p-6 sm:p-8 text-white animate-in fade-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={onClose}
          aria-label="Chiudi"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg text-white/60 hover:text-white hover:bg-white/5"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-2xl font-semibold tracking-tight">
          {mode === "signup" ? "Prova Rapportini gratis" : "Bentornato"}
        </h2>
        <p className="mt-1 text-sm text-white/60">
          {mode === "signup"
            ? "30 giorni gratuiti. Autenticazione sicura via Email & Password."
            : "Accedi con le tue credenziali aziendali."}
        </p>

        <form onSubmit={submit} className="space-y-4 mt-6">
          {mode === "signup" && (
            <label className="block">
              <span className="sr-only">Nome e Cognome</span>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nome e cognome"
                  className="w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </label>
          )}
          <label className="block">
            <span className="sr-only">Email</span>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@azienda.it"
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </label>
          <label className="block">
            <span className="sr-only">Password</span>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-10 pr-3 text-sm text-white placeholder:text-white/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </label>

          <button
            disabled={loading}
            className="w-full h-11 rounded-xl bg-primary text-white font-medium btn-glow hover:bg-primary/90 active:scale-[0.98] transition disabled:opacity-60"
          >
            {loading
              ? "Attendere..."
              : mode === "signup"
                ? "Registrati & Invia Email Conferma"
                : "Accedi"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-white/60">
          {mode === "signup" ? "Hai già un account?" : "Non hai un account?"}{" "}
          <button
            type="button"
            className="text-white hover:underline font-medium"
            onClick={() => onSwitch(mode === "signup" ? "login" : "signup")}
          >
            {mode === "signup" ? "Accedi" : "Prova gratis"}
          </button>
        </p>
      </div>
    </div>
  );
}
