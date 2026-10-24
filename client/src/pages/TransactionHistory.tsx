import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaReceipt, FaSearch, FaTruck } from 'react-icons/fa';

import type { OrderLine } from '@shared/api.js';

import './AdminPanel.css';
import { useAllOrders } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import Pager from '../components/Pager.js';
import CopyButton from '../components/CopyButton.js';
import { orderTotals, CANCELLED } from '../utils/orderTotals.js';
import { FilterSelect, RefreshButton } from './admin/AdminControls.js';
import { ORDER_STATUS_FILTER, ORDER_SORTS } from './admin/orderFilters.js';
import { conditionOf } from '../utils/bookText.js';
import { digits, t } from '../utils/language.js';
import { statusLabel } from '../utils/orderStatus.js';

/** A date as dd/mm/yyyy, or '' when there is none. */
function formatDate(dateStr: string | undefined) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return digits(`${day}/${month}/${year}`);
}

/** The colour of an order's status pill: waiting, under way, done or stopped. */
function statusTone(status: string) {
  if (/^delivered$/i.test(status)) return 'is-good';
  if (/cancel|fail|return/i.test(status)) return 'is-bad';
  if (/confirmed|pending/i.test(status)) return 'is-pending';
  return 'is-progress';
}

/** Orders per page. Each one may be several rows. */
const PAGE_SIZE = 25;

