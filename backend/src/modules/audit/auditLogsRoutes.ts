import { Router } from "express";
import {
  authenticate,
  authorizeRoles,
} from "../../middleware/authMiddleware.js";
import { auditLogsLimiter } from "../../middleware/rateLimiter.js";
import { listAuditLogs } from "./auditLogsController.js";

export const auditLogsRouter = Router();

auditLogsRouter.get(
  "/",
  authenticate,
  authorizeRoles("MANAGEMENT"),
  auditLogsLimiter,
  listAuditLogs
);