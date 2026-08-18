import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  ChevronDown,
  Plus,
  ShieldCheck,
  Menu,
  User as UserIcon,
  Settings,
  AlertCircle,
  Mail,
} from "lucide-react";
import { fetchServerSession, logoutUser, resendVerificationEmail, UserSession } from "@/lib/auth";
import { toast } from "sonner";
import { ProfileSettings } from "@/components/dashboard/ProfileSettings";
import { CompanySettings } from "@/components/dashboard/CompanySettings";
import { ReportsView } from "@/components/dashboard/ReportsView";
import { DashboardAnalyticsView } from "@/components/dashboard/DashboardAnalyticsView";
import { PdfPreviewModal } from "@/components/dashboard/PdfPreviewModal";
import { BaseGridLogo } from "@/components/common/BaseGridLogo";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · BaseGrid" },
      { name: "description", content: "Gestisci rapportini, cantieri e clienti dal tuo studio." },
    ],
  }),
  component: Dashboard,
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

const REPORTS: Report[] = [
  {
    id: "R-2041",
    date: "27/07/2026",
    tech: "Jacopo A.",
    client: "Rossi Srl",
    site: "Via Milano 12",
    hours: 4.5,
    status: "Approvato",
  },
  {
    id: "R-2040",
    date: "27/07/2026",
    tech: "Luca V.",
    client: "Impianti Verdi",
    site: "Cantiere B4",
    hours: 6.0,
    status: "Inviato",
  },
  {
    id: "R-2039",
    date: "26/07/2026",
    tech: "Giulia P.",
    client: "Casa Bianchi",
    site: "Via Roma 8",
    hours: 2.5,
    status: "Bozza",
  },
  {
    id: "R-2038",
    date: "26/07/2026",
    tech: "Jacopo A.",
    client: "Termo SpA",
    site: "Sede centrale",
    hours: 8.0,
    status: "Approvato",
  },
  {
    id: "R-2037",
    date: "25/07/2026",
    tech: "Andrea M.",
    client: "Elettro Rossi",
    site: "Uffici piano 3",
    hours: 3.5,
    status: "Approvato",
  },
  {
    id: "R-2036",
    date: "25/07/2026",
    tech: "Luca V.",
    client: "Cantiere+",
    site: "Lotto A",
    hours: 5.5,
    status: "Inviato",
  },
  {
    id: "R-2035",
    date: "24/07/2026",
    tech: "Giulia P.",
    client: "Idro Bianchi",
    site: "Villa Sole",
    hours: 4.0,
    status: "Bozza",
  },
];

const statusStyle: Record<Report["status"], string> = {
  Approvato: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  Inviato: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  Bozza: "bg-slate-200 text-slate-700 border-slate-300",
};

