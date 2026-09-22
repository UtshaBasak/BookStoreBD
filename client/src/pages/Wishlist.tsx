import { FaTrash, FaHome, FaShoppingCart } from 'react-icons/fa';
import { useNavigate, Link } from 'react-router-dom';

import type { Book } from '@shared/api.js';

import { API_BASE_URL } from '../config/api.js';
import { useCart, useToggleCart, useToggleWishlist, useWishlist } from '../hooks/queries.js';
import { promptSignIn, useToast } from '../hooks/useToast.js';
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
    // Cloudinary delivers the size the row draws, not the original photograph.
    if (isCloudinary(img)) return sized(img, IMAGE_WIDTHS.row);
    if (/^https?:\/\//.test(img)) return img; // full URL
    // A cover served by the API arrives as a path, not as bytes.
    if (img.startsWith('/')) return img;
    return `${API_BASE_URL}/uploads/${img}`; // filename
  };

  if (!userEmail) {
    return (
      <div style={{ color: 'white', padding: '2rem', textAlign: 'center', background: '#222', minHeight: '100vh' }}>
        Please sign in to view your wishlist.
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

      {/* Cart Button in Top Right */}
      <Link
        to="/cart"
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          color: '#8B6F6F',
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
        title="Go to Cart"
      >
        <FaShoppingCart size={22} />
      </Link>

      {/* Wishlist Heading at Top Center */}
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
          Wishlist
        </h3>
      </div>

      {/* Wishlist Items Centered Vertically */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          minHeight: 'calc(100vh - 7rem)',
        }}
      >
        <div
          className="w-full max-w-[600px] px-3"
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}
        >
          {wishlist.length === 0 ? (
            <p>No books in wishlist.</p>
          ) : (
            wishlist.map((book) => (
              <div
                key={book._id}
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: '15px',
                  padding: '1rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '1rem',
                  // Was `width: fit-content` over `minWidth: 350px`, which is
                  // wider than a 360px screen once the padding is counted.
                  width: '100%',
                  maxWidth: '600px',
                  boxSizing: 'border-box',
                  position: 'relative'
                }}
              >
                {/* Stock Out Banner */}
                {book.stock === 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      background: '#e74c3c',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 13,
                      padding: '2px 10px',
                      borderRadius: 12,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                      letterSpacing: 1,
                      zIndex: 2,
                      minWidth: 90,
                      textAlign: 'center'
                    }}
                  >
                    Out Of Stock
                  </div>
                )}
                <img
                  loading="lazy"
                  decoding="async"
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

                {/* Cart icon only if book is in stock */}
                {book.stock > 0 && (
                  <button
                    type="button"
                    className="icon-button"
                    style={{ color: cart[book._id] ? '#e65100' : '#ccc', marginLeft: 12 }}
                    onClick={() => handleToggleCart(book._id)}
                    title={cart[book._id] ? 'Remove from cart' : 'Add to cart'}
                    aria-label="Toggle cart"
                  >
                    <FaShoppingCart />
                  </button>
                )}

                <button
                  type="button"
                  className="icon-button"
                  style={{ color: '#e74c3c', marginLeft: 12 }}
                  onClick={() => handleDelete(book._id)}
                  title="Remove from wishlist"
                  aria-label="Remove from wishlist"
                >
                  <FaTrash />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
