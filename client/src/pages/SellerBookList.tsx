import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { Id } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useSellerBooks } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';

export default function SellerBookList() {
  // Pending edits per book id: the raw input text, parsed on save.
  const [edit, setEdit] = useState<Record<Id, { price?: string; stock?: string }>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const sellerEmail = getUserEmail();
  const navigate = useNavigate();
  const toast = useToast();

  const booksQuery = useSellerBooks(sellerEmail);
  const books = booksQuery.data ?? [];
  const refreshing = booksQuery.isFetching;
  const fetchBooks = () => booksQuery.refetch();

  const handleEditChange = (id: Id, field: 'price' | 'stock', value: string) => {
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
          await apiFetch(`${API_BASE_URL}/book/update-price/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: parseInt(changes.price, 10) })
          });
        }
        if (changes.stock !== undefined) {
          await apiFetch(`${API_BASE_URL}/book/update-stock/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock: parseInt(changes.stock, 10) })
          });
        }
      }
      fetchBooks();
      setEdit({});
      toast.success('All changes saved.');
    } catch {
      toast.error('Could not save your changes.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: Id) => {
    // eslint-disable-next-line no-alert -- a confirmation needs an answer; replacing it needs a dialog component
    if (!window.confirm('Are you sure you want to delete this book?')) return;
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/book/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.message || 'Could not delete the book.');
      } else {
        // The query owns the list; refetching keeps it the single source.
        await booksQuery.refetch();
      }
    } catch {
      toast.error('Could not delete the book.');
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
          placeholder="Search by title or author..."
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
