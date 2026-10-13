const isDigitsOnly = (value: string): boolean =>
    value.length > 0 && value.split("").every((c) => c >= "0" && c <= "9");
  
  export const validateProfileUpdateInput = (body: unknown): string | null => {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return "Nothing to update";
    }
  
    const { address, bankName, bankAccountNumber, currentPassword } =
      body as Record<string, unknown>;
  
    const hasAddress = address !== undefined;
    const hasBankName = bankName !== undefined;
    const hasAccountNumber = bankAccountNumber !== undefined;
  
    if (!hasAddress && !hasBankName && !hasAccountNumber) {
      return "Nothing to update";
    }
  
    if (hasAddress) {
      if (
        typeof address !== "string" ||
        address.trim().length < 5 ||
        address.trim().length > 200
      ) {
        return "Address must be between 5 and 200 characters";
      }
    }
  
    if (hasBankName) {
      if (
        typeof bankName !== "string" ||
        bankName.trim().length < 2 ||
        bankName.trim().length > 60
      ) {
        return "Bank name must be between 2 and 60 characters";
      }
    }
  
    if (hasAccountNumber) {
      if (
        typeof bankAccountNumber !== "string" ||
        bankAccountNumber.length !== 10 ||
        !isDigitsOnly(bankAccountNumber)
      ) {
        return "Account number must be exactly 10 digits";
      }
    }
  
    if (hasBankName !== hasAccountNumber) {
      return "Bank name and account number must be sent together";
    }
  
    if (
      hasBankName &&
      (typeof currentPassword !== "string" || currentPassword === "")
    ) {
      return "Current password is required to change bank details";
    }
  
    return null;
  };