import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Cpu,
  Search,
  Plus,
  Building2,
  MapPin,
  Edit2,
  Archive,
  ArchiveRestore,
  Loader2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  Calendar,
  Layers,
  Wrench,
  Tag,
} from "lucide-react";
import {
  Asset,
  AssetType,
  AssetStatus,
  fetchAssets,
  createAsset,
  updateAsset,
  archiveAsset,
  reactivateAsset,
} from "@/lib/api/assets";
import { Customer, Location, fetchCustomers, fetchLocations } from "@/lib/api/customers";
import { UserSession } from "@/lib/auth";

interface AssetsViewProps {
  currentUser?: UserSession | null;
}

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "quadro", label: "Quadro Elettrico" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "inverter", label: "Inverter" },
  { value: "batteria", label: "Sistema Accumulo / Batteria" },
  { value: "wallbox", label: "Colonnina / Wallbox" },
  { value: "climatizzazione", label: "Climatizzazione / PDC" },
  { value: "automazione", label: "Automazione / Cancello" },
  { value: "allarme", label: "Allarme / Antintrusione" },
  { value: "rete_cablaggio", label: "Rete Dati / Cablaggio" },
  { value: "altro", label: "Altro Impianto" },
];

const ASSET_STATUSES: { value: AssetStatus; label: string }[] = [
  { value: "operativo", label: "Operativo" },
  { value: "manutenzione", label: "In Manutenzione" },
  { value: "fuori_servizio", label: "Fuori Servizio" },
  { value: "dismesso", label: "Dismesso" },
];

