import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FaBook, FaSearch, FaSyncAlt, FaTrashAlt } from 'react-icons/fa';

import type { Id } from '@shared/api.js';

import './AdminPanel.css';
import { useAdminBooks, apiRequest } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import PriceTag from '../components/PriceTag.js';
import Pager from '../components/Pager.js';

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
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h2 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaBook />
            </span>
            Book List
          </h2>
          <p className="admin-lede">Every listing in the shop, newest first, with the seller who owns it.</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost admin-btn-sm"
          onClick={fetchData}
          disabled={loading}
        >
          <FaSyncAlt aria-hidden="true" className={loading ? 'admin-spin' : undefined} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>
      {/* Search input */}
      <div className="admin-toolbar">
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input name="q"
            type="text"
            className="field"
            placeholder="Search by title, author, or seller..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // Page 4 of a search nobody is running any more is a dead end.
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="admin-card">
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
                <th className="admin-sticky-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => (
                <tr key={book._id}>
                  <td className="admin-cell-strong" style={{ minWidth: 160 }}>{book.title}</td>
                  <td style={{ minWidth: 140 }}>{book.author}</td>
                  <td>{Array.isArray(book.category) ? book.category.join(', ') : book.category}</td>
                  <td style={{ textTransform: 'capitalize' }}>{book.bookType}</td>
                  <td style={{ textTransform: 'capitalize' }}>{book.condition}</td>
                  <td className="admin-num">{book.pages}</td>
                  <td className="admin-price"><PriceTag book={book} size="sm" /></td>
                  <td>
                    {/* Sold out stands out; the number itself is unchanged. */}
                    <span
                      className={`badge admin-status ${Number(book.stock) > 0 ? 'is-good' : 'is-bad'}`}
                    >
                      {book.stock}
                    </span>
                  </td>
                  <td>{book.sellerName}</td>
                  <td className="admin-nowrap">
                    {book.createdAt ? new Date(book.createdAt).toLocaleDateString('en-GB') : ''}
                  </td>
                  <td className="admin-sticky-end">
                    <button
                      type="button"
                      className="btn btn-danger admin-btn-sm"
                      onClick={() => deleteBook(book._id)}
                    >
                      <FaTrashAlt aria-hidden="true" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {books.length === 0 && !loading && (
          <div className="admin-empty">
            <span className="admin-empty-mark" aria-hidden="true">
              📚
            </span>
            <p>No listing matches that search.</p>
          </div>
        )}
      </div>

      <div className="admin-pager">
        <Pager
          page={currentPage}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
          noun="listings"
        />
      </div>
    </div>
  );
}
