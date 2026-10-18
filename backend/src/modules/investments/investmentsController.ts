import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { CURRENT_ROI_PERCENT } from "./investmentsConfig.js";
import {
  amountToCents,
  cleanReference,
  isInvestmentStatus,
  parseDateOnly,
  parseMonth,
  parseWholeNumber,
  validateCorrectInvestmentInput,
  validateCreateInvestmentsInput,
} from "./investmentsValidation.js";
import { calculateReturnCents, centsToText } from "./investmentsMoney.js";
import { addSixMonths, getTodayInLagos } from "./investmentsDates.js";

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

//getinvestment
export const listInvestments = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role;
    if (!userId || !role) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }
    const isStaff = role === "STAFF";

    const rawStatus = req.query["status"];
    if (rawStatus !== undefined && !isInvestmentStatus(rawStatus)) {
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

    // return and created investment
    const where = {
      ...(rawStatus !== undefined ? { status: rawStatus } : {}),
      ...(isStaff
        ? { OR: [{ status: "RETURNED" as const }, { createdById: userId }] }
        : {}),
    };

    const [total, investments] = await Promise.all([
      prisma.investment.count({ where }),
      prisma.investment.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          planName: true,
          amount: true,
          roiPercent: true,
          status: true,
          startDate: true,
          maturityDate: true,
          reviewReason: true,
          createdAt: true,
          financeVerifiedAt: true,
          approvedAt: true,
          deposit: {
            select: { reference: true, totalAmount: true, datePaid: true },
          },
          investor: {
            select: {
              id: true,
              user: { select: { name: true, email: true } },
              // Staff never see bank details
              ...(isStaff ? {} : { bankName: true, bankAccountLast4: true }),
            },
          },
          createdBy: { select: { name: true } },
          financeVerifiedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
        },
      }),
    ]);

    return res.status(200).json({
      status: "success",
      data: { investments, total, page, limit },
    });
  } catch (error) {
    console.error("List investments failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

// investment approval
type ReviewAction = "VERIFY" | "APPROVE" | "RETURN" | "REJECT";

const isReviewAction = (value: unknown): value is ReviewAction =>
  value === "VERIFY" ||
  value === "APPROVE" ||
  value === "RETURN" ||
  value === "REJECT";

const REVIEW_NEW_STATUS = {
  VERIFY: "FINANCE_VERIFIED",
  APPROVE: "ACTIVE",
  RETURN: "RETURNED",
  REJECT: "REJECTED",
} as const;

const REVIEW_AUDIT_ACTION: Record<ReviewAction, string> = {
  VERIFY: "INVESTMENT_FINANCE_VERIFIED",
  APPROVE: "INVESTMENT_APPROVED",
  RETURN: "INVESTMENT_RETURNED",
  REJECT: "INVESTMENT_REJECTED",
};

// Finance cannot approve, Management cannot verify
const canDoAction = (role: string, action: ReviewAction): boolean => {
  if (role === "FINANCE") {
    return action !== "APPROVE";
  }
  if (role === "MANAGEMENT") {
    return action !== "VERIFY";
  }
  return false;
};

export const reviewInvestment = async (req: Request, res: Response) => {
  try {
    const reviewerId = req.user?.userId;
    const role = req.user?.role;
    if (!reviewerId || !role) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const investmentId = req.params["investmentId"];
    if (typeof investmentId !== "string" || investmentId === "") {
      return res
        .status(400)
        .json({ status: "fail", message: "Investment id is required" });
    }

    const body = req.body ?? {};
    const action: unknown = body.action;
    const reason: unknown = body.reason;

    if (!isReviewAction(action)) {
      return res.status(400).json({
        status: "fail",
        message: "Action must be VERIFY, APPROVE, RETURN or REJECT",
      });
    }
    if (!canDoAction(role, action)) {
      return res.status(403).json({
        status: "fail",
        message: "You do not have permission to do this",
      });
    }

    let cleanReason: string | null = null;
    if (action === "RETURN" || action === "REJECT") {
      if (typeof reason !== "string" || reason.trim().length < 5) {
        return res.status(400).json({
          status: "fail",
          message: "A reason of at least 5 characters is required",
        });
      }
      cleanReason = reason.trim();
    }

    const investment = await prisma.investment.findUnique({
      where: { id: investmentId },
      select: {
        id: true,
        status: true,
        investor: { select: { status: true } },
      },
    });
    if (!investment) {
      return res
        .status(404)
        .json({ status: "fail", message: "Investment not found" });
    }

    //pending status check Finance works on PENDING, Management works on FINANCE_VERIFIED
    const requiredStatus =
      role === "FINANCE" ? ("PENDING" as const) : ("FINANCE_VERIFIED" as const);
    if (investment.status !== requiredStatus) {
      return res.status(409).json({
        status: "fail",
        message: "This status change is not allowed",
      });
    }

    // the investor is checked 
    if (
      (action === "VERIFY" || action === "APPROVE") &&
      investment.investor.status !== "VERIFIED"
    ) {
      return res.status(403).json({
        status: "fail",
        message: "This investor is not verified",
      });
    }

    const now = new Date();
    const newStatus = REVIEW_NEW_STATUS[action];
    let startDate: Date | null = null;
    let maturityDate: Date | null = null;
    if (action === "APPROVE") {
      startDate = getTodayInLagos();
      maturityDate = addSixMonths(startDate);
    }

    const done = await prisma.$transaction(async (tx) => {
      // status check
      const where = { id: investment.id, status: requiredStatus };
      let updatedCount = 0;

      if (action === "VERIFY") {
        const result = await tx.investment.updateMany({
          where,
          data: {
            status: newStatus,
            financeVerifiedById: reviewerId,
            financeVerifiedAt: now,
            reviewReason: null,
          },
        });
        updatedCount = result.count;
      } else if (action === "APPROVE") {
        const result = await tx.investment.updateMany({
          where,
          data: {
            status: newStatus,
            approvedById: reviewerId,
            approvedAt: now,
            startDate,
            maturityDate,
            reviewReason: null,
          },
        });
        updatedCount = result.count;
      } else if (action === "RETURN") {
        //  Finance check is cleared
        const result = await tx.investment.updateMany({
          where,
          data: {
            status: newStatus,
            reviewReason: cleanReason,
            financeVerifiedById: null,
            financeVerifiedAt: null,
          },
        });
        updatedCount = result.count;
      } else {
        const result = await tx.investment.updateMany({
          where,
          data: { status: newStatus, reviewReason: cleanReason },
        });
        updatedCount = result.count;
      }

      if (updatedCount === 0) {
        return false;
      }

      await tx.auditLog.create({
        data: {
          userId: reviewerId,
          action: REVIEW_AUDIT_ACTION[action],
          entityType: "Investment",
          entityId: investment.id,
        },
      });

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
      data: {
        investment: {
          id: investment.id,
          status: newStatus,
          startDate,
          maturityDate,
        },
      },
    });
  } catch (error) {
    console.error("Review investment failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

//PATCH correction by stafff
export const correctInvestment = async (req: Request, res: Response) => {
  try {
    const staffId = req.user?.userId;
    if (!staffId) {
      return res
        .status(401)
        .json({ status: "fail", message: "Invalid or expired token" });
    }

    const investmentId = req.params["investmentId"];
    if (typeof investmentId !== "string" || investmentId === "") {
      return res
        .status(400)
        .json({ status: "fail", message: "Investment id is required" });
    }

    const body = req.body ?? {};
    const validationError = validateCorrectInvestmentInput(body);
    if (validationError) {
      return res.status(400).json({ status: "fail", message: validationError });
    }

    const { planName, amount, deposit } = body as {
      planName?: string;
      amount?: string;
      deposit?: { totalAmount?: string; datePaid?: string };
    };
    const newDatePaid =
      deposit?.datePaid !== undefined ? parseDateOnly(deposit.datePaid) : null;

    const investment = await prisma.investment.findUnique({
      where: { id: investmentId },
      select: {
        id: true,
        status: true,
        planName: true,
        amount: true,
        depositId: true,
        deposit: { select: { id: true, totalAmount: true, datePaid: true } },
      },
    });
    if (!investment) {
      return res
        .status(404)
        .json({ status: "fail", message: "Investment not found" });
    }
    if (investment.status !== "RETURNED") {
      return res.status(409).json({
        status: "fail",
        message: "Only a returned investment can be corrected",
      });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        // the Deposit is locked once Finance verified any investment under it
        if (deposit !== undefined) {
          const underDeposit = await tx.investment.findMany({
            where: { depositId: investment.depositId },
            select: { id: true },
          });
          const verifiedCount = await tx.auditLog.count({
            where: {
              action: "INVESTMENT_FINANCE_VERIFIED",
              entityType: "Investment",
              entityId: { in: underDeposit.map((item) => item.id) },
            },
          });
          if (verifiedCount > 0) {
            return "LOCKED" as const;
          }
        }

        // Rule 2: investments that are not rejected cannot add up to more than the Deposit
        const siblings = await tx.investment.findMany({
          where: {
            depositId: investment.depositId,
            status: { not: "REJECTED" },
          },
          select: { id: true, amount: true },
        });
        const newTotal =
          deposit?.totalAmount ?? investment.deposit.totalAmount.toFixed(2);
        let sum = BigInt(0);
        for (const sibling of siblings) {
          const text =
            sibling.id === investment.id
              ? (amount ?? sibling.amount.toFixed(2))
              : sibling.amount.toFixed(2);
          sum += amountToCents(text);
        }
        if (sum > amountToCents(newTotal)) {
          return "TOO_MUCH" as const;
        }

        const investmentData: { planName?: string; amount?: string } = {};
        const investmentChanges: string[] = [];
        if (planName !== undefined) {
          investmentData.planName = planName.trim();
          investmentChanges.push(
            `planName: ${investment.planName} -> ${planName.trim()}`
          );
        }
        if (amount !== undefined) {
          investmentData.amount = amount;
          investmentChanges.push(
            `amount: ${investment.amount.toFixed(2)} -> ${amount}`
          );
        }

        // only change it if the investment is still RETURNED
        const updated = await tx.investment.updateMany({
          where: { id: investment.id, status: "RETURNED" },
          data: { ...investmentData, status: "PENDING" },
        });
        if (updated.count === 0) {
          return "CHANGED" as const;
        }

        await tx.auditLog.create({
          data: {
            userId: staffId,
            action: "INVESTMENT_CORRECTED",
            entityType: "Investment",
            entityId: investment.id,
            details:
              investmentChanges.length > 0
                ? investmentChanges.join("; ")
                : "resubmitted with no change to the investment",
          },
        });

        if (deposit !== undefined) {
          const depositData: { totalAmount?: string; datePaid?: Date } = {};
          const depositChanges: string[] = [];
          if (deposit.totalAmount !== undefined) {
            depositData.totalAmount = deposit.totalAmount;
            depositChanges.push(
              `totalAmount: ${investment.deposit.totalAmount.toFixed(2)} -> ${deposit.totalAmount}`
            );
          }
          if (newDatePaid !== null) {
            depositData.datePaid = newDatePaid;
            depositChanges.push(
              `datePaid: ${investment.deposit.datePaid.toISOString().slice(0, 10)} -> ${deposit.datePaid}`
            );
          }

          await tx.deposit.update({
            where: { id: investment.deposit.id },
            data: depositData,
          });
          await tx.auditLog.create({
            data: {
              userId: staffId,
              action: "DEPOSIT_CORRECTED",
              entityType: "Deposit",
              entityId: investment.deposit.id,
              details: depositChanges.join("; "),
            },
          });
        }

        return "OK" as const;
      },
      { maxWait: 10000, timeout: 30000 }
    );

    if (result === "LOCKED") {
      return res.status(409).json({
        status: "fail",
        message:
          "The Deposit is locked because Finance already verified an investment under it",
      });
    }
    if (result === "TOO_MUCH") {
      return res.status(400).json({
        status: "fail",
        message: "The investments would add up to more than the Deposit amount",
      });
    }
    if (result === "CHANGED") {
      return res.status(409).json({
        status: "fail",
        message: "This investment cannot be corrected right now",
      });
    }

    return res.status(200).json({
      status: "success",
      data: { investment: { id: investment.id, status: "PENDING" } },
    });
  } catch (error) {
    console.error("Correct investment failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};

//investment due date 
export const listDueInvestments = async (req: Request, res: Response) => {
  try {
    let year: number;
    let month: number;

    const rawMonth = req.query["month"];
    if (rawMonth === undefined) {
      const today = getTodayInLagos();
      year = today.getUTCFullYear();
      month = today.getUTCMonth() + 1;
    } else {
      const parsed = parseMonth(rawMonth);
      if (parsed === null) {
        return res.status(400).json({
          status: "fail",
          message: "Month must be in the form YYYY-MM",
        });
      }
      year = parsed.year;
      month = parsed.month;
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const nextMonthStart = new Date(Date.UTC(year, month, 1));

    // not paid yet, maturity date in this month or earlier
    const items = await prisma.investment.findMany({
      where: {
        status: { in: ["ACTIVE", "MATURED"] },
        maturityDate: { lt: nextMonthStart },
      },
      orderBy: [{ maturityDate: "asc" }, { id: "asc" }],
      select: {
        id: true,
        planName: true,
        amount: true,
        roiPercent: true,
        status: true,
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
    });

    let totalCents = BigInt(0);
    let lateCount = 0;
    const rows = [];

    for (const item of items) {
      if (item.maturityDate === null) {
        continue;
      }
      const amountText = item.amount.toFixed(2);
      const roiText = item.roiPercent.toFixed(2);
      const returnCents = calculateReturnCents(amountText, roiText);
      const payCents = amountToCents(amountText) + returnCents;
      totalCents += payCents;

      // earlier than this month means late
      const late = item.maturityDate < monthStart;
      if (late) {
        lateCount += 1;
      }

      rows.push({
        id: item.id,
        planName: item.planName,
        status: item.status,
        amount: amountText,
        roiPercent: roiText,
        returnAmount: centsToText(returnCents),
        amountToPay: centsToText(payCents),
        maturityDate: item.maturityDate,
        late,
        investor: item.investor,
      });
    }

    return res.status(200).json({
      status: "success",
      data: {
        month: `${year}-${String(month).padStart(2, "0")}`,
        investments: rows,
        summary: {
          count: rows.length,
          lateCount,
          totalAmountToPay: centsToText(totalCents),
        },
      },
    });
  } catch (error) {
    console.error("List due investments failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};