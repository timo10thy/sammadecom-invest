import { Router } from "express";
import {
  authenticate,
  authorizeRoles,
} from "../../middleware/authMiddleware.js";
import {
  createPaymentLimiter,
  listPaymentsLimiter,
  processPaymentLimiter,
  reviewPaymentLimiter,
  revealBankDetailsLimiter,
} from "../../middleware/rateLimiter.js";
import {
  createPayment,
  getPaymentBankDetails,
  listPayments,
  processPayment,
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

paymentsRouter.get(
  "/:paymentId/bank-details",
  authenticate,
  authorizeRoles("FINANCE"),
  revealBankDetailsLimiter,
  getPaymentBankDetails
);

paymentsRouter.patch(
  "/:paymentId/review",
  authenticate,
  authorizeRoles("MANAGEMENT"),
  reviewPaymentLimiter,
  reviewPayment
);

paymentsRouter.patch(
  "/:paymentId/process",
  authenticate,
  authorizeRoles("FINANCE"),
  processPaymentLimiter,
  processPayment
);