import { appendCsrfHeaders } from "./auth";
export type MaterialItem = {
  name: string;
  quantity: number;
};

export type Report = {
  id: string;
  date: string; // e.g. "27/07/2026"
  time: string; // e.g. "18:30"
  dateTimeFormatted: string; // e.g. "27/07/2026 18:30"
  work_hours: number;
  travel_hours?: number;
  status: "draft" | "submitted" | "approved";
  client: {
    name: string;
    address?: string;
    city?: string;
  };
  technician: {
    full_name: string;
  };
  materials_used: MaterialItem[];
  notes?: string;
  signature_base64?: string;
  created_at?: string;
};

const REPORTS_LOCAL_KEY = "basegrid_reports_v1";

export const INITIAL_SEED_REPORTS: Report[] = [
  {
    id: "REP-2026-001",
    date: "27/07/2026",
    time: "18:30",
    dateTimeFormatted: "27/07/2026 18:30",
    work_hours: 4.5,
    travel_hours: 1.0,
    status: "approved",
    client: {
      name: "Rossi Impianti Srl",
      address: "Via Milano 12, Milano",
      city: "Milano",
    },
    technician: { full_name: "Marco Rossi" },
    materials_used: [
      { name: "Cavo FG16 3x2.5", quantity: 25 },
      { name: "Interruttore MT 25A", quantity: 2 },
    ],
    notes: "Installazione quadro principale completata con collaudo.",
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    id: "REP-2026-002",
    date: "27/07/2026",
    time: "14:15",
    dateTimeFormatted: "27/07/2026 14:15",
    work_hours: 3.0,
    travel_hours: 0.5,
    status: "submitted",
    client: {
      name: "Cantiere Impianti Verdi",
      address: "Corso Italia 88, Torino",
      city: "Torino",
    },
    technician: { full_name: "Luca Bianchi" },
    materials_used: [
      { name: "Presa Schuko IP55", quantity: 6 },
      { name: "Tubo corrugato Ø25", quantity: 15 },
    ],
    notes: "Posa tubazioni esterne e montaggio prese stagne.",
    created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  },
  {
    id: "REP-2026-003",
    date: "26/07/2026",
    time: "11:00",
    dateTimeFormatted: "26/07/2026 11:00",
    work_hours: 6.0,
    travel_hours: 1.5,
    status: "approved",
    client: {
      name: "Casa Bianchi Spa",
      address: "Via Roma 8, Bologna",
      city: "Bologna",
    },
    technician: { full_name: "Marco Rossi" },
    materials_used: [
      { name: "Faretto LED 12W", quantity: 12 },
      { name: "Centralina Domotica B2B", quantity: 1 },
    ],
    notes: "Sostituzione corpi illuminanti e cablaggio domotico.",
    created_at: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
  },
  {
    id: "REP-2026-004",
    date: "25/07/2026",
    time: "16:45",
    dateTimeFormatted: "25/07/2026 16:45",
    work_hours: 2.5,
    travel_hours: 0.5,
    status: "draft",
    client: {
      name: "Termo SpA Sede",
      address: "Via Garibaldi 45, Brescia",
      city: "Brescia",
    },
    technician: { full_name: "Giuseppe Verdi" },
    materials_used: [{ name: "Valvola termostatica ½", quantity: 4 }],
    notes: "Manutenzione preventiva impianto idraulico.",
    created_at: new Date(Date.now() - 50 * 3600 * 1000).toISOString(),
  },
  {
    id: "REP-2026-005",
    date: "24/07/2026",
    time: "09:20",
    dateTimeFormatted: "24/07/2026 09:20",
    work_hours: 5.0,
    travel_hours: 1.0,
    status: "approved",
    client: {
      name: "Elettro Rossi Uffici",
      address: "Via Dante 102, Verona",
      city: "Verona",
    },
    technician: { full_name: "Luca Bianchi" },
    materials_used: [
      { name: "Differenziale 40A 30mA", quantity: 1 },
      { name: "Morsettiere di terra", quantity: 10 },
    ],
    notes: "Ripristino salvavita e adeguamento impianto elettrico.",
    created_at: new Date(Date.now() - 74 * 3600 * 1000).toISOString(),
  },
  {
    id: "REP-2026-006",
    date: "23/07/2026",
    time: "15:10",
    dateTimeFormatted: "23/07/2026 15:10",
    work_hours: 7.5,
    travel_hours: 1.5,
    status: "submitted",
    client: {
      name: "Idro Bianchi Villa Sole",
      address: "Via Dei Pini 14, Bergamo",
      city: "Bergamo",
    },
    technician: { full_name: "Marco Rossi" },
    materials_used: [
      { name: "Pompa di calore 12kW", quantity: 1 },
      { name: "Raccordi rame Ø22", quantity: 8 },
    ],
    notes: "Installazione completa centrale termica e collaudo pressione.",
    created_at: new Date(Date.now() - 98 * 3600 * 1000).toISOString(),
  },
];

type ApiReportRecord = {
  id?: string;
  date?: string;
  time?: string;
  work_hours?: number;
  travel_hours?: number;
  status?: "draft" | "submitted" | "approved";
  client?: { name?: string; address?: string };
  technician?: { full_name?: string };
  materials_used?: MaterialItem[];
  notes?: string;
  created_at?: string;
};

