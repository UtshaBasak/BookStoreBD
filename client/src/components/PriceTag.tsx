import type { Book } from '@shared/api.js';

import './PriceTag.css';
import { hasDeal, priceOf, taka } from '../utils/pricing.js';

/**
 * A book's price: on a deal, the sale price with the listed price struck
 * through beside it and what comes off. Read out as "Now ৳400, was ৳500" so a
 * screen reader does not announce two prices with nothing to tell them apart.
 */
export default function PriceTag({
  book,
  size = 'md',
  showSaving = true,
}: {
  book: Pick<Book, 'price' | 'salePrice' | 'discountPercent' | 'discountAmount' | 'discountType'>;
  size?: 'sm' | 'md' | 'lg';
  showSaving?: boolean;
}) {
  if (!hasDeal(book)) {
    return <span className={`price-tag price-tag-${size}`}><span className="price-now">{taka(priceOf(book))}</span></span>;
  }

  const saving =
    book.discountType === 'amount' ? `${taka(Number(book.discountAmount))} off` : `${Number(book.discountPercent)}% off`;

  return (
    <span className={`price-tag price-tag-${size}`}>
      <span className="price-now">
        <span className="sr-only">Now </span>
        {taka(priceOf(book))}
      </span>
      <s className="price-was">
        <span className="sr-only">, was </span>
        {taka(Number(book.price))}
      </s>
      {showSaving && <span className="price-off">{saving}</span>}
    </span>
  );
}
