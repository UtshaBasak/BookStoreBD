import { useState } from 'react';
import { FaTimesCircle } from 'react-icons/fa';

import type { OrderLine } from '@shared/api.js';

import { useCancelOrder } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { messageOf } from '../utils/apiError.js';
import { CANCELLED } from '../utils/orderTotals.js';
import './CancelOrder.css';

const WHAT: Record<'buyer' | 'seller' | 'admin', { button: string; note: string }> = {
  buyer: {
    button: 'Cancel this order',
    note: 'You can cancel until the seller starts preparing it. Nothing has been charged for cash on delivery.',
  },
  seller: {
    button: 'Cancel my books in this order',
    note: 'Only your books in this order are cancelled, and they go back on sale. The buyer is told why.',
  },
  admin: {
    button: 'Cancel the order',
    note: 'Every book still in the order is cancelled and goes back on sale. The buyer and sellers are told why.',
  },
};

const BY: Record<string, string> = { buyer: 'the buyer', seller: 'the seller', admin: 'BookStoreBD' };

/** Who called off which books, when and why; nothing when none were. */
export function CancelledNote({ lines }: { lines: readonly OrderLine[] }) {
  const cancelled = lines.filter((line) => line.status === CANCELLED);
  if (!cancelled.length) return null;
  const first = cancelled[0];
  const all = cancelled.length === lines.length;
  return (
    <div className="co-cancelled" role="status">
      <p>
        <b>
          {all
            ? 'This order was cancelled'
            : `${cancelled.length} of ${lines.length} books in this order ${cancelled.length === 1 ? 'was' : 'were'} cancelled`}
        </b>
        {first.cancelledBy ? ` by ${BY[first.cancelledBy] ?? first.cancelledBy}` : ''}
        {first.cancelledAt ? ` on ${new Date(first.cancelledAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : ''}.
      </p>
      {first.cancelReason && <p>Reason: “{first.cancelReason}”</p>}
      {!all && <p>They are not charged for, and the totals below leave them out.</p>}
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
      toast.success(who === 'seller' ? 'Your books in this order are cancelled.' : 'The order is cancelled.');
      setOpen(false);
    } catch (error) {
      toast.error(messageOf(error) || 'Could not cancel the order.');
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
        <FaTimesCircle aria-hidden="true" />
        {WHAT[who].button}
      </button>
    );
  }

  return (
    <div className="co-panel" role="group" aria-label="Cancel the order">
      <p className="co-note">{WHAT[who].note}</p>
      <label className="co-label">
        Reason <span>(optional)</span>
        <textarea
          name="cancelReason"
          className="field"
          rows={2}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={who === 'buyer' ? 'Ordered the wrong book, found it elsewhere...' : 'Out of stock, damaged copy...'}
        />
      </label>
      <div className="co-actions">
        <button type="button" className="btn btn-danger-solid" onClick={() => void confirm()} disabled={isPending}>
          {isPending ? 'Cancelling...' : 'Yes, cancel'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={isPending}>
          Keep the order
        </button>
      </div>
    </div>
  );
}
