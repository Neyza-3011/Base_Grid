import {
  Check,
  ClipboardList,
  PenTool,
  Send,
  Zap,
  Shield,
  Smartphone,
  FileText,
  Users,
  BarChart3,
} from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      icon: ClipboardList,
      title: "Compila sul campo",
      desc: "Cliente, ore e materiali in pochi tap. Ricerca istantanea.",
    },
    {
      icon: PenTool,
      title: "Fai firmare sul display",
      desc: "Firma del cliente direttamente su smartphone o tablet.",
    },
    {
      icon: Send,
      title: "L'ufficio fattura subito",
      desc: "PDF generato in tempo reale. Zero doppie inserimenti.",
    },
  ];
  return (
    <section id="come-funziona" className="relative py-24 sm:py-32 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <span className="text-xs uppercase tracking-[0.2em] text-primary/80">Come Funziona</span>
          <h2 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight text-white">
            Dal cantiere alla fattura in tre passaggi.
          </h2>
        </div>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden hairline">
          {steps.map((s, i) => (
            <div key={s.title} className="bg-[#090D16] p-8 group">
              <div className="flex items-center gap-3">
                <span className="tabular text-xs text-white/40">0{i + 1}</span>
                <span className="h-px flex-1 bg-white/10" />
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm text-white/60 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Features() {
  const items = [
    {
      icon: Smartphone,
      t: "Ottimizzato per il cantiere",
      d: "Interfaccia leggibile in pieno sole, tap 48px+, funziona anche offline.",
    },
    {
      icon: PenTool,
      t: "Firma su display",
      d: "Canvas HTML5 fluido con undo, valida legalmente sul PDF finale.",
    },
    {
      icon: FileText,
      t: "PDF in tempo reale",
      d: "Logo aziendale, materiali, ore, firma. Pronto per il cliente.",
    },
    {
      icon: Users,
      t: "Ruoli e permessi",
      d: "Admin per l'ufficio, tecnico per il campo. RBAC di serie.",
    },
    {
      icon: BarChart3,
      t: "Metriche vive",
      d: "Ore mensili, cantieri attivi, rapportini approvati. Tutto in un colpo d'occhio.",
    },
    {
      icon: Shield,
      t: "Sicuro e conforme",
      d: "JWT, OAuth Google, backup automatici. I tuoi dati sono al sicuro.",
    },
  ];
  return (
    <section id="funzionalita" className="relative py-24 sm:py-32 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex items-end justify-between flex-wrap gap-6">
          <div className="max-w-2xl">
            <span className="text-xs uppercase tracking-[0.2em] text-primary/80">Funzionalità</span>
            <h2 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight text-white">
              Pensato per idraulici, elettricisti, impiantisti.
            </h2>
          </div>
          <p className="text-white/60 max-w-sm text-sm">
            Ogni funzione risolve un problema reale del cantiere. Niente feature inutili.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((f) => (
            <div
              key={f.t}
              className="rounded-2xl hairline bg-white/[0.02] p-6 hover:bg-white/[0.04] transition group"
            >
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-base font-semibold text-white">{f.t}</h3>
              <p className="mt-1.5 text-sm text-white/60 leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Pricing({ onSignup }: { onSignup: () => void }) {
  const tiers = [
    {
      name: "Piano Artigiano",
      price: "29",
      desc: "Perfetto per singoli professionisti.",
      features: [
        "1 tecnico",
        "Rapportini illimitati",
        "Firma digitale cliente",
        "PDF con logo",
        "Supporto email",
      ],
      cta: "Inizia gratis",
      highlight: false,
    },
    {
      name: "Piano Team Pro",
      price: "49",
      desc: "Per squadre che scalano.",
      features: [
        "Fino a 10 tecnici",
        "Tutto del piano Artigiano",
        "Metriche e report avanzati",
        "Catalogo materiali",
        "Export contabile",
        "Supporto prioritario",
      ],
      cta: "Prova 30 giorni",
      highlight: true,
    },
  ];
  return (
    <section id="prezzi" className="relative py-24 sm:py-32 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <span className="text-xs uppercase tracking-[0.2em] text-primary/80">Prezzi</span>
          <h2 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-tight text-white">
            Un prezzo. Zero sorprese.
          </h2>
          <p className="mt-4 text-white/60">Prova 30 giorni gratis. Cancelli quando vuoi.</p>
        </div>
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl p-8 ${
                t.highlight
                  ? "bg-gradient-to-b from-primary/15 to-transparent border border-primary/40"
                  : "hairline bg-white/[0.02]"
              }`}
            >
              {t.highlight && (
                <span className="absolute -top-3 left-8 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-white uppercase tracking-wider">
                  Consigliato
                </span>
              )}
              <h3 className="text-lg font-semibold text-white">{t.name}</h3>
              <p className="mt-1 text-sm text-white/60">{t.desc}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold text-white tabular">€{t.price}</span>
                <span className="text-white/50 text-sm">/mese</span>
              </div>
              <button
                onClick={onSignup}
                className={`mt-6 w-full h-11 rounded-xl font-medium transition active:scale-[0.98] ${
                  t.highlight
                    ? "bg-primary text-white btn-glow hover:bg-primary/90"
                    : "bg-white text-slate-900 hover:bg-white/90"
                }`}
              >
                {t.cta}
              </button>
              <ul className="mt-8 space-y-3">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-white/80">
                    <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Support() {
  return (
    <section id="supporto" className="relative py-24 sm:py-32 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="rounded-3xl overflow-hidden hairline bg-gradient-to-br from-primary/20 via-transparent to-emerald-500/10 p-10 sm:p-16 text-center relative">
          <div className="absolute inset-0 mesh-hero opacity-60" />
          <div className="relative">
            <Zap className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-6 text-3xl sm:text-5xl font-semibold tracking-tight text-white">
              Pronto a dire addio alla carta?
            </h2>
            <p className="mt-4 text-white/70 max-w-xl mx-auto">
              Migliaia di artigiani hanno già digitalizzato il loro cantiere. Inizia oggi, gratis.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="mailto:supporto@rapportini.app"
                className="h-12 px-6 rounded-full bg-white text-slate-900 font-medium hover:bg-white/90 active:scale-95 transition"
              >
                Contatta il supporto
              </a>
              <a
                href="tel:+390000000000"
                className="h-12 px-6 rounded-full border border-white/15 text-white hover:bg-white/5 flex items-center"
              >
                Parla con noi
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-12">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="text-sm text-white/50">
          © {new Date().getFullYear()} BaseGrid. Tutti i diritti riservati.
        </div>
        <nav className="flex flex-wrap gap-6 text-sm text-white/60">
          <a href="#" className="hover:text-white">
            Privacy Policy
          </a>
          <a href="#" className="hover:text-white">
            Cookie Policy
          </a>
          <a href="#" className="hover:text-white">
            Termini di Servizio
          </a>
        </nav>
      </div>
    </footer>
  );
}
