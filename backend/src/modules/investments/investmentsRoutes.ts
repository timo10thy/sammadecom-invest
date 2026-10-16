import { Router } from "express";
import {
  authenticate,
  authorizeRoles,
} from "../../middleware/authMiddleware.js";
import { createInvestmentsLimiter } from "../../middleware/rateLimiter.js";
import { createInvestments } from "./investmentsController.js";

export const investmentsRouter = Router();

investmentsRouter.post(
  "/",
  authenticate,
  authorizeRoles("STAFF"),
  createInvestmentsLimiter,
  createInvestments
);