const fs = require('fs');
let code = fs.readFileSync('server/db-postgres.ts', 'utf8');
code = code.replace(
  "public async deleteReport(companyId: string, reportId: string): Promise<boolean> {",
  "public async getReportById(companyId: string, reportId: string): Promise<ReportRecord | null> {\n    const res = await pool.query(\n      `SELECT id, company_id, date, time, work_hours, travel_hours, status, \n              client_name, client_address, technician_name, materials_used, notes, \n              created_at\n       FROM reports\n       WHERE id = $1 AND company_id = $2`,\n      [reportId, companyId]\n    );\n    if (res.rows.length === 0) return null;\n    const r = res.rows[0];\n    return {\n      id: r.id,\n      companyId: r.company_id,\n      date: r.date,\n      time: r.time,\n      workHours: Number(r.work_hours),\n      travelHours: Number(r.travel_hours),\n      status: r.status,\n      client: {\n        name: r.client_name,\n        address: r.client_address,\n      },\n      technician: {\n        fullName: r.technician_name,\n      },\n      materialsUsed: Array.isArray(r.materials_used) ? r.materials_used : [],\n      notes: r.notes,\n      createdAt: r.created_at.toISOString(),\n    } as ReportRecord;\n  }\n\n  public async deleteReport(companyId: string, reportId: string): Promise<boolean> {"
);
fs.writeFileSync('server/db-postgres.ts', code);
