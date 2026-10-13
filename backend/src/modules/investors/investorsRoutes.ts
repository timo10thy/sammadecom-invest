import { Router } from "express";
import {
  authenticate,
  authorizeRoles,
} from "../../middleware/authMiddleware.js";
import { reviewInvestor } from "./investorsController.js";

export const investorsRouter = Router();

investorsRouter.patch(
  "/:investorId/review",
  authenticate,
  authorizeRoles("MANAGEMENT"),
  reviewInvestor
);