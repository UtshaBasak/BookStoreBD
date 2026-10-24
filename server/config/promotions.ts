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

import { bnDigits, inLanguage, type Language } from '../utils/language.js';

export interface Promotion {
  /** What the buyer types. Matched without regard to case or spaces. */
  code: string;
  /** Shown to the buyer when the code is accepted, e.g. "50 Tk off your first order". */
  description: string;
  /** The same in Bangla. */
  descriptionBn?: string;
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
    descriptionBn: 'প্রথম অর্ডারে ৫০ টাকা ছাড়',
    discount: { kind: 'fixed', amount: 50 },
    firstOrderOnly: true,
  },
  {
    // Free delivery on a large order is a code rather than automatic.
    code: 'FreeDelivery',
    description: 'Free delivery on orders of 1000 Tk or more',
    descriptionBn: '১০০০ টাকা বা তার বেশি অর্ডারে ফ্রি ডেলিভারি',
    discount: { kind: 'free-delivery' },
    minBooksTotal: 1000,
  },
];

const normalise = (code: string) => code.replace(/\s+/g, '').toUpperCase();

export const findPromotion = (
  code: string,
  promotions: readonly Promotion[] = PROMOTIONS
): Promotion | undefined => promotions.find((promo) => normalise(promo.code) === normalise(code));

/** A promotion's description in the language asked for. */
const describe = (promo: Promotion, language: Language | undefined): string =>
  inLanguage(language, promo.description, promo.descriptionBn || promo.description);

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
  order: { booksTotal: number; isFirstOrder: boolean; /** What the messages are written in; English when not given. */ language?: Language },
  now: Date = new Date()
): PromotionResult => {
  const say = (en: string, bn: string) => inLanguage(order.language, en, bn);
  if (!promo) return { ok: false, message: say('That code is not valid.', 'এই কোডটি সঠিক নয়।') };
  if (promo.startsAt && now < promo.startsAt) {
    return { ok: false, message: say('That code is not active yet.', 'এই কোডটি এখনো চালু হয়নি।') };
  }
  if (promo.endsAt && now > promo.endsAt) return { ok: false, message: say('That code has expired.', 'এই কোডের মেয়াদ শেষ হয়ে গেছে।') };
  if (promo.firstOrderOnly && !order.isFirstOrder) {
    return { ok: false, message: say('That code is for a first order only.', 'এই কোডটি শুধু প্রথম অর্ডারের জন্য।') };
  }
  if (promo.minBooksTotal && order.booksTotal < promo.minBooksTotal) {
    return {
      ok: false,
      message: say(
        `That code needs books worth at least ${String(promo.minBooksTotal)} Tk.`,
        `এই কোডের জন্য অন্তত ${bnDigits(promo.minBooksTotal)} টাকার বই লাগবে।`
      ),
    };
  }

  const accepted = { ok: true as const, code: promo.code, description: describe(promo, order.language) };

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

/** What a running code is, as shoppers are told about it at checkout. */
export interface AdvertisedPromotion {
  code: string;
  description: string;
}

/**
 * The codes checkout tells shoppers about - the first-order code and the
 * free-delivery code - when they are running, for the Android app (the
 * website names them in client/src/config/site.ts).
 */
export const advertisedPromotions = (
  now: Date = new Date(),
  promotions: readonly Promotion[] = PROMOTIONS,
  language: Language = 'en'
): {
  firstOrder: AdvertisedPromotion | null;
  freeDelivery: (AdvertisedPromotion & { minBooksTotal: number }) | null;
} => {
  const running = promotions.filter(
    (promo) => (!promo.startsAt || now >= promo.startsAt) && (!promo.endsAt || now <= promo.endsAt)
  );
  const first = running.find((promo) => promo.firstOrderOnly);
  const free = running.find((promo) => promo.discount.kind === 'free-delivery');
  return {
    firstOrder: first ? { code: first.code, description: describe(first, language) } : null,
    freeDelivery: free
      ? { code: free.code, description: describe(free, language), minBooksTotal: free.minBooksTotal ?? 0 }
      : null,
  };
};
