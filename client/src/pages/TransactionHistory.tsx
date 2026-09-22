import { useState } from 'react';

import type { OrderLine } from '@shared/api.js';

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
    <div style={{ padding: '2rem', background: '#fff', minHeight: '100vh', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1>Transaction History</h1>
        <button
          onClick={fetchOrders}
          disabled={refreshing}
          style={{
            backgroundColor: '#43a047',
            color: 'white',
            padding: '0.5rem 1.5rem',
            border: 'none',
            borderRadius: '4px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            minWidth: 120
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {/* Search bar */}
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Search by order number, buyer, seller, title, or author..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            // Page 4 of a search nobody is running any more is a dead end.
            setPage(1);
          }}
          style={{
            padding: '0.5rem',
            borderRadius: 4,
            border: '1px solid #ccc',
            width: '100%',
            maxWidth: 500,
            fontSize: 16,
            boxSizing: 'border-box'
          }}
        />
      </div>
      {/* Individual Order Cards */}
      <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto' }}>
        {Object.keys(grouped).length === 0 ? (
          <div>No transactions found.</div>
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

            return (
              <div key={orderNumber} style={{
                marginBottom: 40,
                background: '#fff',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                padding: 24,
                border: '1px solid #e0e0e0',
                position: 'relative'
              }}>
                {/* Track The Order button */}
                <button
                  onClick={() => window.location.href = `/admin/order-tracking/${order.orderNumber ? order.orderNumber : order._id}`}
                  style={{
                    position: 'absolute',
                    top: 24,
                    right: 24,
                    backgroundColor: '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    padding: '0.5rem 1.5rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    zIndex: 2
                  }}
                >
                  Track The Order
                </button>
                <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 18 }}>
                  Order Placed On: {formatDate(order.createdAt)} <br />
                  <span>
                    Order Number: <span style={{ color: '#e65100', fontWeight: 700 }}>{displayOrderNumber}</span>
                  </span>
                  <span style={{ marginLeft: 24, color: '#2196F3', fontWeight: 500 }}>
                    Status: {status || 'Order Confirmed'}
                  </span>
                  <br />
                  <span style={{ color: '#888', fontWeight: 700 }}>
                    Buyer Email: {order.buyerEmail}
                  </span>
                </div>
                <div className="table-scroll">
                <table className="styled-table" style={{ width: '100%', marginBottom: 0 }}>
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
                        <td>{ob.title}</td>
                        <td>{ob.author}</td>
                        <td>{Array.isArray(ob.category) ? ob.category.join(', ') : ob.category}</td>
                        <td>{ob.bookType}</td>
                        <td>{ob.condition}</td>
                        <td>{ob.pages}</td>
                        <td>{ob.price}</td>
                        <td>{ob.quantity}</td>
                        <td>{ob.sellerEmail}</td>
                        <td>{(Number(ob.price) * Number(ob.quantity)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600 }}>Subtotal:</td>
                      <td style={{ fontWeight: 700 }}>{itemTotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600 }}>Shipping Charge:</td>
                      <td style={{ fontWeight: 700 }}>{shipping.toFixed(2)}</td>
                    </tr>
                    {discount > 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600 }}>
                          Discount{promoApplied && promo ? ` (${promo})` : ''}:
                        </td>
                        <td style={{ fontWeight: 700 }}>- {discount.toFixed(2)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'right', fontWeight: 700, fontSize: 16 }}>Order Total:</td>
                      <td style={{ fontWeight: 900, fontSize: 16 }}>{finalTotal.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
                </div>

              </div>
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
  );
}
