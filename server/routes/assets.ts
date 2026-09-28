import { Router, Request, Response } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { db } from "../db";
import { asyncHandler } from "../async-handler";
import { AssetService } from "../services/asset.service";
import {
  AssetRecord,
  AssetResponse,
  AssetStatus,
  AssetType,
  CreateAssetInput,
  UpdateAssetInput,
  UserRole,
} from "../types";

export const assetsRouter = Router();
const assetService = new AssetService(db);

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
 * Format AssetRecord to AssetResponse (removing internal companyId)
 */
function toAssetResponse(record: AssetRecord): AssetResponse {
  const { companyId, ...rest } = record;
  return rest;
}

/**
 * GET /api/v1/assets
 * Lists assets for the authenticated company with optional filters
 */
assetsRouter.get(
  "/",
  authenticate,
  requireRole(READ_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const search = req.query.search as string | undefined;
    const customerId = req.query.customerId as string | undefined;
    const locationId = req.query.locationId as string | undefined;
    const assetType = req.query.assetType as AssetType | undefined;
    const status = req.query.status as AssetStatus | undefined;
    const activeOnly = req.query.activeOnly !== "false";
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;

    const assets = await assetService.getAssets(req.user.companyId, {
      search,
      customerId,
      locationId,
      assetType,
      status,
      activeOnly,
      limit,
    });

    res.status(200).json(assets.map(toAssetResponse));
  })
);

/**
 * POST /api/v1/assets
 * Creates a new asset/equipment in a location
 */
assetsRouter.post(
  "/",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: CreateAssetInput = req.body;
    const asset = await assetService.createAsset(req.user.companyId, input);
    res.status(201).json(toAssetResponse(asset));
  })
);

/**
 * GET /api/v1/assets/:id
 * Gets a specific asset by id
 */
assetsRouter.get(
  "/:id",
  authenticate,
  requireRole(READ_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const asset = await assetService.getAssetById(req.user.companyId, req.params.id);
    res.status(200).json(toAssetResponse(asset));
  })
);

/**
 * PUT /api/v1/assets/:id
 * Updates a specific asset
 */
assetsRouter.put(
  "/:id",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: UpdateAssetInput = req.body;
    const asset = await assetService.updateAsset(req.user.companyId, req.params.id, input);
    res.status(200).json(toAssetResponse(asset));
  })
);

/**
 * POST /api/v1/assets/:id/archive
 * Archives an asset (isActive = false)
 */
assetsRouter.post(
  "/:id/archive",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const asset = await assetService.archiveAsset(req.user.companyId, req.params.id);
    res.status(200).json(toAssetResponse(asset));
  })
);

/**
 * POST /api/v1/assets/:id/reactivate
 * Reactivates an asset (isActive = true)
 */
assetsRouter.post(
  "/:id/reactivate",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const asset = await assetService.reactivateAsset(req.user.companyId, req.params.id);
    res.status(200).json(toAssetResponse(asset));
  })
);
