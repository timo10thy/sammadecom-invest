import type { NextFunction, Request, Response } from "express";
import { rateLimit, ipKeyGenerator, MINUTE } from "express-rate-limit";
import { prisma } from "../config/prisma.js";

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

const loginKey = (req: Request): string => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  return `${ipKeyGenerator(req.ip ?? "")}:${email}`;
};

export const investorLoginLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: loginKey,
  message: {
    status: "fail",
    message: "Too many login attempts, please try again later",
  },
});

export const staffLoginLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: loginKey,
  message: {
    status: "fail",
    message: "Too many login attempts, please try again later",
  },
});

export const loginRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const email = req.body?.email;
    if (typeof email !== "string") {
      return investorLoginLimiter(req, res, next);
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { role: true },
    });

    if (user && user.role !== "INVESTOR") {
      return staffLoginLimiter(req, res, next);
    }
    return investorLoginLimiter(req, res, next);
  } catch (error) {
    next(error);
  }
};