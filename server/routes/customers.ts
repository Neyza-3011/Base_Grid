import { Router, Request, Response } from "express";
import { authenticate, requireRole } from "../middleware/auth";
import { db } from "../db";
import { asyncHandler } from "../async-handler";
import { CustomerService } from "../services/customer.service";
import {
  CreateCustomerInput,
  CreateLocationInput,
  UpdateCustomerInput,
  UpdateLocationInput,
  CustomerResponse,
  LocationResponse,
  UserRole,
} from "../types";

export const customersRouter = Router();
export const locationsRouter = Router();
const customerService = new CustomerService(db);

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
 * Format CustomerRecord to CustomerResponse (removing internal companyId)
 */
function toCustomerResponse(record: any): CustomerResponse {
  const { companyId, ...rest } = record;
  return rest;
}

/**
 * Format LocationRecord to LocationResponse (removing internal companyId)
 */
function toLocationResponse(record: any): LocationResponse {
  const { companyId, ...rest } = record;
  return rest;
}

// ==============================================================================
// Shared Location Item Handlers (tenant-isolated via req.user.companyId)
// ==============================================================================

const getLocationHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.user || !req.user.companyId) {
    res.status(401).json({ detail: "Azienda non trovata." });
    return;
  }

  const location = await customerService.getLocationById(req.user.companyId, req.params.id);
  res.status(200).json(toLocationResponse(location));
});

const updateLocationHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.user || !req.user.companyId) {
    res.status(401).json({ detail: "Azienda non trovata." });
    return;
  }

  const input: UpdateLocationInput = req.body;
  const location = await customerService.updateLocation(req.user.companyId, req.params.id, input);
  res.status(200).json(toLocationResponse(location));
});

const archiveLocationHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.user || !req.user.companyId) {
    res.status(401).json({ detail: "Azienda non trovata." });
    return;
  }

  const location = await customerService.archiveLocation(req.user.companyId, req.params.id);
  res.status(200).json(toLocationResponse(location));
});

const reactivateLocationHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  if (!req.user || !req.user.companyId) {
    res.status(401).json({ detail: "Azienda non trovata." });
    return;
  }

  const location = await customerService.reactivateLocation(req.user.companyId, req.params.id);
  res.status(200).json(toLocationResponse(location));
});

// ==============================================================================
// 1. Canonical Locations Routes (/api/v1/locations/:id)
// ==============================================================================
locationsRouter.get("/:id", authenticate, requireRole(READ_ROLES), getLocationHandler);
locationsRouter.put("/:id", authenticate, requireRole(WRITE_ROLES), updateLocationHandler);
locationsRouter.post("/:id/archive", authenticate, requireRole(WRITE_ROLES), archiveLocationHandler);
locationsRouter.post("/:id/reactivate", authenticate, requireRole(WRITE_ROLES), reactivateLocationHandler);

// ==============================================================================
// 2. Backward-Compatible Location Aliases (/api/v1/customers/locations/:id)
// ==============================================================================
customersRouter.get("/locations/:id", authenticate, requireRole(READ_ROLES), getLocationHandler);
customersRouter.put("/locations/:id", authenticate, requireRole(WRITE_ROLES), updateLocationHandler);
customersRouter.post("/locations/:id/archive", authenticate, requireRole(WRITE_ROLES), archiveLocationHandler);
customersRouter.post("/locations/:id/reactivate", authenticate, requireRole(WRITE_ROLES), reactivateLocationHandler);

// ==============================================================================
// 2. Customers Main Routes
// ==============================================================================

/**
 * GET /api/v1/customers
 * Returns a list of customers for the current company
 */
customersRouter.get(
  "/",
  authenticate,
  requireRole(READ_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }
    const search = req.query.search as string;
    const activeOnly = req.query.activeOnly !== "false";
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const customers = await customerService.getCustomers(req.user.companyId, search, activeOnly, limit);
    res.status(200).json(customers.map(toCustomerResponse));
  })
);

/**
 * POST /api/v1/customers
 * Creates a new customer
 */
customersRouter.post(
  "/",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: CreateCustomerInput = req.body;
    const customer = await customerService.createCustomer(req.user.companyId, input);
    res.status(201).json(toCustomerResponse(customer));
  })
);

/**
 * GET /api/v1/customers/:id
 * Gets a specific customer
 */
customersRouter.get(
  "/:id",
  authenticate,
  requireRole(READ_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const customer = await customerService.getCustomerById(req.user.companyId, req.params.id);
    res.status(200).json(toCustomerResponse(customer));
  })
);

/**
 * PUT /api/v1/customers/:id
 * Updates a specific customer
 */
customersRouter.put(
  "/:id",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: UpdateCustomerInput = req.body;
    const customer = await customerService.updateCustomer(req.user.companyId, req.params.id, input);
    res.status(200).json(toCustomerResponse(customer));
  })
);

/**
 * POST /api/v1/customers/:id/archive
 * Archives a specific customer (isActive = false)
 */
customersRouter.post(
  "/:id/archive",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const customer = await customerService.archiveCustomer(req.user.companyId, req.params.id);
    res.status(200).json(toCustomerResponse(customer));
  })
);

/**
 * POST /api/v1/customers/:id/reactivate
 * Reactivates a specific customer (isActive = true)
 */
customersRouter.post(
  "/:id/reactivate",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const customer = await customerService.reactivateCustomer(req.user.companyId, req.params.id);
    res.status(200).json(toCustomerResponse(customer));
  })
);

// ==============================================================================
// 3. Customer Locations Sub-routes
// ==============================================================================

/**
 * GET /api/v1/customers/:customerId/locations
 * Returns locations for a customer
 */
customersRouter.get(
  "/:customerId/locations",
  authenticate,
  requireRole(READ_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }
    const search = req.query.search as string;
    const activeOnly = req.query.activeOnly !== "false";
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const locations = await customerService.getLocations(
      req.user.companyId,
      req.params.customerId,
      search,
      activeOnly,
      limit
    );
    res.status(200).json(locations.map(toLocationResponse));
  })
);

/**
 * POST /api/v1/customers/:customerId/locations
 * Creates a location for a customer
 */
customersRouter.post(
  "/:customerId/locations",
  authenticate,
  requireRole(WRITE_ROLES),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user || !req.user.companyId) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: CreateLocationInput = req.body;
    const location = await customerService.createLocation(
      req.user.companyId,
      req.params.customerId,
      input
    );
    res.status(201).json(toLocationResponse(location));
  })
);
