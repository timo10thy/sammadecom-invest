import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../../config/prisma.js";
import {
  validateRegisterInput,
  validateCreateUserInput,
  validatePassword,
} from "./authValidation.js";
import type { CreatableRole } from "./authValidation.js";
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from "./authTokens.js";


//create
export const registerUser = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    const validationError = validateRegisterInput(body);
    if (validationError) {
      return res.status(400).json({ status: "fail", message: validationError });
    }

    const { name, email, phone, password } = body as {
      name: string;
      email: string;
      phone: string;
      password: string;
    };

    const cleanEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (existingUser) {
      return res
        .status(409)
        .json({ status: "fail", message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        role: "INVESTOR",
        investorProfile: { create: { phone } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ status: "success", data: { user } });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return res
        .status(409)
        .json({ status: "fail", message: "Email already registered" });
    }
    console.error("Register failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

// login

const REFRESH_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res
        .status(400)
        .json({ status: "fail", message: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { investorProfile: { select: { status: true } } },
    });

    const passwordMatches = await bcrypt.compare(
      password,
      user ? user.passwordHash : DUMMY_HASH
    );

    if (!user || user.role === "SYSTEM" || !passwordMatches) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid email or password" });
    }

    if (user.investorProfile?.status === "REJECTED") {
      return res.status(403).json({
        status: "fail",
        message: "Your account cannot be used. Please contact SAMMADECOM.",
      });
    }

    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    const refreshToken = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
      },
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "strict",
      path: "/auth",
      maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    });

    return res.status(200).json({
      status: "success",
      data: {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          investorStatus: user.investorProfile?.status ?? null,
        },
      },
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

// refresh

export const refreshAccessToken = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.["refreshToken"];

    if (typeof refreshToken !== "string" || refreshToken === "") {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { select: { id: true, role: true } } },
    });

    if (!stored) {
      res.clearCookie("refreshToken", { path: "/auth" });
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    if (stored.expiresAt <= new Date()) {
      res.clearCookie("refreshToken", { path: "/auth" });
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    
    const marked = await prisma.refreshToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (marked.count === 0) {
     
      await prisma.refreshToken.deleteMany({ where: { userId: stored.userId } });
      res.clearCookie("refreshToken", { path: "/auth" });
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const newRefreshToken = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(newRefreshToken),
        userId: stored.userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
      },
    });

    const accessToken = signAccessToken({
      userId: stored.user.id,
      role: stored.user.role,
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "strict",
      path: "/auth",
      maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    });

    return res.status(200).json({
      status: "success",
      data: { accessToken },
    });
  } catch (error) {
    console.error("Refresh failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

// logout

export const logoutUser = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.["refreshToken"];

    if (typeof refreshToken === "string" && refreshToken !== "") {
      await prisma.refreshToken.deleteMany({
        where: { tokenHash: hashToken(refreshToken) },
      });
    }

    res.clearCookie("refreshToken", { path: "/auth" });
    return res
      .status(200)
      .json({ status: "success", message: "Logged out" });
  } catch (error) {
    console.error("Logout failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

// create account (Management only)

export const createUser = async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    const validationError = validateCreateUserInput(body);
    if (validationError) {
      return res.status(400).json({ status: "fail", message: validationError });
    }

    const { name, email, role, password } = body as {
      name: string;
      email: string;
      role: CreatableRole;
      password: string;
    };

    const cleanEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (existingUser) {
      return res
        .status(409)
        .json({ status: "fail", message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ status: "success", data: { user } });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return res
        .status(409)
        .json({ status: "fail", message: "Email already registered" });
    }
    console.error("Create user failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

// change password

export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const { currentPassword, newPassword } = req.body ?? {};

    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({
        status: "fail",
        message: "Current password and new password are required",
      });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ status: "fail", message: passwordError });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        status: "fail",
        message: "New password must be different from the current password",
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );
    if (!passwordMatches) {
      return res
        .status(400)
        .json({ status: "fail", message: "Current password is incorrect" });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      }),
      prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);

    res.clearCookie("refreshToken", { path: "/auth" });
    return res.status(200).json({
      status: "success",
      message: "Password changed. Please log in again",
    });
  } catch (error) {
    console.error("Change password failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};