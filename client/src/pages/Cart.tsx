import { FaTrash, FaHome, FaHeart, FaRegHeart } from 'react-icons/fa';
import { useNavigate, Link } from 'react-router-dom';

import type { Book } from '@shared/api.js';

import { API_BASE_URL } from '../config/api.js';
import { useCart, useToggleCart, useToggleWishlist, useWishlist } from '../hooks/queries.js';
import { promptSignIn, useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { flagsFor } from '../utils/bookFlags.js';
import { PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';

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
    if (/^https?:\/\//.test(img)) return img;
    return `${API_BASE_URL}/uploads/${img}`;
  };

  if (!userEmail) {
    return (
      <div style={{ color: 'white', padding: '2rem', textAlign: 'center', background: '#222', minHeight: '100vh' }}>
        Please sign in to view your cart.
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: 'red', padding: '2rem', textAlign: 'center', background: '#222', minHeight: '100vh' }}>
        {error}
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundImage: `url('https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1400&q=80')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '100vh',
        width: '100%',
        padding: '2rem',
        fontFamily: 'Arial, sans-serif',
        color: 'white',
        boxSizing: 'border-box',
        position: 'relative'
      }}
    >
      {/* Home Icon in Top Left */}
      <FaHome
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          fontSize: '2rem',
          cursor: 'pointer',
          color: 'black',
          zIndex: 10
        }}
        onClick={() => navigate('/')}
        title="Go to Homepage"
      />

      {/* Wishlist Button in Top Right */}
      <Link
        to="/wishlist"
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          color: '#e65100',
          background: '#fff',
          borderRadius: '50%',
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          zIndex: 10,
          textDecoration: 'none'
        }}
        title="Go to Wishlist"
      >
        <FaHeart size={22} />
      </Link>

      {/* Cart Heading at Top Center */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          marginTop: 0,
          marginBottom: '2.5rem',
        }}
      >
        <h3
          style={{
            fontSize: '2.5rem',
            color: 'white',
            margin: 0,
            textAlign: 'center',
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          Cart
        </h3>
      </div>

      {/* Cart Items Centered Vertically */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          minHeight: 'calc(100vh - 7rem)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          {cartBooks.length === 0 ? (
            <p>No books in cart.</p>
          ) : (
            cartBooks.map((book) => (
              <div
                key={book._id}
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: '15px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  width: 'fit-content',
                  minWidth: '350px',
                  maxWidth: '600px',
                }}
              >
                <img
                  src={getBookImageSrc(book)}
                  alt={book.title}
                  style={{
                    width: 80,
                    height: 120,
                    objectFit: 'cover',
                    borderRadius: '8px',
                    background: '#fff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                  }}
                />

                <div style={{ flex: 1 }}>
                  <div>
                    <strong>Title:</strong> {book.title}
                    <span style={{
                      marginLeft: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      color: book.bookType === 'old' ? '#e65100' : '#43a047',
                      background: 'rgba(255,255,255,0.13)',
                      borderRadius: 8,
                      padding: '2px 10px'
                    }}>
                      {book.bookType ? book.bookType.toUpperCase() : ''}
                    </span>
                  </div>
                  <div><strong>Author:</strong> {book.author}</div>
                  <div>
                    <strong>Category:</strong> {Array.isArray(book.category) ? book.category.join(', ') : (book.category || 'N/A')}
                  </div>
                </div>

                {/* Wishlist icon */}
                <span
                  style={{
                    cursor: 'pointer',
                    color: wishlist[book._id] ? '#e65100' : '#ccc',
                    marginLeft: 12,
                    fontSize: 20
                  }}
                  onClick={() => handleToggleWishlist(book._id)}
                  title={wishlist[book._id] ? 'Remove from wishlist' : 'Add to wishlist'}
                  tabIndex={0}
                  role="button"
                  aria-label="Toggle wishlist"
                >
                  {wishlist[book._id] ? <FaHeart /> : <FaRegHeart />}
                </span>

                {/* Remove from cart */}
                <FaTrash
                  style={{
                    cursor: 'pointer',
                    color: '#e74c3c',
                    marginLeft: 12,
                  }}
                  onClick={() => handleRemoveFromCart(book._id)}
                  title="Remove from cart"
                  tabIndex={0}
                  role="button"
                  aria-label="Remove from cart"
                />
              </div>
            ))
          )}
        </div>

        {/* Proceed to Checkout Button */}
        {cartBooks.length > 0 && (
          <button
            style={{
              marginTop: '2rem',
              padding: '0.75rem 2rem',
              background: '#43a047', // green
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 18,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
            }}
            onClick={() => navigate('/payment')}
          >
            Proceed to Checkout
          </button>
        )}
      </div>
    </div>
  );
}
