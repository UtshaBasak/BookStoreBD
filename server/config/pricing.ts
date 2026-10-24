/**
 * A seller's discount on a listing, and the price it comes to.
 *
 * A discount is either a percentage off or an amount of taka off, set by the
 * seller of that book. The listed `price` stays what it was - it is what the
 * discount is measured against, and what the page shows struck through - and
 * the book carries three figures worked out from it:
 *
 * - `salePrice`, what the buyer pays: the price checkout charges and the
 *   price the catalogue filters and sorts by;
 * - `discountPercent`, how much cheaper that is as a share of the price, which
 *   is what the homepage's Quick deals rank by, whichever way the discount
 *   was given;
 * - `discountAmount`, the taka saved, for ranking by the size of the saving.
 *
 * They are stored rather than computed on read so that MongoDB can sort and
 * page by them against an index.
 */

import { bnDigits, inLanguage, type Language } from '../utils/language.js';

export type DiscountType = 'percent' | 'amount';

/** A deal of more than this is not a deal, it is a mistake or a lure. */
export const MAX_DISCOUNT_PERCENT = 90;

export interface Discount {
  type: DiscountType | null;
  value: number;
}

export interface PricedFields {
  salePrice: number;
  discountPercent: number;
  discountAmount: number;
}

/** Why a discount cannot be applied to a price, or null when it can. */
export const discountProblem = (price: number, discount: Discount, language: Language = 'en'): string | null => {
  if (!discount.type) return null;
  const { value } = discount;
  const say = (en: string, bn: string): string => inLanguage(language, en, bn);
  if (!Number.isInteger(value) || value < 1) {
    return say('A discount has to be a whole number of at least 1', 'ছাড় অবশ্যই কমপক্ষে ১ বা তার বেশি একটি পূর্ণ সংখ্যা হতে হবে');
  }
  if (!(price > 0)) return say('A book listed for free cannot be discounted', 'বিনামূল্যে তালিকাভুক্ত বইয়ে ছাড় দেওয়া যায় না');
  if (discount.type === 'percent' && value > MAX_DISCOUNT_PERCENT) {
    return say(`A discount can be at most ${MAX_DISCOUNT_PERCENT}%`, `ছাড় সর্বোচ্চ ${bnDigits(MAX_DISCOUNT_PERCENT)}% হতে পারে`);
  }
  if (discount.type === 'amount') {
    if (value >= price) return say('The discount has to be less than the price', 'ছাড় দামের চেয়ে কম হতে হবে');
    if (value / price > MAX_DISCOUNT_PERCENT / 100) {
      return say(
        `A discount can be at most ${MAX_DISCOUNT_PERCENT}% of the price`,
        `ছাড় দামের সর্বোচ্চ ${bnDigits(MAX_DISCOUNT_PERCENT)}% হতে পারে`
      );
    }
  }
  // Prices are whole taka: a percentage that rounds to nothing off saves the
  // buyer nothing, and saying "Discount saved" for it would be untrue.
  if (discount.type === 'percent' && Math.max(1, Math.round((price * (100 - value)) / 100)) >= price) {
    return say(
      'That discount comes to less than 1 Tk on this price. Try a larger one.',
      'এই দামে ছাড়টি ১ টাকার কম হয়। একটু বেশি ছাড় দিন।'
    );
  }
  return null;
};

/**
 * The figures a listing carries for its price and discount. A discount that
 * no longer fits the price - an amount off larger than a price since lowered -
 * is treated as none, rather than selling the book for nothing.
 */
export const priceWith = (price: number, discount: Discount): PricedFields => {
  if (!discount.type || discountProblem(price, discount)) {
    return { salePrice: price, discountPercent: 0, discountAmount: 0 };
  }
  const salePrice =
    discount.type === 'percent'
      ? Math.max(1, Math.round((price * (100 - discount.value)) / 100))
      : price - discount.value;
  const discountAmount = price - salePrice;
  return {
    salePrice,
    discountPercent: discount.type === 'percent' ? discount.value : Math.round((discountAmount / price) * 100),
    discountAmount,
  };
};

/** What a buyer pays for one copy: the sale price when there is one. */
export const unitPriceOf = (book: { price?: number | null; salePrice?: number | null }): number =>
  Number(book.salePrice ?? book.price ?? 0);
