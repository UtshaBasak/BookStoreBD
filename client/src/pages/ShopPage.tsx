import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { FaBoxOpen, FaComments, FaHeart, FaSearch, FaShoppingBag, FaStar } from 'react-icons/fa';

import type { CatalogueSort } from '@shared/api.js';

import './Homepage.css';
import './ShopPage.css';
import BookCard from '../components/BookCard.js';
import ChatWindow from '../components/ChatWindow';
import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { LanguageToggle } from '../components/LanguageToggle.js';
import Pager from '../components/Pager.js';
import SellerReviews from '../components/SellerReviews.js';
import { useCart, useCatalogue, useShop, useToggleCart, useToggleWishlist, useWishlist } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import { useSeo } from '../hooks/useSeo.js';
import { promptSignIn, useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { flagsFor } from '../utils/bookFlags.js';
import { safeImageSrc } from '../utils/safeImageSrc.js';
import { digits, formatDate, formatNumber, pick, t } from '../utils/language.js';

const PAGE_SIZE = 20;

/** A function, so the labels are in the language being shown. */
const sorts = (): readonly { value: CatalogueSort; label: string }[] => [
  { value: 'relevant', label: t('Relevant - deals first', 'প্রাসঙ্গিক - ছাড় আগে') },
  { value: 'newest', label: t('Newest first', 'নতুন আগে') },
  { value: 'rated', label: t('Highest rated', 'সেরা রেটিং আগে') },
  { value: 'priceLowHigh', label: t('Price - Low to High', 'দাম - কম থেকে বেশি') },
  { value: 'priceHighLow', label: t('Price - High to Low', 'দাম - বেশি থেকে কম') },
  { value: 'dealPercent', label: t('Deals - biggest % off', 'ছাড় - সবচেয়ে বেশি % আগে') },
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

  // A link to the ratings (from a notification, say) lands on them once the
  // books above have taken their space.
  const { hash } = useLocation();
  const laidOut = Boolean(shop && catalogue);
  useEffect(() => {
    if (laidOut && hash === '#ratings') document.getElementById('ratings')?.scrollIntoView();
  }, [laidOut, hash]);

  useSeo({
    title: shop ? t(`${shop.username}'s shop`, `${shop.username}-এর দোকান`) : t('Seller shop', 'বিক্রেতার দোকান'),
    description: shop
      ? t(
          `${shop.books} books from ${shop.username} on BookStoreBD - new and second-hand, cash on delivery.`,
          `BookStoreBD-তে ${shop.username}-এর ${formatNumber(shop.books)}টি বই - নতুন ও পুরোনো, ক্যাশ অন ডেলিভারি।`
        )
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
        <Link to="/" className="logo-button" aria-label={t('BookStoreBD home', 'BookStoreBD হোম')}>
          <Logo size={38} />
        </Link>
      </div>
      <div className="user-options">
        <LanguageToggle />
        <ThemeToggle className="icon-button theme-toggle header-theme-toggle" />
        <NotificationBell />
        <Link to="/wishlist" className="icon-link" style={{ color: 'var(--color-accent)' }} title={t('Wishlist', 'উইশলিস্ট')} aria-label={t('Wishlist', 'উইশলিস্ট')}>
          <FaHeart />
        </Link>
        <Link to="/cart" className="icon-link" style={{ color: 'var(--color-brand)' }} title={t('Cart', 'কার্ট')} aria-label={t('Cart', 'কার্ট')}>
          <FaShoppingBag />
        </Link>
        {!signedIn && (
          <Link to="/sign-in" className="btn btn-primary" style={{ minHeight: 40, padding: '0 1.1rem' }}>
            {t('Sign in', 'সাইন ইন')}
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
          <p role="status" className="sp-status">{t('Loading the shop…', 'দোকান লোড হচ্ছে…')}</p>
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
            <h1>{t('No shop here', 'এখানে কোনো দোকান নেই')}</h1>
            <p>
              {t(
                `There is no seller called “${username}”, or they have nothing listed yet.`,
                `“${username}” নামে কোনো বিক্রেতা নেই, অথবা তাঁর এখনো কোনো বই তালিকায় নেই।`
              )}
            </p>
            <Link to="/filter" className="btn btn-primary">{t('Browse every book', 'সব বই দেখুন')}</Link>
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
              <p className="sp-kicker">{t('Seller shop', 'বিক্রেতার দোকান')}</p>
              <h1>{shop.username}</h1>
              {shop.joinedAt && (
                <p className="sp-joined">
                  {t(
                    `Selling on BookStoreBD since ${formatDate(shop.joinedAt, { month: 'long', year: 'numeric' })}`,
                    `${formatDate(shop.joinedAt, { month: 'long', year: 'numeric' })} থেকে BookStoreBD-তে বিক্রি করছেন`
                  )}
                </p>
              )}
            </div>
            {ownShop ? (
              <Link to="/seller-books" className="btn btn-ghost">{t('Manage your books', 'আপনার বই পরিচালনা করুন')}</Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!signedIn) {
                    toast.info(t('Sign in to message the seller.', 'বিক্রেতাকে মেসেজ দিতে সাইন ইন করুন।'), {
                      action: { label: t('Sign in', 'সাইন ইন'), onClick: () => navigate('/sign-in') },
                    });
                    return;
                  }
                  setShowChat(true);
                }}
              >
                <FaComments aria-hidden="true" /> {t(`Chat with ${shop.username}`, `${shop.username}-এর সঙ্গে চ্যাট`)}
              </button>
            )}
          </div>
          <dl className="sp-stats">
            <div>
              <dt>{t('Seller rating', 'বিক্রেতার রেটিং')}</dt>
              <dd>
                <a href="#ratings">
                  {shop.sellerRating.count ? (
                    <>
                      <FaStar aria-hidden="true" className="sp-star" /> {digits(shop.sellerRating.average.toFixed(1))}
                      <span className="sp-count"> ({digits(shop.sellerRating.count)})</span>
                    </>
                  ) : (
                    <span className="sp-count">{t('No ratings yet', 'এখনো কোনো রেটিং নেই')}</span>
                  )}
                </a>
              </dd>
            </div>
            <div>
              <dt>{t('Books listed', 'তালিকায় বই')}</dt>
              <dd>{digits(shop.books)}</dd>
            </div>
            <div>
              <dt>{t('In stock', 'স্টকে আছে')}</dt>
              <dd>{digits(shop.inStock)}</dd>
            </div>
            <div>
              <dt>{t('Copies sold', 'বিক্রি হওয়া কপি')}</dt>
              <dd>{digits(shop.sold)}</dd>
            </div>
            <div>
              <dt>{t('Book reviews', 'বইয়ের রিভিউ')}</dt>
              <dd>
                {shop.ratingCount ? (
                  <>
                    <FaStar aria-hidden="true" className="sp-star" /> {digits(shop.ratingAverage.toFixed(1))}
                    <span className="sp-count"> ({digits(shop.ratingCount)})</span>
                  </>
                ) : (
                  <span className="sp-count">{t('No reviews yet', 'এখনো কোনো রিভিউ নেই')}</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section id="shop-books" className="sp-books" aria-label={t(`Books from ${shop.username}`, `${shop.username}-এর বই`)}>
          <div className="sp-toolbar">
            <h2>{pick(<>Books from {shop.username}</>, <>{shop.username}-এর বই</>)}</h2>
            <div className="sp-search">
              <FaSearch aria-hidden="true" />
              <input
                name="q"
                type="search"
                className="field"
                placeholder={t('Search this shop...', 'এই দোকানে খুঁজুন...')}
                aria-label={t('Search this shop', 'এই দোকানে খুঁজুন')}
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
              aria-label={t('Sort books', 'বই সাজান')}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as CatalogueSort);
                setPage(1);
              }}
            >
              {sorts().map((option) => (
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
              {t('In stock only', 'শুধু স্টকে থাকা বই')}
            </button>
          </div>

          {!catalogue ? (
            <p role="status" className="sp-status">{t('Loading books…', 'বই লোড হচ্ছে…')}</p>
          ) : books.length === 0 ? (
            <div className="card sp-empty">
              <p>{settled || inStock
                  ? t('No book in this shop matches.', 'এই দোকানে মেলে এমন কোনো বই নেই।')
                  : t('Nothing on the shelf right now.', 'এই মুহূর্তে তাকে কোনো বই নেই।')}</p>
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
                noun={t('books', 'বই')}
              />
            </div>
          )}
        </section>

        <section id="ratings" className="sp-ratings" aria-label={t(`Ratings of ${shop.username}`, `${shop.username}-এর রেটিং`)}>
          <SellerReviews sellerId={shop.id} />
        </section>
      </main>

      {showChat && signedIn && (
        <ChatWindow receiver={shop.email} receiverName={shop.username} onClose={() => setShowChat(false)} />
      )}
    </div>
  );
}
