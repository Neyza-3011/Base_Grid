import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  FileText,
  Users,
  HardHat,
  Package,
  Receipt,
  Search,
  Bell,
  Download,
  Printer,
  X,
  Hammer,
  LogOut,
  ShieldCheck,
  Layers,
  TestTube,
  Sparkles,
} from "lucide-react";
import { fetchServerSession, UserSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/sandbox")({
  head: () => ({
    meta: [
      { title: "Cloned Sandbox Test Env · BaseGrid" },
      { name: "description", content: "Ambiente di test isolato per Super-Admin." },
    ],
  }),
  component: SandboxEnvironment,
});

type Report = {
  id: string;
  date: string;
  tech: string;
  client: string;
  site: string;
  hours: number;
  status: "Bozza" | "Inviato" | "Approvato";
};

// Isolated Sandbox Test Data (Doesn't touch production records)
const SANDBOX_REPORTS: Report[] = [
  {
    id: "SANDBOX-001",
    date: "27/07/2026",
    tech: "Test Tech A",
    client: "Cliente Simulazione Srl",
    site: "Cantiere Demo Alpha",
    hours: 4.0,
    status: "Approvato",
  },
  {
    id: "SANDBOX-002",
    date: "27/07/2026",
    tech: "Test Tech B",
    client: "Beta Test Inc.",
    site: "Cantiere Demo Beta",
    hours: 6.5,
    status: "Inviato",
  },
  {
    id: "SANDBOX-003",
    date: "26/07/2026",
    tech: "Test Tech C",
    client: "Gamma Prove SpA",
    site: "Sede di Prova",
    hours: 3.0,
    status: "Bozza",
  },
];

function SandboxEnvironment() {
  const [query, setQuery] = useState("");
  const [reports, setReports] = useState<Report[]>(SANDBOX_REPORTS);
  const [currentUser, setUser] = useState<UserSession | null>(null);

  useEffect(() => {
    fetchServerSession().then((usr) => {
      if (usr) {
        setUser(usr);
      } else {
        toast.error("Sessione non valida o scaduta. Effettua l'accesso.");
      }
    });
    toast.info("Ambiente Cloned Sandbox attivo (Dati di test isolati).");
  }, []);

  const handleSimulateNewReport = () => {
    const newRep: Report = {
      id: `SANDBOX-${Math.floor(100 + Math.random() * 900)}`,
      date: new Date().toLocaleDateString("it-IT"),
      tech: "Super-Admin Tester",
      client: "Cliente Test Sandbox",
      site: "Cantiere Sperimentale",
      hours: 5.0,
      status: "Inviato",
    };
    setReports([newRep, ...reports]);
    toast.success("Nuovo rapportino simulato con successo nel Sandbox!");
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* Sandbox Alert Top Bar */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white px-4 py-2.5 flex items-center justify-between text-xs font-medium shadow-md">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <TestTube className="h-4 w-4 text-indigo-300" />
          <span className="font-bold">MODE: CLONED SANDBOX TEST ENVIRONMENT</span>
          <span className="hidden sm:inline text-indigo-200">
            · Operazioni collegate a{" "}
            <code className="bg-white/10 px-1 py-0.5 rounded font-mono">sandbox_company_id</code>{" "}
            (Zero impatto sui clienti reali).
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulateNewReport}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition text-[11px]"
          >
            <Sparkles className="h-3 w-3" /> Simula Generazione PDF
          </button>
          <Link
            to="/admin/super-dashboard"
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] transition"
          >
            Ritorna al Control Panel
          </Link>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-[#0F172A] text-white min-h-[calc(100vh-37px)] flex flex-col border-r border-white/5">
          <div className="p-4 border-b border-white/5 flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-indigo-500 text-slate-950 grid place-items-center font-black text-xs">
              SB
            </div>
            <div>
              <span className="text-sm font-semibold text-white">Rapportini Sandbox</span>
              <p className="text-[10px] text-indigo-300">Test Tenant Isolation</p>
            </div>
          </div>
          <div className="p-3">
            <div className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/10">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-500 text-xs font-bold text-white">
                  SA
                </span>
                <div className="text-left min-w-0 flex-1">
                  <div className="text-xs font-medium text-white truncate flex items-center gap-1">
                    Super-Admin Test
                    <ShieldCheck className="h-3 w-3 text-emerald-400 shrink-0" />
                  </div>
                  <div className="text-[10px] text-white/60 truncate">saas@rapporti.it</div>
                </div>
              </div>
            </div>
          </div>
          <nav className="flex-1 px-3 space-y-1 text-sm">
            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-white/10 font-medium text-white">
              <LayoutDashboard className="h-4 w-4 text-indigo-400" /> Dashboard Test
            </div>
            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-white/60 hover:text-white hover:bg-white/5 transition cursor-pointer">
              <FileText className="h-4 w-4" /> Rapportini Sandbox
            </div>
            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-white/60 hover:text-white hover:bg-white/5 transition cursor-pointer">
              <Users className="h-4 w-4" /> Clienti Test
            </div>
            <div className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-white/60 hover:text-white hover:bg-white/5 transition cursor-pointer">
              <Package className="h-4 w-4" /> Magazzino Test
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Sandbox Test Dashboard
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Visuale speculare all'applicazione di produzione per verificare i flussi di lavoro
                in totale sicurezza.
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Rapportini di Prova ({reports.length})
              </span>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  suppressHydrationWarning
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cerca nei dati sandbox..."
                  className="w-full h-8 pl-9 pr-3 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-medium uppercase border-b border-slate-200">
                <tr>
                  <th className="p-3.5">ID Documento</th>
                  <th className="p-3.5">Data</th>
                  <th className="p-3.5">Tecnico Test</th>
                  <th className="p-3.5">Cliente Test</th>
                  <th className="p-3.5">Cantiere</th>
                  <th className="p-3.5">Ore</th>
                  <th className="p-3.5">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3.5 font-bold text-indigo-600">{r.id}</td>
                    <td className="p-3.5 text-slate-600">{r.date}</td>
                    <td className="p-3.5 font-medium text-slate-900">{r.tech}</td>
                    <td className="p-3.5 text-slate-700">{r.client}</td>
                    <td className="p-3.5 text-slate-600">{r.site}</td>
                    <td className="p-3.5 font-semibold text-slate-900">{r.hours}h</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
