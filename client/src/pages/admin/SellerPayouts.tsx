import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCheck, FaHourglassHalf, FaMoneyBillWave, FaSearch } from 'react-icons/fa';

import type { PayoutRow } from '@shared/api.js';

import { useMarkPayoutPaid, usePayouts } from '../../hooks/queries.js';
import { useToast } from '../../hooks/useToast.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { messageOf } from '../../utils/apiError.js';
import { formatDate, formatNumber, pick, t } from '../../utils/language.js';
import { site } from '../../config/site.js';
import Pager from '../../components/Pager.js';
import { FilterSelect, RefreshButton } from './AdminControls.js';
import '../AdminPanel.css';

const PAGE_SIZE = 25;

const taka = (amount: number) =>
  t(`${amount.toFixed(2)} Tk`, `${formatNumber(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} টাকা`);
const date = (iso: string | null) => (iso ? formatDate(iso) : '');

type State = 'due' | 'upcoming' | 'paid';
const TABS: { value: State; label: () => string }[] = [
  { value: 'due', label: () => t('To pay', 'পরিশোধ বাকি') },
  { value: 'upcoming', label: () => t('In return window', 'ফেরতের সময়সীমায়') },
  { value: 'paid', label: () => t('Paid', 'পরিশোধিত') },
];
const SORTS = () => [
  { value: 'oldest', label: t('Oldest first', 'পুরোনো আগে') },
  { value: 'newest', label: t('Newest first', 'নতুন আগে') },
  { value: 'amountHigh', label: t('Amount: high to low', 'পরিমাণ: বেশি থেকে কম') },
  { value: 'amountLow', label: t('Amount: low to high', 'পরিমাণ: কম থেকে বেশি') },
];
const EMPTY = (): Record<State, [string, string]> => ({
  due: ['🎉', t('Nothing is due to any seller right now.', 'এই মুহূর্তে কোনো বিক্রেতার পাওনা বাকি নেই।')],
  upcoming: ['📭', t('No delivered order is waiting out its return window.', 'ফেরতের সময়সীমা শেষ হওয়ার অপেক্ষায় কোনো ডেলিভারি হওয়া অর্ডার নেই।')],
  paid: ['🗂️', t('No payouts recorded yet.', 'এখনো কোনো পেমেন্ট রেকর্ড করা হয়নি।')],
});

/**
 * What sellers are owed, and a record of what they have been paid.
 *
 * Sellers are paid by bKash to the merchant number on their profile, once an
 * order's return window has closed with no return pending or approved. Each
 * row records what is owed, where to send it, and whether it has been sent.
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
            {t('Seller Payouts', 'বিক্রেতার পেমেন্ট')}
          </h2>
          <p className="admin-lede">
            {pick(
              <>
                Pay each seller by bKash, then record the transaction ID here. An order is due once
                its {site.returns.windowDays}-day return window has closed; {site.name} keeps{' '}
                {site.sellerFeePercent}% of the books.
              </>,
              <>
                প্রত্যেক বিক্রেতাকে বিকাশে টাকা পাঠান, তারপর এখানে ট্রানজ্যাকশন আইডি লিখে রাখুন।{' '}
                {formatNumber(site.returns.windowDays)} দিনের ফেরতের সময়সীমা শেষ হলে অর্ডারের টাকা পাওনা হয়;
                বইয়ের দামের {formatNumber(site.sellerFeePercent)}% {site.name} রাখে।
              </>
            )}
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
              {tab.label()}
            </button>
          ))}
        </div>
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input
            name="q"
            type="text"
            className="field"
            placeholder={t('Search by seller, order or book...', 'বিক্রেতা, অর্ডার বা বই দিয়ে খুঁজুন...')}
            aria-label={t('Search payouts', 'পেমেন্ট খুঁজুন')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <FilterSelect
          name="sort"
          label={t('Sort', 'সাজান')}
          value={sort}
          onChange={(value) => {
            setSort(value);
            setPage(1);
          }}
          options={SORTS()}
        />
      </div>

      {state === 'upcoming' && (
        <p className="admin-note" role="note">
          <FaHourglassHalf aria-hidden="true" />
          {pick(
            <>
              These orders are delivered, but the buyer can still ask for a return for{' '}
              {site.returns.windowDays} days. Each one moves to To pay on the date shown, unless a
              return is asked for.
            </>,
            <>
              এই অর্ডারগুলো ডেলিভারি হয়েছে, তবে ক্রেতা এখনো {formatNumber(site.returns.windowDays)} দিন পর্যন্ত
              ফেরতের অনুরোধ করতে পারেন। ফেরতের অনুরোধ না এলে প্রতিটি অর্ডার দেখানো তারিখে &ldquo;পরিশোধ বাকি&rdquo;-তে
              চলে যাবে।
            </>
          )}
        </p>
      )}

      {payoutsQuery.isPending ? (
        <p className="admin-loading">{t('Loading...', 'লোড হচ্ছে...')}</p>
      ) : rows.length === 0 ? (
        <div className="admin-card admin-empty">
          <span className="admin-empty-mark" aria-hidden="true">
            {EMPTY()[state][0]}
          </span>
          <p>{settled ? t('No payout matches that search.', 'এই খোঁজের সঙ্গে মেলে এমন কোনো পেমেন্ট নেই।') : EMPTY()[state][1]}</p>
        </div>
      ) : (
        <div className="admin-card">
        <div className="table-scroll">
          <table className="styled-table">
            <thead>
              <tr>
                <th>{t('Seller', 'বিক্রেতা')}</th>
                <th>{t('bKash merchant', 'বিকাশ মার্চেন্ট')}</th>
                <th className="admin-num">{t('Pay', 'পাঠাতে হবে')}</th>
                <th>
                  {state === 'due'
                    ? t('Record payment', 'পেমেন্ট রেকর্ড করুন')
                    : state === 'upcoming'
                      ? t('Payable from', 'পরিশোধযোগ্য যেদিন থেকে')
                      : t('Paid', 'পরিশোধিত')}
                </th>
                <th>{t('Order', 'অর্ডার')}</th>
                <th>{t('Books', 'বই')}</th>
                <th className="admin-num">{t('Books total', 'বইয়ের মোট')}</th>
                <th className="admin-num">{t('Fee', 'ফি')}</th>
                <th>{t('Delivered', 'ডেলিভারি')}</th>
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
                    {row.bkashMerchant ?? <span className="badge admin-status is-bad">{t('Not given', 'দেওয়া হয়নি')}</span>}
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
          noun={t('payouts', 'পেমেন্ট')}
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
      onError(messageOf(error) || t('Could not record the payout.', 'পেমেন্ট রেকর্ড করা যায়নি।'));
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
        {t(`bKash transaction ID for ${row.orderNumber}`, `${row.orderNumber} অর্ডারের বিকাশ ট্রানজ্যাকশন আইডি`)}
      </label>
      <input
        id={id}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder={t('bKash TrxID', 'বিকাশ TrxID')}
        autoComplete="off"
        className="field admin-mono admin-input-sm"
      />
      <button
        type="submit"
        disabled={isPending || reference.trim().length < 6 || !row.bkashMerchant}
        className="btn btn-primary admin-btn-sm"
      >
        <FaCheck aria-hidden="true" />
        {isPending ? t('Saving...', 'সংরক্ষণ হচ্ছে...') : t('Mark paid', 'পরিশোধিত চিহ্নিত করুন')}
      </button>
    </form>
  );
}
