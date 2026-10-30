import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { X, Printer, Download, FileText, ExternalLink } from "lucide-react";
import { validatePdfBlob } from "./pdfBlobValidation";
import { trapDialogTab } from "./pdfPreviewAccessibility";

export function PdfPreviewModal({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let currentUrl: string | null = null;
    let isMounted = true;

    const fetchPdf = async () => {
      try {
        const res = await fetch(`/api/v1/reports/${encodeURIComponent(reportId)}/pdf`, {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/pdf" },
        });
        if (!res.ok) {
          let message = "Errore generazione PDF";
          try {
            const body = await res.json();
            if (typeof body?.detail === "string") message = body.detail;
          } catch {
            // The server may return a non-JSON error body.
          }
          throw new Error(message);
        }

        const blob = await res.blob();
        await validatePdfBlob(blob);
        if (!isMounted) return;
        currentUrl = window.URL.createObjectURL(blob);
        setPdfUrl(currentUrl);
      } catch (err) {
        if (!isMounted) return;
        const error = err as Error;
        toast.error(error.message || "Errore generazione PDF");
        onCloseRef.current();
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPdf();

    return () => {
      isMounted = false;
      if (currentUrl) window.URL.revokeObjectURL(currentUrl);
    };
  }, [reportId]);

  // Move focus into the dialog and restore it to the opener when the dialog closes.
  useEffect(() => {
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    return () => {
      const previousActiveElement = previousActiveElementRef.current;
      if (previousActiveElement?.isConnected) previousActiveElement.focus();
    };
  }, []);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    trapDialogTab(event, dialogRef.current, document.activeElement);
  };

  // Keyboard accessibility: Escape key handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `Rapportino_${reportId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleOpenNewTab = () => {
    if (!pdfUrl) return;
    window.open(pdfUrl, "_blank");
  };

  const handlePrint = () => {
    if (!pdfUrl) return;
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = pdfUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-modal-title"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="relative flex h-[100dvh] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-none border-0 bg-[#090D16] shadow-2xl outline-none animate-in fade-in slide-in-from-bottom-4 duration-300 sm:h-[90dvh] sm:max-h-[90dvh] sm:rounded-2xl sm:border sm:border-white/10"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-b border-white/10 bg-slate-900/60 px-3.5 py-3 backdrop-blur sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-4 sm:rounded-t-2xl">
          <div className="flex items-center gap-2.5 min-w-0 max-w-full flex-1">
            <div className="grid h-9 w-9 sm:h-10 sm:w-10 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] sm:text-xs text-white/50 font-mono tracking-wider truncate">
                {reportId}
              </div>
              <h3
                id="pdf-modal-title"
                className="text-sm sm:text-base font-semibold text-white truncate"
              >
                Anteprima Rapportino Ufficiale
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
            <button
              onClick={handleOpenNewTab}
              disabled={!pdfUrl}
              aria-label="Apri PDF in nuova scheda"
              title="Apri PDF in nuova scheda"
              className="h-9 px-2.5 sm:px-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1.5 text-xs text-white font-medium transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#090D16]"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="hidden md:inline">Apri</span>
            </button>
            <button
              onClick={handlePrint}
              disabled={!pdfUrl}
              aria-label="Stampa rapportino"
              title="Stampa rapportino"
              className="h-9 px-2.5 sm:px-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-white font-medium transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#090D16]"
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Stampa</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={!pdfUrl}
              aria-label="Scarica PDF rapportino"
              title="Scarica PDF rapportino"
              className="h-9 px-3 sm:px-4 rounded-lg bg-primary text-white flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium hover:bg-primary/90 btn-glow transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#090D16]"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Scarica PDF</span>
            </button>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Chiudi anteprima PDF"
              title="Chiudi anteprima PDF"
              className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors ml-0.5 sm:ml-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#090D16]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 sm:rounded-b-2xl">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-4 p-4 text-center">
              <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
              <p className="font-medium text-sm">Generazione documento PDF in corso...</p>
            </div>
          ) : pdfUrl ? (
            <div className="flex min-h-0 w-full flex-1 flex-col">
              <iframe
                src={`${pdfUrl}#toolbar=0`}
                className="h-full min-h-0 w-full flex-1 border-none"
                title="Anteprima PDF del rapportino"
              />
              <div className="sm:hidden bg-slate-900 border-t border-white/10 px-3 py-2 flex items-center justify-between text-xs text-white/70 shrink-0">
                <span className="truncate pr-2">Problemi di visualizzazione su mobile?</span>
                <button
                  onClick={handleOpenNewTab}
                  className="px-2.5 py-1 rounded bg-primary text-white text-[11px] font-medium shrink-0 flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Apri a tutto schermo
                </button>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
              Errore di visualizzazione
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
