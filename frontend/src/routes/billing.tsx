import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Zap, ArrowLeft, Building2 } from "lucide-react";
import { fetchServerSession, UserSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: "Piani e Abbonamento · BaseGrid" },
      {
        name: "description",
        content: "Consulta i piani BaseGrid. Attivazione online non disponibile.",
      },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
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
            Attivazione online non disponibile
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Scegli il piano per la tua squadra
          </h2>
          <p className="mt-2 text-white/70 text-sm">
            Prezzi e piani indicativi. Il checkout non è configurato: questa pagina non può avviare
            pagamenti né attivare un piano.
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
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Firma cliente
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Export PDF A4
                </li>
              </ul>
            </div>
            <button
              type="button"
              disabled
              title="Checkout non configurato"
              className="w-full py-2.5 rounded-xl bg-white/5 text-white/50 font-medium text-sm cursor-not-allowed"
            >
              Attivazione non disponibile
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
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" /> Multi-utente con permessi
                  personalizzati
                </li>
              </ul>
            </div>
<button
              type="button"
              disabled
              title="Checkout non configurato"
              className="w-full py-3 rounded-xl bg-white/5 text-white/50 font-bold text-sm cursor-not-allowed"
            >
              Attivazione non disponibile
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
              </ul>
            </div>
<button
              type="button"
              disabled
              title="Checkout non configurato"
              className="w-full py-2.5 rounded-xl bg-white/5 text-white/50 font-medium text-sm cursor-not-allowed"
            >
              Attivazione non disponibile
            </button>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-white/40 py-4 border-t border-white/10">
        BaseGrid · Pagamenti online non attivi. Nessun addebito o cambio piano viene eseguito da
        questa pagina.
      </div>
    </div>
  );
}
