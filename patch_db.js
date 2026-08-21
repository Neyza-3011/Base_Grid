const fs = require('fs');
let code = fs.readFileSync('server/db.ts', 'utf8');
code = code.replace(
  "public async deleteReport(companyId: string, reportId: string): Promise<boolean> {",
  "public async getReportById(companyId: string, reportId: string): Promise<ReportRecord | null> {\n    const report = this.reports.get(reportId);\n    if (!report || report.companyId !== companyId) {\n      return null;\n    }\n    return report;\n  }\n\n  public async deleteReport(companyId: string, reportId: string): Promise<boolean> {"
);
fs.writeFileSync('server/db.ts', code);
