import { Router } from "express";
import {
  authenticate,
  authorizeRoles,
} from "../../middleware/authMiddleware.js";
import {
  createInvestmentsLimiter,
  listInvestmentsLimiter,
} from "../../middleware/rateLimiter.js";
import { createInvestments, listInvestments } from "./investmentsController.js";

export const investmentsRouter = Router();

investmentsRouter.get(
  "/",
  authenticate,
  authorizeRoles("STAFF", "FINANCE", "MANAGEMENT"),
  listInvestmentsLimiter,
  listInvestments
);

investmentsRouter.post(
  "/",
  authenticate,
  authorizeRoles("STAFF"),
  createInvestmentsLimiter,
  createInvestments
);