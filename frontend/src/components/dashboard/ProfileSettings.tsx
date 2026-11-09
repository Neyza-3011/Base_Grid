import { appendCsrfHeaders } from "../../lib/auth";
import { buildProfileUpdatePayload } from "../../lib/profile-form";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserSession, logoutUser } from "@/lib/auth";
import { User, Mail, Shield, Save, LogOut, Phone, Bell, Camera, CheckCircle } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export function ProfileSettings({
  currentUser,
  onUpdate,
  onSessionInvalidated,
  onClose,
}: {
  currentUser: UserSession;
  onUpdate: (user: UserSession) => void;
  onSessionInvalidated: () => void;
  onClose?: () => void;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [formData, setFormData] = useState({
    fullName: currentUser.fullName || "",
    email: currentUser.email || "",
    phone: currentUser.phoneNumber || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/users/me", {
      credentials: "include",
      headers: appendCsrfHeaders({ Accept: "application/json" }),
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((user) => {
        if (active && typeof user?.avatarDataUrl === "string") setAvatarPreview(user.avatarDataUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "Super Admin / Titolare";
      case "OFFICE":
        return "Gestore Ufficio";
      case "TECHNICIAN":
        return "Tecnico Operativo";
      default:
        return role;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Seleziona un'immagine PNG o JPEG.");
      e.target.value = "";
      return;
    }
    if (file.size === 0 || file.size > 256 * 1024) {
      toast.error("La foto deve avere dimensioni massime di 256 KB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        toast.error("Impossibile leggere il file selezionato.");
        return;
      }
      setAvatarPreview(reader.result);
      setAvatarChanged(true);
      toast.info("Foto pronta. Salva il profilo per renderla permanente.");
    };
    reader.onerror = () => toast.error("Impossibile leggere il file selezionato.");
    reader.readAsDataURL(file);
  };

  const handleLogout = async () => {
    await logoutUser();
    toast.info("Sessione terminata. Arrivederci!");
    navigate({ to: "/" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      toast.error("Le nuove password non coincidono");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/users/me", {
        credentials: "include",
        method: "PUT",
        headers: appendCsrfHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          ...buildProfileUpdatePayload(formData),
          ...(avatarChanged ? { avatar_data_url: avatarPreview } : {}),
        }),
      });

      if (!res.ok) {
        const errData = await res
          .json()
          .catch(() => ({ detail: "Errore durante il salvataggio." }));
        toast.error(errData.detail || "Impossibile aggiornare il profilo.");
        if (
          res.status === 503 &&
          typeof errData.detail === "string" &&
          errData.detail.startsWith("Email aggiornata, ma non è stato possibile inviare")
        ) {
          onSessionInvalidated();
        }
        return;
      }

      const savedUser = await res.json();
      if (typeof savedUser.email === "string" && savedUser.email !== currentUser.email) {
        toast.info("Email aggiornata. Accedi di nuovo e completa la verifica del nuovo indirizzo.");
        onSessionInvalidated();
        return;
      }

      const updatedSession: UserSession = {
        ...currentUser,
        fullName: savedUser.fullName || formData.fullName,
        email: savedUser.email || formData.email,
        phoneNumber:
          typeof savedUser.phoneNumber === "string" ? savedUser.phoneNumber : formData.phone.trim(),
      };

      onUpdate(updatedSession);
      if (avatarChanged) {
        setAvatarChanged(false);
        setAvatarPreview(
          typeof savedUser.avatarDataUrl === "string" ? savedUser.avatarDataUrl : null,
        );
      }
      toast.success("Modifiche salvate con successo!");

      if (onClose) {
        onClose();
      } else {
        navigate({ to: "/dashboard" });
      }
    } catch {
      toast.error("Errore di connessione con il server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl w-full mx-auto space-y-6 text-white">
      {/* Header Profile Card */}
      <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="relative group">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/30 to-emerald-500/30 border border-white/20 flex items-center justify-center text-2xl font-bold text-white shadow-inner overflow-hidden">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                getInitials(formData.fullName || "Utente")
              )}
            </div>
            <label className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-lg bg-primary text-white cursor-pointer hover:bg-primary/90 transition-all shadow-md active:scale-95">
              <Camera className="h-3.5 w-3.5" />
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </label>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold text-white">{formData.fullName}</h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle className="h-3 w-3 mr-1" />
                Attivo
              </span>
            </div>
            <p className="text-white/60 text-sm mt-0.5">{formData.email}</p>
            <div className="mt-2 inline-block px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-medium text-primary">
              Ruolo: {getRoleLabel(currentUser.role)}
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="h-10 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm font-medium transition-all active:scale-95 flex items-center gap-2 self-stretch sm:self-auto justify-center"
        >
          <LogOut className="h-4 w-4" /> Esci (Logout)
        </button>
      </div>

      {/* Main Profile Form */}
      <div className="p-6 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Anagrafica Personale */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 pb-2 border-b border-white/10 flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Informazioni Personali
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <input
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">
                  Indirizzo Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">
                  Telefono Diretto
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sicurezza & Password */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 pb-2 border-b border-white/10 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Sicurezza & Credenziali
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1.5">
                  Password Attuale
                </label>
                <input
                  type="password"
                  name="currentPassword"
                  value={formData.currentPassword}
                  onChange={handleChange}
                  placeholder="Inserisci la password attuale per autorizzare modifiche di sicurezza"
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">
                  Nuova Password
                </label>
                <input
                  type="password"
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleChange}
                  placeholder="Minimo 8 caratteri"
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1.5">
                  Conferma Nuova Password
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Ripeti la nuova password"
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Preferenze Notifiche Personali */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 pb-2 border-b border-white/10 flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" /> Notifiche Personali
            </h3>
            <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <p role="status" className="text-sm text-white/60">
                {
                  "Le preferenze di notifica non sono ancora configurabili. Questa schermata non salva né attiva notifiche."
                }
              </p>
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
                  <Save className="h-4 w-4" /> Salva Modifiche Profilo
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
