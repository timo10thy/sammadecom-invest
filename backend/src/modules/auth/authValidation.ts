const SPECIAL_CHARACTERS = "!@#$%^&*()_+-=[]{}|;:'\",.<>/?`~\\";

const isDigit = (char: string): boolean => char >= "0" && char <= "9";
const isUpper = (char: string): boolean => char >= "A" && char <= "Z";

export const validateName = (name: string): string | null => {
  if (name.trim().length < 2) {
    return "Name must be at least 2 characters";
  }
  return null;
};

export const validateEmail = (email: string): string | null => {
  const invalid = "Enter a valid email address";
  if (email.includes(" ")) {
    return invalid;
  }
  const parts = email.split("@");
  const local = parts[0];
  const domain = parts[1];
  if (parts.length !== 2 || !local || !domain) {
    return invalid;
  }
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return invalid;
  }
  return null;
};

export const validatePhone = (phone: string): string | null => {
  if (phone.length !== 11 || !phone.startsWith("0")) {
    return "Phone number must be 11 digits and start with 0";
  }
  for (const char of phone) {
    if (!isDigit(char)) {
      return "Phone number must contain digits only";
    }
  }
  return null;
};

export const validatePassword = (password: string): string | null => {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (password.length > 72) {
    return "Password must be at most 72 characters";
  }

  let hasUpper = false;
  let hasDigit = false;
  let hasSpecial = false;

  for (const char of password) {
    if (isUpper(char)) {
      hasUpper = true;
    } else if (isDigit(char)) {
      hasDigit = true;
    } else if (SPECIAL_CHARACTERS.includes(char)) {
      hasSpecial = true;
    }
  }

  if (!hasUpper) {
    return "Password must contain an uppercase letter";
  }
  if (!hasDigit) {
    return "Password must contain a number";
  }
  if (!hasSpecial) {
    return "Password must contain a special character";
  }
  return null;
};

export const validateRegisterInput = (
  body: Record<string, unknown>
): string | null => {
  const { name, email, phone, password } = body;

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof phone !== "string" ||
    typeof password !== "string"
  ) {
    return "Name, email, phone and password are required";
  }

  return (
    validateName(name) ??
    validateEmail(email) ??
    validatePhone(phone) ??
    validatePassword(password)
  );
};

export const CREATABLE_ROLES = ["STAFF", "FINANCE", "MANAGEMENT"] as const;
export type CreatableRole = (typeof CREATABLE_ROLES)[number];

export const isCreatableRole = (role: unknown): role is CreatableRole => {
  return (
    typeof role === "string" &&
    (CREATABLE_ROLES as readonly string[]).includes(role)
  );
};

export const validateCreateUserInput = (
  body: Record<string, unknown>
): string | null => {
  const { name, email, role, password } = body;

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return "Name, email, role and password are required";
  }

  if (!isCreatableRole(role)) {
    return "Role must be STAFF, FINANCE or MANAGEMENT";
  }

  return validateName(name) ?? validateEmail(email) ?? validatePassword(password);
};