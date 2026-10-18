import { Router } from "express";
import {
  authenticate,
  authorizeRoles,
} from "../../middleware/authMiddleware.js";
import { createPaymentLimiter } from "../../middleware/rateLimiter.js";
import { createPayment } from "./paymentsController.js";

export const paymentsRouter = Router();

paymentsRouter.post(
  "/",
  authenticate,
  authorizeRoles("FINANCE"),
  createPaymentLimiter,
  createPayment
);