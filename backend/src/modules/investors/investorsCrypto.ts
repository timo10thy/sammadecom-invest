import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

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

//bankdetails
export const decryptBankAccount = (
  stored: string,
  investorId: string
): string => {
  const parts = stored.split(":");
  const [version, ivHex, tagHex, dataHex] = parts;
  if (
    parts.length !== 4 ||
    version !== KEY_VERSION ||
    ivHex === undefined ||
    tagHex === undefined ||
    dataHex === undefined
  ) {
    throw new Error("Bank account value is not in a known format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAAD(Buffer.from(investorId, "utf8"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
};