function Dashboard() {
  const [activeView, setActiveView] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("Tutti");
  const [pdfOpen, setPdfOpen] = useState<Report | null>(null);
  const [previewPdfId, setPreviewPdfId] = useState<string | null>(null);
  const [currentUser, setUser] = useState<UserSession | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rapportiniExpanded, setRapportiniExpanded] = useState(true);
  const [resendingVerification, setResendingVerification] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function initSession() {
      const sessionUser = await fetchServerSession();
      if (sessionUser) {
        setUser(sessionUser);
      } else {
        toast.error("Sessione non valida o scaduta. Effettua l'accesso.");
        navigate({ to: "/" });
      }
      setLoadingUser(false);
    }
    initSession();
  }, [navigate]);

  const handleLogout = async () => {
    await logoutUser();
    toast.info("Sessione terminata. Arrivederci!");
    navigate({ to: "/" });
  };

  const handleResendEmail = async () => {
    if (!currentUser?.email) return;
    setResendingVerification(true);
    try {
      const res = await resendVerificationEmail(currentUser.email);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.error || "Impossibile inviare l'email di verifica.");
      }
    } finally {
      setResendingVerification(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#090D16] flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  const filtered = REPORTS.filter(
    (r) =>
      (activeFilter === "Tutti" || r.status === activeFilter) &&
      (r.client.toLowerCase().includes(query.toLowerCase()) ||
        r.tech.toLowerCase().includes(query.toLowerCase()) ||
        r.site.toLowerCase().includes(query.toLowerCase())),
  );

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const NavContent = () => (
    <>
      <div className="h-16 flex items-center gap-2 px-5 border-b border-white/5 shrink-0">
        <BaseGridLogo textClassName="text-sm font-semibold text-white tracking-tight" />
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden ml-auto text-white/70 hover:text-white p-1"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-3">
        <div className="w-full rounded-lg px-3 py-2.5 bg-white/5 border border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
              {getInitials(currentUser.fullName)}
            </span>
            <div className="text-left min-w-0 flex-1">
              <div className="text-xs font-medium text-white truncate flex items-center gap-1">
                {currentUser.fullName}
                {(currentUser.role === "superadmin" || currentUser.role === "admin") && (
                  <ShieldCheck className="h-3 w-3 text-emerald-400 shrink-0" />
                )}
              </div>
              <div className="text-[10px] text-white/60 truncate">{currentUser.email}</div>
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1 text-sm overflow-y-auto">
        {/* SEZIONE 1: DASHBOARD */}
        <button
          onClick={() => {
            setActiveView("dashboard");
            setSidebarOpen(false);
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all ${
            activeView === "dashboard"
              ? "bg-primary text-white shadow-lg shadow-primary/25 font-semibold"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span>Dashboard</span>
        </button>

        {/* SEZIONE 2: RAPPORTINI (Diretta senza sottocategorie) */}
        <button
          onClick={() => {
            setActiveView("reports");
            setSidebarOpen(false);
          }}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all ${
            activeView === "reports"
              ? "bg-primary text-white shadow-lg shadow-primary/25 font-semibold"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <FileText className="h-4 w-4" />
            <span>Rapportini</span>
          </div>
        </button>

        {/* SEZIONI RIMANENTI */}
        <button
          onClick={() => {
            setSidebarOpen(false);
            toast.info("Sezione Clienti in fase di sviluppo.");
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Users className="h-4 w-4" />
          <span>Clienti</span>
        </button>

        <button
          onClick={() => {
            setSidebarOpen(false);
            toast.info("Sezione Cantieri in fase di sviluppo.");
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors"
        >
          <HardHat className="h-4 w-4" />
          <span>Cantieri</span>
        </button>

        <button
          onClick={() => {
            setSidebarOpen(false);
            toast.info("Sezione Materiali in fase di sviluppo.");
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Package className="h-4 w-4" />
          <span>Materiali</span>
        </button>

        {(currentUser.role === "admin" || currentUser.role === "superadmin") && (
          <button
            onClick={() => {
              setActiveView("company_settings");
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all ${
              activeView === "company_settings"
                ? "bg-white/10 text-white font-semibold"
                : "text-white/70 hover:text-white hover:bg-white/5"
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>Impostazioni Aziendali</span>
          </button>
        )}

        <Link
          to="/billing"
          onClick={() => setSidebarOpen(false)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Receipt className="h-4 w-4" />
          <span>Fatturazione & Abbonamento</span>
        </Link>

        {(currentUser.role === "superadmin" || currentUser.role === "admin") && (
          <div className="pt-3 mt-3 border-t border-white/10 space-y-1">
            <div className="px-3 text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
              Super-Admin Area
            </div>
            <Link
              to="/admin/super-dashboard"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-emerald-300 hover:bg-emerald-500/10 transition"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> Control Panel
            </Link>
            <Link
              to="/admin/sandbox"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-indigo-300 hover:bg-indigo-500/10 transition"
            >
              <BaseGridLogo className="h-3.5 w-3.5" iconOnly /> Cloned Sandbox
            </Link>
          </div>
        )}
      </nav>
      <div className="p-3 border-t border-white/5 shrink-0">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 text-xs text-white/60 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition"
        >
          <LogOut className="h-3.5 w-3.5" /> Esci
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[#090D16] transition-transform duration-300 ease-in-out lg:w-64 lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <NavContent />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="h-16 border-b border-slate-200 bg-white flex items-center px-4 sm:px-8 gap-3 sticky top-0 z-30 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100 shrink-0"
          >
            <Menu className="h-5 w-5 text-slate-700" />
          </button>

          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <span className="font-semibold text-sm">Dashboard</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 h-9 flex-1 max-w-md min-w-0 ml-auto lg:ml-4">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              suppressHydrationWarning
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca cliente, tecnico, cantiere…"
              className="bg-transparent flex-1 min-w-0 text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="ml-auto sm:ml-4 flex items-center gap-2 shrink-0">
            <button
              aria-label="Notifiche"
              onClick={() => toast.info("Nessuna nuova notifica.")}
              className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"
            >
              <Bell className="h-4 w-4 text-slate-700" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 hover:bg-slate-50 p-1 rounded-full outline-none">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                    {getInitials(currentUser.fullName)}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{currentUser.fullName}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {currentUser.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => setActiveView("profile")}
                >
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Profilo</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => setActiveView("profile")}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Impostazioni</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Esci</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Link
              to="/wizard"
              aria-label="Nuovo rapportino"
              className="h-9 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 active:scale-95 transition btn-glow inline-flex items-center justify-center gap-1.5 w-9 sm:w-auto sm:px-4"
            >
              <Plus className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">Nuovo rapportino</span>
            </Link>
          </div>
        </header>

        <main
          className={`flex-1 p-4 sm:p-8 space-y-6 overflow-x-hidden ${activeView === "dashboard" ? "bg-[#090D16]" : "bg-[#090D16]"}`}
        >
          {currentUser.emailConfirmed === false && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-200">
                    Il tuo indirizzo email non è ancora stato verificato.
                  </p>
                  <p className="text-xs text-amber-300/70">
                    Controlla la tua casella di posta ({currentUser.email}) e clicca sul link di
                    conferma.
                  </p>
                </div>
              </div>
              <button
                onClick={handleResendEmail}
                disabled={resendingVerification}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-medium transition disabled:opacity-50 shrink-0"
              >
                <Mail className="h-3.5 w-3.5" />
                {resendingVerification ? "Invio in corso..." : "Invia di nuovo email"}
              </button>
            </div>
          )}

          {activeView === "dashboard" && (
            <DashboardAnalyticsView
              currentUser={currentUser}
              onNavigateToWizard={() => navigate({ to: "/wizard" })}
              onNavigateToReports={() => setActiveView("reports")}
              onOpenPdf={(reportId) => setPreviewPdfId(reportId)}
            />
          )}
          {activeView === "profile" && (
            <ProfileSettings
              currentUser={currentUser}
              onUpdate={setUser}
              onClose={() => setActiveView("dashboard")}
            />
          )}
          {activeView === "company_settings" && <CompanySettings />}
          {activeView === "reports" && <ReportsView />}
        </main>
      </div>

      {pdfOpen && <PdfModal report={pdfOpen} onClose={() => setPdfOpen(null)} />}
      {previewPdfId && (
        <PdfPreviewModal reportId={previewPdfId} onClose={() => setPreviewPdfId(null)} />
      )}
    </div>
  );
}

function PdfModal({ report, onClose }: { report: Report; onClose: () => void }) {
  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    toast.success(`Download del rapportino ${report.id} avviato.`);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-2xl border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div>
            <div className="text-xs text-slate-500 font-mono">{report.id}</div>
            <h3 className="font-semibold">Rapportino di lavoro</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="h-9 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 text-sm"
            >
              <Printer className="h-4 w-4" />
              Stampa
            </button>
            <button
              onClick={handleDownload}
              className="h-9 px-3 rounded-lg bg-primary text-white flex items-center gap-1.5 text-sm hover:bg-primary/90 btn-glow"
            >
              <Download className="h-4 w-4" />
              Scarica
            </button>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="p-8">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white">
                <Hammer className="h-4 w-4" />
              </span>
              <div>
                <div className="font-semibold text-sm">Elettro Rossi Srl</div>
                <div className="text-[11px] text-slate-500">P.IVA 01234567890 · Milano</div>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div className="tabular">{report.date}</div>
              <div className="font-mono">{report.id}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
            <div>
              <div className="text-xs text-slate-500">Cliente</div>
              <div className="font-medium">{report.client}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Cantiere</div>
              <div className="font-medium">{report.site}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Tecnico</div>
              <div className="font-medium">{report.tech}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Ore lavorate</div>
              <div className="font-medium tabular">{report.hours.toFixed(1)}h</div>
            </div>
          </div>
          <div className="mt-6">
            <div className="text-xs text-slate-500 mb-2">Descrizione lavori</div>
            <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700 leading-relaxed">
              Sostituzione quadro elettrico principale, verifica dispersioni e messa a norma linea
              illuminazione locali produttivi.
            </div>
          </div>
          <div className="mt-6">
            <div className="text-xs text-slate-500 mb-2">Materiali</div>
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Articolo</th>
                  <th className="text-right px-3 py-2 font-medium tabular">Q.tà</th>
                  <th className="text-right px-3 py-2 font-medium tabular">Prezzo</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Cavo FG16 3x2.5", 40, "€ 78,00"],
                  ["Interruttore MT 25A", 2, "€ 96,00"],
                  ["Presa Schuko IP55", 6, "€ 42,00"],
                ].map(([a, q, p]) => (
                  <tr key={String(a)} className="border-t border-slate-100">
                    <td className="px-3 py-2">{a}</td>
                    <td className="px-3 py-2 text-right tabular">{q}</td>
                    <td className="px-3 py-2 text-right tabular">{p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-2">Firma cliente</div>
              <div className="rounded-lg border border-slate-200 h-24 grid place-items-center bg-slate-50/50">
                <svg viewBox="0 0 200 60" className="h-12 w-32">
                  <path
                    d="M10 40 C 30 10, 60 55, 80 30 S 130 5, 160 35 190 20, 195 35"
                    stroke="#0F172A"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-2">Stato</div>
              <div
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle[report.status]}`}
              >
                {report.status}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
