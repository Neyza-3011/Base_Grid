import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { reportsService } from "../services";
import { asyncHandler } from "../async-handler";
import { ValidationError, UnauthorizedError } from "../errors";

export const reportsRouter = Router();
reportsRouter.use(authenticate);

function isValidId(id: any): boolean {
  return typeof id === "string" && id.trim().length > 0 && id.trim().length <= 100;
}

/**
 * GET /api/v1/reports
 * Returns reports strictly belonging to the authenticated user's company.
 */
reportsRouter.get(
  "/",
  asyncHandler(async (req: any, res: any): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError("Non autenticato.");
    }
    const responseData = await reportsService.listReports(req.user.companyId, req.query.limit);
    res.status(200).json(responseData);
  })
);

/**
 * POST /api/v1/reports
 * Creates a report linked strictly to the user's company.
 */
reportsRouter.post(
  "/",
  asyncHandler(async (req: any, res: any): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError("Non autenticato.");
    }
    const responseData = await reportsService.createReport(
      req.user.companyId,
      req.user.fullName || "Tecnico",
      req.body
    );
    res.status(201).json(responseData);
  })
);

/**
 * DELETE /api/v1/reports/:id
 * Deletes a report strictly if it belongs to the user's company.
 */
reportsRouter.delete(
  "/:id",
  asyncHandler(async (req: any, res: any): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError("Non autenticato.");
    }
    const reportId = req.params.id;
    if (!isValidId(reportId)) {
      throw new ValidationError("ID non valido.");
    }
    await reportsService.deleteReport(req.user.companyId, reportId);
    res.status(200).json({ message: "Rapportino eliminato con successo." });
  })
);

/**
 * GET /api/v1/reports/:id/pdf
 * Generates/returns PDF preview info
 */
reportsRouter.get(
  "/:id/pdf",
  asyncHandler(async (req: any, res: any): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError("Non autenticato.");
    }
    const reportId = req.params.id;
    if (!isValidId(reportId)) {
      throw new ValidationError("ID non valido.");
    }
    const report = await reportsService.getReportById(req.user.companyId, reportId);
    res.setHeader("Content-Type", "application/pdf");
    res.send(Buffer.from("%PDF-1.4 Mock BaseGrid PDF Document per Rapportino " + report.id));
  })
);
