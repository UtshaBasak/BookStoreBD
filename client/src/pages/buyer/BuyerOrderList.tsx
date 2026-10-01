import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaSearch, FaTruck, FaUndoAlt } from 'react-icons/fa';

import type { BuyerOrderLine, OrderLine } from '@shared/api.js';

import { useBuyerOrders } from '../../hooks/queries.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import Pager from '../../components/Pager.js';
import CancelOrder from '../../components/CancelOrder.js';
import CopyButton from '../../components/CopyButton.js';
import NotificationBell from '../../components/NotificationBell.js';
import { CANCELLED, orderTotals } from '../../utils/orderTotals.js';
import { ORDER_SORTS, ORDER_STATUS_FILTER } from '../admin/orderFilters.js';
import '../../styles/orderTracking.css';

/** Orders per page. Each one may be several rows. */
const PAGE_SIZE = 25;

/** A status's pill: delivered green, on its way violet, anything else amber. */
const statusColours = (status: string) =>
  status === 'Delivered'
    ? { background: 'var(--color-success-tint)', color: 'var(--color-success-dark)' }
    : status === CANCELLED
      ? { background: 'var(--color-danger-tint)', color: 'var(--color-danger-ink)' }
      : ['Order Confirmed', 'Processing', 'Shipped', 'Out for Delivery'].includes(status)
      ? { background: 'var(--color-brand-tint)', color: 'var(--color-brand-dark)' }
      : { background: 'var(--color-warn-tint)', color: 'var(--color-warn-ink)' };

/** The lines of one order that can still be sent back. */
const returnable = (lines: BuyerOrderLine[]) =>
  lines.filter((line) => line.status !== CANCELLED && line.returnableUntil && !line.returnStatus);

