import { Router, Request, Response } from "express";
import { authenticate, requireSuperAdmin } from "../middleware/auth";
import { db } from "../db";

export const adminRouter = Router();

// Enforce authentication & SuperAdmin role across all /admin routes
adminRouter.use(authenticate);
adminRouter.use(requireSuperAdmin);

/**
 * GET /api/v1/admin/stats
 * Global platform statistics for Master Super-Admin
 */
adminRouter.get("/stats", async (req: any, res: any): Promise<void> => {
  const stats = await db.getGlobalStats();
  res.status(200).json(stats);
});

/**
 * GET /api/v1/admin/tenants
 * List of all registered tenant companies for Master Super-Admin
 */
adminRouter.get("/tenants", async (req: any, res: any): Promise<void> => {
  const tenantsList = await db.getAllTenants();
  const tenants = tenantsList.map((t) => ({
    id: t.id,
    name: t.name,
    plan: t.stripeSubscriptionStatus,
    status: "Attiva",
    created_at: t.createdAt,
    max_users: t.maxUsers,
  }));
  res.status(200).json(tenants);
});
