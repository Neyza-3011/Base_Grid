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
  plan?: string | null;
  max_users?: number;
  setup_complete?: boolean;
};

type TenantDetails = {
  company: {
    id: string;
    name: string;
    vat_number?: string;
    address?: string;
    default_hourly_rate?: number;
    report_footer_notes?: string;
    subscription_status?: string | null;
    max_users?: number;
    feature_pdf_export?: boolean;
    created_at?: string;
    updated_at?: string;
    setup_complete: boolean;
  };
  users: Array<{
    id: string;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    email_confirmed: boolean;
    phone_number?: string | null;
    created_at?: string;
    updated_at?: string;
  }>;
  user_count: number;
  active_user_count: number;
  owner: { full_name: string; email: string; role: string } | null;
};

type GlobalStats = {
  total_tenants: number;
  total_users: number;
  total_reports: number;
  total_clients: number;
  system_status: string;
};

export function SuperDashboard() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [tenants, setTenants] = useState<TenantCompany[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantSearch, setTenantSearch] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<TenantDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const navigate = useNavigate();

  const inspectTenant = async (companyId: string) => {
    setSelectedTenant(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/tenants/${encodeURIComponent(companyId)}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || "Impossibile caricare i dettagli dell'azienda.");
      }
      setSelectedTenant(payload as TenantDetails);
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Errore nel caricamento dei dettagli.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

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
      if (usr.platformRole !== "ceo") {
        toast.error("Area riservata al CEO della piattaforma.");
        navigate({ to: "/dashboard" });
        return;
      }
      setUser(usr);
      loadAdminData();
    }
    checkAdminAccess();
  }, [navigate]);

  const filteredTenants = tenants.filter((tenant) =>
    `${tenant.name} ${tenant.id}`
      .toLowerCase()
      .includes(tenantSearch.trim().toLowerCase()),
  );

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
              <p className="text-[10px] text-white/50 mt-1">Conteggio restituito dall'API</p>
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
              <p className="text-[10px] text-white/50 mt-1">Utenti conteggiati dall'API</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-blue-500/10 border border-blue-500/20 grid place-items-center text-blue-400">
              <FileText className="h-5 w-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-white/60 uppercase tracking-wider">
                Stato piattaforma
              </p>
              <h3 className="text-2xl font-black mt-1 text-white">
                {stats?.system_status || "Non disponibile"}
              </h3>
              <p className="text-[10px] text-white/50 mt-1">Valore restituito dall'API</p>
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
                Profili aziendali e utenti associati. I dettagli vengono letti dalle
                API protette lato server.
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

          <label className="block">
            <span className="sr-only">Cerca azienda</span>
            <input
              value={tenantSearch}
              onChange={(event) => setTenantSearch(event.target.value)}
              placeholder="Cerca per nome o ID azienda..."
              className="w-full rounded-xl border border-white/10 bg-[#090D16] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-emerald-400/60"
              type="search"
            />
          </label>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#090D16]">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 text-white/60 font-medium uppercase tracking-wider border-b border-white/10">
                <tr>
                  <th className="p-3.5">Azienda / Tenant</th>
                  <th className="p-3.5">ID Azienda</th>
                  <th className="p-3.5">Piano SaaS</th>
                  <th className="p-3.5">Configurazione</th>
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
                ) : filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-white/40">
                      Nessuna azienda corrisponde alla ricerca.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-white/5 transition">
                      <td className="p-3.5 font-semibold text-white flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            t.setup_complete ? "bg-emerald-400" : "bg-amber-400"
                          }`}
                        />
                        {t.name}
                      </td>
                      <td className="p-3.5 text-white/60 font-mono text-[11px]">
                        {t.id}
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 font-medium">
                          {t.plan || "Piano non disponibile"}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full font-semibold text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {t.setup_complete ? "Setup completato" : "Setup incompleto"}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => void inspectTenant(t.id)}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium transition"
                        >
                          Dettagli
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>      </tbody>
            </table>
          </div>
        </div>

        {(detailLoading || detailError || selectedTenant) && (
          <section
            className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-white">Dettaglio azienda</h2>
              <button
                type="button"
                onClick={() => {
                  setSelectedTenant(null);
                  setDetailError(null);
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
              >
                Chiudi
              </button>
            </div>
            {detailLoading && (
              <p className="text-sm text-white/60">Caricamento dettagli persistenti...</p>
            )}
            {detailError && (
              <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                {detailError}
              </div>
            )}
            {selectedTenant && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["Azienda", selectedTenant.company.name || "Non impostata"],
                    ["ID", selectedTenant.company.id],
                    ["Partita IVA", selectedTenant.company.vat_number || "Non disponibile"],
                    ["Indirizzo", selectedTenant.company.address || "Non impostato"],
                    [
                      "Stato configurazione",
                      selectedTenant.company.setup_complete ? "Completata" : "Incompleta",
                    ],
                    [
                      "Stato abbonamento",
                      selectedTenant.company.subscription_status || "Non disponibile",
                    ],
                    [
                      "Utenti attivi",
                      `${selectedTenant.active_user_count} / ${selectedTenant.user_count}`,
                    ],
                    [
                      "Limite utenti",
                      String(selectedTenant.company.max_users ?? "Non disponibile"),
                    ],
                    [
                      "Tariffa oraria predefinita",
                      selectedTenant.company.default_hourly_rate == null
                        ? "Non disponibile"
                        : `€ ${selectedTenant.company.default_hourly_rate}`,
                    ],
                    [
                      "Export PDF",
                      selectedTenant.company.feature_pdf_export == null
                        ? "Non disponibile"
                        : selectedTenant.company.feature_pdf_export
                          ? "Abilitato"
                          : "Disabilitato",
                    ],
                    [
                      "Creato il",
                      selectedTenant.company.created_at
                        ? new Date(selectedTenant.company.created_at).toLocaleString("it-IT")
                        : "Non disponibile",
                    ],
                    [
                      "Aggiornato il",
                      selectedTenant.company.updated_at
                        ? new Date(selectedTenant.company.updated_at).toLocaleString("it-IT")
                        : "Non disponibile",
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-[#090D16] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-white/45">{label}</p>
                      <p className="mt-1 break-words text-sm text-white">{value}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-white">Utenti associati</h3>
                  {selectedTenant.users.length === 0 ? (
                    <p className="text-sm text-white/50">
                      Nessun utente associato a questa azienda.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white/5 text-white/55">
                          <tr>
                            <th className="p-3">Utente</th>
                            <th className="p-3">Ruolo aziendale</th>
                            <th className="p-3">Account</th>
                            <th className="p-3">Email verificata</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {selectedTenant.users.map((member) => (
                            <tr key={member.id}>
                              <td className="p-3">
                                <div className="font-medium text-white">{member.full_name}</div>
                                <div className="text-white/50">{member.email}</div>
                              </td>
                              <td className="p-3 text-white/70">{member.role}</td>
                              <td className="p-3">{member.is_active ? "Attivo" : "Disattivato"}</td>
                              <td className="p-3">{member.email_confirmed ? "Sì" : "No"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
