import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { appendCsrfHeaders, fetchServerSession, type UserSession } from "@/lib/auth";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Configura la tua azienda · BaseGrid" },
      {
        name: "description",
        content: "Completa la configurazione iniziale dell'azienda.",
      },
    ],
  }),
  component: CompanyOnboarding,
});

type CompanySettings = {
  name: string;
  vat_number: string;
  address: string;
  contact_email: string;
  contact_phone: string;
  service_area: string;
  service_categories: string[];
  locale: string;
  time_zone: string;
  default_hourly_rate: number;
  report_footer_notes: string;
};

const SERVICE_CATEGORIES = [
  { value: "installazione", label: "Installazione impianti elettrici" },
  { value: "manutenzione", label: "Manutenzione" },
  { value: "pronto-intervento", label: "Pronto intervento" },
  { value: "verifiche-collaudi", label: "Verifiche e collaudi" },
  { value: "domotica-automazione", label: "Domotica e automazione" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "ricarica-veicoli-elettrici", label: "Ricarica veicoli elettrici" },
] as const;

export async function loadCompanySettings(fetcher: typeof fetch = fetch): Promise<CompanySettings> {
  const response = await fetcher("/api/v1/company/settings?include_logo=false", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Impossibile leggere le impostazioni aziendali.");
  }

  const data = await response.json();
  const rawHourlyRate = data.default_hourly_rate;
  let defaultHourlyRate = 0;

  if (
    rawHourlyRate !== null &&
    rawHourlyRate !== undefined &&
    !(typeof rawHourlyRate === "string" && rawHourlyRate.trim() === "")
  ) {
    if (typeof rawHourlyRate !== "number" && typeof rawHourlyRate !== "string") {
      throw new Error("La tariffa oraria predefinita ricevuta non è valida.");
    }

    defaultHourlyRate = Number(rawHourlyRate);
    if (!Number.isFinite(defaultHourlyRate) || defaultHourlyRate < 0 || defaultHourlyRate > 10000) {
      throw new Error("La tariffa oraria predefinita ricevuta non è valida.");
    }
  }

  if (
    !Array.isArray(data.service_categories) ||
    data.service_categories.some((item: unknown) => typeof item !== "string")
  ) {
    throw new Error("Le categorie di servizio ricevute non sono valide.");
  }

  return {
    name: String(data.name || ""),
    vat_number: String(data.vat_number || ""),
    address: String(data.address || ""),
    contact_email: String(data.contact_email || ""),
    contact_phone: String(data.contact_phone || ""),
    service_area: String(data.service_area || ""),
    service_categories: data.service_categories as string[],
    locale: String(data.locale || "it-IT"),
    time_zone: String(data.time_zone || "Europe/Rome"),
    default_hourly_rate: defaultHourlyRate,
    report_footer_notes: String(data.report_footer_notes || ""),
  };
}

