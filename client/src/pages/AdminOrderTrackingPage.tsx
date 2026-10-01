import { useEffect, useState, type ChangeEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FaBook,
  FaCheck,
  FaMapMarkerAlt,
  FaReceipt,
  FaRoute,
  FaTruck,
  FaUser,
} from 'react-icons/fa';
import './AdminPanel.css';
import Logo from '../components/Logo.js';
import CancelOrder, { CancelledNote } from '../components/CancelOrder.js';
import CopyButton from '../components/CopyButton.js';
import OrderPdfButton from '../components/OrderPdfButton.js';
import { useOrder, useUpdateOrderStatus } from '../hooks/queries.js';
import { messageOf } from '../utils/apiError.js';
import { isAdmin } from '../utils/auth.js';

const ORDER_STAGES = [
  'Order Confirmed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered'
];

/** The colour of the status pill: waiting, under way, delivered or called off. */
const statusTone = (status: string) =>
  status === 'Delivered'
    ? 'is-good'
    : status === 'Cancelled'
      ? 'is-bad'
      : status === 'Order Confirmed'
        ? 'is-pending'
        : 'is-progress';

export default function AdminOrderTrackingPage() {
  const navigate = useNavigate();
  const { orderNumber } = useParams();
  // Rendering guard only; the API enforces the real check.
  useEffect(() => {
    if (!isAdmin()) {
      navigate('/sign-in', { replace: true });
    }
  }, [navigate]);
  const [_error, setError] = useState('');

  const orderQuery = useOrder(orderNumber);
  const order = orderQuery.data ?? null;
  const { mutateAsync: updateStatus } = useUpdateOrderStatus(orderNumber);

  // The select reflects the order until an admin picks something else. Derived
  // from the query rather than mirrored into state by an effect, which is what
  // the cascading-render warning was about.
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const statusValue = statusOverride ?? order?.status ?? 'Order Confirmed';

  const handleStatusChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    setStatusOverride(newStatus);
    setError('');
    try {
      // The mutation invalidates this order, so the refetch is automatic.
      await updateStatus(newStatus);
      setStatusOverride(null);
    } catch (error) {
      setError('Failed to update status: ' + messageOf(error));
      setStatusOverride(null);
    }
  };

  // The top bar, drawn in every state so there is always a way back.
  const bar = (
    <header className="aurora admin-order-bar">
      <Logo inverted size={32} />
      <div className="admin-order-bar-actions">
        <Link to="/admin/users"
          className="admin-side-button keep-text"
        >
          ← Back to Admin Panel
        </Link>
        <button type="button" className="btn btn-primary" onClick={() => void orderQuery.refetch()} disabled={orderQuery.isFetching}>
          ⟳ {orderQuery.isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </header>
  );

  if (!order) {
    return (
      <div className="admin-order-page">
        {bar}
        <div className="admin-order-body admin-page">
          {orderQuery.error ? (
            // A lookup that failed used to leave "Loading..." on screen for ever.
            <div className="admin-alert" role="alert">
              Could not load order {orderNumber}: {orderQuery.error.message}
            </div>
          ) : (
            <div className="admin-loading">Loading...</div>
          )}
        </div>
      </div>
    );
  }

  const books = order.books || [];
  // The server's totals, which leave cancelled books out.
  const itemTotal = Number(order.booksTotal) || 0;
  const shipping = typeof order.shippingCost === 'number' ? order.shippingCost : 0;
  const discount = typeof order.discount === 'number' ? order.discount : 0;
  const finalTotal = Number(order.totalCost) || 0;
  const statusOptions = order.statusOptions ?? [];
  const currentStatus = order.status || 'Order Confirmed';
  const currentIndex = ORDER_STAGES.indexOf(currentStatus);

  return (
    <div className="admin-order-page">
      {bar}
      <main className="admin-order-body admin-page">
        <header className="admin-page-head">
          <div>
            <h2 className="admin-page-title">
              <span className="admin-page-icon" aria-hidden="true">
                <FaTruck />
              </span>
              Track The Order (Admin)
            </h2>
            <p className="admin-lede">
              Move the order along as it happens; the buyer sees each step on their own tracking page.
            </p>
          </div>
          <span className="admin-head-tools">
            <OrderPdfButton order={order} role="admin" className="btn btn-ghost admin-btn-sm" />
            <span className={`badge admin-status admin-status-lg ${statusTone(currentStatus)}`}>
              {currentStatus}
            </span>
          </span>
        </header>

        <section className="admin-card admin-panel-card" style={{ marginBottom: 16 }}>
          <h3>
            <FaRoute aria-hidden="true" />
            Progress
          </h3>
          <ol className="admin-steps">
            {ORDER_STAGES.map((stage, idx) => {
              const isActive = idx <= currentIndex;
              const isCurrent = idx === currentIndex;
              return (
                <li
                  key={stage}
                  className={`admin-step${isActive ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className="admin-step-dot" aria-hidden="true">
                    {isCurrent ? '★' : isActive ? <FaCheck /> : idx + 1}
                  </span>
                  <span>{stage}</span>
                </li>
              );
            })}
          </ol>
          <CancelledNote lines={books} />
          <div className="admin-status-form">
            {statusOptions.length > 0 && (
              <label>
                <b>Update Status: </b>
                <select name="status" value={statusValue} onChange={handleStatusChange} className="field">
                  {statusOptions.map((stage) => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </label>
            )}
            {order.canCancel && <CancelOrder orderNumber={order.orderNumber} who="admin" />}
            {_error && <span className="admin-alert" style={{ margin: 0 }}>{_error}</span>}
          </div>
        </section>

        <div className="admin-order-grid">
          <section className="admin-card admin-panel-card">
            <h3>
              <FaReceipt aria-hidden="true" />
              Order
            </h3>
            <dl className="admin-facts">
              <div>
                <dt>Order Number:</dt>
                <dd className="admin-mono" style={{ color: '#ff5c35' }}>{order.orderNumber}<CopyButton text={order.orderNumber} /></dd>
              </div>
              <div>
                <dt>Placed On:</dt>
                <dd>{order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}</dd>
              </div>
              <div>
                <dt>Status:</dt>
                <dd>{currentStatus}</dd>
              </div>
              <div>
                <dt>Payment Method</dt>
                <dd>{order.paymentMethod || 'Cash on Delivery'}</dd>
              </div>
            </dl>
          </section>
          <section className="admin-card admin-panel-card">
            <h3>
              <FaUser aria-hidden="true" />
              Contact Information
            </h3>
            <dl className="admin-facts">
              <div>
                <dt>Name:</dt>
                <dd>{order.contactName || ''}</dd>
              </div>
              <div>
                <dt>Email:</dt>
                <dd>{order.buyerEmail || ''}</dd>
              </div>
              <div>
                <dt>Phone:</dt>
                <dd className="admin-mono">{order.contactPhone || ''}</dd>
              </div>
            </dl>
          </section>
          <section className="admin-card admin-panel-card">
            <h3>
              <FaMapMarkerAlt aria-hidden="true" />
              Delivery Information
            </h3>
            <dl className="admin-facts">
              <div>
                <dt>Division:</dt>
                <dd>{order.deliveryDivision || ''}</dd>
              </div>
              <div>
                <dt>District:</dt>
                <dd>{order.deliveryDistrict || ''}</dd>
              </div>
              <div>
                <dt>Address:</dt>
                <dd>{order.deliveryAddress || ''}</dd>
              </div>
              {order.buyerNote && (
                <div>
                  <dt>Buyer&apos;s note:</dt>
                  <dd style={{ whiteSpace: 'pre-line' }}>{order.buyerNote}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        {/* Admin Transaction History Style Table */}
        <section className="admin-card admin-panel-card">
          <h3>
            <FaBook aria-hidden="true" />
            Order Details
          </h3>
          <div className="table-scroll admin-table-round">
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
                {books.map((ob, idx) => (
                  <tr key={ob._id || idx} className={ob.status === 'Cancelled' ? 'admin-row-cancelled' : undefined}>
                    <td className="admin-cell-strong" style={{ minWidth: 150 }}>
                      {ob.title}
                      {ob.status === 'Cancelled' && books.length > 1 && (
                        <span className="badge admin-status is-bad admin-line-pill">Cancelled</span>
                      )}
                    </td>
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
          {/* Under the table rather than in its footer, which scrolled off
              the side of a phone with the last column. */}
          <dl className="admin-totals">
            <div>
              <dt>Subtotal:</dt>
              <dd>{itemTotal.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Shipping Cost:</dt>
              <dd>{Number(shipping).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Discount:</dt>
              <dd>-{Number(discount).toFixed(2)}</dd>
            </div>
            <div className="admin-grand">
              <dt>Order Total:</dt>
              <dd className="admin-price">৳{finalTotal.toFixed(2)}</dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}
