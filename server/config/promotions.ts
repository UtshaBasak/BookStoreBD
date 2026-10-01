/**
 * Promo codes and vouchers.
 *
 * What a code is worth, and whether an order is an account's first, is always
 * worked out by the server, so neither a cleared browser nor a hand-made
 * request can claim a discount. One code per order. The checkout code box is
 * shown while
 * `promoCodes` is true in `client/src/config/site.ts`; turn it off if this
 * list is ever emptied.
 */

export interface Promotion {
  /** What the buyer types. Matched without regard to case or spaces. */
  code: string;
  /** Shown to the buyer when the code is accepted, e.g. "50 Tk off your first order". */
  description: string;
  /**
   * Taka off, or a percentage of the book total - never more than the books
   * cost - or the delivery charge waived.
   */
  discount:
    | { kind: 'fixed'; amount: number }
    | { kind: 'percent'; percent: number }
    | { kind: 'free-delivery' };
  /** Only on an order whose books come to at least this many taka. */
  minBooksTotal?: number;
  /** Only on an account's first order. */
  firstOrderOnly?: boolean;
  /** Only between these moments. */
  startsAt?: Date;
  endsAt?: Date;
}

export const PROMOTIONS: readonly Promotion[] = [
  {
    code: 'BookStoreBD',
    description: '50 Tk off your first order',
    discount: { kind: 'fixed', amount: 50 },
    firstOrderOnly: true,
  },
  {
    // Free delivery on a large order is a code rather than automatic.
    code: 'FreeDelivery',
    description: 'Free delivery on orders of 1000 Tk or more',
    discount: { kind: 'free-delivery' },
    minBooksTotal: 1000,
  },
];

const normalise = (code: string) => code.replace(/\s+/g, '').toUpperCase();

export const findPromotion = (
  code: string,
  promotions: readonly Promotion[] = PROMOTIONS
): Promotion | undefined => promotions.find((promo) => normalise(promo.code) === normalise(code));

export type PromotionResult =
  | {
      ok: true;
      code: string;
      description: string;
      /** Taka off the books. */
      discount: number;
      /** Whether the delivery charge is waived. */
      freeDelivery: boolean;
    }
  | { ok: false; message: string };

/**
 * What a code is worth on an order, or why it is not accepted.
 *
 * Pure, so the rules can be tested with any promotion, running or not.
 */
export const applyPromotion = (
  promo: Promotion | undefined,
  order: { booksTotal: number; isFirstOrder: boolean },
  now: Date = new Date()
): PromotionResult => {
  if (!promo) return { ok: false, message: 'That code is not valid.' };
  if (promo.startsAt && now < promo.startsAt) return { ok: false, message: 'That code is not active yet.' };
  if (promo.endsAt && now > promo.endsAt) return { ok: false, message: 'That code has expired.' };
  if (promo.firstOrderOnly && !order.isFirstOrder) {
    return { ok: false, message: 'That code is for a first order only.' };
  }
  if (promo.minBooksTotal && order.booksTotal < promo.minBooksTotal) {
    return {
      ok: false,
      message: `That code needs books worth at least ${String(promo.minBooksTotal)} Tk.`,
    };
  }

  const accepted = { ok: true as const, code: promo.code, description: promo.description };

  if (promo.discount.kind === 'free-delivery') {
    return { ...accepted, discount: 0, freeDelivery: true };
  }

  const raw =
    promo.discount.kind === 'fixed'
      ? promo.discount.amount
      : (order.booksTotal * promo.discount.percent) / 100;
  // Never more than the books cost: a discount cannot pay for delivery or go
  // negative.
  const discount = Math.round(Math.min(raw, order.booksTotal) * 100) / 100;

  return { ...accepted, discount, freeDelivery: false };
};
