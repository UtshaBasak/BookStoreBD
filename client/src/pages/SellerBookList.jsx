import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SellerBookList() {
  const [books, setBooks] = useState([]);
  const [edit, setEdit] = useState({}); // { [bookId]: { stock, price } }
  const [loading, setLoading] = useState(false);

  const sellerEmail = localStorage.getItem('userEmail');
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`http://localhost:1015/book/seller/${encodeURIComponent(sellerEmail)}`)
      .then(res => res.json())
      .then(data => setBooks(data))
      .catch(err => console.error(err));
  }, [sellerEmail]);

  const handleEditChange = (id, field, value) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits
    setEdit(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const handleUpdate = async (id, field) => {
    const value = parseInt(edit[id]?.[field], 10);
    if (isNaN(value) || value < 0) {
      alert('Value must be a non-negative integer');
      return;
    }
    setLoading(true);
    try {
      const url = field === 'stock'
        ? `http://localhost:1015/book/update-stock/${id}`
        : `http://localhost:1015/book/update-price/${id}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.message || 'Update failed');
      } else {
        setBooks(books =>
          books.map(b => b._id === id ? { ...b, [field]: value } : b)
        );
        setEdit(prev => ({ ...prev, [id]: { ...prev[id], [field]: '' } }));
      }
    } catch (err) {
      console.error(err);
      alert('Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this book?')) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:1015/book/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.message || 'Delete failed');
      } else {
        setBooks(books => books.filter(b => b._id !== id));
      }
    } catch (err) {
      console.error(err);
      alert('Delete failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', boxSizing: 'border-box', padding: '2rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={() => navigate('/profile')}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          ← Return to Profile
        </button>
      </div>
      <h2>Your Books</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="styled-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Pages</th>
              <th>Category</th>
              <th>Book Type</th>
              <th>Condition</th>
              <th>Stock</th>
              <th>Update Stock</th>
              <th>Price (Tk)</th>
              <th>Update Price</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {books.map(book => (
              <tr key={book._id}>
                <td>{book.title}</td>
                <td>{book.author}</td>
                <td>{book.pages}</td>
                <td>{Array.isArray(book.category) ? book.category.join(', ') : (book.category || 'N/A')}</td>
                <td>{book.bookType}</td>
                <td>{book.condition}</td>
                <td>{book.stock}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={edit[book._id]?.stock ?? ''}
                    onChange={e => handleEditChange(book._id, 'stock', e.target.value)}
                    style={{ width: 60 }}
                  />
                  <button
                    onClick={() => handleUpdate(book._id, 'stock')}
                    disabled={loading}
                  >
                    Save
                  </button>
                </td>
                <td>{book.price}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={edit[book._id]?.price ?? ''}
                    onChange={e => handleEditChange(book._id, 'price', e.target.value)}
                    style={{ width: 80 }}
                  />
                  <button
                    onClick={() => handleUpdate(book._id, 'price')}
                    disabled={loading}
                  >
                    Save
                  </button>
                </td>
                <td>
                  <button
                    onClick={() => handleDelete(book._id)}
                    disabled={loading}
                    style={{ backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '3px', padding: '5px 10px', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
