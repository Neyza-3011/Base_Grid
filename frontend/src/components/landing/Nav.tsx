import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, X, User as UserIcon, Settings, LogOut } from "lucide-react";
import { BaseGridLogo } from "@/components/common/BaseGridLogo";
import { fetchServerSession, logoutUser, UserSession } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const links = [
  { href: "#funzionalita", label: "Funzionalità" },
  { href: "#come-funziona", label: "Come Funziona" },
  { href: "#prezzi", label: "Prezzi" },
  { href: "#supporto", label: "Supporto" },
];

export function Nav({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    fetchServerSession().then(setCurrentUser);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    toast.info("Sessione terminata. Arrivederci!");
    navigate({ to: "/" });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "backdrop-blur-xl bg-[oklch(0.15_0.02_260/0.75)] border-b border-white/5"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="#top" className="flex items-center gap-2 text-white">
            <BaseGridLogo textClassName="text-[15px] font-semibold tracking-tight text-white" />
          </a>

          <nav className="hidden lg:flex items-center gap-8">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-white/70 hover:text-white transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2">
            {currentUser ? (
              <div className="flex items-center gap-4">
                <Link
                  to="/dashboard"
                  className="text-sm font-medium text-white/90 hover:text-white transition-colors"
                >
                  Vai alla Dashboard
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 hover:bg-white/10 p-1 rounded-full outline-none transition-colors">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white border border-white/10">
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
                      onClick={() => navigate({ to: "/dashboard" })}
                    >
                      <UserIcon className="mr-2 h-4 w-4" />
                      <span>Profilo</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => navigate({ to: "/dashboard" })}
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
              </div>
            ) : (
              <>
                <button
                  onClick={onLogin}
                  className="px-4 h-9 rounded-full text-sm text-white/80 hover:text-white hover:bg-white/5 transition"
                >
                  Accedi
                </button>
                <button
                  onClick={onSignup}
                  className="px-4 h-9 rounded-full text-sm font-medium bg-primary text-white hover:bg-primary/90 active:scale-95 transition btn-glow"
                >
                  Prova Gratis 30 Giorni
                </button>
              </>
            )}
          </div>

          <button
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden grid h-10 w-10 place-items-center rounded-lg text-white hover:bg-white/5 active:scale-95 transition"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-40 transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute inset-x-0 top-16 mx-3 rounded-2xl glass-dark p-4 transition-all duration-300 ${
            open ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
          }`}
        >
          <nav className="flex flex-col">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="min-h-12 flex items-center px-3 rounded-lg text-base text-white/90 hover:bg-white/5"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
            {currentUser ? (
              <>
                <Link
                  to="/dashboard"
                  onClick={() => setOpen(false)}
                  className="h-12 flex items-center justify-center rounded-xl text-sm font-medium bg-primary text-white btn-glow active:scale-95"
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => {
                    setOpen(false);
                    handleLogout();
                  }}
                  className="h-12 rounded-xl text-sm font-medium text-white bg-white/5 hover:bg-white/10 border border-white/10"
                >
                  Esci
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setOpen(false);
                    onLogin();
                  }}
                  className="h-12 rounded-xl text-sm font-medium text-white bg-white/5 hover:bg-white/10 border border-white/10"
                >
                  Accedi
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    onSignup();
                  }}
                  className="h-12 rounded-xl text-sm font-medium bg-primary text-white btn-glow active:scale-95"
                >
                  Prova Gratis
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
