import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Download,
  Trash2,
  Clock,
  Calendar,
  X,
  FileText,
  Building2,
} from "lucide-react";
import { getReports, addReport, removeReport, Report } from "@/lib/reportsStorage";
import { PdfPreviewModal } from "./PdfPreviewModal";

export function ReportsView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("Tutti");
  const [previewReportId, setPreviewReportId] = useState<string | null>(null);

  // Quick Create Modal State
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [newTechnician, setNewTechnician] = useState("Marco Rossi");
  const [newHours, setNewHours] = useState("4.0");
  const [newTravelHours, setNewTravelHours] = useState("0.5");
  const [newStatus, setNewStatus] = useState<"draft" | "submitted" | "approved">("approved");
  const [newNotes, setNewNotes] = useState("");
  const [newMaterialName, setNewMaterialName] = useState("Cavo FG16 3x2.5");
  const [newMaterialQty, setNewMaterialQty] = useState("10");

  const loadAllData = async () => {
    setLoading(true);
    try {
      const data = await getReports();
      // Sort newest first
      data.sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
      setReports(data);
    } catch {
      toast.error("Errore durante il caricamento dei rapportini");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo rapportino?")) return;
    try {
      await removeReport(id);
      toast.success("Rapportino eliminato con successo");
      loadAllData();
    } catch {
      toast.error("Errore durante l'eliminazione");
    }
  };

  const handleDownload = (id: string) => {
    setPreviewReportId(id);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) {
      toast.error("Inserisci il nome del cliente");
      return;
    }

    try {
      const created = await addReport({
        clientName: newClientName.trim(),
        clientAddress: newClientAddress.trim() || "Cantiere Sede",
        technicianName: newTechnician.trim() || "Tecnico Operativo",
        hours: parseFloat(newHours) || 1,
        travelHours: parseFloat(newTravelHours) || 0,
        status: newStatus,
        notes: newNotes,
        materials: [
          {
            name: newMaterialName,
            quantity: parseInt(newMaterialQty) || 1,
          },
        ],
      });

      toast.success(`Rapportino ${created.id} creato!`, {
        description: `Cliente: ${created.client.name} (${created.dateTimeFormatted})`,
      });

      setShowQuickCreate(false);
      setNewClientName("");
      setNewClientAddress("");
      setNewNotes("");
      loadAllData();
    } catch {
      toast.error("Errore nella creazione del rapportino");
    }
  };

  const exportCSV = () => {
    const headers = [
      "ID",
      "Data e Ora",
      "Cliente",
      "Cantiere",
      "Tecnico",
      "Ore Lavoro",
      "Ore Viaggio",
      "Stato",
      "Note",
    ];
    const rows = filtered.map((r) => [
      r.id,
      r.dateTimeFormatted || `${r.date} ${r.time}`,
      `"${r.client?.name || ""}"`,
      `"${r.client?.address || ""}"`,
      `"${r.technician?.full_name || ""}"`,
      r.work_hours,
      r.travel_hours || 0,
      r.status,
      `"${(r.notes || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `rapportini_basegrid_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Esportazione CSV completata!");
  };

  const filtered = reports.filter((r) => {
    const matchesFilter =
      activeFilter === "Tutti" ||
      (activeFilter === "Bozza" && r.status === "draft") ||
      (activeFilter === "Inviato" && r.status === "submitted") ||
      (activeFilter === "Approvato" && r.status === "approved");
    const search = query.toLowerCase();
    const matchesSearch =
      r.client?.name?.toLowerCase().includes(search) ||
      r.technician?.full_name?.toLowerCase().includes(search) ||
      r.client?.address?.toLowerCase().includes(search) ||
      r.id.toLowerCase().includes(search) ||
      (r.materials_used && r.materials_used.some((m) => m.name.toLowerCase().includes(search)));
    return matchesFilter && matchesSearch;
  });

  const totalHoursFiltered = filtered.reduce((acc, r) => acc + (r.work_hours || 0), 0);

  return (
    <div className="flex flex-col space-y-6 h-full text-white">
      {/* Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-white">Archivio Rapportini</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {filtered.length} Registrati
            </span>
          </div>
          <p className="text-sm text-white/60 mt-0.5">
            Elenco ottimizzato dei rapportini d'intervento ordinati dal più recente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={exportCSV}
            className="h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-4 border border-white/10 flex items-center gap-2 transition active:scale-95"
            title="Esporta in CSV"
          >
            <Download className="h-4 w-4 text-emerald-400" /> Esporta CSV
          </button>

          <button
            onClick={() => setShowQuickCreate(true)}
            className="h-10 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all btn-glow inline-flex items-center justify-center gap-2 px-4 shadow-lg shadow-primary/20"
          >
            <Plus className="h-4 w-4" /> Nuovo Rapportino
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-slate-900/60 p-3 rounded-2xl border border-white/10 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-2 px-3 h-11 flex-1 bg-slate-950/70 rounded-xl border border-white/10 w-full focus-within:border-primary/50 transition">
          <Search className="h-4 w-4 shrink-0 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per cliente, cantiere, codice ID o materiale..."
            className="bg-transparent flex-1 min-w-0 text-sm outline-none placeholder:text-white/40 text-white"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-white/40 hover:text-white text-xs px-2 py-1 bg-white/5 rounded-lg"
            >
              Cancella
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 hide-scrollbar">
          {["Tutti", "Approvato", "Inviato", "Bozza"].map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                activeFilter === f
                  ? "bg-primary text-white shadow-md shadow-primary/20"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Optimized Data Table */}
      <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] overflow-hidden flex-1 flex flex-col">
        <div className="px-6 py-3.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-white/60">
          <div className="flex items-center gap-2 font-medium">
            <Calendar className="h-4 w-4 text-blue-400" />
            <span>Tutti i Rapportini (Ordinati per data recente)</span>
            <span className="text-white/40">
              • Ore totali: <strong className="text-white">{totalHoursFiltered.toFixed(1)}h</strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-white/60 border-b border-white/10 sticky top-0 backdrop-blur-md">
              <tr>
                <th className="font-semibold px-6 py-4">Data & Ora</th>
                <th className="font-semibold px-6 py-4">Cliente / Cantiere</th>
                <th className="font-semibold px-6 py-4">Tecnico Operativo</th>
                <th className="font-semibold px-6 py-4">Ore Lavoro</th>
                <th className="font-semibold px-6 py-4">Stato</th>
                <th className="font-semibold px-6 py-4 text-right">Azioni PDF / Elimina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-white/40 text-sm">
                    Caricamento archivio in corso...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-white/40 text-sm">
                    Nessun rapportino trovato per la ricerca o il filtro selezionato.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.04] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        <span>{r.dateTimeFormatted || `${r.date} ${r.time}`}</span>
                      </div>
                      <div className="text-[11px] text-blue-400 font-mono mt-0.5">{r.id}</div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-medium text-white flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span>{r.client?.name || "N/A"}</span>
                      </div>
                      <div className="text-xs text-white/50 mt-0.5 max-w-[240px] truncate">
                        {r.client?.address || "Cantiere Sede"}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold shrink-0">
                          {r.technician?.full_name ? r.technician.full_name[0].toUpperCase() : "T"}
                        </div>
                        <span className="font-medium text-xs text-white/90">
                          {r.technician?.full_name || "Marco Rossi"}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="font-bold text-white flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                        <span>{r.work_hours.toFixed(1)}h</span>
                      </div>
                      <div className="text-xs text-white/50 mt-0.5">
                        {r.materials_used?.length || 0} articoli usati
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide ${
                          r.status === "approved"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : r.status === "submitted"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : "bg-white/5 text-white/60 border border-white/10"
                        }`}
                      >
                        {r.status === "approved"
                          ? "Approvato"
                          : r.status === "submitted"
                            ? "Inviato"
                            : "Bozza"}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2.5">
                        <button
                          onClick={() => handleDownload(r.id)}
                          className="h-8 px-3 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 flex items-center gap-1.5 text-xs text-blue-300 font-medium transition active:scale-95"
                          title="Anteprima e Stampa PDF"
                        >
                          <Download className="h-3.5 w-3.5" /> PDF
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="h-8 w-8 rounded-lg hover:bg-red-500/20 flex items-center justify-center text-white/40 hover:text-red-400 transition active:scale-95"
                          title="Elimina Rapportino"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Create Modal */}
      {showQuickCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative text-white space-y-4">
            <button
              onClick={() => setShowQuickCreate(false)}
              className="absolute right-4 top-4 text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <FileText className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-bold">Nuovo Rapportino Rapido</h3>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/70">
                  Cliente / Ragione Sociale *
                </label>
                <input
                  required
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Es. Impianti Industriali Srl"
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/70">Cantiere / Indirizzo</label>
                <input
                  value={newClientAddress}
                  onChange={(e) => setNewClientAddress(e.target.value)}
                  placeholder="Es. Via Milano 45, Milano"
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white/70">Ore Lavoro</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newHours}
                    onChange={(e) => setNewHours(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-white/70">Tecnico</label>
                  <input
                    value={newTechnician}
                    onChange={(e) => setNewTechnician(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/70">Materiale Usato</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={newMaterialName}
                    onChange={(e) => setNewMaterialName(e.target.value)}
                    placeholder="Articolo"
                    className="col-span-2 h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-xs"
                  />
                  <input
                    type="number"
                    value={newMaterialQty}
                    onChange={(e) => setNewMaterialQty(e.target.value)}
                    placeholder="Qtà"
                    className="h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/70">Stato Rapportino</label>
                <select
                  value={newStatus}
                  onChange={(e) =>
                    setNewStatus(e.target.value as "draft" | "submitted" | "approved")
                  }
                  className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"
                >
                  <option value="approved">Approvato (Pronto per Fattura)</option>
                  <option value="submitted">Inviato (In attesa)</option>
                  <option value="draft">Bozza</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/70">Note Intervento</label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Descrizione delle lavorazioni eseguite..."
                  className="w-full p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowQuickCreate(false)}
                  className="px-4 h-10 rounded-xl border border-white/10 text-xs font-medium hover:bg-white/5 transition"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-5 h-10 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 btn-glow transition"
                >
                  Salva Rapportino
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PDF Modal */}
      {previewReportId && (
        <PdfPreviewModal reportId={previewReportId} onClose={() => setPreviewReportId(null)} />
      )}
    </div>
  );
}
