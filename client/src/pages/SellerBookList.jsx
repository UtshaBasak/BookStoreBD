import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SellerBookList() {
  const [books, setBooks] = useState([]);
  const [edit, setEdit] = useState({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // For refresh button
  const [search, setSearch] = useState('');

  const sellerEmail = localStorage.getItem('userEmail');
  const navigate = useNavigate();

  const fetchBooks = React.useCallback(() => {
    setRefreshing(true);
    fetch(`http://localhost:1015/book/seller/${encodeURIComponent(sellerEmail)}`)
      .then(res => res.json())
      .then(data => {
        setBooks(data);
        setRefreshing(false);
      })
      .catch(err => {
        setRefreshing(false);
        console.error(err);
      });
  }, [sellerEmail]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const handleEditChange = (id, field, value) => {
    if (!/^\d*$/.test(value)) return;
    setEdit(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const handleSaveAll = async () => {
    setLoading(true);
    try {
      const updates = Object.entries(edit);
      for (const [id, changes] of updates) {
        if (changes.price !== undefined) {
          await fetch(`http://localhost:1015/book/update-price/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: parseInt(changes.price, 10) })
          });
        }
        if (changes.stock !== undefined) {
          await fetch(`http://localhost:1015/book/update-stock/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock: parseInt(changes.stock, 10) })
          });
        }
      }
      fetchBooks();
      setEdit({});
      alert('All changes saved!');
    } catch {
      alert('Save failed');
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
    } catch {
      alert('Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const filteredBooks = books.filter(
    book =>
      book.title?.toLowerCase().includes(search.toLowerCase()) ||
      book.author?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ width: '100%', minHeight: '100vh', boxSizing: 'border-box', padding: '2rem' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
        {/* Search bar */}
        <input
          type="text"
          placeholder="Search by title or author"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: 8, width: 300, borderRadius: 4, border: '1px solid #ccc', marginLeft: 16 }}
        />
        {/* Refresh button */}
        <button
          onClick={fetchBooks}
          disabled={refreshing}
          style={{
            backgroundColor: '#43a047',
            color: 'white',
            padding: '0.5rem 1.5rem',
            border: 'none',
            borderRadius: '4px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            marginLeft: 16
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
        {/* Save All Changes button */}
        <button
          onClick={handleSaveAll}
          disabled={loading || Object.keys(edit).length === 0}
          style={{
            backgroundColor: '#43a047',
            color: 'white',
            padding: '0.5rem 1.5rem',
            border: 'none',
            borderRadius: '4px',
            cursor: loading || Object.keys(edit).length === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            marginLeft: 16
          }}
        >
          {loading ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>
      <h2>Your Books</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="styled-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Category</th>
              <th>Book Type</th>
              <th>Condition</th>
              <th>No. of Pages</th>
              <th>Price (Tk.)</th>
              <th>Update Price</th>
              <th>Stock</th>
              <th>Update Stock</th>
              <th>Created at</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBooks.map(book => (
              <tr key={book._id}>
                <td>{book.title}</td>
                <td>{book.author}</td>
                <td>{Array.isArray(book.category) ? book.category.join(', ') : (book.category || 'N/A')}</td>
                <td>{book.bookType}</td>
                <td>{book.condition}</td>
                <td>{book.pages}</td>
                <td>{book.price}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={edit[book._id]?.price ?? ''}
                    onChange={e => handleEditChange(book._id, 'price', e.target.value)}
                    style={{
                      width: 90,
                      padding: '6px 10px',
                      border: '2px solid #43a047',
                      borderRadius: 5,
                      background: '#f1fff1',
                      fontWeight: 600,
                      color: '#2e7d32'
                    }}
                    placeholder=""
                  />
                </td>
                <td>{book.stock}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={edit[book._id]?.stock ?? ''}
                    onChange={e => handleEditChange(book._id, 'stock', e.target.value)}
                    style={{
                      width: 70,
                      padding: '6px 10px',
                      border: '2px solid #43a047',
                      borderRadius: 5,
                      background: '#f1fff1',
                      fontWeight: 600,
                      color: '#2e7d32'
                    }}
                    placeholder=""
                  />
                </td>
                <td>{book.createdAt ? new Date(book.createdAt).toLocaleDateString() : ''}</td>
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
