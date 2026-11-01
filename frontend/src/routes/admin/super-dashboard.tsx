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
import { appendCsrfHeaders, fetchServerSession, logoutUser, UserSession } from "@/lib/auth";
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
    created_at?: string;
    updated_at?: string;
    setup_complete: boolean;
    is_active?: boolean;
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

type AdminAuditEvent = {
  id: string | number;
  actor_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export function SuperDashboard() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [tenants, setTenants] = useState<TenantCompany[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminLoadError, setAdminLoadError] = useState<string | null>(null);
  const [tenantSearch, setTenantSearch] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<TenantDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [tenantActionLoading, setTenantActionLoading] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
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

  const loadAuditEvents = async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const response = await fetch("/api/v1/admin/audit-events?limit=50", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || !Array.isArray(payload.events)) {
        throw new Error(payload?.detail || "Impossibile caricare il registro amministrativo.");
      }
      setAuditEvents(payload.events as AdminAuditEvent[]);
    } catch (error) {
      setAuditError(
        error instanceof Error ? error.message : "Errore durante il caricamento del registro.",
      );
    } finally {
      setAuditLoading(false);
    }
  };

  const changeTenantStatus = async (isActive: boolean) => {
    if (!selectedTenant || tenantActionLoading) return;
    const company = selectedTenant.company;
    const actionLabel = isActive ? "riattivare" : "sospendere";
    const confirmation =
      "Confermi di " + actionLabel + " l'azienda \\"" + company.name + '"?';
    if (!window.confirm(confirmation)) return;

    setTenantActionLoading(true);
    try {
      const action = isActive ? "reactivate" : "suspend";
      const response = await fetch(
        "/api/v1/admin/tenants/" + encodeURIComponent(company.id) + "/" + action,
        {
          method: "POST",
          credentials: "include",
          headers: appendCsrfHeaders({ Accept: "application/json" }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.company || typeof payload.company.is_active !== "boolean") {
        throw new Error(payload?.detail || "Impossibile " + actionLabel + " l'azienda.");
      }

      setSelectedTenant((current) =>
        current
          ? {
              ...current,
              company: { ...current.company, is_active: payload.company.is_active },
            }
          : current,
      );
      setTenants((current) =>
        current.map((tenant) =>
          tenant.id === company.id ? { ...tenant, is_active: payload.company.is_active } : tenant,
        ),
      );
      toast.success(
        payload.changed === false
          ? "Lo stato dell'azienda era già aggiornato."
          : "Azienda " + (isActive ? "riattivata" : "sospesa") + ".",
      );
      void loadAuditEvents();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Errore durante l'operazione: " + actionLabel + ".",
      );
    } finally {
      setTenantActionLoading(false);
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

  const loadAdminData = async (): Promise<boolean> => {
    setLoading(true);
    setAdminLoadError(null);
    try {
      const [statsRes, tenantsRes] = await Promise.all([
        fetch("/api/v1/admin/stats", {
          credentials: "include",
          headers: { Accept: "application/json" },
        }),
        fetch("/api/v1/admin/tenants", {
          credentials: "include",
          headers: { Accept: "application/json" },
        }),
      ]);
      const [statsData, tenantsData] = await Promise.all([
        statsRes.json().catch(() => null),
        tenantsRes.json().catch(() => null),
      ]);
      if (!statsRes.ok || !tenantsRes.ok) {
        const detail =
          (!statsRes.ok ? statsData?.detail : null) ||
          (!tenantsRes.ok ? tenantsData?.detail : null) ||
          "Il server non ha restituito tutti i dati amministrativi.";
        throw new Error(detail);
      }
      if (!statsData || !Array.isArray(tenantsData)) {
        throw new Error("La risposta del server non contiene dati amministrativi validi.");
      }
      setStats(statsData);
      setTenants(tenantsData);
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Errore durante il caricamento dei dati amministrativi.";
      setAdminLoadError(message);
      return false;
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
      void loadAdminData();
      void loadAuditEvents();
    }
    checkAdminAccess();
  }, [navigate]);

  const filteredTenants = tenants.filter((tenant) =>
    `${tenant.name} ${tenant.id}`.toLowerCase().includes(tenantSearch.trim().toLowerCase()),
  );

  const handleRefreshData = async () => {
    const toastId = toast.loading("Aggiornamento dei dati amministrativi...");
    const succeeded = await loadAdminData();
    toast.dismiss(toastId);
    if (succeeded) {
      toast.success("Dati amministrativi aggiornati.");
    } else {
      toast.error("Aggiornamento non riuscito. Controlla il messaggio nel pannello.");
    }
  };

  const handleLogout = async () => {
    const loggedOut = await logoutUser();
    if (!loggedOut) {
      toast.error(
        "Il server non ha confermato il logout. La sessione potrebbe essere ancora attiva.",
      );
      return;
    }
    toast.info("Sessione Super-Admin terminata");
    navigate({ to: "/" });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#090D16] text-white flex flex-col">
      {/* Top Admin Navigation */}
      <header className="sticky top-0 z-50 flex flex-col gap-3 border-b border-white/10 bg-[#0F172A]/80 px-3 py-3.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 grid place-items-center font-black text-slate-950 text-sm shadow-lg shadow-emerald-500/20">
            SA
          </div>
          <div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 break-words text-xs font-bold tracking-tight text-white sm:text-sm">
                Master Super-Admin Panel
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold uppercase">
                Zero-Trust Active
              </span>
            </div>
            <p className="max-w-full truncate text-[10px] text-white/50 sm:text-[11px]">
              {user.email} · Multi-tenant Global Oversight
            </p>
          </div>
        </div>

        <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:gap-3">
          <Link
            to="/dashboard"
            className="flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white sm:flex-none"
          >
            Dashboard SaaS <ExternalLink className="h-3 w-3" />
          </Link>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition"
            title="Esci dall'Area Riservata"
            aria-label="Esci dall'Area Riservata"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 space-y-8 p-4 sm:p-8">
        {adminLoadError && (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold">Dati amministrativi non aggiornati</p>
              <p className="mt-1 text-xs text-red-100/80">{adminLoadError}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadAdminData()}
              disabled={loading}
              className="shrink-0 rounded-lg border border-red-200/20 px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {loading ? "Riprovo..." : "Riprova"}
            </button>
          </div>
        )}

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
                        <span
                          className={
                            t.is_active === false
                              ? "ml-2 rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[10px] font-semibold text-red-300"
                              : "ml-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
                          }
                        >
                          {t.is_active === false ? "Sospesa" : "Attiva"}
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

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Registro amministrativo</h2>
              <p className="mt-1 text-xs text-white/50">
                Ultimi 50 eventi restituiti dal backend, incluse sospensioni e riattivazioni.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadAuditEvents()}
              disabled={auditLoading}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50"
            >
              {auditLoading ? "Aggiornamento..." : "Aggiorna registro"}
            </button>
          </div>
          {auditError && (
            <div
              role="alert"
              className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"
            >
              <p>{auditError}</p>
              <button
                type="button"
                onClick={() => void loadAuditEvents()}
                disabled={auditLoading}
                className="mt-2 underline disabled:opacity-50"
              >
                Riprova
              </button>
            </div>
          )}
          {auditLoading && auditEvents.length === 0 ? (
            <p className="text-sm text-white/60">Caricamento registro amministrativo...</p>
          ) : auditEvents.length === 0 ? (
            <p className="text-sm text-white/50">
              {auditError
                ? "Registro non disponibile."
                : "Nessun evento amministrativo registrato."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-white/55">
                  <tr>
                    <th className="p-3">Data</th>
                    <th className="p-3">Azione</th>
                    <th className="p-3">Destinazione</th>
                    <th className="p-3">Attore</th>
                    <th className="p-3">Metadati</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {auditEvents.map((event) => (
                    <tr key={event.id}>
                      <td className="whitespace-nowrap p-3 text-white/70">
                        {event.created_at
                          ? new Date(event.created_at).toLocaleString("it-IT")
                          : "Data non disponibile"}
                      </td>
                      <td className="p-3 font-medium text-white">{event.action}</td>
                      <td className="p-3 text-white/70">
                        <span>{event.target_type}</span>
                        <span className="block break-all font-mono text-[10px] text-white/45">
                          {event.target_id}
                        </span>
                      </td>
                      <td className="break-all p-3 font-mono text-[10px] text-white/60">
                        {event.actor_user_id}
                      </td>
                      <td className="p-3 text-white/60">
                        <pre className="max-w-sm whitespace-pre-wrap break-words font-mono text-[10px]">
                          {event.metadata ? JSON.stringify(event.metadata) : "—"}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

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
                      "Stato azienda",
                      selectedTenant.company.is_active === false ? "Sospesa" : "Attiva",
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

                <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#090D16] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Stato e accesso aziendale</h3>
                    <p className="mt-1 text-xs text-white/50">
                      La sospensione revoca le sessioni del tenant. L'operazione viene registrata
                      nel registro amministrativo.
                    </p>
                  </div>
                  {selectedTenant.company.is_active === false ? (
                    <button
                      type="button"
                      onClick={() => void changeTenantStatus(true)}
                      disabled={tenantActionLoading}
                      className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {tenantActionLoading ? "Aggiornamento..." : "Riattiva azienda"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void changeTenantStatus(false)}
                      disabled={tenantActionLoading}
                      className="rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-2 text-xs font-semibold text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {tenantActionLoading ? "Aggiornamento..." : "Sospendi azienda"}
                    </button>
                  )}
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
