import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { getTodayInLagos } from "../investments/investmentsDates.js";
import {
  calculateReturnCents,
  centsToText,
} from "../investments/investmentsMoney.js";
import { amountToCents } from "../investments/investmentsValidation.js";

const isUniqueError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "P2002";

export const createPayment = async (req: Request, res: Response) => {
  try {
    const financeId = req.user?.userId;
    if (!financeId) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const body = req.body ?? {};
    const investmentId: unknown = body.investmentId;
    if (typeof investmentId !== "string" || investmentId.trim() === "") {
      return res
        .status(400)
        .json({ status: "fail", message: "Investment id is required" });
    }

    const investment = await prisma.investment.findUnique({
      where: { id: investmentId.trim() },
      select: {
        id: true,
        status: true,
        amount: true,
        roiPercent: true,
        maturityDate: true,
        investor: { select: { status: true, bankAccountEncrypted: true } },
      },
    });
    if (!investment) {
      return res
        .status(404)
        .json({ status: "fail", message: "Investment not found" });
    }

    if (investment.status !== "ACTIVE" && investment.status !== "MATURED") {
      return res
        .status(409)
        .json({ status: "fail", message: "This investment is not active" });
    }

    // due means: maturity date is this month or earlier
    const today = getTodayInLagos();
    const nextMonthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)
    );
    if (
      investment.maturityDate === null ||
      investment.maturityDate >= nextMonthStart
    ) {
      return res
        .status(409)
        .json({ status: "fail", message: "This investment is not due yet" });
    }

    if (investment.investor.status !== "VERIFIED") {
      return res
        .status(403)
        .json({ status: "fail", message: "This investor is not verified" });
    }

    const bankSnapshot = investment.investor.bankAccountEncrypted;
    if (bankSnapshot === null) {
      return res.status(409).json({
        status: "fail",
        message: "This investor has no bank details saved",
      });
    }

    const livePayment = await prisma.payment.findFirst({
      where: {
        investmentId: investment.id,
        status: { in: ["PENDING_APPROVAL", "APPROVED", "PROCESSED"] },
      },
      select: { id: true },
    });
    if (livePayment) {
      return res.status(409).json({
        status: "fail",
        message: "This investment already has a payout request in progress",
      });
    }

    // nobody types the amount: amount plus ROI, worked out in kobo
    const amountText = investment.amount.toFixed(2);
    const returnCents = calculateReturnCents(
      amountText,
      investment.roiPercent.toFixed(2)
    );
    const payText = centsToText(amountToCents(amountText) + returnCents);

    const result = await prisma.$transaction(
      async (tx) => {
        // check again inside the transaction
        const stillOk = await tx.investment.count({
          where: {
            id: investment.id,
            status: { in: ["ACTIVE", "MATURED"] },
            investor: { status: "VERIFIED" },
          },
        });
        if (stillOk === 0) {
          return null;
        }

        const payment = await tx.payment.create({
          data: {
            investmentId: investment.id,
            amount: payText,
            bankAccountSnapshot: bankSnapshot,
            submittedById: financeId,
          },
          select: {
            id: true,
            investmentId: true,
            amount: true,
            status: true,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: financeId,
            action: "PAYMENT_SUBMITTED",
            entityType: "Payment",
            entityId: payment.id,
            details: `investment: ${investment.id}; amount: ${payText}`,
          },
        });

        return payment;
      },
      { maxWait: 10000, timeout: 30000 }
    );

    if (!result) {
      return res.status(409).json({
        status: "fail",
        message: "This investment can no longer be paid",
      });
    }

    return res.status(201).json({ status: "success", data: { payment: result } });
  } catch (error) {
    if (isUniqueError(error)) {
      return res.status(409).json({
        status: "fail",
        message: "This investment already has a payout request in progress",
      });
    }
    console.error("Create payment failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};