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
} as const;
// Free delivery on a large order is the "FreeDelivery" promo code now, in
// promotions.ts, rather than automatic.

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

export const deliveryChargeFor = (district: string | undefined): number =>
  isInsideDhaka(district) ? DELIVERY.insideDhaka : DELIVERY.outsideDhaka;

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

// ---------------------------------------------------------------- statuses

/** The steps an order goes through, in order. */
export const ORDER_STAGES = ['Order Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

/** Not a step: where an order goes when it is called off, and stays. */
export const CANCELLED = 'Cancelled';

/**
 * The last step a seller sets. Handing a parcel to the courier is theirs to
 * say; that it is out for delivery and that it arrived are the shop's, since
 * a seller marking their own sale delivered is what starts their payout.
 */
export const SELLER_LAST_STAGE: OrderStage = 'Shipped';

const stageOf = (status: string | null | undefined): number => ORDER_STAGES.indexOf((status ?? 'Order Confirmed') as OrderStage);

/** Why this person cannot move an order from one status to another, or null when they can. */
export const statusChangeProblem = (role: 'admin' | 'seller', from: string | null | undefined, to: string): string | null => {
  if (from === CANCELLED) return 'A cancelled order cannot be changed.';
  if (stageOf(to) === -1) return 'That is not a status an order can have.';
  if (role === 'admin') return null;
  if (stageOf(from) > stageOf(SELLER_LAST_STAGE)) {
    return 'Once an order is past Shipped, only the shop can update it.';
  }
  if (stageOf(to) > stageOf(SELLER_LAST_STAGE)) {
    return 'Out for Delivery and Delivered are set by the shop.';
  }
  return null;
};

/**
 * Who may call an order off, and until when:
 * - the buyer, until the seller has started on it (still Order Confirmed);
 * - the seller, until it has shipped;
 * - an administrator, until it has been delivered.
 */
export const canCancel = (who: 'buyer' | 'seller' | 'admin', status: string | null | undefined): boolean => {
  if (status === CANCELLED || status === 'Delivered') return false;
  if (who === 'admin') return true;
  if (who === 'seller') return stageOf(status) < stageOf(SELLER_LAST_STAGE);
  return stageOf(status) === 0;
};
