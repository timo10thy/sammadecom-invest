import { Router } from "express";
import {
  authenticate,
  authorizeRoles,
} from "../../middleware/authMiddleware.js";
import {
  createPaymentLimiter,
  listPaymentsLimiter,
  reviewPaymentLimiter,
} from "../../middleware/rateLimiter.js";
import {
  createPayment,
  listPayments,
  reviewPayment,
} from "./paymentsController.js";

export const paymentsRouter = Router();

paymentsRouter.get(
  "/",
  authenticate,
  authorizeRoles("FINANCE", "MANAGEMENT"),
  listPaymentsLimiter,
  listPayments
);

paymentsRouter.post(
  "/",
  authenticate,
  authorizeRoles("FINANCE"),
  createPaymentLimiter,
  createPayment
);

paymentsRouter.patch(
  "/:paymentId/review",
  authenticate,
  authorizeRoles("MANAGEMENT"),
  reviewPaymentLimiter,
  reviewPayment
);