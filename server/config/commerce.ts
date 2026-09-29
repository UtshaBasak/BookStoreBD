/**
 * The shop's rules that cost somebody money: what delivery costs, and how long
 * a buyer has to send a book back.
 *
 * The browser used to decide the delivery charge and the server stored
 * whatever it was sent, so a checkout request could name its own price. It is
 * worked out here now, from the delivery district, and the figure the browser
 * shows is only a preview of it.
 *
 * The same numbers are quoted to people in `client/src/config/site.ts` - at
 * checkout and in the policy pages. Change one, change the other.
 */

export const DELIVERY = {
  /** Taka, for an address in Dhaka district. */
  insideDhaka: 70,
  /** Taka, for everywhere else. */
  outsideDhaka: 120,
  /** An order whose books come to this many taka or more is delivered free. */
  freeFrom: 1000,
} as const;

/** Days a buyer has to ask for a return, counted from delivery. */
export const RETURN_WINDOW_DAYS = 7;

/** The shop's share of a sale's book total. Listing is free; delivery is not included. */
export const SELLER_FEE_PERCENT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The fee on a book total, in taka, rounded to the paisa. */
export const sellerFeeFor = (booksTotal: number): number =>
  Math.round(booksTotal * SELLER_FEE_PERCENT) / 100;

/** What the seller is paid for a book total. */
export const sellerPayoutFor = (booksTotal: number): number =>
  Math.round((booksTotal - sellerFeeFor(booksTotal)) * 100) / 100;

/**
 * Where a seller's money for one order line has got to.
 *
 * A sale is paid out once the buyer can no longer return it: delivered, the
 * return window closed, and no return pending or approved. Paying before then
 * would mean clawing money back from a seller whenever a book came back.
 */
export type PayoutState =
  | 'awaiting-delivery'
  | 'in-return-window'
  | 'return-in-progress'
  | 'returned'
  | 'due'
  | 'paid';

export const payoutStateFor = (
  line: { status?: string | null; deliveredAt?: Date | null; sellerPaidAt?: Date | null },
  returnStatus: string | null | undefined,
  now: number = Date.now()
): PayoutState => {
  if (line.sellerPaidAt) return 'paid';
  if (returnStatus === 'approved') return 'returned';
  if (returnStatus === 'pending') return 'return-in-progress';
  const deadline = returnDeadline(line);
  if (!deadline) return 'awaiting-delivery';
  return deadline.getTime() > now ? 'in-return-window' : 'due';
};

/** Delivered at or before this moment means the return window has closed. */
export const returnWindowClosedBefore = (now: number = Date.now()): Date =>
  new Date(now - RETURN_WINDOW_DAYS * DAY_MS);

/**
 * "Inside Dhaka" is the district, not the division.
 *
 * Checkout used to charge the inside rate for the whole Dhaka division, which
 * takes in Tangail, Faridpur and Kishoreganj - addresses no courier prices as
 * inside Dhaka.
 */
export const isInsideDhaka = (district: string | undefined): boolean =>
  (district ?? '').trim().toLowerCase() === 'dhaka';

export const deliveryChargeFor = (district: string | undefined, booksTotal: number): number => {
  if (booksTotal >= DELIVERY.freeFrom) return 0;
  return isInsideDhaka(district) ? DELIVERY.insideDhaka : DELIVERY.outsideDhaka;
};

/**
 * When an order line stops being returnable, or null if it cannot be returned
 * at all yet.
 *
 * The window opens on delivery. It used to run for three days from the order
 * date, and only in the browser - so a book that took four days to reach
 * Sylhet had lost its return before it arrived, while the server accepted a
 * return for anything, at any time.
 */
export const returnDeadline = (line: {
  status?: string | null;
  deliveredAt?: Date | null;
}): Date | null => {
  if (line.status !== 'Delivered' || !line.deliveredAt) return null;
  return new Date(line.deliveredAt.getTime() + RETURN_WINDOW_DAYS * DAY_MS);
};
