import { Router } from "express";
import { registerUser } from "./authController.js";
import { registerLimiter } from "../../middleware/rateLimiter.js";

export const authRouter = Router();

authRouter.post("/register", registerLimiter, registerUser);