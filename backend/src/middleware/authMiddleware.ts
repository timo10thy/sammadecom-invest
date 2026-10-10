import type { NextFunction, Request, Response } from "express";
import type { Role } from "../generated/prisma/enums.js";
import { verifyAccessToken } from "../modules/auth/authTokens.js";

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ status: "fail", message: "Please log in to continue" });
  }

  try {
    req.user = verifyAccessToken(header.slice(7));
    return next();
  } catch {
    return res
      .status(401)
      .json({ status: "fail", message: "Invalid or expired token" });
  }
};

export const authorizeRoles = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ status: "fail", message: "Please log in to continue" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: "fail",
        message: "You do not have permission to do this",
      });
    }
    return next();
  };
};