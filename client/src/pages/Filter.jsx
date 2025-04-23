import React, { useState, useEffect } from 'react';
import { FaSearch, FaHome } from 'react-icons/fa';

export default function BookFilter() {
  const [searchTerm, setSearchTerm] = useState('');
  const [bookList, setBookList] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [priceFilter, setPriceFilter] = useState({ from: '', to: '' });


  useEffect(() => {
    fetch('http://localhost:1015/filter/booklist')
      .then((res) => res.json())
      .then((data) => {
        setBookList(data);
        setFilteredBooks(data);
      })
      .catch((err) => console.error('Error fetching books:', err));
  }, []);

  useEffect(() => {
    const filtered = bookList.filter(
      (book) =>
        book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.author.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredBooks(filtered);
  }, [searchTerm, bookList]);

  // console.log('Filtered Books:', filteredBooks[0]);

  const handleFilterChange = async (filterKey, filterInput) => {
    try {
      const res = await fetch('http://localhost:1015/filter/booklist_filter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter_key: filterKey,
          filter_input: filterInput,
        }),
      });
  
      const data = await res.json();
      console.log('filter_key:', filterKey, 'filter_input:', filterInput, 'data:', data);
      setBookList(data);
      setFilteredBooks(data); // Optional: keep filteredBooks in sync
    } catch (err) {
      console.error('Error fetching filtered books:', err);
    }
  };
  const handlepricefilterchange = (filterKey, value) => {
    if (filterKey === 'price') {
      const from = parseFloat(value.from) || 0;
      const to = parseFloat(value.to) || Infinity;
  
      const filtered = bookList.filter((book) => {
        const price = parseFloat(book.price); // assuming price is stored as number or string
        return price >= from && price <= to;
      });
  
      setFilteredBooks(filtered);
    }
  
    // handle other filters here...
  };
  
  console.log('Filtered Books:', filteredBooks[0]);
  

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
          }}
        >
          {[
            {
              label: 'bookType',
              options: ['OLD', 'NEW'],
              type: 'radio',
            },
            // 
            {
              label: 'condition',
              options: ['Mint', 'Very Good', 'Good', 'Fair', 'Poor'],
              type: 'radio',
            },
            {
              label: 'category',
              options: ['Fiction', 'Non-fiction', 'Comics', 'Textbooks', 'Others'],
              type: 'radio',
            },
          ].map((section) => (
            <div
              key={section.label}
              style={{
                backgroundColor: 'rgba(0,0,0,0.6)',
                borderRadius: '12px',
                padding: '1rem',
              }}
            >
              <strong>{section.label}</strong>
              <div style={{ marginTop: '0.5rem' }}>
                {section.options.map((option, index) => (
                  <div key={index}>
                    <input
                      type={section.type}
                      name={section.label}
                      id={`${section.label}-${index}`}
                      style={{ marginRight: '0.5rem' }}
                      onChange={() => handleFilterChange(section.label.replace(/\s/g, ''), option.toLowerCase())}
                    />

                    <label htmlFor={`${section.label}-${index}`}>{option}</label>
                  </div>
                ))}
              </div>
            </div>
          ))}

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
                  handlepricefilterchange('price', { from: value, to: priceFilter.to });
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
                  handlepricefilterchange('price', { from: priceFilter.from, to: value });
                }}
              />
            </div>
            </div>


          {/* Rating */}
          {/* <div
            style={{
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRadius: '12px',
              padding: '1rem',
            }}
          >
            <h3>Rating</h3>
            <input type="range" min="1" max="5" />
          </div> */}
        </div>

        {/* Right Side: Search + Results */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Search Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              padding: '0.5rem 1rem',
              borderRadius: '25px',
              width: '100%',
            }}
          >
            <FaSearch />
            <input
              type="text"
              placeholder="Search book or author"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'white',
                marginLeft: '0.5rem',
                fontSize: '1rem',
                outline: 'none',
                width: '100%',
              }}
            />
            <FaHome style={{ marginLeft: '1rem', cursor: 'pointer' }} />
          </div>

          {/* Book List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              padding: '1rem',
              borderRadius: '12px',
              maxHeight: '70vh',
            }}
          >
            {filteredBooks.length === 0 ? (
              <p>No books found.</p>
            ) : (
              filteredBooks.map((book) => (
                <div
                  key={book._id}
                  style={{
                    display: 'flex',
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    borderRadius: '12px',
                    padding: '1rem',
                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <img
                    src={book.images[0] || 'https://via.placeholder.com/100x150'}
                    
                    alt={book.title}
                    style={{
                      width: '100px',
                      height: '150px',
                      borderRadius: '8px',
                      marginRight: '1rem',
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                      Title: {book.title}
                    </div>
                    <div>Author: {book.author}</div>
                    <div>Category: {book.category || 'N/A'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
