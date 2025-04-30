import React, { useEffect, useState } from 'react';
import { FaTrash, FaHome, FaShoppingCart } from 'react-icons/fa';
import { useNavigate, Link } from 'react-router-dom';

export default function Wishlist() {
  const [wishlist, setWishlist] = useState([]);
  const [cart, setCart] = useState({});
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail');

  // Fetch wishlist from backend for the specific user
  useEffect(() => {
    if (!userEmail) return;
    fetch(`http://localhost:1015/wishlist?email=${encodeURIComponent(userEmail)}`)
      .then((res) => res.json())
      .then((data) => setWishlist(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load wishlist.'));
  }, [userEmail]);

  // Load cart state from backend
  useEffect(() => {
    if (!userEmail) return;
    fetch(`http://localhost:1015/cart?email=${encodeURIComponent(userEmail)}`)
      .then(res => res.json())
      .then(data => {
        const cartObj = {};
        (Array.isArray(data) ? data : []).forEach(book => { cartObj[book._id] = true; });
        setCart(cartObj);
      });
  }, [userEmail]);

  // Toggle cart for a book
  const handleToggleCart = (id) => {
    if (!userEmail) {
      alert('Please sign in to use cart.');
      return;
    }
    const isInCart = !!cart[id];
    fetch(`http://localhost:1015/cart/${isInCart ? 'remove' : 'add'}/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    })
      .then(res => res.json())
      .then(data => {
        const cartObj = {};
        data.forEach(book => { cartObj[book._id] = true; });
        setCart(cartObj);
      });
  };

  // Remove a book from wishlist for the specific user
  const handleDelete = async (id) => {
    try {
      // Use /wishlist/remove/:id for consistency with homepage logic
      const res = await fetch(`http://localhost:1015/wishlist/remove/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail })
      });
      const updatedWishlist = await res.json();
      setWishlist(updatedWishlist);
    } catch (err) {
      console.error('Error deleting from wishlist:', err);
    }
  };

  // Helper to resolve image src
  const getBookImageSrc = (book) => {
    const img = book.images?.[0];
    if (!img) return 'https://via.placeholder.com/80x120?text=No+Image';
    if (img.startsWith('data:image/')) return img; // base64
    if (/^https?:\/\//.test(img)) return img; // full URL
    return `http://localhost:1015/uploads/${img}`; // filename
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
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
                  alignItems: 'center',
                  gap: '1rem',
                  width: 'fit-content',
                  minWidth: '350px',
                  maxWidth: '600px',
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
                  <FaShoppingCart
                    style={{
                      cursor: 'pointer',
                      color: cart[book._id] ? '#e65100' : '#ccc',
                      marginLeft: 12,
                    }}
                    onClick={() => handleToggleCart(book._id)}
                    title={cart[book._id] ? 'Remove from cart' : 'Add to cart'}
                    tabIndex={0}
                    role="button"
                    aria-label="Toggle cart"
                  />
                )}

                <FaTrash
                  style={{
                    cursor: 'pointer',
                    color: '#e74c3c',
                    marginLeft: 12,
                  }}
                  onClick={() => handleDelete(book._id)}
                  title="Remove from wishlist"
                  tabIndex={0}
                  role="button"
                  aria-label="Remove from wishlist"
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}