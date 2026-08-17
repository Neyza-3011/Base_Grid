import { CheckCircle2, PenLine, Search, Clock, FileText, TrendingUp } from "lucide-react";

export function DesktopMockup() {
  return (
    <div className="relative rounded-2xl overflow-hidden hairline bg-[#0B1220] text-white/90 shadow-[0_40px_120px_-30px_rgba(37,99,235,0.35)]">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 px-3 h-8 border-b border-white/5 bg-white/[0.02]">
        <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
      </div>
      <div className="grid grid-cols-[160px_1fr]">
        <aside className="border-r border-white/5 py-3 px-2 space-y-0.5 text-[11px]">
          <div className="px-2 py-1 text-white/40 uppercase tracking-wider">Studio</div>
          {["Dashboard", "Rapportini", "Clienti", "Cantieri", "Materiali", "Fatture"].map(
            (n, i) => (
              <div
                key={n}
                className={`px-2 py-1.5 rounded-md flex items-center gap-2 ${i === 0 ? "bg-primary/15 text-white" : "text-white/60"}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                {n}
              </div>
            ),
          )}
        </aside>
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { l: "Ore mese", v: "342", d: "+12%" },
              { l: "Rapportini", v: "78", d: "+8%" },
              { l: "Cantieri", v: "14", d: "+2" },
            ].map((k) => (
              <div key={k.l} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <div className="text-[10px] text-white/50">{k.l}</div>
                <div className="text-lg font-semibold tabular">{k.v}</div>
                <div className="text-[10px] text-emerald-400 tabular">{k.d}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between text-[10px] text-white/50 mb-2">
              <span>Rapportini recenti</span>
              <span>Stato</span>
            </div>
            <div className="space-y-1.5">
              {[
                ["Rossi Srl · Via Milano 12", "Approvato", "bg-emerald-500/15 text-emerald-400"],
                ["Impianti Verdi", "Inviato", "bg-emerald-500/15 text-emerald-400"],
                ["Casa Bianchi", "Bozza", "bg-white/10 text-white/60"],
                ["Cantiere B4", "Approvato", "bg-emerald-500/15 text-emerald-400"],
              ].map(([n, s, c]) => (
                <div key={n} className="flex items-center justify-between text-[11px] py-1">
                  <span className="text-white/80 truncate">{n}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${c}`}>
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PhoneMockup() {
  return (
    <div className="relative w-[220px] rounded-[36px] p-2 bg-[#050810] hairline shadow-[0_40px_120px_-20px_rgba(16,185,129,0.35)]">
      <div className="rounded-[28px] bg-[#0B1220] overflow-hidden">
        <div className="h-6 flex items-center justify-center">
          <div className="h-1 w-16 rounded-full bg-white/10" />
        </div>
        <div className="px-4 pb-4 text-white">
          <div className="text-[10px] uppercase tracking-wider text-white/40">Passo 3 di 4</div>
          <div className="mt-1 text-[15px] font-semibold">Firma cliente</div>
          <div className="mt-3 rounded-xl border border-white/10 bg-white h-32 grid place-items-center">
            <svg viewBox="0 0 200 100" className="h-16 w-40">
              <path
                d="M10 70 C 30 20, 60 90, 80 50 S 130 20, 160 60 190 40, 195 55"
                stroke="#0F172A"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="mt-3 flex gap-2 text-[10px]">
            <button className="flex-1 h-8 rounded-lg border border-white/10 text-white/70">
              Cancella
            </button>
            <button className="flex-1 h-8 rounded-lg bg-primary text-white flex items-center justify-center gap-1">
              <PenLine className="h-3 w-3" /> Firma
            </button>
          </div>
          <div className="mt-3 rounded-lg border border-white/10 p-2 space-y-1.5">
            <div className="flex items-center gap-2 text-[10px] text-white/70">
              <Search className="h-3 w-3" />
              Rossi Srl
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/70">
              <Clock className="h-3 w-3" />
              4h 30m
            </div>
            <div className="flex items-center gap-2 text-[10px] text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Materiali OK
            </div>
          </div>
          <button className="mt-3 w-full h-9 rounded-xl bg-emerald-500 text-slate-900 text-[11px] font-semibold flex items-center justify-center gap-1.5 btn-glow">
            <FileText className="h-3.5 w-3.5" /> Firma e Invia PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export function FloatingMockups() {
  return (
    <div className="relative h-[420px] sm:h-[520px] w-full">
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative w-full max-w-[560px] tilt-3d hover:tilt-3d-hover">
          <DesktopMockup />
        </div>
      </div>
      <div className="absolute -bottom-2 right-2 sm:right-8 rotate-[6deg] hover:rotate-[3deg] transition-transform duration-500">
        <PhoneMockup />
      </div>
      <div className="absolute -top-6 -left-4 hidden sm:flex items-center gap-2 rounded-full glass-dark px-3 py-1.5 text-xs text-white">
        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> +34% produttività
      </div>
    </div>
  );
}
