import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FaBoxOpen, FaComments, FaHeart, FaSearch, FaShoppingBag, FaStar } from 'react-icons/fa';

import type { CatalogueSort } from '@shared/api.js';

import './Homepage.css';
import './ShopPage.css';
import BookCard from '../components/BookCard.js';
import ChatWindow from '../components/ChatWindow';
import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import Pager from '../components/Pager.js';
import { useCart, useCatalogue, useShop, useToggleCart, useToggleWishlist, useWishlist } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import { useSeo } from '../hooks/useSeo.js';
import { promptSignIn, useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { flagsFor } from '../utils/bookFlags.js';
import { safeImageSrc } from '../utils/safeImageSrc.js';

const PAGE_SIZE = 20;

const SORTS: readonly { value: CatalogueSort; label: string }[] = [
  { value: 'relevant', label: 'Relevant - deals first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'rated', label: 'Highest rated' },
  { value: 'priceLowHigh', label: 'Price - Low to High' },
  { value: 'priceHighLow', label: 'Price - High to Low' },
  { value: 'dealPercent', label: 'Deals - biggest % off' },
];

/**
 * One seller's shop: who they are, how they do, and every book they have on
 * sale - reached from the seller's name on a book page.
 */
export default function ShopPage() {
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const userEmail = getUserEmail();
  const signedIn = Boolean(userEmail);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<CatalogueSort>('relevant');
  const [inStock, setInStock] = useState(false);
  const [page, setPage] = useState(1);
  const [showChat, setShowChat] = useState(false);
  const settled = useDebounced(search);

  const shopQuery = useShop(username);
  const shop = shopQuery.data;
  const { data: catalogue, isFetching } = useCatalogue(
    {
      seller: username,
      search: settled || undefined,
      sort,
      inStock: inStock || undefined,
      page,
      pageSize: PAGE_SIZE,
    },
    { enabled: Boolean(shop) }
  );

  useSeo({
    title: shop ? `${shop.username}'s shop` : 'Seller shop',
    description: shop
      ? `${shop.books} books from ${shop.username} on BookStoreBD - new and second-hand, cash on delivery.`
      : undefined,
  });

  const { data: wishlist = {} } = useWishlist({ enabled: signedIn, select: flagsFor });
  const { data: cart = {} } = useCart({ enabled: signedIn, select: flagsFor });
  const { mutate: toggleWishlist } = useToggleWishlist();
  const { mutate: toggleCart } = useToggleCart();

  const onWishlist = (bookId: string) => {
    if (!signedIn) {
      promptSignIn(toast, () => navigate('/sign-in'), 'wishlist');
      return;
    }
    toggleWishlist({ bookId, inWishlist: Boolean(wishlist[bookId]) });
  };
  const onCart = (bookId: string) => {
    if (!signedIn) {
      promptSignIn(toast, () => navigate('/sign-in'), 'cart');
      return;
    }
    toggleCart({ bookId, inCart: Boolean(cart[bookId]) });
  };

  const turnPage = (value: number) => {
    setPage(value);
    document.getElementById('shop-books')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const header = (
    <header className="header">
      <div className="logo">
        <Link to="/" className="logo-button" aria-label="BookStoreBD home">
          <Logo size={38} />
        </Link>
      </div>
      <div className="user-options">
        <NotificationBell />
        <Link to="/wishlist" className="icon-link" style={{ color: '#ff5c35' }} title="Wishlist" aria-label="Wishlist">
          <FaHeart />
        </Link>
        <Link to="/cart" className="icon-link" style={{ color: '#6d28d9' }} title="Cart" aria-label="Cart">
          <FaShoppingBag />
        </Link>
        {!signedIn && (
          <Link to="/sign-in" className="btn btn-primary" style={{ minHeight: 40, padding: '0 1.1rem' }}>
            Sign in
          </Link>
        )}
      </div>
    </header>
  );

  if (shopQuery.isPending) {
    return (
      <div className="sp-page">
        {header}
        <main className="sp-main">
          <div className="sp-hero sp-hero-loading" aria-hidden="true" />
          <p role="status" className="sp-status">Loading the shop…</p>
        </main>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="sp-page">
        {header}
        <main className="sp-main">
          <div className="card sp-missing">
            <FaBoxOpen aria-hidden="true" />
            <h1>No shop here</h1>
            <p>There is no seller called “{username}”, or they have nothing listed yet.</p>
            <Link to="/filter" className="btn btn-primary">Browse every book</Link>
          </div>
        </main>
      </div>
    );
  }

  const banner = safeImageSrc(shop.sellerBanner);
  const avatar = safeImageSrc(shop.profilePicture);
  const ownShop = userEmail === shop.email;
  const books = catalogue?.items ?? [];

  return (
    <div className="sp-page">
      {header}
      <main className="sp-main">
        <section className="card sp-hero">
          {banner ? (
            <img className="sp-banner" src={banner} alt="" />
          ) : (
            <div className="sp-banner sp-banner-plain" aria-hidden="true" />
          )}
          <div className="sp-who">
            {avatar ? (
              <img className="sp-avatar" src={avatar} alt="" />
            ) : (
              <span className="sp-avatar sp-avatar-letter" aria-hidden="true">
                {shop.username.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="sp-name">
              <p className="sp-kicker">Seller shop</p>
              <h1>{shop.username}</h1>
              {shop.joinedAt && (
                <p className="sp-joined">
                  Selling on BookStoreBD since{' '}
                  {new Date(shop.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
            {ownShop ? (
              <Link to="/seller-books" className="btn btn-ghost">Manage your books</Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!signedIn) {
                    toast.info('Sign in to message the seller.', {
                      action: { label: 'Sign in', onClick: () => navigate('/sign-in') },
                    });
                    return;
                  }
                  setShowChat(true);
                }}
              >
                <FaComments aria-hidden="true" /> Chat with {shop.username}
              </button>
            )}
          </div>
          <dl className="sp-stats">
            <div>
              <dt>Books listed</dt>
              <dd>{shop.books}</dd>
            </div>
            <div>
              <dt>In stock</dt>
              <dd>{shop.inStock}</dd>
            </div>
            <div>
              <dt>Copies sold</dt>
              <dd>{shop.sold}</dd>
            </div>
            <div>
              <dt>Rating</dt>
              <dd>
                {shop.ratingCount ? (
                  <>
                    <FaStar aria-hidden="true" className="sp-star" /> {shop.ratingAverage.toFixed(1)}
                    <span className="sp-count"> ({shop.ratingCount})</span>
                  </>
                ) : (
                  <span className="sp-count">No reviews yet</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section id="shop-books" className="sp-books" aria-label={`Books from ${shop.username}`}>
          <div className="sp-toolbar">
            <h2>Books from {shop.username}</h2>
            <div className="sp-search">
              <FaSearch aria-hidden="true" />
              <input
                name="q"
                type="search"
                className="field"
                placeholder="Search this shop..."
                aria-label="Search this shop"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <select
              name="sort"
              className="field sp-sort"
              aria-label="Sort books"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as CatalogueSort);
                setPage(1);
              }}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              className={`chip${inStock ? ' is-on' : ''}`}
              aria-pressed={inStock}
              onClick={() => {
                setInStock((value) => !value);
                setPage(1);
              }}
            >
              In stock only
            </button>
          </div>

          {!catalogue ? (
            <p role="status" className="sp-status">Loading books…</p>
          ) : books.length === 0 ? (
            <div className="card sp-empty">
              <p>{settled || inStock ? 'No book in this shop matches.' : 'Nothing on the shelf right now.'}</p>
            </div>
          ) : (
            <div className="sp-grid" style={{ opacity: isFetching ? 0.6 : 1 }} aria-busy={isFetching}>
              {books.map((book) => (
                <BookCard
                  key={book._id}
                  book={book}
                  signedIn
                  inWishlist={Boolean(wishlist[book._id])}
                  inCart={Boolean(cart[book._id])}
                  onToggleWishlist={onWishlist}
                  onToggleCart={onCart}
                />
              ))}
            </div>
          )}

          {catalogue && catalogue.pageCount > 1 && (
            <div className="sp-pager">
              <Pager
                page={catalogue.page}
                pageCount={catalogue.pageCount}
                pageSize={PAGE_SIZE}
                total={catalogue.total}
                onPage={turnPage}
                noun="books"
              />
            </div>
          )}
        </section>
      </main>

      {showChat && signedIn && (
        <ChatWindow receiver={shop.email} receiverName={shop.username} onClose={() => setShowChat(false)} />
      )}
    </div>
  );
}
