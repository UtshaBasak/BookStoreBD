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
export const discountProblem = (price: number, discount: Discount): string | null => {
  if (!discount.type) return null;
  const { value } = discount;
  if (!Number.isInteger(value) || value < 1) return 'A discount has to be a whole number of at least 1';
  if (!(price > 0)) return 'A book listed for free cannot be discounted';
  if (discount.type === 'percent' && value > MAX_DISCOUNT_PERCENT) {
    return `A discount can be at most ${MAX_DISCOUNT_PERCENT}%`;
  }
  if (discount.type === 'amount') {
    if (value >= price) return 'The discount has to be less than the price';
    if (value / price > MAX_DISCOUNT_PERCENT / 100) return `A discount can be at most ${MAX_DISCOUNT_PERCENT}% of the price`;
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
