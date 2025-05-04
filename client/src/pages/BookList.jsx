import React, { useState, useEffect } from 'react';

export default function BookList() {
  const [books, setBooks] = useState([]);
  const [users, setUsers] = useState({}); // Map: email -> user name
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false); // For refresh button

  // Fetch books and users
  const fetchData = () => {
    setLoading(true);
    fetch('http://localhost:1015/book')
      .then((res) => res.json())
      .then((data) => setBooks(data))
      .catch((err) => console.error(err));
    fetch('http://localhost:1015/user')
      .then(res => res.json())
      .then(data => {
        const map = {};
        (Array.isArray(data) ? data : []).forEach(u => {
          map[u.email] = u.name || u.email;
        });
        setUsers(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const deleteBook = (id) => {
    fetch(`http://localhost:1015/book/${id}`, { method: 'DELETE' })
      .then(() => setBooks(books.filter((book) => book._id !== id)))
      .catch((err) => console.error('Error deleting book:', err));
  };

  // Filter books by search query (title, author, or owner)
  const filteredBooks = books.filter(
    book =>
      (book.title?.toLowerCase().includes(search.toLowerCase()) ||
      book.author?.toLowerCase().includes(search.toLowerCase()) ||
      (users[book.sellerEmail]?.toLowerCase().includes(search.toLowerCase()) ||
        (book.sellerEmail || '').toLowerCase().includes(search.toLowerCase())))
  );

  return (
    <div style={{ width: '100%', minHeight: '100vh', boxSizing: 'border-box', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1>Book List</h1>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            backgroundColor: '#43a047',
            color: 'white',
            padding: '0.5rem 1.5rem',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {/* Search input */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by title, author or owner"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: 8, width: 300, borderRadius: 4, border: '1px solid #ccc' }}
        />
      </div>
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
              <th>Price (Tk)</th>
              <th>Stock</th>
              <th>Owner</th>
              <th>Created at</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBooks.map((book) => (
              <tr key={book._id}>
                <td>{book.title}</td>
                <td>{book.author}</td>
                <td>{Array.isArray(book.category) ? book.category.join(', ') : book.category}</td>
                <td>{book.bookType}</td>
                <td>{book.condition}</td>
                <td>{book.pages}</td>
                <td>{book.price}</td>
                <td>{book.stock}</td>
                <td>{users[book.sellerEmail] || book.sellerEmail}</td>
                <td>{book.createdAt ? new Date(book.createdAt).toLocaleDateString() : ''}</td>
                <td>
                  <button onClick={() => deleteBook(book._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}