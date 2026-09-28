import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Wrench,
  Search,
  Plus,
  Building2,
  MapPin,
  Cpu,
  UserCheck,
  Calendar,
  Clock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ChevronRight,
  Filter,
  FileText,
  AlertTriangle,
  PlayCircle,
  PauseCircle,
  ShieldCheck,
  Receipt,
  RotateCcw,
  LucideIcon,
} from "lucide-react";
import {
  Intervention,
  InterventionPriority,
  InterventionStatus,
  getInterventions,
  createIntervention,
  updateIntervention,
  transitionInterventionStatus,
} from "@/lib/api/interventions";
import { Customer, Location, fetchCustomers, fetchLocations } from "@/lib/api/customers";
import { Asset, fetchAssets } from "@/lib/api/assets";
import { fetchTeamMembers, TeamMember } from "@/lib/api/team";
import { UserSession } from "@/lib/auth";

interface InterventionsViewProps {
  currentUser?: UserSession | null;
}

const STATUS_CONFIG: Record<
  InterventionStatus,
  { label: string; badgeClass: string; bgClass: string; icon: LucideIcon }
> = {
  nuovo: {
    label: "Nuovo",
    badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    bgClass: "border-blue-500/30 bg-blue-500/5",
    icon: AlertCircle,
  },
  da_assegnare: {
    label: "Da assegnare",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    bgClass: "border-amber-500/30 bg-amber-500/5",
    icon: Clock,
  },
  assegnato: {
    label: "Assegnato",
    badgeClass: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    bgClass: "border-purple-500/30 bg-purple-500/5",
    icon: UserCheck,
  },
  in_viaggio: {
    label: "In viaggio",
    badgeClass: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    bgClass: "border-indigo-500/30 bg-indigo-500/5",
    icon: PlayCircle,
  },
  sul_posto: {
    label: "Sul posto",
    badgeClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    bgClass: "border-cyan-500/30 bg-cyan-500/5",
    icon: MapPin,
  },
  in_lavorazione: {
    label: "In lavorazione",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    bgClass: "border-emerald-500/30 bg-emerald-500/5",
    icon: Wrench,
  },
  in_attesa: {
    label: "In attesa",
    badgeClass: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    bgClass: "border-yellow-500/30 bg-yellow-500/5",
    icon: PauseCircle,
  },
  completato: {
    label: "Completato",
    badgeClass: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    bgClass: "border-teal-500/30 bg-teal-500/5",
    icon: CheckCircle2,
  },
  verificato: {
    label: "Verificato",
    badgeClass: "bg-green-500/10 text-green-400 border-green-500/20",
    bgClass: "border-green-500/30 bg-green-500/5",
    icon: ShieldCheck,
  },
  pronto_per_fatturazione: {
    label: "Pronto fattura",
    badgeClass: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    bgClass: "border-orange-500/30 bg-orange-500/5",
    icon: Receipt,
  },
  fatturato: {
    label: "Fatturato",
    badgeClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    bgClass: "border-zinc-500/30 bg-zinc-500/5",
    icon: CheckCircle2,
  },
};

