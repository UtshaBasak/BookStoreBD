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
import { conditionOf } from '../utils/bookText.js';
import { digits, formatDateTime, formatNumber, t } from '../utils/language.js';
import { statusLabel } from '../utils/orderStatus.js';

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

/** A sum with its paisa, as the page has always written it; Bangla digits in Bangla. */
const amount = (value: number): string =>
  t(value.toFixed(2), formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** The book type the server stores ('new' | 'old'), as people read it. */
const bookTypeLabel = (type: string | undefined): string =>
  type === 'new' ? t('new', 'নতুন') : type === 'old' ? t('old', 'পুরোনো') : (type ?? '');

/** How the order is paid; the stored value is shown as it is unless it is a known one. */
const paymentLabel = (method: string | undefined): string =>
  !method || method === 'Cash on Delivery' ? t('Cash on Delivery', 'ক্যাশ অন ডেলিভারি') : method;

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
  // from the query rather than mirrored into state by an effect, which would
  // cause a cascading render.
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
      setError(t('Failed to update status: ', 'অবস্থা হালনাগাদ করা যায়নি: ') + messageOf(error));
      setStatusOverride(null);
    }
  };

  // The top bar, drawn in every state so there is always a way back.
  const bar = (
    <header className="aurora admin-order-bar">
      <Logo inverted size={32} />
      <div className="admin-order-bar-actions">
        <Link to="/admin/transactions"
          className="admin-side-button keep-text"
        >
          {t('← Back to Admin Panel', '← অ্যাডমিন প্যানেলে ফিরে যান')}
        </Link>
        <button type="button" className="btn btn-primary" onClick={() => void orderQuery.refetch()} disabled={orderQuery.isFetching}>
          ⟳ {orderQuery.isFetching ? t('Refreshing...', 'হালনাগাদ হচ্ছে...') : t('Refresh', 'হালনাগাদ করুন')}
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
            // A failed lookup says so, rather than leaving "Loading..." on screen.
            <div className="admin-alert" role="alert">
              {t(`Could not load order ${orderNumber}:`, `${orderNumber} অর্ডারটি লোড করা যায়নি:`)} {orderQuery.error.message}
            </div>
          ) : (
            <div className="admin-loading">{t('Loading...', 'লোড হচ্ছে...')}</div>
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
              {t('Track The Order (Admin)', 'অর্ডার ট্র্যাক করুন (অ্যাডমিন)')}
            </h2>
            <p className="admin-lede">
              {t(
                'Move the order along as it happens; the buyer sees each step on their own tracking page.',
                'যা ঘটছে সেই অনুযায়ী অর্ডারের ধাপ এগিয়ে দিন; ক্রেতা নিজের ট্র্যাকিং পাতায় প্রতিটি ধাপ দেখতে পান।'
              )}
            </p>
          </div>
          <span className="admin-head-tools">
            <OrderPdfButton order={order} role="admin" className="btn btn-ghost admin-btn-sm" />
            <span className={`badge admin-status admin-status-lg ${statusTone(currentStatus)}`}>
              {statusLabel(currentStatus)}
            </span>
          </span>
        </header>

        <section className="admin-card admin-panel-card" style={{ marginBottom: 16 }}>
          <h3>
            <FaRoute aria-hidden="true" />
            {t('Progress', 'অগ্রগতি')}
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
                    {isCurrent ? '★' : isActive ? <FaCheck /> : formatNumber(idx + 1)}
                  </span>
                  <span>{statusLabel(stage)}</span>
                </li>
              );
            })}
          </ol>
          <CancelledNote lines={books} />
          <div className="admin-status-form">
            {statusOptions.length > 0 && (
              <label>
                <b>{t('Update Status: ', 'অবস্থা হালনাগাদ: ')}</b>
                <select name="status" value={statusValue} onChange={handleStatusChange} className="field">
                  {statusOptions.map((stage) => (
                    <option key={stage} value={stage}>{statusLabel(stage)}</option>
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
              {t('Order', 'অর্ডার')}
            </h3>
            <dl className="admin-facts">
              <div>
                <dt>{t('Order Number:', 'অর্ডার নম্বর:')}</dt>
                <dd className="admin-mono" style={{ color: 'var(--color-accent)' }}>{order.orderNumber}<CopyButton text={order.orderNumber} /></dd>
              </div>
              <div>
                <dt>{t('Placed On:', 'অর্ডারের তারিখ:')}</dt>
                <dd>{order.createdAt ? formatDateTime(order.createdAt) : ''}</dd>
              </div>
              <div>
                <dt>{t('Status:', 'অবস্থা:')}</dt>
                <dd>{statusLabel(currentStatus)}</dd>
              </div>
              <div>
                <dt>{t('Payment Method', 'পেমেন্ট পদ্ধতি')}</dt>
                <dd>{paymentLabel(order.paymentMethod)}</dd>
              </div>
            </dl>
          </section>
          <section className="admin-card admin-panel-card">
            <h3>
              <FaUser aria-hidden="true" />
              {t('Contact Information', 'যোগাযোগের তথ্য')}
            </h3>
            <dl className="admin-facts">
              <div>
                <dt>{t('Name:', 'নাম:')}</dt>
                <dd>{order.contactName || ''}</dd>
              </div>
              <div>
                <dt>{t('Email:', 'ই-মেইল:')}</dt>
                <dd>{order.buyerEmail || ''}</dd>
              </div>
              <div>
                <dt>{t('Phone:', 'ফোন:')}</dt>
                <dd className="admin-mono">{order.contactPhone || ''}</dd>
              </div>
            </dl>
          </section>
          <section className="admin-card admin-panel-card">
            <h3>
              <FaMapMarkerAlt aria-hidden="true" />
              {t('Delivery Information', 'ডেলিভারির তথ্য')}
            </h3>
            <dl className="admin-facts">
              <div>
                <dt>{t('Division:', 'বিভাগ:')}</dt>
                <dd>{order.deliveryDivision || ''}</dd>
              </div>
              <div>
                <dt>{t('District:', 'জেলা:')}</dt>
                <dd>{order.deliveryDistrict || ''}</dd>
              </div>
              <div>
                <dt>{t('Address:', 'ঠিকানা:')}</dt>
                <dd>{order.deliveryAddress || ''}</dd>
              </div>
              {order.buyerNote && (
                <div>
                  <dt>{t("Buyer's note:", 'ক্রেতার নোট:')}</dt>
                  <dd style={{ whiteSpace: 'pre-line' }}>{order.buyerNote}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <section className="admin-card admin-panel-card">
          <h3>
            <FaBook aria-hidden="true" />
            {t('Order Details', 'অর্ডারের বিবরণ')}
          </h3>
          <div className="table-scroll admin-table-round">
            <table className="styled-table">
              <thead>
                <tr>
                  <th>{t('Title', 'শিরোনাম')}</th>
                  <th>{t('Author', 'লেখক')}</th>
                  <th>{t('Category', 'বিষয়')}</th>
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
                {books.map((ob, idx) => (
                  <tr key={ob._id || idx} className={ob.status === 'Cancelled' ? 'admin-row-cancelled' : undefined}>
                    <td className="admin-cell-strong" style={{ minWidth: 150 }}>
                      {ob.title}
                      {ob.status === 'Cancelled' && books.length > 1 && (
                        <span className="badge admin-status is-bad admin-line-pill">{statusLabel('Cancelled')}</span>
                      )}
                    </td>
                    <td style={{ minWidth: 130 }}>{ob.author}</td>
                    <td style={{ minWidth: 120 }}>{Array.isArray(ob.category) ? ob.category.join(', ') : ob.category}</td>
                    <td style={{ textTransform: 'capitalize' }}>{bookTypeLabel(ob.bookType)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{conditionOf(ob) || '-'}</td>
                    <td className="admin-num">{ob.pages == null ? ob.pages : digits(ob.pages)}</td>
                    <td className="admin-num">{ob.price == null ? ob.price : digits(ob.price)}</td>
                    <td className="admin-num">{ob.quantity == null ? ob.quantity : digits(ob.quantity)}</td>
                    <td>{ob.sellerEmail}</td>
                    <td className="admin-num admin-cell-strong">{amount(Number(ob.price) * Number(ob.quantity))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Under the table rather than in its footer, so the totals stay
              visible on a phone when the table scrolls sideways. */}
          <dl className="admin-totals">
            <div>
              <dt>{t('Subtotal:', 'উপমোট:')}</dt>
              <dd>{amount(itemTotal)}</dd>
            </div>
            <div>
              <dt>{t('Shipping Cost:', 'ডেলিভারি চার্জ:')}</dt>
              <dd>{amount(Number(shipping))}</dd>
            </div>
            <div>
              <dt>{t('Discount:', 'ছাড়:')}</dt>
              <dd>-{amount(Number(discount))}</dd>
            </div>
            <div className="admin-grand">
              <dt>{t('Order Total:', 'অর্ডারের মোট:')}</dt>
              <dd className="admin-price">৳{amount(finalTotal)}</dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}
