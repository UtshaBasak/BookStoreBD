import { FaHeart, FaHome, FaShoppingBag, FaShoppingCart } from 'react-icons/fa';
import { useNavigate, Link } from 'react-router-dom';
import './Homepage.css';
import './Wishlist.css';

import type { Book } from '@shared/api.js';

import { API_BASE_URL } from '../config/api.js';
import { useCart, useToggleCart, useToggleWishlist, useWishlist } from '../hooks/queries.js';
import { promptSignIn, useToast } from '../hooks/useToast.js';
import Logo from '../components/Logo.js';
import PriceTag from '../components/PriceTag.js';
import { getUserEmail } from '../utils/auth.js';
import { flagsFor } from '../utils/bookFlags.js';
import { PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { isCloudinary, sized, IMAGE_WIDTHS } from '../utils/imageUrl.js';

export default function Wishlist() {
  const navigate = useNavigate();
  const toast = useToast();
  const userEmail = getUserEmail();
  const signedIn = Boolean(userEmail);

  const wishlistQuery = useWishlist({ enabled: signedIn });
  const wishlist = wishlistQuery.data ?? [];
  const error = wishlistQuery.isError ? 'Failed to load wishlist.' : null;

  // Only the ids are needed for the cart buttons.
  const { data: cart = {} } = useCart({ enabled: signedIn, select: flagsFor });

  // Both mutations invalidate their query, so the list and the buttons update
  // from the cache instead of from each response individually.
  const { mutate: toggleCart } = useToggleCart();
  const { mutate: toggleWishlist } = useToggleWishlist();

  const handleToggleCart = (id: string) => {
    if (!userEmail) {
      promptSignIn(toast, () => navigate('/sign-in'), 'cart');
      return;
    }
    toggleCart({ bookId: id, inCart: Boolean(cart[id]) });
  };

  const handleDelete = (id: string) => {
    toggleWishlist({ bookId: id, inWishlist: true });
  };

  // Helper to resolve image src
  const getBookImageSrc = (book: Book): string => {
    const img = book.images?.[0];
    if (!img) return PLACEHOLDER_IMAGE;
    if (img.startsWith('data:image/')) return img;
    // Cloudinary delivers the size the card draws, not the original photograph.
    if (isCloudinary(img)) return sized(img, IMAGE_WIDTHS.card);
    if (/^https?:\/\//.test(img)) return img; // full URL
    // A cover served by the API arrives as a path, not as bytes.
    if (img.startsWith('/')) return img;
    return `${API_BASE_URL}/uploads/${img}`; // filename
  };

  /** The bar across the top: the shop, home, and the cart. */
  const topBar = (
    <header className="header">
      <div className="logo">
        <Link to="/" className="logo-button">
          <Logo size={38} />
        </Link>
      </div>
      <div className="user-options">
        {/* Home */}
        <Link to="/"
          className="icon-button"
          style={{ color: '#6d28d9' }}
          title="Go to Homepage"
          aria-label="Go to Homepage"
        >
          <FaHome />
        </Link>
        {/* Cart */}
        <Link
          to="/cart"
          className="icon-link"
          style={{ color: '#6d28d9' }}
          title="Go to Cart"
          aria-label="Go to Cart"
        >
          <FaShoppingBag />
        </Link>
      </div>
    </header>
  );

  if (!userEmail) {
    return (
      <div className="wishlist-page">
        {topBar}
        <div className="wishlist-empty card">
          <p className="wishlist-empty-icon" aria-hidden="true">💜</p>
          <p className="wishlist-empty-title">Please sign in to view your wishlist.</p>
          <Link to="/sign-in" className="btn btn-primary">Sign in</Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wishlist-page">
        {topBar}
        <div className="wishlist-empty card" role="alert">
          <p className="wishlist-empty-title" style={{ color: '#b91c1c' }}>{error}</p>
          <button type="button" className="btn btn-ghost" onClick={() => void wishlistQuery.refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wishlist-page">
      {topBar}

      <main className="wishlist-main">
        <div className={`wishlist-heading${wishlist.length === 0 ? ' is-empty' : ''}`}>
          <h1>
            Wishlist <span aria-hidden="true">💜</span>
          </h1>
          {wishlist.length > 0 && (
            <p>
              {wishlist.length} saved {wishlist.length === 1 ? 'book' : 'books'}
            </p>
          )}
        </div>

        {wishlistQuery.isPending ? (
          <p className="wishlist-loading" role="status">Loading your wishlist…</p>
        ) : wishlist.length === 0 ? (
          <div className="wishlist-empty card">
            <p className="wishlist-empty-icon" aria-hidden="true">🤍</p>
            <p className="wishlist-empty-title">No books in wishlist.</p>
            <p className="wishlist-empty-sub">
              Tap the heart on any book to save it here for later.
            </p>
            <Link to="/filter" className="btn btn-primary">Browse books</Link>
          </div>
        ) : (
          <div className="wishlist-grid">
            {wishlist.map((book) => {
              const isOld = book.bookType === 'old';
              const inCart = Boolean(cart[book._id]);
              return (
                <article key={book._id} className="book-card">
                  <div className="book-image">
                    <Link to={`/book/${book._id}`} tabIndex={-1} aria-hidden="true">
                      <img
                        loading="lazy"
                        decoding="async"
                        src={getBookImageSrc(book)}
                        alt=""
                      />
                    </Link>
                    <div className="wishlist-badges">
                      {book.bookType && (
                        <span
                          className="badge"
                          style={{
                            background: isOld ? '#ffffff' : '#facc15',
                            color: isOld ? '#5b21b6' : '#111827',
                          }}
                        >
                          {isOld ? 'Used' : 'New'}
                        </span>
                      )}
                      {/* Stock Out Banner */}
                      {book.stock === 0 && (
                        <span className="badge wishlist-stock-badge" style={{ background: '#fef2f2', color: '#b91c1c' }}>
                          Out Of Stock
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="wishlist-remove"
                      onClick={() => handleDelete(book._id)}
                      title="Remove from wishlist"
                      aria-label="Remove from wishlist"
                    >
                      <FaHeart />
                    </button>
                  </div>

                  <div className="book-info">
                    <h3>
                      <Link to={`/book/${book._id}`} className="wishlist-title">
                        {book.title}
                      </Link>
                    </h3>
                    <div className="wishlist-author">{book.author}</div>
                    <div className="wishlist-meta">
                      {Array.isArray(book.category) ? book.category.join(', ') : (book.category || 'N/A')}
                    </div>
                    <div className="wishlist-price">
                      <PriceTag book={book} size="md" />
                    </div>

                    <div className="wishlist-actions">
                      {/* Cart button only if book is in stock */}
                      {book.stock > 0 ? (
                        <button
                          type="button"
                          className={inCart ? 'btn btn-danger' : 'btn btn-primary'}
                          onClick={() => handleToggleCart(book._id)}
                          title={inCart ? 'Remove from cart' : 'Add to cart'}
                        >
                          <FaShoppingCart aria-hidden="true" />
                          {inCart ? 'Remove from Cart' : 'Add to Cart'}
                        </button>
                      ) : (
                        <div className="wishlist-sold-out">Out of Stock</div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
