import cron from "node-cron";
import { prisma } from "../config/prisma.js";

export const cleanupExpiredTokens = async () => {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    console.log(`Token cleanup: removed ${result.count} expired refresh tokens`);
  } catch (error) {
    console.error("Token cleanup failed:", error);
  }
};

export const startTokenCleanupJob = () => {
  cron.schedule("0 * * * *", () => {
    cleanupExpiredTokens();
  });

  console.log("Token cleanup job scheduled to run hourly");
};