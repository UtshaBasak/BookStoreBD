import { useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FaCheck } from 'react-icons/fa';

import './Seller.css';
import Logo from '../components/Logo.js';
import { site } from '../config/site.js';
import { useOrder, useUpdateOrderStatus } from '../hooks/queries.js';
import { getUserEmail, getUserRole } from '../utils/auth.js';

const ORDER_STAGES = [
  'Order Confirmed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered'
];

export default function SellerOrderTrackingPage() {
  const { orderNumber } = useParams();
  const [error, setError] = useState('');
  const userEmail = getUserEmail();
  // The role is stored under 'userRole'; reading 'role' always came back null,
  // so this control never appeared for anyone.
  const userRole = getUserRole();

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

  const topbar = (
    <header className="sl-topbar">
      <Link to="/" className="sl-logo-link" aria-label={`${site.name} home`}>
        <Logo size={34} />
      </Link>
      <div className="sl-topbar-actions">
        <Link to="/profile?mode=seller" className="btn btn-ghost">
          ← Back to Profile
        </Link>
        <button type="button" onClick={() => window.location.reload()} className="btn btn-primary">
          ⟳ Refresh
        </button>
      </div>
    </header>
  );

  if (!order) {
    return (
      <div className="sl-page">
        {topbar}
        <div className="sl-wrap" style={{ paddingTop: '1.5rem' }}>
          {/* A failed lookup used to leave "Loading..." on the screen for good. */}
          {orderQuery.isError ? (
            <div className="card sl-empty">
              <span className="sl-empty-emoji" aria-hidden="true">🔎</span>
              <h3>We could not load this order</h3>
              <p>Check the order number, or go back to your orders and open it from there.</p>
              <Link to="/seller-orders" className="btn btn-primary">Your orders</Link>
            </div>
          ) : (
            <div className="card sl-loading"><span className="sl-spinner" aria-hidden="true" /> Loading...</div>
          )}
        </div>
      </div>
    );
  }

  // Filter books for this seller
  const sellerBooks = (order.books ?? []).filter(book => book.sellerEmail === userEmail);

  // Only admin or the seller of this order can update status. There is no
  // 'seller' role - accounts are 'user' or 'admin' - so this used to require
  // one that never exists and the control appeared for administrators only.
  // Selling is decided the way the API decides it: by whose books these are.
  const canUpdateStatus =
    userRole === 'admin' ||
    (Boolean(userEmail) && (order.sellerEmail === userEmail || sellerBooks.length > 0));

  const status = order.status || 'Order Confirmed';
  const currentStage = ORDER_STAGES.indexOf(status);

  return (
    <div className="sl-page">
      {topbar}
      <div className="sl-wrap">
        <section className="sl-hero">
          <span className="sl-kicker">🚚 Order tracking</span>
          <h2>Track Order (Seller)</h2>
          <p className="sl-hero-sub">
            Keep the buyer in the loop: move the order along as you pack and send it.
          </p>
        </section>

        <div className="sl-track-grid">
          <section className="card sl-card">
            <h3 className="sl-card-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span>Progress</span>
              <span className={`sl-pill ${status === 'Delivered' ? 'is-done' : currentStage <= 0 ? 'is-pending' : 'is-progress'}`}>
                {status}
              </span>
            </h3>
            <ol className="sl-steps" aria-label="Order progress">
              {ORDER_STAGES.map((stage, idx) => {
                const isActive = idx <= currentStage;
                const isCurrent = idx === currentStage;
                return (
                  <li
                    key={stage}
                    className={isCurrent ? 'is-done is-current' : isActive ? 'is-done' : ''}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span className="sl-step-dot">
                      {isActive && (!isCurrent || stage === 'Delivered') ? <FaCheck aria-hidden="true" /> : idx + 1}
                    </span>
                    <span className="sl-step-label">{stage}</span>
                  </li>
                );
              })}
            </ol>

            {canUpdateStatus && (
              <div className="sl-status-box">
                <label htmlFor="seller-order-status" className="sl-label" style={{ marginBottom: 0 }}>
                  Update Status:
                </label>
                <select
                  id="seller-order-status"
                  value={order.status}
                  onChange={handleStatusChange}
                  disabled={updating}
                  className="field"
                >
                  {ORDER_STAGES.map(stage => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
                <p className="sl-status-help">{updating ? 'Saving...' : 'The buyer sees the new status on their tracking page.'}</p>
                {error && <span role="alert" className="sl-error">{error}</span>}
              </div>
            )}
          </section>

          <section className="card sl-card">
            <h3 className="sl-card-title">Order</h3>
            <dl className="sl-info">
              <div style={{ gridColumn: '1 / -1' }}>
                <dt>Order Number</dt>
                <dd className="sl-order-no-value">{order.orderNumber}</dd>
              </div>
              <div>
                <dt>Placed On</dt>
                <dd>{order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}</dd>
              </div>
              <div>
                <dt>Payment Method</dt>
                <dd>{order.paymentMethod || 'Cash on Delivery'}</dd>
              </div>
            </dl>
            <h3 className="sl-card-title" style={{ margin: '1.5rem 0 0.9rem' }}>Buyer Information</h3>
            <dl className="sl-info">
              <div>
                <dt>Name</dt>
                <dd>{order.contactName}</dd>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <dt>Email</dt>
                <dd>{order.buyerEmail}</dd>
              </div>
            </dl>
          </section>
        </div>

        {/* Seller Order Details Table OUTSIDE the card */}
        <section className="card sl-card" style={{ marginTop: '1.25rem' }}>
          <h3 className="sl-card-title">Order Details</h3>
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
                {sellerBooks.map((ob, idx) => (
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
                  <td className="sl-price">৳{sellerBooks.reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
