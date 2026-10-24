import { useState } from 'react';

import type { Book, DiscountType } from '@shared/api.js';

import PriceTag from './PriceTag.js';
import { useUpdateDiscount } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { messageOf } from '../utils/apiError.js';
import { formatNumber, t } from '../utils/language.js';

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
      toast.error(messageOf(error) || t('Could not save the discount.', 'ছাড় সংরক্ষণ করা যায়নি।'));
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
          aria-label={t(`Discount type for ${book.title}`, `${book.title}-এর ছাড়ের ধরন`)}
        >
          <option value="none">{t('No discount', 'ছাড় নেই')}</option>
          <option value="percent">{t('% off', '% ছাড়')}</option>
          <option value="amount">{t('৳ off', '৳ ছাড়')}</option>
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
            aria-label={
              type === 'percent'
                ? t(`Percent off ${book.title}`, `${book.title}-এ শতকরা ছাড়`)
                : t(`Taka off ${book.title}`, `${book.title}-এ টাকা ছাড়`)
            }
            placeholder={type === 'percent' ? '10' : '50'}
          />
        )}
        <button
          type="button"
          className="btn btn-ghost sl-discount-save"
          onClick={save}
          disabled={isPending || unchanged || (type !== 'none' && preview === null)}
        >
          {isPending ? t('Saving…', 'সংরক্ষণ হচ্ছে…') : t('Apply', 'প্রয়োগ করুন')}
        </button>
      </div>
      {type !== 'none' && value !== '' && !unchanged && (
        <p className={`sl-discount-hint${preview === null ? ' is-bad' : ''}`} role="status">
          {preview === null
            ? type === 'percent'
              ? t(`Between 1% and ${MAX_PERCENT}%.`, `${formatNumber(1)}% থেকে ${formatNumber(MAX_PERCENT)}%-এর মধ্যে।`)
              : t(
                  `Less than the price, and at most ${MAX_PERCENT}% of it.`,
                  `দামের চেয়ে কম, এবং দামের সর্বোচ্চ ${formatNumber(MAX_PERCENT)}%।`
                )
            : t(`Sells for ৳${preview}.`, `বিক্রি হবে ৳${formatNumber(preview)}-এ।`)}
        </p>
      )}
    </div>
  );
}
