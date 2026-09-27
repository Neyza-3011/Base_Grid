import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Users,
  Search,
  Plus,
  Building2,
  MapPin,
  ChevronRight,
  Phone,
  Mail,
  Edit2,
  ArrowLeft,
  Briefcase
} from "lucide-react";
import {
  Customer,
  Location,
  fetchCustomers,
  createCustomer,
  updateCustomer,
  fetchLocations,
  createLocation,
  updateLocation
} from "@/lib/api/customers";

export function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  
  // Navigation states
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  // Modal states
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  
  // Form states for Customer
  const [cForm, setCForm] = useState({ id: "", displayName: "", legalName: "", vatNumber: "", email: "", phoneNumber: "", isActive: true });
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [submittingCustomer, setSubmittingCustomer] = useState(false);

  // Form states for Location
  const [lForm, setLForm] = useState({ id: "", name: "", address: "", city: "", province: "", isActive: true });
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [submittingLocation, setSubmittingLocation] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCustomers(query || undefined, false);
      setCustomers(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Impossibile caricare i clienti.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const delay = setTimeout(() => {
      loadCustomers();
    }, 300);
    return () => clearTimeout(delay);
  }, [loadCustomers]);

  const loadLocations = useCallback(async (customerId: string) => {
    setLoadingLocations(true);
    try {
      const data = await fetchLocations(customerId, undefined, false);
      setLocations(data);
    } catch (err: unknown) {
      toast.error("Impossibile caricare i cantieri.");
    } finally {
      setLoadingLocations(false);
    }
  }, []);

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    loadLocations(customer.id);
  };

  const handleBackToCustomers = () => {
    setSelectedCustomer(null);
    setLocations([]);
    loadCustomers();
  };

  const openNewCustomerModal = () => {
    setCForm({ id: "", displayName: "", legalName: "", vatNumber: "", email: "", phoneNumber: "", isActive: true });
    setIsEditingCustomer(false);
    setShowCustomerModal(true);
  };

  const openEditCustomerModal = (customer: Customer) => {
    setCForm({
      id: customer.id,
      displayName: customer.displayName,
      legalName: customer.legalName || "",
      vatNumber: customer.vatNumber || "",
      email: customer.email || "",
      phoneNumber: customer.phoneNumber || "",
      isActive: customer.isActive
    });
    setIsEditingCustomer(true);
    setShowCustomerModal(true);
  };

  const submitCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingCustomer(true);
    try {
      if (isEditingCustomer) {
        const updated = await updateCustomer(cForm.id, {
          displayName: cForm.displayName,
          legalName: cForm.legalName,
          vatNumber: cForm.vatNumber,
          email: cForm.email,
          phoneNumber: cForm.phoneNumber,
        });
        toast.success("Cliente aggiornato con successo.");
        if (selectedCustomer?.id === updated.id) {
          setSelectedCustomer(updated);
        }
      } else {
        await createCustomer({
          displayName: cForm.displayName,
          legalName: cForm.legalName,
          vatNumber: cForm.vatNumber,
          email: cForm.email,
          phoneNumber: cForm.phoneNumber,
        });
        toast.success("Cliente creato con successo.");
      }
      setShowCustomerModal(false);
      loadCustomers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore durante il salvataggio del cliente.");
    } finally {
      setSubmittingCustomer(false);
    }
  };

  const openNewLocationModal = () => {
    setLForm({ id: "", name: "", address: "", city: "", province: "", isActive: true });
    setIsEditingLocation(false);
    setShowLocationModal(true);
  };

  const openEditLocationModal = (location: Location) => {
    setLForm({
      id: location.id,
      name: location.name,
      address: location.address,
      city: location.city,
      province: location.province || "",
      isActive: location.isActive
    });
    setIsEditingLocation(true);
    setShowLocationModal(true);
  };

  const submitLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    setSubmittingLocation(true);
    try {
      if (isEditingLocation) {
        await updateLocation(lForm.id, {
          name: lForm.name,
          address: lForm.address,
          city: lForm.city,
          province: lForm.province,
        });
        toast.success("Cantiere aggiornato con successo.");
      } else {
        await createLocation(selectedCustomer.id, {
          name: lForm.name,
          address: lForm.address,
          city: lForm.city,
          province: lForm.province,
        });
        toast.success("Cantiere creato con successo.");
      }
      setShowLocationModal(false);
      loadLocations(selectedCustomer.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore durante il salvataggio del cantiere.");
    } finally {
      setSubmittingLocation(false);
    }
  };

  if (selectedCustomer) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToCustomers}
            className="grid h-10 w-10 place-items-center rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" /> {selectedCustomer.displayName}
            </h1>
            <p className="text-sm text-white/50">{selectedCustomer.legalName || "Nessuna ragione sociale"}</p>
          </div>
          <button
            onClick={() => openEditCustomerModal(selectedCustomer)}
            className="h-10 px-4 rounded-lg bg-white/5 text-white text-sm font-medium hover:bg-white/10 transition inline-flex items-center gap-2"
          >
            <Edit2 className="h-4 w-4" /> Modifica Cliente
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="col-span-1 space-y-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="text-sm font-semibold text-white mb-4">Dettagli Cliente</h3>
              <div className="space-y-4">
                {selectedCustomer.email && (
                  <div className="flex items-center gap-3 text-sm text-white/70">
                    <Mail className="h-4 w-4 text-white/40" /> {selectedCustomer.email}
                  </div>
                )}
                {selectedCustomer.phoneNumber && (
                  <div className="flex items-center gap-3 text-sm text-white/70">
                    <Phone className="h-4 w-4 text-white/40" /> {selectedCustomer.phoneNumber}
                  </div>
                )}
                {selectedCustomer.vatNumber && (
                  <div className="flex items-center gap-3 text-sm text-white/70">
                    <Briefcase className="h-4 w-4 text-white/40" /> P.IVA: {selectedCustomer.vatNumber}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-1 md:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Cantieri / Sedi</h2>
              <button
                onClick={openNewLocationModal}
                className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition inline-flex items-center gap-2 btn-glow"
              >
                <Plus className="h-4 w-4" /> Nuovo Cantiere
              </button>
            </div>

            {loadingLocations ? (
              <div className="text-center py-12 text-white/50">Caricamento cantieri...</div>
            ) : locations.length === 0 ? (
              <div className="text-center py-12 bg-white/5 border border-dashed border-white/10 rounded-2xl text-white/50">
                Nessun cantiere trovato. Aggiungi il primo!
              </div>
            ) : (
              <div className="grid gap-4">
                {locations.map((loc) => (
                  <div key={loc.id} className="flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition">
                    <div className="flex items-center gap-4">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/20 text-emerald-400">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-white">{loc.name}</div>
                        <div className="text-sm text-white/60">{loc.address}, {loc.city} {loc.province && `(${loc.province})`}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => openEditLocationModal(loc)}
                      className="text-white/40 hover:text-white p-2"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Modal Cantiere (Location) */}
        {showLocationModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
                <h3 className="font-semibold text-lg text-white">
                  {isEditingLocation ? "Modifica Cantiere" : "Nuovo Cantiere"}
                </h3>
                <button onClick={() => setShowLocationModal(false)} className="text-white/50 hover:text-white">✕</button>
              </div>
              <form onSubmit={submitLocation} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-white/70">Nome Sede / Cantiere *</label>
                  <input
                    required
                    value={lForm.name}
                    onChange={(e) => setLForm({ ...lForm, name: e.target.value })}
                    placeholder="Es. Sede Principale, Cantiere Roma..."
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none transition"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-white/70">Indirizzo *</label>
                  <input
                    required
                    value={lForm.address}
                    onChange={(e) => setLForm({ ...lForm, address: e.target.value })}
                    placeholder="Es. Via Garibaldi 10"
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none transition"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">Città *</label>
                    <input
                      required
                      value={lForm.city}
                      onChange={(e) => setLForm({ ...lForm, city: e.target.value })}
                      className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none transition"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-white/70">Provincia (Sigla)</label>
                    <input
                      value={lForm.province}
                      onChange={(e) => setLForm({ ...lForm, province: e.target.value })}
                      placeholder="Es. RM"
                      maxLength={2}
                      className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none transition uppercase"
                    />
                  </div>
                </div>
                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowLocationModal(false)}
                    className="px-4 py-2 text-sm text-white/70 hover:text-white"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={submittingLocation}
                    className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
                  >
                    {submittingLocation ? "Salvataggio..." : "Salva"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Clienti
          </h1>
          <p className="text-sm text-white/50">Gestisci i tuoi clienti e le loro sedi operative</p>
        </div>
        <button
          onClick={openNewCustomerModal}
          className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 active:scale-95 transition inline-flex items-center justify-center gap-2 btn-glow"
        >
          <Plus className="h-4 w-4" /> Nuovo Cliente
        </button>
      </div>

      <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 h-12">
        <Search className="h-5 w-5 text-white/40" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome, email o telefono..."
          className="bg-transparent border-none outline-none flex-1 ml-3 text-white placeholder:text-white/40 text-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-white/50">Ricerca clienti...</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 bg-white/5 border border-dashed border-white/10 rounded-2xl">
          <Building2 className="h-12 w-12 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">Nessun cliente trovato</h3>
          <p className="text-white/50 text-sm mb-6 max-w-md mx-auto">
            {query ? "Nessun risultato corrisponde alla tua ricerca." : "Inizia aggiungendo il tuo primo cliente al database."}
          </p>
          {!query && (
            <button onClick={openNewCustomerModal} className="h-9 px-4 rounded-lg bg-primary/20 text-primary text-sm font-medium hover:bg-primary/30 transition">
              Aggiungi Cliente
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c) => (
            <div
              key={c.id}
              onClick={() => handleSelectCustomer(c)}
              className="group cursor-pointer rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 hover:border-primary/50 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/20 text-primary">
                  <Building2 className="h-6 w-6" />
                </div>
                <ChevronRight className="h-5 w-5 text-white/20 group-hover:text-primary transition-colors" />
              </div>
              <h3 className="font-semibold text-lg text-white mb-1 truncate">{c.displayName}</h3>
              <div className="space-y-1.5 mt-4">
                {c.email && (
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <Mail className="h-3.5 w-3.5" /> <span className="truncate">{c.email}</span>
                  </div>
                )}
                {c.phoneNumber && (
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <Phone className="h-3.5 w-3.5" /> {c.phoneNumber}
                  </div>
                )}
                {!c.email && !c.phoneNumber && (
                  <div className="text-xs text-white/30 italic">Nessun contatto registrato</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Cliente */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="font-semibold text-lg text-white">
                {isEditingCustomer ? "Modifica Cliente" : "Nuovo Cliente"}
              </h3>
              <button onClick={() => setShowCustomerModal(false)} className="text-white/50 hover:text-white">✕</button>
            </div>
            <form onSubmit={submitCustomer} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-white/70">Nome Visualizzato *</label>
                <input
                  required
                  value={cForm.displayName}
                  onChange={(e) => setCForm({ ...cForm, displayName: e.target.value })}
                  placeholder="Es. Mario Rossi"
                  className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none transition"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-white/70">Ragione Sociale (Opzionale)</label>
                <input
                  value={cForm.legalName}
                  onChange={(e) => setCForm({ ...cForm, legalName: e.target.value })}
                  placeholder="Es. Rossi Impianti Srl"
                  className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-white/70">Partita IVA</label>
                  <input
                    value={cForm.vatNumber}
                    onChange={(e) => setCForm({ ...cForm, vatNumber: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none transition"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-white/70">Telefono</label>
                  <input
                    value={cForm.phoneNumber}
                    onChange={(e) => setCForm({ ...cForm, phoneNumber: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none transition"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-white/70">Email</label>
                <input
                  type="email"
                  value={cForm.email}
                  onChange={(e) => setCForm({ ...cForm, email: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-primary focus:outline-none transition"
                />
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="px-4 py-2 text-sm text-white/70 hover:text-white"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={submittingCustomer}
                  className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {submittingCustomer ? "Salvataggio..." : "Salva"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
