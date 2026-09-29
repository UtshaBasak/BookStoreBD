import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSearch, FaTruck } from 'react-icons/fa';

import type { OrderLine } from '@shared/api.js';

import { useBuyerOrders } from '../../hooks/queries.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import Pager from '../../components/Pager.js';
import '../../styles/orderTracking.css';

/** Orders per page. Each one may be several rows. */
const PAGE_SIZE = 25;

/** A status's pill: delivered green, on its way violet, anything else amber. */
const statusColours = (status: string) =>
  status === 'Delivered'
    ? { background: '#ecfdf5', color: '#047857' }
    : ['Order Confirmed', 'Processing', 'Shipped', 'Out for Delivery'].includes(status)
      ? { background: '#f3efff', color: '#5b21b6' }
      : { background: '#fff7ed', color: '#c2410c' };

export default function BuyerOrderList() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const [page, setPage] = useState(1);

  // Fetched every order this account has ever placed, and searched them here.
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

  // Was a `position: fixed` layer over the whole window with its own scroll,
  // which a phone's browser bar and pull-to-refresh do not expect. A page.
  return (
    <div className="ot-page">
      <div className="ot-wrap" style={{ maxWidth: 1200 }}>
        <div className="ot-toolbar">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/profile')}>
            ← Return to Profile
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={fetchOrders}
            disabled={refreshing}
            style={{ cursor: refreshing ? 'not-allowed' : 'pointer' }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <p className="ot-kicker">🛍️ Orders</p>
        <h1 className="m-0" style={{ fontSize: 'clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem)' }}>Your Orders (as Buyer)</h1>

        <div className="relative mt-4 mb-5" style={{ maxWidth: 440 }}>
          <FaSearch
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted"
          />
          <input name="q"
            type="text"
            className="field"
            style={{ paddingLeft: 42, borderRadius: 999 }}
            placeholder="Search by order number, title, author or seller..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div>
          {loading ? (
            <div className="py-10 text-center font-semibold text-ink-muted">Loading...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="card p-8 text-center text-ink-muted">No orders found.</div>
          ) : (
            Object.entries(grouped).map(([orderNumber, orderBooks]) => {
              const order = orderBooks[0];
              const shippingCost = order.shippingCharge || 0;
              const discount = order.discount || 0;
              const booksTotal = orderBooks.reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
              const totalCost = booksTotal + Number(shippingCost) - Number(discount);
              const displayOrderNumber = order.orderNumber && !/@|T\d{2}:\d{2}/.test(order.orderNumber)
                ? order.orderNumber
                : orderNumber;
              const status = order.status || 'Order Confirmed';
              return (
                <section key={orderNumber} className="card mb-5 min-w-0 p-4 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-ink-muted">
                        Order Placed On: {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}
                      </div>
                      <div className="mt-1 text-lg font-bold text-ink">
                        Order Number: <span className="ot-mono">{displayOrderNumber}</span>
                      </div>
                      <span className="ot-pill mt-2" style={statusColours(status)}>
                        Status: {status}
                      </span>
                    </div>
                    {/* Track Your Order button */}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => navigate(`/order-tracking/${order.orderNumber ? order.orderNumber : order._id}`)}
                    >
                      <FaTruck aria-hidden="true" /> Track Your Order
                    </button>
                  </div>
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
                        <tr key={ob._id || idx}>
                          <td className="font-semibold text-ink">{ob.title}</td>
                          <td>{ob.author}</td>
                          <td>{Array.isArray(ob.category) ? ob.category.join(', ') : ob.category}</td>
                          <td>{ob.bookType}</td>
                          <td>{ob.condition}</td>
                          <td>{ob.pages}</td>
                          <td>{ob.price}</td>
                          <td>{ob.quantity}</td>
                          <td>{ob.sellerEmail}</td>
                          <td className="font-bold" style={{ color: '#ff5c35' }}>
                            {(Number(ob.price) * Number(ob.quantity)).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {/* Under the table rather than in its footer, which sat off
                      the right-hand edge of a phone. */}
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