export function AssetsView({ currentUser }: AssetsViewProps) {
  const canWrite = currentUser?.role !== "technician" && currentUser?.role !== "cliente";

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [query, setQuery] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [activeOnly, setActiveOnly] = useState(false);

  // Reference data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filterLocations, setFilterLocations] = useState<Location[]>([]);

  // Modal form states
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modal locations (loaded when form customer is picked)
  const [modalLocations, setModalLocations] = useState<Location[]>([]);
  const [loadingModalLocations, setLoadingModalLocations] = useState(false);

  const [form, setForm] = useState({
    id: "",
    customerId: "",
    locationId: "",
    assetType: "quadro" as AssetType,
    name: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    installationDate: "",
    warrantyEndDate: "",
    status: "operativo" as AssetStatus,
    notes: "",
  });

  // Load customers for select dropdowns
  useEffect(() => {
    fetchCustomers(undefined, false)
      .then(setCustomers)
      .catch((err) => {
        console.error("Error loading customers:", err);
      });
  }, []);

  // When filter customer changes, update filter locations
  useEffect(() => {
    if (filterCustomer) {
      fetchLocations(filterCustomer, undefined, false)
        .then(setFilterLocations)
        .catch(() => setFilterLocations([]));
    } else {
      setFilterLocations([]);
      setFilterLocation("");
    }
  }, [filterCustomer]);

  // Load assets
  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAssets({
        search: query.trim() || undefined,
        customerId: filterCustomer || undefined,
        locationId: filterLocation || undefined,
        assetType: filterType || undefined,
        status: filterStatus || undefined,
        activeOnly,
      });
      setAssets(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Impossibile caricare gli impianti.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [query, filterCustomer, filterLocation, filterType, filterStatus, activeOnly]);

  useEffect(() => {
    const delay = setTimeout(() => {
      loadAssets();
    }, 250);
    return () => clearTimeout(delay);
  }, [loadAssets]);

  // When form customer changes in modal, load that customer's locations
  const handleFormCustomerChange = async (newCustomerId: string) => {
    setForm((prev) => ({ ...prev, customerId: newCustomerId, locationId: "" }));
    if (!newCustomerId) {
      setModalLocations([]);
      return;
    }
    setLoadingModalLocations(true);
    try {
      const locs = await fetchLocations(newCustomerId, undefined, true);
      setModalLocations(locs);
      if (locs.length === 1) {
        setForm((prev) => ({ ...prev, locationId: locs[0].id }));
      }
    } catch {
      setModalLocations([]);
      toast.error("Impossibile caricare le sedi per questo cliente.");
    } finally {
      setLoadingModalLocations(false);
    }
  };

  const openCreateModal = () => {
    setForm({
      id: "",
      customerId: customers.length === 1 ? customers[0].id : "",
      locationId: "",
      assetType: "quadro",
      name: "",
      manufacturer: "",
      model: "",
      serialNumber: "",
      installationDate: "",
      warrantyEndDate: "",
      status: "operativo",
      notes: "",
    });
    setModalLocations([]);
    setIsEditing(false);
    setShowModal(true);

    if (customers.length === 1) {
      handleFormCustomerChange(customers[0].id);
    }
  };

  const openEditModal = async (asset: Asset) => {
    setForm({
      id: asset.id,
      customerId: asset.customerId,
      locationId: asset.locationId,
      assetType: asset.assetType,
      name: asset.name,
      manufacturer: asset.manufacturer || "",
      model: asset.model || "",
      serialNumber: asset.serialNumber || "",
      installationDate: asset.installationDate || "",
      warrantyEndDate: asset.warrantyEndDate || "",
      status: asset.status,
      notes: asset.notes || "",
    });
    setIsEditing(true);
    setShowModal(true);

    // Load locations for this customer
    setLoadingModalLocations(true);
    try {
      const locs = await fetchLocations(asset.customerId, undefined, false);
      setModalLocations(locs);
    } catch {
      setModalLocations([]);
    } finally {
      setLoadingModalLocations(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Inserisci il nome dell'impianto.");
      return;
    }
    if (!form.customerId) {
      toast.error("Seleziona il cliente.");
      return;
    }
    if (!form.locationId) {
      toast.error("Seleziona la sede o cantiere.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        await updateAsset(form.id, {
          customerId: form.customerId,
          locationId: form.locationId,
          assetType: form.assetType,
          name: form.name.trim(),
          manufacturer: form.manufacturer.trim() || undefined,
          model: form.model.trim() || undefined,
          serialNumber: form.serialNumber.trim() || undefined,
          installationDate: form.installationDate || undefined,
          warrantyEndDate: form.warrantyEndDate || undefined,
          status: form.status,
          notes: form.notes.trim() || undefined,
        });
        toast.success("Impianto aggiornato con successo.");
      } else {
        await createAsset({
          customerId: form.customerId,
          locationId: form.locationId,
          assetType: form.assetType,
          name: form.name.trim(),
          manufacturer: form.manufacturer.trim() || undefined,
          model: form.model.trim() || undefined,
          serialNumber: form.serialNumber.trim() || undefined,
          installationDate: form.installationDate || undefined,
          warrantyEndDate: form.warrantyEndDate || undefined,
          status: form.status,
          notes: form.notes.trim() || undefined,
        });
        toast.success("Impianto creato con successo.");
      }
      setShowModal(false);
      loadAssets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Errore durante il salvataggio.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleArchive = async (asset: Asset) => {
    setActionLoadingId(asset.id);
    try {
      if (asset.isActive) {
        await archiveAsset(asset.id);
        toast.success(`Impianto "${asset.name}" archiviato.`);
      } else {
        await reactivateAsset(asset.id);
        toast.success(`Impianto "${asset.name}" riattivato.`);
      }
      loadAssets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Operazione non riuscita.";
      toast.error(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Helper dictionary lookup
  const customerMap = new Map(customers.map((c) => [c.id, c.displayName]));

  const getStatusBadge = (status: AssetStatus) => {
    switch (status) {
      case "operativo":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
            Operativo
          </span>
        );
      case "manutenzione":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="h-3 w-3" />
            Manutenzione
          </span>
        );
      case "fuori_servizio":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="h-3 w-3" />
            Fuori Servizio
          </span>
        );
      case "dismesso":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            Dismesso
          </span>
        );
    }
  };

  const getTypeLabel = (type: AssetType) => {
    const found = ASSET_TYPES.find((t) => t.value === type);
    return found ? found.label : type;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5">
            <Cpu className="h-6 w-6 text-primary" />
            Impianti & Attrezzature (Site Equipment)
          </h1>
          <p className="text-xs sm:text-sm text-white/60 mt-1">
            Gestisci macchinari, quadri, impianti fotovoltaici e dispositivi installati presso le
            sedi dei clienti.
          </p>
        </div>

        {canWrite && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-medium text-sm transition-all shadow-lg shadow-primary/25 shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nuovo Impianto
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/10">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input
            type="text"
            placeholder="Cerca per nome, marca, matricola..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:border-primary focus:outline-none placeholder:text-white/40"
          />
        </div>

        {/* Filter Customer */}
        <div>
          <select
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:border-primary focus:outline-none"
          >
            <option value="" className="bg-[#090D16]">
              Tutti i clienti
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#090D16]">
                {c.displayName}
              </option>
            ))}
          </select>
        </div>

        {/* Filter Location (if customer selected) */}
        <div>
          <select
            value={filterLocation}
            disabled={!filterCustomer || filterLocations.length === 0}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:border-primary focus:outline-none disabled:opacity-50"
          >
            <option value="" className="bg-[#090D16]">
              {filterCustomer ? "Tutte le sedi del cliente" : "Seleziona prima cliente"}
            </option>
            {filterLocations.map((l) => (
              <option key={l.id} value={l.id} className="bg-[#090D16]">
                {l.name} ({l.city})
              </option>
            ))}
          </select>
        </div>

        {/* Filter Type */}
        <div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:border-primary focus:outline-none"
          >
            <option value="" className="bg-[#090D16]">
              Tutti i tipi impianto
            </option>
            {ASSET_TYPES.map((t) => (
              <option key={t.value} value={t.value} className="bg-[#090D16]">
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Filter Status & Active Only Toggle */}
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:border-primary focus:outline-none"
          >
            <option value="" className="bg-[#090D16]">
              Tutti gli stati
            </option>
            {ASSET_STATUSES.map((s) => (
              <option key={s.value} value={s.value} className="bg-[#090D16]">
                {s.label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white/80 cursor-pointer select-none shrink-0 hover:bg-white/10 transition">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="rounded border-white/20 bg-white/5 text-primary focus:ring-primary h-3.5 w-3.5"
            />
            <span>Solo attivi</span>
          </label>
        </div>
      </div>

      {/* Assets Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-white/60 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Caricamento impianti in corso...</p>
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
          <Cpu className="h-10 w-10 text-white/30" />
          <h3 className="text-base font-semibold text-white">Nessun impianto trovato</h3>
          <p className="text-xs text-white/60 max-w-sm">
            Non ci sono impianti o attrezzature che corrispondono ai filtri selezionati.
          </p>
          {canWrite && (
            <button
              onClick={openCreateModal}
              className="mt-2 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-xs font-medium transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Aggiungi il primo impianto
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => {
            const customerName = customerMap.get(asset.customerId) || "Cliente";
            return (
              <div
                key={asset.id}
                className={`flex flex-col justify-between p-5 rounded-2xl border transition-all ${
                  asset.isActive
                    ? "bg-white/[0.02] border-white/10 hover:border-white/20"
                    : "bg-white/[0.01] border-white/5 opacity-70"
                }`}
              >
                <div className="space-y-3">
                  {/* Top Bar: Type & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                      <Layers className="h-3 w-3" />
                      {getTypeLabel(asset.assetType)}
                    </span>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(asset.status)}
                      {!asset.isActive && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                          Archiviato
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <h3 className="text-base font-bold text-white group-hover:text-primary transition-colors">
                      {asset.name}
                    </h3>
                    {(asset.manufacturer || asset.model) && (
                      <p className="text-xs text-white/60 mt-0.5 flex items-center gap-1">
                        <Wrench className="h-3 w-3 text-white/40" />
                        {[asset.manufacturer, asset.model].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>

                  {/* Serial Number */}
                  {asset.serialNumber && (
                    <div className="flex items-center gap-1.5 text-xs text-white/70 bg-white/5 px-2.5 py-1.5 rounded-lg">
                      <Tag className="h-3 w-3 text-white/40 shrink-0" />
                      <span className="font-mono text-[11px] truncate">
                        S/N: {asset.serialNumber}
                      </span>
                    </div>
                  )}

                  {/* Hierarchy: Customer & Location */}
                  <div className="space-y-1.5 pt-2 border-t border-white/5 text-xs text-white/70">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="truncate font-medium text-white">{customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-white/40 shrink-0" />
                      <span className="truncate text-white/60">ID Sede: {asset.locationId}</span>
                    </div>
                  </div>

                  {/* Dates if available */}
                  {(asset.installationDate || asset.warrantyEndDate) && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[11px] text-white/50">
                      {asset.installationDate && (
                        <div>
                          <span>Installato: </span>
                          <span className="text-white/80 font-medium">
                            {asset.installationDate}
                          </span>
                        </div>
                      )}
                      {asset.warrantyEndDate && (
                        <div>
                          <span>Garanzia: </span>
                          <span className="text-white/80 font-medium">{asset.warrantyEndDate}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {asset.notes && (
                    <p className="text-xs text-white/60 line-clamp-2 pt-1 border-t border-white/5 italic">
                      "{asset.notes}"
                    </p>
                  )}
                </div>

                {/* Actions Footer */}
                {canWrite && (
                  <div className="flex items-center justify-end gap-2 pt-4 mt-3 border-t border-white/10">
                    <button
                      onClick={() => openEditModal(asset)}
                      className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
                      title="Modifica impianto"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleToggleArchive(asset)}
                      disabled={actionLoadingId === asset.id}
                      className={`p-1.5 rounded-lg transition ${
                        asset.isActive
                          ? "text-white/40 hover:text-red-400 hover:bg-red-500/10"
                          : "text-emerald-400/70 hover:text-emerald-300 hover:bg-emerald-500/10"
                      }`}
                      title={asset.isActive ? "Archivia impianto" : "Riattiva impianto"}
                    >
                      {actionLoadingId === asset.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : asset.isActive ? (
                        <Archive className="h-4 w-4" />
                      ) : (
                        <ArchiveRestore className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Asset Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#0F1420] border border-white/10 p-6 shadow-2xl my-8 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                {isEditing ? "Modifica Impianto / Attrezzatura" : "Nuovo Impianto / Attrezzatura"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Customer Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/70 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  Cliente *
                </label>
                <select
                  value={form.customerId}
                  onChange={(e) => handleFormCustomerChange(e.target.value)}
                  disabled={isEditing}
                  required
                  className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                >
                  <option value="" className="bg-[#090D16]">
                    -- Seleziona Cliente --
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#090D16]">
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location Selector (filtered strictly for selected customer) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/70 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  Sede / Cantiere del Cliente *
                </label>
                {loadingModalLocations ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-white/60 bg-white/5 rounded-xl border border-white/10">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    Caricamento sedi...
                  </div>
                ) : (
                  <select
                    value={form.locationId}
                    onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                    disabled={!form.customerId || modalLocations.length === 0}
                    required
                    className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                  >
                    <option value="" className="bg-[#090D16]">
                      {!form.customerId
                        ? "-- Seleziona prima un cliente --"
                        : modalLocations.length === 0
                          ? "-- Nessuna sede disponibile per questo cliente --"
                          : "-- Seleziona Sede / Cantiere --"}
                    </option>
                    {modalLocations.map((l) => (
                      <option key={l.id} value={l.id} className="bg-[#090D16]">
                        {l.name} - {l.address}, {l.city}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Name & Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/70">Nome Impianto *</label>
                  <input
                    type="text"
                    required
                    placeholder="es. Quadro Principale Fabbrica"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none placeholder:text-white/30"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/70">Tipo Impianto *</label>
                  <select
                    value={form.assetType}
                    onChange={(e) => setForm({ ...form, assetType: e.target.value as AssetType })}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none"
                  >
                    {ASSET_TYPES.map((t) => (
                      <option key={t.value} value={t.value} className="bg-[#090D16]">
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Manufacturer & Model */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/70">Costruttore / Marca</label>
                  <input
                    type="text"
                    placeholder="es. ABB, Schneider, SolarEdge"
                    value={form.manufacturer}
                    onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none placeholder:text-white/30"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/70">Modello</label>
                  <input
                    type="text"
                    placeholder="es. SE10K-RWS"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none placeholder:text-white/30"
                  />
                </div>
              </div>

              {/* Serial Number & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/70">
                    Numero di Serie / Matricola
                  </label>
                  <input
                    type="text"
                    placeholder="es. SN-2026-99824"
                    value={form.serialNumber}
                    onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none placeholder:text-white/30"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/70">Stato Operativo</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as AssetStatus })}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none"
                  >
                    {ASSET_STATUSES.map((s) => (
                      <option key={s.value} value={s.value} className="bg-[#090D16]">
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/70">Data Installazione</label>
                  <input
                    type="date"
                    value={form.installationDate}
                    onChange={(e) => setForm({ ...form, installationDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/70">Scadenza Garanzia</label>
                  <input
                    type="date"
                    value={form.warrantyEndDate}
                    onChange={(e) => setForm({ ...form, warrantyEndDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/70">Note e Dettagli Tecnici</label>
                <textarea
                  rows={3}
                  placeholder="Note aggiuntive, dettagli di configurazione, taratura o posizionamento..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none placeholder:text-white/30"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/5 text-sm transition"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-medium text-sm transition shadow-lg shadow-primary/25 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEditing ? "Salva Modifiche" : "Crea Impianto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
