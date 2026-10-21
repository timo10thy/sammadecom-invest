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

export const changePasswordLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request): string =>
    req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    status: "fail",
    message: "Too many attempts, please try again later",
  },
});

//
export const updateProfileLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req: Request, res: Response): boolean =>
    res.locals["passwordFailed"] !== true,
  keyGenerator: (req: Request): string =>
    req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    status: "fail",
    message: "Too many attempts, please try again later",
  },
});

//investment
export const createInvestmentsLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    status: "fail",
    message: "Too many attempts, please try again later",
  },
});

export const listInvestmentsLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    status: "fail",
    message: "Too many requests, please try again later",
  },
});

// date and month
export const reviewInvestmentLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    status: "fail",
    message: "Too many requests, please try again later",
  },
});

export const correctInvestmentLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    status: "fail",
    message: "Too many requests, please try again later",
  },
});

//payment
export const createPaymentLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    status: "fail",
    message: "Too many requests, please try again later",
  },
});

export const listPaymentsLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    status: "fail",
    message: "Too many requests, please try again later",
  },
});

export const reviewPaymentLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    status: "fail",
    message: "Too many requests, please try again later",
  },
});

//bankdetails
export const revealBankDetailsLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    status: "fail",
    message: "Too many requests, please try again later",
  },
});

//financie payment
export const processPaymentLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    status: "fail",
    message: "Too many requests, please try again later",
  },
});