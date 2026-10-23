import cron from "node-cron";
import { prisma } from "../config/prisma.js";

export const markMaturedInvestments = async () => {
  try {
    const systemUser = await prisma.user.findFirst({
      where: { role: "SYSTEM" },
      select: { id: true },
    });
    if (!systemUser) {
      console.error("Maturity job stopped: System user not found");
      return;
    }

    const dueInvestments = await prisma.investment.findMany({
      where: { status: "ACTIVE", maturityDate: { lte: new Date() } },
      select: { id: true },
    });

    let maturedCount = 0;

    for (const item of dueInvestments) {
      try {
        const changed = await prisma.$transaction(async (tx) => {
          // only change it if it is still ACTIVE right now
          const result = await tx.investment.updateMany({
            where: { id: item.id, status: "ACTIVE" },
            data: { status: "MATURED" },
          });
          if (result.count === 0) {
            return false;
          }

          await tx.auditLog.create({
            data: {
              userId: systemUser.id,
              action: "INVESTMENT_MATURED",
              entityType: "Investment",
              entityId: item.id,
              details: "matured automatically",
            },
          });
          return true;
        });

        if (changed) {
          maturedCount += 1;
        }
      } catch (error) {
        console.error(`Maturity job failed for investment ${item.id}:`, error);
      }
    }

    console.log(`Maturity job: ${maturedCount} investments set to MATURED`);
  } catch (error) {
    console.error("Maturity job failed:", error);
  }
};

export const startMaturityJob = () => {
  cron.schedule(
    "0 1 * * *",
    () => {
      markMaturedInvestments();
    },
    { timezone: "Africa/Lagos" }
  );

  console.log("Maturity job scheduled to run daily at 1:00 AM Lagos time");
};