import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma.js";
import { validateRegisterInput } from "../modules/auth/authValidation.js";

const seedManagement = async () => {
  const name = process.env["SEED_MANAGEMENT_NAME"];
  const email = process.env["SEED_MANAGEMENT_EMAIL"];
  const password = process.env["SEED_MANAGEMENT_PASSWORD"];

  if (!name || !email || !password) {
    console.error("Seed failed: SEED_MANAGEMENT_NAME, EMAIL and PASSWORD must be set");
    process.exitCode = 1;
    return;
  }

  // reuse the register checks (the phone is a dummy, only used to pass validation)
  const validationError = validateRegisterInput({
    name,
    email,
    phone: "08000000000",
    password,
  });
  if (validationError) {
    console.error(`Seed failed: ${validationError}`);
    process.exitCode = 1;
    return;
  }

  const existingManagement = await prisma.user.findFirst({
    where: { role: "MANAGEMENT" },
  });
  if (existingManagement) {
    console.log("Seed skipped: a Management user already exists");
    return;
  }

  const cleanEmail = email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email: cleanEmail },
  });
  if (existingUser) {
    console.error("Seed failed: this email is already used by another account");
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      name: name.trim(),
      email: cleanEmail,
      passwordHash,
      role: "MANAGEMENT",
    },
  });

  console.log(`Seed done: Management user created (${cleanEmail})`);
};

seedManagement()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });