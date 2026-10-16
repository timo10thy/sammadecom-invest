import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { CURRENT_ROI_PERCENT } from "./investmentsConfig.js";
import {
  cleanReference,
  parseDateOnly,
  validateCreateInvestmentsInput,
} from "./investmentsValidation.js";

const isUniqueError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "P2002";

export const createInvestments = async (req: Request, res: Response) => {
  try {
    const staffId = req.user?.userId;
    if (!staffId) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const body = req.body ?? {};
    const validationError = validateCreateInvestmentsInput(body);
    if (validationError) {
      return res.status(400).json({ status: "fail", message: validationError });
    }

    const { investorId, deposit, investments } = body as {
      investorId: string;
      deposit: { reference: string; totalAmount: string; datePaid: string };
      investments: { planName: string; amount: string }[];
    };

    const reference = cleanReference(deposit.reference);
    const datePaid = parseDateOnly(deposit.datePaid);
    if (reference === null || datePaid === null) {
      return res
        .status(400)
        .json({ status: "fail", message: "Invalid Deposit details" });
    }

    const investor = await prisma.investor.findUnique({
      where: { id: investorId.trim() },
      select: { id: true, status: true },
    });
    if (!investor) {
      return res
        .status(404)
        .json({ status: "fail", message: "Investor not found" });
    }
    if (investor.status !== "VERIFIED") {
      return res.status(403).json({
        status: "fail",
        message: "This investor is not verified",
      });
    }

    const usedReference = await prisma.deposit.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (usedReference) {
      return res.status(409).json({
        status: "fail",
        message: "This payment reference has already been used",
      });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        // check status
        const stillVerified = await tx.investor.count({
          where: { id: investor.id, status: "VERIFIED" },
        });
        if (stillVerified === 0) {
          return null;
        }

        const newDeposit = await tx.deposit.create({
          data: {
            investorId: investor.id,
            reference,
            totalAmount: deposit.totalAmount,
            datePaid,
            createdById: staffId,
          },
          select: { id: true },
        });

        await tx.auditLog.create({
          data: {
            userId: staffId,
            action: "DEPOSIT_CREATED",
            entityType: "Deposit",
            entityId: newDeposit.id,
          },
        });

        for (const item of investments) {
          const created = await tx.investment.create({
            data: {
              investorId: investor.id,
              depositId: newDeposit.id,
              planName: item.planName.trim(),
              amount: item.amount,
              roiPercent: CURRENT_ROI_PERCENT,
              createdById: staffId,
            },
            select: { id: true },
          });

          await tx.auditLog.create({
            data: {
              userId: staffId,
              action: "INVESTMENT_CREATED",
              entityType: "Investment",
              entityId: created.id,
            },
          });
        }

        const savedDeposit = await tx.deposit.findUnique({
          where: { id: newDeposit.id },
          select: {
            id: true,
            reference: true,
            totalAmount: true,
            datePaid: true,
          },
        });
        const savedInvestments = await tx.investment.findMany({
          where: { depositId: newDeposit.id },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            planName: true,
            amount: true,
            roiPercent: true,
            status: true,
          },
        });

        return { deposit: savedDeposit, investments: savedInvestments };
      },
      { maxWait: 10000, timeout: 30000 }
    );

    if (!result) {
      return res.status(403).json({
        status: "fail",
        message: "This investor is not verified",
      });
    }

    return res.status(201).json({ status: "success", data: result });
  } catch (error) {
    if (isUniqueError(error)) {
      return res.status(409).json({
        status: "fail",
        message: "This payment reference has already been used",
      });
    }
    console.error("Create investments failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};