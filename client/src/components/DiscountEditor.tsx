import { useState } from 'react';

import type { Book, DiscountType } from '@shared/api.js';

import PriceTag from './PriceTag.js';
import { useUpdateDiscount } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { messageOf } from '../utils/apiError.js';

/** The same ceiling the server holds (server/config/pricing.ts). */
const MAX_PERCENT = 90;

/** What a discount would make the price, before it is saved. */
const previewPrice = (price: number, type: DiscountType, value: number): number | null => {
  if (!Number.isInteger(value) || value < 1) return null;
  if (type === 'percent') return value <= MAX_PERCENT ? Math.max(1, Math.round((price * (100 - value)) / 100)) : null;
  return value < price && value / price <= MAX_PERCENT / 100 ? price - value : null;
};

/**
 * A seller's discount on one listing: a percentage off or an amount of taka
 * off, applied at once. A book with a discount appears in Quick deals on the
 * homepage and at the top of the catalogue, and checkout charges the sale
 * price.
 */
export default function DiscountEditor({ book }: { book: Book }) {
  const toast = useToast();
  const { mutateAsync, isPending } = useUpdateDiscount();
  const [type, setType] = useState<DiscountType | 'none'>(book.discountType ?? 'none');
  const [value, setValue] = useState(book.discountValue ? String(book.discountValue) : '');

  const price = Number(book.price);
  const amount = Number(value);
  const preview = type === 'none' ? null : previewPrice(price, type, amount);
  const unchanged =
    (type === 'none' && !book.discountType) ||
    (type === book.discountType && amount === Number(book.discountValue));

  const save = async () => {
    try {
      const res = await mutateAsync({
        bookId: book._id,
        discount: type === 'none' ? { type: 'none' } : { type, value: amount },
      });
      toast.success(res.message);
    } catch (error) {
      toast.error(messageOf(error) || 'Could not save the discount.');
    }
  };

  return (
    <div className="sl-discount">
      <PriceTag book={book} size="sm" />
      <div className="sl-discount-row">
        <select
          name="discountType"
          className="sl-edit"
          value={type}
          onChange={(e) => setType(e.target.value as DiscountType | 'none')}
          aria-label={`Discount type for ${book.title}`}
        >
          <option value="none">No discount</option>
          <option value="percent">% off</option>
          <option value="amount">৳ off</option>
        </select>
        {type !== 'none' && (
          <input
            name="discountValue"
            type="number"
            min={1}
            max={type === 'percent' ? MAX_PERCENT : Math.max(1, price - 1)}
            inputMode="numeric"
            className="sl-edit"
            style={{ width: 76 }}
            value={value}
            onChange={(e) => {
              if (/^\d*$/.test(e.target.value)) setValue(e.target.value);
            }}
            aria-label={type === 'percent' ? `Percent off ${book.title}` : `Taka off ${book.title}`}
            placeholder={type === 'percent' ? '10' : '50'}
          />
        )}
        <button
          type="button"
          className="btn btn-ghost sl-discount-save"
          onClick={save}
          disabled={isPending || unchanged || (type !== 'none' && preview === null)}
        >
          {isPending ? 'Saving…' : 'Apply'}
        </button>
      </div>
      {type !== 'none' && value !== '' && !unchanged && (
        <p className={`sl-discount-hint${preview === null ? ' is-bad' : ''}`} role="status">
          {preview === null
            ? type === 'percent'
              ? `Between 1% and ${MAX_PERCENT}%.`
              : `Less than the price, and at most ${MAX_PERCENT}% of it.`
            : `Sells for ৳${preview}.`}
        </p>
      )}
    </div>
  );
}
