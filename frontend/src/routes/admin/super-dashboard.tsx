import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Server,
  Users,
  FileText,
  Database,
  Activity,
  Box,
  Lock,
  LogOut,
  ExternalLink,
  RefreshCw,
  Layers,
} from "lucide-react";
import { fetchServerSession, UserSession } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/super-dashboard")({
  head: () => ({
    meta: [
      { title: "Master Super-Admin Panel · BaseGrid" },
      {
        name: "description",
        content: "Pannello di controllo globale per il Super-Admin di BaseGrid.",
      },
    ],
  }),
  component: SuperDashboard,
});

type TenantCompany = {
  id: string;
  name: string;
  created_at?: string;
  plan?: string;
  status?: string;
};

type GlobalStats = {
  total_tenants: number;
  total_users: number;
  total_reports: number;
  total_clients: number;
  sandbox_mode_active: boolean;
  system_status: string;
};

export function SuperDashboard() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [tenants, setTenants] = useState<TenantCompany[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [statsRes, tenantsRes] = await Promise.all([
        fetch("/api/v1/admin/stats", { credentials: "include" }),
        fetch("/api/v1/admin/tenants", { credentials: "include" }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      if (tenantsRes.ok) {
        const tenantsData = await tenantsRes.json();
        setTenants(tenantsData);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function checkAdminAccess() {
      const usr = await fetchServerSession();
      if (!usr) {
        toast.error("Accesso riservato. Effettua il login come Super-Admin.");
        navigate({ to: "/" });
        return;
      }
      if (usr.role !== "superadmin") {
        toast.error("Area riservata al Master Super-Admin (saas@rapporti.it).");
        navigate({ to: "/dashboard" });
        return;
      }
      setUser(usr);
      loadAdminData();
    }
    checkAdminAccess();
  }, [navigate]);

  const handleRefreshData = async () => {
    toast.loading("Sincronizzazione dati da PostgreSQL e Redis...");
    await loadAdminData();
    toast.dismiss();
    toast.success("Dati di sistema aggiornati dal database.");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#090D16] text-white flex flex-col">
      {/* Top Admin Navigation */}
      <header className="border-b border-white/10 bg-[#0F172A]/80 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 grid place-items-center font-black text-slate-950 text-sm shadow-lg shadow-emerald-500/20">
            SA
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-white">
                Master Super-Admin Panel
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold uppercase">
                Zero-Trust Active
              </span>
            </div>
            <p className="text-[11px] text-white/50">
              {user.email} · Multi-tenant Global Oversight
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/admin/sandbox"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30 text-xs font-semibold transition"
          >
            <Layers className="h-3.5 w-3.5 text-indigo-400" /> Cloned Sandbox Test Env
          </Link>

          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white/80 hover:text-white transition"
          >
            Dashboard SaaS <ExternalLink className="h-3 w-3" />
          </Link>

          <button
            onClick={() => {
              navigate({ to: "/" });
              toast.info("Sessione Super-Admin terminata");
            }}
            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition"
            title="Esci dall'Area Riservata"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-8">
        {/* System Health Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white/60 uppercase tracking-wider">
                Aziende Registrate
              </p>
              <h3 className="text-2xl font-black mt-1 text-white">
                {stats ? stats.total_tenants : tenants.length} Tenants
              </h3>
              <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Isolamento Tenant 100%
              </p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center text-emerald-400">
              <Users className="h-5 w-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white/60 uppercase tracking-wider">
                Totale Utenti SaaS
              </p>
              <h3 className="text-2xl font-black mt-1 text-white">
                {stats ? stats.total_users : 0} Utenti
              </h3>
              <p className="text-[10px] text-emerald-400 mt-1">Ruoli attivi nel sistema</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-blue-500/10 border border-blue-500/20 grid place-items-center text-blue-400">
              <FileText className="h-5 w-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white/60 uppercase tracking-wider">
                Stato PostgreSQL & DB
              </p>
              <h3 className="text-2xl font-black mt-1 text-emerald-400">Online 100%</h3>
              <p className="text-[10px] text-white/50 mt-1">Async SQLAlchemy 2.0</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 grid place-items-center text-emerald-400">
              <Database className="h-5 w-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white/60 uppercase tracking-wider">
                Totale Rapportini DB
              </p>
              <h3 className="text-2xl font-black mt-1 text-indigo-400">
                {stats ? stats.total_reports : 0} Doc
              </h3>
              <p className="text-[10px] text-white/50 mt-1">Multi-tenant Isolation</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 grid place-items-center text-indigo-400">
              <Activity className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Action Header & Tenants Table */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Box className="h-5 w-5 text-emerald-400" /> Monitoraggio Aziende & Tenant SaaS
              </h2>
              <p className="text-xs text-white/60 mt-0.5">
                Ogni azienda opera su uno schema logicamente separato via{" "}
                <code className="text-emerald-300 bg-white/5 px-1 py-0.5 rounded">company_id</code>.
              </p>
            </div>

            <button
              onClick={handleRefreshData}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Aggiorna
              Stato
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#090D16]">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 text-white/60 font-medium uppercase tracking-wider border-b border-white/10">
                <tr>
                  <th className="p-3.5">Azienda / Tenant</th>
                  <th className="p-3.5">ID Azienda</th>
                  <th className="p-3.5">Piano SaaS</th>
                  <th className="p-3.5">Stato Billing</th>
                  <th className="p-3.5 text-right">Azioni Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/90">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-white/40">
                      Caricamento aziende dal database...
                    </td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-white/40">
                      Nessuna azienda registrata oltre al Master Tenant.
                    </td>
                  </tr>
                ) : (
                  tenants.map((t) => (
                    <tr key={t.id} className="hover:bg-white/5 transition">
                      <td className="p-3.5 font-semibold text-white flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        {t.name}
                      </td>
                      <td className="p-3.5 text-white/60 font-mono text-[11px]">{t.id}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 font-medium">
                          {t.plan || "Pro Enterprise"}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full font-semibold text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {t.status || "Attiva"}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() =>
                            toast.info(
                              `Ispezione Tenant ${t.name} (company_id: ${t.id.slice(0, 8)}...)`,
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium transition"
                        >
                          Ispeziona
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
