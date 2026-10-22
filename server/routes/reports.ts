import { Router, Request, Response } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { reportsService } from "../services";
import { asyncHandler } from "../async-handler";
import { ValidationError, UnauthorizedError, ForbiddenError } from "../errors";
import { UserRole } from "../types";
import { generateReportPdf } from "../services/report-pdf";

export const reportsRouter = Router();

const READ_ROLES: UserRole[] = [
  "owner",
  "admin",
  "responsabile_tecnico",
  "dispatcher",
  "technician",
  "commerciale",
  "amministrazione",
  "superadmin",
];

const CREATE_ROLES: UserRole[] = [
  "owner",
  "admin",
  "responsabile_tecnico",
  "dispatcher",
  "commerciale",
  "amministrazione",
  "superadmin",
];

const DELETE_ROLES: UserRole[] = [
  "owner",
  "admin",
  "superadmin",
];

function isValidId(id: any): boolean {
  return typeof id === "string" && id.trim().length > 0 && id.trim().length <= 100;
}

/**
 * GET /api/v1/reports
 * Returns reports strictly belonging to the authenticated user's company.
 */
reportsRouter.get(
  "/",
  authenticate,
  requireRole(READ_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      throw new UnauthorizedError("Non autenticato.");
    }
    const responseData = await reportsService.listReports(req.user.companyId, req.query.limit as any);
    res.status(200).json(responseData);
  })
);

/**
 * POST /api/v1/reports
 * Creates a report linked strictly to the user's company.
 */
reportsRouter.post(
  "/",
  authenticate,
  requireRole(CREATE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
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
 * GET /api/v1/reports/:id/pdf
 * Generates a valid PDF document for a report belonging to the authenticated company.
 */
reportsRouter.get(
  "/:id/pdf",
  authenticate,
  requireRole(READ_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      throw new UnauthorizedError("Non autenticato.");
    }
    if (req.company?.featurePdfExport === false) {
      throw new ForbiddenError("L'esportazione PDF non è inclusa nelle funzionalità abilitate per questa azienda.");
    }
    const reportId = req.params.id;
    if (!isValidId(reportId)) {
      throw new ValidationError("ID non valido.");
    }
    const report = await reportsService.getReportById(req.user.companyId, reportId);
    const pdf = await generateReportPdf(report);
    const safeFilenameId = report.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="rapportino-${safeFilenameId}.pdf"`);
    res.setHeader("Content-Length", String(pdf.length));
    res.send(pdf);
  })
);

/**
 * GET /api/v1/reports/:id
 * Returns a specific report strictly belonging to the user's company.
 */
reportsRouter.get(
  "/:id",
  authenticate,
  requireRole(READ_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      throw new UnauthorizedError("Non autenticato.");
    }
    const reportId = req.params.id;
    if (!isValidId(reportId)) {
      throw new ValidationError("ID non valido.");
    }
    const report = await reportsService.getReportById(req.user.companyId, reportId);
    // Keep internal tenant identifiers and raw signature image data out of the general API response.
    res.status(200).json({
      id: report.id,
      customerId: report.customerId,
      locationId: report.locationId,
      locationName: report.locationName,
      interventionId: report.interventionId,
      date: report.date,
      time: report.time,
      workHours: report.workHours,
      travelHours: report.travelHours,
      status: report.status,
      client: report.client,
      technician: report.technician,
      materialsStatus: report.materialsStatus || "unverified",
      materialsUsed: report.materialsUsed,
      notes: report.notes,
      createdAt: report.createdAt,
    });
  })
);

/**
 * DELETE /api/v1/reports/:id
 * Deletes a report strictly if it belongs to the user's company.
 */
reportsRouter.delete(
  "/:id",
  authenticate,
  requireRole(DELETE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      throw new UnauthorizedError("Non autenticato.");
    }
    const reportId = req.params.id;
    if (!isValidId(reportId)) {
      throw new ValidationError("ID non valido.");
    }
    await reportsService.deleteReport(req.user.companyId, reportId, req.user.id);
    res.status(200).json({ message: "Rapportino eliminato con successo." });
  })
);
