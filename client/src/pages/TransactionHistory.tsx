import { useState } from 'react';
import { FaReceipt, FaSearch, FaSyncAlt, FaTruck } from 'react-icons/fa';

import type { OrderLine } from '@shared/api.js';

import './AdminPanel.css';
import { useAllOrders } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import Pager from '../components/Pager.js';

// Utility to format date as dd/mm/yyyy
function formatDate(dateStr: string | undefined) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
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

  /*
   * This fetched every order line ever placed and then searched and grouped
   * them here, so the search box could only find an order that had already
   * been downloaded. The API pages by order - never cutting between the books
   * of one purchase - and searches the whole table.
   */
  const settledSearch = useDebounced(search);
  const ordersQuery = useAllOrders({
    search: settledSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const pageCount = ordersQuery.data?.pageCount ?? 1;
  const currentPage = ordersQuery.data?.page ?? page;
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
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaReceipt />
            </span>
            Transaction History
          </h1>
          <p className="admin-lede">
            Every order placed in the shop, newest first. Open one to follow it or move it along.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost admin-btn-sm"
          onClick={fetchOrders}
          disabled={refreshing}
        >
          <FaSyncAlt aria-hidden="true" className={refreshing ? 'admin-spin' : undefined} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>
      {/* Search bar */}
      <div className="admin-toolbar">
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="field"
            placeholder="Search by order number, buyer, seller, title, or author..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // Page 4 of a search nobody is running any more is a dead end.
              setPage(1);
            }}
          />
        </div>
      </div>
      {/* Individual Order Cards */}
      <div className="admin-orders">
        {Object.keys(grouped).length === 0 ? (
          <div className="admin-card admin-empty">
            <span className="admin-empty-mark" aria-hidden="true">
              🧾
            </span>
            <p>No transactions found.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([orderNumber, orderBooks]) => {
            const order = orderBooks[0];
            const displayOrderNumber = order.orderNumber && !/@|T\d{2}:\d{2}/.test(order.orderNumber)
              ? order.orderNumber
              : orderNumber;
            const itemTotal = orderBooks.reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
            const shipping = typeof order.shippingCharge === 'number' ? order.shippingCharge : 0;
            const discount = typeof order.discount === 'number' ? order.discount : 0;
            const promo = order.promo || '';
            const promoApplied = !!order.promoApplied;
            const finalTotal = itemTotal + shipping - discount;
            const status = order.status;
            const shownStatus = status || 'Order Confirmed';

            return (
              <article key={orderNumber} className="admin-card admin-order">
                <div className="admin-order-head">
                  <div style={{ minWidth: 0 }}>
                    <p className="admin-order-number">
                      <span>
                        Order Number: <span className="admin-mono">{displayOrderNumber}</span>
                      </span>
                      <span className={`badge admin-status ${statusTone(shownStatus)}`}>
                        <span className="sr-only">Status: </span>
                        {shownStatus}
                      </span>
                    </p>
                    <p className="admin-meta">
                      <span>
                        <b>Order Placed On:</b> {formatDate(order.createdAt)}
                      </span>
                      <span>
                        <b>Buyer Email:</b> {order.buyerEmail}
                      </span>
                    </p>
                  </div>
                  {/* Track The Order button */}
                  <button
                    type="button"
                    className="btn btn-primary admin-btn-sm"
                    onClick={() => window.location.href = `/admin/order-tracking/${order.orderNumber ? order.orderNumber : order._id}`}
                  >
                    <FaTruck aria-hidden="true" />
                    Track The Order
                  </button>
                </div>
                <div className="table-scroll">
                <table className="styled-table">
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
                      <tr key={ob._id || idx}>
                        <td className="admin-cell-strong" style={{ minWidth: 150 }}>{ob.title}</td>
                        <td style={{ minWidth: 130 }}>{ob.author}</td>
                        <td style={{ minWidth: 120 }}>{Array.isArray(ob.category) ? ob.category.join(', ') : ob.category}</td>
                        <td style={{ textTransform: 'capitalize' }}>{ob.bookType}</td>
                        <td style={{ textTransform: 'capitalize' }}>{ob.condition}</td>
                        <td className="admin-num">{ob.pages}</td>
                        <td className="admin-num">{ob.price}</td>
                        <td className="admin-num">{ob.quantity}</td>
                        <td>{ob.sellerEmail}</td>
                        <td className="admin-num admin-cell-strong">{(Number(ob.price) * Number(ob.quantity)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {/* Under the table rather than in its footer: ten columns scroll
                    sideways, and the totals sat in the last one, off screen. */}
                <dl className="admin-totals">
                  <div>
                    <dt>Subtotal:</dt>
                    <dd>{itemTotal.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Shipping Charge:</dt>
                    <dd>{shipping.toFixed(2)}</dd>
                  </div>
                  {discount > 0 && (
                    <div>
                      <dt>Discount{promoApplied && promo ? ` (${promo})` : ''}:</dt>
                      <dd style={{ color: '#047857' }}>- {discount.toFixed(2)}</dd>
                    </div>
                  )}
                  <div className="admin-grand">
                    <dt>Order Total:</dt>
                    <dd className="admin-price">৳{finalTotal.toFixed(2)}</dd>
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
          noun="orders"
        />
      </div>
    </div>
  );
}
