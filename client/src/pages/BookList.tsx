import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Id } from '@shared/api.js';

import { useAdminBooks, apiRequest } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';

/** Rows per page. Enough to scan, few enough to draw. */
const PAGE_SIZE = 25;

export default function BookList() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  /*
   * This table used to fetch every listing in the database and every user
   * account - two unbounded requests to draw twenty-five rows - and then
   * search what it had in the browser. Both are the API's job now, and the
   * seller names that come back are the ones on this page.
   */
  const settledSearch = useDebounced(search);
  const booksQuery = useAdminBooks({ search: settledSearch || undefined, page, pageSize: PAGE_SIZE });

  const books = booksQuery.data?.items ?? [];
  const total = booksQuery.data?.total ?? 0;
  const pageCount = booksQuery.data?.pageCount ?? 1;
  const currentPage = booksQuery.data?.page ?? page;

  const loading = booksQuery.isFetching;
  const fetchData = () => booksQuery.refetch();

  const client = useQueryClient();
  const { mutate: deleteBook } = useMutation({
    mutationFn: (id: Id) => apiRequest(`/book/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['catalogue'] }),
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
          onChange={(e) => {
            setSearch(e.target.value);
            // Page 4 of a search nobody is running any more is a dead end.
            setPage(1);
          }}
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
            {books.map((book) => (
              <tr key={book._id}>
                <td>{book.title}</td>
                <td>{book.author}</td>
                <td>{Array.isArray(book.category) ? book.category.join(', ') : book.category}</td>
                <td>{book.bookType}</td>
                <td>{book.condition}</td>
                <td>{book.pages}</td>
                <td>{book.price}</td>
                <td>{book.stock}</td>
                <td>{book.sellerName}</td>
                <td>{book.createdAt ? new Date(book.createdAt).toLocaleDateString('en-GB') : ''}</td>
                <td>
                  <button onClick={() => deleteBook(book._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

      {books.length === 0 && !loading && (
        <p style={{ marginTop: 16 }}>No listing matches that search.</p>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 16,
        }}
      >
        <span>
          {total === 0
            ? 'No listings'
            : `Showing ${String((currentPage - 1) * PAGE_SIZE + 1)}–${String(
                Math.min(currentPage * PAGE_SIZE, total)
              )} of ${String(total)}`}
        </span>

        {pageCount > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
              style={{ minHeight: 40, padding: '0 14px' }}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === pageCount}
              style={{ minHeight: 40, padding: '0 14px' }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
