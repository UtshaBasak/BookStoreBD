import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FaBook, FaSearch, FaTrashAlt } from 'react-icons/fa';

import type { Id } from '@shared/api.js';

import './AdminPanel.css';
import { useAdminBooks, apiRequest } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import PriceTag from '../components/PriceTag.js';
import Pager from '../components/Pager.js';
import { FilterSelect, RefreshButton } from './admin/AdminControls.js';

/** Rows per page. Enough to scan, few enough to draw. */
const PAGE_SIZE = 25;

const TYPES = [
  { value: '', label: 'New and old' },
  { value: 'new', label: 'New' },
  { value: 'old', label: 'Old' },
];
const STOCK = [
  { value: '', label: 'Any stock' },
  { value: 'in', label: 'In stock' },
  { value: 'low', label: 'Running low' },
  { value: 'out', label: 'Sold out' },
];
const DEALS = [
  { value: '', label: 'Any price' },
  { value: 'yes', label: 'On discount' },
  { value: 'no', label: 'Full price' },
];
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'titleAZ', label: 'Title A-Z' },
  { value: 'priceLow', label: 'Price: low to high' },
  { value: 'priceHigh', label: 'Price: high to low' },
  { value: 'stockLow', label: 'Least stock' },
];

export default function BookList() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [bookType, setBookType] = useState('');
  const [stock, setStock] = useState('');
  const [deals, setDeals] = useState('');
  const [sort, setSort] = useState('newest');
  // Any change but the page starts again from the first one.
  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };

  /*
   * This table used to fetch every listing in the database and every user
   * account - two unbounded requests to draw twenty-five rows - and then
   * search what it had in the browser. Both are the API's job now, and the
   * seller names that come back are the ones on this page.
   */
  const settledSearch = useDebounced(search);
  const booksQuery = useAdminBooks({
    search: settledSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
    filters: { bookType, stock, deals, sort },
  });

  const books = booksQuery.data?.items ?? [];
  const total = booksQuery.data?.total ?? 0;
  const pageCount = booksQuery.data?.pageCount ?? 1;
  const currentPage = booksQuery.data?.page ?? page;

  const loading = booksQuery.isFetching;

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
          <p className="admin-lede">Every listing in the shop, with the seller who owns it.</p>
        </div>
        <RefreshButton onClick={() => void booksQuery.refetch()} busy={loading} />
      </header>
      {/* Search input */}
      <div className="admin-toolbar">
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input name="q"
            type="text"
            className="field"
            placeholder="Search by title, author, or seller..."
            aria-label="Search listings"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // Page 4 of a search nobody is running any more is a dead end.
              setPage(1);
            }}
          />
        </div>
        <FilterSelect name="bookType" label="Type" value={bookType} onChange={change(setBookType)} options={TYPES} />
        <FilterSelect name="stock" label="Stock" value={stock} onChange={change(setStock)} options={STOCK} />
        <FilterSelect name="deals" label="Discount" value={deals} onChange={change(setDeals)} options={DEALS} />
        <FilterSelect name="sort" label="Sort" value={sort} onChange={change(setSort)} options={SORTS} />
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
            <p>{bookType || stock || deals ? 'No listing matches those filters.' : 'No listing matches that search.'}</p>
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
