import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaClock, FaSearch, FaSyncAlt, FaTruck, FaWallet } from 'react-icons/fa';

import type { OrderLine, SellerOrderLine } from '@shared/api.js';

import './Seller.css';
import Logo from '../components/Logo.js';
import { useSellerOrders } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import Pager from '../components/Pager.js';
import { site } from '../config/site.js';

/** Orders per page. Each one may be several rows. */
const PAGE_SIZE = 25;

/** The shop's share of a sale, in taka, rounded to the paisa. */
const sellerFee = (booksTotal: number) =>
  Math.round(booksTotal * site.sellerFeePercent) / 100;

const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '');

/**
 * Where the money for one order has got to, in words. The state is the
 * server's, worked out by the same rule the payouts page uses; a seller used
 * to have no way of knowing whether, or when, they would be paid.
 */
const paymentFor = (lines: SellerOrderLine[]): { text: string; tone: 'good' | 'due' | 'plain' } => {
  const open = lines.filter((line) => line.payoutState !== 'returned');
  if (open.length === 0) {
    return { text: 'Returned by the buyer: nothing to pay, and no fee.', tone: 'plain' };
  }
  if (open.every((line) => line.payoutState === 'paid')) {
    const paid = open[0];
    const ref = paid?.sellerPayoutRef ? ` (bKash TrxID ${paid.sellerPayoutRef})` : '';
    return { text: `Paid to your bKash on ${date(paid?.sellerPaidAt)}${ref}.`, tone: 'good' };
  }
  const waiting = open.find((line) => line.payoutState !== 'paid') ?? open[0];
  switch (waiting?.payoutState) {
    case 'due':
      return { text: 'Due: we will send it to your bKash merchant number.', tone: 'due' };
    case 'in-return-window':
      return {
        text: `Payable from ${date(waiting.payableFrom)}, when the buyer's ${String(site.returns.windowDays)}-day return window closes.`,
        tone: 'plain',
      };
    case 'return-in-progress':
      return { text: 'On hold while the buyer’s return request is decided.', tone: 'plain' };
    default:
      return {
        text: `Paid once delivered and the ${String(site.returns.windowDays)}-day return window has closed.`,
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
  const navigate = useNavigate();

  const [page, setPage] = useState(1);

  /*
   * This fetched every order this seller has ever had and searched them here,
   * so the search box could only find one that had already been downloaded.
   */
  const settledSearch = useDebounced(search);
  const ordersQuery = useSellerOrders({
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
  const fetchOrders = () => ordersQuery.refetch();

  // Group orders by orderNumber (if present), else fallback to _id
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
    <div className="sl-page">
      <header className="sl-topbar">
        <Link to="/" className="sl-logo-link" aria-label={`${site.name} home`}>
          <Logo size={34} />
        </Link>
        <button type="button" onClick={() => navigate('/profile')} className="btn btn-ghost">
          ← Return to Profile
        </button>
      </header>

      <div className="sl-wrap">
        <section className="sl-hero">
          <div className="sl-hero-row">
            <div>
              <span className="sl-kicker">📦 Sales</span>
              <h2>Your Orders (as Seller)</h2>
              <p className="sl-hero-sub">
                What sold, what you receive after the {site.sellerFeePercent}% fee, and when it reaches your bKash.
              </p>
            </div>
          </div>
        </section>

        <div className="sl-toolbar">
          <div className="sl-search" style={{ maxWidth: 520 }}>
            <FaSearch aria-hidden="true" />
            <input
              type="text"
              placeholder="Search by order number, title, author, or buyer..."
              aria-label="Search your orders"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="field"
            />
          </div>
          <div className="sl-toolbar-actions">
            <button type="button" onClick={fetchOrders} disabled={refreshing} className="btn btn-ghost">
              <FaSyncAlt aria-hidden="true" /> {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div>
          {loading ? (
            <div className="card sl-loading"><span className="sl-spinner" aria-hidden="true" /> Loading...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="card sl-empty">
              <span className="sl-empty-emoji" aria-hidden="true">🛍️</span>
              <h3>No orders found.</h3>
              <p>{search ? 'Try a different order number, title or buyer.' : 'When someone buys one of your books, it shows up here.'}</p>
              {!search && <Link to="/add-book" className="btn btn-accent">List a book</Link>}
            </div>
          ) : (
            Object.entries(grouped).map(([orderNumber, orderBooks]) => {
              const order = orderBooks[0];
              const totalCost = orderBooks.reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
              // A returned book is neither paid for nor charged a fee.
              const payableTotal = orderBooks
                .filter((ob) => ob.payoutState !== 'returned')
                .reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
              const payment = paymentFor(orderBooks);
              const displayOrderNumber = order.orderNumber && !/@|T\d{2}:\d{2}/.test(order.orderNumber)
                ? order.orderNumber
                : orderNumber;
              const status = order.status || 'Order Confirmed';
              return (
                <article key={orderNumber} className="card sl-card sl-order">
                  <div className="sl-order-head">
                    <div style={{ minWidth: 0 }}>
                      <p className="sl-order-no">
                        <span className="sl-muted" style={{ fontSize: '0.85rem', fontWeight: 700 }}>Order Number:</span>
                        <span className="sl-order-no-value">{displayOrderNumber}</span>
                        <span className={`sl-pill ${statusTone(status)}`}>
                          <span className="sr-only">Status: </span>{status}
                        </span>
                      </p>
                      <p className="sl-order-meta">
                        <span><b>Order Placed On:</b> {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}</span>
                        <span><b>Buyer:</b> {order.buyerEmail}</span>
                      </p>
                    </div>
                    {/* Track Your Order button */}
                    <button
                      type="button"
                      onClick={() => navigate(`/seller/order-tracking/${order.orderNumber ? order.orderNumber : order._id}`)}
                      className="btn btn-primary"
                    >
                      <FaTruck aria-hidden="true" /> Track Your Order
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table className="styled-table sl-table sl-stack">
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
                          <th>Total Cost</th>
                        </tr>
                      </thead>

                      <tbody>
                        {orderBooks.map((ob, idx) => (
                          <tr key={ob._id || idx}>
                            <td data-label="Title" className="sl-title-cell">{ob.title}</td>
                            <td data-label="Author">{ob.author}</td>
                            <td data-label="Category">{Array.isArray(ob.category) ? ob.category.join(', ') : ob.category}</td>
                            <td data-label="Book Type">{ob.bookType}</td>
                            <td data-label="Condition">{ob.condition}</td>
                            <td data-label="No. of Pages">{ob.pages}</td>
                            <td data-label="Price (Tk.)" className="sl-num">৳{ob.price}</td>
                            <td data-label="Quantity">{ob.quantity}</td>
                            <td data-label="Total Cost" className="sl-price">৳{(Number(ob.price) * Number(ob.quantity)).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'right', fontWeight: 700 }}>Order Total:</td>
                          <td className="sl-price">৳{totalCost.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {/*
                    The terms say the seller can see this here. Outside the
                    table, which scrolls sideways on a phone and would have put
                    it off the screen. Delivery is not part of the book total,
                    so it is not in the fee.
                  */}
                  <div className="sl-order-foot">
                    <dl className="sl-summary">
                      <dt>Books{payableTotal !== totalCost ? ' (not returned)' : ''}</dt>
                      <dd>{payableTotal.toFixed(2)} Tk</dd>
                      <dt>{site.name} fee ({site.sellerFeePercent}%)</dt>
                      <dd>-{sellerFee(payableTotal).toFixed(2)} Tk</dd>
                      <dt className="sl-receive">You receive</dt>
                      <dd className="sl-receive">
                        {(payableTotal - sellerFee(payableTotal)).toFixed(2)} Tk
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
              noun="orders"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
