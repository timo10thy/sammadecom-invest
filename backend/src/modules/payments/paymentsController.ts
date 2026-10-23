import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { getTodayInLagos } from "../investments/investmentsDates.js";
import {
  calculateReturnCents,
  centsToText,
} from "../investments/investmentsMoney.js";
import {
  amountToCents,
  cleanReference,
  parseWholeNumber,
} from "../investments/investmentsValidation.js";
import { decryptBankAccount } from "../investors/investorsCrypto.js";

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

//patch
type ReviewPaymentAction = "APPROVE" | "REJECT";

const isReviewPaymentAction = (value: unknown): value is ReviewPaymentAction =>
  value === "APPROVE" || value === "REJECT";

export const reviewPayment = async (req: Request, res: Response) => {
  try {
    const reviewerId = req.user?.userId;
    if (!reviewerId) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const paymentId = req.params["paymentId"];
    if (typeof paymentId !== "string" || paymentId === "") {
      return res
        .status(400)
        .json({ status: "fail", message: "Payment id is required" });
    }

    const body = req.body ?? {};
    const action: unknown = body.action;
    const reason: unknown = body.reason;

    if (!isReviewPaymentAction(action)) {
      return res.status(400).json({
        status: "fail",
        message: "Action must be APPROVE or REJECT",
      });
    }

    let cleanReason: string | null = null;
    if (action === "REJECT") {
      if (typeof reason !== "string" || reason.trim().length < 5) {
        return res.status(400).json({
          status: "fail",
          message: "A reason of at least 5 characters is required to reject",
        });
      }
      cleanReason = reason.trim();
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        amount: true,
        bankAccountSnapshot: true,
        investmentId: true,
        investment: {
          select: {
            status: true,
            investor: { select: { status: true, bankAccountEncrypted: true } },
          },
        },
      },
    });
    if (!payment) {
      return res
        .status(404)
        .json({ status: "fail", message: "Payment not found" });
    }

    if (payment.status !== "PENDING_APPROVAL") {
      return res.status(409).json({
        status: "fail",
        message: "This payout request is not waiting for approval",
      });
    }

    if (action === "APPROVE") {
      if (payment.investment.investor.status !== "VERIFIED") {
        return res.status(403).json({
          status: "fail",
          message: "This investor is not verified",
        });
      }
      if (
        payment.investment.status !== "ACTIVE" &&
        payment.investment.status !== "MATURED"
      ) {
        return res
          .status(409)
          .json({ status: "fail", message: "This investment is not active" });
      }
      // the bank details must be the same as when Finance submitted
      if (
        payment.investment.investor.bankAccountEncrypted !==
        payment.bankAccountSnapshot
      ) {
        return res.status(409).json({
          status: "fail",
          message:
            "The investor's bank details changed after this request. Please reject it so Finance can submit a new one.",
        });
      }
    }

    const now = new Date();
    const amountText = payment.amount.toFixed(2);

    const done = await prisma.$transaction(
      async (tx) => {
        let updatedCount = 0;

        if (action === "APPROVE") {
          // check again that nothing changed
          const stillOk = await tx.investment.count({
            where: {
              id: payment.investmentId,
              status: { in: ["ACTIVE", "MATURED"] },
              investor: {
                status: "VERIFIED",
                bankAccountEncrypted: payment.bankAccountSnapshot,
              },
            },
          });
          if (stillOk === 0) {
            return false;
          }

          const result = await tx.payment.updateMany({
            where: { id: payment.id, status: "PENDING_APPROVAL" },
            data: { status: "APPROVED", approvedById: reviewerId, approvedAt: now },
          });
          updatedCount = result.count;
        } else {
          const result = await tx.payment.updateMany({
            where: { id: payment.id, status: "PENDING_APPROVAL" },
            data: { status: "REJECTED", rejectionReason: cleanReason },
          });
          updatedCount = result.count;
        }

        if (updatedCount === 0) {
          return false;
        }

        await tx.auditLog.create({
          data: {
            userId: reviewerId,
            action: action === "APPROVE" ? "PAYMENT_APPROVED" : "PAYMENT_REJECTED",
            entityType: "Payment",
            entityId: payment.id,
            details:
              action === "APPROVE"
                ? `amount: ${amountText}`
                : `reason: ${cleanReason}`,
          },
        });

        return true;
      },
      { maxWait: 10000, timeout: 30000 }
    );

    if (!done) {
      return res.status(409).json({
        status: "fail",
        message: "This payout request cannot be changed right now",
      });
    }

    return res.status(200).json({
      status: "success",
      data: {
        payment: {
          id: payment.id,
          status: action === "APPROVE" ? "APPROVED" : "REJECTED",
        },
      },
    });
  } catch (error) {
    console.error("Review payment failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

//bankdetails
export const getPaymentBankDetails = async (req: Request, res: Response) => {
  try {
    const financeId = req.user?.userId;
    if (!financeId) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const paymentId = req.params["paymentId"];
    if (typeof paymentId !== "string" || paymentId === "") {
      return res
        .status(400)
        .json({ status: "fail", message: "Payment id is required" });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        amount: true,
        bankAccountSnapshot: true,
        investment: {
          select: {
            investor: {
              select: {
                id: true,
                status: true,
                bankName: true,
                bankAccountEncrypted: true,
                user: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!payment) {
      return res
        .status(404)
        .json({ status: "fail", message: "Payment not found" });
    }

    if (payment.status !== "APPROVED") {
      return res.status(409).json({
        status: "fail",
        message:
          "Bank details can only be shown for an approved payout request",
      });
    }

    const investor = payment.investment.investor;
    if (investor.status !== "VERIFIED") {
      return res
        .status(403)
        .json({ status: "fail", message: "This investor is not verified" });
    }

    if (investor.bankAccountEncrypted !== payment.bankAccountSnapshot) {
      return res.status(409).json({
        status: "fail",
        message:
          "The investor's bank details changed after this request was submitted. Ask Management to reject it.",
      });
    }

    const accountNumber = decryptBankAccount(
      payment.bankAccountSnapshot,
      investor.id
    );

    // no log, no number: write the log first
    await prisma.auditLog.create({
      data: {
        userId: financeId,
        action: "BANK_DETAILS_REVEALED",
        entityType: "Payment",
        entityId: payment.id,
        details: `investor: ${investor.id}`,
      },
    });

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      status: "success",
      data: {
        paymentId: payment.id,
        investorName: investor.user.name,
        bankName: investor.bankName,
        accountNumber,
        amount: payment.amount.toFixed(2),
      },
    });
  } catch (error) {
    console.error("Get payment bank details failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

export const processPayment = async (req: Request, res: Response) => {
  try {
    const financeId = req.user?.userId;
    if (!financeId) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const paymentId = req.params["paymentId"];
    if (typeof paymentId !== "string" || paymentId === "") {
      return res
        .status(400)
        .json({ status: "fail", message: "Payment id is required" });
    }

    const body = req.body ?? {};
    const reference = cleanReference(body.bankReference);
    if (reference === null) {
      return res.status(400).json({
        status: "fail",
        message:
          "Bank transfer reference must be 3 to 50 characters: letters, numbers, dash, underscore or slash",
      });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        status: true,
        amount: true,
        investmentId: true,
        investment: { select: { status: true } },
      },
    });
    if (!payment) {
      return res
        .status(404)
        .json({ status: "fail", message: "Payment not found" });
    }

    if (payment.status !== "APPROVED") {
      return res.status(409).json({
        status: "fail",
        message: "Only an approved payout request can be processed",
      });
    }

    if (
      payment.investment.status !== "ACTIVE" &&
      payment.investment.status !== "MATURED"
    ) {
      return res
        .status(409)
        .json({ status: "fail", message: "This investment is not active" });
    }

    const usedReference = await prisma.payment.findUnique({
      where: { bankReference: reference },
      select: { id: true },
    });
    if (usedReference) {
      return res.status(409).json({
        status: "fail",
        message: "This bank transfer reference has already been used",
      });
    }

    const now = new Date();
    const amountText = payment.amount.toFixed(2);

    await prisma.$transaction(
      async (tx) => {
        // only change it if it is still APPROVED
        const updatedPayment = await tx.payment.updateMany({
          where: { id: payment.id, status: "APPROVED" },
          data: {
            status: "PROCESSED",
            processedById: financeId,
            processedAt: now,
            bankReference: reference,
          },
        });
        if (updatedPayment.count === 0) {
          throw new Error("CONFLICT");
        }

        const updatedInvestment = await tx.investment.updateMany({
          where: {
            id: payment.investmentId,
            status: { in: ["ACTIVE", "MATURED"] },
          },
          data: { status: "PAID" },
        });
        if (updatedInvestment.count === 0) {
          throw new Error("CONFLICT");
        }

        await tx.auditLog.create({
          data: {
            userId: financeId,
            action: "PAYMENT_PROCESSED",
            entityType: "Payment",
            entityId: payment.id,
            details: `reference: ${reference}; amount: ${amountText}`,
          },
        });
      },
      { maxWait: 10000, timeout: 30000 }
    );

    return res.status(200).json({
      status: "success",
      data: {
        payment: {
          id: payment.id,
          status: "PROCESSED",
          bankReference: reference,
        },
        investment: { id: payment.investmentId, status: "PAID" },
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT") {
      return res.status(409).json({
        status: "fail",
        message: "This payout request cannot be processed right now",
      });
    }
    if (isUniqueError(error)) {
      return res.status(409).json({
        status: "fail",
        message: "This bank transfer reference has already been used",
      });
    }
    console.error("Process payment failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

//payment status
const INVESTOR_VISIBLE_PAYMENT_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "PROCESSED",
] as const;

// investor sees only their own payouts, never rejected ones
export const listMyPayments = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
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

    // the investor is found from the token, never from the request
    const where = {
      status: { in: [...INVESTOR_VISIBLE_PAYMENT_STATUSES] },
      investment: { investor: { userId } },
    };

    const [total, rows] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          amount: true,
          status: true,
          processedAt: true,
          investment: { select: { planName: true } },
        },
      }),
    ]);

    const payments = rows.map((row) => ({
      id: row.id,
      planName: row.investment.planName,
      amount: centsToText(amountToCents(row.amount.toFixed(2))),
      status: row.status,
      paidAt: row.status === "PROCESSED" ? row.processedAt : null,
    }));

    return res.status(200).json({
      status: "success",
      data: { payments, total, page, limit },
    });
  } catch (error) {
    console.error("List my payments failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};