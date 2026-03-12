import React, { useState, useEffect } from 'react';
import { FaSearch, FaHome, FaStar, FaHeart, FaRegHeart, FaShoppingCart } from 'react-icons/fa';
import { useLocation, useNavigate } from 'react-router-dom';

const categories = [
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

export default function BookFilter() {
  const [searchTerm, setSearchTerm] = useState('');
  const [bookList, setBookList] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [priceFilter, setPriceFilter] = useState({ from: '', to: '' });
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({
    bookType: '',
    condition: '',
    category: [], // now an array for multi-select
    rating: 0,
  });
  const [sortOption, setSortOption] = useState('popular');
  const [wishlist, setWishlist] = useState({});
  const [cart, setCart] = useState({});
  const [inStockOnly, setInStockOnly] = useState(false);
  const userEmail = localStorage.getItem('userEmail');
  const location = useLocation();
  const navigate = useNavigate();

  // Parse ?search=..., ?bookType=..., ?category=..., ?inStock=1 from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const query = params.get('search') || '';
    const bookType = params.get('bookType') || '';
    const category = params.get('category') || '';
    setSearchInput(query);
    setSearchTerm(query);
    setFilters(prev => ({
      ...prev,
      bookType: bookType ? bookType.toLowerCase() : '',
      category: category ? [category.toLowerCase()] : [],
    }));
    setInStockOnly(params.get('inStock') === '1');
  }, [location.search]);

  useEffect(() => {
    fetch('https://bookstorebd.onrender.com/filter/booklist')
      .then((res) => res.json())
      .then((data) => {
        setBookList(data);
        setFilteredBooks(data);
      })
      .catch((err) => console.error('Error fetching books:', err));
  }, []);

  // Fetch wishlist and cart for toggle buttons
  useEffect(() => {
    if (!userEmail) return;
    fetch(`https://bookstorebd.onrender.com/wishlist?email=${encodeURIComponent(userEmail)}`)
      .then(res => res.json())
      .then(data => {
        const wishMap = {};
        data.forEach(book => { wishMap[book._id] = true; });
        setWishlist(wishMap);
      });
    fetch(`https://bookstorebd.onrender.com/cart?email=${encodeURIComponent(userEmail)}`)
      .then(res => res.json())
      .then(data => {
        const cartMap = {};
        data.forEach(book => { cartMap[book._id] = true; });
        setCart(cartMap);
      });
  }, [userEmail]);

  // Filtering logic
  useEffect(() => {
    let filtered = [...bookList];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (book) =>
          book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          book.author.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Book Type filter
    if (filters.bookType) {
      filtered = filtered.filter(
        (book) => (book.bookType || '').toLowerCase() === filters.bookType
      );
    }

    // Condition filter
    if (filters.condition) {
      filtered = filtered.filter(
        (book) => (book.condition || '').toLowerCase() === filters.condition
      );
    }

    // Category filter (multi-select, OR logic)
    if (filters.category.length > 0) {
      filtered = filtered.filter(
        (book) => {
          if (!book.category) return false;
          const bookCats = Array.isArray(book.category)
            ? book.category.map(c => c.toLowerCase())
            : [book.category.toLowerCase()];
          return filters.category.some(cat => bookCats.includes(cat));
        }
      );
    }

    // Price filter
    const from = parseFloat(priceFilter.from) || 0;
    const to = parseFloat(priceFilter.to) || Infinity;
    filtered = filtered.filter((book) => {
      const price = parseFloat(book.price);
      return price >= from && price <= to;
    });

    // Rating filter
    if (filters.rating > 0) {
      filtered = filtered.filter(
        (book) => Math.round(Number(book.rating) || 0) >= filters.rating
      );
    }

    // In Stock filter
    if (inStockOnly) {
      filtered = filtered.filter(book => Number(book.stock) > 0);
    }

    // Sorting
    if (sortOption === 'priceHighLow') {
      filtered.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
    } else if (sortOption === 'priceLowHigh') {
      filtered.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
    } else {
      // Most popular: sort by rating desc, then by number of reviews if available
      filtered.sort((a, b) => {
        const ratingDiff = (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
        if (ratingDiff !== 0) return ratingDiff;
        return (b.numReviews || 0) - (a.numReviews || 0);
      });
    }

    setFilteredBooks(filtered);
  }, [bookList, searchTerm, filters, priceFilter, sortOption, inStockOnly]);

  const handleSearch = () => {
    setSearchTerm(searchInput);
    navigate(`/filter?search=${encodeURIComponent(searchInput.trim())}`);
  };

  // Toggle radio: click to select/unselect (except category)
  const handleRadioToggle = (filterKey, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterKey]: prev[filterKey] === value ? '' : value
    }));
  };

  // Toggle for category (multi-select)
  const handleCategoryToggle = (cat) => {
    setFilters((prev) => {
      const arr = prev.category.includes(cat)
        ? prev.category.filter(c => c !== cat)
        : [...prev.category, cat];
      return { ...prev, category: arr };
    });
  };

  // Function for handling rating changes (to be implemented)
  // const handleRatingChange = (value) => {
  //   // Rating functionality to be added later
  // };
  // Wishlist toggle
  const handleToggleWishlist = async (bookId) => {
    if (!userEmail) {
      alert('Please sign in to use wishlist.');
      return;
    }
    const isInWishlist = !!wishlist[bookId];
    await fetch(`https://bookstorebd.onrender.com/wishlist/${isInWishlist ? 'remove' : 'add'}/${bookId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    setWishlist(w => ({ ...w, [bookId]: !isInWishlist }));
  };

  // Cart toggle
  const handleToggleCart = async (bookId) => {
    if (!userEmail) {
      alert('Please sign in to use cart.');
      return;
    }
    const isInCart = !!cart[bookId];
    await fetch(`https://bookstorebd.onrender.com/cart/${isInCart ? 'remove' : 'add'}/${bookId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });
    setCart(w => ({ ...w, [bookId]: !isInCart }));
  };

  return (
    <div
      style={{
        backgroundImage: `url('https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1950&q=80')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat',
        minHeight: '100vh',
        width: '100vw',
        padding: '2rem',
        boxSizing: 'border-box',
        fontFamily: 'Arial, sans-serif',
        color: 'white',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '2rem',
        }}
      >
        {/* Filter Section */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            width: '250px',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            padding: '1rem',
            borderRadius: '12px',
            height: 'fit-content',
            position: 'sticky',
            top: 24,
            alignSelf: 'flex-start',
            zIndex: 30
          }}
        >
          {/* Book Type (as button list, equal boxes) */}
          <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '12px', padding: '1rem' }}>
            <strong>Book Type</strong>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['old', 'new'].map((type) => (
                <button
                  key={type}
                  type="button"
                  style={{
                    background: filters.bookType === type ? '#e65100' : '#fff',
                    color: filters.bookType === type ? '#fff' : '#222',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 0',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: 15,
                    textAlign: 'center',
                    width: '100%',
                    minHeight: 36,
                    transition: 'background 0.2s, color 0.2s'
                  }}
                  onClick={() => handleRadioToggle('bookType', type)}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {/* Condition (as button list, equal boxes, only for old) */}
          {filters.bookType === 'old' && (
            <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '12px', padding: '1rem' }}>
              <strong>Condition</strong>
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {['mint', 'very good', 'good', 'fair', 'poor'].map((cond) => (
                  <button
                    key={cond}
                    type="button"
                    style={{
                      background: filters.condition === cond ? '#e65100' : '#fff',
                      color: filters.condition === cond ? '#fff' : '#222',
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 0',
                      cursor: 'pointer',
                      fontWeight: 500,
                      fontSize: 15,
                      textAlign: 'center',
                      width: '100%',
                      minHeight: 36,
                      transition: 'background 0.2s, color 0.2s'
                    }}
                    onClick={() => handleRadioToggle('condition', cond)}
                  >
                    {cond.charAt(0).toUpperCase() + cond.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Category (multi-select, equal boxes, vertical list) */}
          <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '12px', padding: '1rem' }}>
            <strong>Category</strong>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {categories.map((cat) => {
                const catKey = cat.toLowerCase();
                const selected = filters.category.includes(catKey);
                return (
                  <button
                    key={cat}
                    type="button"
                    style={{
                      background: selected ? '#e65100' : '#fff',
                      color: selected ? '#fff' : '#222',
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 0',
                      marginBottom: 0,
                      cursor: 'pointer',
                      fontWeight: 500,
                      fontSize: 15,
                      textAlign: 'center',
                      width: '100%',
                      minHeight: 36,
                      transition: 'background 0.2s, color 0.2s'
                    }}
                    onClick={() => handleCategoryToggle(catKey)}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Price Range */}
          <div
            style={{
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <strong>Price (Taka)</strong>
            <div style={{ marginTop: '0.5rem' }}>
              <input
                type="number"
                placeholder="From"
                style={{ width: '80px', marginRight: '0.5rem' }}
                value={priceFilter.from}
                onChange={(e) => {
                  const value = e.target.value;
                  setPriceFilter((prev) => ({ ...prev, from: value }));
                }}
              />
              <input
                type="number"
                placeholder="To"
                style={{ width: '80px' }}
                value={priceFilter.to}
                onChange={(e) => {
                  const value = e.target.value;
                  setPriceFilter((prev) => ({ ...prev, to: value }));
                }}
              />
            </div>
          </div>
          {/* Rating */}
          <div
            style={{
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <strong>Rating</strong>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  style={{
                    cursor: 'pointer',
                    color: star <= filters.rating ? '#FFD700' : '#bbb',
                    fontSize: 22,
                    marginRight: 2,
                    transition: 'color 0.2s'
                  }}
                  onClick={() => setFilters(prev => ({
                    ...prev,
                    rating: prev.rating === star ? 0 : star
                  }))}
                  title={`${star}+`}
                >
                  <FaStar />
                </span>
              ))}
              <span style={{ marginLeft: 8, fontSize: 14, color: '#fff' }}>
                {filters.rating > 0 ? `${filters.rating}+` : ''}
              </span>
            </div>
          </div>
          {/* In Stock Toggle */}
          <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '12px', padding: '1rem' }}>
            <strong>Stock</strong>
            <div style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                style={{
                  background: inStockOnly ? '#e65100' : '#fff',
                  color: inStockOnly ? '#fff' : '#222',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 0',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: 15,
                  textAlign: 'center',
                  width: '100%',
                  minHeight: 36,
                  transition: 'background 0.2s, color 0.2s'
                }}
                onClick={() => {
                  setInStockOnly(v => {
                    const next = !v;
                    // Update URL param
                    const params = new URLSearchParams(location.search);
                    if (next) params.set('inStock', '1');
                    else params.delete('inStock');
                    navigate(`/filter?${params.toString()}`);
                    return next;
                  });
                }}
              >
                In Stock Only
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Search + Results */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Search Bar and Sort */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              gap: '1rem',
              position: 'relative'
            }}
          >
            {/* Search Bar */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search books or authors..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  border: 'none',
                  color: 'white',
                  fontSize: '1rem',
                  outline: 'none',
                  width: '100%',
                  borderRadius: 25,
                  padding: '0.5rem 1rem',
                  paddingRight: 44
                }}
              />
              {/* Search Button (inside bar, rightmost) */}
              <button
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: '#fff',
                  color: '#e65100',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.10)'
                }}
                onClick={handleSearch}
                aria-label="Search"
              >
                <FaSearch />
              </button>
            </div>
            {/* Sort Dropdown (right endpoint) */}
            <select
              value={sortOption}
              onChange={e => setSortOption(e.target.value)}
              style={{
                background: '#fff',
                color: '#222',
                border: 'none',
                borderRadius: 6,
                padding: '0.3rem 1rem',
                fontWeight: 500,
                fontSize: 15,
                cursor: 'pointer',
                marginLeft: 8
              }}
              title="Sort books"
            >
              <option value="popular">Most Popular</option>
              <option value="priceHighLow">Price - High to Low</option>
              <option value="priceLowHigh">Price - Low to High</option>
            </select>
            {/* Home Button (right, separated) */}
            <button
              style={{
                marginLeft: 16,
                background: '#fff',
                color: '#222',
                border: 'none',
                borderRadius: '50%',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.10)'
              }}
              onClick={() => navigate('/')}
              title="Go to Homepage"
              aria-label="Go to Homepage"
            >
              <FaHome />
            </button>
          </div>

          {/* Book List */}
          <div
            style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1.5rem',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              padding: '1rem',
              borderRadius: '12px',
            }}
          >
            {filteredBooks.length === 0 ? (
              <p style={{ gridColumn: '1 / -1' }}>No book or author found</p>
            ) : (
              filteredBooks.map((book) => {
                const isOld = (book.bookType || '').toLowerCase() === 'old';
                const isInWishlist = !!wishlist[book._id];
                const isInCart = !!cart[book._id];
                return (
                  <div
                    key={book._id}
                    style={{
                      display: 'flex',
                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      borderRadius: '12px',
                      padding: '1rem',
                      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
                      alignItems: 'flex-start',
                      gap: '1.5rem',
                      position: 'relative',
                      minHeight: 180,
                      cursor: 'pointer'
                    }}
                    onClick={() => navigate(`/book/${book._id}`)}
                  >
                    {/* Book Image with sticker */}
                    <div style={{ position: 'relative', width: 100, height: 150 }}>
                      <img
                        src={book.images && book.images[0] ? book.images[0] : 'https://via.placeholder.com/100x150'}
                        alt={book.title}
                        style={{
                          width: '100px',
                          height: '150px',
                          borderRadius: '8px',
                          objectFit: 'cover',
                          background: '#fff'
                        }}
                      />
                      {/* Book type sticker */}
                      <span
                        style={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          background: isOld ? '#e65100' : '#43a047',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 13,
                          padding: '2px 10px',
                          borderRadius: 8,
                          letterSpacing: 1,
                          zIndex: 2
                        }}
                      >
                        {isOld ? 'OLD' : 'NEW'}
                      </span>
                    </div>
                    {/* Book Info */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                        {book.title}
                      </div>
                      <div>Author: {book.author}</div>
                      <div>Category: {Array.isArray(book.category) ? book.category.join(', ') : (book.category || 'N/A')}</div>
                      <div>Price: {book.price} Tk</div>
                      {/* Show condition only for old books */}
                      {isOld && (
                        <div>Condition: {book.condition ? (book.condition.charAt(0).toUpperCase() + book.condition.slice(1)) : 'N/A'}</div>
                      )}
                      <div>
                        Rating:&nbsp;
                        {Array.from({ length: Math.round(Number(book.rating) || 0) }).map((_, i) => (
                          <FaStar key={i} color="#FFD700" style={{ fontSize: 16 }} />
                        ))}
                        <span style={{ marginLeft: 4, color: '#fff' }}>
                          {book.rating ? Number(book.rating).toFixed(1) : 'N/A'}
                        </span>
                      </div>
                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                        {/* Wishlist toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Add this
                            handleToggleWishlist(book._id);
                          }}
                          style={{
                            background: isInWishlist ? '#e65100' : '#fff',
                            color: isInWishlist ? '#fff' : '#e65100',
                            border: '1px solid #e65100',
                            borderRadius: 6,
                            padding: '4px 12px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          {isInWishlist ? <FaHeart /> : <FaRegHeart />}
                          {isInWishlist ? 'Remove from Wishlist' : 'Add to Wishlist'}
                        </button>
                        {/* Cart toggle or Out of Stock */}
                        {book.stock === 0 ? (
                          <span
                            style={{
                              background: '#e74c3c',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: 13,
                              padding: '4px 14px',
                              borderRadius: 8,
                              letterSpacing: 1,
                              minWidth: 90,
                              textAlign: 'center',
                              display: 'inline-block'
                            }}
                          >
                            Out of Stock
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Add this
                              handleToggleCart(book._id);
                            }}
                            style={{
                              background: isInCart ? '#e65100' : '#fff',
                              color: isInCart ? '#fff' : '#e65100',
                              border: '1px solid #e65100',
                              borderRadius: 6,
                              padding: '4px 12px',
                              fontWeight: 500,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            <FaShoppingCart />
                            {isInCart ? 'Remove from Cart' : 'Add to Cart'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
