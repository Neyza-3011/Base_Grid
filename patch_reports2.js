const fs = require('fs');
let code = fs.readFileSync('server/routes/reports.ts', 'utf8');
const searchString = `reportsRouter.get("/:id/pdf", async (req: any, res: any): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.send(Buffer.from("%PDF-1.4 Mock BaseGrid PDF Document"));
});`;

const replaceString = `reportsRouter.get("/:id/pdf", async (req: any, res: any): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ detail: "Non autenticato." });
    return;
  }
  const reportId = req.params.id;
  const report = await db.getReportById(req.user.companyId, reportId);
  if (!report) {
    res.status(404).json({ detail: "Rapportino non trovato o non accessibile." });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.send(Buffer.from("%PDF-1.4 Mock BaseGrid PDF Document per Rapportino " + reportId));
});`;

code = code.replace(searchString, replaceString);
fs.writeFileSync('server/routes/reports.ts', code);
