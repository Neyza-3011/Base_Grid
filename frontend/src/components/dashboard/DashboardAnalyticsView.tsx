import { useState, useEffect } from "react";
import {
  FileText,
  Clock,
  TrendingUp,
  CheckCircle2,
  Calendar,
  Plus,
  ArrowUpRight,
  Sparkles,
  Users,
  HardHat,
  Eye,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { UserSession } from "@/lib/auth";
import { getReports, Report } from "@/lib/reportsStorage";

type DashboardAnalyticsViewProps = {
  currentUser: UserSession;
  onNavigateToWizard: () => void;
  onNavigateToReports: () => void;
  onOpenPdf: (reportId: string) => void;
};

export function DashboardAnalyticsView({
  currentUser,
  onNavigateToWizard,
  onNavigateToReports,
  onOpenPdf,
}: DashboardAnalyticsViewProps) {
  const [timeRange, setTimeRange] = useState<"30d" | "month" | "quarter">("30d");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReportsData() {
      try {
        const data = await getReports();
        setReports(data);
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    }
    loadReportsData();
  }, []);

  const totalReports = reports.length;
  const totalHours = reports.reduce(
    (acc, r) => acc + (Number(r.work_hours) || 0) + (Number(r.travel_hours) || 0),
    0,
  );
  const estimatedValue = Math.round(totalHours * 45); // €45/hour estimated value
  const approvedCount = reports.filter(
    (r) => r.status === "approved" || r.status === "Approvato",
  ).length;
  const approvalRate = totalReports > 0 ? ((approvedCount / totalReports) * 100).toFixed(1) : "0.0";

  // Build client distribution from real reports
  const clientMap: Record<string, number> = {};
  reports.forEach((r) => {
    const cName = r.client?.name || "Cliente Generale";
    clientMap[cName] = (clientMap[cName] || 0) + 1;
  });

  const colors = ["#06B6D4", "#2563EB", "#6366F1", "#10B981", "#8B5CF6"];
  const clientDistribution = Object.entries(clientMap).map(([name, value], idx) => ({
    name,
    value,
    color: colors[idx % colors.length],
  }));

  // Build trend data by grouping reports by date
  const dateMap: Record<string, { rapportini: number; ore: number }> = {};
  reports.forEach((r) => {
    const dStr = r.date || "Oggi";
    if (!dateMap[dStr]) dateMap[dStr] = { rapportini: 0, ore: 0 };
    dateMap[dStr].rapportini += 1;
    dateMap[dStr].ore += Number(r.work_hours) || 0;
  });

  const trendData = Object.entries(dateMap).map(([date, data]) => ({
    date,
    rapportini: data.rapportini,
    ore: data.ore,
  }));

  return (
    <div className="space-y-6 text-white pb-8">
      {/* Welcome Banner & Control Toolbar */}
      <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Sparkles className="h-3 w-3 mr-1" /> BaseGrid Engine
            </span>
            <span className="text-xs text-white/50 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> {new Date().toLocaleDateString("it-IT")}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1.5 tracking-tight">
            Buongiorno, {currentUser.fullName.split(" ")[0]}
          </h1>
          <p className="text-sm text-white/60 mt-0.5">
            Panoramica analitica in tempo reale delle prestazioni e dei rapportini di cantiere.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center bg-slate-950/60 border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setTimeRange("30d")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                timeRange === "30d"
                  ? "bg-primary text-white shadow-sm"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Ultimi 30g
            </button>
            <button
              onClick={() => setTimeRange("month")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                timeRange === "month"
                  ? "bg-primary text-white shadow-sm"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Questo Mese
            </button>
            <button
              onClick={() => setTimeRange("quarter")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                timeRange === "quarter"
                  ? "bg-primary text-white shadow-sm"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Trimestre
            </button>
          </div>

          <button
            onClick={onNavigateToReports}
            className="h-10 px-4 bg-slate-800 hover:bg-slate-700 text-white border border-white/10 rounded-xl text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5"
          >
            <FileText className="h-4 w-4 text-blue-400" /> Vai ai Rapportini
          </button>

          <button
            onClick={onNavigateToWizard}
            className="h-10 px-4 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-semibold transition-all active:scale-95 btn-glow flex items-center gap-1.5 shadow-lg shadow-primary/20"
          >
            <Plus className="h-4 w-4" /> Nuovo Rapportino
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center bg-slate-900/60 border border-white/10 rounded-2xl">
          <div className="text-white/60 text-sm">Caricamento dati dal database...</div>
        </div>
      ) : totalReports === 0 ? (
        /* Clean Empty State Requirement */
        <div className="p-10 sm:p-14 text-center bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex flex-col items-center justify-center space-y-4 my-4">
          <div className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-inner">
            <FileText className="h-10 w-10" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white max-w-lg leading-snug">
            Benvenuto, compila il tuo primo rapportino per vedere le statistiche
          </h2>
          <p className="text-sm text-white/60 max-w-md leading-relaxed">
            Il database aziendale non contiene ancora registrazioni. Non appena registrerai ore,
            interventi e firme di cantiere, questa dashboard mostrerà in automatico i grafici di
            rendimento e l'analisi analitica.
          </p>
          <button
            onClick={onNavigateToWizard}
            className="mt-2 h-11 px-6 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-all active:scale-95 btn-glow flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Compila Primo Rapportino
          </button>
        </div>
      ) : (
        <>
          {/* 4 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1 */}
            <div className="p-5 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] relative overflow-hidden group hover:border-cyan-500/30 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Totale Rapportini
                </span>
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <FileText className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-bold text-white tracking-tight">
                {totalReports}
              </div>
              <div className="mt-2 flex items-center text-xs text-emerald-400 font-medium">
                <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> Dati sincronizzati
              </div>
            </div>

            {/* Card 2 */}
            <div className="p-5 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] relative overflow-hidden group hover:border-blue-500/30 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Ore Lavorate Totali
                </span>
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-bold text-white tracking-tight">
                {totalHours.toFixed(1)} h
              </div>
              <div className="mt-2 flex items-center text-xs text-emerald-400 font-medium">
                <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> Da rapportini
              </div>
            </div>

            {/* Card 3 */}
            <div className="p-5 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] relative overflow-hidden group hover:border-indigo-500/30 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Valore Stimato Lavori
                </span>
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-bold text-white tracking-tight">
                € {estimatedValue.toLocaleString("it-IT")}
              </div>
              <div className="mt-2 flex items-center text-xs text-white/60">
                Tariffa stimata € 45/h
              </div>
            </div>

            {/* Card 4 */}
            <div className="p-5 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] relative overflow-hidden group hover:border-emerald-500/30 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Tasso Approvazione
                </span>
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-bold text-white tracking-tight">
                {approvalRate}%
              </div>
              <div className="mt-2 flex items-center text-xs text-emerald-400 font-medium">
                {approvedCount} approvati su {totalReports}
              </div>
            </div>
          </div>

          {/* Two Main Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Line Chart */}
            <div className="lg:col-span-2 p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-cyan-400" /> Andamento Rapportini & Ore
                  </h2>
                  <p className="text-xs text-white/50 mt-0.5">
                    Progressione cumulativa registrata dal database
                  </p>
                </div>
              </div>

              <div className="h-[280px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradRapportini" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="gradOre" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="#94A3B8" fontSize={12} tickLine={false} />
                    <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0F172A",
                        borderColor: "rgba(255,255,255,0.15)",
                        borderRadius: "12px",
                        color: "#fff",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="rapportini"
                      name="Rapportini Inviati"
                      stroke="#06B6D4"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#gradRapportini)"
                    />
                    <Area
                      type="monotone"
                      dataKey="ore"
                      name="Ore Lavorate"
                      stroke="#2563EB"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#gradOre)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart */}
            <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex flex-col justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-400" /> Distribuzione per Cliente
                </h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Quota volume rapportini per committente
                </p>
              </div>

              <div className="h-[200px] w-full relative my-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={clientDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {clientDistribution.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          stroke="#090D16"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0F172A",
                        borderColor: "rgba(255,255,255,0.15)",
                        borderRadius: "12px",
                        color: "#fff",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-white">{totalReports}</span>
                  <span className="text-[10px] uppercase tracking-wider text-white/50">
                    Rapportini
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-white/10">
                {clientDistribution.slice(0, 5).map((client) => (
                  <div key={client.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-white/80">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: client.color }}
                      />
                      {client.name}
                    </span>
                    <span className="font-semibold text-white">{client.value} rapportini</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity Table */}
          <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <HardHat className="h-5 w-5 text-emerald-400" /> Registro Rapportini Recenti
                </h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Ultimi rapportini salvati nel database
                </p>
              </div>
              <button
                onClick={onNavigateToReports}
                className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors self-start sm:self-auto"
              >
                Vedi Tutti i Rapportini <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-white/50 text-xs border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 font-medium">Codice & Data</th>
                    <th className="px-4 py-3 font-medium">Cliente & Cantiere</th>
                    <th className="px-4 py-3 font-medium">Tecnico Operativo</th>
                    <th className="px-4 py-3 font-medium">Ore</th>
                    <th className="px-4 py-3 font-medium">Stato</th>
                    <th className="px-4 py-3 text-right font-medium">Documento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  {reports.slice(0, 5).map((r) => (
                    <tr key={r.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3 font-mono text-xs">
                        <div className="font-bold text-white">{r.id.substring(0, 8)}</div>
                        <div className="text-white/40">{r.date}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{r.client?.name || "N/A"}</div>
                        <div className="text-xs text-white/50 truncate max-w-[180px]">
                          {r.client?.address || "Nessun cantiere"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-bold border border-cyan-500/30">
                            {r.technician?.full_name ? r.technician.full_name[0] : "T"}
                          </div>
                          <span className="text-xs text-white">
                            {r.technician?.full_name || "Tecnico"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-white">
                        {(Number(r.work_hours) || 0).toFixed(1)}h
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            r.status === "approved" || r.status === "Approvato"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : r.status === "submitted" || r.status === "Inviato"
                                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                : "bg-white/5 text-white/60 border border-white/10"
                          }`}
                        >
                          {r.status === "approved" || r.status === "Approvato"
                            ? "Approvato"
                            : r.status === "submitted" || r.status === "Inviato"
                              ? "Inviato"
                              : "Bozza"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => onOpenPdf(r.id)}
                          className="h-8 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-white flex items-center gap-1.5 ml-auto transition-colors border border-white/10"
                        >
                          <Eye className="h-3.5 w-3.5 text-cyan-400" /> Anteprima
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
