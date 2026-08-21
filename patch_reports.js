const fs = require('fs');
let code = fs.readFileSync('server/routes/reports.ts', 'utf8');
code = code.replace(
  "reportsRouter.get(\"/:id/pdf\", async (req: any, res: any): void => {\n  if (!req.user) {\n    res.status(401).json({ detail: \"Non autenticato.\" });\n    return;\n  }\n  res.setHeader(\"Content-Type\", \"application/pdf\");\n  res.send(Buffer.from(\"%PDF-1.4 Mock BaseGrid PDF Document\"));\n});",
  "reportsRouter.get(\"/:id/pdf\", async (req: any, res: any): void => {\n  if (!req.user) {\n    res.status(401).json({ detail: \"Non autenticato.\" });\n    return;\n  }\n  const reportId = req.params.id;\n  const report = await db.getReportById(req.user.companyId, reportId);\n  if (!report) {\n    res.status(404).json({ detail: \"Rapportino non trovato o non accessibile.\" });\n    return;\n  }\n  res.setHeader(\"Content-Type\", \"application/pdf\");\n  res.send(Buffer.from(\"%PDF-1.4 Mock BaseGrid PDF Document per Rapportino \" + reportId));\n});"
);
fs.writeFileSync('server/routes/reports.ts', code);
