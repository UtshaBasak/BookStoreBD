import { useState } from 'react';
import { FaHeart, FaShoppingBag, FaShoppingCart } from 'react-icons/fa';
import { useNavigate, Link } from 'react-router-dom';
import './Homepage.css';
import './Wishlist.css';

import type { Book } from '@shared/api.js';

import { API_BASE_URL } from '../config/api.js';
import { useCart, useToggleCart, useToggleWishlist, useWishlist } from '../hooks/queries.js';
import { promptSignIn, useToast } from '../hooks/useToast.js';
import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { LanguageToggle } from '../components/LanguageToggle.js';
import RequestBookButton from '../components/RequestBookButton.js';
import PriceTag from '../components/PriceTag.js';
import { getUserEmail } from '../utils/auth.js';
import { flagsFor } from '../utils/bookFlags.js';
import { PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { cardSrcSet, isCloudinary, sized, CARD_SIZES, IMAGE_WIDTHS } from '../utils/imageUrl.js';
import { priceOf } from '../utils/pricing.js';
import { allowed } from '../utils/consent.js';
import { formatNumber, pick, t } from '../utils/language.js';

/**
 * The orders a wishlist can be put in. The list arrives in the order the books
 * were saved, and is short enough to sort here.
 */
const SORTS = {
  recent: { label: () => t('Recently saved', 'সম্প্রতি সংরক্ষিত'), sort: (books: Book[]) => [...books].reverse() },
  oldest: { label: () => t('Saved first', 'প্রথমে সংরক্ষিত'), sort: (books: Book[]) => books },
  inStock: {
    label: () => t('In stock first', 'স্টকে আছে আগে'),
    sort: (books: Book[]) => [...books].sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0)),
  },
  deals: {
    label: () => t('Biggest discount', 'সবচেয়ে বেশি ছাড়'),
    sort: (books: Book[]) => [...books].sort((a, b) => Number(b.discountPercent ?? 0) - Number(a.discountPercent ?? 0)),
  },
  priceLow: {
    label: () => t('Price - Low to High', 'দাম: কম থেকে বেশি'),
    sort: (books: Book[]) => [...books].sort((a, b) => priceOf(a) - priceOf(b)),
  },
  priceHigh: {
    label: () => t('Price - High to Low', 'দাম: বেশি থেকে কম'),
    sort: (books: Book[]) => [...books].sort((a, b) => priceOf(b) - priceOf(a)),
  },
  title: {
    label: () => t('Title A-Z', 'নাম অনুযায়ী (ক-ঝ)'),
    sort: (books: Book[]) => [...books].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')),
  },
} as const;
type WishlistSort = keyof typeof SORTS;
const SORT_KEY = 'wishlistSort';

const storedSort = (): WishlistSort => {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    return saved && saved in SORTS ? (saved as WishlistSort) : 'recent';
  } catch {
    return 'recent';
  }
};

