import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../../config/prisma.js";
import { validateRegisterInput } from "./authValidation.js";
import {
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from "./authTokens.js";



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

    if (!user || !passwordMatches) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid email or password" });
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