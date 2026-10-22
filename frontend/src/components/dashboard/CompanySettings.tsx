import { appendCsrfHeaders } from "../../lib/auth";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Building2,
  MapPin,
  Briefcase,
  FileText,
  Save,
  ExternalLink,
  Sliders,
  Bell,
  CreditCard,
  CheckCircle,
  Globe,
  Sun,
  Layout,
  Receipt,
  Clock,
  ShieldCheck,
} from "lucide-react";

interface CompanyData {
  name: string;
  vat_number: string;
  address: string;
  default_hourly_rate: number;
  report_footer_notes: string;
  stripe_subscription_status: string;
}

export function CompanySettings() {
  const [activeTab, setActiveTab] = useState<
    "azienda" | "preferenze" | "notifiche" | "fatturazione"
  >("azienda");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Form states
  const [formData, setFormData] = useState<CompanyData>({
    name: "",
    vat_number: "",
    address: "",
    default_hourly_rate: 0,
    report_footer_notes: "",
    stripe_subscription_status: "Attivo",
  });

  const [preferences, setPreferences] = useState({
    theme: "dark",
    language: "it",
    defaultView: "dashboard",
  });

  const [notifications, setNotifications] = useState({
    emailNewReport: true,
    emailClientApproved: true,
    emailMonthlySummary: true,
    systemAlerts: true,
  });

  useEffect(() => {
    const fetchCompanyData = async () => {
      try {
        const res = await fetch("/api/v1/company/settings", {
          credentials: "include",
          headers: {},
        });
        if (res.ok) {
          const data = await res.json();
          setFormData({
            name: data.name || "",
            vat_number: data.vat_number || "",
            address: data.address || "",
            default_hourly_rate: data.default_hourly_rate || 0,
            report_footer_notes: data.report_footer_notes || "",
            stripe_subscription_status:
              data.stripe_subscription_status || "Attivo (Piano Team Pro)",
          });
        }
      } catch {
        toast.error("Errore nel caricamento dei dati aziendali.");
      } finally {
        setFetching(false);
      }
    };
    fetchCompanyData();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const value = e.target.type === "number" ? parseFloat(e.target.value) : e.target.value;
    setFormData((prev) => ({ ...prev, [e.target.name]: value }));
  };

  const handlePrefChange = (key: string, val: string) => {
    setPreferences((prev) => ({ ...prev, [key]: val }));
    toast.success("Preferenza aggiornata");
  };

  const handleNotifToggle = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
    toast.success("Impostazione notifiche salvata");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/company/settings", {
        credentials: "include",
        method: "PUT",
        headers: appendCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: formData.name,
          vat_number: formData.vat_number,
          address: formData.address,
          default_hourly_rate: formData.default_hourly_rate,
          report_footer_notes: formData.report_footer_notes,
        }),
      });

      if (!res.ok) {
        throw new Error("Errore salvataggio dati aziendali");
      }
      toast.success("Impostazioni aziendali salvate");
    } catch (err) {
      const error = err as Error;
      toast.error(error.message || "Errore salvataggio");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="p-8 text-center text-white/50">Caricamento impostazioni...</div>;
  }

  return (
    <div className="max-w-4xl w-full mx-auto space-y-6 text-white">
      {/* Header & Sub-Nav Hub */}
      <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-semibold flex items-center gap-2 text-white">
              <Building2 className="h-6 w-6 text-primary" /> Impostazioni SaaS & Azienda
            </h2>
            <p className="text-white/60 text-sm mt-1">
              Configura i dati fiscali aziendali, le preferenze dell'applicazione e la fatturazione
              Stripe.
            </p>
          </div>
          <div className="bg-slate-950/50 border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] text-white/50 uppercase tracking-wider font-semibold">
                Piano Attivo
              </span>
              <span className="text-sm font-medium text-emerald-400 flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5" />{" "}
                {formData.stripe_subscription_status || "Team Pro"}
              </span>
            </div>
          </div>
        </div>

        {/* Sub-Tabs Nav */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-white/10 pb-1 hide-scrollbar">
          {[
            { id: "azienda", label: "Dati Aziendali", icon: Building2 },
            { id: "preferenze", label: "Preferenze App", icon: Sliders },
            { id: "notifiche", label: "Notifiche & Avvisi", icon: Bell },
            { id: "fatturazione", label: "Fatturazione & Stripe", icon: CreditCard },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  isActive
                    ? "bg-primary text-white shadow-lg btn-glow"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Dati Aziendali */}
      {activeTab === "azienda" && (
        <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 pb-2 border-b border-white/10 flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" /> Anagrafica Fiscale
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">
                    Ragione Sociale
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">
                    Partita IVA / Cod. Fiscale
                  </label>
                  <input
                    type="text"
                    name="vat_number"
                    value={formData.vat_number}
                    onChange={handleChange}
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-1.5">
                    Sede Operativa (Indirizzo Completo)
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 pb-2 border-b border-white/10 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Impostazioni Calcolo & PDF
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">
                    Tariffa Oraria Predefinita (€/h)
                  </label>
                  <input
                    type="number"
                    name="default_hourly_rate"
                    value={formData.default_hourly_rate}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-1.5">
                    Note a Piè di Pagina (Termini e Condizioni sui PDF)
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 h-4 w-4 text-white/40" />
                    <textarea
                      name="report_footer_notes"
                      value={formData.report_footer_notes}
                      onChange={handleChange}
                      rows={4}
                      className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all resize-none"
                      placeholder="Esempio: Lavori eseguiti a regola d'arte. Pagamento a 30 giorni data fattura..."
                    ></textarea>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-white/10 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="h-11 px-8 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 btn-glow"
              >
                {loading ? (
                  "Salvataggio..."
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Salva Dati Aziendali
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Preferenze App */}
      {activeTab === "preferenze" && (
        <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] space-y-6">
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 pb-2 border-b border-white/10 flex items-center gap-2">
              <Sliders className="h-4 w-4 text-primary" /> Personalizzazione Interfaccia
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/40 border border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  <Sun className="h-5 w-5 text-amber-400" />
                  <div>
                    <div className="text-sm font-medium text-white">Tema Grafico</div>
                    <div className="text-xs text-white/50">
                      Scegli la modalità visiva dell'applicazione
                    </div>
                  </div>
                </div>
                <select
                  value={preferences.theme}
                  onChange={(e) => handlePrefChange("theme", e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-sm text-white outline-none"
                >
                  <option value="dark">Scuro Pro (Dark Midnight)</option>
                  <option value="light">Chiaro (Aziendale)</option>
                </select>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/40 border border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  <Globe className="h-5 w-5 text-blue-400" />
                  <div>
                    <div className="text-sm font-medium text-white">Lingua di Sistema</div>
                    <div className="text-xs text-white/50">
                      Lingua per l'interfaccia e i PDF generati
                    </div>
                  </div>
                </div>
                <select
                  value={preferences.language}
                  onChange={(e) => handlePrefChange("language", e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-sm text-white outline-none"
                >
                  <option value="it">Italiano (Predefinito)</option>
                  <option value="en">English (UK)</option>
                  <option value="de">Deutsch</option>
                </select>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/40 border border-white/10 md:col-span-2">
                <div className="flex items-center gap-3 mb-3">
                  <Layout className="h-5 w-5 text-emerald-400" />
                  <div>
                    <div className="text-sm font-medium text-white">
                      Vista Principale all'Accesso
                    </div>
                    <div className="text-xs text-white/50">
                      Seleziona quale schermata caricare subito dopo il login
                    </div>
                  </div>
                </div>
                <select
                  value={preferences.defaultView}
                  onChange={(e) => handlePrefChange("defaultView", e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-sm text-white outline-none"
                >
                  <option value="dashboard">Panoramica Dashboard & KPI</option>
                  <option value="reports">Elenco Rapportini</option>
                  <option value="wizard">Creazione Rapida Rapportino (Modalità Cantiere)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Notifiche & Avvisi */}
      {activeTab === "notifiche" && (
        <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] space-y-6">
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 pb-2 border-b border-white/10 flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" /> Canali di Notifica Aziendali
            </h3>

            <div className="space-y-3">
              {[
                {
                  key: "emailNewReport" as const,
                  title: "Email per Nuovi Rapportini Inviati",
                  desc: "Invia un'email all'amministrazione ogni volta che un tecnico invia un rapportino",
                },
                {
                  key: "emailClientApproved" as const,
                  title: "Notifica Firma Cliente",
                  desc: "Ricevi una conferma istantanea quando il cliente appone la firma digitale sul cantiere",
                },
                {
                  key: "emailMonthlySummary" as const,
                  title: "Riepilogo Mensile Ore & Materiali",
                  desc: "Invia report analitico automatico con la rendicontazione mensile dei cantieri",
                },
                {
                  key: "systemAlerts" as const,
                  title: "Avvisi di Sicurezza e Piattaforma",
                  desc: "Notifiche su scadenze abbonamento, aggiornamenti o accessi non riconosciuti",
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center justify-between p-4 rounded-xl bg-slate-950/40 border border-white/5 cursor-pointer hover:border-white/10 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{item.title}</div>
                    <div className="text-xs text-white/50 mt-0.5">{item.desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications[item.key]}
                    onChange={() => handleNotifToggle(item.key)}
                    className="h-4 w-4 rounded border-white/20 bg-slate-900 text-primary focus:ring-primary"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Fatturazione & Stripe */}
      {activeTab === "fatturazione" && (
        <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-6 rounded-2xl bg-gradient-to-r from-primary/20 via-blue-900/20 to-slate-950 border border-primary/30 gap-6">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-primary/20 text-primary border border-primary/30 mb-2">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Abbonamento SaaS Attivo
              </div>
              <h3 className="text-2xl font-bold text-white">Piano Team Pro</h3>
              <p className="text-white/70 text-sm mt-1 max-w-xl">
                Include rapportini illimitati, firme digitali touch su cantiere, export PDF con logo
                personalizzato e supporto multi-tecnico.
              </p>
              <div className="flex items-center gap-4 mt-4 text-xs text-white/60">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-emerald-400" /> Prossimo rinnovo: 27/08/2026
                </span>
                <span>•</span>
                <span>39,00 € / mese</span>
              </div>
            </div>

            <button
              onClick={() => window.open("/billing", "_self")}
              className="h-11 px-6 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-all active:scale-95 btn-glow flex items-center gap-2 shrink-0"
            >
              <CreditCard className="h-4 w-4" /> Gestisci Abbonamento Stripe{" "}
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>

          {/* Storico Fatture Recent */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" /> Ultime Fatture Emesse
            </h3>
            <div className="bg-slate-950/50 rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-white/60 text-xs">
                  <tr>
                    <th className="p-3">Data</th>
                    <th className="p-3">Descrizione</th>
                    <th className="p-3">Importo</th>
                    <th className="p-3 text-right">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  <tr>
                    <td className="p-3 font-mono text-xs text-white/60">27/07/2026</td>
                    <td className="p-3 font-medium">BaseGrid - Piano Team Pro (Mensile)</td>
                    <td className="p-3">39,00 €</td>
                    <td className="p-3 text-right">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Pagato
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-xs text-white/60">27/06/2026</td>
                    <td className="p-3 font-medium">BaseGrid - Piano Team Pro (Mensile)</td>
                    <td className="p-3">39,00 €</td>
                    <td className="p-3 text-right">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Pagato
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
