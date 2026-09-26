import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Minus,
  Undo2,
  Trash2,
  FileText,
  Building2,
  Clock,
  MapPin,
  PenTool,
  Loader2,
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

function Wizard() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 0: Cliente & Cantiere
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientCity, setClientCity] = useState("");

  // Step 1: Ore, Viaggio & Materiali
  const [hours, setHours] = useState(2.0);
  const [travelHours, setTravelHours] = useState(0.0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ name: string; qty: number }[]>([
    { name: "Cavo FG16 3x2.5", qty: 10 },
  ]);

  // Step 2: Firma
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);

  const navigate = useNavigate();
  const steps = ["Cliente", "Ore & Materiali", "Firma", "Rivedi & Invia"];

  const handleAddMaterial = () => {
    setItems([...items, { name: "", qty: 1 }]);
  };

  const handleRemoveMaterial = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUpdateMaterial = (index: number, name: string, qty: number) => {
    setItems(
      items.map((item, i) => (i === index ? { ...item, name, qty: Math.max(1, qty) } : item)),
    );
  };

  const handleSubmit = async () => {
    if (!clientName.trim()) {
      toast.error("Il nome del cliente è obbligatorio.");
      setStep(0);
      return;
    }

    setSubmitting(true);
    try {
      const validMaterials = items
        .filter((it) => it.name.trim().length > 0)
        .map((it) => ({
          name: it.name.trim(),
          quantity: Number(it.qty) || 1,
        }));

      const created = await addReport({
        clientName: clientName.trim(),
        clientAddress: clientAddress.trim() || undefined,
        clientCity: clientCity.trim() || undefined,
        hours: Number(hours) || 0.5,
        travelHours: Number(travelHours) || 0,
        materials: validMaterials,
        status: "submitted",
        notes: notes.trim() || undefined,
        signatureBase64: hasSignature && signatureBase64 ? signatureBase64 : undefined,
      });

      toast.success("Rapportino registrato con successo!", {
        description: `Rapportino ${created.id} per ${created.client.name} inviato al server.`,
      });

      setTimeout(() => navigate({ to: "/dashboard" }), 600);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Impossibile registrare il rapportino sul server.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

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
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">
        {/* Step 0: Cliente e Cantiere */}
        {step === 0 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Dati Committente & Cantiere</h2>
              <p className="text-sm text-white/60 mt-1">
                Inserisci l'intestazione del cliente e la sede dei lavori per il rapportino.
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  Cliente / Ragione Sociale *
                </label>
                <input
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Es. Rossi Impianti Srl o Mario Rossi"
                  className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:border-primary focus:outline-none transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                  Indirizzo Cantiere / Sede
                </label>
                <input
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Es. Via Roma 15, Piano 2"
                  className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:border-primary focus:outline-none transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/80">Città</label>
                <input
                  value={clientCity}
                  onChange={(e) => setClientCity(e.target.value)}
                  placeholder="Es. Milano"
                  className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-sm focus:border-primary focus:outline-none transition"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Ore & Materiali */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Ore Lavorate & Materiali</h2>
              <p className="text-sm text-white/60 mt-1">
                Cliente: <strong className="text-white">{clientName || "Non specificato"}</strong>
              </p>
            </div>

            {/* Ore Lavoro e Viaggio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="text-xs text-white/50 mb-3 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-400" /> Ore Lavoro
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setHours(Math.max(0.5, hours - 0.5))}
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/5 border border-white/10 active:scale-95 text-white/80 hover:text-white"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="tabular text-3xl font-bold">
                    {hours.toFixed(1)}
                    <span className="text-sm text-white/40 ml-1">h</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHours(hours + 0.5)}
                    className="grid h-10 w-10 place-items-center rounded-full bg-primary text-white active:scale-95 btn-glow"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="text-xs text-white/50 mb-3 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-blue-400" /> Ore Viaggio
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setTravelHours(Math.max(0, travelHours - 0.5))}
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/5 border border-white/10 active:scale-95 text-white/80 hover:text-white"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="tabular text-3xl font-bold">
                    {travelHours.toFixed(1)}
                    <span className="text-sm text-white/40 ml-1">h</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTravelHours(travelHours + 0.5)}
                    className="grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-white active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Materiali Usati */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-white/50 font-medium">Materiali & Ricambi Usati</div>
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Aggiungi riga
                </button>
              </div>

              {items.length === 0 ? (
                <div className="text-xs text-white/40 text-center py-4 bg-white/[0.01] rounded-xl border border-dashed border-white/10">
                  Nessun materiale aggiunto. Clicca su "Aggiungi riga" per inserire articoli.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {items.map((it, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-2"
                    >
                      <input
                        value={it.name}
                        onChange={(e) => handleUpdateMaterial(i, e.target.value, it.qty)}
                        placeholder="Nome materiale / articolo"
                        className="flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-white/30 text-white"
                      />
                      <div className="flex items-center gap-1 bg-white/5 rounded-lg px-1 py-0.5 border border-white/10">
                        <button
                          type="button"
                          onClick={() => handleUpdateMaterial(i, it.name, it.qty - 1)}
                          className="h-7 w-7 grid place-items-center rounded text-white/60 hover:text-white"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs tabular font-medium">
                          {it.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateMaterial(i, it.name, it.qty + 1)}
                          className="h-7 w-7 grid place-items-center rounded text-white/60 hover:text-white"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterial(i)}
                        className="h-8 w-8 grid place-items-center rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Note Intervento */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-1.5">
              <label className="text-xs font-semibold text-white/70">
                Note / Descrizione Lavori Eseguiti
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Descrivi sinteticamente le attività svolte in cantiere..."
                className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:border-primary focus:outline-none text-white transition"
              />
            </div>
          </div>
        )}

        {/* Step 2: Firma */}
        {step === 2 && (
          <SignatureStep
            initialSignature={signatureBase64}
            onSignatureChange={(sig, hasSig) => {
              setSignatureBase64(sig);
              setHasSignature(hasSig);
            }}
          />
        )}

        {/* Step 3: Rivedi & Invia */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Rivedi e Registra</h2>
              <p className="text-sm text-white/60 mt-1">
                Verifica i dettagli del rapportino prima dell'invio al database aziendale.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-white/50">Cliente</span>
                <span className="text-sm font-semibold text-white">{clientName || "—"}</span>
              </div>
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-white/50">Cantiere</span>
                <span className="text-sm font-medium text-white/90">
                  {clientAddress
                    ? `${clientAddress}${clientCity ? `, ${clientCity}` : ""}`
                    : "Sede Cliente"}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-white/50">Ore Lavoro / Viaggio</span>
                <span className="text-sm font-medium text-white/90">
                  {hours.toFixed(1)}h lavoro{" "}
                  {travelHours > 0 ? `+ ${travelHours.toFixed(1)}h viaggio` : ""}
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-white/50">Materiali</span>
                <span className="text-sm font-medium text-white/90">
                  {items.filter((i) => i.name.trim()).length} articoli
                </span>
              </div>
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-white/50">Firma Cliente</span>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    hasSignature
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-white/5 text-white/50 border border-white/10"
                  }`}
                >
                  {hasSignature ? "Acquisita ✓" : "Non apposta"}
                </span>
              </div>
            </div>

            <button
              disabled={submitting}
              onClick={handleSubmit}
              className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] btn-glow transition disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Salvataggio sul server in corso...
                </>
              ) : (
                <>
                  <FileText className="h-5 w-5" /> Registra e Invia Rapportino
                </>
              )}
            </button>
          </div>
        )}
      </main>

      {/* Footer nav */}
      {step < 3 && (
        <footer className="sticky bottom-0 border-t border-white/5 bg-[#090D16]/95 backdrop-blur-xl">
          <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="h-12 px-5 rounded-xl border border-white/10 text-sm font-medium disabled:opacity-30 active:scale-95 transition"
            >
              Indietro
            </button>
            <button
              type="button"
              onClick={() => {
                if (step === 0 && !clientName.trim()) {
                  toast.error("Inserisci il nome del cliente prima di continuare.");
                  return;
                }
                setStep(step + 1);
              }}
              disabled={step === 0 && !clientName.trim()}
              className="flex-1 h-12 rounded-xl bg-primary text-white font-medium btn-glow inline-flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition"
            >
              Continua <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function SignatureStep({
  initialSignature,
  onSignatureChange,
}: {
  initialSignature: string | null;
  onSignatureChange: (sig: string | null, hasSig: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const current = useRef<Array<{ x: number; y: number }>>([]);

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
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

  const exportData = () => {
    const c = canvasRef.current;
    if (!c || strokes.current.length === 0) {
      onSignatureChange(null, false);
      return;
    }
    const dataUrl = c.toDataURL("image/png");
    onSignatureChange(dataUrl, true);
  };

  const clearSignature = () => {
    strokes.current = [];
    current.current = [];
    redraw();
    onSignatureChange(null, false);
  };

  const undoLastStroke = () => {
    strokes.current = strokes.current.slice(0, -1);
    redraw();
    exportData();
  };

  useEffect(() => {
    redraw();
  }, []);

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <PenTool className="h-6 w-6 text-primary" /> Firma del Cliente
        </h2>
        <p className="text-sm text-white/60 mt-1">
          Fai firmare il committente direttamente sullo schermo per confermare l'intervento.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white overflow-hidden shadow-inner">
        <canvas
          ref={canvasRef}
          width={800}
          height={400}
          className="w-full aspect-[2/1] touch-none cursor-crosshair bg-white"
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
              exportData();
            }
          }}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={undoLastStroke}
          className="flex-1 h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium flex items-center justify-center gap-2 active:scale-95 transition"
        >
          <Undo2 className="h-3.5 w-3.5" /> Annulla tratto
        </button>
        <button
          type="button"
          onClick={clearSignature}
          className="flex-1 h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-medium flex items-center justify-center gap-2 active:scale-95 transition text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" /> Cancella firma
        </button>
      </div>
    </div>
  );
}
