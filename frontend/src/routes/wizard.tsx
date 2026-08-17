import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Search,
  Plus,
  Minus,
  Undo2,
  Trash2,
  FileText,
} from "lucide-react";
import { addReport } from "@/lib/reportsStorage";

export const Route = createFileRoute("/wizard")({
  head: () => ({
    meta: [
      { title: "Nuovo rapportino · BaseGrid" },
      { name: "description", content: "Crea un rapportino sul campo in 4 passaggi." },
    ],
  }),
  component: Wizard,
});

const CLIENTS = [
  "Rossi Srl · Via Milano 12",
  "Impianti Verdi · Cantiere B4",
  "Casa Bianchi · Via Roma 8",
  "Termo SpA · Sede centrale",
  "Elettro Rossi · Uffici",
  "Idro Bianchi · Villa Sole",
];
const MATERIALS = [
  "Cavo FG16 3x2.5",
  "Interruttore MT 25A",
  "Presa Schuko IP55",
  "Tubo corrugato Ø25",
  "Faretto LED 12W",
];

function Wizard() {
  const [step, setStep] = useState(0);
  const [client, setClient] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hours, setHours] = useState(2);
  const [items, setItems] = useState<{ name: string; qty: number }[]>([
    { name: "Cavo FG16 3x2.5", qty: 10 },
  ]);
  const navigate = useNavigate();

  const steps = ["Cliente", "Materiali", "Firma", "Invia"];

  return (
    <div className="min-h-screen bg-[#090D16] text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#090D16]/80 border-b border-white/5">
        <div className="relative mx-auto max-w-2xl px-4 h-14 flex items-center">
          <Link
            to="/dashboard"
            className="absolute left-2 grid h-10 w-10 place-items-center rounded-lg hover:bg-white/5 active:scale-95 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="mx-auto text-center">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              Passo {step + 1} di {steps.length}
            </div>
            <div className="text-sm font-semibold">{steps[step]}</div>
          </div>
        </div>
        <div className="h-1 bg-white/5">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">Seleziona cliente e cantiere</h2>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca cliente…"
                className="w-full h-14 pl-11 pr-4 rounded-2xl bg-white/5 border border-white/10 text-base placeholder:text-white/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-2">
              {CLIENTS.filter((c) => c.toLowerCase().includes(q.toLowerCase())).map((c) => (
                <button
                  key={c}
                  onClick={() => setClient(c)}
                  className={`w-full min-h-14 flex items-center justify-between rounded-xl border px-4 py-3 text-left transition active:scale-[0.99] ${client === c ? "border-primary bg-primary/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"}`}
                >
                  <div className="text-sm font-medium">{c}</div>
                  {client === c && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Ore & Materiali</h2>
              <p className="text-sm text-white/60 mt-1">{client}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="text-xs text-white/50 mb-3">Ore lavorate</div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setHours(Math.max(0, hours - 0.5))}
                  className="grid h-12 w-12 place-items-center rounded-full bg-white/5 border border-white/10 active:scale-95"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <div className="tabular text-4xl font-bold">
                  {hours.toFixed(1)}
                  <span className="text-lg text-white/40 ml-1">h</span>
                </div>
                <button
                  onClick={() => setHours(hours + 0.5)}
                  className="grid h-12 w-12 place-items-center rounded-full bg-primary text-white active:scale-95 btn-glow"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-white/50">Materiali usati</div>
                <button
                  onClick={() =>
                    setItems([
                      ...items,
                      { name: MATERIALS[items.length % MATERIALS.length], qty: 1 },
                    ])
                  }
                  className="text-xs font-medium text-primary flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Aggiungi
                </button>
              </div>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-2"
                  >
                    <select
                      value={it.name}
                      onChange={(e) =>
                        setItems(
                          items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                        )
                      }
                      className="flex-1 bg-transparent text-sm outline-none"
                    >
                      {MATERIALS.map((m) => (
                        <option key={m} value={m} className="bg-slate-900">
                          {m}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setItems(
                            items.map((x, j) =>
                              j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x,
                            ),
                          )
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <div className="tabular w-8 text-center text-sm">{it.qty}</div>
                      <button
                        onClick={() =>
                          setItems(items.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))
                        }
                        className="grid h-8 w-8 place-items-center rounded-lg bg-white/5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => setItems(items.filter((_, j) => j !== i))}
                      className="grid h-8 w-8 place-items-center rounded-lg text-white/40 hover:text-white hover:bg-white/5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && <SignatureStep />}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold tracking-tight">Rivedi e invia</h2>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
              {[
                ["Cliente", client ?? "—"],
                ["Ore", `${hours.toFixed(1)}h`],
                ["Materiali", `${items.length} articoli`],
                ["Firma", "Acquisita ✓"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-5 py-4">
                  <span className="text-sm text-white/50">{k}</span>
                  <span className="text-sm font-medium">{v}</span>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                const clientParts = (client || "Cliente Generico").split("·");
                const created = await addReport({
                  clientName: clientParts[0].trim(),
                  clientAddress: clientParts[1]?.trim() || "Cantiere Principale",
                  hours: hours,
                  materials: items.map((i) => ({ name: i.name, quantity: i.qty })),
                  status: "approved",
                  notes: "Rapportino creato da procedura guidata con firma cliente.",
                });
                toast.success("Rapportino creato e inviato!", {
                  description: `Rapportino ${created.id} per ${created.client.name} registrato con successo.`,
                });
                setTimeout(() => navigate({ to: "/dashboard" }), 800);
              }}
              className="w-full h-14 rounded-2xl bg-emerald-500 text-slate-900 font-semibold flex items-center justify-center gap-2 active:scale-[0.98] btn-glow"
            >
              <FileText className="h-5 w-5" /> Firma e Invia PDF
            </button>
          </div>
        )}
      </main>

      {/* Footer nav */}
      {step < 3 && (
        <footer className="sticky bottom-0 border-t border-white/5 bg-[#090D16]/95 backdrop-blur-xl">
          <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="h-12 px-5 rounded-xl border border-white/10 text-sm font-medium disabled:opacity-40 active:scale-95"
            >
              Indietro
            </button>
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 0 && !client}
              className="flex-1 h-12 rounded-xl bg-primary text-white font-medium btn-glow inline-flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
            >
              Continua <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function SignatureStep() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const current = useRef<Array<{ x: number; y: number }>>([]);

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#0F172A";
    strokes.current.forEach((s) => {
      ctx.beginPath();
      s.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    });
  };

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight">Firma del cliente</h2>
      <p className="text-sm text-white/60">Fai firmare il cliente nel riquadro sotto.</p>
      <div className="rounded-2xl border border-white/10 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={800}
          height={400}
          className="w-full aspect-[2/1] touch-none"
          onPointerDown={(e) => {
            drawing.current = true;
            current.current = [pos(e)];
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            current.current.push(pos(e));
            strokes.current = [...strokes.current.slice(0, -1), current.current];
            redraw();
          }}
          onPointerUp={() => {
            if (drawing.current) {
              strokes.current = [...strokes.current, current.current];
              drawing.current = false;
            }
          }}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            strokes.current = strokes.current.slice(0, -1);
            redraw();
          }}
          className="flex-1 h-12 rounded-xl border border-white/10 flex items-center justify-center gap-2 active:scale-95"
        >
          <Undo2 className="h-4 w-4" />
          Annulla
        </button>
        <button
          onClick={() => {
            strokes.current = [];
            redraw();
          }}
          className="flex-1 h-12 rounded-xl border border-white/10 flex items-center justify-center gap-2 active:scale-95"
        >
          <Trash2 className="h-4 w-4" />
          Cancella
        </button>
      </div>
    </div>
  );
}
