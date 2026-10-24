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
import { categoryLabel } from '../config/categories.js';
import { conditionOf } from '../utils/bookText.js';
import { digits, formatDate, t } from '../utils/language.js';

/** Rows per page. Enough to scan, few enough to draw. */
const PAGE_SIZE = 25;

// Functions, so the labels are read in the language being shown.
const TYPES = () => [
  { value: '', label: t('New and old', 'নতুন ও পুরোনো') },
  { value: 'new', label: t('New', 'নতুন') },
  { value: 'old', label: t('Old', 'পুরোনো') },
];
const STOCK = () => [
  { value: '', label: t('Any stock', 'যেকোনো স্টক') },
  { value: 'in', label: t('In stock', 'স্টকে আছে') },
  { value: 'low', label: t('Running low', 'প্রায় শেষ') },
  { value: 'out', label: t('Sold out', 'স্টক শেষ') },
];
const DEALS = () => [
  { value: '', label: t('Any price', 'যেকোনো দাম') },
  { value: 'yes', label: t('On discount', 'ছাড়ে আছে') },
  { value: 'no', label: t('Full price', 'পুরো দাম') },
];
const SORTS = () => [
  { value: 'newest', label: t('Newest first', 'নতুন আগে') },
  { value: 'oldest', label: t('Oldest first', 'পুরোনো আগে') },
  { value: 'titleAZ', label: t('Title A-Z', 'নাম অনুযায়ী (ক-ঝ)') },
  { value: 'priceLow', label: t('Price: low to high', 'দাম: কম থেকে বেশি') },
  { value: 'priceHigh', label: t('Price: high to low', 'দাম: বেশি থেকে কম') },
  { value: 'stockLow', label: t('Least stock', 'সবচেয়ে কম স্টক') },
];

/** A book type as it reads; English shows the stored value, as before. */
const bookTypeLabel = (value: string): string =>
  value === 'new' ? t(value, 'নতুন') : value === 'old' ? t(value, 'পুরোনো') : value;

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

  // Searched, filtered and paged by the API, which also returns the seller
  // names for the rows on this page, so the table never loads the whole catalogue.
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
            {t('Book List', 'বইয়ের তালিকা')}
          </h2>
          <p className="admin-lede">{t('Every listing in the shop, with the seller who owns it.', 'শপের প্রতিটি লিস্টিং, যে বিক্রেতার তা সহ।')}</p>
        </div>
        <RefreshButton onClick={() => void booksQuery.refetch()} busy={loading} />
      </header>
      <div className="admin-toolbar">
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input name="q"
            type="text"
            className="field"
            placeholder={t('Search by title, author, or seller...', 'শিরোনাম, লেখক বা বিক্রেতা দিয়ে খুঁজুন...')}
            aria-label={t('Search listings', 'লিস্টিং খুঁজুন')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // A new search starts from its first page.
              setPage(1);
            }}
          />
        </div>
        <FilterSelect name="bookType" label={t('Type', 'ধরন')} value={bookType} onChange={change(setBookType)} options={TYPES()} />
        <FilterSelect name="stock" label={t('Stock', 'স্টক')} value={stock} onChange={change(setStock)} options={STOCK()} />
        <FilterSelect name="deals" label={t('Discount', 'ছাড়')} value={deals} onChange={change(setDeals)} options={DEALS()} />
        <FilterSelect name="sort" label={t('Sort', 'সাজান')} value={sort} onChange={change(setSort)} options={SORTS()} />
      </div>

      <div className="admin-card">
        <div className="table-scroll">
          <table className="styled-table">
            <thead>
              <tr>
                <th>{t('Title', 'শিরোনাম')}</th>
                <th>{t('Author', 'লেখক')}</th>
                <th>{t('Category', 'বিভাগ')}</th>
                <th>{t('Book Type', 'বইয়ের ধরন')}</th>
                <th>{t('Condition', 'অবস্থা')}</th>
                <th>{t('No. of Pages', 'পৃষ্ঠাসংখ্যা')}</th>
                <th>{t('Price (Tk)', 'দাম (টাকা)')}</th>
                <th>{t('Stock', 'স্টক')}</th>
                <th>{t('Owner', 'মালিক')}</th>
                <th>{t('Created at', 'তৈরির তারিখ')}</th>
                <th className="admin-sticky-end">{t('Actions', 'কাজ')}</th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => (
                <tr key={book._id}>
                  <td className="admin-cell-strong" style={{ minWidth: 160 }}>{book.title}</td>
                  <td style={{ minWidth: 140 }}>{book.author}</td>
                  <td>{Array.isArray(book.category) ? book.category.map(categoryLabel).join(', ') : book.category}</td>
                  <td style={{ textTransform: 'capitalize' }}>{book.bookType ? bookTypeLabel(book.bookType) : book.bookType}</td>
                  <td style={{ textTransform: 'capitalize' }}>{conditionOf(book) || '-'}</td>
                  <td className="admin-num">{book.pages === undefined ? book.pages : digits(book.pages)}</td>
                  <td className="admin-price"><PriceTag book={book} size="sm" /></td>
                  <td>
                    {/* Sold out stands out; the number itself is unchanged. */}
                    <span
                      className={`badge admin-status ${Number(book.stock) > 0 ? 'is-good' : 'is-bad'}`}
                    >
                      {digits(book.stock)}
                    </span>
                  </td>
                  <td>{book.sellerName}</td>
                  <td className="admin-nowrap">
                    {book.createdAt ? formatDate(book.createdAt, undefined, 'en-GB') : ''}
                  </td>
                  <td className="admin-sticky-end">
                    <button
                      type="button"
                      className="btn btn-danger admin-btn-sm"
                      onClick={() => deleteBook(book._id)}
                    >
                      <FaTrashAlt aria-hidden="true" />
                      {t('Delete', 'মুছুন')}
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
            <p>
              {bookType || stock || deals
                ? t('No listing matches those filters.', 'এই ফিল্টারগুলোর সাথে কোনো লিস্টিং মেলেনি।')
                : t('No listing matches that search.', 'এই খোঁজের সাথে কোনো লিস্টিং মেলেনি।')}
            </p>
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
          noun={t('listings', 'লিস্টিং')}
        />
      </div>
    </div>
  );
}
