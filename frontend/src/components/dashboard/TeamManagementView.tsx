import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Users,
  Search,
  Plus,
  Shield,
  UserCheck,
  UserX,
  Mail,
  Edit2,
  Copy,
  Clock,
  Briefcase,
  AlertCircle,
  RefreshCw,
  MoreVertical,
  Key,
} from "lucide-react";
import {
  fetchTeamMembers,
  createTeamMember,
  updateTeamMember,
  activateTeamMember,
  deactivateTeamMember,
  TeamMember,
  CreateTeamMemberInput,
} from "@/lib/api/team";
import { UserRole } from "../../../server/types";

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: "Super Admin",
  owner: "Titolare",
  admin: "Amministratore",
  responsabile_tecnico: "Resp. Tecnico",
  dispatcher: "Pianificatore",
  technician: "Tecnico",
  amministrazione: "Amministrazione",
  commerciale: "Commerciale",
  cliente: "Cliente",
};

const ROLE_COLORS: Record<UserRole, string> = {
  superadmin: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  owner: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  admin: "text-red-400 bg-red-500/10 border-red-500/20",
  responsabile_tecnico: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  dispatcher: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  technician: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  amministrazione: "text-pink-400 bg-pink-500/10 border-pink-500/20",
  commerciale: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  cliente: "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

export function TeamManagementView({
  currentUser,
}: {
  currentUser: { id: string; role: string; [key: string]: unknown };
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("Tutti");

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    member: TeamMember;
    inviteToken: string;
  } | null>(null);

  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  const [formData, setFormData] = useState<CreateTeamMemberInput>({
    email: "",
    fullName: "",
    role: "technician",
    phoneNumber: "",
  });

  const [submitting, setSubmitting] = useState(false);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTeamMembers();
      setMembers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Impossibile caricare il team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await createTeamMember(formData);
      setInviteResult(result);
      toast.success("Membro invitato con successo!");
      loadTeam();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore durante l'invito.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setSubmitting(true);
    try {
      await updateTeamMember(editingMember.id, {
        fullName: formData.fullName,
        role: formData.role,
        phoneNumber: formData.phoneNumber,
      });
      toast.success("Profilo aggiornato con successo!");
      setEditingMember(null);
      loadTeam();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore durante l'aggiornamento.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (member: TeamMember) => {
    try {
      if (member.isActive) {
        await deactivateTeamMember(member.id);
        toast.success("Membro disattivato.");
      } else {
        await activateTeamMember(member.id);
        toast.success("Membro attivato.");
      }
      loadTeam();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore durante la modifica dello stato.");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Link copiato negli appunti!");
  };

  const openInviteModal = () => {
    setFormData({ email: "", fullName: "", role: "technician", phoneNumber: "" });
    setInviteResult(null);
    setShowInviteModal(true);
  };

  const openEditModal = (member: TeamMember) => {
    setFormData({
      email: member.email,
      fullName: member.fullName,
      role: member.role,
      phoneNumber: member.phoneNumber || "",
    });
    setEditingMember(member);
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.fullName.toLowerCase().includes(query.toLowerCase()) ||
      m.email.toLowerCase().includes(query.toLowerCase());

    if (!matchesSearch) return false;
    if (activeFilter === "Attivi") return m.isActive;
    if (activeFilter === "Disattivati") return !m.isActive;
    if (activeFilter === "In Attesa") return !m.emailConfirmed;
    return true;
  });

  return (
    <div className="space-y-6 text-white pb-8">
      {/* Header */}
      <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-400" />
            Gestione Collaboratori
          </h1>
          <p className="text-sm text-white/60 mt-1">
            Gestisci i membri del tuo team, i ruoli e gli accessi al sistema.
          </p>
        </div>
        <button
          onClick={openInviteModal}
          className="h-10 px-4 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-primary/20"
        >
          <Plus className="h-4 w-4" />
          Nuovo Membro
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
          <button
            onClick={loadTeam}
            className="h-8 px-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs font-semibold text-red-200 flex items-center gap-1.5 transition active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Riprova
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
          <input
            type="text"
            placeholder="Cerca per nome o email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-10 bg-slate-900/60 border border-white/10 rounded-xl pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
          />
        </div>

        <div className="flex bg-slate-900/60 border border-white/10 rounded-xl p-1 w-full sm:w-auto overflow-x-auto">
          {["Tutti", "Attivi", "Disattivati", "In Attesa"].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                activeFilter === filter
                  ? "bg-primary text-white shadow-sm"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-6 py-4 text-xs font-semibold text-white/60">Utente</th>
                <th className="px-6 py-4 text-xs font-semibold text-white/60">Ruolo</th>
                <th className="px-6 py-4 text-xs font-semibold text-white/60">Stato</th>
                <th className="px-6 py-4 text-xs font-semibold text-white/60 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-white/40 text-sm">
                    Caricamento collaboratori...
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-white/40 text-sm">
                    Nessun collaboratore trovato.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-sm text-white/80 shrink-0">
                          {member.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{member.fullName}</div>
                          <div className="text-xs text-white/50">{member.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${ROLE_COLORS[member.role] || ROLE_COLORS.technician}`}
                      >
                        {ROLE_LABELS[member.role] || member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${member.isActive ? "text-emerald-400" : "text-red-400"}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${member.isActive ? "bg-emerald-400" : "bg-red-400"}`}
                          ></span>
                          {member.isActive ? "Attivo" : "Disattivato"}
                        </span>
                        {!member.emailConfirmed && (
                          <span className="text-[10px] text-amber-400/80 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Invito in attesa
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEditModal(member)}
                          className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          title="Modifica"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {member.id !== currentUser.id && (
                          <button
                            onClick={() => handleToggleStatus(member)}
                            className={`p-2 rounded-lg transition-colors ${
                              member.isActive
                                ? "text-red-400/70 hover:text-red-400 hover:bg-red-400/10"
                                : "text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-400/10"
                            }`}
                            title={member.isActive ? "Disattiva" : "Attiva"}
                          >
                            {member.isActive ? (
                              <UserX className="h-4 w-4" />
                            ) : (
                              <UserCheck className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite / Edit Modal */}
      {(showInviteModal || editingMember) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
              <h3 className="font-semibold text-lg text-white">
                {editingMember ? "Modifica Collaboratore" : "Invita Nuovo Collaboratore"}
              </h3>
            </div>

            <div className="p-6">
              {inviteResult ? (
                <div className="space-y-4 text-center">
                  <div className="mx-auto w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-4">
                    <Mail className="h-6 w-6" />
                  </div>
                  <h4 className="text-white font-medium text-lg">Invito generato!</h4>
                  <p className="text-sm text-white/70">
                    Copia il link seguente e invialo a{" "}
                    <strong>{inviteResult.member.fullName}</strong>.
                    <br />
                    Questo link permetterà all'utente di impostare la propria password.
                  </p>
                  <div className="mt-4 p-3 bg-slate-950 border border-white/10 rounded-xl flex items-center gap-2">
                    <input
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : "https://app.basegrid.io"}/accept-invite?token=${inviteResult.inviteToken}`}
                      className="bg-transparent border-none text-xs text-emerald-400 w-full focus:outline-none"
                    />
                    <button
                      onClick={() =>
                        copyToClipboard(
                          `${typeof window !== "undefined" ? window.location.origin : "https://app.basegrid.io"}/accept-invite?token=${inviteResult.inviteToken}`,
                        )
                      }
                      className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => setShowInviteModal(false)}
                    className="w-full mt-4 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition"
                  >
                    Chiudi
                  </button>
                </div>
              ) : (
                <form onSubmit={editingMember ? handleUpdate : handleInvite} className="space-y-4">
                  {!editingMember && (
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1.5">
                        Indirizzo Email
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full h-10 bg-slate-950 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-blue-500"
                        placeholder="mario.rossi@azienda.it"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full h-10 bg-slate-950 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-blue-500"
                      placeholder="Mario Rossi"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">
                      Telefono (Opzionale)
                    </label>
                    <input
                      type="tel"
                      value={formData.phoneNumber || ""}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      className="w-full h-10 bg-slate-950 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-blue-500"
                      placeholder="+39 333..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">
                      Ruolo nel sistema
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) =>
                        setFormData({ ...formData, role: e.target.value as UserRole })
                      }
                      className="w-full h-10 bg-slate-950 border border-white/10 rounded-xl px-3 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none"
                    >
                      <option value="owner">Titolare (Owner)</option>
                      <option value="admin">Amministratore</option>
                      <option value="responsabile_tecnico">Responsabile Tecnico</option>
                      <option value="dispatcher">Pianificatore</option>
                      <option value="technician">Tecnico / Operatore</option>
                      <option value="amministrazione">Amministrazione</option>
                      <option value="commerciale">Commerciale</option>
                    </select>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowInviteModal(false);
                        setEditingMember(null);
                      }}
                      className="flex-1 h-10 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition"
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 h-10 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition flex items-center justify-center disabled:opacity-50"
                    >
                      {submitting ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : editingMember ? (
                        "Salva Modifiche"
                      ) : (
                        "Genera Invito"
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
