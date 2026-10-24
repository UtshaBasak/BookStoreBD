import { useState } from 'react';

import type { BuyerOrderLine } from '@shared/api.js';
import { useNavigate, Link } from 'react-router-dom';
import { FaSearch, FaUndoAlt } from 'react-icons/fa';

import { useBuyerOrders } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import Pager from '../components/Pager.js';
import { conditionLabel } from '../utils/bookText.js';
import { digits, formatDate, t } from '../utils/language.js';
import { returnStatusLabel, statusLabel } from '../utils/orderStatus.js';
import '../styles/orderTracking.css';

/** Orders per page. Each one may be several rows. */
const PAGE_SIZE = 25;

/** A return's pill: pending amber, approved green, anything else red. */
const returnColours = (status: string) =>
  status === 'pending'
    ? { background: 'var(--color-warn-tint)', color: 'var(--color-warn-ink)' }
    : status === 'approved'
      ? { background: 'var(--color-success-tint)', color: 'var(--color-success-dark)' }
      : { background: 'var(--color-danger-tint)', color: 'var(--color-danger-ink)' };

export default function BuyerBookList() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const [page, setPage] = useState(1);

  /*
   * Searched and paged by the API. Each line carries its own `returnStatus`,
   * so the page never loads the account's return requests, which hold the
   * defect photographs as base64.
   */
  const settledSearch = useDebounced(search);
  const ordersQuery = useBuyerOrders({
    search: settledSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const pageCount = ordersQuery.data?.pageCount ?? 1;
  const currentPage = ordersQuery.data?.page ?? page;
  const loading = ordersQuery.isPending;
  const refreshing = ordersQuery.isFetching;
  const handleRefresh = () => ordersQuery.refetch();

  const handleReturn = (order: BuyerOrderLine) => {
    // The return is submitted on the next page; the orders query stays the
    // single source for this list. Addressed by order line, so the form still
    // knows what it is returning after a reload drops the navigation state.
    navigate(`/description-form/${order._id}`, {
      state: {
        bookTitle: order.title,
        returnableUntil: order.returnableUntil,
      }
    });
  };

  /*
   * Whether a line can be returned is the server's answer, sent with it, so
   * the return window runs from delivery and is enforced in one place.
   */
  const returnLabel = (order: BuyerOrderLine) =>
    order.status === 'Cancelled'
      ? statusLabel('Cancelled')
      : order.status === 'Delivered'
        ? t('Return period over', 'ফেরতের সময় শেষ')
        : t('Returns open on delivery', 'ডেলিভারির পরে ফেরত দেওয়া যাবে');

  /** A book's type as shown; the stored value otherwise. */
  const bookTypeLabel = (type?: string | null) =>
    type === 'old' ? t('old', 'পুরোনো') : type === 'new' ? t('new', 'নতুন') : type;

  // No `overflow-x: hidden` on the page: it would clip the toolbar rather
  // than let it wrap.
  return (
    <div className="ot-page">
      <div className="ot-wrap" style={{ maxWidth: 1200 }}>
        <div className="ot-toolbar">
          <Link to="/profile?mode=buyer" className="btn btn-ghost">
            {t('← Return to Profile', '← প্রোফাইলে ফিরুন')}
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="ot-kicker">📚 {t('Your library', 'আপনার লাইব্রেরি')}</p>
            <h1 className="m-0" style={{ fontSize: 'clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem)' }}>
              {t('Your Purchased Books', 'আপনার কেনা বই')}
            </h1>
            <p className="m-0 mt-1 text-sm text-ink-muted">
              {t(
                'Something wrong with a book? Ask for a return from its row, or send back a whole order at once from',
                'বইয়ে কোনো সমস্যা? সেই সারি থেকে ফেরতের অনুরোধ করুন, অথবা পুরো অর্ডার একসঙ্গে ফেরত দিন এখান থেকে:'
              )}{' '}
              <Link to="/buyer/orders">{t('Your Orders', 'আপনার অর্ডার')}</Link>
              {t('.', '।')}
            </p>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1" style={{ maxWidth: 440, minWidth: 220 }}>
            <FaSearch
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted"
            />
            <input name="q"
              type="text"
              className="field"
              style={{ paddingLeft: 42, borderRadius: 999 }}
              placeholder={t('Search by title, author, or seller...', 'বইয়ের নাম, লেখক বা বিক্রেতা দিয়ে খুঁজুন...')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ cursor: refreshing ? 'not-allowed' : 'pointer' }}
          >
            {refreshing ? t('Refreshing...', 'রিফ্রেশ হচ্ছে...') : t('Refresh', 'রিফ্রেশ')}
          </button>
        </div>

        <div className="table-scroll">
        <table className="styled-table ot-table">
          <thead>
            <tr>
              <th>{t('Title', 'বইয়ের নাম')}</th>
              {/*
                Next to the title: on a phone this table scrolls sideways, and
                here the return button stays on screen.
              */}
              <th>{t('Return', 'ফেরত')}</th>
              <th>{t('Author', 'লেখক')}</th>
              <th>{t('Category', 'ক্যাটাগরি')}</th>
              <th>{t('Book Type', 'বইয়ের ধরন')}</th>
              <th>{t('Condition', 'অবস্থা')}</th>
              <th>{t('No. of Pages', 'পৃষ্ঠা সংখ্যা')}</th>
              <th>{t('Price (Tk.)', 'দাম (টাকা)')}</th>
              <th>{t('Quantity', 'পরিমাণ')}</th>
              <th>{t('Seller', 'বিক্রেতা')}</th>
              <th>{t('Created at', 'তারিখ')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11}>{t('Loading...', 'লোড হচ্ছে...')}</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={11} className="py-8 text-center text-ink-muted">
                {settledSearch
                  ? t(`No bought books match "${settledSearch}".`, `"${settledSearch}"-এর সঙ্গে মেলে এমন কোনো কেনা বই নেই।`)
                  : t('No books purchased yet.', 'এখনো কোনো বই কেনা হয়নি।')}
              </td></tr>
            ) : (
              orders.map((order, idx) => (
                <tr key={order._id || idx}>
                  <td className="font-semibold text-ink" style={{ minWidth: 140 }}>
                    <Link to={`/book/${order.bookId}`}>{order.title}</Link>
                  </td>
                  <td style={{ minWidth: 150 }}>
                    {order.returnStatus ? (
                      <span className="ot-pill" style={returnColours(order.returnStatus)}>
                        {returnStatusLabel(order.returnStatus)}
                      </span>
                    ) : order.returnableUntil ? (
                      <div className="flex flex-col items-start gap-1">
                        <button
                          type="button"
                          onClick={() => handleReturn(order)}
                          className="btn btn-primary"
                          style={{ minHeight: 44, padding: '0 18px' }}
                        >
                          <FaUndoAlt aria-hidden="true" size={12} /> {t('Return', 'ফেরত দিন')}
                        </button>
                        <span className="text-xs text-ink-muted">
                          {t('Until', 'শেষ সময়')} {formatDate(order.returnableUntil)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-ink-muted">{returnLabel(order)}</span>
                    )}
                    {order.returnStatus === 'approved' && (
                      <p className="m-0 mt-1 text-xs text-ink-muted">
                        {t('We have e-mailed you where to send it.', 'কোথায় পাঠাতে হবে, তা আমরা আপনাকে ই-মেইল করেছি।')}
                      </p>
                    )}
                  </td>
                  <td>{order.author}</td>
                  <td>{Array.isArray(order.category) ? order.category.join(', ') : order.category}</td>
                  <td>{bookTypeLabel(order.bookType)}</td>
                  <td>{order.condition ? conditionLabel(order.condition) : order.condition}</td>
                  <td>{order.pages == null ? order.pages : digits(order.pages)}</td>
                  <td className="font-bold" style={{ color: 'var(--color-accent)' }}>{order.price == null ? order.price : digits(order.price)}</td>
                  <td>{order.quantity == null ? order.quantity : digits(order.quantity)}</td>
                  <td>{order.sellerEmail}</td>
                  <td>{order.createdAt ? formatDate(order.createdAt) : ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        <Pager
          page={currentPage}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
          noun={t('orders', 'অর্ডার')}
        />
      </div>
    </div>
  );
}
