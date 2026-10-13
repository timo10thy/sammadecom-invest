import { createCipheriv, randomBytes } from "node:crypto";

const KEY_VERSION = "v1";

const getKey = (): Buffer => {
  const hex = process.env["BANK_ENCRYPTION_KEY"];
  if (typeof hex !== "string" || hex.length !== 64) {
    throw new Error("BANK_ENCRYPTION_KEY must be 64 hex characters");
  }
  const allHex = hex
    .toLowerCase()
    .split("")
    .every((c) => "0123456789abcdef".includes(c));
  if (!allHex) {
    throw new Error("BANK_ENCRYPTION_KEY must be 64 hex characters");
  }
  return Buffer.from(hex, "hex");
};

export const encryptBankAccount = (
  accountNumber: string,
  investorId: string
): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  cipher.setAAD(Buffer.from(investorId, "utf8"));
  const encrypted = Buffer.concat([
    cipher.update(accountNumber, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    KEY_VERSION,
    iv.toString("hex"),
    tag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
};