// Read reports safely with fallbacks
export async function getReports(): Promise<Report[]> {
  // 1. Try local storage
  let localReports: Report[] = [];
  try {
    const raw = localStorage.getItem(REPORTS_LOCAL_KEY);
    if (raw) {
      localReports = JSON.parse(raw);
    }
  } catch {
    // Ignore JSON error
  }

  // If local storage is empty, initialize with seed reports
  if (!localReports || localReports.length === 0) {
    localReports = INITIAL_SEED_REPORTS;
    try {
      localStorage.setItem(REPORTS_LOCAL_KEY, JSON.stringify(localReports));
    } catch {
      // localStorage quota/access error
    }
  }

  // 2. Try fetching from backend API if available
  try {
    const res = await fetch("/api/v1/reports?limit=1000", {
      credentials: "include",
      headers: {},
    });
    if (res.ok) {
      const apiData = (await res.json()) as ApiReportRecord[];
      if (Array.isArray(apiData) && apiData.length > 0) {
        // Format API items to match unified Report interface
        const mapped: Report[] = apiData.map((item: ApiReportRecord) => {
          const rawDate = item.date || new Date().toISOString().split("T")[0];
          const d = new Date(rawDate);
          const dateStr = !isNaN(d.getTime())
            ? d.toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
            : rawDate;
          const timeStr = item.time || "10:00";
          return {
            id: item.id || `REP-${Math.floor(1000 + Math.random() * 9000)}`,
            date: dateStr,
            time: timeStr,
            dateTimeFormatted: `${dateStr} ${timeStr}`,
            work_hours: item.work_hours || 0,
            travel_hours: item.travel_hours || 0,
            status: item.status || "submitted",
            client: {
              name: item.client?.name || "Cliente Senza Nome",
              address: item.client?.address || "Indirizzo non specificato",
            },
            technician: {
              full_name: item.technician?.full_name || "Tecnico",
            },
            materials_used: item.materials_used || [],
            notes: item.notes || "",
            created_at: item.created_at || new Date().toISOString(),
          };
        });

        // Merge mapped API reports with unique local reports
        const apiIds = new Set(mapped.map((r) => r.id));
        const uniqueLocal = localReports.filter((r) => !apiIds.has(r.id));
        const merged = [...mapped, ...uniqueLocal];
        localStorage.setItem(REPORTS_LOCAL_KEY, JSON.stringify(merged));
        return merged;
      }
    }
  } catch {
    // API network exception fallback silently to local
  }

  return localReports;
}

export async function addReport(newReportData: {
  clientName: string;
  clientAddress?: string;
  technicianName?: string;
  hours: number;
  travelHours?: number;
  materials: { name: string; quantity: number }[];
  status?: "draft" | "submitted" | "approved";
  notes?: string;
  date?: string;
  time?: string;
}): Promise<Report> {
  const now = new Date();
  const dateStr =
    newReportData.date ||
    now.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr =
    newReportData.time || now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  const createdReport: Report = {
    id: `REP-2026-${Math.floor(100 + Math.random() * 900)}`,
    date: dateStr,
    time: timeStr,
    dateTimeFormatted: `${dateStr} ${timeStr}`,
    work_hours: newReportData.hours,
    travel_hours: newReportData.travelHours || 0,
    status: newReportData.status || "submitted",
    client: {
      name: newReportData.clientName,
      address: newReportData.clientAddress || "Cantiere Sede",
    },
    technician: {
      full_name: newReportData.technicianName || "Tecnico Operativo",
    },
    materials_used: newReportData.materials || [],
    notes: newReportData.notes || "",
    created_at: now.toISOString(),
  };

  // Save to LocalStorage first (guarantee instant persistence)
  const current = await getReports();
  const updated = [createdReport, ...current];
  try {
    localStorage.setItem(REPORTS_LOCAL_KEY, JSON.stringify(updated));
  } catch {
    // Ignore quota error
  }

  // Send POST to backend API with HttpOnly session cookie
  try {
    await fetch("/api/v1/reports", {
      method: "POST",
      credentials: "include",
      headers: appendCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        client_name: newReportData.clientName,
        work_hours: newReportData.hours,
        date: now.toISOString().split("T")[0],
        notes: newReportData.notes,
        materials_used: newReportData.materials,
        status: newReportData.status || "submitted",
      }),
    }).catch(() => {});
  } catch {
    // Silently handle backend failure
  }

  return createdReport;
}

export async function removeReport(reportId: string): Promise<boolean> {
  const current = await getReports();
  const updated = current.filter((r) => r.id !== reportId);
  try {
    localStorage.setItem(REPORTS_LOCAL_KEY, JSON.stringify(updated));
  } catch {
    // Ignore error
  }

  // Attempt backend delete
  try {
    await fetch(`/api/v1/reports/${reportId}`, {
      method: "DELETE",
      credentials: "include",
      headers: appendCsrfHeaders(),
    }).catch(() => {});
  } catch {
    // Ignore error
  }

  return true;
}
