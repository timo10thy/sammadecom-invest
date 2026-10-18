const LAGOS_OFFSET_MS = 60 * 60 * 1000;

// nigeria time
export const getTodayInLagos = (): Date => {
  const lagosNow = new Date(Date.now() + LAGOS_OFFSET_MS);
  return new Date(
    Date.UTC(
      lagosNow.getUTCFullYear(),
      lagosNow.getUTCMonth(),
      lagosNow.getUTCDate()
    )
  );
};

// adds 6 months; calculation or the last date of the month
export const addSixMonths = (date: Date): Date => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 6;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
};