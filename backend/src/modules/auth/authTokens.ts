import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { Role } from "../../generated/prisma/enums.js";

export interface AccessTokenPayload {
  userId: string;
  role: Role;
}

const getAccessSecret = (): string => {
  const secret = process.env["JWT_ACCESS_SECRET"];
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not set");
  }
  return secret;
};

export const signAccessToken = (payload: AccessTokenPayload): string => {
    const expiresIn = (process.env["JWT_ACCESS_EXPIRES_IN"] ??
      "15m") as NonNullable<SignOptions["expiresIn"]>;
    return jwt.sign(payload, getAccessSecret(), { expiresIn });
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const decoded = jwt.verify(token, getAccessSecret());
  if (typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }
  return { userId: decoded["userId"], role: decoded["role"] };
};

export const generateRefreshToken = (): string => {
  return crypto.randomBytes(48).toString("hex");
};

export const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};