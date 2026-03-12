import React, { useEffect, useState } from 'react';
import { FaTrash, FaHome, FaHeart, FaRegHeart } from 'react-icons/fa';
import { useNavigate, Link } from 'react-router-dom';

export default function Cart() {
  const [cartBooks, setCartBooks] = useState([]);
  const [wishlist, setWishlist] = useState({});
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail');

  // Load cart from backend
  useEffect(() => {
    if (!userEmail) return;
    fetch(`https://bookstorebd.onrender.com/cart?email=${encodeURIComponent(userEmail)}`)
      .then(res => res.json())
      .then(data => setCartBooks(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load cart.'));
  }, [userEmail]);

  // Load wishlist for icon state
  useEffect(() => {
    if (!userEmail) return;
    fetch(`https://bookstorebd.onrender.com/wishlist?email=${encodeURIComponent(userEmail)}`)
      .then(res => res.json())
      .then(data => {
        const wishMap = {};
        (Array.isArray(data) ? data : []).forEach(book => { wishMap[book._id] = true; });
        setWishlist(wishMap);
      });
  }, [userEmail]);

  // Remove from cart
  const handleRemoveFromCart = (id) => {
    fetch(`https://bookstorebd.onrender.com/cart/remove/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    })
      .then(res => res.json())
      .then(data => setCartBooks(data));
  };

  // Toggle wishlist
  const handleToggleWishlist = (id) => {
    if (!userEmail) {
      alert('Please sign in to use wishlist.');
      return;
    }
    const inWishlist = !!wishlist[id];
    fetch(`https://bookstorebd.onrender.com/wishlist/${inWishlist ? 'remove' : 'add'}/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    })
      .then(res => res.json())
      .then(data => {
        const wishMap = {};
        data.forEach(book => { wishMap[book._id] = true; });
        setWishlist(wishMap);
      });
  };

  // Helper to resolve image src
  const getBookImageSrc = (book) => {
    const img = book.images?.[0];
    if (!img) return 'https://via.placeholder.com/80x120?text=No+Image';
    if (img.startsWith('data:image/')) return img;
    if (/^https?:\/\//.test(img)) return img;
    return `https://bookstorebd.onrender.com/uploads/${img}`;
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
        width: '100vw',
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
