import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus, FaSave, FaSearch, FaSyncAlt, FaTrashAlt } from 'react-icons/fa';

import type { Id } from '@shared/api.js';

import './Seller.css';
import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import DiscountEditor from '../components/DiscountEditor.js';
import { API_BASE_URL, apiFetch } from '../config/api.js';
import { site } from '../config/site.js';
import { useMyBookRequests, useSellerBooks } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';

export default function SellerBookList() {
  // Pending edits per book id: the raw input text, parsed on save.
  const [edit, setEdit] = useState<Record<Id, { price?: string; stock?: string }>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const sellerEmail = getUserEmail();
  const toast = useToast();

  const booksQuery = useSellerBooks(sellerEmail);
  // How many buyers asked for each sold-out book: worth restocking first.
  const waitingQuery = useMyBookRequests(Boolean(sellerEmail));
  const waiting = waitingQuery.data ?? {};
  const books = booksQuery.data ?? [];
  const refreshing = booksQuery.isFetching;
  // A restock closes the requests for it, so the waiting counts are read again too.
  const fetchBooks = () => {
    void booksQuery.refetch();
    void waitingQuery.refetch();
  };

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

  const pendingEdits = Object.keys(edit).length;
  const inStock = books.filter(book => Number(book.stock) > 0).length;

  return (
    <div className="sl-page">
      <header className="sl-topbar">
        <Link to="/" className="sl-logo-link" aria-label={`${site.name} home`}>
          <Logo size={34} />
        </Link>
        <div className="sl-topbar-actions">
          <NotificationBell />
          <Link to="/profile?mode=seller" className="btn btn-ghost">
            ← Return to Profile
          </Link>
        </div>
      </header>

      <div className="sl-wrap sl-wrap-wide">
        <section className="sl-hero">
          <div className="sl-hero-row">
            <div>
              <span className="sl-kicker">📚 Seller shelf</span>
              <h2>Your Books</h2>
              <p className="sl-hero-sub">
                Change a price or the stock, then save them all at once. A discount is applied straight away, and puts the book in Quick deals.
              </p>
            </div>
            <div className="sl-hero-stats">
              <div className="sl-stat"><b>{books.length}</b><span>listed</span></div>
              <div className="sl-stat"><b>{inStock}</b><span>in stock</span></div>
              <Link to="/add-book" className="btn btn-accent" style={{ alignSelf: 'center' }}>
                <FaPlus aria-hidden="true" /> List a book
              </Link>
            </div>
          </div>
        </section>

        {/* Wraps on a narrow screen, so the search and the buttons always fit. */}
        <div className="sl-toolbar">
          <div className="sl-search">
            <FaSearch aria-hidden="true" />
            <input name="q"
              type="text"
              placeholder="Search by title or author..."
              aria-label="Search your books"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="field"
            />
          </div>
          <div className="sl-toolbar-actions">
            <button type="button" onClick={fetchBooks} disabled={refreshing} className="btn btn-ghost">
              <FaSyncAlt aria-hidden="true" /> {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={loading || pendingEdits === 0}
              className="btn btn-primary"
            >
              <FaSave aria-hidden="true" /> {loading ? 'Saving...' : 'Save All Changes'}
              {pendingEdits > 0 && !loading && (
                <span className="badge" style={{ background: '#facc15', color: '#1e1b4b' }}>{pendingEdits}</span>
              )}
            </button>
          </div>
        </div>

        {booksQuery.isPending ? (
          <div className="card sl-loading"><span className="sl-spinner" aria-hidden="true" /> Loading your books...</div>
        ) : books.length === 0 ? (
          <div className="card sl-empty">
            <span className="sl-empty-emoji" aria-hidden="true">📦</span>
            <h3>No books listed yet</h3>
            <p>Your first listing takes a couple of minutes, and listing is free.</p>
            <Link to="/add-book" className="btn btn-accent">List your first book</Link>
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="card sl-empty">
            <span className="sl-empty-emoji" aria-hidden="true">🔍</span>
            <h3>No books match “{search}”</h3>
            <p>Try a different title or author.</p>
          </div>
        ) : (
          <div className="table-scroll card sl-table-card">
            <table className="styled-table sl-table sl-stack sl-compact">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Category</th>
                  <th>Book Type</th>
                  <th>Condition</th>
                  <th>No. of Pages</th>
                  <th>Price (Tk.)</th>
                  <th>Discount</th>
                  <th>Update Price</th>
                  <th>Stock</th>
                  <th>Update Stock</th>
                  <th>Created at</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBooks.map(book => {
                  const stock = Number(book.stock);
                  return (
                    <tr key={book._id}>
                      <td data-label="Title" className="sl-title-cell">{book.title}</td>
                      <td data-label="Author">{book.author}</td>
                      <td data-label="Category">{Array.isArray(book.category) ? book.category.join(', ') : (book.category || 'N/A')}</td>
                      <td data-label="Book Type">
                        <span className={`sl-pill ${book.bookType === 'new' ? 'is-progress' : 'is-neutral'}`}>
                          {book.bookType}
                        </span>
                      </td>
                      <td data-label="Condition">{book.condition}</td>
                      <td data-label="No. of Pages">{book.pages}</td>
                      <td data-label="Price (Tk.)" className="sl-price">৳{book.price}</td>
                      <td data-label="Discount">
                        {/* Keyed on what is saved, so a saved discount resets the editor. */}
                        <DiscountEditor key={`${book.discountType ?? 'none'}-${book.discountValue ?? 0}-${book.price}`} book={book} />
                      </td>
                      <td data-label="Update Price">
                        <input name="price"
                          type="number"
                          min="0"
                          value={edit[book._id]?.price ?? ''}
                          onChange={e => handleEditChange(book._id, 'price', e.target.value)}
                          className={`sl-edit${edit[book._id]?.price ? ' is-dirty' : ''}`}
                          style={{ width: 96 }}
                          aria-label={`New price for ${book.title ?? 'this book'}`}
                          placeholder=""
                        />
                      </td>
                      <td data-label="Stock" className="sl-num">
                        <span className={`sl-pill ${stock > 0 ? 'is-done' : 'is-bad'}`}>
                          {stock > 0 ? book.stock : `${book.stock} · sold out`}
                        </span>
                        {(waiting[book._id] ?? 0) > 0 && (
                          <span className="sl-waiting">
                            {waiting[book._id]} {waiting[book._id] === 1 ? 'buyer' : 'buyers'} waiting
                          </span>
                        )}
                      </td>
                      <td data-label="Update Stock">
                        <input name="stock"
                          type="number"
                          min="0"
                          value={edit[book._id]?.stock ?? ''}
                          onChange={e => handleEditChange(book._id, 'stock', e.target.value)}
                          className={`sl-edit${edit[book._id]?.stock ? ' is-dirty' : ''}`}
                          style={{ width: 76 }}
                          aria-label={`New stock for ${book.title ?? 'this book'}`}
                          placeholder=""
                        />
                      </td>
                      <td data-label="Created at" className="sl-num">{book.createdAt ? new Date(book.createdAt).toLocaleDateString() : ''}</td>
                      <td data-label="Actions">
                        <button
                          type="button"
                          onClick={() => handleDelete(book._id)}
                          disabled={loading}
                          className="sl-row-delete"
                        >
                          <FaTrashAlt aria-hidden="true" /> Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
