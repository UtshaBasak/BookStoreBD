import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Id } from '@shared/api.js';

import { useBooks, useUsers, keys, apiRequest } from '../hooks/queries.js';

export default function BookList() {
  const [search, setSearch] = useState('');

  const booksQuery = useBooks();
  const books = booksQuery.data ?? [];

  // Shaped into an email -> display name map by the query, so the component
  // only ever sees the form it renders.
  const { data: users = {} } = useUsers({
    select: (list) =>
      Object.fromEntries(
        // `username` is the field on the record; `name` never existed, so this
        // column silently showed the e-mail address for everyone.
        (Array.isArray(list) ? list : []).map((u) => [u.email, u.username || u.email])
      ),
  });

  const loading = booksQuery.isFetching;
  const fetchData = () => booksQuery.refetch();

  const client = useQueryClient();
  const { mutate: deleteBook } = useMutation({
    mutationFn: (id: Id) => apiRequest(`/book/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.books }),
  });

  // Filter books by search query (title or author)
  const filteredBooks = books.filter(book => {
  const searchLower = search.toLowerCase();
  const sellerName = users[book.sellerEmail]?.toLowerCase() || '';
  const sellerEmail = book.sellerEmail?.toLowerCase() || '';
  return (
    book.title?.toLowerCase().includes(searchLower) ||
    book.author?.toLowerCase().includes(searchLower) ||
    sellerName.includes(searchLower) ||
    sellerEmail.includes(searchLower)
  );
});

  return (
    <div style={{ width: '100%', minHeight: '100vh', boxSizing: 'border-box', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Book List</h2>
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
          placeholder="Search by title, author, or seller..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: 8, width: 300, borderRadius: 4, border: '1px solid #ccc' }}
        />
      </div>

        <div className="table-scroll">
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
                <td>{book.createdAt ? new Date(book.createdAt).toLocaleDateString('en-GB') : ''}</td>
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
