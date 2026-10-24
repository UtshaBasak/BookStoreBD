import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCheckCircle, FaClock, FaSearch, FaSyncAlt, FaTruck, FaWallet } from 'react-icons/fa';

import type { OrderLine, SellerOrderLine } from '@shared/api.js';

import './Seller.css';
import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import CopyButton from '../components/CopyButton.js';
import { ORDER_SORTS, ORDER_STATUS_FILTER } from './admin/orderFilters.js';
import { CANCELLED } from '../utils/orderTotals.js';
import { useSellerOrders } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import Pager from '../components/Pager.js';
import { site } from '../config/site.js';
import { categoryLabel } from '../config/categories.js';
import { conditionOf } from '../utils/bookText.js';
import { digits, formatDate, formatNumber, t } from '../utils/language.js';
import { statusLabel } from '../utils/orderStatus.js';

/** Orders per page. Each one may be several rows. */
const PAGE_SIZE = 25;

/** The shop's share of a sale, in taka, rounded to the paisa. */
const sellerFee = (booksTotal: number) =>
  Math.round(booksTotal * site.sellerFeePercent) / 100;

const date = (iso: string | null | undefined) => (iso ? formatDate(iso) : '');

/** Money to the paisa: "285.00" in English, "২৮৫.০০" in Bangla. */
const money = (amount: number) => digits(amount.toFixed(2));

/** A book type as it reads; English shows the stored value, as before. */
const bookTypeLabel = (value: string): string =>
  value === 'new' ? t(value, 'নতুন') : value === 'old' ? t(value, 'পুরোনো') : value;

/**
 * Where the money for one order has got to, in words, so a seller knows
 * whether and when they will be paid. The state is the server's, worked out
 * by the same rule the payouts page uses.
 */
const paymentFor = (lines: SellerOrderLine[]): { text: string; tone: 'good' | 'due' | 'plain' } => {
  const open = lines.filter((line) => line.payoutState !== 'returned' && line.status !== CANCELLED);
  if (open.length === 0) {
    return lines.every((line) => line.status === CANCELLED)
      ? { text: t('Cancelled: nothing to pay, and no fee.', 'বাতিল: কোনো পেমেন্ট বা ফি নেই।'), tone: 'plain' }
      : {
          text: t('Returned by the buyer: nothing to pay, and no fee.', 'ক্রেতা ফেরত দিয়েছেন: কোনো পেমেন্ট বা ফি নেই।'),
          tone: 'plain',
        };
  }
  if (open.every((line) => line.payoutState === 'paid')) {
    const paid = open[0];
    const ref = paid?.sellerPayoutRef ? t(` (bKash TrxID ${paid.sellerPayoutRef})`, ` (বিকাশ TrxID ${paid.sellerPayoutRef})`) : '';
    return {
      text: t(
        `Paid to your bKash on ${date(paid?.sellerPaidAt)}${ref}.`,
        `${date(paid?.sellerPaidAt)} তারিখে আপনার বিকাশে পাঠানো হয়েছে${ref}।`
      ),
      tone: 'good',
    };
  }
  const waiting = open.find((line) => line.payoutState !== 'paid') ?? open[0];
  switch (waiting?.payoutState) {
    case 'due':
      return {
        text: t('Due: we will send it to your bKash merchant number.', 'পাওনা: আমরা আপনার বিকাশ মার্চেন্ট নম্বরে পাঠাব।'),
        tone: 'due',
      };
    case 'in-return-window':
      return {
        text: t(
          `Payable from ${date(waiting.payableFrom)}, when the buyer's ${String(site.returns.windowDays)}-day return window closes.`,
          `${date(waiting.payableFrom)} থেকে পাওনা হবে, যখন ক্রেতার ${formatNumber(site.returns.windowDays)} দিনের রিটার্নের সময় শেষ হবে।`
        ),
        tone: 'plain',
      };
    case 'return-in-progress':
      return {
        text: t('On hold while the buyer’s return request is decided.', 'ক্রেতার রিটার্নের অনুরোধের সিদ্ধান্ত না হওয়া পর্যন্ত স্থগিত।'),
        tone: 'plain',
      };
    default:
      return {
        text: t(
          `Paid once delivered and the ${String(site.returns.windowDays)}-day return window has closed.`,
          `ডেলিভারি হওয়ার পর এবং ${formatNumber(site.returns.windowDays)} দিনের রিটার্নের সময় শেষ হলে পেমেন্ট হবে।`
        ),
        tone: 'plain',
      };
  }
};

