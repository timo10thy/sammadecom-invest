import "dotenv/config";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { prisma } from "../config/prisma.js";

const SYSTEM_EMAIL = "system@sammadecom.internal";

const seedSystem = async () => {
  const existingSystem = await prisma.user.findFirst({
    where: { role: "SYSTEM" },
  });
  if (existingSystem) {
    console.log("Seed skipped: a System user already exists");
    return;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: SYSTEM_EMAIL },
  });
  if (existingUser) {
    console.error("Seed failed: this email is already used by another account");
    process.exitCode = 1;
    return;
  }

  // a long random password that is never saved or shown, so nobody knows it
  const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);

  await prisma.user.create({
    data: {
      name: "System",
      email: SYSTEM_EMAIL,
      passwordHash,
      role: "SYSTEM",
    },
  });

  console.log("Seed done: System user created");
};

seedSystem()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });