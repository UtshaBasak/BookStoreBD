import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight, FaHeart, FaRegHeart } from 'react-icons/fa';
import './Homepage.css';

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
  const [user, setUser] = useState(null);
  const [profilePic, setProfilePic] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [popularBooks, setPopularBooks] = useState([]);
  const [wishlist, setWishlist] = useState({});
  const [cart, setCart] = useState({});
  const scrollRef = React.useRef();
  const navigate = useNavigate();

  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    if (email) {
      setUser({ email });
      fetch(`http://localhost:1015/user/profile?email=${email}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.profilePicture) setProfilePic(data.profilePicture);
        });
    }
  }, []);

  useEffect(() => {
    fetch('http://localhost:1015/book')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (!Array.isArray(data)) return setPopularBooks([]);
        const seen = new Set();
        const flat = [];
        data.forEach(book => {
          const key = `${book.title}__${book.bookType}`;
          if (!seen.has(key)) {
            seen.add(key);
            flat.push(book);
          }
        });
        flat.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setPopularBooks(flat.slice(0, 10)); // Show up to 10 books
      });
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('userEmail');
    setUser(null);
    setProfilePic(null);
    setShowDropdown(false);
    navigate('/sign-in');
  };

  const handleViewProfile = () => {
    setShowDropdown(false);
    navigate('/profile');
  };

  // Toggle wishlist for a book (by _id)
  const toggleWishlist = (bookId) => {
    setWishlist(prev => ({
      ...prev,
      [bookId]: !prev[bookId]
    }));
    // Optionally: send to backend here
  };

  // Toggle add to cart for a book (by _id)
  const toggleCart = (bookId) => {
    setCart(prev => ({
      ...prev,
      [bookId]: !prev[bookId]
    }));
    // Optionally: send to backend here
  };

  // Scroll handlers
  const scrollAmount = 320; // px to scroll per click (adjust as needed)
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

  return (
    <div className="homepage" style={{ width: '100vw', minHeight: '100vh' }}>
      {/* Header */}
      <header className="header">
        <div className="logo">
          {/* Make logo clickable */}
          <span
            style={{ cursor: 'pointer', color: '#8B6F6F', fontSize: '2rem', fontWeight: 'bold', userSelect: 'none' }}
            onClick={() => navigate('/')}
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate('/'); }}
            aria-label="Go to homepage"
            role="button"
          >
            Book Store
          </span>
        </div>
        <div className="search-bar">
          <input type="text" placeholder="Search books..." />
          <button>Search</button>
        </div>
        <div className="user-options" style={{ position: 'relative' }}>
          <Link to="/cart">
            <span className="cart-icon">🛒 View Cart</span>
          </Link>
          {user ? (
            <>
              <Link to="/wishlist">
                <span className="wishlist-icon" style={{ marginLeft: '1rem' }}>❤️ Wishlist</span>
              </Link>
              <div
                style={{ display: 'inline-block', marginLeft: '1rem', cursor: 'pointer', position: 'relative' }}
                tabIndex={0}
                onMouseEnter={() => setShowDropdown('profile')}
                onMouseLeave={() => setShowDropdown(false)}
                onFocus={() => setShowDropdown('profile')}
                onBlur={() => setShowDropdown(false)}
              >
                <img
                  src={profilePic || 'https://ui-avatars.com/api/?name=U'}
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
                      top: '110%',
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
            </>
          ) : (
            <Link to="/sign-in">Sign in</Link>
          )}
        </div>
      </header>

      {/* Navigation Bar with Dropdowns */}
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
          <Link to="/genre">Category</Link>
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
                <Link
                  key={index}
                  to={`/genre/${genre.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`}
                  style={{
                    padding: '0.5rem 0.75rem',
                    whiteSpace: 'nowrap',
                    display: 'block',
                  }}
                >
                  {genre}
                </Link>
              ))}
            </div>
          )}
        </div>
        
        <div className="dropdown" style={{ zIndex: 20 }}>
          <Link to="/authors">Author</Link>
          {/* No dropdown-content for Author */}
        </div>
        <Link to="/new-books">New Books</Link>
        <Link to="/old-books">Old Books</Link>
      </nav>

      {/* Hero Banner */}
      <div className="hero-banner" style={{ zIndex: 1, position: 'relative' }}>
        <img 
          src="https://a-static.besthdwallpaper.com/a-peaceful-library-with-a-variety-of-books-on-the-shelves-wallpaper-1280x720-98073_45.jpg" 
          alt="Book Store Banner"
        />
      </div>

      {/* Custom Banner Image */}
      <div style={{
        width: '100%',
        margin: '0 auto',
        marginTop: '0.5rem',
        marginBottom: '2rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2, // Ensure banner is above hero banner
        background: '#fff'
      }}>
        <img
          src="https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80"
          alt="Books Banner"
          style={{
            width: '90%',
            maxWidth: 1200,
            height: 180,
            objectFit: 'cover',
            borderRadius: 16,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            background: '#fff'
          }}
        />
      </div>

      {/* Most Popular Section */}
      <section className="popular-section">
        <h2>Most Popular</h2>
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
              zIndex: 0 // Ensure book cards are below dropdowns
            }}
            className="popular-books-horizontal-scroll"
          >
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
                  zIndex: 0 // Ensure book card is below dropdown
                }}
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
                  {/* BookType Seal */}
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
                      zIndex: 1, // Lower than dropdown
                      letterSpacing: 1,
                    }}
                  >
                    {book.bookType === 'old' ? 'OLD' : 'NEW'}
                  </div>
                  {/* Love icon for wishlist */}
                  {user && (
                    <span
                      onClick={() => toggleWishlist(book._id)}
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        cursor: 'pointer',
                        fontSize: 22,
                        color: wishlist[book._id] ? '#e65100' : '#fff',
                        textShadow: '0 1px 4px rgba(0,0,0,0.18)',
                        zIndex: 1 // Lower than dropdown
                      }}
                      title="Add to Wishlist"
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
                    <button
                      style={{
                        background: cart[book._id] ? '#e74c3c' : '#8B6F6F',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        padding: '0.3rem 0.8rem',
                        cursor: 'pointer'
                      }}
                      onClick={() => toggleCart(book._id)}
                    >
                      {cart[book._id] ? 'Remove from Cart' : 'Add to Cart'}
                    </button>
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

      {/* Footer */}
      <footer className="footer">
        <div className="footer-section">
          <h4>About Us</h4>
          <ul>
            <li>Who we are</li>
            <li>What we do</li>
            <li>Our mission</li>
            <li>Our Vision</li>
          </ul>
        </div>
        
        <div className="footer-section">
          <h4>Privacy & Policies</h4>
          <ul>
            <li>Privacy Policies</li>
            <li>Old Book Policies</li>
            <li>Exchange Policies</li>
            <li>Return Policies</li>
          </ul>
        </div>

        <div className="footer-section">
          <h4>Contact Us</h4>
          <ul>
            <li>+8801711112333</li>
            <li>bookstore@gmail.com</li>
            <li>Facebook</li>
            <li>Address: Kha 224 Pragati Sarani, Merul Badda,</li>
            <li>Dhaka 1212, Bangladesh</li>
          </ul>
        </div>
      </footer>
      {/* Footer note - moved outside footer for true centering */}
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
