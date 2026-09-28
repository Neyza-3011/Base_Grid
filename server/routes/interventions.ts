import { Router, Request, Response } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { db } from "../db";
import { asyncHandler } from "../async-handler";
import { InterventionService } from "../services/intervention.service";
import {
  CreateInterventionInput,
  InterventionRecord,
  InterventionResponse,
  TransitionInterventionInput,
  UpdateInterventionInput,
  UserRole,
} from "../types";

export const interventionsRouter = Router();
const interventionService = new InterventionService(db);

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

const WRITE_ROLES: UserRole[] = [
  "owner",
  "admin",
  "responsabile_tecnico",
  "dispatcher",
  "commerciale",
  "amministrazione",
  "superadmin",
];

/**
 * Format InterventionRecord to InterventionResponse (removing internal companyId)
 */
function toInterventionResponse(record: InterventionRecord): InterventionResponse {
  const { companyId, ...rest } = record;
  return rest;
}

/**
 * GET /api/v1/interventions
 * Lists interventions for the authenticated company with filters and cursor pagination
 */
interventionsRouter.get(
  "/",
  authenticate,
  requireRole(READ_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const priority = req.query.priority as string | undefined;
    const technicianId = req.query.technicianId as string | undefined;
    const customerId = req.query.customerId as string | undefined;
    const locationId = req.query.locationId as string | undefined;
    const assetId = req.query.assetId as string | undefined;
    const scheduledStartFrom = (req.query.scheduledStartFrom || req.query.scheduledStart) as string | undefined;
    const scheduledStartTo = (req.query.scheduledStartTo || req.query.scheduledEnd) as string | undefined;
    const cursor = req.query.cursor as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const result = await interventionService.getInterventions(req.user.companyId, {
      search,
      status,
      priority,
      technicianId,
      customerId,
      locationId,
      assetId,
      scheduledStartFrom,
      scheduledStartTo,
      limit,
      cursor,
    });

    res.status(200).json(result);
  })
);

/**
 * POST /api/v1/interventions
 * Creates a new intervention in status 'nuovo'
 */
interventionsRouter.post(
  "/",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: CreateInterventionInput = req.body;
    const created = await interventionService.createIntervention(
      req.user.companyId,
      req.user.id,
      input
    );

    res.status(201).json(toInterventionResponse(created));
  })
);

/**
 * GET /api/v1/interventions/:id
 * Returns a specific intervention by ID
 */
interventionsRouter.get(
  "/:id",
  authenticate,
  requireRole(READ_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const intervention = await interventionService.getInterventionById(
      req.user.companyId,
      req.params.id
    );

    res.status(200).json(intervention);
  })
);

/**
 * PUT /api/v1/interventions/:id
 * Updates intervention fields (client cannot change status directly)
 */
interventionsRouter.put(
  "/:id",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: UpdateInterventionInput = req.body;
    const updated = await interventionService.updateIntervention(
      req.user.companyId,
      req.user.id,
      req.params.id,
      input
    );

    res.status(200).json(toInterventionResponse(updated));
  })
);

/**
 * POST /api/v1/interventions/:id/transition
 * Executes a controlled server-side status transition
 */
interventionsRouter.post(
  "/:id/transition",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: TransitionInterventionInput = req.body;
    const transitioned = await interventionService.transitionStatus(
      req.user.companyId,
      req.user.id,
      req.params.id,
      input
    );

    res.status(200).json(toInterventionResponse(transitioned));
  })
);
