import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";

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