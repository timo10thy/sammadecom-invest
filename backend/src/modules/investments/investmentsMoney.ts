import { amountToCents } from "./investmentsValidation.js";

// conversion from kobo to naira
export const centsToText = (cents: bigint): string => {
  const whole = cents / BigInt(100);
  const part = (cents % BigInt(100)).toString().padStart(2, "0");
  return `${whole}.${part}`;
};

// calculating return 
export const calculateReturnCents = (
  amount: string,
  roiPercent: string
): bigint => {
  const principal = amountToCents(amount);
  const roi = amountToCents(roiPercent); 
  return (principal * roi + BigInt(5000)) / BigInt(10000);
};