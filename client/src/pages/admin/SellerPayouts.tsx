import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { PayoutRow } from '@shared/api.js';

import { useMarkPayoutPaid, usePayouts } from '../../hooks/queries.js';
import { useToast } from '../../hooks/useToast.js';
import { messageOf } from '../../utils/apiError.js';
import { site } from '../../config/site.js';
import Pager from '../../components/Pager.js';

const PAGE_SIZE = 25;

const taka = (amount: number) => `${amount.toFixed(2)} Tk`;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '');

/**
 * What sellers are owed, and a record of what they have been paid.
 *
 * Sellers are paid by bKash to the merchant number on their profile, once an
 * order's return window has closed with no return pending or approved. There
 * was no way to do this before: nothing recorded what a seller was owed, where
 * to send it, or whether it had been sent.
 */
export default function SellerPayouts() {
  const [state, setState] = useState<'due' | 'paid'>('due');
  const [page, setPage] = useState(1);
  const payoutsQuery = usePayouts({ state, page, pageSize: PAGE_SIZE });
  const rows = payoutsQuery.data?.items ?? [];
  const toast = useToast();

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-2">Seller Payouts</h2>
      <p className="mb-4 text-sm text-gray-600">
        Pay each seller by bKash, then record the transaction ID here. An order is due once
        its {site.returns.windowDays}-day return window has closed; {site.name} keeps{' '}
        {site.sellerFeePercent}% of the books.
      </p>

      <div role="tablist" className="mb-4 flex gap-2">
        {(['due', 'paid'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={state === tab}
            onClick={() => {
              setState(tab);
              setPage(1);
            }}
            className={`rounded px-4 py-2 font-semibold ${
              state === tab ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-800'
            }`}
          >
            {tab === 'due' ? 'To pay' : 'Paid'}
          </button>
        ))}
      </div>

      {payoutsQuery.isPending ? (
        <p>Loading...</p>
      ) : rows.length === 0 ? (
        <p>{state === 'due' ? 'Nothing is due to any seller right now.' : 'No payouts recorded yet.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr>
                <th className="p-2 text-left">Seller</th>
                <th className="p-2 text-left">bKash merchant</th>
                <th className="p-2 text-right">Pay</th>
                <th className="p-2 text-left">{state === 'due' ? 'Record payment' : 'Paid'}</th>
                <th className="p-2 text-left">Order</th>
                <th className="p-2 text-left">Books</th>
                <th className="p-2 text-right">Books total</th>
                <th className="p-2 text-right">Fee</th>
                <th className="p-2 text-left">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.orderNumber}:${row.sellerEmail}`} className="border-b align-top">
                  <td className="p-2">
                    {row.sellerName ?? row.sellerEmail}
                    <div className="text-xs text-gray-500">{row.sellerEmail}</div>
                  </td>
                  <td className="p-2 font-mono">
                    {row.bkashMerchant ?? <span className="text-red-600">Not given</span>}
                  </td>
                  <td className="p-2 text-right font-semibold">{taka(row.payout)}</td>
                  <td className="p-2">
                    {state === 'due' ? (
                      <RecordPayment
                        row={row}
                        onDone={(message) => toast.success(message)}
                        onError={(message) => toast.error(message)}
                      />
                    ) : (
                      <>
                        {date(row.paidAt)}
                        <div className="font-mono text-xs text-gray-600">{row.reference}</div>
                      </>
                    )}
                  </td>
                  <td className="p-2">
                    <Link to={`/admin/order-tracking/${row.orderNumber}`}>{row.orderNumber}</Link>
                  </td>
                  <td className="p-2">{row.titles.join(', ')}</td>
                  <td className="p-2 text-right">{taka(row.booksTotal)}</td>
                  <td className="p-2 text-right">-{taka(row.fee)}</td>
                  <td className="p-2">{date(row.deliveredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        page={payoutsQuery.data?.page ?? page}
        pageCount={payoutsQuery.data?.pageCount ?? 1}
        pageSize={PAGE_SIZE}
        total={payoutsQuery.data?.total ?? 0}
        onPage={setPage}
        noun="payouts"
      />
    </div>
  );
}

/**
 * The transaction ID bKash gave for the payment, and a button to record it.
 * Asking for the ID means every payout can be traced if a seller queries it.
 */
function RecordPayment({
  row,
  onDone,
  onError,
}: {
  row: PayoutRow;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [reference, setReference] = useState('');
  const { mutateAsync, isPending } = useMarkPayoutPaid();
  const id = `trx-${row.orderNumber}-${row.sellerEmail}`;

  const record = async () => {
    try {
      const result = await mutateAsync({
        orderNumber: row.orderNumber,
        sellerEmail: row.sellerEmail,
        reference,
      });
      onDone(result.message);
    } catch (error) {
      onError(messageOf(error) || 'Could not record the payout.');
    }
  };

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void record();
      }}
    >
      <label htmlFor={id} className="sr-only">
        bKash transaction ID for {row.orderNumber}
      </label>
      <input
        id={id}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="bKash TrxID"
        autoComplete="off"
        className="w-32 rounded border border-gray-300 p-2 font-mono text-sm"
      />
      <button
        type="submit"
        disabled={isPending || reference.trim().length < 6 || !row.bkashMerchant}
        className="rounded bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? 'Saving...' : 'Mark paid'}
      </button>
    </form>
  );
}
