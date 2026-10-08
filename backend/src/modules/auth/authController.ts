import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../../config/prisma.js";
import { validateRegisterInput } from "./authValidation.js";



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