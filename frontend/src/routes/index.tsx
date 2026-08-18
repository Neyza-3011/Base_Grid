import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Nav } from "@/components/landing/Nav";
import { AuthModal } from "@/components/landing/AuthModal";
import { FloatingMockups } from "@/components/landing/Mockups";
import { HowItWorks, Features, Pricing, Support, Footer } from "@/components/landing/Sections";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BaseGrid — Gestione Rapportini, Cantieri e Interventi B2B" },
      {
        name: "description",
        content:
          "BaseGrid SaaS: rapportini digitali sul campo, firma cliente e PDF istantaneo. Prova gratis 30 giorni.",
      },
      { property: "og:title", content: "BaseGrid — Gestione Rapportini B2B" },
      {
        property: "og:description",
        content: "Compila sul campo, fai firmare, l'ufficio fattura subito.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [modal, setModal] = useState<null | "login" | "signup" | "forgot">(null);

  return (
    <div id="top" className="min-h-screen bg-[#090D16] text-white overflow-x-hidden">
      <Nav onLogin={() => setModal("login")} onSignup={() => setModal("signup")} />

      {/* HERO */}
      <section className="relative pt-32 sm:pt-40 pb-20 sm:pb-28">
        <div className="absolute inset-0 mesh-hero pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-14 lg:gap-8 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full glass-dark px-3 py-1.5 text-xs text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Nuovo · Firma su display + PDF in tempo reale
              </div>
              <h1 className="mt-6 text-[2.5rem] sm:text-6xl lg:text-7xl font-semibold tracking-[-0.03em] leading-[1.05] text-white">
                Basta carta e ore perse in ufficio.
                <span className="block text-white/50 mt-1">
                  Digitalizza i rapportini in 30 secondi.
                </span>
              </h1>
              <p className="mt-6 text-base sm:text-lg text-white/70 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Il tuo tecnico compila sul campo, il cliente firma sul display, l'ufficio fattura in
                tempo reale. Fine.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:justify-center lg:justify-start">
                <button
                  onClick={() => setModal("signup")}
                  className="h-12 px-6 rounded-full bg-primary text-white font-medium btn-glow hover:bg-primary/90 active:scale-95 transition inline-flex items-center justify-center gap-2"
                >
                  Inizia la Prova Gratuita <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setModal("login")}
                  className="h-12 px-6 rounded-full border border-white/15 text-white hover:bg-white/5 active:scale-95 transition inline-flex items-center justify-center"
                >
                  Accedi
                </button>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs text-white/50">
                <span>✓ 30 giorni gratis</span>
                <span>✓ Nessuna carta richiesta</span>
                <span>✓ Setup in 2 minuti</span>
              </div>
            </div>

            <div className="relative hidden md:block">
              <FloatingMockups />
            </div>
          </div>

          {/* Logos strip */}
          <div className="mt-20 border-t border-white/5 pt-8">
            <div className="text-center text-[11px] uppercase tracking-[0.25em] text-white/40">
              Usato da oltre 2.000 aziende in Italia
            </div>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-6 items-center opacity-60">
              {["Elettro Rossi", "Impianti Verdi", "Idro Bianchi", "Termo SpA", "Cantiere+"].map(
                (n) => (
                  <div
                    key={n}
                    className="text-center text-sm text-white/50 font-medium tracking-tight"
                  >
                    {n}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      <HowItWorks />
      <Features />
      <Pricing onSignup={() => setModal("signup")} />
      <Support />
      <Footer />

      <AuthModal
        open={modal !== null}
        mode={modal ?? "login"}
        onClose={() => setModal(null)}
        onSwitch={(m) => setModal(m)}
      />
    </div>
  );
}
