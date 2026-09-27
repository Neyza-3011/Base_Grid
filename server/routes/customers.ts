import { Router, Request, Response } from "express";
import { authenticate } from "../middleware/auth";
import { db } from "../db";
import { asyncHandler } from "../async-handler";
import { CustomerService } from "../services/customer.service";
import { CreateCustomerInput, CreateLocationInput, UpdateCustomerInput, UpdateLocationInput, CustomerResponse, LocationResponse } from "../types";

export const customersRouter = Router();
const customerService = new CustomerService(db);

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

/**
 * GET /api/v1/customers
 * Returns a list of customers for the current company
 */
customersRouter.get(
  "/",
  authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.company) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }
    const search = req.query.search as string;
    const activeOnly = req.query.activeOnly !== "false";
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const customers = await customerService.getCustomers(req.company.id, search, activeOnly, limit);
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
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.company) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: CreateCustomerInput = req.body;
    const customer = await customerService.createCustomer(req.company.id, input);
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
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.company) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const customer = await customerService.getCustomerById(req.company.id, req.params.id);
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
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.company) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: UpdateCustomerInput = req.body;
    const customer = await customerService.updateCustomer(req.company.id, req.params.id, input);
    res.status(200).json(toCustomerResponse(customer));
  })
);

// --- Locations sub-routes ---

/**
 * GET /api/v1/customers/:customerId/locations
 * Returns locations for a customer
 */
customersRouter.get(
  "/:customerId/locations",
  authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.company) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }
    const search = req.query.search as string;
    const activeOnly = req.query.activeOnly !== "false";
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    const locations = await customerService.getLocations(req.company.id, req.params.customerId, search, activeOnly, limit);
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
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.company) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: CreateLocationInput = req.body;
    const location = await customerService.createLocation(req.company.id, req.params.customerId, input);
    res.status(201).json(toLocationResponse(location));
  })
);

/**
 * GET /api/v1/locations/:id
 * Gets a specific location
 */
customersRouter.get(
  "/locations/:id",
  authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.company) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const location = await customerService.getLocationById(req.company.id, req.params.id);
    res.status(200).json(toLocationResponse(location));
  })
);

/**
 * PUT /api/v1/locations/:id
 * Updates a specific location
 */
customersRouter.put(
  "/locations/:id",
  authenticate,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.company) {
      res.status(401).json({ detail: "Azienda non trovata." });
      return;
    }

    const input: UpdateLocationInput = req.body;
    const location = await customerService.updateLocation(req.company.id, req.params.id, input);
    res.status(200).json(toLocationResponse(location));
  })
);