const PRIORITY_CONFIG: Record<InterventionPriority, { label: string; badgeClass: string }> = {
  bassa: { label: "Bassa", badgeClass: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
  media: { label: "Media", badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  alta: { label: "Alta", badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  urgente: { label: "Urgente", badgeClass: "bg-red-500/10 text-red-400 border-red-500/20" },
};

export const NEXT_TRANSITIONS_MAP: Record<
  InterventionStatus,
  { target: InterventionStatus; label: string; btnClass: string }[]
> = {
  nuovo: [
    {
      target: "da_assegnare",
      label: "Imposta da assegnare",
      btnClass: "bg-amber-600 hover:bg-amber-500",
    },
  ],
  da_assegnare: [
    {
      target: "assegnato",
      label: "Assegna a Tecnico",
      btnClass: "bg-purple-600 hover:bg-purple-500",
    },
  ],
  assegnato: [
    { target: "in_viaggio", label: "Avvia Viaggio", btnClass: "bg-indigo-600 hover:bg-indigo-500" },
  ],
  in_viaggio: [
    { target: "sul_posto", label: "Arrivato sul posto", btnClass: "bg-cyan-600 hover:bg-cyan-500" },
  ],
  sul_posto: [
    {
      target: "in_lavorazione",
      label: "Inizia Lavorazione",
      btnClass: "bg-emerald-600 hover:bg-emerald-500",
    },
  ],
  in_lavorazione: [
    {
      target: "in_attesa",
      label: "Metti in Attesa",
      btnClass: "bg-yellow-600 hover:bg-yellow-500",
    },
    {
      target: "completato",
      label: "Completa Intervento",
      btnClass: "bg-teal-600 hover:bg-teal-500",
    },
  ],
  in_attesa: [
    {
      target: "in_lavorazione",
      label: "Riprendi Lavorazione",
      btnClass: "bg-emerald-600 hover:bg-emerald-500",
    },
    {
      target: "completato",
      label: "Completa Intervento",
      btnClass: "bg-teal-600 hover:bg-teal-500",
    },
  ],
  completato: [
    {
      target: "verificato",
      label: "Verifica e Approva",
      btnClass: "bg-green-600 hover:bg-green-500",
    },
  ],
  verificato: [
    {
      target: "pronto_per_fatturazione",
      label: "Segna Pronto per Fatturazione",
      btnClass: "bg-orange-600 hover:bg-orange-500",
    },
  ],
  pronto_per_fatturazione: [
    {
      target: "fatturato",
      label: "Segna come Fatturato",
      btnClass: "bg-zinc-600 hover:bg-zinc-500",
    },
  ],
  fatturato: [],
};

export function InterventionsView({ currentUser }: InterventionsViewProps) {
  const canWrite = currentUser?.role !== "technician" && currentUser?.role !== "cliente";

  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<string>("");
  const [filterCustomer, setFilterCustomer] = useState<string>("");
  const [filterTechnician, setFilterTechnician] = useState<string>("");

  // Reference data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<TeamMember[]>([]);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<Intervention | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  // Cascading form selections
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formLocationId, setFormLocationId] = useState("");
  const [formAssetId, setFormAssetId] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formProblem, setFormProblem] = useState("");
  const [formPriority, setFormPriority] = useState<InterventionPriority>("media");
  const [formTechnicianId, setFormTechnicianId] = useState("");
  const [formScheduledStart, setFormScheduledStart] = useState("");
  const [formScheduledEnd, setFormScheduledEnd] = useState("");
  const [formEstimatedHours, setFormEstimatedHours] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const [formLocations, setFormLocations] = useState<Location[]>([]);
  const [formAssets, setFormAssets] = useState<Asset[]>([]);
  const [loadingFormLocations, setLoadingFormLocations] = useState(false);
  const [loadingFormAssets, setLoadingFormAssets] = useState(false);

  // Transition form modal state
  const [transitionTarget, setTransitionTarget] = useState<InterventionStatus | null>(null);
  const [transitionTechId, setTransitionTechId] = useState("");
  const [transitionActualHours, setTransitionActualHours] = useState("");
  const [transitionNotes, setTransitionNotes] = useState("");

  // Load Reference Data
  useEffect(() => {
    async function loadRefs() {
      try {
        const [custList, teamList] = await Promise.all([
          fetchCustomers({ activeOnly: true }).catch(() => []),
          fetchTeamMembers().catch(() => []),
        ]);
        setCustomers(custList);
        setTechnicians(teamList.filter((m) => m.role === "technician" && m.isActive));
      } catch (err) {
        console.error("Failed to load reference data:", err);
      }
    }
    loadRefs();
  }, []);

  // Fetch Interventions
  const loadInterventions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getInterventions({
        search: query || undefined,
        status: filterStatus || undefined,
        priority: filterPriority || undefined,
        customerId: filterCustomer || undefined,
        technicianId: filterTechnician || undefined,
      });
      setInterventions(res.items || []);
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Impossibile caricare gli interventi.");
    } finally {
      setLoading(false);
    }
  }, [query, filterStatus, filterPriority, filterCustomer, filterTechnician]);

  useEffect(() => {
    loadInterventions();
  }, [loadInterventions]);

  // Load Locations when Form Customer changes
  useEffect(() => {
    if (!formCustomerId) {
      setFormLocations([]);
      setFormLocationId("");
      setFormAssets([]);
      setFormAssetId("");
      return;
    }

    async function loadLocs() {
      setLoadingFormLocations(true);
      try {
        const locs = await fetchLocations(formCustomerId, { activeOnly: true });
        setFormLocations(locs);
        setFormLocationId("");
        setFormAssets([]);
        setFormAssetId("");
      } catch (err) {
        console.error("Error loading locations:", err);
        setFormLocations([]);
      } finally {
        setLoadingFormLocations(false);
      }
    }
    loadLocs();
  }, [formCustomerId]);

  // Load Assets when Form Location changes
  useEffect(() => {
    if (!formCustomerId || !formLocationId) {
      setFormAssets([]);
      setFormAssetId("");
      return;
    }

    async function loadAsts() {
      setLoadingFormAssets(true);
      try {
        const asts = await fetchAssets({
          customerId: formCustomerId,
          locationId: formLocationId,
          activeOnly: true,
        });
        setFormAssets(asts);
        setFormAssetId("");
      } catch (err) {
        console.error("Error loading assets:", err);
        setFormAssets([]);
      } finally {
        setLoadingFormAssets(false);
      }
    }
    loadAsts();
  }, [formCustomerId, formLocationId]);

  const handleOpenCreate = () => {
    setFormCustomerId("");
    setFormLocationId("");
    setFormAssetId("");
    setFormDescription("");
    setFormProblem("");
    setFormPriority("media");
    setFormTechnicianId("");
    setFormScheduledStart("");
    setFormScheduledEnd("");
    setFormEstimatedHours("");
    setFormNotes("");
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustomerId) {
      toast.error("Seleziona un cliente.");
      return;
    }
    if (!formLocationId) {
      toast.error("Seleziona una sede / cantiere.");
      return;
    }
    if (!formDescription.trim()) {
      toast.error("Inserisci una descrizione dell'intervento.");
      return;
    }

    setSubmitting(true);
    try {
      await createIntervention({
        customerId: formCustomerId,
        locationId: formLocationId,
        assetId: formAssetId || undefined,
        description: formDescription.trim(),
        problem: formProblem.trim() || undefined,
        priority: formPriority,
        technicianId: formTechnicianId || undefined,
        scheduledStart: formScheduledStart ? new Date(formScheduledStart).toISOString() : undefined,
        scheduledEnd: formScheduledEnd ? new Date(formScheduledEnd).toISOString() : undefined,
        estimatedHours: formEstimatedHours ? parseFloat(formEstimatedHours) : undefined,
        notes: formNotes.trim() || undefined,
      });

      toast.success("Intervento creato con successo!");
      setShowCreateModal(false);
      loadInterventions();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Errore durante la creazione dell'intervento.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenTransition = (target: InterventionStatus) => {
    setTransitionTarget(target);
    setTransitionTechId(selectedIntervention?.technicianId || "");
    setTransitionActualHours(
      selectedIntervention?.actualHours ? String(selectedIntervention.actualHours) : "",
    );
    setTransitionNotes("");
  };

  const handleExecuteTransition = async () => {
    if (!selectedIntervention || !transitionTarget) return;

    setTransitioning(true);
    try {
      const updated = await transitionInterventionStatus(selectedIntervention.id, {
        targetStatus: transitionTarget,
        technicianId: transitionTechId || undefined,
        actualHours: transitionActualHours ? parseFloat(transitionActualHours) : undefined,
        notes: transitionNotes.trim() || undefined,
      });

      toast.success(
        `Stato aggiornato a "${STATUS_CONFIG[transitionTarget]?.label || transitionTarget}"!`,
      );
      setSelectedIntervention(updated);
      setTransitionTarget(null);
      loadInterventions();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || "Errore durante il cambio di stato.");
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Wrench className="h-6 w-6 text-primary" />
            Interventi
          </h1>
          <p className="text-sm text-white/60 mt-1">
            Gestisci le richieste di assistenza, le assegnazioni tecniche e il ciclo di vita degli
            interventi.
          </p>
        </div>

        {canWrite && (
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-95 transition shadow-lg shadow-primary/20"
          >
            <Plus className="h-4 w-4" />
            Nuovo Intervento
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-[#111622] p-4 rounded-2xl border border-white/10 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca descrizione, problema o note..."
              className="w-full bg-[#182030] text-white text-sm pl-9 pr-4 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary placeholder:text-white/40"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-[#182030] text-white text-sm px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary"
            >
              <option value="">Tutti gli stati</option>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="w-full bg-[#182030] text-white text-sm px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary"
            >
              <option value="">Tutte le priorità</option>
              {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>
          </div>

          {/* Customer Filter */}
          <div>
            <select
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
              className="w-full bg-[#182030] text-white text-sm px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary"
            >
              <option value="">Tutti i clienti</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Interventions List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-white/50 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Caricamento interventi in corso...</p>
        </div>
      ) : interventions.length === 0 ? (
        <div className="bg-[#111622] rounded-2xl border border-white/10 p-12 text-center space-y-4">
          <div className="h-16 w-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto text-white/40">
            <Wrench className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-white">Nessun intervento trovato</h3>
            <p className="text-sm text-white/50 max-w-md mx-auto">
              {query || filterStatus || filterPriority || filterCustomer
                ? "Nessun intervento corrisponde ai filtri selezionati. Prova a reimpostarli."
                : "Non sono presenti interventi registrati. Crea il primo intervento con il pulsante in alto."}
            </p>
          </div>
          {canWrite && !query && !filterStatus && (
            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition shadow-lg shadow-primary/20"
            >
              <Plus className="h-4 w-4" />
              Crea Intervento
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {interventions.map((item) => {
            const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.nuovo;
            const priorityCfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.media;
            const StatusIcon = statusCfg.icon;

            return (
              <div
                key={item.id}
                onClick={() => setSelectedIntervention(item)}
                className="bg-[#111622] hover:bg-[#141b2b] border border-white/10 hover:border-white/20 rounded-2xl p-5 transition cursor-pointer space-y-4 group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusCfg.badgeClass}`}
                    >
                      <StatusIcon className="h-3.5 w-3.5" />
                      {statusCfg.label}
                    </span>

                    {/* Priority Badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${priorityCfg.badgeClass}`}
                    >
                      {priorityCfg.label}
                    </span>

                    <span className="text-xs text-white/40">
                      ID: #{item.id.slice(-6).toUpperCase()}
                    </span>
                  </div>

                  {/* Dates / Hours preview */}
                  <div className="flex items-center gap-4 text-xs text-white/50">
                    {item.scheduledStart && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-primary/70" />
                        {new Date(item.scheduledStart).toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    {item.estimatedHours !== undefined && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {item.estimatedHours}h stimate
                      </span>
                    )}
                  </div>
                </div>

                {/* Description & Problem */}
                <div className="space-y-1">
                  <h4 className="text-base font-semibold text-white group-hover:text-primary transition line-clamp-1">
                    {item.description}
                  </h4>
                  {item.problem && (
                    <p className="text-xs text-white/60 line-clamp-2">
                      <span className="text-white/40">Problema:</span> {item.problem}
                    </p>
                  )}
                </div>

                {/* Customer -> Location -> Asset -> Technician chain */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5 text-xs text-white/70">
                  <div className="flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg">
                    <Building2 className="h-3.5 w-3.5 text-primary/80" />
                    <span>{item.customerName || "Cliente"}</span>
                  </div>

                  <ChevronRight className="h-3 w-3 text-white/30" />

                  <div className="flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg">
                    <MapPin className="h-3.5 w-3.5 text-amber-400/80" />
                    <span>{item.locationName || "Sede"}</span>
                  </div>

                  {item.assetName && (
                    <>
                      <ChevronRight className="h-3 w-3 text-white/30" />
                      <div className="flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg">
                        <Cpu className="h-3.5 w-3.5 text-purple-400/80" />
                        <span>{item.assetName}</span>
                      </div>
                    </>
                  )}

                  <div className="ml-auto flex items-center gap-1.5">
                    {item.technicianName ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2.5 py-1 rounded-lg">
                        <UserCheck className="h-3.5 w-3.5 text-purple-400" />
                        {item.technicianName}
                      </span>
                    ) : (
                      <span className="text-xs text-white/40 italic">Non assegnato</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111622] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Wrench className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold">Crea Nuovo Intervento</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Relational Chain: Customer -> Location -> Asset */}
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-3">
                <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider">
                  1. Selezione Cliente, Sede e Impianto
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Customer */}
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1">
                      Cliente *
                    </label>
                    <select
                      value={formCustomerId}
                      onChange={(e) => setFormCustomerId(e.target.value)}
                      required
                      className="w-full bg-[#182030] text-white text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary"
                    >
                      <option value="">Seleziona cliente</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Location */}
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1">
                      Sede / Cantiere *
                    </label>
                    <select
                      value={formLocationId}
                      onChange={(e) => setFormLocationId(e.target.value)}
                      disabled={!formCustomerId || loadingFormLocations}
                      required
                      className="w-full bg-[#182030] text-white text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary disabled:opacity-50"
                    >
                      <option value="">
                        {!formCustomerId
                          ? "Prima scegli cliente"
                          : loadingFormLocations
                            ? "Caricamento sedi..."
                            : "Seleziona sede"}
                      </option>
                      {formLocations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.city})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Asset */}
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1">
                      Impianto / Asset (opzionale)
                    </label>
                    <select
                      value={formAssetId}
                      onChange={(e) => setFormAssetId(e.target.value)}
                      disabled={!formLocationId || loadingFormAssets}
                      className="w-full bg-[#182030] text-white text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary disabled:opacity-50"
                    >
                      <option value="">
                        {!formLocationId
                          ? "Prima scegli sede"
                          : loadingFormAssets
                            ? "Caricamento impianti..."
                            : "Nessun impianto specifico"}
                      </option>
                      {formAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.assetType})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Description & Problem */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1">
                    Descrizione Intervento *
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    required
                    placeholder="Es. Sostituzione modulo inverter e controllo stringhe"
                    className="w-full bg-[#182030] text-white text-sm px-3.5 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-primary placeholder:text-white/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1">
                    Problema / Segnalazione Riscontrata
                  </label>
                  <textarea
                    rows={2}
                    value={formProblem}
                    onChange={(e) => setFormProblem(e.target.value)}
                    placeholder="Dettagli del guasto o anomalie segnalate dal cliente..."
                    className="w-full bg-[#182030] text-white text-sm px-3.5 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary placeholder:text-white/40"
                  />
                </div>
              </div>

              {/* Priority, Technician & Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1">Priorità</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as InterventionPriority)}
                    className="w-full bg-[#182030] text-white text-sm px-3 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-primary"
                  >
                    <option value="bassa">Bassa</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1">
                    Tecnico Iniziale (opzionale)
                  </label>
                  <select
                    value={formTechnicianId}
                    onChange={(e) => setFormTechnicianId(e.target.value)}
                    className="w-full bg-[#182030] text-white text-sm px-3 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-primary"
                  >
                    <option value="">Non assegnato</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1">
                    Ore Stimate
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formEstimatedHours}
                    onChange={(e) => setFormEstimatedHours(e.target.value)}
                    placeholder="Es. 3"
                    className="w-full bg-[#182030] text-white text-sm px-3 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-primary placeholder:text-white/40"
                  />
                </div>
              </div>

              {/* Scheduling Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1">
                    Inizio Programmato
                  </label>
                  <input
                    type="datetime-local"
                    value={formScheduledStart}
                    onChange={(e) => setFormScheduledStart(e.target.value)}
                    className="w-full bg-[#182030] text-white text-sm px-3 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1">
                    Fine Programmata
                  </label>
                  <input
                    type="datetime-local"
                    value={formScheduledEnd}
                    onChange={(e) => setFormScheduledEnd(e.target.value)}
                    className="w-full bg-[#182030] text-white text-sm px-3 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Note Interne</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Note operative o istruzioni speciali per il tecnico..."
                  className="w-full bg-[#182030] text-white text-sm px-3.5 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary placeholder:text-white/40"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-sm font-medium transition"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50 shadow-lg shadow-primary/20"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Crea Intervento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL & TRANSITION MODAL */}
      {selectedIntervention && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111622] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 text-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                      STATUS_CONFIG[selectedIntervention.status]?.badgeClass || ""
                    }`}
                  >
                    {STATUS_CONFIG[selectedIntervention.status]?.label ||
                      selectedIntervention.status}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      PRIORITY_CONFIG[selectedIntervention.priority]?.badgeClass || ""
                    }`}
                  >
                    Priorità {PRIORITY_CONFIG[selectedIntervention.priority]?.label}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mt-1">
                  {selectedIntervention.description}
                </h3>
              </div>

              <button
                onClick={() => {
                  setSelectedIntervention(null);
                  setTransitionTarget(null);
                }}
                className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Relational chain box */}
            <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-2 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-white/40 block">Cliente:</span>
                  <span className="font-medium text-white flex items-center gap-1.5 mt-0.5">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    {selectedIntervention.customerName || selectedIntervention.customerId}
                  </span>
                </div>
                <div>
                  <span className="text-white/40 block">Sede / Cantiere:</span>
                  <span className="font-medium text-white flex items-center gap-1.5 mt-0.5">
                    <MapPin className="h-3.5 w-3.5 text-amber-400" />
                    {selectedIntervention.locationName || selectedIntervention.locationId}
                  </span>
                </div>
                {selectedIntervention.assetName && (
                  <div>
                    <span className="text-white/40 block">Impianto / Asset:</span>
                    <span className="font-medium text-white flex items-center gap-1.5 mt-0.5">
                      <Cpu className="h-3.5 w-3.5 text-purple-400" />
                      {selectedIntervention.assetName}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-white/40 block">Tecnico Assegnato:</span>
                  <span className="font-medium text-white flex items-center gap-1.5 mt-0.5">
                    <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
                    {selectedIntervention.technicianName || "Nessun tecnico assegnato"}
                  </span>
                </div>
              </div>
            </div>

            {/* Problem & Details */}
            {selectedIntervention.problem && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                  Problema Segnalato
                </span>
                <p className="text-sm text-white/80 bg-[#182030] p-3 rounded-xl border border-white/5">
                  {selectedIntervention.problem}
                </p>
              </div>
            )}

            {/* Dates & Hours */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[#182030] p-3.5 rounded-xl border border-white/5">
              <div>
                <span className="text-white/40 block">Inizio Programmato:</span>
                <span className="text-white font-medium">
                  {selectedIntervention.scheduledStart
                    ? new Date(selectedIntervention.scheduledStart).toLocaleString("it-IT")
                    : "Non impostato"}
                </span>
              </div>
              <div>
                <span className="text-white/40 block">Fine Programmata:</span>
                <span className="text-white font-medium">
                  {selectedIntervention.scheduledEnd
                    ? new Date(selectedIntervention.scheduledEnd).toLocaleString("it-IT")
                    : "Non impostato"}
                </span>
              </div>
              <div>
                <span className="text-white/40 block">Ore Stimate:</span>
                <span className="text-white font-medium">
                  {selectedIntervention.estimatedHours !== undefined
                    ? `${selectedIntervention.estimatedHours}h`
                    : "-"}
                </span>
              </div>
              <div>
                <span className="text-white/40 block">Ore Effettive:</span>
                <span className="text-white font-medium text-emerald-400">
                  {selectedIntervention.actualHours !== undefined
                    ? `${selectedIntervention.actualHours}h`
                    : "-"}
                </span>
              </div>
            </div>

            {selectedIntervention.notes && (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                  Note Operative
                </span>
                <p className="text-xs text-white/70 bg-[#182030] p-3 rounded-xl border border-white/5">
                  {selectedIntervention.notes}
                </p>
              </div>
            )}

            {/* Status Transitions Section */}
            {canWrite && (
              <div className="space-y-3 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowRight className="h-3.5 w-3.5 text-primary" />
                    Avanzamento Stato Intervento
                  </h4>
                </div>

                {/* Transition Form inline if target selected */}
                {transitionTarget ? (
                  <div className="bg-primary/10 border border-primary/30 p-4 rounded-xl space-y-3 animate-in fade-in duration-150">
                    <h5 className="text-xs font-bold text-primary flex items-center gap-1.5">
                      Transizione a: {STATUS_CONFIG[transitionTarget]?.label || transitionTarget}
                    </h5>

                    {transitionTarget === "assegnato" && (
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Seleziona Tecnico da Assegnare *
                        </label>
                        <select
                          value={transitionTechId}
                          onChange={(e) => setTransitionTechId(e.target.value)}
                          required
                          className="w-full bg-[#182030] text-white text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary"
                        >
                          <option value="">Seleziona tecnico</option>
                          {technicians.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.fullName}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {(transitionTarget === "completato" ||
                      transitionTarget === "in_lavorazione") && (
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">
                          Ore Effettive di Lavoro (opzionale)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={transitionActualHours}
                          onChange={(e) => setTransitionActualHours(e.target.value)}
                          placeholder="Es. 2.5"
                          className="w-full bg-[#182030] text-white text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary placeholder:text-white/40"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">
                        Note sul cambio di stato (opzionale)
                      </label>
                      <input
                        type="text"
                        value={transitionNotes}
                        onChange={(e) => setTransitionNotes(e.target.value)}
                        placeholder="Es. Intervento completato con sostituzione componente..."
                        className="w-full bg-[#182030] text-white text-xs px-3 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-primary placeholder:text-white/40"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setTransitionTarget(null)}
                        disabled={transitioning}
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-xs font-medium transition"
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteTransition}
                        disabled={transitioning}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition shadow-md shadow-primary/20 disabled:opacity-50"
                      >
                        {transitioning && <Loader2 className="h-3 w-3 animate-spin" />}
                        Conferma Cambio Stato
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(NEXT_TRANSITIONS_MAP[selectedIntervention.status] || []).map((t) => (
                      <button
                        key={t.target}
                        type="button"
                        onClick={() => handleOpenTransition(t.target)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-semibold transition active:scale-95 ${t.btnClass}`}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        {t.label}
                      </button>
                    ))}
                    {(NEXT_TRANSITIONS_MAP[selectedIntervention.status] || []).length === 0 && (
                      <span className="text-xs text-white/40 italic">
                        Nessun avanzamento disponibile (stato finale:{" "}
                        {STATUS_CONFIG[selectedIntervention.status]?.label ||
                          selectedIntervention.status}
                        ).
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
