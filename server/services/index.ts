import { db } from "../db";
import { ReportsService } from "./reports.service";
import { CompanyService } from "./company.service";

export const reportsService = new ReportsService(db);
export const companyService = new CompanyService(db);

export { ReportsService, CompanyService };
