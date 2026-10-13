import { Router } from "express";
import {
  authenticate,
  authorizeRoles,
} from "../../middleware/authMiddleware.js";
import { listInvestors, reviewInvestor } from "./investorsController.js";

export const investorsRouter = Router();

investorsRouter.get(
  "/",
  authenticate,
  authorizeRoles("MANAGEMENT", "FINANCE"),
  listInvestors
);

investorsRouter.patch(
  "/:investorId/review",
  authenticate,
  authorizeRoles("MANAGEMENT"),
  reviewInvestor
);