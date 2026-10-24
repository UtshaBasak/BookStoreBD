import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaHeart, FaComments, FaShoppingBag, FaSearch } from 'react-icons/fa';
import './Homepage.css';

import type { ChatMessage } from '@shared/api.js';

import {
  useProfile,
  useWishlist,
  useCart,
  useUnreadChatCount,
  useToggleCart,
  useToggleWishlist,
} from '../hooks/queries.js';
import { promptSignIn, useToast } from '../hooks/useToast.js';
import { useSeo } from '../hooks/useSeo.js';
import { site, sitePayment, siteTagline } from '../config/site.js';
import NotificationBell from '../components/NotificationBell.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { LanguageToggle } from '../components/LanguageToggle.js';
import Footer from '../components/Footer.js';
import HomeShelves from '../components/HomeShelves.js';
import Logo from '../components/Logo.js';
import SearchField from '../components/SearchField.js';
import { getUserEmail } from '../utils/auth.js';
import { subscribeToMessages } from '../utils/socket.js';
import { flagsFor } from '../utils/bookFlags.js';
import { CATEGORY_GROUPS, categoryLabel, categoryLink } from '../config/categories.js';
import { digits, pick, t } from '../utils/language.js';

export default function Homepage() {
  const [showDropdown, setShowDropdown] = useState<'category' | false>(false);
  /*
   * The menu closes a moment after the pointer leaves it, so a pointer that
   * strays a few pixels on its way into a hundred small links does not shut it.
   */
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setShowDropdown('category');
  };
  const closeMenuSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setShowDropdown(false), 350);
  };
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);
  const [searchInput, setSearchInput] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const userEmail = getUserEmail();

  /*
   * The shop itself, described for a search engine. The SearchAction is what
   * can give a site a search box of its own in the results page.
   */
  useSeo({
    description: t(
      'Buy and sell new and second-hand books across Bangladesh. Wishlists, order tracking and a direct line to the seller.',
      'সারা বাংলাদেশে নতুন ও পুরোনো বই কিনুন ও বিক্রি করুন। উইশলিস্ট, অর্ডার ট্র্যাকিং আর বিক্রেতার সঙ্গে সরাসরি কথা।'
    ),
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: site.name,
      description: siteTagline(),
      url: window.location.origin,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${window.location.origin}/filter?search={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
  });

  // Everything below is derived from queries rather than copied into state by
  // an effect, so pages asking for the cart share one request and one answer.
  const { data: profile } = useProfile(userEmail, { enabled: Boolean(userEmail) });
  const profilePic = profile?.profilePicture ?? null;
  const username = profile?.username ?? '';
  const user = userEmail ? { email: userEmail } : null;

  // Only the ids are needed here, so the response is mapped into a lookup as
  // it arrives rather than searched on every render.
  const { data: wishlist = {} } = useWishlist({ enabled: Boolean(userEmail), select: flagsFor });
  const { data: cart = {} } = useCart({ enabled: Boolean(userEmail), select: flagsFor });

  const { mutate: toggleWishlistMutation } = useToggleWishlist();
  const { mutate: toggleCartMutation } = useToggleCart();

  const { data: unread } = useUnreadChatCount(Boolean(userEmail));
  // Live arrivals bump the badge on top of whatever the query last returned.
  const [liveUnread, setLiveUnread] = useState(0);
  const unreadCount = (unread?.count ?? 0) + liveUnread;

  useEffect(() => {
    if (!userEmail) return undefined;

    return subscribeToMessages((data: ChatMessage) => {
      if (data.receiver === userEmail && !window.location.pathname.includes('/chat')) {
        setLiveUnread((count) => count + 1);
      }
    });
  }, [userEmail]);

  const toggleWishlist = (bookId: string) => {
    if (!userEmail) {
      promptSignIn(toast, () => navigate('/sign-in'), 'wishlist');
      return;
    }
    // The mutation invalidates the wishlist, so every page showing it updates.
    toggleWishlistMutation({ bookId, inWishlist: Boolean(wishlist[bookId]) });
  };

  const toggleCart = (bookId: string) => {
    if (!userEmail) {
      promptSignIn(toast, () => navigate('/sign-in'), 'cart');
      return;
    }
    toggleCartMutation(
      { bookId, inCart: Boolean(cart[bookId]) },
      { onError: () => toast.error(t('Could not update your cart. Please try again.', 'কার্ট আপডেট করা যায়নি। আবার চেষ্টা করুন।')) }
    );
  };

  // The text is passed in by a spoken or remembered search, which sets the
  // box and searches at once, before the state has caught up.
  const handleHomepageSearch = (text: string = searchInput) => {
    if (text.trim()) {
      navigate(`/filter?search=${encodeURIComponent(text.trim())}`);
    }
  };

  return (
    <div className="homepage" style={{ width: '100%', minHeight: '100vh' }}>
      <header className="header">
        <div className="logo">
          {/* A real link, with no full reload: the queries refetch on their
              own, so going home never flashes a white screen. */}
          <Link to="/"
            className="logo-button"
            aria-label={t('BookStoreBD home', 'BookStoreBD হোম')}
          >
            <Logo size={38} />
          </Link>
        </div>
        <div className="search-bar">
          <FaSearch className="search-icon" aria-hidden="true" />
          <SearchField
            value={searchInput}
            onChange={setSearchInput}
            onSubmit={handleHomepageSearch}
            inputProps={{
              name: 'search',
              'aria-label': t('Search books', 'বই খুঁজুন'),
              placeholder: t('Search by title, author or ISBN', 'বইয়ের নাম, লেখক বা আইএসবিএন দিয়ে খুঁজুন'),
            }}
          />
          <button onClick={() => handleHomepageSearch()}>{t('Search', 'খুঁজুন')}</button>
        </div>
        <div className="user-options" style={{ position: 'relative' }}>

        {user && (
            <Link to="/chat"
              className="chat-icon icon-button"
              style={{ color: 'var(--color-brand)' }}
              title={t('Chat', 'চ্যাট')}
              aria-label={t('Chat', 'চ্যাট')}
            >
              <FaComments />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  background: '#ff5c35',
                  color: 'white',
                  borderRadius: '50%',
                  padding: '2px 6px',
                  fontSize: '12px',
                  minWidth: '18px',
                  height: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {unreadCount > 99 ? digits('99+') : digits(unreadCount)}
                </span>
              )}
            </Link>
          )}

          <LanguageToggle />
          <ThemeToggle className="icon-button theme-toggle header-theme-toggle" />

          <NotificationBell />

          <Link to="/wishlist"
            className="wishlist-icon icon-button"
            style={{ color: 'var(--color-accent)' }}
            title={t('Wishlist', 'উইশলিস্ট')}
            aria-label={t('Wishlist', 'উইশলিস্ট')}
          >
            <FaHeart />
          </Link>
          <Link to="/cart" className="icon-link" style={{ color: 'var(--color-brand)' }} title={t('Cart', 'কার্ট')} aria-label={t('Cart', 'কার্ট')}>
            <FaShoppingBag />
          </Link>
          {user ? (
            // A plain link to the profile, with no hover menu: hover does not
            // exist on a touch screen, and Sign Out lives on the profile page.
            <Link to="/profile" className="profile-link" title={t('Your profile', 'আপনার প্রোফাইল')} aria-label={t('Your profile', 'আপনার প্রোফাইল')}>
              <img
                src={
                  profilePic ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(username ? username[0] : 'U')}&background=6d28d9&color=fff&bold=true`
                }
                alt=""
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #6d28d9',
                  verticalAlign: 'middle',
                }}
              />
            </Link>
          ) : (
            <Link
              to="/sign-in"
              className="btn btn-primary"
              style={{ minHeight: 40, padding: '0 1.1rem' }}
            >
              {t('Sign in', 'সাইন ইন')}
            </Link>
          )}
        </div>
      </header>

      {/*
        Real links and a real button, so a screen reader announces them
        correctly and they can be opened in a new tab or followed by a crawler.
      */}
      <nav className="nav-bar" aria-label={t('Browse books', 'বই দেখুন')}>
        <div
          className="dropdown dropdown-categories"
          onMouseEnter={openMenu}
          onMouseLeave={closeMenuSoon}
          // Closed once focus leaves the chip and its menu altogether, not when
          // it moves from the chip into the menu.
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setShowDropdown(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowDropdown(false);
          }}
        >
          <button
            type="button"
            className="chip chip-strong"
            aria-expanded={showDropdown === 'category'}
            aria-controls="categories-menu"
            // Opens rather than toggles: on a touch screen the tap is also a
            // mouseenter, which has opened it already.
            onClick={() => setShowDropdown('category')}
          >
            {t('Categories', 'বিষয়')} <span aria-hidden="true">▾</span>
          </button>
          {showDropdown === 'category' && (
            // Grouped: a hundred subjects in one list would be a wall.
            <div id="categories-menu" className="dropdown-content categories-menu">
              {CATEGORY_GROUPS.map((group) => (
                <div key={group.name} className={`categories-group${group.items.length > 12 ? ' is-wide' : ''}`}>
                  <p className="categories-group-name">
                    <span aria-hidden="true">{group.emoji}</span> {categoryLabel(group.name)}
                  </p>
                  <ul>
                    {group.items.map((category) => (
                      <li key={category}>
                        <Link to={categoryLink(category)} onClick={() => setShowDropdown(false)}>
                          {categoryLabel(category)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
        <Link className="chip" to="/filter?bookType=new">
          <span aria-hidden="true">✨</span>&nbsp;{t('New books', 'নতুন বই')}
        </Link>
        <Link className="chip" to="/filter?bookType=old">
          <span aria-hidden="true">♻️</span>&nbsp;{t('Second-hand', 'পুরোনো বই')}
        </Link>
        <Link className="chip chip-deals" to="/filter?deals=1&sort=dealPercent">
          <span aria-hidden="true">⚡</span>&nbsp;{t('Quick deals', 'চটজলদি ছাড়')}
        </Link>
        <Link className="chip" to="/filter?inStock=1">
          {t('In stock now', 'এখন স্টকে আছে')}
        </Link>
        <Link className="chip" to="/wanted">
          <span aria-hidden="true">🎯</span>&nbsp;{t('Wanted board', 'চাহিদার বোর্ড')}
        </Link>
      </nav>

      {/* One main landmark, so a screen reader can jump past the header. */}
      <main className="homepage-main">
      {/*
        The first screen: what the shop is, a search straight away, and the
        three things that make buying second-hand here safe.
      */}
      <section className="hero">
        <div className="hero-inner">
          <p className="hero-kicker">📚 {t('New & second-hand books across Bangladesh', 'সারা বাংলাদেশে নতুন ও পুরোনো বই')}</p>
          <h1 className="hero-title">
            {pick(
              <>
                Your next favourite book is <span className="hero-highlight">one tap</span> away.
              </>,
              <>
                আপনার পরের প্রিয় বইটি মাত্র <span className="hero-highlight">এক ট্যাপ</span> দূরে।
              </>
            )}
          </h1>
          <p className="hero-sub">
            {t(
              'Buy for less, sell the ones you have finished, and keep good books moving.',
              'কম দামে কিনুন, পড়া শেষ হলে বিক্রি করুন, ভালো বই হাতে হাতে ঘুরুক।'
            )}
          </p>
          <form
            className="hero-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              handleHomepageSearch();
            }}
          >
            <FaSearch aria-hidden="true" className="hero-search-icon" />
            <SearchField
              value={searchInput}
              onChange={setSearchInput}
              onSubmit={handleHomepageSearch}
              inputProps={{
                name: 'q',
                'aria-label': t('Search books', 'বই খুঁজুন'),
                placeholder: t('Try “Humayun Ahmed” or “physics”', 'যেমন “হুমায়ূন আহমেদ” বা “পদার্থবিজ্ঞান”'),
              }}
            />
            <button type="submit" className="btn btn-accent">{t('Search', 'খুঁজুন')}</button>
          </form>
          <div className="hero-actions">
            <Link to="/filter" className="btn btn-primary">{t('Browse all books', 'সব বই দেখুন')}</Link>
            <Link to="/add-book" className="btn btn-ghost">{t('Sell a book', 'বই বিক্রি করুন')}</Link>
          </div>
          <ul className="hero-perks" aria-label={t('Why buy here', 'কেন এখানে কিনবেন')}>
            <li>💵 {sitePayment()}</li>
            <li>
              ↩️{' '}
              {t(
                `${site.returns.windowDays}-day returns if not as described`,
                `বর্ণনার সঙ্গে না মিললে ${digits(site.returns.windowDays)} দিনে ফেরত`
              )}
            </li>
            <li>
              🚚{' '}
              {t(`From ${site.delivery.insideDhaka} Tk delivery`, `ডেলিভারি ${digits(site.delivery.insideDhaka)} টাকা থেকে`)}
            </li>
          </ul>
        </div>
        {/* Book spines, drawn: colour and movement without a photograph. */}
        <div className="hero-art" aria-hidden="true">
          <span className="spine s1" />
          <span className="spine s2" />
          <span className="spine s3" />
          <span className="spine s4" />
          <span className="spine s5" />
          <span className="hero-sun" />
        </div>
      </section>

      <HomeShelves
        signedIn={Boolean(user)}
        wishlist={wishlist}
        cart={cart}
        onToggleWishlist={toggleWishlist}
        onToggleCart={toggleCart}
      />
      </main>

      {/* The footer carries the copyright line. */}
      <Footer />
    </div>
  );
}
