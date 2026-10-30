import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  FileText,
  Users,
  Wrench,
  X,
} from "lucide-react";

const TOUR_STEPS = [
  {
    title: "La tua dashboard",
    description:
      "La dashboard raccoglie una panoramica operativa. Usa il menu laterale per passare alle aree di lavoro senza perdere il contesto.",
    icon: BookOpen,
  },
  {
    title: "Clienti e sedi",
    description:
      "Registra i clienti e le loro sedi operative. Collega gli interventi alla sede corretta per mantenere ordinati i dati del lavoro.",
    icon: Building2,
  },
  {
    title: "Interventi",
    description:
      "Consulta e gestisci gli interventi dal relativo spazio di lavoro. Verifica cliente, sede, assegnazione e stato prima di aggiornare un'attività.",
    icon: Wrench,
  },
  {
    title: "Rapportini e PDF",
    description:
      "Crea un rapportino con le informazioni del lavoro svolto. Controlla i dati prima di scaricare o stampare il documento PDF.",
    icon: FileText,
  },
  {
    title: "Team e impostazioni",
    description:
      "Invita i collaboratori autorizzati e completa le impostazioni aziendali. Le funzioni disponibili dipendono dal tuo ruolo.",
    icon: Users,
  },
] as const;

type ProductTourProps = {
  open: boolean;
  onClose: () => void;
};

export function ProductTour({ open, onClose }: ProductTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const activeStep = TOUR_STEPS[stepIndex];
  const StepIcon = activeStep.icon;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  const isLastStep = stepIndex === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-title"
        aria-describedby="product-tour-description"
        className="flex h-[100dvh] w-full min-h-0 flex-col overflow-y-auto border-0 bg-[#090D16] text-white shadow-2xl sm:h-auto sm:max-h-[min(90dvh,720px)] sm:max-w-xl sm:rounded-2xl sm:border sm:border-white/10"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">
                Guida rapida
              </p>
              <p className="mt-0.5 text-sm text-white/60">
                Passaggio {stepIndex + 1} di {TOUR_STEPS.length}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            aria-label="Salta e chiudi la guida"
            title="Salta la guida"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 px-5 py-7 sm:px-8 sm:py-9">
          <div className="mb-6 flex items-center gap-2" aria-hidden="true">
            {TOUR_STEPS.map((tourStep, index) => (
              <span
                key={tourStep.title}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index <= stepIndex ? "bg-emerald-300" : "bg-white/10"
                }`}
              />
            ))}
          </div>

          <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
            <StepIcon className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 id="product-tour-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {activeStep.title}
          </h2>
          <p
            id="product-tour-description"
            className="mt-4 max-w-prose text-sm leading-7 text-white/70 sm:text-base"
          >
            {activeStep.description}
          </p>
          <p className="mt-6 text-xs leading-5 text-white/45">
            Puoi saltare la guida in qualsiasi momento e riaprirla dal pulsante “Guida” nella barra
            superiore.
          </p>
        </div>

        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-4 text-sm font-medium text-white/60 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            Salta guida
          </button>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={stepIndex === 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-medium text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Indietro
            </button>
            <button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  onClose();
                } else {
                  setStepIndex((current) => Math.min(TOUR_STEPS.length - 1, current + 1));
                }
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090D16]"
            >
              {isLastStep ? (
                <>
                  Completa guida
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                </>
              ) : (
                <>
                  Avanti
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
