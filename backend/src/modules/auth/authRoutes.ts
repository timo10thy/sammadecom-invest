import { Router } from "express";
import { registerUser, loginUser, refreshAccessToken,logoutUser, createUser } from "./authController.js";
import { registerLimiter, loginRateLimit } from "../../middleware/rateLimiter.js";
import { authenticate, authorizeRoles } from "../../middleware/authMiddleware.js";



export const authRouter = Router();

authRouter.post("/register", registerLimiter, registerUser);
authRouter.post("/login",loginRateLimit, loginUser,);
authRouter.post("/refresh", refreshAccessToken);
authRouter.post("/logout", logoutUser);
authRouter.post("/users", authenticate, authorizeRoles("MANAGEMENT"), createUser);
authRouter.get("/me", authenticate, (req, res) => {
    res.status(200).json({ status: "success", data: { user: req.user } });
  });
  
  // TEMPORARY: delete after testing
  authRouter.get("/management-check", authenticate, authorizeRoles("MANAGEMENT"), (req, res) => {
    res.status(200).json({ status: "success", message: "Management only" });
  });

