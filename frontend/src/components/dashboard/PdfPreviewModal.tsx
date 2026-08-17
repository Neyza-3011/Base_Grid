import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Printer, Download, FileText } from "lucide-react";

export function PdfPreviewModal({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let currentUrl: string | null = null;
    const fetchPdf = async () => {
      try {
        const res = await fetch(`/api/v1/reports/${reportId}/pdf`, {
          credentials: "include",
          headers: {},
        });
        if (!res.ok) throw new Error("Errore generazione PDF");
        const blob = await res.blob();
        currentUrl = window.URL.createObjectURL(blob);
        setPdfUrl(currentUrl);
      } catch (err) {
        const error = err as Error;
        toast.error(error.message || "Errore generazione PDF");
        onClose();
      } finally {
        setLoading(false);
      }
    };
    fetchPdf();
    return () => {
      if (currentUrl) window.URL.revokeObjectURL(currentUrl);
    };
  }, [reportId, onClose]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `Rapportino_${reportId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-[#090D16] shadow-2xl border border-white/10 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/60 backdrop-blur rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-white/50 font-mono tracking-wider">{reportId}</div>
              <h3 className="font-semibold text-white">Anteprima Rapportino Ufficiale</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={!pdfUrl}
              className="h-9 px-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2 text-sm text-white font-medium transition-colors disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Stampa
            </button>
            <button
              onClick={handleDownload}
              disabled={!pdfUrl}
              className="h-9 px-4 rounded-lg bg-primary text-white flex items-center gap-2 text-sm font-medium hover:bg-primary/90 btn-glow transition-all disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Scarica PDF
            </button>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors ml-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 p-0 overflow-hidden bg-slate-100 rounded-b-2xl relative min-h-[500px]">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-4">
              <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
              <p className="font-medium">Generazione documento PDF in corso...</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={`${pdfUrl}#toolbar=0`}
              className="w-full h-full border-none"
              title="PDF Preview"
            />
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
