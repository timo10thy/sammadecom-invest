const MAX_INVESTMENTS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const isDigits = (value: string): boolean =>
  value !== "" && value.split("").every((c) => c >= "0" && c <= "9");


export const amountToCents = (value: string): bigint => {
  const parts = value.split(".");
  const whole = parts[0] ?? "0";
  const decimals = (parts[1] ?? "").padEnd(2, "0");
  return BigInt(whole) * BigInt(100) + BigInt(decimals);
};


export const isValidAmountText = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }
  const parts = value.split(".");
  if (parts.length > 2) {
    return false;
  }
  const whole = parts[0] ?? "";
  const decimals = parts[1];
  if (!isDigits(whole) || whole.length > 12) {
    return false;
  }
  if (decimals !== undefined) {
    if (!isDigits(decimals) || decimals.length > 2) {
      return false;
    }
  }
  return amountToCents(value) > BigInt(0);
};

// trims and changes to capital letters, returns null if not allowed
export const cleanReference = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const ref = value.trim().toUpperCase();
  if (ref.length < 3 || ref.length > 50) {
    return null;
  }
  const allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_/";
  const ok = ref.split("").every((c) => allowed.includes(c));
  return ok ? ref : null;
};

// date format
export const parseDateOnly = (value: unknown): Date | null => {
  if (typeof value !== "string") {
    return null;
  }
  const parts = value.split("-");
  const [y, m, d] = parts;
  if (parts.length !== 3 || y === undefined || m === undefined || d === undefined) {
    return null;
  }
  if (y.length !== 4 || m.length !== 2 || d.length !== 2) {
    return null;
  }
  if (!isDigits(y) || !isDigits(m) || !isDigits(d)) {
    return null;
  }
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
};

export const validateCreateInvestmentsInput = (
  body: unknown
): string | null => {
  if (typeof body !== "object" || body === null) {
    return "Request body is required";
  }
  const { investorId, deposit, investments } = body as {
    investorId?: unknown;
    deposit?: unknown;
    investments?: unknown;
  };

  if (typeof investorId !== "string" || investorId.trim() === "") {
    return "Investor id is required";
  }

  if (typeof deposit !== "object" || deposit === null) {
    return "Deposit is required";
  }
  const { reference, totalAmount, datePaid } = deposit as {
    reference?: unknown;
    totalAmount?: unknown;
    datePaid?: unknown;
  };

  if (cleanReference(reference) === null) {
    return "Reference must be 3 to 50 characters: letters, numbers, dash, underscore or slash";
  }
  if (!isValidAmountText(totalAmount)) {
    return "Deposit amount must be above 0, with digits and one dot only, and at most 2 decimals";
  }
  const paidDate = parseDateOnly(datePaid);
  if (paidDate === null) {
    return "Date paid must be a real date in the form YYYY-MM-DD";
  }
  // one day of room because Nigeria is ahead of UTC
  if (paidDate.getTime() > Date.now() + DAY_MS) {
    return "Date paid cannot be in the future";
  }

  if (!Array.isArray(investments) || investments.length === 0) {
    return "At least one investment is required";
  }
  if (investments.length > MAX_INVESTMENTS) {
    return `No more than ${MAX_INVESTMENTS} investments in one request`;
  }

  let sum = BigInt(0);
  for (const [index, item] of investments.entries()) {
    const label = `Investment ${index + 1}`;
    if (typeof item !== "object" || item === null) {
      return `${label}: details are required`;
    }
    const { planName, amount } = item as {
      planName?: unknown;
      amount?: unknown;
    };
    if (
      typeof planName !== "string" ||
      planName.trim().length < 2 ||
      planName.trim().length > 60
    ) {
      return `${label}: plan name must be 2 to 60 characters`;
    }
    if (!isValidAmountText(amount)) {
      return `${label}: amount must be above 0, with digits and one dot only, and at most 2 decimals`;
    }
    sum += amountToCents(amount);
  }

  if (sum > amountToCents(totalAmount)) {
    return "The investments add up to more than the Deposit amount";
  }

  return null;
};

//get investment validation
const INVESTMENT_STATUSES = [
  "PENDING",
  "FINANCE_VERIFIED",
  "ACTIVE",
  "MATURED",
  "PAID",
  "RETURNED",
  "REJECTED",
] as const;

export type InvestmentStatusValue = (typeof INVESTMENT_STATUSES)[number];

export const isInvestmentStatus = (
  value: unknown
): value is InvestmentStatusValue =>
  typeof value === "string" &&
  INVESTMENT_STATUSES.some((status) => status === value);

export const parseWholeNumber = (value: unknown): number | null => {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const allDigits = value.split("").every((c) => c >= "0" && c <= "9");
  if (!allDigits) {
    return null;
  }
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num < 1) {
    return null;
  }
  return num;
};