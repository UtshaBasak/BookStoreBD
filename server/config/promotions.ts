/**
 * Promo codes and vouchers.
 *
 * There are none running. The one there was - "BookStore", 50 taka off a first
 * order - lived in the checkout page: the browser checked the code, worked out
 * the discount, remembered in localStorage whether the account had ordered
 * before, and sent the figure, which the server stored as given. Clearing
 * localStorage made every order a first order, and a hand-made request could
 * claim any discount at all.
 *
 * The rules live here now, and the discount is always worked out by the
 * server. To run a promotion, add it to `PROMOTIONS` and set `promoCodes` to
 * true in `client/src/config/site.ts`, which shows the code box at checkout.
 */

export interface Promotion {
  /** What the buyer types. Matched without regard to case or spaces. */
  code: string;
  /** Shown to the buyer when the code is accepted, e.g. "50 Tk off your first order". */
  description: string;
  /** Taka off, or a percentage of the book total. Never more than the books cost. */
  discount: { kind: 'fixed'; amount: number } | { kind: 'percent'; percent: number };
  /** Only on an order whose books come to at least this many taka. */
  minBooksTotal?: number;
  /** Only on an account's first order. */
  firstOrderOnly?: boolean;
  /** Only between these moments. */
  startsAt?: Date;
  endsAt?: Date;
}

export const PROMOTIONS: readonly Promotion[] = [
  // For example:
  // {
  //   code: 'WELCOME50',
  //   description: '50 Tk off your first order',
  //   discount: { kind: 'fixed', amount: 50 },
  //   firstOrderOnly: true,
  // },
];

const normalise = (code: string) => code.replace(/\s+/g, '').toUpperCase();

export const findPromotion = (
  code: string,
  promotions: readonly Promotion[] = PROMOTIONS
): Promotion | undefined => promotions.find((promo) => normalise(promo.code) === normalise(code));

export type PromotionResult =
  | { ok: true; code: string; description: string; discount: number }
  | { ok: false; message: string };

/**
 * What a code is worth on an order, or why it is not accepted.
 *
 * Pure, so the rules can be tested without any promotion running.
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

  const raw =
    promo.discount.kind === 'fixed'
      ? promo.discount.amount
      : (order.booksTotal * promo.discount.percent) / 100;
  // Never more than the books cost: a discount cannot pay for delivery or go
  // negative.
  const discount = Math.round(Math.min(raw, order.booksTotal) * 100) / 100;

  return { ok: true, code: promo.code, description: promo.description, discount };
};
