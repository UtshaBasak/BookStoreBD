import React, { useEffect, useState } from 'react';
import { FaTrash, FaHome,FaShoppingCart } from 'react-icons/fa';

export default function Wishlist() {
  const [wishlist, setWishlist] = useState([]);

  // Fetch wishlist from backend
  useEffect(() => {
    fetch('http://localhost:1015/wishlist')
      .then((res) => res.json())
      .then((data) => {
        setWishlist(data);
      })
      .catch((err) => console.error('Error fetching wishlist:', err));
  }, []);

  // Handle delete from wishlist
  const handleDelete = async (id) => {
    console.log('Deleting book with ID:', id);
    try {
      const res = await fetch(`http://localhost:1015/wishlist/delete/${id}`);
      const updatedWishlist = await res.json();
      setWishlist(updatedWishlist);
    } catch (err) {
      console.error('Error deleting from wishlist:', err);
    }
  };

  console.log('Wishlist:', wishlist);

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
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          alignItems: 'center',
        }}
      >
        <h3
          style={{
            fontSize: '2.5rem',
            color: 'black',
            marginBottom: '3rem',
          }}
        >
          Wishlist
        </h3>
        <FaHome style={{ fontSize: '2rem', cursor: 'pointer', color: 'black' }} />
      </div>

      {/* Wishlist Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                minWidth: '500px',
                maxWidth: '900px',
              }}
            >
              <img
                src={
                  book.images?.[0]
                    ? `http://localhost:1015/uploads/${book.images[0]}`
                    : 'https://via.placeholder.com/100x150'
                }
                alt={book.title}
                style={{
                  width: '200px',
                  height: '80px',
                  borderRadius: '10px',
                }}
              />

              <div style={{ flex: 1 }}>
                <div><strong>Title:</strong> {book.title}</div>
                <div><strong>Author:</strong> {book.author}</div>
                <div><strong>Genre:</strong> {book.category || 'N/A'}</div>
              </div>

              <FaShoppingCart
                style={{
                  cursor: 'pointer',
                  color: '#ccc',
                  marginTop: '60px',
                }}
                onClick={() => console.log('Add to cart clicked')}
                title="Add to cart"
              />

              <FaTrash
                style={{
                  cursor: 'pointer',
                  color: '#ccc',
                  marginTop: '60px',
                }}
                onClick={() => handleDelete(book._id)}
              
                title="Remove from wishlist"
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}