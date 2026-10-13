import { Router } from "express";
import {
  authenticate,
  authorizeRoles,
} from "../../middleware/authMiddleware.js";
import { updateProfileLimiter } from "../../middleware/rateLimiter.js";
import {
  getMyProfile,
  listInvestors,
  reviewInvestor,
  updateMyProfile,
} from "./investorsController.js";

export const investorsRouter = Router();

investorsRouter.get(
  "/",
  authenticate,
  authorizeRoles("MANAGEMENT", "FINANCE"),
  listInvestors
);

investorsRouter.get(
  "/me",
  authenticate,
  authorizeRoles("INVESTOR"),
  getMyProfile
);

investorsRouter.patch(
  "/me",
  authenticate,
  authorizeRoles("INVESTOR"),
  updateProfileLimiter,
  updateMyProfile
);

investorsRouter.patch(
  "/:investorId/review",
  authenticate,
  authorizeRoles("MANAGEMENT"),
  reviewInvestor
);