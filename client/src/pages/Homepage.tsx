import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight, FaHeart, FaRegHeart, FaBell, FaComments } from 'react-icons/fa';
import './Homepage.css';
import { io } from 'socket.io-client';

import type { Book, ChatMessage } from '@shared/api.js';

import { API_BASE_URL, signOut } from '../config/api.js';
import {
  useProfile,
  useBooks,
  useWishlist,
  useCart,
  useUnreadChatCount,
  useToggleCart,
  useToggleWishlist,
} from '../hooks/queries.js';
import Footer from '../components/Footer.js';
import { getUserEmail } from '../utils/auth.js';
import { flagsFor } from '../utils/bookFlags.js';

const genres = [
  'Fiction',
  'Non-Fiction',
  'Science & Technology',
  'Self-Help & Personal Development',
  'Romance',
  'Mystery & Thriller',
  'Fantasy & Sci-Fi',
  'History & Politics',
  "Children's & Young Adult",
  'Health, Wellness & Spirituality',
  'Graphic Novels & Comics',
  'Business & Finance',
  'Travel & Culture',
  'Others'
];

export default function Homepage() {
  // One dropdown at a time: which one, or none.
  const [showDropdown, setShowDropdown] = useState<'profile' | 'category' | false>(false);
  const [searchInput, setSearchInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const userEmail = getUserEmail();

  // Everything below is derived from queries rather than copied into state by
  // an effect. Two pages asking for the cart now share one request and one
  // answer, and none of them reimplements a loading flag.
  const { data: profile } = useProfile(userEmail, { enabled: Boolean(userEmail) });
  const profilePic = profile?.profilePicture ?? null;
  const username = profile?.username ?? '';
  const user = userEmail ? { email: userEmail } : null;

  const { data: popularBooks = [] } = useBooks({
    select: (data) => {
      if (!Array.isArray(data)) return [];
      const seen = new Set<string>();
      const flat: Book[] = [];
      for (const book of data) {
        const key = `${book.title}__${book.bookType}`;
        if (seen.has(key)) continue;
        seen.add(key);
        flat.push(book);
      }
      flat.sort(
        (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      );
      return flat.slice(0, 10);
    },
  });

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

    const socket = io(API_BASE_URL || window.location.origin);
    socket.on('receive_message', (data: ChatMessage) => {
      if (data.receiver === userEmail && !window.location.pathname.includes('/chat')) {
        setLiveUnread((count) => count + 1);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [userEmail]);

  const handleSignOut = async () => {
    await signOut();
    setShowDropdown(false);
    navigate('/sign-in');
  };

  const handleViewProfile = () => {
    setShowDropdown(false);
    navigate('/profile');
  };

  const toggleWishlist = (bookId: string) => {
    if (!userEmail) {
      alert('Please sign in to use wishlist.');
      return;
    }
    // The mutation invalidates the wishlist, so every page showing it updates.
    toggleWishlistMutation({ bookId, inWishlist: Boolean(wishlist[bookId]) });
  };

  const toggleCart = (bookId: string) => {
    if (!userEmail) {
      alert('Please sign in to use cart.');
      return;
    }
    toggleCartMutation(
      { bookId, inCart: Boolean(cart[bookId]) },
      { onError: () => alert('Failed to update cart. Please try again.') }
    );
  };

  const scrollAmount = 320;
  const handleScrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    }
  };
  const handleScrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleHomepageSearch = () => {
    if (searchInput.trim()) {
      navigate(`/filter?search=${encodeURIComponent(searchInput.trim())}`);
    }
  };

  return (
    <div className="homepage" style={{ width: '100vw', minHeight: '100vh' }}>
      <header className="header">
        <div className="logo">
          <span
            style={{ cursor: 'pointer', color: '#8B6F6F', fontSize: '2rem', fontWeight: 'bold', userSelect: 'none' }}
            onClick={() => { navigate('/'); window.location.reload(); }}
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { navigate('/'); window.location.reload(); } }}
            aria-label="Go to homepage"
            role="button"
          >
            BookStore
          </span>
        </div>
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search books..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleHomepageSearch();
            }}
          />
          <button onClick={handleHomepageSearch}>Search</button>
        </div>
        <div className="user-options" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>

        {user && (
            <span
              className="chat-icon"
              style={{
                cursor: 'pointer',
                marginRight: '0.5rem',
                fontSize: 22,
                color: '#8B6F6F',
                display: 'inline-flex',
                alignItems: 'center',
                position: 'relative'
              }}
              onClick={() => navigate('/chat')}
              title="Chat"
              tabIndex={0}
              aria-label="Chat"
            >
              <FaComments />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  background: '#e65100',
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
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
          )}

          <span
            className="notification-icon"
            style={{ cursor: 'pointer', marginRight: '0.5rem', fontSize: 22, color: '#8B6F6F', display: 'inline-flex', alignItems: 'center' }}
            title="Notifications"
            tabIndex={0}
            onClick={() => alert('No notifications')}
            aria-label="Notifications"
          >
            <FaBell />
          </span>

          <span
            className="wishlist-icon"
            style={{ cursor: 'pointer', marginRight: '0.5rem', fontSize: 22, color: '#e65100', display: 'inline-flex', alignItems: 'center' }}
            onClick={() => navigate('/wishlist')}
            title="Wishlist"
            tabIndex={0}
            aria-label="Wishlist"
          >
            <FaHeart />
          </span>
          <Link to="/cart" style={{ color: '#8B6F6F', fontSize: 22, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} title="Cart" aria-label="Cart">
            🛒
          </Link>
          {user ? (
            <div
              style={{ display: 'inline-block', marginLeft: '1rem', cursor: 'pointer', position: 'relative' }}
              tabIndex={0}
              onMouseEnter={() => setShowDropdown('profile')}
              onMouseLeave={() => setShowDropdown(false)}
              onFocus={() => setShowDropdown('profile')}
              onBlur={() => setShowDropdown(false)}
            >
              <img
                src={
                  profilePic ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(username ? username[0] : 'U')}`
                }
                alt="Profile"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #8B6F6F',
                  verticalAlign: 'middle',
                }}
              />
              {showDropdown === 'profile' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    background: '#fff',
                    color: '#333',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    minWidth: 140,
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 0,
                    pointerEvents: 'auto',
                  }}
                >
                  <button
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: '0.75rem 1rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: '#333',
                      fontWeight: 500,
                      borderRadius: '6px 6px 0 0',
                      borderBottom: '1px solid #eee'
                    }}
                    onClick={handleViewProfile}
                    tabIndex={0}
                  >
                    View Profile
                  </button>
                  <button
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: '0.75rem 1rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: '#e74c3c',
                      fontWeight: 500,
                      borderRadius: '0 0 6px 6px'
                    }}
                    onClick={handleSignOut}
                    tabIndex={0}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/sign-in" style={{ color: '#8B6F6F', fontWeight: 600, textDecoration: 'none', fontSize: 16 }}>
              Sign In
            </Link>
          )}
        </div>
      </header>

      <nav className="nav-bar">
        <div
          className="dropdown"
          style={{ zIndex: 20, position: 'relative' }}
          onMouseEnter={() => setShowDropdown('category')}
          onMouseLeave={() => setShowDropdown(false)}
          onFocus={() => setShowDropdown('category')}
          onBlur={() => setShowDropdown(false)}
          tabIndex={0}
        >
          <span
            style={{ cursor: 'pointer', color: '#333', textDecoration: 'none', fontWeight: 500 }}
            onClick={() => setShowDropdown('category')}
            tabIndex={0}
          >
            Category
          </span>
          {showDropdown === 'category' && (
            <div
              className="dropdown-content"
              style={{
                zIndex: 30,
                minWidth: 400,
                padding: '0.5rem 0.5rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.25rem 1.5rem',
                maxWidth: 500,
                position: 'absolute',
                top: '100%',
                left: 0,
                background: '#fff',
              }}
            >
              {genres.map((genre, index) => (
                <span
                  key={index}
                  style={{
                    padding: '0.5rem 0.75rem',
                    whiteSpace: 'nowrap',
                    display: 'block',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setShowDropdown(false);
                    navigate(`/filter?category=${encodeURIComponent(genre)}`);
                  }}
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setShowDropdown(false);
                      navigate(`/filter?category=${encodeURIComponent(genre)}`);
                    }
                  }}
                  role="menuitem"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}
        </div>
        <span
          style={{ cursor: 'pointer', color: '#333', textDecoration: 'none', fontWeight: 500 }}
          onClick={() => navigate('/filter?bookType=new')}
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate('/filter?bookType=new'); }}
          role="menuitem"
        >
          New Books
        </span>
        <span
          style={{ cursor: 'pointer', color: '#333', textDecoration: 'none', fontWeight: 500 }}
          onClick={() => navigate('/filter?bookType=old')}
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate('/filter?bookType=old'); }}
          role="menuitem"
        >
          Old Books
        </span>
        <span
          style={{ cursor: 'pointer', color: '#333', textDecoration: 'none', fontWeight: 500 }}
          onClick={() => navigate('/filter?inStock=1')}
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate('/filter?inStock=1'); }}
          role="menuitem"
        >
          In Stock
        </span>
      </nav>

      <div className="hero-banner" style={{ zIndex: 1, position: 'relative' }}>
        <img
          // src="https://a-static.besthdwallpaper.com/a-peaceful-library-with-a-variety-of-books-on-the-shelves-wallpaper-1280x720-98073_45.jpg"
          alt="Book Store Banner"
        />
      </div>

      <div style={{
        width: '100%',
        margin: '0 auto',
        marginTop: '0.5rem',
        marginBottom: '2rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2,
        background: '#fff'
      }}>
        <img
          // src="https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80"
          src="/banner1.png"
          alt="Books Banner"
          style={{
            width: '80%',
            // maxWidth: 1200,
            height: '60%',
            objectFit: 'cover',
            borderRadius: 16,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            background: '#fff'
          }}
        />
      </div>

      <section className="popular-section">
        <h2>Latest Books</h2>
        <div style={{ position: 'relative', width: '100%', zIndex: 0 }}>
          <button
            onClick={handleScrollLeft}
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              color: 'black',
              transform: 'translateY(-50%)',
              zIndex: 2,
              background: '#fff',
              border: 'none',
              borderRadius: '50%',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            aria-label="Scroll left"
          >
            <FaChevronLeft />
          </button>
          <div
            ref={scrollRef}
            style={{
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              padding: '0 48px',
              scrollBehavior: 'smooth',
              position: 'relative',
              zIndex: 0,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
            className="popular-books-horizontal-scroll"
            onWheel={e => {
              if (e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY;
                e.preventDefault();
              }
            }}
          >
            <style>
              {`
                .popular-books-horizontal-scroll::-webkit-scrollbar {
                  display: none;
                }
              `}
            </style>
            {popularBooks.map((book, index) => (
              <div
                key={book._id || index}
                className="book-card"
                style={{
                  display: 'inline-block',
                  verticalAlign: 'top',
                  width: 220,
                  marginRight: 24,
                  position: 'relative',
                  zIndex: 0,
                  cursor: 'pointer'
                }}
                onClick={() => navigate(`/book/${book._id}`)}
              >
                <div className="book-image" style={{ position: 'relative', width: '100%', height: 200, zIndex: 0 }}>
                  <img
                    src={
                      Array.isArray(book.images) && book.images.length > 0 && book.images[0]
                        ? book.images[0]
                        : '/books/default-book.jpg'
                    }
                    alt={book.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      background: book.bookType === 'old' ? '#e65100' : '#4CAF50',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 13,
                      padding: '2px 10px',
                      borderRadius: 12,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                      zIndex: 1,
                      letterSpacing: 1,
                    }}
                  >
                    {book.bookType === 'old' ? 'OLD' : 'NEW'}
                  </div>
                  {user && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWishlist(book._id);
                      }}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        cursor: 'pointer',
                        fontSize: 22,
                        color: wishlist[book._id] ? '#e65100' : '#fff',
                        textShadow: '0 1px 4px rgba(0,0,0,0.18)',
                        zIndex: 2
                      }}
                      title={wishlist[book._id] ? 'Remove from wishlist' : 'Add to wishlist'}
                    >
                      {wishlist[book._id] ? <FaHeart /> : <FaRegHeart />}
                    </span>
                  )}
                </div>
                <div className="book-info">
                  <h3 style={{ marginBottom: 4 }}>{book.title}</h3>
                  <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>
                    {book.author}
                  </div>
                  <div style={{ color: '#222', fontWeight: 600, marginBottom: 8 }}>
                    {book.price} Tk
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: 8 }}>
                    {book.stock === 0 ? (
                      <div
                        style={{
                          background: '#e74c3c',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 13,
                          padding: '2px 10px',
                          borderRadius: 12,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                          letterSpacing: 1,
                          minWidth: 90,
                          textAlign: 'center'
                        }}
                      >
                        Out of Stock
                      </div>
                    ) : (
                      <button
                        style={{
                          background: cart[book._id] ? '#e74c3c' : '#8B6F6F',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          padding: '0.3rem 0.8rem',
                          cursor: 'pointer'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCart(book._id);
                        }}
                      >
                        {cart[book._id] ? 'Remove from Cart' : 'Add to Cart'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={handleScrollRight}
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 2,
              background: '#fff',
              border: 'none',
              borderRadius: '50%',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color:'black'
            }}
            aria-label="Scroll right"
          >
            <FaChevronRight />
          </button>
        </div>
      </section>

      <Footer />
      <div
        style={{
          width: '100%',
          textAlign: 'center',
          margin: '1.5rem 0 0 0',
          color: '#888',
          fontSize: 14
        }}
      >
        © 2025 BookStore. All rights reserved.
      </div>
    </div>
  );
}
