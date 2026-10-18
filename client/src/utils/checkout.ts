/**
 * What checkout keeps between pages, and the checks it shares with the
 * server.
 */

/**
 * Where a confirmed order is kept: this tab's session storage, read back only
 * for its own order number. Signing out forgets it.
 */
export const CONFIRMED_ORDER_KEY = 'confirmedOrder';

/** Forgets a confirmed order, here and where older versions of the page kept it. */
export const forgetConfirmedOrder = (): void => {
  try {
    sessionStorage.removeItem(CONFIRMED_ORDER_KEY);
    localStorage.removeItem(CONFIRMED_ORDER_KEY);
  } catch {
    /* blocked storage: nothing was kept */
  }
};

/**
 * A Bangladeshi mobile number in the eleven-digit form the server keeps, or
 * null when it is not one. "+880 1712-345678", "8801712345678" and
 * "01712 345 678" are all 01712345678, as `bdMobile` in
 * server/schemas/common.ts has it.
 */
export const bdMobile = (value: string): string | null => {
  const digits = value.trim().replace(/[\s-]/g, '').replace(/^\+?880/, '0');
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
};