export default function BuyerOrderList() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');

  // Searched, filtered and paged by the API, so a search covers every order.
  const settledSearch = useDebounced(search);
  const ordersQuery = useBuyerOrders({
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

  // An ordinary scrolling page rather than a fixed full-window layer, so a
  // phone's browser bar and pull-to-refresh behave as expected.
  return (
    <div className="ot-page">
      <div className="ot-wrap" style={{ maxWidth: 1200 }}>
        <div className="ot-toolbar">
          <Link to="/profile?mode=buyer" className="btn btn-ghost">
            ← Return to Profile
          </Link>
          <span className="ot-toolbar-end">
            <NotificationBell />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={fetchOrders}
              disabled={refreshing}
              style={{ cursor: refreshing ? 'not-allowed' : 'pointer' }}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </span>
        </div>

        <p className="ot-kicker">🛍️ Orders</p>
        <h1 className="m-0" style={{ fontSize: 'clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem)' }}>Your Orders (as Buyer)</h1>

        <div className="mt-4 mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1" style={{ maxWidth: 440, minWidth: 220 }}>
          <FaSearch
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted"
          />
          <input name="q"
            type="text"
            className="field"
            style={{ paddingLeft: 42, borderRadius: 999 }}
            placeholder="Search by order number, title, author or seller..."
            aria-label="Search your orders"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <label className="ot-filter">
          <span className="sr-only">Status</span>
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
        <label className="ot-filter">
          <span className="sr-only">Sort</span>
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
        </div>

        <div>
          {loading ? (
            <div className="py-10 text-center font-semibold text-ink-muted">Loading...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="card p-8 text-center text-ink-muted">
              {search || status ? 'No order matches.' : 'No orders yet.'}{' '}
              {!search && !status && <Link to="/filter">Find a book</Link>}
            </div>
          ) : (
            Object.entries(grouped).map(([orderNumber, orderBooks]) => {
              const order = orderBooks[0];
              // Cancelled books are not paid for, so they are not in the totals.
              const { itemTotal: booksTotal, shipping: shippingCost, discount, total: totalCost, status } = orderTotals(orderBooks);
              const canReturn = returnable(orderBooks);
              // The buyer may call it off until the seller starts on it; the
              // server checks the same rule.
              const live = orderBooks.filter((ob) => ob.status !== CANCELLED);
              const canCancel = live.length > 0 && live.every((ob) => ob.status === 'Order Confirmed');
              const displayOrderNumber = order.orderNumber && !/@|T\d{2}:\d{2}/.test(order.orderNumber)
                ? order.orderNumber
                : orderNumber;
              return (
                <section key={orderNumber} className="card mb-5 min-w-0 p-4 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-ink-muted">
                        Order Placed On: {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}
                      </div>
                      <div className="mt-1 text-lg font-bold text-ink">
                        Order Number: <span className="ot-mono">{displayOrderNumber}</span>
                        <CopyButton text={displayOrderNumber} />
                      </div>
                      <span className="ot-pill mt-2" style={statusColours(status)}>
                        Status: {status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canReturn.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            navigate(`/description-form/${canReturn[0]._id}?lines=${canReturn.map((ob) => ob._id).join(',')}`, {
                              state: {
                                bookTitles: canReturn.map((ob) => ob.title ?? ''),
                                returnableUntil: canReturn[0].returnableUntil,
                              },
                            })
                          }
                        >
                          <FaUndoAlt aria-hidden="true" size={12} />
                          {canReturn.length === live.length ? 'Return the whole order' : `Return these ${canReturn.length} books`}
                        </button>
                      )}
                      {canReturn.length === 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            navigate(`/description-form/${canReturn[0]._id}`, {
                              state: { bookTitle: canReturn[0].title, returnableUntil: canReturn[0].returnableUntil },
                            })
                          }
                        >
                          <FaUndoAlt aria-hidden="true" size={12} /> Return {live.length > 1 ? 'a book' : 'it'}
                        </button>
                      )}
                      <Link to={`/order-tracking/${order.orderNumber ? order.orderNumber : order._id}`}
                        className="btn btn-primary"
                      >
                        <FaTruck aria-hidden="true" /> Track Your Order
                      </Link>
                    </div>
                  </div>
                  {canCancel && order.orderNumber && (
                    <div className="mt-3">
                      <CancelOrder orderNumber={order.orderNumber} who="buyer" />
                    </div>
                  )}
                  <div className="table-scroll">
                  <table className="styled-table ot-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Author</th>
                        <th>Category</th>
                        <th>Book Type</th>
                        <th>Condition</th>
                        <th>No. of Pages</th>
                        <th>Price (Tk.)</th>
                        <th>Quantity</th>
                        <th>Seller</th>
                        <th>Total Cost</th>
                      </tr>
                    </thead>

                    <tbody>
                      {orderBooks.map((ob, idx) => (
                        <tr key={ob._id || idx} className={ob.status === CANCELLED ? 'ot-row-cancelled' : undefined}>
                          <td className="font-semibold text-ink">
                            <Link to={`/book/${ob.bookId}`}>{ob.title}</Link>
                            {ob.status === CANCELLED && orderBooks.length > 1 && <span className="ot-line-pill">Cancelled</span>}
                            {ob.returnStatus && <span className="ot-line-pill is-return">Return {ob.returnStatus}</span>}
                          </td>
                          <td>{ob.author}</td>
                          <td>{Array.isArray(ob.category) ? ob.category.join(', ') : ob.category}</td>
                          <td>{ob.bookType}</td>
                          <td>{ob.condition}</td>
                          <td>{ob.pages}</td>
                          <td>{ob.price}</td>
                          <td>{ob.quantity}</td>
                          <td>{ob.sellerEmail}</td>
                          <td className="font-bold" style={{ color: 'var(--color-accent)' }}>
                            {(Number(ob.price) * Number(ob.quantity)).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {/* Under the table rather than in its footer, so the totals
                      stay on screen when the table scrolls sideways on a phone. */}
                  <div className="ot-totals">
                    <div><span>Subtotal:</span><span>৳{booksTotal.toFixed(2)}</span></div>
                    <div><span>Shipping Cost:</span><span>৳{Number(shippingCost).toFixed(2)}</span></div>
                    <div><span>Discount:</span><span>-৳{Number(discount).toFixed(2)}</span></div>
                    <div className="ot-grand"><span>Order Total:</span><span>৳{totalCost.toFixed(2)}</span></div>
                  </div>
                </section>
              );
            })
          )}

          <Pager
            page={currentPage}
            pageCount={pageCount}
            pageSize={PAGE_SIZE}
            total={total}
            onPage={setPage}
            noun="orders"
          />
        </div>
      </div>
    </div>
  );
}
