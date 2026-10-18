import { Router } from "express";
import {
  authenticate,
  authorizeRoles,
} from "../../middleware/authMiddleware.js";
import {
  correctInvestmentLimiter,
  createInvestmentsLimiter,
  listInvestmentsLimiter,
  reviewInvestmentLimiter,
} from "../../middleware/rateLimiter.js";
import {
  correctInvestment,
  createInvestments,
  listDueInvestments,
  listInvestments,
  reviewInvestment,
} from "./investmentsController.js";

export const investmentsRouter = Router();

investmentsRouter.get(
  "/",
  authenticate,
  authorizeRoles("STAFF", "FINANCE", "MANAGEMENT"),
  listInvestmentsLimiter,
  listInvestments
);

investmentsRouter.get(
  "/due",
  authenticate,
  authorizeRoles("FINANCE", "MANAGEMENT"),
  listInvestmentsLimiter,
  listDueInvestments
);

investmentsRouter.post(
  "/",
  authenticate,
  authorizeRoles("STAFF"),
  createInvestmentsLimiter,
  createInvestments
);

investmentsRouter.patch(
  "/:investmentId/review",
  authenticate,
  authorizeRoles("FINANCE", "MANAGEMENT"),
  reviewInvestmentLimiter,
  reviewInvestment
);

investmentsRouter.patch(
  "/:investmentId",
  authenticate,
  authorizeRoles("STAFF"),
  correctInvestmentLimiter,
  correctInvestment
);