export default function TransactionHistory() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Any change but the page starts again from the first one.
  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };

  /*
   * Searched and paged by the API, so a search covers every order. It pages
   * by order, never splitting the books of one purchase across two pages.
   */
  const settledSearch = useDebounced(search);
  const ordersQuery = useAllOrders({
    search: settledSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
    filters: { status, sort, from, to },
  });

  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const pageCount = ordersQuery.data?.pageCount ?? 1;
  const currentPage = ordersQuery.data?.page ?? page;
  const refreshing = ordersQuery.isFetching;

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

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaReceipt />
            </span>
            {t('Transaction History', 'লেনদেনের ইতিহাস')}
          </h1>
          <p className="admin-lede">
            {t(
              'Every order placed in the shop. Open one to follow it, move it along or cancel it.',
              'শপে দেওয়া প্রতিটি অর্ডার। কোনোটি খুলে তার অবস্থা দেখুন, এগিয়ে নিন বা বাতিল করুন।'
            )}
          </p>
        </div>
        <RefreshButton onClick={() => void ordersQuery.refetch()} busy={refreshing} />
      </header>
      <div className="admin-toolbar">
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input name="q"
            type="text"
            className="field"
            placeholder={t(
              'Search by order number, buyer, seller, title, or author...',
              'অর্ডার নম্বর, ক্রেতা, বিক্রেতা, বইয়ের নাম বা লেখক দিয়ে খুঁজুন...'
            )}
            aria-label={t('Search orders', 'অর্ডার খুঁজুন')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // A new search starts from its first page.
              setPage(1);
            }}
          />
        </div>
        <FilterSelect name="status" label={t('Status', 'অবস্থা')} value={status} onChange={change(setStatus)} options={ORDER_STATUS_FILTER} />
        <FilterSelect name="sort" label={t('Sort', 'সাজান')} value={sort} onChange={change(setSort)} options={ORDER_SORTS} />
        <label className="admin-filter">
          <span className="admin-filter-label">{t('From', 'থেকে')}</span>
          <input name="from" type="date" className="field" value={from} max={to || undefined} onChange={(e) => change(setFrom)(e.target.value)} />
        </label>
        <label className="admin-filter">
          <span className="admin-filter-label">{t('To', 'পর্যন্ত')}</span>
          <input name="to" type="date" className="field" value={to} min={from || undefined} onChange={(e) => change(setTo)(e.target.value)} />
        </label>
      </div>
      <div className="admin-orders">
        {Object.keys(grouped).length === 0 ? (
          <div className="admin-card admin-empty">
            <span className="admin-empty-mark" aria-hidden="true">
              🧾
            </span>
            <p>{t('No transactions found.', 'কোনো লেনদেন পাওয়া যায়নি।')}</p>
          </div>
        ) : (
          Object.entries(grouped).map(([orderNumber, orderBooks]) => {
            const order = orderBooks[0];
            const displayOrderNumber = order.orderNumber && !/@|T\d{2}:\d{2}/.test(order.orderNumber)
              ? order.orderNumber
              : orderNumber;
            const { itemTotal, shipping, discount, total: finalTotal, status: shownStatus } = orderTotals(orderBooks);
            const promo = order.promo || '';
            const promoApplied = !!order.promoApplied;

            return (
              <article key={orderNumber} className="admin-card admin-order">
                <div className="admin-order-head">
                  <div style={{ minWidth: 0 }}>
                    <p className="admin-order-number">
                      <span>
                        {t('Order Number:', 'অর্ডার নম্বর:')} <span className="admin-mono">{displayOrderNumber}</span>
                        <CopyButton text={displayOrderNumber} />
                      </span>
                      <span className={`badge admin-status ${statusTone(shownStatus)}`}>
                        <span className="sr-only">{t('Status: ', 'অবস্থা: ')}</span>
                        {statusLabel(shownStatus)}
                      </span>
                    </p>
                    <p className="admin-meta">
                      <span>
                        <b>{t('Order Placed On:', 'অর্ডারের তারিখ:')}</b> {formatDate(order.createdAt)}
                      </span>
                      <span>
                        <b>{t('Buyer Email:', 'ক্রেতার ই-মেইল:')}</b> {order.buyerEmail}
                      </span>
                    </p>
                  </div>
                  <Link to={`/admin/order-tracking/${order.orderNumber ? order.orderNumber : order._id}`}
                    className="btn btn-primary admin-btn-sm"
                  >
                    <FaTruck aria-hidden="true" />
                    {t('Track The Order', 'অর্ডার ট্র্যাক করুন')}
                  </Link>
                </div>
                <div className="table-scroll">
                <table className="styled-table">
                  <thead>
                    <tr>
                      <th>{t('Title', 'বইয়ের নাম')}</th>
                      <th>{t('Author', 'লেখক')}</th>
                      <th>{t('Category', 'ক্যাটাগরি')}</th>
                      <th>{t('Book Type', 'বইয়ের ধরন')}</th>
                      <th>{t('Condition', 'অবস্থা')}</th>
                      <th>{t('No. of Pages', 'পৃষ্ঠা সংখ্যা')}</th>
                      <th>{t('Price (Tk.)', 'দাম (টাকা)')}</th>
                      <th>{t('Quantity', 'পরিমাণ')}</th>
                      <th>{t('Seller', 'বিক্রেতা')}</th>
                      <th>{t('Total Cost', 'মোট দাম')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderBooks.map((ob, idx) => (
                      <tr key={ob._id || idx} className={ob.status === CANCELLED ? 'admin-row-cancelled' : undefined}>
                        <td className="admin-cell-strong" style={{ minWidth: 150 }}>
                          {ob.title}
                          {ob.status === CANCELLED && orderBooks.length > 1 && (
                            <span className="badge admin-status is-bad admin-line-pill">{statusLabel(CANCELLED)}</span>
                          )}
                        </td>
                        <td style={{ minWidth: 130 }}>{ob.author}</td>
                        <td style={{ minWidth: 120 }}>{Array.isArray(ob.category) ? ob.category.join(', ') : ob.category}</td>
                        <td style={{ textTransform: 'capitalize' }}>{ob.bookType === 'old' ? t('old', 'পুরোনো') : ob.bookType === 'new' ? t('new', 'নতুন') : ob.bookType}</td>
                        <td style={{ textTransform: 'capitalize' }}>{conditionOf(ob) || '-'}</td>
                        <td className="admin-num">{ob.pages == null ? ob.pages : digits(ob.pages)}</td>
                        <td className="admin-num">{ob.price == null ? ob.price : digits(ob.price)}</td>
                        <td className="admin-num">{ob.quantity == null ? ob.quantity : digits(ob.quantity)}</td>
                        <td>{ob.sellerEmail}</td>
                        <td className="admin-num admin-cell-strong">{digits((Number(ob.price) * Number(ob.quantity)).toFixed(2))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {/* Under the table rather than in its footer: ten columns scroll
                    sideways, and here the totals stay on screen. */}
                <dl className="admin-totals">
                  <div>
                    <dt>{t('Subtotal:', 'উপমোট:')}</dt>
                    <dd>{digits(itemTotal.toFixed(2))}</dd>
                  </div>
                  <div>
                    <dt>{t('Shipping Charge:', 'ডেলিভারি চার্জ:')}</dt>
                    <dd>{digits(shipping.toFixed(2))}</dd>
                  </div>
                  {discount > 0 && (
                    <div>
                      <dt>{t('Discount', 'ছাড়')}{promoApplied && promo ? ` (${promo})` : ''}:</dt>
                      <dd style={{ color: 'var(--color-success-dark)' }}>- {digits(discount.toFixed(2))}</dd>
                    </div>
                  )}
                  <div className="admin-grand">
                    <dt>{t('Order Total:', 'অর্ডারের মোট:')}</dt>
                    <dd className="admin-price">৳{digits(finalTotal.toFixed(2))}</dd>
                  </div>
                </dl>

              </article>
            );
          })
        )}
      </div>

      <div className="admin-pager">
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