/** The colour of an order's status pill: waiting, moving, arrived, or gone wrong. */
const statusTone = (status: string) => {
  if (status === 'Delivered') return 'is-done';
  if (status === 'Order Confirmed' || status === 'Pending') return 'is-pending';
  if (/cancel|return|fail|reject/i.test(status)) return 'is-bad';
  return 'is-progress';
};

export default function SellerOrderList() {
  const [search, setSearch] = useState('');

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');

  // Searched, filtered and paged by the API, so a search covers every order.
  const settledSearch = useDebounced(search);
  const ordersQuery = useSellerOrders({
    search: settledSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
    filters: { status, sort },
  });

  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const pageCount = ordersQuery.data?.pageCount ?? 1;
  const currentPage = ordersQuery.data?.page ?? page;
  const loading = ordersQuery.isPending;
  const refreshing = ordersQuery.isFetching;
  const fetchOrders = () => ordersQuery.refetch();

  // Lines grouped by order number, or by _id where the number is missing or malformed.
  function groupOrdersByOrderNumber<T extends OrderLine>(orders: T[]): Record<string, T[]> {
    const map: Record<string, T[]> = {};
    orders.forEach(order => {
      let key = order.orderNumber;
      if (!key || /@|T\d{2}:\d{2}/.test(key)) key = String(order._id);
      if (!map[key]) map[key] = [];
      map[key].push(order);
    });
    return map;
  }

  const grouped = groupOrdersByOrderNumber(orders);
  // Column names, read when drawn so they follow the language.
  const col = {
    title: t('Title', 'শিরোনাম'),
    author: t('Author', 'লেখক'),
    category: t('Category', 'বিভাগ'),
    bookType: t('Book Type', 'বইয়ের ধরন'),
    condition: t('Condition', 'অবস্থা'),
    pages: t('No. of Pages', 'পৃষ্ঠাসংখ্যা'),
    price: t('Price (Tk.)', 'দাম (টাকা)'),
    quantity: t('Quantity', 'পরিমাণ'),
    totalCost: t('Total Cost', 'মোট দাম'),
  };

  return (
    <div className="sl-page">
      <header className="sl-topbar">
        <Link to="/" className="sl-logo-link" aria-label={t(`${site.name} home`, `${site.name} হোম`)}>
          <Logo size={34} />
        </Link>
        <div className="sl-topbar-actions">
          <NotificationBell />
          <Link to="/profile?mode=seller" className="btn btn-ghost">
            {t('← Return to Profile', '← প্রোফাইলে ফিরে যান')}
          </Link>
        </div>
      </header>

      <div className="sl-wrap">
        <section className="sl-hero">
          <div className="sl-hero-row">
            <div>
              <span className="sl-kicker">{t('📦 Sales', '📦 বিক্রি')}</span>
              <h2>{t('Your Orders (as Seller)', 'আপনার অর্ডার (বিক্রেতা হিসেবে)')}</h2>
              <p className="sl-hero-sub">
                {t(
                  `What sold, what you receive after the ${site.sellerFeePercent}% fee, and when it reaches your bKash.`,
                  `কী বিক্রি হলো, ${formatNumber(site.sellerFeePercent)}% ফি বাদে আপনি কত পাবেন, আর কবে তা আপনার বিকাশে পৌঁছাবে।`
                )}
              </p>
            </div>
          </div>
        </section>

        <div className="sl-toolbar">
          <div className="sl-search" style={{ maxWidth: 520 }}>
            <FaSearch aria-hidden="true" />
            <input name="q"
              type="text"
              placeholder={t('Search by order number, title, author, or buyer...', 'অর্ডার নম্বর, শিরোনাম, লেখক বা ক্রেতা দিয়ে খুঁজুন...')}
              aria-label={t('Search your orders', 'আপনার অর্ডার খুঁজুন')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="field"
            />
          </div>
          <div className="sl-toolbar-actions">
            <label className="sl-filter">
              <span className="sr-only">{t('Status', 'অবস্থা')}</span>
              <select
                name="status"
                className="field"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                {ORDER_STATUS_FILTER.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="sl-filter">
              <span className="sr-only">{t('Sort', 'সাজান')}</span>
              <select
                name="sort"
                className="field"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
              >
                {ORDER_SORTS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={fetchOrders} disabled={refreshing} className="btn btn-ghost">
              <FaSyncAlt aria-hidden="true" /> {refreshing ? t('Refreshing...', 'হালনাগাদ হচ্ছে...') : t('Refresh', 'হালনাগাদ করুন')}
            </button>
          </div>
        </div>

        <div>
          {loading ? (
            <div className="card sl-loading"><span className="sl-spinner" aria-hidden="true" /> {t('Loading...', 'লোড হচ্ছে...')}</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="card sl-empty">
              <span className="sl-empty-emoji" aria-hidden="true">🛍️</span>
              <h3>{t('No orders found.', 'কোনো অর্ডার পাওয়া যায়নি।')}</h3>
              <p>
                {search || status
                  ? t('Try a different search or status.', 'অন্য কিছু লিখে বা অন্য অবস্থা বেছে খুঁজুন।')
                  : t('When someone buys one of your books, it shows up here.', 'কেউ আপনার কোনো বই কিনলে তা এখানে দেখা যাবে।')}
              </p>
              {!search && !status && <Link to="/add-book" className="btn btn-accent">{t('List a book', 'বই তালিকাভুক্ত করুন')}</Link>}
            </div>
          ) : (
            Object.entries(grouped).map(([orderNumber, orderBooks]) => {
              const order = orderBooks[0];
              const liveBooks = orderBooks.filter((ob) => ob.status !== CANCELLED);
              const totalCost = liveBooks.reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
              // A returned or cancelled book is neither paid for nor charged a fee.
              const payableTotal = liveBooks
                .filter((ob) => ob.payoutState !== 'returned')
                .reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
              const payment = paymentFor(orderBooks);
              const displayOrderNumber = order.orderNumber && !/@|T\d{2}:\d{2}/.test(order.orderNumber)
                ? order.orderNumber
                : orderNumber;
              const status = liveBooks[0]?.status || (liveBooks.length ? 'Order Confirmed' : CANCELLED);
              return (
                <article key={orderNumber} className="card sl-card sl-order">
                  <div className="sl-order-head">
                    <div style={{ minWidth: 0 }}>
                      <p className="sl-order-no">
                        <span className="sl-muted" style={{ fontSize: '0.85rem', fontWeight: 700 }}>{t('Order Number:', 'অর্ডার নম্বর:')}</span>
                        <span className="sl-order-no-value">{displayOrderNumber}</span>
                        <CopyButton text={displayOrderNumber} />
                        <span className={`sl-pill ${statusTone(status)}`}>
                          <span className="sr-only">{t('Status: ', 'অবস্থা: ')}</span>{statusLabel(status)}
                        </span>
                      </p>
                      <p className="sl-order-meta">
                        <span><b>{t('Order Placed On:', 'অর্ডারের তারিখ:')}</b> {order.createdAt ? formatDate(order.createdAt) : ''}</span>
                        <span><b>{t('Buyer:', 'ক্রেতা:')}</b> {order.buyerEmail}</span>
                      </p>
                      {order.buyerNote && <p className="sl-buyer-note sl-list-note">{t('Note from the buyer:', 'ক্রেতার নোট:')} {order.buyerNote}</p>}
                    </div>
                    <Link to={`/seller/order-tracking/${order.orderNumber ? order.orderNumber : order._id}`}
                      className="btn btn-primary"
                    >
                      <FaTruck aria-hidden="true" /> {t('Track Your Order', 'অর্ডার ট্র্যাক করুন')}
                    </Link>
                  </div>
                  <div className="table-scroll">
                    <table className="styled-table sl-table sl-stack">
                      <thead>
                        <tr>
                          <th>{col.title}</th>
                          <th>{col.author}</th>
                          <th>{col.category}</th>
                          <th>{col.bookType}</th>
                          <th>{col.condition}</th>
                          <th>{col.pages}</th>
                          <th>{col.price}</th>
                          <th>{col.quantity}</th>
                          <th>{col.totalCost}</th>
                        </tr>
                      </thead>

                      <tbody>
                        {orderBooks.map((ob, idx) => (
                          <tr key={ob._id || idx} className={ob.status === CANCELLED ? 'sl-row-cancelled' : undefined}>
                            <td data-label={col.title} className="sl-title-cell">
                              {ob.title}
                              {ob.status === CANCELLED && orderBooks.length > 1 && <span className="sl-pill is-bad sl-line-pill">{statusLabel(CANCELLED)}</span>}
                            </td>
                            <td data-label={col.author}>{ob.author}</td>
                            <td data-label={col.category}>{Array.isArray(ob.category) ? ob.category.map(categoryLabel).join(', ') : ob.category}</td>
                            <td data-label={col.bookType}>{ob.bookType ? bookTypeLabel(ob.bookType) : ob.bookType}</td>
                            <td data-label={col.condition}>{conditionOf(ob) || '-'}</td>
                            <td data-label={col.pages}>{ob.pages === undefined || ob.pages === null ? ob.pages : digits(ob.pages)}</td>
                            <td data-label={col.price} className="sl-num">৳{digits(ob.price ?? "")}</td>
                            <td data-label={col.quantity}>{digits(ob.quantity ?? "")}</td>
                            <td data-label={col.totalCost} className="sl-price">৳{money(Number(ob.price) * Number(ob.quantity))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'right', fontWeight: 700 }}>{t('Order Total:', 'অর্ডারের মোট:')}</td>
                          <td className="sl-price">৳{money(totalCost)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {/*
                    The terms say the seller can see this here. Outside the
                    table, which scrolls sideways on a phone, so it stays on
                    screen. Delivery is not part of the book total, so it is
                    not in the fee.
                  */}
                  <div className="sl-order-foot">
                    <dl className="sl-summary">
                      <dt>
                        {payableTotal !== totalCost
                          ? t('Books (not returned)', 'বই (ফেরত আসা ছাড়া)')
                          : t('Books', 'বই')}
                      </dt>
                      <dd>{t(`${payableTotal.toFixed(2)} Tk`, `${money(payableTotal)} টাকা`)}</dd>
                      <dt>
                        {t(
                          `${site.name} fee (${site.sellerFeePercent}%)`,
                          `${site.name} ফি (${formatNumber(site.sellerFeePercent)}%)`
                        )}
                      </dt>
                      <dd>{t(`-${sellerFee(payableTotal).toFixed(2)} Tk`, `-${money(sellerFee(payableTotal))} টাকা`)}</dd>
                      <dt className="sl-receive">{t('You receive', 'আপনি পাবেন')}</dt>
                      <dd className="sl-receive">
                        {t(
                          `${(payableTotal - sellerFee(payableTotal)).toFixed(2)} Tk`,
                          `${money(payableTotal - sellerFee(payableTotal))} টাকা`
                        )}
                      </dd>
                    </dl>
                  </div>
                  <div className="sl-payout-row">
                    <p data-testid="payout-state" className={`sl-payout is-${payment.tone}`}>
                      {payment.tone === 'good' ? <FaCheckCircle aria-hidden="true" /> : payment.tone === 'due' ? <FaWallet aria-hidden="true" /> : <FaClock aria-hidden="true" />}
                      <span>{payment.text}</span>
                    </p>
                  </div>
                </article>
              );
            })
          )}

          <div className="sl-pager">
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
      </div>
    </div>
  );
}
