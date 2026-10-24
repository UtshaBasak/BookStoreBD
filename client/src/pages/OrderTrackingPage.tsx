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
import { conditionOf } from '../utils/bookText.js';
import { digits, formatDateTime, t } from '../utils/language.js';
import { statusLabel } from '../utils/orderStatus.js';

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
    ? { background: 'var(--color-success-tint)', color: 'var(--color-success-dark)' }
    : status === CANCELLED
      ? { background: 'var(--color-danger-tint)', color: 'var(--color-danger-ink)' }
      : ORDER_STAGES.includes(status)
      ? { background: 'var(--color-brand-tint)', color: 'var(--color-brand-dark)' }
      : { background: 'var(--color-warn-tint)', color: 'var(--color-warn-ink)' };

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
      // rather than rebuilt from the PATCH response, which carries only the raw
      // order lines.
      await updateStatus(e.target.value);
    } catch {
      setError(t('Failed to update status', 'অবস্থা আপডেট করা যায়নি'));
    }
  };

  const toolbar = (
    <div className="ot-toolbar">
      <Link to="/profile" className="btn btn-ghost">
        {t('← Back to Profile', '← প্রোফাইলে ফিরুন')}
      </Link>
      <span className="ot-toolbar-end">
        <NotificationBell />
        <button type="button" className="btn btn-primary" onClick={() => void orderQuery.refetch()} disabled={orderQuery.isFetching}>
          ⟳ {orderQuery.isFetching ? t('Refreshing...', 'রিফ্রেশ হচ্ছে...') : t('Refresh', 'রিফ্রেশ')}
        </button>
      </span>
    </div>
  );

  if (!order) {
    return (
      <div className="ot-page">
        <div className="ot-wrap">
          {toolbar}
          {/* A failed lookup says so, rather than leaving "Loading..." on screen. */}
          {orderQuery.isError ? (
            <div role="alert" className="card mx-auto max-w-md p-8 text-center">
              <p className="m-0 text-lg font-bold text-ink">{t('We could not find that order.', 'অর্ডারটি খুঁজে পাওয়া যায়নি।')}</p>
              <p className="m-0 mt-1 text-ink-muted">
                {t('Check the order number, or find it under your orders.', 'অর্ডার নম্বরটি দেখে নিন, অথবা আপনার অর্ডারের তালিকায় খুঁজুন।')}
              </p>
            </div>
          ) : (
            <p role="status" className="py-16 text-center font-semibold text-ink-muted">{t('Loading...', 'লোড হচ্ছে...')}</p>
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
  // Cash on delivery is the shop's one way to pay; another method, if one is
  // ever recorded, is shown as the server has it.
  const paymentMethod = !order.paymentMethod
    ? t('Cash on Delivery', 'ক্যাশ অন ডেলিভারি')
    : /^cash on delivery$/i.test(order.paymentMethod)
      ? t(order.paymentMethod, 'ক্যাশ অন ডেলিভারি')
      : order.paymentMethod;

  return (
    <div className="ot-page">
      <div className="ot-wrap">
        {toolbar}

        <section className="card p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="ot-kicker">📦 {t('Order tracking', 'অর্ডার ট্র্যাকিং')}</p>
              <h1 className="m-0" style={{ fontSize: 'clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem)' }}>
                {t('Track Your Order', 'অর্ডার ট্র্যাক করুন')}
              </h1>
            </div>
            <span className="ot-pill" style={statusColours(status)}>
              {status === 'Delivered' ? <FaCheck aria-hidden="true" /> : status === CANCELLED ? <FaTimesCircle aria-hidden="true" /> : <FaTruck aria-hidden="true" />}
              <span><span className="sr-only">{t('Status: ', 'অবস্থা: ')}</span>{statusLabel(status)}</span>
            </span>
          </div>
          <ul className="ot-meta">
            <li><b>{t('Order Number:', 'অর্ডার নম্বর:')}</b> <span className="ot-mono">{order.orderNumber}</span><CopyButton text={order.orderNumber} /></li>
            <li><b>{t('Placed On:', 'অর্ডারের সময়:')}</b> {order.createdAt ? formatDateTime(order.createdAt) : ''}</li>
          </ul>
          <div className="ot-doc-row">
            <OrderPdfButton order={order} role="buyer" />
          </div>

          <CancelledNote lines={order.books ?? []} />

          {status !== CANCELLED && (
          <ol className="ot-stepper" aria-label={t('Order progress', 'অর্ডারের অগ্রগতি')}>
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
                    {isActive && !isCurrent ? <FaCheck /> : isCurrent ? (idx === ORDER_STAGES.length - 1 ? <FaCheck /> : <FaTruck />) : digits(idx + 1)}
                  </span>
                  <span className="ot-label">{statusLabel(stage)}</span>
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
                <b>{t('Update Status: ', 'অবস্থা আপডেট করুন: ')}</b>
                <select name="status"
                  value={order.status}
                  onChange={handleStatusChange}
                  disabled={updating}
                  className="field"
                  style={{ width: 'auto' }}
                >
                  {statusOptions.map((stage) => (
                    <option key={stage} value={stage}>{statusLabel(stage)}</option>
                  ))}
                </select>
              </label>
              {error && <span style={{ color: 'var(--color-danger-ink)', fontWeight: 600 }}>{error}</span>}
            </div>
          )}
        </section>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <section className="card p-5">
            <h2 className="ot-info-title"><FaMoneyBillWave aria-hidden="true" /> {t('Payment Method', 'পেমেন্ট পদ্ধতি')}</h2>
            <p className="m-0 font-bold" style={{ color: 'var(--color-accent)' }}>{paymentMethod}</p>
          </section>
          <section className="card p-5">
            <h2 className="ot-info-title"><FaUser aria-hidden="true" /> {t('Contact Information', 'যোগাযোগের তথ্য')}</h2>
            <p className="ot-row">{t('Name:', 'নাম:')} <b>{order.contactName}</b></p>
            <p className="ot-row">{t('Email:', 'ই-মেইল:')} <b>{order.buyerEmail}</b></p>
            <p className="ot-row">{t('Phone:', 'ফোন:')} <b>{order.contactPhone}</b></p>
          </section>
          <section className="card p-5">
            <h2 className="ot-info-title"><FaMapMarkerAlt aria-hidden="true" /> {t('Delivery Information', 'ডেলিভারির তথ্য')}</h2>
            <p className="ot-row">{t('Division:', 'বিভাগ:')} <b>{order.deliveryDivision}</b></p>
            <p className="ot-row">{t('District:', 'জেলা:')} <b>{order.deliveryDistrict}</b></p>
            <p className="ot-row">{t('Address:', 'ঠিকানা:')} <b>{order.deliveryAddress}</b></p>
            {order.buyerNote && (
              <p className="ot-row ot-note">
                {t('Your note to the seller:', 'বিক্রেতার জন্য আপনার নোট:')} <b>{order.buyerNote}</b>
              </p>
            )}
          </section>
        </div>

        <section className="card mt-4 min-w-0 p-4 sm:p-6">
          <h2 className="m-0 text-xl">{t('Order Details', 'অর্ডারের বিস্তারিত')}</h2>
          <div className="table-scroll">
            <table className="styled-table ot-table">
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
                {(order.books || [order]).map((ob, idx) => (
                  <tr key={ob._id || idx} className={ob.status === CANCELLED ? 'ot-row-cancelled' : undefined}>
                    <td className="font-semibold text-ink">
                      <Link to={`/book/${ob.bookId}`}>{ob.title}</Link>
                      {ob.status === CANCELLED && (order.books?.length ?? 0) > 1 && <span className="ot-line-pill">{statusLabel(CANCELLED)}</span>}
                    </td>
                    <td>{ob.author}</td>
                    <td>{Array.isArray(ob.category) ? ob.category.join(', ') : ob.category}</td>
                    <td>{ob.bookType === 'old' ? t('old', 'পুরোনো') : ob.bookType === 'new' ? t('new', 'নতুন') : ob.bookType}</td>
                    <td>{conditionOf(ob) || '-'}</td>
                    <td>{ob.pages == null ? ob.pages : digits(ob.pages)}</td>
                    <td>{ob.price == null ? ob.price : digits(ob.price)}</td>
                    <td>{ob.quantity == null ? ob.quantity : digits(ob.quantity)}</td>
                    <td>{ob.sellerEmail}</td>
                    <td className="font-bold" style={{ color: 'var(--color-accent)' }}>
                      {digits((Number(ob.price) * Number(ob.quantity)).toFixed(2))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ot-totals">
            <div><span>{t('Subtotal:', 'উপমোট:')}</span><span>৳{digits(order.booksTotal?.toFixed(2) || '')}</span></div>
            <div><span>{t('Shipping Cost:', 'ডেলিভারি চার্জ:')}</span><span>৳{digits(Number(order.shippingCost).toFixed(2))}</span></div>
            <div><span>{t('Discount:', 'ছাড়:')}</span><span>-৳{digits(Number(order.discount).toFixed(2))}</span></div>
            <div className="ot-grand"><span>{t('Order Total:', 'অর্ডারের মোট:')}</span><span>৳{digits(order.totalCost?.toFixed(2) || '')}</span></div>
          </div>
        </section>
      </div>
    </div>
  );
}
