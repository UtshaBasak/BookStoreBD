import { useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FaCheck } from 'react-icons/fa';

import './Seller.css';
import Logo from '../components/Logo.js';
import CancelOrder, { CancelledNote } from '../components/CancelOrder.js';
import CopyButton from '../components/CopyButton.js';
import OrderPdfButton from '../components/OrderPdfButton.js';
import NotificationBell from '../components/NotificationBell.js';
import { site } from '../config/site.js';
import { useOrder, useUpdateOrderStatus } from '../hooks/queries.js';
import { getUserEmail } from '../utils/auth.js';
import { CANCELLED } from '../utils/orderTotals.js';
import { categoryLabel } from '../config/categories.js';
import { conditionOf } from '../utils/bookText.js';
import { digits, formatDateTime, t } from '../utils/language.js';
import { statusLabel } from '../utils/orderStatus.js';

/** Money to the paisa: "285.00" in English, "২৮৫.০০" in Bangla. */
const money = (amount: number) => digits(amount.toFixed(2));

/** A book type as it reads; English shows the stored value, as before. */
const bookTypeLabel = (value: string): string =>
  value === 'new' ? t(value, 'নতুন') : value === 'old' ? t(value, 'পুরোনো') : value;

/** A payment method as it reads; the stored value is shown as it is in English. */
const paymentLabel = (method: string): string =>
  /^cash on delivery$/i.test(method)
    ? t(method, 'ক্যাশ অন ডেলিভারি')
    : /^bkash$/i.test(method)
      ? t(method, 'বিকাশ')
      : method;

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

  const orderQuery = useOrder(orderNumber);
  const order = orderQuery.data ?? null;
  const { mutateAsync: updateStatus, isPending: updating } = useUpdateOrderStatus(orderNumber);

  const handleStatusChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    setError('');
    try {
      // The mutation invalidates this order, so the summarised view is refetched
      // rather than rebuilt from the PATCH response, which carries only the raw
      // order lines.
      await updateStatus(e.target.value);
    } catch {
      setError(t('Failed to update status', 'অবস্থা হালনাগাদ করা যায়নি'));
    }
  };

  const topbar = (
    <header className="sl-topbar">
      <Link to="/" className="sl-logo-link" aria-label={t(`${site.name} home`, `${site.name} হোম`)}>
        <Logo size={34} />
      </Link>
      <div className="sl-topbar-actions">
        <NotificationBell />
        <Link to="/profile?mode=seller" className="btn btn-ghost">
          {t('← Back to Profile', '← প্রোফাইলে ফিরে যান')}
        </Link>
        <button type="button" onClick={() => void orderQuery.refetch()} disabled={orderQuery.isFetching} className="btn btn-primary">
          ⟳ {orderQuery.isFetching ? t('Refreshing...', 'হালনাগাদ হচ্ছে...') : t('Refresh', 'হালনাগাদ করুন')}
        </button>
      </div>
    </header>
  );

  if (!order) {
    return (
      <div className="sl-page">
        {topbar}
        <div className="sl-wrap" style={{ paddingTop: '1.5rem' }}>
          {/* A failed lookup says so, rather than leaving "Loading..." on screen. */}
          {orderQuery.isError ? (
            <div className="card sl-empty">
              <span className="sl-empty-emoji" aria-hidden="true">🔎</span>
              <h3>{t('We could not load this order', 'অর্ডারটি লোড করা যায়নি')}</h3>
              <p>
                {t(
                  'Check the order number, or go back to your orders and open it from there.',
                  'অর্ডার নম্বরটি দেখুন, অথবা আপনার অর্ডারের তালিকায় ফিরে সেখান থেকে খুলুন।'
                )}
              </p>
              <Link to="/seller-orders" className="btn btn-primary">{t('Your orders', 'আপনার অর্ডার')}</Link>
            </div>
          ) : (
            <div className="card sl-loading"><span className="sl-spinner" aria-hidden="true" /> {t('Loading...', 'লোড হচ্ছে...')}</div>
          )}
        </div>
      </div>
    );
  }

  // Only this seller's books in the order.
  const sellerBooks = (order.books ?? []).filter(book => book.sellerEmail === userEmail);

  // Where this seller's books stand, which is what they move - another
  // seller's books in the same order go at their own pace.
  const liveBooks = sellerBooks.filter((book) => book.status !== CANCELLED);
  const status = liveBooks[0]?.status || (sellerBooks.length ? CANCELLED : order.status || 'Order Confirmed');
  const currentStage = ORDER_STAGES.indexOf(status);
  // What the server will accept from this person, worked out by the server:
  // a seller moves an order up to Shipped, and the courier's steps after that
  // are the shop's.
  const statusOptions = order.statusOptions ?? [];
  const handedOver = status !== CANCELLED && currentStage > ORDER_STAGES.indexOf('Shipped');
  const ownTotal = liveBooks.reduce((sum, ob) => sum + Number(ob.price) * Number(ob.quantity), 0);
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
      {topbar}
      <div className="sl-wrap">
        <section className="sl-hero">
          <span className="sl-kicker">{t('🚚 Order tracking', '🚚 অর্ডার ট্র্যাকিং')}</span>
          <h2>{t('Track Order (Seller)', 'অর্ডার ট্র্যাক করুন (বিক্রেতা)')}</h2>
          <p className="sl-hero-sub">
            {t(
              'Keep the buyer in the loop: move the order along as you pack and send it.',
              'ক্রেতাকে জানিয়ে রাখুন: প্যাক করে পাঠানোর সাথে সাথে অর্ডারের অবস্থা এগিয়ে দিন।'
            )}
          </p>
        </section>

        <div className="sl-track-grid">
          <section className="card sl-card">
            <h3 className="sl-card-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span>{t('Progress', 'অগ্রগতি')}</span>
              <span className={`sl-pill ${status === CANCELLED ? 'is-bad' : status === 'Delivered' ? 'is-done' : currentStage <= 0 ? 'is-pending' : 'is-progress'}`}>
                {statusLabel(status)}
              </span>
            </h3>
            <ol className="sl-steps" aria-label={t('Order progress', 'অর্ডারের অগ্রগতি')}>
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
                      {isActive && (!isCurrent || stage === 'Delivered') ? <FaCheck aria-hidden="true" /> : digits(idx + 1)}
                    </span>
                    <span className="sl-step-label">{statusLabel(stage)}</span>
                  </li>
                );
              })}
            </ol>

            <CancelledNote lines={sellerBooks} />

            {statusOptions.length > 1 && (
              <div className="sl-status-box">
                <label htmlFor="seller-order-status" className="sl-label" style={{ marginBottom: 0 }}>
                  {t('Update Status:', 'অবস্থা হালনাগাদ করুন:')}
                </label>
                <select
                  id="seller-order-status"
                  value={status}
                  onChange={handleStatusChange}
                  disabled={updating}
                  className="field"
                >
                  {statusOptions.map((stage) => (
                    <option key={stage} value={stage}>{statusLabel(stage)}</option>
                  ))}
                </select>
                <p className="sl-status-help">
                  {updating
                    ? t('Saving...', 'সংরক্ষণ হচ্ছে...')
                    : t(
                        'The buyer sees the new status on their tracking page. Once it is Shipped, BookStoreBD takes it from there.',
                        'ক্রেতা তাঁর ট্র্যাকিং পেজে নতুন অবস্থা দেখবেন। পাঠানো হয়েছে হলে এরপর BookStoreBD দায়িত্ব নেয়।'
                      )}
                </p>
                {error && <span role="alert" className="sl-error">{error}</span>}
              </div>
            )}
            {handedOver && (
              <p className="sl-status-box sl-status-help" role="note">
                {t(
                  'This order has left your hands: BookStoreBD updates it until it is delivered. You are paid once the buyer\'s return window closes.',
                  'অর্ডারটি আপনার হাত থেকে চলে গেছে: ডেলিভারি পর্যন্ত BookStoreBD এর অবস্থা হালনাগাদ করবে। ক্রেতার রিটার্নের সময় শেষ হলে আপনি পেমেন্ট পাবেন।'
                )}
              </p>
            )}
            {order.canCancel && (
              <div className="sl-status-box">
                <CancelOrder orderNumber={order.orderNumber} who="seller" />
              </div>
            )}
          </section>

          <section className="card sl-card">
            <h3 className="sl-card-title">{t('Order', 'অর্ডার')}</h3>
            <dl className="sl-info">
              <div style={{ gridColumn: '1 / -1' }}>
                <dt>{t('Order Number', 'অর্ডার নম্বর')}</dt>
                <dd className="sl-order-no-value">{order.orderNumber}<CopyButton text={order.orderNumber} /></dd>
              </div>
              <div>
                <dt>{t('Placed On', 'অর্ডারের সময়')}</dt>
                <dd>{order.createdAt ? formatDateTime(order.createdAt) : ''}</dd>
              </div>
              <div>
                <dt>{t('Payment Method', 'পেমেন্টের পদ্ধতি')}</dt>
                <dd>{paymentLabel(order.paymentMethod || 'Cash on Delivery')}</dd>
              </div>
            </dl>
            <div style={{ marginTop: '1rem' }}>
              <OrderPdfButton order={order} role="seller" />
            </div>
            <h3 className="sl-card-title" style={{ margin: '1.5rem 0 0.9rem' }}>{t('Buyer Information', 'ক্রেতার তথ্য')}</h3>
            <dl className="sl-info">
              <div>
                <dt>{t('Name', 'নাম')}</dt>
                <dd>{order.contactName}</dd>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <dt>{t('Email', 'ই-মেইল')}</dt>
                <dd>{order.buyerEmail}</dd>
              </div>
              {order.buyerNote && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt>{t('Note from the buyer', 'ক্রেতার নোট')}</dt>
                  <dd className="sl-buyer-note">{order.buyerNote}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <section className="card sl-card" style={{ marginTop: '1.25rem' }}>
          <h3 className="sl-card-title">{t('Order Details', 'অর্ডারের বিবরণ')}</h3>
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
                {sellerBooks.map((ob, idx) => (
                  <tr key={ob._id || idx} className={ob.status === CANCELLED ? 'sl-row-cancelled' : undefined}>
                    <td data-label={col.title} className="sl-title-cell">
                      {ob.title}
                      {ob.status === CANCELLED && sellerBooks.length > 1 && <span className="sl-pill is-bad sl-line-pill">{statusLabel(CANCELLED)}</span>}
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
                  <td className="sl-price">৳{money(ownTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
