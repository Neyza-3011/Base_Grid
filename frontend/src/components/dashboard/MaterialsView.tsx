import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, FileText, Package, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { getReports } from "@/lib/reportsStorage";
import type { Report } from "@/lib/api/reports";
import { buildMaterialUsageRows, summarizeMaterials } from "@/lib/materialsUsage";
import type { UserSession } from "@/lib/auth";

const READ_ROLES: readonly string[] = [
  "owner",
  "admin",
  "responsabile_tecnico",
  "dispatcher",
  "technician",
  "commerciale",
  "amministrazione",
  "superadmin",
];

type MaterialsViewProps = {
  currentUser: UserSession;
  onOpenReports: () => void;
};

function formatStatus(status: "draft" | "submitted" | "approved"): string {
  if (status === "draft") return "Bozza";
  if (status === "approved") return "Approvato";
  return "Inviato";
}

export function MaterialsView({ currentUser, onOpenReports }: MaterialsViewProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReports(1000);
      setReports(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Errore durante il caricamento dei materiali dai rapportini.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!READ_ROLES.includes(currentUser.role)) {
      setLoading(false);
      setReports([]);
      return;
    }
    void loadReports();
  }, [currentUser.role, loadReports]);

  const rows = useMemo(() => buildMaterialUsageRows(reports), [reports]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("it");
    if (!normalizedQuery) return rows;
    return rows.filter((row) =>
      [row.name, row.clientName, row.technicianName, row.reportId, row.date]
        .join(" ")
        .toLocaleLowerCase("it")
        .includes(normalizedQuery),
    );
  }, [query, rows]);

  const summary = useMemo(() => summarizeMaterials(reports, rows), [reports, rows]);

  if (!READ_ROLES.includes(currentUser.role)) {
    return (
      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-8 text-center text-white">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-400" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Accesso riservato</h2>
        <p className="mt-2 text-sm text-white/60">
          Non disponi dei permessi per consultare i materiali dei rapportini.
        </p>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-6 text-white">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-emerald-400" aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight">Materiali</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Riepilogo dei materiali dichiarati negli ultimi 1.000 rapportini recuperati. Questa
            vista non rappresenta le giacenze di magazzino.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenReports}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 text-xs font-semibold text-white transition hover:bg-slate-700"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Apri rapportini
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-col justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
            <span className="break-words text-sm">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadReports()}
            className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg bg-red-500/20 px-3 text-xs font-semibold hover:bg-red-500/30 sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Riprova
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Articoli distinti", value: summary.distinctMaterials },
          { label: "Quantità dichiarate", value: summary.totalQuantity },
          { label: "Rapportini senza materiali", value: summary.reportsWithNoMaterials },
          { label: "Rapportini da verificare", value: summary.reportsUnverified },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
          >
            <p className="text-xs font-medium text-white/50">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 focus-within:border-primary/50">
        <Search className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Cerca nei materiali utilizzati"
          placeholder="Cerca materiale, cliente, tecnico o ID rapportino..."
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-xs text-white/60 hover:text-white"
          >
            Cancella
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold">Utilizzo registrato</h3>
          <span className="text-xs text-white/50">{filteredRows.length} righe</span>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-white/50">
            Caricamento materiali dal server...
          </div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-white/50">
            Dati non disponibili finché il caricamento non riesce.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center">
            <Package className="mx-auto mb-3 h-8 w-8 text-white/30" aria-hidden="true" />
            <p className="text-sm font-medium text-white/80">
              {rows.length === 0
                ? "Nessun materiale dichiarato nei rapportini."
                : "Nessun risultato per questa ricerca."}
            </p>
            <p className="mt-1 text-xs text-white/50">
              I materiali vengono registrati nel rapportino dell'intervento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs text-white/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Materiale</th>
                  <th className="px-4 py-3 font-medium">Quantità</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Tecnico</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Rapportino</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRows.map((row) => (
                  <tr key={row.key} className="text-white/80 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">{row.name}</td>
                    <td className="px-4 py-3 tabular-nums">{row.quantity}</td>
                    <td className="px-4 py-3">{row.clientName}</td>
                    <td className="px-4 py-3">{row.technicianName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.date}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs">
                        {formatStatus(row.reportStatus)}
                      </span>
                      <span className="mt-1 block font-mono text-[10px] text-white/40">
                        {row.reportId}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
