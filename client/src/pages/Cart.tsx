import { FaTrash, FaHeart, FaRegHeart, FaShoppingBag, FaMoneyBillWave, FaUndoAlt, FaTruck } from 'react-icons/fa';
import { useNavigate, Link } from 'react-router-dom';

import type { Book } from '@shared/api.js';

import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import QuantityStepper from '../components/QuantityStepper.js';
import RequestBookButton from '../components/RequestBookButton.js';
import PriceTag from '../components/PriceTag.js';
import { priceOf } from '../utils/pricing.js';
import { API_BASE_URL } from '../config/api.js';
import { site, sitePayment } from '../config/site.js';
import { digits, formatNumber, pick, t } from '../utils/language.js';
import { useCart, useSetCartQuantity, useToggleCart, useToggleWishlist, useWishlist } from '../hooks/queries.js';
import { promptSignIn, useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { flagsFor } from '../utils/bookFlags.js';
import { PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { isCloudinary, sized, IMAGE_WIDTHS } from '../utils/imageUrl.js';
import './Homepage.css';
import './Cart.css';

/** The slim bar every state of the page shares: the logo home, and the wishlist. */
function CartTopBar() {
  return (
    <header className="header shop-topbar">
      <Link
        to="/"
        className="logo-button"
        title={t('Go to Homepage', 'হোমপেজে যান')}
        aria-label={t('BookStoreBD home', 'BookStoreBD হোম')}
      >
        <Logo size={34} />
      </Link>
      <div className="user-options">
        <NotificationBell />
        <Link
          to="/wishlist"
          className="icon-link"
          title={t('Go to Wishlist', 'উইশলিস্টে যান')}
          aria-label={t('Go to Wishlist', 'উইশলিস্টে যান')}
          style={{ color: 'var(--color-accent)' }}
        >
          <FaHeart size={20} />
        </Link>
      </div>
    </header>
  );
}

export default function Cart() {
  const navigate = useNavigate();
  const toast = useToast();
  const userEmail = getUserEmail();
  const signedIn = Boolean(userEmail);

  const cartQuery = useCart({ enabled: signedIn });
  const cartBooks = cartQuery.data ?? [];
  const error = cartQuery.isError ? t('Failed to load cart.', 'কার্ট লোড করা যায়নি।') : null;

  // Only the ids are needed for the heart icons, so the response is mapped as
  // it arrives rather than searched on every row.
  const { data: wishlist = {} } = useWishlist({ enabled: signedIn, select: flagsFor });

  // Both mutations invalidate their query, so the list and the icons update
  // from the cache instead of from each response individually.
  const { mutate: toggleCart } = useToggleCart();
  const { mutate: toggleWishlist } = useToggleWishlist();
  const { mutate: setQuantity, isPending: savingQuantity } = useSetCartQuantity();

  const handleRemoveFromCart = (id: string) => {
    toggleCart({ bookId: id, inCart: true });
  };

  const handleToggleWishlist = (id: string) => {
    if (!userEmail) {
      promptSignIn(toast, () => navigate('/sign-in'), 'wishlist');
      return;
    }
    toggleWishlist({ bookId: id, inWishlist: Boolean(wishlist[id]) });
  };

  const getBookImageSrc = (book: Book): string => {
    const img = book.images?.[0];
    if (!img) return PLACEHOLDER_IMAGE;
    if (img.startsWith('data:image/')) return img;
    // Cloudinary delivers the size the row draws, not the original photograph.
    if (isCloudinary(img)) return sized(img, IMAGE_WIDTHS.row);
    if (/^https?:\/\//.test(img)) return img;
    // A cover served by the API arrives as a path, not as bytes.
    if (img.startsWith('/')) return img;
    return `${API_BASE_URL}/uploads/${img}`;
  };

  // A sold-out book stays in the cart - it may come back - but is not part of
  // what the basket costs, and checkout leaves it out.
  const inStock = (book: Book) => Number(book.stock) > 0;
  const copies = (book: Book) => Math.max(1, Math.min(book.cartQuantity ?? 1, Number(book.stock) || 1));
  const buyable = cartBooks.filter(inStock);
  const copyCount = buyable.reduce((sum, book) => sum + copies(book), 0);
  const soldOutCount = cartBooks.length - buyable.length;
  const subtotal = buyable.reduce((sum, book) => sum + priceOf(book) * copies(book), 0);

  if (!userEmail) {
    return (
      <div className="shop-page">
        <CartTopBar />
        <main className="shop-main">
          <div className="card mx-auto max-w-md p-8 text-center">
            <FaShoppingBag aria-hidden="true" className="mx-auto mb-3 text-4xl text-brand" />
            <p className="m-0 mb-5 text-lg font-semibold text-ink">
              {t('Please sign in to view your cart.', 'কার্ট দেখতে সাইন ইন করুন।')}
            </p>
            <Link to="/sign-in" className="btn btn-primary">{t('Sign in', 'সাইন ইন')}</Link>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shop-page">
        <CartTopBar />
        <main className="shop-main">
          <div role="alert" className="card mx-auto max-w-md p-8 text-center font-semibold" style={{ color: 'var(--color-danger-ink)' }}>
            {error}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="shop-page">
      <CartTopBar />

      <main className="shop-main">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="shop-title">{t('Cart', 'কার্ট')}</h1>
            {cartBooks.length > 0 && (
              // Copies, as the summary counts them; a sold-out book is named
              // apart, since it is not part of what checkout will order.
              <p className="shop-sub">
                {copyCount > 0 &&
                  t(
                    `${copyCount} book${copyCount === 1 ? '' : 's'} ready for checkout`,
                    `${formatNumber(copyCount)}টি বই চেকআউটের জন্য তৈরি`
                  )}
                {copyCount > 0 && soldOutCount > 0 && ', '}
                {soldOutCount > 0 && t(`${soldOutCount} sold out`, `${formatNumber(soldOutCount)}টির স্টক শেষ`)}
              </p>
            )}
          </div>
        </div>

        {cartBooks.length === 0 ? (
          <div className="card mx-auto max-w-lg px-6 py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl"
              style={{ background: 'var(--color-brand-tint)', color: 'var(--color-brand)' }}
            >
              <FaShoppingBag />
            </div>
            <p className="m-0 text-lg font-bold text-ink">{t('No books in cart.', 'কার্টে কোনো বই নেই।')}</p>
            <p className="mx-0 mt-1 mb-5 text-ink-muted">
              {t('Find something good to read - new and second-hand.', 'পড়ার মতো ভালো কিছু খুঁজে নিন - নতুন ও পুরোনো।')}
            </p>
            <Link to="/filter" className="btn btn-primary">{t('Browse books', 'বই দেখুন')}</Link>
          </div>
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <ul className="m-0 grid list-none gap-3 p-0">
              {cartBooks.map((book) => (
                <li key={book._id} className={`card cart-item${inStock(book) ? '' : ' is-sold-out'}`}>
                  <Link to={`/book/${book._id}`} className="shrink-0" tabIndex={-1} aria-hidden="true">
                    <img
                      loading="lazy"
                      decoding="async"
                      src={getBookImageSrc(book)}
                      alt=""
                      className="cart-cover"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {book.bookType && (
                          <span
                            className="badge mb-1"
                            style={{
                              background: book.bookType === 'old' ? 'var(--color-brand-tint)' : '#facc15',
                              color: book.bookType === 'old' ? 'var(--color-brand-dark)' : '#111827',
                            }}
                          >
                            {book.bookType === 'old' ? t('Used', 'পুরোনো') : t(book.bookType.toUpperCase(), 'নতুন')}
                          </span>
                        )}
                        <h2 className="cart-item-title">
                          <Link to={`/book/${book._id}`}>{book.title}</Link>
                        </h2>
                        <p className="m-0 mt-0.5 text-sm text-ink-muted">{t('by', 'লেখক:')} {book.author}</p>
                      </div>

                      <button
                        type="button"
                        className="icon-button shrink-0"
                        style={{ color: wishlist[book._id] ? 'var(--color-accent)' : 'var(--color-ink-faint)', fontSize: 20 }}
                        onClick={() => handleToggleWishlist(book._id)}
                        title={
                          wishlist[book._id]
                            ? t('Remove from wishlist', 'উইশলিস্ট থেকে সরান')
                            : t('Add to wishlist', 'উইশলিস্টে যোগ করুন')
                        }
                        aria-label={t('Toggle wishlist', 'উইশলিস্টে রাখুন বা সরান')}
                      >
                        {wishlist[book._id] ? <FaHeart /> : <FaRegHeart />}
                      </button>
                    </div>

                    <p className="m-0 mt-1 text-xs text-ink-muted">
                      {Array.isArray(book.category) ? book.category.join(', ') : (book.category || t('N/A', 'প্রযোজ্য নয়'))}
                    </p>

                    {!inStock(book) ? (
                      <>
                        <p role="status" className="cart-note is-out">
                          {t(
                            'Sold out. It stays here, and you can order it when it is back.',
                            'স্টক শেষ। বইটি এখানেই থাকবে, আবার এলে অর্ডার করতে পারবেন।'
                          )}
                        </p>
                        <div className="mt-2">
                          <RequestBookButton bookId={book._id} sellerEmail={book.sellerEmail} className="btn btn-ghost cart-request" />
                        </div>
                      </>
                    ) :  book.cartAdjusted ? (
                      <p role="status" className="cart-note">
                        {pick(
                          <>Only {book.stock} left, so we lowered your quantity to {copies(book)}.</>,
                          <>
                            মাত্র {formatNumber(Number(book.stock))}টি বাকি, তাই আপনার পরিমাণ কমিয়ে{' '}
                            {formatNumber(copies(book))}টি করা হয়েছে।
                          </>
                        )}
                      </p>
                    ) : Number(book.stock) <= 5 ? (
                      <p className="cart-note">
                        {pick(<>Only {book.stock} left.</>, <>মাত্র {formatNumber(Number(book.stock))}টি বাকি।</>)}
                      </p>
                    ) : null}

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
                      <span className="text-xl">
                        <PriceTag book={book} size="md" />
                      </span>

                      {inStock(book) && (
                        <QuantityStepper
                          value={copies(book)}
                          max={Number(book.stock)}
                          onChange={(quantity) =>
                            setQuantity(
                              { bookId: book._id, quantity },
                              {
                                onError: (err) =>
                                  toast.error(err.message || t('Could not change the quantity.', 'পরিমাণ বদলানো যায়নি।')),
                              }
                            )
                          }
                          disabled={savingQuantity}
                          label={t(`Copies of ${book.title}`, `${book.title} - কপির সংখ্যা`)}
                        />
                      )}

                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ minHeight: 40, padding: '0 14px', fontSize: 14 }}
                        onClick={() => handleRemoveFromCart(book._id)}
                        title={t('Remove from cart', 'কার্ট থেকে সরান')}
                        aria-label={t('Remove from cart', 'কার্ট থেকে সরান')}
                      >
                        <FaTrash aria-hidden="true" size={12} /> {t('Remove', 'সরান')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* On a desktop the summary stays in view beside a long basket. */}
            <aside className="card p-5 sm:p-6 lg:sticky lg:top-24" aria-label={t('Order summary', 'অর্ডারের সারসংক্ষেপ')}>
              <h2 className="m-0 mb-3 text-lg">{t('Order summary', 'অর্ডারের সারসংক্ষেপ')}</h2>
              <div className="sum-row">
                <span>
                  {pick(
                    <>Subtotal ({copyCount} book{copyCount === 1 ? '' : 's'})</>,
                    <>উপমোট ({formatNumber(copyCount)}টি বই)</>
                  )}
                </span>
                <span>৳{digits(subtotal.toFixed(2))}</span>
              </div>
              <div className="sum-row">
                <span>{t('Delivery', 'ডেলিভারি')}</span>
                <span className="text-sm">{t('Worked out at checkout', 'চেকআউটে হিসাব হবে')}</span>
              </div>
              <p className="m-0 text-xs leading-relaxed text-ink-muted">
                {pick(
                  <>
                    {site.delivery.insideDhaka} Tk inside Dhaka, {site.delivery.outsideDhaka} Tk elsewhere.
                    {buyable.length < cartBooks.length && ' Sold-out books are not included.'}
                  </>,
                  <>
                    ঢাকার ভেতরে {formatNumber(site.delivery.insideDhaka)} টাকা, অন্যত্র{' '}
                    {formatNumber(site.delivery.outsideDhaka)} টাকা।
                    {buyable.length < cartBooks.length && ' স্টক শেষ হওয়া বই এতে ধরা হয়নি।'}
                  </>
                )}
              </p>
              {/* Delivery depends on the district, chosen at checkout, so this
                  total says it is before delivery rather than looking final. */}
              <div className="sum-total">
                <span>{t('Total before delivery', 'ডেলিভারি চার্জ ছাড়া মোট')}</span>
                <span>৳{digits(subtotal.toFixed(2))}</span>
              </div>

              {buyable.length > 0 ? (
                <Link to="/payment"
                  className="btn btn-accent mt-5 w-full"
                  style={{ minHeight: 52, fontSize: 17 }}
                >
                  {t('Proceed to Checkout', 'চেকআউটে যান')}
                </Link>
              ) : (
                <button type="button" className="btn btn-accent mt-5 w-full" style={{ minHeight: 52, fontSize: 17 }} disabled>
                  {t('Nothing in stock to check out', 'চেকআউট করার মতো কোনো বই স্টকে নেই')}
                </button>
              )}
              <Link to="/filter" className="btn btn-ghost mt-2 w-full">
                {t('Continue shopping', 'কেনাকাটা চালিয়ে যান')}
              </Link>

              <ul className="trust-list">
                <li>
                  <FaMoneyBillWave aria-hidden="true" /> {sitePayment()}
                  {t(' - pay when it arrives', ' - বই হাতে পেলে পরিশোধ করুন')}
                </li>
                <li>
                  <FaUndoAlt aria-hidden="true" />{' '}
                  {t(
                    `${site.returns.windowDays}-day returns if a book is not as described`,
                    `বর্ণনার সঙ্গে না মিললে ${formatNumber(site.returns.windowDays)} দিনে ফেরত`
                  )}
                </li>
                <li>
                  <FaTruck aria-hidden="true" />{' '}
                  {t(
                    `${site.delivery.daysInsideDhaka} working days in Dhaka, ${site.delivery.daysOutsideDhaka} elsewhere`,
                    `ঢাকায় ${formatNumber(site.delivery.daysInsideDhaka)} কর্মদিবস, অন্যত্র ${formatNumber(site.delivery.daysOutsideDhaka)} কর্মদিবস`
                  )}
                </li>
              </ul>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
