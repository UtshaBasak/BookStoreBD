import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCheck, FaHourglassHalf, FaMoneyBillWave, FaSearch } from 'react-icons/fa';

import type { PayoutRow } from '@shared/api.js';

import { useMarkPayoutPaid, usePayouts } from '../../hooks/queries.js';
import { useToast } from '../../hooks/useToast.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { messageOf } from '../../utils/apiError.js';
import { site } from '../../config/site.js';
import Pager from '../../components/Pager.js';
import { FilterSelect, RefreshButton } from './AdminControls.js';
import '../AdminPanel.css';

const PAGE_SIZE = 25;

const taka = (amount: number) => `${amount.toFixed(2)} Tk`;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '');

type State = 'due' | 'upcoming' | 'paid';
const TABS: { value: State; label: string }[] = [
  { value: 'due', label: 'To pay' },
  { value: 'upcoming', label: 'In return window' },
  { value: 'paid', label: 'Paid' },
];
const SORTS = [
  { value: 'oldest', label: 'Oldest first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'amountHigh', label: 'Amount: high to low' },
  { value: 'amountLow', label: 'Amount: low to high' },
];
const EMPTY: Record<State, [string, string]> = {
  due: ['🎉', 'Nothing is due to any seller right now.'],
  upcoming: ['📭', 'No delivered order is waiting out its return window.'],
  paid: ['🗂️', 'No payouts recorded yet.'],
};

/**
 * What sellers are owed, and a record of what they have been paid.
 *
 * Sellers are paid by bKash to the merchant number on their profile, once an
 * order's return window has closed with no return pending or approved. There
 * was no way to do this before: nothing recorded what a seller was owed, where
 * to send it, or whether it had been sent.
 */
export default function SellerPayouts() {
  const [state, setState] = useState<State>('due');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('oldest');
  const settled = useDebounced(search);
  const payoutsQuery = usePayouts({
    state,
    search: settled || undefined,
    page,
    pageSize: PAGE_SIZE,
    filters: { sort },
  });
  const rows = payoutsQuery.data?.items ?? [];
  const toast = useToast();

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h2 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaMoneyBillWave />
            </span>
            Seller Payouts
          </h2>
          <p className="admin-lede">
            Pay each seller by bKash, then record the transaction ID here. An order is due once
            its {site.returns.windowDays}-day return window has closed; {site.name} keeps{' '}
            {site.sellerFeePercent}% of the books.
          </p>
        </div>
        <RefreshButton onClick={() => void payoutsQuery.refetch()} busy={payoutsQuery.isFetching} />
      </header>

      <div className="admin-toolbar">
        <div role="tablist" className="admin-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={state === tab.value}
              onClick={() => {
                setState(tab.value);
                setPage(1);
              }}
              className="admin-tab"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input
            name="q"
            type="text"
            className="field"
            placeholder="Search by seller, order or book..."
            aria-label="Search payouts"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <FilterSelect
          name="sort"
          label="Sort"
          value={sort}
          onChange={(value) => {
            setSort(value);
            setPage(1);
          }}
          options={SORTS}
        />
      </div>

      {state === 'upcoming' && (
        <p className="admin-note" role="note">
          <FaHourglassHalf aria-hidden="true" />
          These orders are delivered, but the buyer can still ask for a return for{' '}
          {site.returns.windowDays} days. Each one moves to To pay on the date shown, unless a
          return is asked for.
        </p>
      )}

      {payoutsQuery.isPending ? (
        <p className="admin-loading">Loading...</p>
      ) : rows.length === 0 ? (
        <div className="admin-card admin-empty">
          <span className="admin-empty-mark" aria-hidden="true">
            {EMPTY[state][0]}
          </span>
          <p>{settled ? 'No payout matches that search.' : EMPTY[state][1]}</p>
        </div>
      ) : (
        <div className="admin-card">
        <div className="table-scroll">
          <table className="styled-table">
            <thead>
              <tr>
                <th>Seller</th>
                <th>bKash merchant</th>
                <th className="admin-num">Pay</th>
                <th>{state === 'due' ? 'Record payment' : state === 'upcoming' ? 'Payable from' : 'Paid'}</th>
                <th>Order</th>
                <th>Books</th>
                <th className="admin-num">Books total</th>
                <th className="admin-num">Fee</th>
                <th>Delivered</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.orderNumber}:${row.sellerEmail}`}>
                  <td>
                    <span className="admin-cell-strong">{row.sellerName ?? row.sellerEmail}</span>
                    <div className="admin-cell-muted">{row.sellerEmail}</div>
                  </td>
                  <td className="admin-mono admin-nowrap">
                    {row.bkashMerchant ?? <span className="badge admin-status is-bad">Not given</span>}
                  </td>
                  <td className="admin-price" style={{ textAlign: 'right' }}>{taka(row.payout)}</td>
                  <td>
                    {state === 'due' ? (
                      <RecordPayment
                        row={row}
                        onDone={(message) => toast.success(message)}
                        onError={(message) => toast.error(message)}
                      />
                    ) : state === 'upcoming' ? (
                      <span className="badge admin-status is-pending">{date(row.payableFrom)}</span>
                    ) : (
                      <>
                        <span className="badge admin-status is-good">{date(row.paidAt)}</span>
                        <div className="admin-mono admin-cell-muted">{row.reference}</div>
                      </>
                    )}
                  </td>
                  <td>
                    <Link className="admin-mono" to={`/admin/order-tracking/${row.orderNumber}`}>{row.orderNumber}</Link>
                  </td>
                  <td style={{ minWidth: 140 }}>{row.titles.join(', ')}</td>
                  <td className="admin-num">{taka(row.booksTotal)}</td>
                  <td className="admin-num admin-cell-muted">-{taka(row.fee)}</td>
                  <td className="admin-nowrap">{date(row.deliveredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      <div className="admin-pager">
        <Pager
          page={payoutsQuery.data?.page ?? page}
          pageCount={payoutsQuery.data?.pageCount ?? 1}
          pageSize={PAGE_SIZE}
          total={payoutsQuery.data?.total ?? 0}
          onPage={setPage}
          noun="payouts"
        />
      </div>
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
      className="admin-row-actions"
      style={{ alignItems: 'center', flexWrap: 'nowrap' }}
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
        className="field admin-mono admin-input-sm"
      />
      <button
        type="submit"
        disabled={isPending || reference.trim().length < 6 || !row.bkashMerchant}
        className="btn btn-primary admin-btn-sm"
      >
        <FaCheck aria-hidden="true" />
        {isPending ? 'Saving...' : 'Mark paid'}
      </button>
    </form>
  );
}
