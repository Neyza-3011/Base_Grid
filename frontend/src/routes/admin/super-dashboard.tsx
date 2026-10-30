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
import { appendCsrfHeaders, fetchServerSession, UserSession } from "@/lib/auth";
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
  is_active?: boolean;
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
    is_active?: boolean;
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
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingCompanyStatus, setChangingCompanyStatus] = useState(false);
  const [savingPlatformControls, setSavingPlatformControls] = useState(false);
  const [platformDraft, setPlatformDraft] = useState({ max_users: "5", feature_pdf_export: true });
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userDrafts, setUserDrafts] = useState<
    Record<string, { full_name: string; phone_number: string; role: string }>
  >({});
  const [userActionBusyId, setUserActionBusyId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    name: "",
    vat_number: "",
    address: "",
    default_hourly_rate: "0",
    report_footer_notes: "",
  });
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
      const tenantDetails = payload as TenantDetails;
      setSelectedTenant(tenantDetails);
      setUserDrafts(
        Object.fromEntries(
          tenantDetails.users.map((member) => [
            member.id,
            {
              full_name: member.full_name ?? "",
              phone_number: member.phone_number ?? "",
              role: member.role,
            },
          ]),
        ),
      );
      setPlatformDraft({
        max_users: String(tenantDetails.company.max_users ?? 5),
        feature_pdf_export: Boolean(tenantDetails.company.feature_pdf_export),
      });
      setProfileDraft({
        name: tenantDetails.company.name ?? "",
        vat_number: tenantDetails.company.vat_number ?? "",
        address: tenantDetails.company.address ?? "",
        default_hourly_rate: String(tenantDetails.company.default_hourly_rate ?? 0),
        report_footer_notes: tenantDetails.company.report_footer_notes ?? "",
      });
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Errore nel caricamento dei dettagli.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const saveTenantProfile = async () => {
    if (!selectedTenant) return;
    const hourlyRate = Number(profileDraft.default_hourly_rate);
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0 || hourlyRate > 10000) {
      toast.error("La tariffa oraria deve essere compresa tra 0 e 10.000.");
      return;
    }

    setSavingProfile(true);
    try {
      const response = await fetch(
        `/api/v1/admin/tenants/${encodeURIComponent(selectedTenant.company.id)}/profile`,
        {
          method: "PUT",
          credentials: "include",
          headers: appendCsrfHeaders({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
          body: JSON.stringify({
            name: profileDraft.name,
            vat_number: profileDraft.vat_number,
            address: profileDraft.address,
            default_hourly_rate: hourlyRate,
            report_footer_notes: profileDraft.report_footer_notes,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.company) {
        throw new Error(payload?.detail || "Impossibile salvare il profilo aziendale.");
      }

      const company = {
        ...payload.company,
        setup_complete: Boolean(payload.company.name?.trim() && payload.company.address?.trim()),
      };
      setSelectedTenant((current) =>
        current ? { ...current, company: { ...current.company, ...company } } : current,
      );
      setTenants((current) =>
        current.map((tenant) =>
          tenant.id === company.id
            ? { ...tenant, name: company.name, setup_complete: company.setup_complete }
            : tenant,
        ),
      );
      toast.success("Profilo aziendale salvato.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore durante il salvataggio.");
    } finally {
      setSavingProfile(false);
    }
  };


  const changeTenantStatus = async (activate: boolean) => {
    if (!selectedTenant) return;
    const action = activate ? "riattivare" : "sospendere";
    const message = activate
      ? "Riattivare questa azienda? Gli utenti dovranno autenticarsi di nuovo."
      : "Sospendere questa azienda? Tutti gli utenti perderanno l'accesso, ma i dati aziendali saranno conservati.";
    if (!window.confirm(message)) return;

    setChangingCompanyStatus(true);
    try {
      const response = await fetch(
        `/api/v1/admin/tenants/${encodeURIComponent(selectedTenant.company.id)}/${activate ? "reactivate" : "suspend"}`,
        {
          method: "POST",
          credentials: "include",
          headers: appendCsrfHeaders({ Accept: "application/json" }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.company) {
        throw new Error(payload?.detail || `Impossibile ${action} l'azienda.`);
      }

      const isActive = Boolean(payload.company.is_active);
      setSelectedTenant((current) =>
        current
          ? { ...current, company: { ...current.company, is_active: isActive } }
          : current,
      );
      setTenants((current) =>
        current.map((tenant) =>
          tenant.id === selectedTenant.company.id
            ? { ...tenant, is_active: isActive }
            : tenant,
        ),
      );
      toast.success(isActive ? "Azienda riattivata." : "Azienda sospesa.");
      await loadAdminData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Errore durante il tentativo di ${action} l'azienda.`,
      );
    } finally {
      setChangingCompanyStatus(false);
    }
  };

  const saveTenantPlatformControls = async () => {
    if (!selectedTenant) return;
    const maxUsers = Number(platformDraft.max_users);
    if (!Number.isInteger(maxUsers) || maxUsers < 1 || maxUsers > 5000) {
      toast.error("Il limite utenti deve essere un intero tra 1 e 5000.");
      return;
    }

    setSavingPlatformControls(true);
    try {
      const response = await fetch(
        `/api/v1/admin/tenants/${encodeURIComponent(selectedTenant.company.id)}/platform-settings`,
        {
          method: "PUT",
          credentials: "include",
          headers: appendCsrfHeaders({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
          body: JSON.stringify({
            max_users: maxUsers,
            feature_pdf_export: platformDraft.feature_pdf_export,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.company) {
        throw new Error(payload?.detail || "Impossibile salvare i controlli della piattaforma.");
      }

      setSelectedTenant((current) =>
        current
          ? {
              ...current,
              company: {
                ...current.company,
                max_users: payload.company.max_users,
                feature_pdf_export: payload.company.feature_pdf_export,
              },
            }
          : current,
      );
      setTenants((current) =>
        current.map((tenant) =>
          tenant.id === payload.company.id
            ? { ...tenant, max_users: payload.company.max_users }
            : tenant,
        ),
      );
      toast.success("Controlli aziendali aggiornati.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Errore durante il salvataggio dei controlli.",
      );
    } finally {
      setSavingPlatformControls(false);
    }
  };

  const saveTenantUser = async (userId: string) => {
    if (!selectedTenant) return;
    const draft = userDrafts[userId];
    if (!draft) return;

    setUserActionBusyId(userId);
    try {
      const response = await fetch(
        `/api/v1/admin/tenants/${encodeURIComponent(selectedTenant.company.id)}/users/${encodeURIComponent(userId)}`,
        {
          method: "PUT",
          credentials: "include",
          headers: appendCsrfHeaders({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
          body: JSON.stringify({
            full_name: draft.full_name,
            phone_number: draft.phone_number,
            role: draft.role,
          }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.user) {
        throw new Error(payload?.detail || "Impossibile aggiornare l'utente.");
      }

      const member = payload.user;
      setSelectedTenant((current) =>
        current
          ? {
              ...current,
              users: current.users.map((item) =>
                item.id === userId ? { ...item, ...member } : item,
              ),
              owner:
                current.owner?.email === member.email
                  ? {
                      full_name: member.full_name,
                      email: member.email,
                      role: member.role,
                    }
                  : current.owner,
            }
          : current,
      );
      setUserDrafts((current) => ({
        ...current,
        [userId]: {
          full_name: member.full_name,
          phone_number: member.phone_number ?? "",
          role: member.role,
        },
      }));
      toast.success("Utente aggiornato.");
      await loadAdminData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Errore durante l'aggiornamento dell'utente.",
      );
    } finally {
      setUserActionBusyId(null);
    }
  };

  const changeTenantUserStatus = async (userId: string, activate: boolean) => {
    if (!selectedTenant) return;
    const member = selectedTenant.users.find((item) => item.id === userId);
    if (!member) return;

    const actionLabel = activate ? "riattivare" : "disattivare";
    const confirmationMessage = `Confermi di ${actionLabel} l'accesso di ${member.full_name} (${member.email})? ${activate ? "" : "Le sessioni di accesso verranno revocate."}`;
    if (!window.confirm(confirmationMessage)) return;

    setUserActionBusyId(userId);
    try {
      const response = await fetch(
        `/api/v1/admin/tenants/${encodeURIComponent(selectedTenant.company.id)}/users/${encodeURIComponent(userId)}/${activate ? "activate" : "deactivate"}`,
        {
          method: "POST",
          credentials: "include",
          headers: appendCsrfHeaders({ Accept: "application/json" }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.user) {
        throw new Error(payload?.detail || `Impossibile ${actionLabel} l'utente.`);
      }

      setSelectedTenant((current) =>
        current
          ? {
              ...current,
              users: current.users.map((item) =>
                item.id === userId ? { ...item, ...payload.user } : item,
              ),
              active_user_count: current.users.filter((item) =>
                item.id === userId ? payload.user.is_active : item.is_active,
              ).length,
            }
          : current,
      );
      toast.success(activate ? "Accesso utente riattivato." : "Accesso utente disattivato.");
      await loadAdminData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Errore durante la modifica dell'accesso.",
      );
    } finally {
      setUserActionBusyId(null);
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
    `${tenant.name} ${tenant.id}`.toLowerCase().includes(tenantSearch.trim().toLowerCase()),
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
                Profili aziendali e utenti associati. I dettagli vengono letti dalle API protette
                lato server.
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
                      <td className="p-3.5 text-white/60 font-mono text-[11px]">{t.id}</td>
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
              </tbody>
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

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${selectedTenant.company.is_active === false ? "border-red-400/30 bg-red-400/10 text-red-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}
                >
                  {selectedTenant.company.is_active === false ? "Azienda sospesa" : "Azienda attiva"}
                </span>
                <button
                  type="button"
                  onClick={() => void changeTenantStatus(selectedTenant.company.is_active === false)}
                  disabled={changingCompanyStatus || selectedTenant.company.id === "comp-master-001"}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${selectedTenant.company.is_active === false ? "border-emerald-400/30 text-emerald-200 hover:bg-emerald-400/10" : "border-red-400/30 text-red-200 hover:bg-red-400/10"}`}
                >
                  {changingCompanyStatus
                    ? "Aggiornamento..."
                    : selectedTenant.company.is_active === false
                      ? "Riattiva azienda"
                      : "Sospendi azienda"}
                </button>
              </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["Azienda", selectedTenant.company.name || "Non impostata"],
                    ["ID", selectedTenant.company.id],
                    ["Stato azienda", selectedTenant.company.is_active === false ? "Sospesa" : "Attiva"],
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

                <form
                  className="space-y-4 rounded-xl border border-white/10 bg-[#090D16] p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveTenantProfile();
                  }}
                >
                  <div>
                    <h3 className="text-sm font-semibold text-white">Modifica profilo aziendale</h3>
                    <p className="mt-1 text-xs text-white/50">
                      Sono modificabili solo i dati anagrafici e operativi del profilo. Abbonamento
                      e permessi non vengono modificati qui.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["name", "Nome azienda", "text"],
                        ["vat_number", "Partita IVA", "text"],
                        ["address", "Indirizzo", "text"],
                      ] as const
                    ).map(([key, label, type]) => (
                      <label key={key} className="space-y-1 text-xs text-white/70">
                        <span>{label}</span>
                        <input
                          type={type}
                          value={profileDraft[key]}
                          onChange={(event) =>
                            setProfileDraft((draft) => ({ ...draft, [key]: event.target.value }))
                          }
                          maxLength={key === "name" ? 100 : key === "address" ? 255 : 50}
                          required={key === "name"}
                          disabled={savingProfile}
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                        />
                      </label>
                    ))}
                    <label className="space-y-1 text-xs text-white/70">
                      <span>Tariffa oraria predefinita (€)</span>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        step="0.01"
                        required
                        value={profileDraft.default_hourly_rate}
                        onChange={(event) =>
                          setProfileDraft((draft) => ({
                            ...draft,
                            default_hourly_rate: event.target.value,
                          }))
                        }
                        disabled={savingProfile}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                      />
                    </label>
                  </div>
                  <label className="block space-y-1 text-xs text-white/70">
                    <span>Note a piè di pagina dei rapportini</span>
                    <textarea
                      value={profileDraft.report_footer_notes}
                      onChange={(event) =>
                        setProfileDraft((draft) => ({
                          ...draft,
                          report_footer_notes: event.target.value,
                        }))
                      }
                      maxLength={1000}
                      rows={3}
                      disabled={savingProfile}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingProfile ? "Salvataggio..." : "Salva modifiche"}
                    </button>
                  </div>
                </form>

                <form
                  className="space-y-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveTenantPlatformControls();
                  }}
                >
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Controlli della piattaforma
                    </h3>
                    <p className="mt-1 text-xs text-white/50">
                      Limiti e funzionalità disponibili per questa azienda. Non modifica
                      l'abbonamento Stripe.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-white/70">
                      <span>Numero massimo di utenti</span>
                      <input
                        type="number"
                        min="1"
                        max="5000"
                        step="1"
                        required
                        value={platformDraft.max_users}
                        onChange={(event) =>
                          setPlatformDraft((draft) => ({
                            ...draft,
                            max_users: event.target.value,
                          }))
                        }
                        disabled={savingPlatformControls}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                      />
                    </label>
                    <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                      <input
                        type="checkbox"
                        checked={platformDraft.feature_pdf_export}
                        onChange={(event) =>
                          setPlatformDraft((draft) => ({
                            ...draft,
                            feature_pdf_export: event.target.checked,
                          }))
                        }
                        disabled={savingPlatformControls}
                        className="h-4 w-4 accent-emerald-400"
                      />
                      <span>
                        <span className="block font-medium">Esportazione PDF</span>
                        <span className="block text-xs text-white/45">
                          Consenti a questa azienda di esportare i rapportini PDF.
                        </span>
                      </span>
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingPlatformControls}
                      className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50"
                    >
                      {savingPlatformControls ? "Salvataggio..." : "Salva controlli"}
                    </button>
                  </div>
                </form>

                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Gestione utenti</h3>
                      <p className="mt-1 text-xs text-white/50">
                        Modifica nome, telefono e ruolo; disattiva o riattiva l'accesso
                        e revoca le sessioni.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="search"
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.target.value)}
                        placeholder="Cerca nome o email..."
                        aria-label="Cerca utenti dell'azienda"
                        className="rounded-lg border border-white/10 bg-[#090D16] px-3 py-2 text-xs text-white"
                      />
                      <select
                        value={userRoleFilter}
                        onChange={(event) => setUserRoleFilter(event.target.value)}
                        aria-label="Filtra utenti per ruolo"
                        className="rounded-lg border border-white/10 bg-[#090D16] px-3 py-2 text-xs text-white"
                      >
                        <option value="all">Tutti i ruoli</option>
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="responsabile_tecnico">Responsabile tecnico</option>
                        <option value="dispatcher">Dispatcher</option>
                        <option value="technician">Tecnico</option>
                        <option value="amministrazione">Amministrazione</option>
                        <option value="commerciale">Commerciale</option>
                        <option value="cliente">Cliente</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/70">
                      {selectedTenant.user_count} utenti totali
                    </span>
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-300">
                      {selectedTenant.active_user_count} attivi
                    </span>
                    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-amber-300">
                      {selectedTenant.user_count - selectedTenant.active_user_count} disattivati
                    </span>
                  </div>
                  {selectedTenant.users.length === 0 ? (
                    <p className="rounded-xl border border-white/10 p-5 text-sm text-white/50">
                      Nessun utente associato a questa azienda.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selectedTenant.users
                        .filter((member) =>
                          `${member.full_name} ${member.email}`
                            .toLowerCase()
                            .includes(userSearch.trim().toLowerCase()),
                        )
                        .filter(
                          (member) =>
                            userRoleFilter === "all" || member.role === userRoleFilter,
                        )
                        .map((member) => {
                          const draft = userDrafts[member.id] ?? {
                            full_name: member.full_name,
                            phone_number: member.phone_number ?? "",
                            role: member.role,
                          };
                          const busy = userActionBusyId === member.id;
                          const isPlatformIdentity = member.role === "superadmin";
                          return (
                            <article
                              key={member.id}
                              className="rounded-xl border border-white/10 bg-[#090D16] p-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="break-all text-sm font-semibold text-white">
                                      {member.full_name}
                                    </p>
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[10px] ${
                                        member.is_active
                                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                          : "border-amber-400/30 bg-amber-400/10 text-amber-300"
                                      }`}
                                    >
                                      {member.is_active ? "Accesso attivo" : "Accesso disattivato"}
                                    </span>
                                  </div>
                                  <p className="mt-1 break-all text-xs text-white/50">
                                    {member.email}
                                  </p>
                                  <p className="mt-1 text-[10px] text-white/35">ID: {member.id} · Email verificata: {member.email_confirmed ? "Sì" : "No"}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void saveTenantUser(member.id)}
                                    disabled={busy || isPlatformIdentity}
                                    className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
                                  >
                                    {busy ? "Attendi..." : "Salva utente"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void changeTenantUserStatus(member.id, !member.is_active)
                                    }
                                    disabled={busy || isPlatformIdentity}
                                    className={`rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-40 ${
                                      member.is_active
                                        ? "border-red-400/30 text-red-300 hover:bg-red-400/10"
                                        : "border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10"
                                    }`}
                                  >
                                    {member.is_active ? "Disattiva accesso" : "Riattiva accesso"}
                                  </button>
                                </div>
                              </div>
                              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <label className="space-y-1 text-xs text-white/60">
                                  <span>Nome completo</span>
                                  <input
                                    value={draft.full_name}
                                    maxLength={100}
                                    onChange={(event) =>
                                      setUserDrafts((current) => ({
                                        ...current,
                                        [member.id]: { ...draft, full_name: event.target.value },
                                      }))
                                    }
                                    disabled={busy || isPlatformIdentity}
                                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-50"
                                  />
                                </label>
                                <label className="space-y-1 text-xs text-white/60">
                                  <span>Telefono</span>
                                  <input
                                    value={draft.phone_number}
                                    maxLength={20}
                                    onChange={(event) =>
                                      setUserDrafts((current) => ({
                                        ...current,
                                        [member.id]: { ...draft, phone_number: event.target.value },
                                      }))
                                    }
                                    disabled={busy || isPlatformIdentity}
                                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-50"
                                  />
                                </label>
                                <label className="space-y-1 text-xs text-white/60">
                                  <span>Ruolo aziendale</span>
                                  <select
                                    value={draft.role}
                                    onChange={(event) =>
                                      setUserDrafts((current) => ({
                                        ...current,
                                        [member.id]: { ...draft, role: event.target.value },
                                      }))
                                    }
                                    disabled={busy || isPlatformIdentity}
                                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-50"
                                  >
                                    <option value="owner">Owner</option>
                                    <option value="admin">Admin</option>
                                    <option value="responsabile_tecnico">
                                      Responsabile tecnico
                                    </option>
                                    <option value="dispatcher">Dispatcher</option>
                                    <option value="technician">Tecnico</option>
                                    <option value="amministrazione">Amministrazione</option>
                                    <option value="commerciale">Commerciale</option>
                                    <option value="cliente">Cliente</option>
                                  </select>
                                </label>
                              </div>
                            </article>
                          );
                        })}
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
