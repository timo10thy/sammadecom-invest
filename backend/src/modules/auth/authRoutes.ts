import { Router } from "express";
import { registerUser, loginUser, refreshAccessToken,logoutUser, createUser, changePassword } from "./authController.js";
import { registerLimiter, loginRateLimit, changePasswordLimiter } from "../../middleware/rateLimiter.js";
import { authenticate, authorizeRoles } from "../../middleware/authMiddleware.js";



export const authRouter = Router();

authRouter.post("/register", registerLimiter, registerUser);
authRouter.post("/login",loginRateLimit, loginUser,);
authRouter.post("/refresh", refreshAccessToken);
authRouter.post("/logout", logoutUser);
authRouter.post("/users", authenticate, authorizeRoles("MANAGEMENT"), createUser);
authRouter.post("/change-password", authenticate, changePasswordLimiter, changePassword);
authRouter.get("/me", authenticate, (req, res) => {
  res.status(200).json({ status: "success", data: { user: req.user } });
});


