import { rateLimit, MINUTE } from "express-rate-limit";


export const registerLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  ipv6Subnet: 56,
  message: {
    status: "fail",
    message: "Too many registration attempts, please try again later",
  },
});