export default function Wishlist() {
  const navigate = useNavigate();
  const toast = useToast();
  const userEmail = getUserEmail();
  const signedIn = Boolean(userEmail);

  const wishlistQuery = useWishlist({ enabled: signedIn });
  const [sort, setSortState] = useState<WishlistSort>(storedSort);
  const setSort = (value: WishlistSort) => {
    setSortState(value);
    try {
      if (allowed('preferences')) localStorage.setItem(SORT_KEY, value);
    } catch {
      // Private browsing: it lasts for this visit only.
    }
  };
  const saved = wishlistQuery.data ?? [];
  const wishlist = SORTS[sort].sort(saved);
  const error = wishlistQuery.isError ? t('Failed to load wishlist.', 'উইশলিস্ট লোড করা যায়নি।') : null;

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

  const getBookImageSrc = (book: Book): string => {
    const img = book.images?.[0];
    if (!img) return PLACEHOLDER_IMAGE;
    if (img.startsWith('data:image/')) return img;
    // Cloudinary delivers the size the card draws, not the original photograph.
    if (isCloudinary(img)) return sized(img, IMAGE_WIDTHS.card);
    if (/^https?:\/\//.test(img)) return img;
    // A cover served by the API arrives as a path, not as bytes.
    if (img.startsWith('/')) return img;
    // Otherwise a bare filename in the API's uploads folder.
    return `${API_BASE_URL}/uploads/${img}`;
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
        <LanguageToggle />
        <ThemeToggle className="icon-button theme-toggle header-theme-toggle" />
        <NotificationBell />
        <Link
          to="/cart"
          className="icon-link"
          style={{ color: 'var(--color-brand)' }}
          title={t('Go to Cart', 'কার্টে যান')}
          aria-label={t('Go to Cart', 'কার্টে যান')}
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
          <p className="wishlist-empty-title">
            {t('Please sign in to view your wishlist.', 'উইশলিস্ট দেখতে সাইন ইন করুন।')}
          </p>
          <Link to="/sign-in" className="btn btn-primary">{t('Sign in', 'সাইন ইন')}</Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wishlist-page">
        {topBar}
        <div className="wishlist-empty card" role="alert">
          <p className="wishlist-empty-title" style={{ color: 'var(--color-danger-ink)' }}>{error}</p>
          <button type="button" className="btn btn-ghost" onClick={() => void wishlistQuery.refetch()}>
            {t('Try again', 'আবার চেষ্টা করুন')}
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
            {t('Wishlist', 'উইশলিস্ট')} <span aria-hidden="true">💜</span>
          </h1>
          {wishlist.length > 0 && (
            <p>
              {pick(
                <>
                  {wishlist.length} saved {wishlist.length === 1 ? 'book' : 'books'}
                </>,
                <>সংরক্ষিত {formatNumber(wishlist.length)}টি বই</>
              )}
            </p>
          )}
          {wishlist.length > 1 && (
            <select
              name="sort"
              aria-label={t('Sort your wishlist', 'উইশলিস্ট সাজান')}
              className="field wishlist-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as WishlistSort)}
            >
              {Object.entries(SORTS).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label()}
                </option>
              ))}
            </select>
          )}
        </div>

        {wishlistQuery.isPending ? (
          <p className="wishlist-loading" role="status">
            {t('Loading your wishlist…', 'আপনার উইশলিস্ট লোড হচ্ছে…')}
          </p>
        ) : wishlist.length === 0 ? (
          <div className="wishlist-empty card">
            <p className="wishlist-empty-icon" aria-hidden="true">🤍</p>
            <p className="wishlist-empty-title">{t('No books in wishlist.', 'উইশলিস্টে কোনো বই নেই।')}</p>
            <p className="wishlist-empty-sub">
              {t(
                'Tap the heart on any book to save it here for later.',
                'যেকোনো বইয়ের হার্টে চাপ দিলে পরে দেখার জন্য সেটি এখানে থাকবে।'
              )}
            </p>
            <Link to="/filter" className="btn btn-primary">{t('Browse books', 'বই দেখুন')}</Link>
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
                        srcSet={cardSrcSet(book.images?.[0])}
                        sizes={CARD_SIZES}
                        alt=""
                      />
                    </Link>
                    <div className="wishlist-badges">
                      {book.bookType && (
                        <span
                          className="badge"
                          style={{
                            background: isOld ? 'var(--color-surface)' : '#facc15',
                            color: isOld ? 'var(--color-brand-dark)' : '#111827',
                          }}
                        >
                          {isOld ? t('Used', 'পুরোনো') : t('New', 'নতুন')}
                        </span>
                      )}
                      {book.stock === 0 && (
                        <span className="badge wishlist-stock-badge" style={{ background: 'var(--color-danger-tint)', color: 'var(--color-danger-ink)' }}>
                          {t('Out Of Stock', 'স্টক শেষ')}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="wishlist-remove"
                      onClick={() => handleDelete(book._id)}
                      title={t('Remove from wishlist', 'উইশলিস্ট থেকে সরান')}
                      aria-label={t('Remove from wishlist', 'উইশলিস্ট থেকে সরান')}
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
                      {Array.isArray(book.category) ? book.category.join(', ') : (book.category || t('N/A', 'প্রযোজ্য নয়'))}
                    </div>
                    <div className="wishlist-price">
                      <PriceTag book={book} size="md" />
                    </div>

                    <div className="wishlist-actions">
                      {/* A sold-out book offers a restock request instead of the cart. */}
                      {book.stock > 0 ? (
                        <button
                          type="button"
                          className={inCart ? 'btn btn-danger' : 'btn btn-primary'}
                          onClick={() => handleToggleCart(book._id)}
                          title={inCart ? t('Remove from cart', 'কার্ট থেকে সরান') : t('Add to cart', 'কার্টে যোগ করুন')}
                        >
                          <FaShoppingCart aria-hidden="true" />
                          {inCart ? t('Remove from Cart', 'কার্ট থেকে সরান') : t('Add to Cart', 'কার্টে যোগ করুন')}
                        </button>
                      ) : (
                        <RequestBookButton bookId={book._id} sellerEmail={book.sellerEmail} className="btn btn-ghost wishlist-request" />
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
