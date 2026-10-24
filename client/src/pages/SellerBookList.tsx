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
import { countLabel } from '../utils/compactCount.js';
import { categoryLabel } from '../config/categories.js';
import { conditionOf } from '../utils/bookText.js';
import { digits, formatDate, formatNumber, t } from '../utils/language.js';

/** A book type as it reads; English shows the stored value, as before. */
const bookTypeLabel = (value: string): string =>
  value === 'new' ? t(value, 'নতুন') : value === 'old' ? t(value, 'পুরোনো') : value;

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
    setEdit(prev => {
      // A box cleared again is no change, not a blank to send: the saved
      // value stands, rather than "1 book could not be saved".
      const changes = { ...prev[id] };
      if (value === '') delete changes[field];
      else changes[field] = value;
      const next = { ...prev };
      if (Object.keys(changes).length) next[id] = changes;
      else delete next[id];
      return next;
    });
  };

  const handleSaveAll = async () => {
    setLoading(true);
    // Each change is checked: what the server refused stays in the table to fix, rather than being reported as saved.
    const failed: Record<Id, { price?: string; stock?: string }> = {};
    try {
      for (const [id, changes] of Object.entries(edit)) {
        const kept: { price?: string; stock?: string } = {};
        if (changes.price !== undefined) {
          const res = await apiFetch(`${API_BASE_URL}/book/update-price/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: parseInt(changes.price, 10) })
          });
          if (!res.ok) kept.price = changes.price;
        }
        if (changes.stock !== undefined) {
          const res = await apiFetch(`${API_BASE_URL}/book/update-stock/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock: parseInt(changes.stock, 10) })
          });
          if (!res.ok) kept.stock = changes.stock;
        }
        if (kept.price !== undefined || kept.stock !== undefined) failed[id] = kept;
      }
      fetchBooks();
      setEdit(failed);
      const count = Object.keys(failed).length;
      if (count) {
        toast.error(
          t(
            `${count} ${count === 1 ? 'book' : 'books'} could not be saved. Check the values and try again.`,
            `${formatNumber(count)}টি বই সংরক্ষণ করা যায়নি। মানগুলো দেখে আবার চেষ্টা করুন।`
          )
        );
      } else {
        toast.success(t('All changes saved.', 'সব পরিবর্তন সংরক্ষণ হয়েছে।'));
      }
    } catch {
      toast.error(t('Could not save your changes.', 'আপনার পরিবর্তন সংরক্ষণ করা যায়নি।'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: Id) => {
    // eslint-disable-next-line no-alert -- a confirmation needs an answer; replacing it needs a dialog component
    if (!window.confirm(t('Are you sure you want to delete this book?', 'আপনি কি নিশ্চিতভাবে বইটি মুছতে চান?'))) return;
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/book/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.message || t('Could not delete the book.', 'বইটি মোছা যায়নি।'));
      } else {
        // The query owns the list; refetching keeps it the single source.
        await booksQuery.refetch();
      }
    } catch {
      toast.error(t('Could not delete the book.', 'বইটি মোছা যায়নি।'));
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
  // Column names, read when drawn so they follow the language.
  const col = {
    title: t('Title', 'শিরোনাম'),
    author: t('Author', 'লেখক'),
    category: t('Category', 'বিভাগ'),
    bookType: t('Book Type', 'বইয়ের ধরন'),
    condition: t('Condition', 'অবস্থা'),
    pages: t('No. of Pages', 'পৃষ্ঠাসংখ্যা'),
    price: t('Price (Tk.)', 'দাম (টাকা)'),
    discount: t('Discount', 'ছাড়'),
    updatePrice: t('Update Price', 'দাম বদলান'),
    stock: t('Stock', 'স্টক'),
    updateStock: t('Update Stock', 'স্টক বদলান'),
    demand: t('Demand', 'চাহিদা'),
    created: t('Created at', 'তৈরির তারিখ'),
    actions: t('Actions', 'কাজ'),
  };

  return (
    <div className="sl-page">
      <header className="sl-topbar">
        <Link to="/" className="sl-logo-link" aria-label={t(`${site.name} home`, `${site.name} হোম`)}>
          <Logo size={34} />
        </Link>
        <div className="sl-topbar-actions">
          <NotificationBell />
          <Link to="/profile?mode=seller" className="btn btn-ghost">
            {t('← Return to Profile', '← প্রোফাইলে ফিরে যান')}
          </Link>
        </div>
      </header>

      <div className="sl-wrap sl-wrap-wide">
        <section className="sl-hero">
          <div className="sl-hero-row">
            <div>
              <span className="sl-kicker">{t('📚 Seller shelf', '📚 বিক্রেতার তাক')}</span>
              <h2>{t('Your Books', 'আপনার বই')}</h2>
              <p className="sl-hero-sub">
                {t(
                  'Change a price or the stock, then save them all at once. A discount is applied straight away, and puts the book in Quick deals.',
                  'দাম বা স্টক বদলান, তারপর একসাথে সব সংরক্ষণ করুন। ছাড় সঙ্গে সঙ্গে প্রয়োগ হয়, আর বইটি চটজলদি ছাড়-এ চলে যায়।'
                )}
              </p>
            </div>
            <div className="sl-hero-stats">
              <div className="sl-stat"><b>{digits(books.length)}</b><span>{t('listed', 'তালিকাভুক্ত')}</span></div>
              <div className="sl-stat"><b>{digits(inStock)}</b><span>{t('in stock', 'স্টকে')}</span></div>
              <Link to="/add-book" className="btn btn-accent" style={{ alignSelf: 'center' }}>
                <FaPlus aria-hidden="true" /> {t('List a book', 'বই তালিকাভুক্ত করুন')}
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
              placeholder={t('Search by title or author...', 'শিরোনাম বা লেখক দিয়ে খুঁজুন...')}
              aria-label={t('Search your books', 'আপনার বই খুঁজুন')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="field"
            />
          </div>
          <div className="sl-toolbar-actions">
            <button type="button" onClick={fetchBooks} disabled={refreshing} className="btn btn-ghost">
              <FaSyncAlt aria-hidden="true" /> {refreshing ? t('Refreshing...', 'হালনাগাদ হচ্ছে...') : t('Refresh', 'হালনাগাদ করুন')}
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={loading || pendingEdits === 0}
              className="btn btn-primary"
            >
              <FaSave aria-hidden="true" /> {loading ? t('Saving...', 'সংরক্ষণ হচ্ছে...') : t('Save All Changes', 'সব পরিবর্তন সংরক্ষণ করুন')}
              {pendingEdits > 0 && !loading && (
                <span className="badge" style={{ background: '#facc15', color: '#1e1b4b' }}>{digits(pendingEdits)}</span>
              )}
            </button>
          </div>
        </div>

        {booksQuery.isPending ? (
          <div className="card sl-loading"><span className="sl-spinner" aria-hidden="true" /> {t('Loading your books...', 'আপনার বই লোড হচ্ছে...')}</div>
        ) : books.length === 0 ? (
          <div className="card sl-empty">
            <span className="sl-empty-emoji" aria-hidden="true">📦</span>
            <h3>{t('No books listed yet', 'এখনও কোনো বই তালিকাভুক্ত হয়নি')}</h3>
            <p>
              {t(
                'Your first listing takes a couple of minutes, and listing is free.',
                'প্রথম বই তালিকাভুক্ত করতে কয়েক মিনিট লাগে, আর তালিকাভুক্ত করা বিনামূল্যে।'
              )}
            </p>
            <Link to="/add-book" className="btn btn-accent">{t('List your first book', 'আপনার প্রথম বই তালিকাভুক্ত করুন')}</Link>
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="card sl-empty">
            <span className="sl-empty-emoji" aria-hidden="true">🔍</span>
            <h3>{t(`No books match “${search}”`, `“${search}”-এর সাথে কোনো বই মেলেনি`)}</h3>
            <p>{t('Try a different title or author.', 'অন্য শিরোনাম বা লেখক দিয়ে চেষ্টা করুন।')}</p>
          </div>
        ) : (
          <div className="table-scroll card sl-table-card">
            <table className="styled-table sl-table sl-stack sl-compact">
              <thead>
                <tr>
                  <th>{col.title}</th>
                  <th>{col.author}</th>
                  <th>{col.category}</th>
                  <th>{col.bookType}</th>
                  <th>{col.condition}</th>
                  <th>{col.pages}</th>
                  <th>{col.price}</th>
                  <th>{col.discount}</th>
                  <th>{col.updatePrice}</th>
                  <th>{col.stock}</th>
                  <th>{col.updateStock}</th>
                  <th>{col.demand}</th>
                  <th>{col.created}</th>
                  <th>{col.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filteredBooks.map(book => {
                  const stock = Number(book.stock);
                  return (
                    <tr key={book._id}>
                      <td data-label={col.title} className="sl-title-cell">{book.title}</td>
                      <td data-label={col.author}>{book.author}</td>
                      <td data-label={col.category}>{Array.isArray(book.category) ? book.category.map(categoryLabel).join(', ') : (book.category || t('N/A', 'প্রযোজ্য নয়'))}</td>
                      <td data-label={col.bookType}>
                        <span className={`sl-pill ${book.bookType === 'new' ? 'is-progress' : 'is-neutral'}`}>
                          {book.bookType ? bookTypeLabel(book.bookType) : book.bookType}
                        </span>
                      </td>
                      <td data-label={col.condition}>{conditionOf(book) || '-'}</td>
                      <td data-label={col.pages}>{book.pages === undefined ? book.pages : digits(book.pages)}</td>
                      <td data-label={col.price} className="sl-price">৳{digits(book.price)}</td>
                      <td data-label={col.discount}>
                        {/* Keyed on what is saved, so a saved discount resets the editor. */}
                        <DiscountEditor key={`${book.discountType ?? 'none'}-${book.discountValue ?? 0}-${book.price}`} book={book} />
                      </td>
                      <td data-label={col.updatePrice}>
                        <input name="price"
                          type="number"
                          min="0"
                          value={edit[book._id]?.price ?? ''}
                          onChange={e => handleEditChange(book._id, 'price', e.target.value)}
                          className={`sl-edit${edit[book._id]?.price ? ' is-dirty' : ''}`}
                          style={{ width: 96 }}
                          aria-label={t(`New price for ${book.title ?? 'this book'}`, `${book.title ?? 'এই বই'}-এর নতুন দাম`)}
                          placeholder=""
                        />
                      </td>
                      <td data-label={col.stock} className="sl-num">
                        <span className={`sl-pill ${stock > 0 ? 'is-done' : 'is-bad'}`}>
                          {stock > 0
                            ? digits(book.stock)
                            : t(`${book.stock} · sold out`, `${digits(book.stock)} · স্টক শেষ`)}
                        </span>
                        {(waiting[book._id] ?? 0) > 0 && (
                          <span className="sl-waiting">
                            {t(
                              `${waiting[book._id]} ${waiting[book._id] === 1 ? 'buyer' : 'buyers'} waiting`,
                              `${formatNumber(waiting[book._id])} জন ক্রেতা অপেক্ষায়`
                            )}
                          </span>
                        )}
                      </td>
                      <td data-label={col.updateStock}>
                        <input name="stock"
                          type="number"
                          min="0"
                          value={edit[book._id]?.stock ?? ''}
                          onChange={e => handleEditChange(book._id, 'stock', e.target.value)}
                          className={`sl-edit${edit[book._id]?.stock ? ' is-dirty' : ''}`}
                          style={{ width: 76 }}
                          aria-label={t(`New stock for ${book.title ?? 'this book'}`, `${book.title ?? 'এই বই'}-এর নতুন স্টক`)}
                          placeholder=""
                        />
                      </td>
                      <td data-label={col.demand} className="sl-num">
                        {/* What buyers see too: how often it is viewed and saved. */}
                        {countLabel(book.viewCount, 'view', 'views', 'বার দেখা')}
                        <br />
                        {countLabel(book.wishlistCount, 'wishlist', 'wishlists', 'জনের উইশলিস্টে')}
                      </td>
                      <td data-label={col.created} className="sl-num">{book.createdAt ? formatDate(book.createdAt) : ''}</td>
                      <td data-label={col.actions}>
                        <button
                          type="button"
                          onClick={() => handleDelete(book._id)}
                          disabled={loading}
                          className="sl-row-delete"
                        >
                          <FaTrashAlt aria-hidden="true" /> {t('Delete', 'মুছুন')}
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
