import { appendCsrfHeaders } from "../../lib/auth";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Building2,
  MapPin,
  Briefcase,
  FileText,
  Save,
  Sliders,
  Bell,
  CreditCard,
  Globe,
  Sun,
  Layout,
  ImagePlus,
  Trash2,
} from "lucide-react";

interface CompanyData {
  name: string;
  vat_number: string;
  address: string;
  default_hourly_rate: number;
  report_footer_notes: string;
  logo_data_url: string | null;
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
    logo_data_url: null,
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
            logo_data_url: data.logo_data_url || null,
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

  const handleLogoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      toast.error("Carica il logo in formato PNG o JPEG.");
      event.target.value = "";
      return;
    }
    if (file.size > 256 * 1024) {
      toast.error("Il logo deve pesare al massimo 256 KB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        toast.error("Impossibile leggere il file del logo.");
        return;
      }
      setFormData((current) => ({ ...current, logo_data_url: reader.result as string }));
    };
    reader.onerror = () => toast.error("Impossibile leggere il file del logo.");
    reader.readAsDataURL(file);
  };

  const handlePrefChange = (key: string, val: string) => {
    setPreferences((prev) => ({ ...prev, [key]: val }));
    toast.info("Modifica temporanea: questa preferenza non viene salvata sul server.");
  };

  const handleNotifToggle = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
    toast.info("Modifica temporanea: questa impostazione non viene salvata sul server.");
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
          logo_data_url: formData.logo_data_url,
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
              <span className="text-sm font-medium text-amber-300">Fatturazione non configurata</span>
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
            <div className="space-y-4 rounded-xl border border-white/10 bg-slate-950/30 p-4 sm:p-5">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Logo aziendale nei rapportini PDF
                </h3>
                <p className="mt-1 text-xs leading-5 text-white/55">
                  {
                    "Facoltativo. Il logo viene salvato nell’azienda e inserito nei PDF solo se presente. PNG o JPEG, massimo 256 KB e 2048 × 2048 pixel."
                  }
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white p-2">
                  {formData.logo_data_url ? (
                    <img
                      src={formData.logo_data_url}
                      alt="Anteprima logo aziendale"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Building2 className="h-8 w-8 text-slate-400" aria-hidden="true" />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition hover:bg-primary/90">
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    Carica logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleLogoFileChange}
                      className="sr-only"
                    />
                  </label>
                  {formData.logo_data_url && (
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((current) => ({ ...current, logo_data_url: null }))
                      }
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Rimuovi logo
                    </button>
                  )}
                </div>
              </div>
            </div>
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
        <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-5">
            <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h3 className="font-semibold text-white">Fatturazione non disponibile</h3>
              <p className="mt-1 text-sm text-white/70">
                L'integrazione con Stripe non è ancora configurata. Non ci sono abbonamenti,
                rinnovi o fatture consultabili da questa schermata e nessun pagamento viene
                avviato da qui.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
