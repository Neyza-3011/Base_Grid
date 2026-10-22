import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, ShieldCheck, Zap, CreditCard, ArrowLeft, Building2 } from "lucide-react";
import { fetchServerSession, UserSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: "Piani e Abbonamento · BaseGrid" },
      {
        name: "description",
        content: "Scegli il piano ideale per la tua impresa e attiva l'abbonamento.",
      },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchServerSession().then((usr) => {
      if (usr) {
        setCurrentUser(usr);
      } else {
        toast.error("Sessione non valida o scaduta. Effettua l'accesso.");
        navigate({ to: "/" });
      }
    });
  }, [navigate]);

  const handleCheckout = (planName: string, price: string) => {
    setLoading(true);
    toast.loading(`Inizializzazione Stripe Checkout per ${planName}...`);
    setTimeout(() => {
      toast.dismiss();
      toast.success(`Abbonamento ${planName} attivo! Reindirizzamento in corso...`);
      setLoading(false);
      navigate({ to: "/dashboard" });
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex flex-col justify-between p-4 sm:p-8">
      <div className="max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate({ to: "/dashboard" })}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Abbonamento & Gateway Stripe</h1>
              <p className="text-xs text-white/60">
                {currentUser?.companyName || "Azienda B2B"} · Multi-tenant Subscription
              </p>
            </div>
          </div>
          {currentUser && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
              <Building2 className="h-4 w-4 text-emerald-400" />
              <span>{currentUser.email}</span>
            </div>
          )}
        </div>

        {/* Title */}
        <div className="text-center my-10 max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <ShieldCheck className="h-3.5 w-3.5" /> 30 Giorni di Prova Attivi
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Scegli il piano per la tua squadra
          </h2>
          <p className="mt-2 text-white/70 text-sm">
            Tutti i piani includono rapportini digitali illimitati, firma del cliente su tablet,
            export PDF e conservazione sostitutiva.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
          {/* Starter */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 flex flex-col justify-between hover:border-white/20 transition">
            <div>
              <h3 className="text-lg font-bold">Starter Artigiani</h3>
              <p className="text-xs text-white/60 mt-1">Fino a 3 tecnici sul campo</p>
              <div className="my-6">
                <span className="text-3xl font-extrabold">€29</span>
                <span className="text-xs text-white/60"> / mese + IVA</span>
              </div>
              <ul className="space-y-2.5 text-xs text-white/80 mb-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Rapportini illimitati
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> 3 App Tecnici
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Firma Grafometrica
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Export PDF A4
                </li>
              </ul>
            </div>
            <button
              onClick={() => handleCheckout("Starter", "€29")}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 font-medium text-sm transition"
            >
              Attiva Starter
            </button>
          </div>

          {/* Pro Enterprise - Featured */}
          <div className="rounded-2xl bg-gradient-to-b from-emerald-500/20 to-emerald-950/40 border-2 border-emerald-500/50 p-6 flex flex-col justify-between shadow-2xl relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px] tracking-wider uppercase">
              Consigliato
            </div>
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                Business Pro <Zap className="h-4 w-4 text-emerald-400" />
              </h3>
              <p className="text-xs text-white/60 mt-1">
                Per piccole e medie imprese fino a 15 tecnici
              </p>
              <div className="my-6">
                <span className="text-3xl font-extrabold">€79</span>
                <span className="text-xs text-white/60"> / mese + IVA</span>
              </div>
              <ul className="space-y-2.5 text-xs text-white/90 mb-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Tutto lo Starter +
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Fino a 15 Tecnici ed
                  Operatori
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Gestione Materiali &
                  Magazzino
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Integrazione Fatturazione
                  Elettronica
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Multi-utente con permessi
                  personalizzati
                </li>
              </ul>
            </div>
            <button
              onClick={() => handleCheckout("Business Pro", "€79")}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm hover:bg-emerald-400 transition shadow-lg flex items-center justify-center gap-2"
            >
              <CreditCard className="h-4 w-4" /> Procedi con Stripe (€79)
            </button>
          </div>

          {/* Unlimited Enterprise */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 flex flex-col justify-between hover:border-white/20 transition">
            <div>
              <h3 className="text-lg font-bold">Enterprise Unlimited</h3>
              <p className="text-xs text-white/60 mt-1">
                Senza limiti per grandi aziende e multisito
              </p>
              <div className="my-6">
                <span className="text-3xl font-extrabold">€149</span>
                <span className="text-xs text-white/60"> / mese + IVA</span>
              </div>
              <ul className="space-y-2.5 text-xs text-white/80 mb-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Tecnici ed Utenti
                  Illimitati
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> API Dedicate & Webhook
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Database & Tenant
                  Isolation dedicato
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Assistenza telefonica h24
                </li>
              </ul>
            </div>
            <button
              onClick={() => handleCheckout("Enterprise", "€149")}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 font-medium text-sm transition"
            >
              Attiva Unlimited
            </button>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-white/40 py-4 border-t border-white/10">
        BaseGrid Enterprise · Pagamenti sicuri elaborati via Stripe 256-bit SSL encryption
      </div>
    </div>
  );
}
