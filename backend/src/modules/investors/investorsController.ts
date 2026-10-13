import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import bcrypt from "bcrypt";
import { encryptBankAccount } from "./investorsCrypto.js";
import { validateProfileUpdateInput } from "./investorsValidation.js";

export const reviewInvestor = async (req: Request, res: Response) => {
  try {
    const reviewerId = req.user?.userId;
    if (!reviewerId) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const investorId = req.params["investorId"];
    if (typeof investorId !== "string" || investorId === "") {
      return res
        .status(400)
        .json({ status: "fail", message: "Investor id is required" });
    }

    const body = req.body ?? {};
    const status: unknown = body.status;
    const reason: unknown = body.reason;

    if (status !== "VERIFIED" && status !== "REJECTED") {
      return res.status(400).json({
        status: "fail",
        message: "Status must be VERIFIED or REJECTED",
      });
    }

    let cleanReason: string | null = null;
    if (status === "REJECTED") {
      if (typeof reason !== "string" || reason.trim().length < 5) {
        return res.status(400).json({
          status: "fail",
          message: "A reason of at least 5 characters is required to reject",
        });
      }
      cleanReason = reason.trim();
    }

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      select: { id: true, userId: true, status: true },
    });
    if (!investor) {
      return res
        .status(404)
        .json({ status: "fail", message: "Investor not found" });
    }

    const changeAllowed =
      investor.status === "PENDING" ||
      (investor.status === "VERIFIED" && status === "REJECTED");
    if (!changeAllowed) {
      return res.status(409).json({
        status: "fail",
        message: "This status change is not allowed",
      });
    }

    const reviewedAt = new Date();

    const done = await prisma.$transaction(async (tx) => {
      // only change it if the status is still what we just read
      const updated = await tx.investor.updateMany({
        where: { id: investor.id, status: investor.status },
        data: {
          status,
          reviewedById: reviewerId,
          reviewedAt,
          rejectionReason: cleanReason,
        },
      });
      if (updated.count === 0) {
        return false;
      }

      await tx.auditLog.create({
        data: {
          userId: reviewerId,
          action: `INVESTOR_${status}`,
          entityType: "Investor",
          entityId: investor.id,
        },
      });

      if (status === "REJECTED") {
        await tx.refreshToken.deleteMany({ where: { userId: investor.userId } });
      }

      return true;
    });

    if (!done) {
      return res.status(409).json({
        status: "fail",
        message: "This status change is not allowed",
      });
    }

    return res.status(200).json({
      status: "success",
      data: { investor: { id: investor.id, status, reviewedAt } },
    });
  } catch (error) {
    console.error("Review investor failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

//get all investors
const parseWholeNumber = (value: unknown): number | null => {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const allDigits = value.split("").every((c) => c >= "0" && c <= "9");
  if (!allDigits) {
    return null;
  }
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num < 1) {
    return null;
  }
  return num;
};

export const listInvestors = async (req: Request, res: Response) => {
  try {
    let statusFilter: "PENDING" | "VERIFIED" | "REJECTED" | undefined;
    const rawStatus = req.query["status"];
    if (rawStatus !== undefined) {
      if (
        rawStatus !== "PENDING" &&
        rawStatus !== "VERIFIED" &&
        rawStatus !== "REJECTED"
      ) {
        return res
          .status(400)
          .json({ status: "fail", message: "Invalid status" });
      }
      statusFilter = rawStatus;
    }

    let page = 1;
    const rawPage = req.query["page"];
    if (rawPage !== undefined) {
      const parsed = parseWholeNumber(rawPage);
      if (parsed === null) {
        return res.status(400).json({
          status: "fail",
          message: "Page must be a whole number above 0",
        });
      }
      page = parsed;
    }

    let limit = 20;
    const rawLimit = req.query["limit"];
    if (rawLimit !== undefined) {
      const parsed = parseWholeNumber(rawLimit);
      if (parsed === null) {
        return res.status(400).json({
          status: "fail",
          message: "Limit must be a whole number above 0",
        });
      }
      limit = Math.min(parsed, 50);
    }

    const where = statusFilter === undefined ? {} : { status: statusFilter };

    const [total, investors] = await Promise.all([
      prisma.investor.count({ where }),
      prisma.investor.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          phone: true,
          status: true,
          createdAt: true,
          reviewedAt: true,
          rejectionReason: true,
          bankName: true,
          bankAccountLast4: true,
          user: { select: { name: true, email: true } },
        },
      }),
    ]);

    return res.status(200).json({
      status: "success",
      data: { investors, total, page, limit },
    });
  } catch (error) {
    console.error("List investors failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const investor = await prisma.investor.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        phone: true,
        address: true,
        bankName: true,
        bankAccountLast4: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    });
    if (!investor) {
      return res
        .status(404)
        .json({ status: "fail", message: "Investor profile not found" });
    }

    return res.status(200).json({ status: "success", data: { investor } });
  } catch (error) {
    console.error("Get my profile failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

export const updateMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const body = req.body ?? {};

    const validationError = validateProfileUpdateInput(body);
    if (validationError) {
      return res.status(400).json({ status: "fail", message: validationError });
    }

    const { address, bankName, bankAccountNumber, currentPassword } = body as {
      address?: string;
      bankName?: string;
      bankAccountNumber?: string;
      currentPassword?: string;
    };

    const investor = await prisma.investor.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        user: { select: { passwordHash: true } },
      },
    });
    if (!investor) {
      return res
        .status(404)
        .json({ status: "fail", message: "Investor profile not found" });
    }

    if (investor.status === "PENDING") {
      return res.status(403).json({
        status: "fail",
        message: "Your account is waiting for verification.",
      });
    }
    if (investor.status === "REJECTED") {
      return res.status(403).json({
        status: "fail",
        message: "Your account cannot be used. Please contact SAMMADECOM.",
      });
    }

    const data: {
      address?: string;
      bankName?: string;
      bankAccountEncrypted?: string;
      bankAccountLast4?: string;
    } = {};

    if (address !== undefined) {
      data.address = address.trim();
    }

    let changingBank = false;
    if (bankName !== undefined && bankAccountNumber !== undefined) {
      const passwordMatches = await bcrypt.compare(
        currentPassword ?? "",
        investor.user.passwordHash
      );
      if (!passwordMatches) {
        // lets the limiter count only wrong passwords
        res.locals["passwordFailed"] = true;
        return res
          .status(400)
          .json({ status: "fail", message: "Current password is incorrect" });
      }

      data.bankName = bankName.trim();
      data.bankAccountEncrypted = encryptBankAccount(
        bankAccountNumber,
        investor.id
      );
      data.bankAccountLast4 = bankAccountNumber.slice(-4);
      changingBank = true;
    }

    const done = await prisma.$transaction(async (tx) => {
      // only change it if the investor is still VERIFIED
      const updated = await tx.investor.updateMany({
        where: { id: investor.id, status: "VERIFIED" },
        data,
      });
      if (updated.count === 0) {
        return false;
      }

      if (changingBank) {
        await tx.auditLog.create({
          data: {
            userId,
            action: "INVESTOR_BANK_UPDATED",
            entityType: "Investor",
            entityId: investor.id,
          },
        });
      }

      return true;
    });

    if (!done) {
      return res.status(403).json({
        status: "fail",
        message: "Your account cannot make this change right now.",
      });
    }

    return res
      .status(200)
      .json({ status: "success", message: "Profile updated" });
  } catch (error) {
    console.error("Update my profile failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};