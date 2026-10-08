import { Router } from "express";
import { registerUser, loginUser } from "./authController.js";
import { registerLimiter, loginRateLimit } from "../../middleware/rateLimiter.js";

export const authRouter = Router();

authRouter.post("/register", registerLimiter, registerUser);
authRouter.post("/login",loginRateLimit, loginUser,);