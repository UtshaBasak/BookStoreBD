/**
 * The shop's rules that cost somebody money: what delivery costs, and how long
 * a buyer has to send a book back.
 *
 * The delivery charge is worked out here, from the delivery district, so a
 * checkout request cannot name its own price; the figure the browser shows is
 * only a preview of it.
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
// Free delivery on a large order is the "FreeDelivery" promo code in
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
  | 'cancelled'
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
  // A cancelled book was never sent, so nothing is owed for it.
  if (line.status === CANCELLED) return 'cancelled';
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
 * "Inside Dhaka" is the district, not the division: the division takes in
 * Tangail, Faridpur and Kishoreganj, which no courier prices as inside Dhaka.
 */
export const isInsideDhaka = (district: string | undefined): boolean =>
  (district ?? '').trim().toLowerCase() === 'dhaka';

export const deliveryChargeFor = (district: string | undefined): number =>
  isInsideDhaka(district) ? DELIVERY.insideDhaka : DELIVERY.outsideDhaka;

/**
 * When an order line stops being returnable, or null if it cannot be returned
 * at all yet.
 *
 * The window opens on delivery rather than on the order date, so a slow
 * delivery never uses it up, and the server enforces it.
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

/**
 * Why this person cannot move an order from one status to another, or null
 * when they can.
 *
 * A seller moves their books forward only, up to Shipped: stepping back would
 * let them cancel a parcel already with the courier. The shop may step back
 * to correct a mistake, except out of Delivered once the seller has been paid
 * or the buyer has asked for a return (`deliveredLocked`), since delivery is
 * what opens the return window and starts the payout.
 */
export const statusChangeProblem = (
  role: 'admin' | 'seller',
  from: string | null | undefined,
  to: string,
  { deliveredLocked = false }: { deliveredLocked?: boolean } = {}
): string | null => {
  if (from === CANCELLED) return 'A cancelled order cannot be changed.';
  if (stageOf(to) === -1) return 'That is not a status an order can have.';
  if (role === 'admin') {
    if (from === 'Delivered' && to !== 'Delivered' && deliveredLocked) {
      return 'This order has been paid out or has a return request, so it stays Delivered.';
    }
    return null;
  }
  if (stageOf(from) > stageOf(SELLER_LAST_STAGE)) {
    return 'Once an order is past Shipped, only the shop can update it.';
  }
  if (stageOf(to) > stageOf(SELLER_LAST_STAGE)) {
    return 'Out for Delivery and Delivered are set by the shop.';
  }
  if (stageOf(to) < stageOf(from)) {
    return 'An order moves forward only. Message the shop if it needs correcting.';
  }
  return null;
};

/**
 * Where an order stands for the person looking at it: the least advanced of
 * its live books, so an order is only "Shipped" once every book in it is.
 * Cancelled when nothing is left in it.
 */
export const orderStatusOf = (lines: readonly { status?: string | null }[]): string => {
  const live = lines.filter((line) => line.status !== CANCELLED);
  if (!live.length) return CANCELLED;
  return live.reduce<string>((least, line) => {
    const status = line.status || 'Order Confirmed';
    return stageOf(status) < stageOf(least) ? status : least;
  }, live[0]?.status || 'Order Confirmed');
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

/** Whether every live book among these may be cancelled by this person - what a cancel needs. */
export const canCancelLines = (
  who: 'buyer' | 'seller' | 'admin',
  lines: readonly { status?: string | null }[]
): boolean => {
  const live = lines.filter((line) => line.status !== CANCELLED);
  return live.length > 0 && live.every((line) => canCancel(who, line.status));
};

/** How an order is paid. Cash on delivery is the only way offered. */
export const PAYMENT_METHODS = ['Cash on Delivery'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * An order's charges on the books still in it.
 *
 * A promo discount never comes to more than the books left: when a seller
 * cancels part of an order, a fixed discount shrinks with it rather than
 * paying for delivery. Free delivery, once given, stays - the buyer did not
 * choose to have part of the order cancelled.
 */
export const orderChargesFor = (
  lines: readonly { status?: string | null; price?: number | null; quantity?: number | null; shippingCharge?: number | null; discount?: number | null }[]
): { booksTotal: number; shippingCost: number; discount: number; totalCost: number } => {
  const live = lines.filter((line) => line.status !== CANCELLED);
  const booksTotal = live.reduce((sum, line) => sum + Number(line.price ?? 0) * Number(line.quantity ?? 1), 0);
  const shippingCost = live.length ? Number(lines[0]?.shippingCharge ?? 0) : 0;
  const discount = live.length ? Math.min(Number(lines[0]?.discount ?? 0), booksTotal) : 0;
  return {
    booksTotal,
    shippingCost,
    discount,
    totalCost: Math.round((booksTotal + shippingCost - discount) * 100) / 100,
  };
};
