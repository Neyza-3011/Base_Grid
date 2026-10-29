import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Building2, Loader2, Save, ShieldCheck } from "lucide-react";
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
  default_hourly_rate: number;
  report_footer_notes: string;
};

function CompanyOnboarding() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CompanySettings>({
    name: "",
    vat_number: "",
    address: "",
    default_hourly_rate: 0,
    report_footer_notes: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const session = await fetchServerSession();
      if (!session) {
        navigate({ to: "/" });
        return;
      }
      if (session.platformRole === "ceo") {
        navigate({ to: "/admin/super-dashboard" });
        return;
      }
      if (!cancelled) setUser(session);
      if (session.role !== "owner") {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/v1/company/settings", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error("Impossibile leggere le impostazioni aziendali.");
        }
        const data = await response.json();
        if (cancelled) return;

        const current = {
          name: String(data.name || ""),
          vat_number: String(data.vat_number || ""),
          address: String(data.address || ""),
          default_hourly_rate: Number(data.default_hourly_rate) || 0,
          report_footer_notes: String(data.report_footer_notes || ""),
        };
        setForm(current);
        if (current.name.trim() && current.address.trim()) {
          navigate({ to: "/dashboard" });
          return;
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Errore nel caricamento.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const updateField = (field: keyof CompanySettings, value: string | number) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user?.role !== "owner") return;

    const name = form.name.trim();
    const address = form.address.trim();
    if (name.length < 2 || name.length > 100) {
      toast.error(
        "Inserisci una ragione sociale o un nome aziendale di 2–100 caratteri.",
      );
      return;
    }
    if (!address || address.length > 255) {
      toast.error(
        "Inserisci l'indirizzo della sede principale (massimo 255 caratteri).",
      );
      return;
    }
    if (
      !Number.isFinite(form.default_hourly_rate) ||
      form.default_hourly_rate < 0 ||
      form.default_hourly_rate > 10000
    ) {
      toast.error(
        "La tariffa oraria deve essere compresa tra 0 e 10.000.",
      );
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
          default_hourly_rate: form.default_hourly_rate,
          report_footer_notes: form.report_footer_notes.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.detail || "Salvataggio non riuscito.");
      }
      toast.success("Configurazione aziendale salvata.");
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Errore di rete durante il salvataggio.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-white">
        <Loader2
          className="h-8 w-8 animate-spin"
          aria-label="Caricamento"
        />
      </div>
    );
  }

  if (user && user.role !== "owner") {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-950 px-4 text-white">
        <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8">
          <ShieldCheck className="mb-4 h-8 w-8 text-amber-300" />
          <h1 className="text-2xl font-semibold">
            Configurazione aziendale in attesa
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Il titolare dell'azienda deve completare la configurazione iniziale
            prima che il team possa utilizzare BaseGrid. Avvisalo di accedere
            con il proprio account.
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
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
              Primo accesso
            </p>
            <h1 className="mt-1 text-3xl font-semibold">
              Configura la tua azienda
            </h1>
          </div>
        </div>
        <p className="mb-8 text-sm leading-6 text-white/70">
          Queste informazioni vengono salvate nell'azienda associata al tuo
          account. Puoi tornare a questa pagina finché la configurazione non è
          completa.
        </p>
        <form
          onSubmit={submit}
          className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-8"
        >
          <div>
            <label
              htmlFor="company-name"
              className="mb-2 block text-sm font-medium"
            >
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
            <label
              htmlFor="company-address"
              className="mb-2 block text-sm font-medium"
            >
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
            <label
              htmlFor="company-vat"
              className="mb-2 block text-sm font-medium"
            >
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
          <div>
            <label
              htmlFor="hourly-rate"
              className="mb-2 block text-sm font-medium"
            >
              Tariffa oraria predefinita (€)
            </label>
            <input
              id="hourly-rate"
              type="number"
              min="0"
              max="10000"
              step="0.5"
              value={form.default_hourly_rate}
              onChange={(e) =>
                updateField("default_hourly_rate", Number(e.target.value))
              }
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
            />
          </div>
          <div>
            <label
              htmlFor="report-footer"
              className="mb-2 block text-sm font-medium"
            >
              Note predefinite per i rapportini (facoltative)
            </label>
            <textarea
              id="report-footer"
              maxLength={1000}
              rows={3}
              value={form.report_footer_notes}
              onChange={(e) =>
                updateField("report_footer_notes", e.target.value)
              }
              className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Salvataggio..." : "Salva e apri BaseGrid"}
          </button>
        </form>
      </section>
    </main>
  );
}
