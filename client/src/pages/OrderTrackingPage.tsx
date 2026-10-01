import { useState, type ChangeEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FaCheck, FaMapMarkerAlt, FaMoneyBillWave, FaTimesCircle, FaTruck, FaUser } from 'react-icons/fa';

import '../styles/orderTracking.css';
import CancelOrder, { CancelledNote } from '../components/CancelOrder.js';
import CopyButton from '../components/CopyButton.js';
import OrderPdfButton from '../components/OrderPdfButton.js';
import NotificationBell from '../components/NotificationBell.js';
import { useOrder, useUpdateOrderStatus } from '../hooks/queries.js';
import { CANCELLED } from '../utils/orderTotals.js';

const ORDER_STAGES = [
  'Order Confirmed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered'
];

/** The pill colours for a status: delivered green, on its way violet. */
const statusColours = (status: string) =>
  status === 'Delivered'
    ? { background: '#ecfdf5', color: '#047857' }
    : status === CANCELLED
      ? { background: '#fef2f2', color: '#b91c1c' }
      : ORDER_STAGES.includes(status)
      ? { background: '#f3efff', color: '#5b21b6' }
      : { background: '#fff7ed', color: '#c2410c' };

export default function OrderTrackingPage() {
  const { orderNumber } = useParams();
  const [error, setError] = useState('');

  const orderQuery = useOrder(orderNumber);
  const order = orderQuery.data ?? null;
  const { mutateAsync: updateStatus, isPending: updating } = useUpdateOrderStatus(orderNumber);

  const handleStatusChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    setError('');
    try {
      // The mutation invalidates this order, so the summarised view is refetched
      // rather than rebuilt from the PATCH response - which answers with the raw
      // order lines and used to blank the page.
      await updateStatus(e.target.value);
    } catch {
      setError('Failed to update status');
    }
  };

  const toolbar = (
    <div className="ot-toolbar">
      <Link to="/profile" className="btn btn-ghost">
        ← Back to Profile
      </Link>
      <span className="ot-toolbar-end">
        <NotificationBell />
        <button type="button" className="btn btn-primary" onClick={() => void orderQuery.refetch()} disabled={orderQuery.isFetching}>
          ⟳ {orderQuery.isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </span>
    </div>
  );

  if (!order) {
    return (
      <div className="ot-page">
        <div className="ot-wrap">
          {toolbar}
          {/* A failed lookup used to leave "Loading..." on the screen for good. */}
          {orderQuery.isError ? (
            <div role="alert" className="card mx-auto max-w-md p-8 text-center">
              <p className="m-0 text-lg font-bold text-ink">We could not find that order.</p>
              <p className="m-0 mt-1 text-ink-muted">Check the order number, or find it under your orders.</p>
            </div>
          ) : (
            <p role="status" className="py-16 text-center font-semibold text-ink-muted">Loading...</p>
          )}
        </div>
      </div>
    );
  }

  // The server says who may move it and to what: nothing, for a buyer.
  const statusOptions = order.statusOptions ?? [];
  const canUpdateStatus = statusOptions.length > 1;

  const status = order.status || 'Order Confirmed';
  const currentIndex = ORDER_STAGES.indexOf(status);

  return (
    <div className="ot-page">
      <div className="ot-wrap">
        {toolbar}

        <section className="card p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="ot-kicker">📦 Order tracking</p>
              <h1 className="m-0" style={{ fontSize: 'clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem)' }}>Track Your Order</h1>
            </div>
            <span className="ot-pill" style={statusColours(status)}>
              {status === 'Delivered' ? <FaCheck aria-hidden="true" /> : status === CANCELLED ? <FaTimesCircle aria-hidden="true" /> : <FaTruck aria-hidden="true" />}
              <span><span className="sr-only">Status: </span>{status}</span>
            </span>
          </div>
          <ul className="ot-meta">
            <li><b>Order Number:</b> <span className="ot-mono">{order.orderNumber}</span><CopyButton text={order.orderNumber} /></li>
            <li><b>Placed On:</b> {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}</li>
          </ul>
          <div className="ot-doc-row">
            <OrderPdfButton order={order} role="buyer" />
          </div>

          <CancelledNote lines={order.books ?? []} />

          {status !== CANCELLED && (
          <ol className="ot-stepper" aria-label="Order progress">
            {ORDER_STAGES.map((stage, idx) => {
              const isActive = idx <= currentIndex;
              const isCurrent = idx === currentIndex;
              return (
                <li
                  key={stage}
                  className={`ot-step${isActive && !isCurrent ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className="ot-dot" aria-hidden="true">
                    {isActive && !isCurrent ? <FaCheck /> : isCurrent ? (idx === ORDER_STAGES.length - 1 ? <FaCheck /> : <FaTruck />) : idx + 1}
                  </span>
                  <span className="ot-label">{stage}</span>
                </li>
              );
            })}
          </ol>
          )}

          {order.canCancel && (
            <div className="mt-6 flex flex-wrap justify-center border-t border-line pt-5">
              <CancelOrder orderNumber={order.orderNumber} who="buyer" />
            </div>
          )}

          {canUpdateStatus && (
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 border-t border-line pt-5">
              <label className="flex flex-wrap items-center gap-2">
                <b>Update Status: </b>
                <select name="status"
                  value={order.status}
                  onChange={handleStatusChange}
                  disabled={updating}
                  className="field"
                  style={{ width: 'auto' }}
                >
                  {statusOptions.map((stage) => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </label>
              {error && <span style={{ color: '#b91c1c', fontWeight: 600 }}>{error}</span>}
            </div>
          )}
        </section>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <section className="card p-5">
            <h2 className="ot-info-title"><FaMoneyBillWave aria-hidden="true" /> Payment Method</h2>
            <p className="m-0 font-bold" style={{ color: '#ff5c35' }}>{order.paymentMethod || 'Cash on Delivery'}</p>
          </section>
          <section className="card p-5">
            <h2 className="ot-info-title"><FaUser aria-hidden="true" /> Contact Information</h2>
            <p className="ot-row">Name: <b>{order.contactName}</b></p>
            <p className="ot-row">Email: <b>{order.buyerEmail}</b></p>
            <p className="ot-row">Phone: <b>{order.contactPhone}</b></p>
          </section>
          <section className="card p-5">
            <h2 className="ot-info-title"><FaMapMarkerAlt aria-hidden="true" /> Delivery Information</h2>
            <p className="ot-row">Division: <b>{order.deliveryDivision}</b></p>
            <p className="ot-row">District: <b>{order.deliveryDistrict}</b></p>
            <p className="ot-row">Address: <b>{order.deliveryAddress}</b></p>
            {order.buyerNote && <p className="ot-row ot-note">Your note to the seller: <b>{order.buyerNote}</b></p>}
          </section>
        </div>

        {/* Order Details Table OUTSIDE the card, after progress bar */}
        <section className="card mt-4 min-w-0 p-4 sm:p-6">
          <h2 className="m-0 text-xl">Order Details</h2>
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
                {(order.books || [order]).map((ob, idx) => (
                  <tr key={ob._id || idx} className={ob.status === CANCELLED ? 'ot-row-cancelled' : undefined}>
                    <td className="font-semibold text-ink">
                      <Link to={`/book/${ob.bookId}`}>{ob.title}</Link>
                      {ob.status === CANCELLED && (order.books?.length ?? 0) > 1 && <span className="ot-line-pill">Cancelled</span>}
                    </td>
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
          <div className="ot-totals">
            <div><span>Subtotal:</span><span>৳{order.booksTotal?.toFixed(2) || ''}</span></div>
            <div><span>Shipping Cost:</span><span>৳{Number(order.shippingCost).toFixed(2)}</span></div>
            <div><span>Discount:</span><span>-৳{Number(order.discount).toFixed(2)}</span></div>
            <div className="ot-grand"><span>Order Total:</span><span>৳{order.totalCost?.toFixed(2) || ''}</span></div>
          </div>
        </section>
      </div>
    </div>
  );
}
