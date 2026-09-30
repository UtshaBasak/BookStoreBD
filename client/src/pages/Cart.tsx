import { FaTrash, FaHeart, FaRegHeart, FaShoppingBag, FaMoneyBillWave, FaUndoAlt, FaTruck } from 'react-icons/fa';
import { useNavigate, Link } from 'react-router-dom';

import type { Book } from '@shared/api.js';

import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import QuantityStepper from '../components/QuantityStepper.js';
import PriceTag from '../components/PriceTag.js';
import { priceOf } from '../utils/pricing.js';
import { API_BASE_URL } from '../config/api.js';
import { site } from '../config/site.js';
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
      <Link to="/" className="logo-button" title="Go to Homepage" aria-label="BookStoreBD home">
        <Logo size={34} />
      </Link>
      <div className="user-options">
        <NotificationBell />
        <Link to="/wishlist" className="icon-link" title="Go to Wishlist" aria-label="Go to Wishlist" style={{ color: '#ff5c35' }}>
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
  const error = cartQuery.isError ? 'Failed to load cart.' : null;

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

  // Helper to resolve image src
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
  const subtotal = buyable.reduce((sum, book) => sum + priceOf(book) * copies(book), 0);

  if (!userEmail) {
    return (
      <div className="shop-page">
        <CartTopBar />
        <main className="shop-main">
          <div className="card mx-auto max-w-md p-8 text-center">
            <FaShoppingBag aria-hidden="true" className="mx-auto mb-3 text-4xl text-brand" />
            <p className="m-0 mb-5 text-lg font-semibold text-ink">Please sign in to view your cart.</p>
            <Link to="/sign-in" className="btn btn-primary">Sign in</Link>
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
          <div role="alert" className="card mx-auto max-w-md p-8 text-center font-semibold" style={{ color: '#b91c1c' }}>
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
            <h1 className="shop-title">Cart</h1>
            {cartBooks.length > 0 && (
              <p className="shop-sub">
                {cartBooks.length} book{cartBooks.length === 1 ? '' : 's'} waiting for you
              </p>
            )}
          </div>
        </div>

        {cartBooks.length === 0 ? (
          <div className="card mx-auto max-w-lg px-6 py-10 text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl"
              style={{ background: '#f3efff', color: '#6d28d9' }}
            >
              <FaShoppingBag />
            </div>
            <p className="m-0 text-lg font-bold text-ink">No books in cart.</p>
            <p className="mx-0 mt-1 mb-5 text-ink-muted">Find something good to read - new and second-hand.</p>
            <Link to="/filter" className="btn btn-primary">Browse books</Link>
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
                              background: book.bookType === 'old' ? '#f3efff' : '#facc15',
                              color: book.bookType === 'old' ? '#5b21b6' : '#111827',
                            }}
                          >
                            {book.bookType === 'old' ? 'Used' : book.bookType.toUpperCase()}
                          </span>
                        )}
                        <h2 className="cart-item-title">
                          <Link to={`/book/${book._id}`}>{book.title}</Link>
                        </h2>
                        <p className="m-0 mt-0.5 text-sm text-ink-muted">by {book.author}</p>
                      </div>

                      {/* Wishlist icon */}
                      <button
                        type="button"
                        className="icon-button shrink-0"
                        style={{ color: wishlist[book._id] ? '#ff5c35' : '#9ca3af', fontSize: 20 }}
                        onClick={() => handleToggleWishlist(book._id)}
                        title={wishlist[book._id] ? 'Remove from wishlist' : 'Add to wishlist'}
                        aria-label="Toggle wishlist"
                      >
                        {wishlist[book._id] ? <FaHeart /> : <FaRegHeart />}
                      </button>
                    </div>

                    <p className="m-0 mt-1 text-xs text-ink-muted">
                      {Array.isArray(book.category) ? book.category.join(', ') : (book.category || 'N/A')}
                    </p>

                    {!inStock(book) ? (
                      <p role="status" className="cart-note is-out">
                        Sold out. It stays here, and you can order it when it is back.
                      </p>
                    ) : book.cartAdjusted ? (
                      <p role="status" className="cart-note">
                        Only {book.stock} left, so we lowered your quantity to {copies(book)}.
                      </p>
                    ) : Number(book.stock) <= 5 ? (
                      <p className="cart-note">Only {book.stock} left.</p>
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
                              { onError: (err) => toast.error(err.message || 'Could not change the quantity.') }
                            )
                          }
                          disabled={savingQuantity}
                          label={`Copies of ${book.title}`}
                        />
                      )}

                      {/* Remove from cart */}
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ minHeight: 40, padding: '0 14px', fontSize: 14 }}
                        onClick={() => handleRemoveFromCart(book._id)}
                        title="Remove from cart"
                        aria-label="Remove from cart"
                      >
                        <FaTrash aria-hidden="true" size={12} /> Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* On a desktop the summary stays in view beside a long basket. */}
            <aside className="card p-5 sm:p-6 lg:sticky lg:top-24" aria-label="Order summary">
              <h2 className="m-0 mb-3 text-lg">Order summary</h2>
              <div className="sum-row">
                <span>Subtotal ({copyCount} book{copyCount === 1 ? '' : 's'})</span>
                <span>৳{subtotal.toFixed(2)}</span>
              </div>
              <div className="sum-row">
                <span>Delivery</span>
                <span className="text-sm">Worked out at checkout</span>
              </div>
              <p className="m-0 text-xs leading-relaxed text-ink-muted">
                {site.delivery.insideDhaka} Tk inside Dhaka, {site.delivery.outsideDhaka} Tk elsewhere.
                {buyable.length < cartBooks.length && ' Sold-out books are not included.'}
              </p>
              <div className="sum-total">
                <span>Total</span>
                <span>৳{subtotal.toFixed(2)}</span>
              </div>

              {/* Proceed to Checkout Button */}
              {buyable.length > 0 ? (
                <Link to="/payment"
                  className="btn btn-accent mt-5 w-full"
                  style={{ minHeight: 52, fontSize: 17 }}
                >
                  Proceed to Checkout
                </Link>
              ) : (
                <button type="button" className="btn btn-accent mt-5 w-full" style={{ minHeight: 52, fontSize: 17 }} disabled>
                  Nothing in stock to check out
                </button>
              )}
              <Link to="/filter" className="btn btn-ghost mt-2 w-full">
                Continue shopping
              </Link>

              <ul className="trust-list">
                <li><FaMoneyBillWave aria-hidden="true" /> {site.payment} - pay when it arrives</li>
                <li><FaUndoAlt aria-hidden="true" /> {site.returns.windowDays}-day returns</li>
                <li>
                  <FaTruck aria-hidden="true" /> {site.delivery.daysInsideDhaka} working days in Dhaka,{' '}
                  {site.delivery.daysOutsideDhaka} elsewhere
                </li>
              </ul>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
