import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { getTodayInLagos } from "../investments/investmentsDates.js";
import {
  calculateReturnCents,
  centsToText,
} from "../investments/investmentsMoney.js";
import { amountToCents } from "../investments/investmentsValidation.js";
import { parseWholeNumber } from "../investments/investmentsValidation.js";

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

// who see payment status
const isPaymentStatus = (
  value: unknown
): value is "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PROCESSED" =>
  value === "PENDING_APPROVAL" ||
  value === "APPROVED" ||
  value === "REJECTED" ||
  value === "PROCESSED";

export const listPayments = async (req: Request, res: Response) => {
  try {
    const rawStatus = req.query["status"];
    if (rawStatus !== undefined && !isPaymentStatus(rawStatus)) {
      return res
        .status(400)
        .json({ status: "fail", message: "Invalid status" });
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

    const where = rawStatus === undefined ? {} : { status: rawStatus };

    const [total, payments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        // the full bank number and the encrypted copy are never selected
        select: {
          id: true,
          amount: true,
          status: true,
          rejectionReason: true,
          bankReference: true,
          createdAt: true,
          approvedAt: true,
          processedAt: true,
          submittedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          processedBy: { select: { name: true } },
          investment: {
            select: {
              id: true,
              planName: true,
              maturityDate: true,
              investor: {
                select: {
                  id: true,
                  bankName: true,
                  bankAccountLast4: true,
                  user: { select: { name: true, email: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return res.status(200).json({
      status: "success",
      data: { payments, total, page, limit },
    });
  } catch (error) {
    console.error("List payments failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};