function CompanyOnboarding() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CompanySettings>({
    name: "",
    vat_number: "",
    address: "",
    contact_email: "",
    contact_phone: "",
    service_area: "",
    service_categories: [],
    locale: "it-IT",
    time_zone: "Europe/Rome",
    default_hourly_rate: 0,
    report_footer_notes: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const session = await fetchServerSession();
        if (cancelled) return;
        if (!session) {
          navigate({ to: "/" });
          return;
        }
        if (session.platformRole === "ceo") {
          navigate({ to: "/admin/super-dashboard" });
          return;
        }
        setUser(session);
        if (session.role !== "owner") return;

        try {
          const current = await loadCompanySettings();
          if (cancelled) return;

          setLoadError(null);
          setForm(current);
          const profileComplete = Boolean(
            current.name.trim() &&
              current.address.trim() &&
              current.contact_email.trim() &&
              current.contact_phone.trim() &&
              current.service_area.trim() &&
              current.service_categories.length > 0 &&
              current.locale === "it-IT" &&
              (current.time_zone === "Europe/Rome" || current.time_zone === "UTC"),
          );
          if (profileComplete) {
            navigate({ to: "/dashboard" });
            return;
          }
          if (current.name.trim() && current.address.trim()) {
            setStep(1);
          }
        } catch (error) {
          if (!cancelled) {
            setLoadError(
              error instanceof Error ? error.message : "Errore nel caricamento delle impostazioni.",
            );
          }
        }
      } catch {
        if (!cancelled) {
          setLoadError("Impossibile verificare la sessione. Controlla la connessione e riprova.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [navigate, loadAttempt]);

  const updateField = (field: keyof CompanySettings, value: string | number | string[]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user?.role !== "owner") return;

    const name = form.name.trim();
    const address = form.address.trim();
    if (step === 0) {
      if (name.length < 2 || name.length > 100) {
        toast.error("Inserisci una ragione sociale o un nome aziendale di 2–100 caratteri.");
        return;
      }
      if (!address || address.length > 255) {
        toast.error("Inserisci l'indirizzo della sede principale (massimo 255 caratteri).");
        return;
      }

      // Persist the identity step before advancing so a refresh or re-login does not lose progress.
      setSaving(true);
      try {
        const response = await fetch("/api/v1/company/settings", {
          method: "PUT",
          credentials: "include",
          headers: appendCsrfHeaders({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
          body: JSON.stringify({ name, address }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.detail || "Impossibile salvare l'identità aziendale.");
        }
        setStep(1);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Errore di rete durante il salvataggio dell'identità aziendale.",
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (name.length < 2 || name.length > 100) {
      toast.error("Inserisci una ragione sociale o un nome aziendale di 2–100 caratteri.");
      return;
    }
    if (!address || address.length > 255) {
      toast.error("Inserisci l'indirizzo della sede principale (massimo 255 caratteri).");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim())) {
      toast.error("Inserisci un indirizzo email aziendale valido.");
      return;
    }
    if (!/^[+0-9().\s/-]{7,40}$/.test(form.contact_phone.trim())) {
      toast.error("Inserisci un numero di telefono valido.");
      return;
    }
    if (form.service_area.trim().length < 2 || form.service_area.trim().length > 255) {
      toast.error("Indica un'area di servizio di 2–255 caratteri.");
      return;
    }
    if (
      form.service_categories.length < 1 ||
      form.service_categories.some(
        (category) => !SERVICE_CATEGORIES.some((option) => option.value === category),
      )
    ) {
      toast.error("Seleziona almeno una categoria di servizio.");
      return;
    }
    if (
      form.locale !== "it-IT" ||
      (form.time_zone !== "Europe/Rome" && form.time_zone !== "UTC")
    ) {
      toast.error("Lingua o fuso orario non supportati.");
      return;
    }
    if (
      !Number.isFinite(form.default_hourly_rate) ||
      form.default_hourly_rate < 0 ||
      form.default_hourly_rate > 10000
    ) {
      toast.error("La tariffa oraria deve essere compresa tra 0 e 10.000.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/v1/company/settings", {
        method: "PUT",
        credentials: "include",
        headers: appendCsrfHeaders({
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify({
          name,
          address,
          vat_number: form.vat_number.trim(),
          contact_email: form.contact_email.trim(),
          contact_phone: form.contact_phone.trim(),
          service_area: form.service_area.trim(),
          service_categories: form.service_categories,
          locale: form.locale,
          time_zone: form.time_zone,
          default_hourly_rate: form.default_hourly_rate,
          report_footer_notes: form.report_footer_notes.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.detail || "Salvataggio non riuscito.");
      }
      toast.success("Configurazione aziendale salvata.");
      try {
        sessionStorage.setItem("basegrid:launch-tour", user.id);
      } catch {
        // The tour remains available from the dashboard header if storage is disabled.
      }
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Errore di rete durante il salvataggio.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin" aria-label="Caricamento" />
      </div>
    );
  }

  if (loadError && (user?.role === "owner" || user === null)) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-950 px-4 py-10 text-white">
        <section
          className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8"
          role="alert"
          aria-live="polite"
        >
          <Building2 className="mb-4 h-8 w-8 text-amber-300" />
          <h1 className="text-2xl font-semibold">
            {user ? "Impossibile caricare la configurazione" : "Impossibile verificare la sessione"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/70">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              setLoading(true);
              setLoadAttempt((attempt) => attempt + 1);
            }}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            Riprova
          </button>
        </section>
      </main>
    );
  }

  if (user && user.role !== "owner") {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-950 px-4 text-white">
        <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8">
          <ShieldCheck className="mb-4 h-8 w-8 text-amber-300" />
          <h1 className="text-2xl font-semibold">Configurazione aziendale in attesa</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Il titolare dell’azienda deve completare la configurazione iniziale prima che il team
            possa utilizzare BaseGrid. Avvisalo di accedere con il proprio account.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <section className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Primo accesso</p>
            <h1 className="mt-1 text-3xl font-semibold">Configura la tua azienda</h1>
          </div>
        </div>
        <p className="mb-8 text-sm leading-6 text-white/70">
          Queste informazioni vengono salvate nell'azienda associata al tuo account. Puoi tornare a
          questa pagina finché la configurazione non è completa.
        </p>
        <form
          onSubmit={submit}
          className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-8"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                  Passaggio {step + 1} di 2
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {step === 0 ? "Identità aziendale" : "Profilo operativo e rapportini"}
                </h2>
              </div>
              <span className="shrink-0 text-xs text-white/50">{step === 0 ? "1/2" : "2/2"}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-300 transition-all duration-300"
                style={{ width: step === 0 ? "50%" : "100%" }}
              />
            </div>
          </div>

          <div className={step === 0 ? "space-y-5" : "hidden"}>
            <div>
              <label htmlFor="company-name" className="mb-2 block text-sm font-medium">
                Nome azienda / ragione sociale *
              </label>
              <input
                id="company-name"
                required
                minLength={2}
                maxLength={100}
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
                autoComplete="organization"
              />
            </div>
            <div>
              <label htmlFor="company-address" className="mb-2 block text-sm font-medium">
                Indirizzo della sede principale *
              </label>
              <input
                id="company-address"
                required
                maxLength={255}
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
                autoComplete="street-address"
              />
            </div>
            <div>
              <label htmlFor="company-vat" className="mb-2 block text-sm font-medium">
                Partita IVA (facoltativa)
              </label>
              <input
                id="company-vat"
                maxLength={50}
                value={form.vat_number}
                onChange={(e) => updateField("vat_number", e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-white/50">
                Non attiva integrazioni fiscali o contabili.
              </p>
            </div>
          </div>

          <div className={step === 1 ? "space-y-5" : "hidden"}>
            <div>
              <label htmlFor="contact-email" className="mb-2 block text-sm font-medium">
                Email aziendale *
              </label>
              <input
                id="contact-email"
                type="email"
                required
                maxLength={255}
                autoComplete="email"
                value={form.contact_email}
                onChange={(e) => updateField("contact_email", e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label htmlFor="contact-phone" className="mb-2 block text-sm font-medium">
                Telefono aziendale *
              </label>
              <input
                id="contact-phone"
                type="tel"
                required
                minLength={7}
                maxLength={40}
                autoComplete="tel"
                value={form.contact_phone}
                onChange={(e) => updateField("contact_phone", e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label htmlFor="service-area" className="mb-2 block text-sm font-medium">
                Area geografica servita *
              </label>
              <input
                id="service-area"
                required
                minLength={2}
                maxLength={255}
                placeholder="Es. Roma e provincia"
                value={form.service_area}
                onChange={(e) => updateField("service_area", e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
              />
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Servizi offerti * (seleziona almeno uno)</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {SERVICE_CATEGORIES.map((category) => (
                  <label key={category.value} className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.service_categories.includes(category.value)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...form.service_categories, category.value]
                          : form.service_categories.filter((item) => item !== category.value);
                        updateField("service_categories", next);
                      }}
                      className="mt-0.5 accent-emerald-400"
                    />
                    <span>{category.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="company-locale" className="mb-2 block text-sm font-medium">
                  Lingua dell'azienda
                </label>
                <select
                  id="company-locale"
                  value={form.locale}
                  onChange={(e) => updateField("locale", e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
                >
                  <option value="it-IT">Italiano (it-IT)</option>
                </select>
              </div>
              <div>
                <label htmlFor="company-time-zone" className="mb-2 block text-sm font-medium">
                  Fuso orario
                </label>
                <select
                  id="company-time-zone"
                  value={form.time_zone}
                  onChange={(e) => updateField("time_zone", e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
                >
                  <option value="Europe/Rome">Italia — Europe/Rome</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="hourly-rate" className="mb-2 block text-sm font-medium">
                Tariffa oraria predefinita (€)
              </label>
              <input
                id="hourly-rate"
                type="number"
                min="0"
                max="10000"
                step="0.5"
                value={form.default_hourly_rate}
                onChange={(e) => updateField("default_hourly_rate", Number(e.target.value))}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label htmlFor="report-footer" className="mb-2 block text-sm font-medium">
                Note predefinite per i rapportini (facoltative)
              </label>
              <textarea
                id="report-footer"
                maxLength={1000}
                rows={3}
                value={form.report_footer_notes}
                onChange={(e) => updateField("report_footer_notes", e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          {step === 1 && (
            <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">Riepilogo aziendale</h3>
                  <p className="mt-1 break-words text-sm text-white/70">{form.name.trim()}</p>
                  <p className="mt-1 break-words text-xs text-white/50">{form.address.trim()}</p>
                  <p className="mt-1 break-words text-xs text-white/50">{form.contact_email.trim()}</p>
                  <p className="mt-1 break-words text-xs text-white/50">{form.service_area.trim()}</p>
                  <p className="mt-3 text-xs leading-5 text-white/50">
                    Dopo il salvataggio si apre BaseGrid e parte la guida rapida, che puoi saltare o
                    riaprire in seguito.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            {step === 1 && (
              <button
                type="button"
                onClick={() => setStep(0)}
                disabled={saving}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 font-medium text-white/80 transition hover:bg-white/5 disabled:opacity-60"
              >
                <ArrowLeft className="h-4 w-4" />
                Indietro
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto sm:w-auto"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : step === 0 ? (
                <ArrowRight className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Salvataggio..." : step === 0 ? "Continua" : "Salva e apri BaseGrid"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
