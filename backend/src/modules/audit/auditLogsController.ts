import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { parseWholeNumber } from "../investments/investmentsValidation.js";

const ALLOWED_FILTER_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

const cleanFilter = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (text.length === 0 || text.length > maxLength) {
    return null;
  }
  const ok = text.split("").every((c) => ALLOWED_FILTER_CHARS.includes(c));
  return ok ? text : null;
};

export const listAuditLogs = async (req: Request, res: Response) => {
  try {
    let action: string | undefined;
    const rawAction = req.query["action"];
    if (rawAction !== undefined) {
      const cleaned = cleanFilter(rawAction, 64);
      if (cleaned === null) {
        return res
          .status(400)
          .json({ status: "fail", message: "Invalid action filter" });
      }
      action = cleaned;
    }

    let entityType: string | undefined;
    const rawEntityType = req.query["entityType"];
    if (rawEntityType !== undefined) {
      const cleaned = cleanFilter(rawEntityType, 64);
      if (cleaned === null) {
        return res
          .status(400)
          .json({ status: "fail", message: "Invalid entityType filter" });
      }
      entityType = cleaned;
    }

    let entityId: string | undefined;
    const rawEntityId = req.query["entityId"];
    if (rawEntityId !== undefined) {
      const cleaned = cleanFilter(rawEntityId, 64);
      if (cleaned === null) {
        return res
          .status(400)
          .json({ status: "fail", message: "Invalid entityId filter" });
      }
      entityId = cleaned;
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

    const where = {
      ...(action !== undefined ? { action } : {}),
      ...(entityType !== undefined ? { entityType } : {}),
      ...(entityId !== undefined ? { entityId } : {}),
    };

    const [total, auditLogs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        // soting by new first
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          details: true,
          createdAt: true,
          user: { select: { name: true, role: true } },
        },
      }),
    ]);

    return res.status(200).json({
      status: "success",
      data: { auditLogs, total, page, limit },
    });
  } catch (error) {
    console.error("List audit logs failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Something went wrong" });
  }
};