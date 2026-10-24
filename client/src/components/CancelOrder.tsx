import { useState } from 'react';
import { FaTimesCircle } from 'react-icons/fa';

import type { OrderLine } from '@shared/api.js';

import { useCancelOrder } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { messageOf } from '../utils/apiError.js';
import { formatDate, formatNumber, pick, t } from '../utils/language.js';
import { CANCELLED } from '../utils/orderTotals.js';
import './CancelOrder.css';

const what = (who: 'buyer' | 'seller' | 'admin'): { button: string; note: string } => {
  switch (who) {
    case 'buyer':
      return {
        button: t('Cancel this order', 'অর্ডারটি বাতিল করুন'),
        note: t(
          'You can cancel until the seller starts preparing it. Nothing has been charged for cash on delivery.',
          'বিক্রেতা অর্ডারটি প্রস্তুত করা শুরু করার আগ পর্যন্ত বাতিল করতে পারবেন। ক্যাশ অন ডেলিভারিতে এখনো কিছু নেওয়া হয়নি।'
        ),
      };
    case 'seller':
      return {
        button: t('Cancel my books in this order', 'এই অর্ডারে আমার বই বাতিল করুন'),
        note: t(
          'Only your books in this order are cancelled, and they go back on sale. The buyer is told why.',
          'এই অর্ডারে শুধু আপনার বইগুলো বাতিল হবে, আর সেগুলো আবার বিক্রির জন্য ফিরে যাবে। ক্রেতাকে কারণ জানানো হবে।'
        ),
      };
    default:
      return {
        button: t('Cancel the order', 'অর্ডারটি বাতিল করুন'),
        note: t(
          'Every book still in the order is cancelled and goes back on sale. The buyer and sellers are told why.',
          'অর্ডারে থাকা প্রতিটি বই বাতিল হবে এবং আবার বিক্রির জন্য ফিরে যাবে। ক্রেতা ও বিক্রেতাদের কারণ জানানো হবে।'
        ),
      };
  }
};

const by = (who: string): string =>
  who === 'buyer'
    ? t('the buyer', 'ক্রেতা')
    : who === 'seller'
      ? t('the seller', 'বিক্রেতা')
      : who === 'admin'
        ? 'BookStoreBD'
        : who;

/** Who called off which books, when and why; nothing when none were. */
export function CancelledNote({ lines }: { lines: readonly OrderLine[] }) {
  const cancelled = lines.filter((line) => line.status === CANCELLED);
  if (!cancelled.length) return null;
  const first = cancelled[0];
  const all = cancelled.length === lines.length;
  return (
    <div className="co-cancelled" role="status">
      {pick(
        <p>
          <b>
            {all
              ? 'This order was cancelled'
              : `${cancelled.length} of ${lines.length} books in this order ${cancelled.length === 1 ? 'was' : 'were'} cancelled`}
          </b>
          {first.cancelledBy ? ` by ${by(first.cancelledBy)}` : ''}
          {first.cancelledAt ? ` on ${formatDate(first.cancelledAt, { dateStyle: 'medium' })}` : ''}.
        </p>,
        <p>
          <b>
            {all
              ? 'এই অর্ডারটি বাতিল হয়েছে'
              : `এই অর্ডারের ${formatNumber(lines.length)}টি বইয়ের মধ্যে ${formatNumber(cancelled.length)}টি বাতিল হয়েছে`}
          </b>
          {first.cancelledBy ? ` — বাতিল করেছেন ${by(first.cancelledBy)}` : ''}
          {first.cancelledAt ? `, ${formatDate(first.cancelledAt, { dateStyle: 'medium' })}` : ''}।
        </p>
      )}
      {first.cancelReason && (
        <p>
          {t('Reason', 'কারণ')}: “{first.cancelReason}”
        </p>
      )}
      {!all && (
        <p>
          {t(
            'They are not charged for, and the totals below leave them out.',
            'এগুলোর জন্য কোনো টাকা নেওয়া হবে না, আর নিচের মোট হিসাবে এগুলো ধরা হয়নি।'
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Calling an order off, with a second step so a slip of the thumb does not do
 * it. The reason is optional and goes to the others in the order.
 *
 * Shown only when the server says this person may cancel (`canCancel` on the
 * order), so the rules live in one place.
 */
export default function CancelOrder({ orderNumber, who }: { orderNumber: string; who: 'buyer' | 'seller' | 'admin' }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { mutateAsync: cancel, isPending } = useCancelOrder(orderNumber);
  const toast = useToast();

  const confirm = async () => {
    try {
      await cancel({ reason: reason.trim() || undefined });
      toast.success(
        who === 'seller'
          ? t('Your books in this order are cancelled.', 'এই অর্ডারে আপনার বইগুলো বাতিল হয়েছে।')
          : t('The order is cancelled.', 'অর্ডারটি বাতিল হয়েছে।')
      );
      setOpen(false);
    } catch (error) {
      toast.error(messageOf(error) || t('Could not cancel the order.', 'অর্ডারটি বাতিল করা যায়নি।'));
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
        <FaTimesCircle aria-hidden="true" />
        {what(who).button}
      </button>
    );
  }

  return (
    <div className="co-panel" role="group" aria-label={t('Cancel the order', 'অর্ডারটি বাতিল করুন')}>
      <p className="co-note">{what(who).note}</p>
      <label className="co-label">
        {t('Reason', 'কারণ')} <span>{t('(optional)', '(ঐচ্ছিক)')}</span>
        <textarea
          name="cancelReason"
          className="field"
          rows={2}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            who === 'buyer'
              ? t('Ordered the wrong book, found it elsewhere...', 'ভুল বই অর্ডার করেছি, অন্য কোথাও পেয়েছি...')
              : t('Out of stock, damaged copy...', 'স্টকে নেই, কপিটি নষ্ট...')
          }
        />
      </label>
      <div className="co-actions">
        <button type="button" className="btn btn-danger-solid" onClick={() => void confirm()} disabled={isPending}>
          {isPending ? t('Cancelling...', 'বাতিল হচ্ছে...') : t('Yes, cancel', 'হ্যাঁ, বাতিল করুন')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={isPending}>
          {t('Keep the order', 'অর্ডারটি রাখুন')}
        </button>
      </div>
    </div>
  );
}
