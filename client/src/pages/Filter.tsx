import { useState, useMemo } from 'react';
import {
  FaSearch,
  FaHeart,
  FaShoppingBag,
  FaSlidersH,
  FaChevronDown,
  FaChevronUp,
} from 'react-icons/fa';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Homepage.css';
import './Filter.css';

import type { BookType, CatalogueParams, CatalogueSort } from '@shared/api.js';

import {
  useCart,
  useCatalogue,
  useToggleCart,
  useToggleWishlist,
  useWishlist,
} from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import { promptSignIn, useToast } from '../hooks/useToast.js';
import { useSeo } from '../hooks/useSeo.js';
import { getUserEmail } from '../utils/auth.js';
import { flagsFor } from '../utils/bookFlags.js';
import { Stars } from '../components/Stars.js';
import BookCard from '../components/BookCard.js';
import { CATEGORY_GROUPS } from '../config/categories.js';
import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';

interface FilterState {
  bookType: string;
  condition: string;
  category: string[];
  /** A floor, not a match: 4 means "four stars and up". 0 is off. */
  rating: number;
}

/** The parts of the page state an edit may override, keyed by the URL it belongs to. */
interface FilterEdits {
  searchInput?: string;
  searchTerm?: string;
  inStockOnly?: boolean;
  dealsOnly?: boolean;
  filters?: FilterState;
  page?: number;
}

/**
 * Books per page.
 *
 * The page used to render every match at once - fine at six books, and a
 * screenful of base64 covers to decode at six hundred. Twenty to start with;
 * the shopper can ask for up to fifty, which is as many as the API sends.
 */
const PAGE_SIZES = [20, 30, 40, 50] as const;
const PAGE_SIZE_KEY = 'browsePageSize';

/** The page size last chosen on this device, or twenty. */
const storedPageSize = (): number => {
  try {
    const saved = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return (PAGE_SIZES as readonly number[]).includes(saved) ? saved : PAGE_SIZES[0];
  } catch {
    return PAGE_SIZES[0];
  }
};

const capitalise = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/** The orders the catalogue offers, and what each is called. */
const SORTS: readonly { value: CatalogueSort; label: string }[] = [
  { value: 'relevant', label: 'Relevant - deals first' },
  { value: 'dealPercent', label: 'Deals - biggest % off' },
  { value: 'dealAmount', label: 'Deals - biggest ৳ saving' },
  { value: 'newest', label: 'Newest first' },
  { value: 'rated', label: 'Highest rated' },
  { value: 'priceLowHigh', label: 'Price - Low to High' },
  { value: 'priceHighLow', label: 'Price - High to Low' },
];
const isSort = (value: string | null): value is CatalogueSort => SORTS.some((sort) => sort.value === value);

export default function BookFilter() {
  const location = useLocation();
  // The price range, the order and the deals switch can arrive in the address
  // - the homepage's "Under ৳300" and "Quick deals" link straight here.
  const [priceFilter, setPriceFilter] = useState(() => {
    const params = new URLSearchParams(location.search);
    return { from: params.get('minPrice') ?? '', to: params.get('maxPrice') ?? '' };
  });
  /**
   * The filter panel is fourteen category buttons deep. Beside the results on a
   * desktop that is fine; above them on a phone it means scrolling past all of
   * it to reach a single book, so it starts closed on small screens.
   */
  const [showFilters, setShowFilters] = useState(false);
  const [pageSize, setPageSizeState] = useState(storedPageSize);
  // What is typed into "Go to page", until it is used.
  const [pageDraft, setPageDraft] = useState('');

  // Relevant by default: the deals first, then the newest.
  const [sortOption, setSortOption] = useState<CatalogueSort>(() => {
    const wanted = new URLSearchParams(location.search).get('sort');
    return isSort(wanted) ? wanted : 'relevant';
  });
  const userEmail = getUserEmail();
  const signedIn = Boolean(userEmail);
  const navigate = useNavigate();
  const toast = useToast();

  /**
   * The URL is the source of truth for the search and filters, so they are
   * derived during render rather than copied into state by an effect.
   *
   * Edits made on the page are kept as an override tagged with the URL they
   * belong to, so navigating to a new search resets them without any effect
   * having to run.
   */
  const fromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const query = params.get('search') || '';
    const bookType = params.get('bookType') || '';
    const category = params.get('category') || '';
    return {
      searchInput: query,
      searchTerm: query,
      inStockOnly: params.get('inStock') === '1',
      dealsOnly: params.get('deals') === '1',
      filters: {
        bookType: bookType ? bookType.toLowerCase() : '',
        condition: '',
        category: category ? [category.toLowerCase()] : [],
        rating: 0,
      },
    };
  }, [location.search]);

  const [edits, setEdits] = useState<{ key: string | null; value: FilterEdits }>({
    key: null,
    value: {},
  });
  const active: FilterEdits = edits.key === location.search ? edits.value : {};
  const update = (patch: FilterEdits) =>
    setEdits((prev) => ({
      key: location.search,
      value: {
        ...(prev.key === location.search ? prev.value : {}),
        // Any change other than turning a page starts again from the first
        // one: page 4 of a search nobody is running any more is a dead end.
        ...(Object.keys(patch).some((field) => field !== 'page') ? { page: 1 } : {}),
        ...patch,
      },
    }));

  const searchInput = active.searchInput ?? fromUrl.searchInput;
  const searchTerm = active.searchTerm ?? fromUrl.searchTerm;

  useSeo({
    title: searchTerm ? `\u201c${searchTerm}\u201d` : 'Browse books',
    description: searchTerm
      ? `Books matching \u201c${searchTerm}\u201d - new and second-hand, from sellers across Bangladesh.`
      : 'Browse every book on sale: new and second-hand, filtered by category, condition and price.',
  });
  const inStockOnly = active.inStockOnly ?? fromUrl.inStockOnly;
  const dealsOnly = active.dealsOnly ?? fromUrl.dealsOnly;
  const filters = active.filters ?? fromUrl.filters;

  /** How many filters are on, for the collapsed panel's label. */
  const activeFilterCount =
    (filters.bookType ? 1 : 0) +
    (filters.condition ? 1 : 0) +
    filters.category.length +
    (filters.rating > 0 ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    (dealsOnly ? 1 : 0) +
    (priceFilter.from || priceFilter.to ? 1 : 0);

  const page = active.page ?? 1;
  const setPage = (value: number) => {
    update({ page: value });
    // The pager is at the bottom of the results. Without this, pressing Next
    // leaves you looking at the pager with a fresh page of books above you.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setSearchInput = (value: string) => update({ searchInput: value });
  const setSearchTerm = (value: string) => update({ searchTerm: value });
  const setInStockOnly = (value: boolean | ((prev: boolean) => boolean)) =>
    update({ inStockOnly: typeof value === 'function' ? value(inStockOnly) : value });
  const setFilters = (value: FilterState | ((prev: FilterState) => FilterState)) =>
    update({ filters: typeof value === 'function' ? value(filters) : value });

  // Only the ids are needed for the toggle buttons, so each response is mapped
  // into a lookup as it arrives. Shared with every other page asking for them.
  const { data: wishlist = {} } = useWishlist({ enabled: signedIn, select: flagsFor });
  const { data: cart = {} } = useCart({ enabled: signedIn, select: flagsFor });

  // Both mutations invalidate their query, so the icons follow the cache.
  const { mutate: toggleWishlistMutation } = useToggleWishlist();
  const { mutate: toggleCartMutation } = useToggleCart();

  /*
   * What to ask the API for.
   *
   * All of this used to happen in the browser, over every listing in the
   * database: the page downloaded the whole catalogue and then filtered,
   * sorted and sliced it. That is fine at six books and a growing tax on every
   * visitor with each one added. It is a query now, against indexes, and the
   * answer is the twelve books on screen.
   */
  const settledPrice = useDebounced(priceFilter);
  const amount = (value: string): number | undefined => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };

  const params: CatalogueParams = {
    search: searchTerm || undefined,
    bookType: (filters.bookType || undefined) as BookType | undefined,
    condition: filters.condition || undefined,
    category: filters.category.length ? filters.category : undefined,
    minPrice: amount(settledPrice.from),
    maxPrice: amount(settledPrice.to),
    rating: filters.rating || undefined,
    inStock: inStockOnly || undefined,
    deals: dealsOnly || undefined,
    sort: sortOption,
    page,
    pageSize,
  };

  const { data: catalogue, isFetching } = useCatalogue(params);

  const booksOnThisPage = catalogue?.items ?? [];
  const total = catalogue?.total ?? 0;
  const pageCount = catalogue?.pageCount ?? 1;
  // The API clamps the page it answers for, so `?page=99` on a search with two
  // pages still shows something rather than an empty grid.
  const currentPage = catalogue?.page ?? page;
  const firstOnPage = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastOnPage = Math.min(currentPage * pageSize, total);

  const setPageSize = (value: number) => {
    setPageSizeState(value);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(value));
    } catch {
      // Private browsing: it lasts for this visit only.
    }
    update({ page: 1 });
  };

  const goToTypedPage = () => {
    const wanted = Math.round(Number(pageDraft));
    setPageDraft('');
    if (!Number.isFinite(wanted) || wanted < 1) return;
    const target = Math.min(wanted, pageCount);
    if (target !== currentPage) setPage(target);
  };

  const handleSearch = () => {
    setSearchTerm(searchInput);
    navigate(`/filter?search=${encodeURIComponent(searchInput.trim())}`);
  };

  // Toggle radio: click to select/unselect (except category)
  const handleRadioToggle = (filterKey: 'bookType' | 'condition', value: string) => {
    setFilters((prev) => ({
      ...prev,
      [filterKey]: prev[filterKey] === value ? '' : value
    }));
  };

  // Toggle for category (multi-select)
  const handleCategoryToggle = (cat: string) => {
    setFilters((prev) => {
      const arr = prev.category.includes(cat)
        ? prev.category.filter((c) => c !== cat)
        : [...prev.category, cat];
      return { ...prev, category: arr };
    });
  };

  // Wishlist toggle
  const handleToggleWishlist = (bookId: string) => {
    if (!userEmail) {
      promptSignIn(toast, () => navigate('/sign-in'), 'wishlist');
      return;
    }
    toggleWishlistMutation({ bookId, inWishlist: Boolean(wishlist[bookId]) });
  };

  // Cart toggle
  const handleToggleCart = (bookId: string) => {
    if (!userEmail) {
      promptSignIn(toast, () => navigate('/sign-in'), 'cart');
      return;
    }
    toggleCartMutation({ bookId, inCart: Boolean(cart[bookId]) });
  };

  /** One pill in the panel. `aria-pressed` says out loud which ones are on. */
  const chipClass = (on: boolean) => `chip${on ? ' is-on' : ''}`;

  return (
    // Layout in Tailwind classes and Filter.css from here down, rather than
    // in inline style objects: a media query is the one thing an inline style
    // cannot express, and this page was 682px wider than a phone because of it.
    <div className="browse">
      {/* The site's own header, as on the homepage: the logo, the search and
          the way home. The page used to sit on a photograph of a library. */}
      <header className="header">
        <div className="logo">
          <Link to="/" className="logo-button">
            <Logo size={38} />
          </Link>
        </div>

        <div className="search-bar" role="search">
          <FaSearch className="search-icon" aria-hidden="true" />
          <input
            type="search"
            id="catalogue-search"
            name="search"
            aria-label="Search books or authors"
            placeholder="Search books or authors..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
          />
          <button type="button" onClick={handleSearch} aria-label="Search">
            Search
          </button>
        </div>

        <div className="user-options">
          <NotificationBell />
          <Link to="/wishlist"
            className="icon-button"
            style={{ color: '#ff5c35' }}
            title="Wishlist"
            aria-label="Wishlist"
          >
            <FaHeart />
          </Link>
          <Link to="/cart" className="icon-link" style={{ color: '#6d28d9' }} title="Cart" aria-label="Cart">
            <FaShoppingBag />
          </Link>
          {!signedIn && (
            <Link to="/sign-in" className="btn btn-primary" style={{ minHeight: 40, padding: '0 1.1rem' }}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* One column on a phone, sidebar beside the results from `lg` up. */}
      <main className="browse-main">
        {/* Opens the panel below, and says how many filters are on so that a
            collapsed panel cannot hide the reason a search looks empty. */}
        <button
          type="button"
          className="filter-toggle"
          onClick={() => setShowFilters((open) => !open)}
          aria-expanded={showFilters}
          aria-controls="filter-panel"
        >
          <span className="inline-flex items-center gap-2">
            <FaSlidersH aria-hidden="true" style={{ color: '#6d28d9' }} />
            <span>
              Filters
              {activeFilterCount > 0 ? ` · ${activeFilterCount} on` : ''}
            </span>
          </span>
          <span aria-hidden="true" style={{ color: '#6d28d9' }}>
            {showFilters ? <FaChevronUp /> : <FaChevronDown />}
          </span>
        </button>

        {/* Filter Section */}
        <aside
          id="filter-panel"
          // Full width above the results on a phone; a sticky 280px column
          // beside them on a desktop, where there is room for one.
          className={`${showFilters ? 'flex' : 'hidden'} card filter-panel z-30 lg:flex`}
          aria-label="Filters"
        >
          {/* Deals: books a seller has discounted. */}
          <div className="filter-group">
            <h2>Deals</h2>
            <div className="filter-chips">
              <button
                type="button"
                className={`${chipClass(dealsOnly)} chip-deals`}
                aria-pressed={dealsOnly}
                onClick={() => update({ dealsOnly: !dealsOnly })}
              >
                <span aria-hidden="true">⚡</span>
                Quick deals only
              </button>
            </div>
          </div>
          {/* Book Type */}
          <div className="filter-group">
            <h2>Book Type</h2>
            <div className="filter-chips">
              {['old', 'new'].map((type) => (
                <button
                  key={type}
                  type="button"
                  className={chipClass(filters.bookType === type)}
                  aria-pressed={filters.bookType === type}
                  onClick={() => handleRadioToggle('bookType', type)}
                >
                  {/* Hidden from the name of the button, which stays "OLD". */}
                  <span aria-hidden="true">{type === 'old' ? '♻️' : '✨'}</span>
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {/* Condition (only for old) */}
          {filters.bookType === 'old' && (
            <div className="filter-group">
              <h2>Condition</h2>
              <div className="filter-chips">
                {['mint', 'very good', 'good', 'fair', 'poor'].map((cond) => (
                  <button
                    key={cond}
                    type="button"
                    className={chipClass(filters.condition === cond)}
                    aria-pressed={filters.condition === cond}
                    onClick={() => handleRadioToggle('condition', cond)}
                  >
                    {capitalise(cond)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Category (multi-select), a group at a time. A group opens by
              itself when one of its categories is on, so a filter cannot be
              hidden inside a closed group. */}
          <div className="filter-group">
            <h2>Category</h2>
            {CATEGORY_GROUPS.map((group) => {
              const onHere = group.items.filter((cat) => filters.category.includes(cat.toLowerCase())).length;
              return (
                <details key={group.name} className="filter-cat-group" open={onHere > 0 || undefined}>
                  <summary>
                    <span aria-hidden="true">{group.emoji}</span> {group.name}
                    {onHere > 0 && <span className="filter-cat-count">{onHere}</span>}
                  </summary>
                  <div className="filter-chips">
                    {group.items.map((cat) => {
                      const catKey = cat.toLowerCase();
                      const selected = filters.category.includes(catKey);
                      return (
                        <button
                          key={cat}
                          type="button"
                          className={chipClass(selected)}
                          aria-pressed={selected}
                          onClick={() => handleCategoryToggle(catKey)}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
          {/* Price Range */}
          <div className="filter-group">
            <h2>Price (Taka)</h2>
            <div className="price-fields">
              <input
                type="number"
                id="price-from"
                name="minPrice"
                aria-label="Lowest price in Taka"
                placeholder="From"
                className="field"
                inputMode="numeric"
                value={priceFilter.from}
                onChange={(e) => {
                  const value = e.target.value;
                  setPriceFilter((prev) => ({ ...prev, from: value }));
                  update({ page: 1 });
                }}
              />
              <span aria-hidden="true">–</span>
              <input
                type="number"
                id="price-to"
                name="maxPrice"
                aria-label="Highest price in Taka"
                placeholder="To"
                className="field"
                inputMode="numeric"
                value={priceFilter.to}
                onChange={(e) => {
                  const value = e.target.value;
                  setPriceFilter((prev) => ({ ...prev, to: value }));
                  update({ page: 1 });
                }}
              />
            </div>
          </div>
          {/* Rating */}
          <div className="filter-group">
            <h2>Rating</h2>
            <div className="filter-chips">
              {[5, 4, 3, 2, 1].map((floor) => (
                <button
                  key={floor}
                  type="button"
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, rating: prev.rating === floor ? 0 : floor }))
                  }
                  aria-pressed={filters.rating === floor}
                  className={chipClass(filters.rating === floor)}
                >
                  {/* A white backing keeps the orange stars legible on the
                      violet of a chosen chip. */}
                  <span
                    className="inline-flex rounded-full px-1.5 py-0.5"
                    style={{ background: filters.rating === floor ? '#fff' : 'transparent' }}
                  >
                    <Stars value={floor} size={13} />
                  </span>
                  <span className="sr-only">{floor} star{floor === 1 ? '' : 's'}</span>
                  {floor < 5 && <span>&amp; up</span>}
                </button>
              ))}
            </div>
          </div>

          {/* In Stock Toggle */}
          <div className="filter-group">
            <h2>Stock</h2>
            <div className="filter-chips">
              <button
                type="button"
                className={chipClass(inStockOnly)}
                aria-pressed={inStockOnly}
                onClick={() => {
                  setInStockOnly(v => {
                    const next = !v;
                    // Update URL param
                    const params = new URLSearchParams(location.search);
                    if (next) params.set('inStock', '1');
                    else params.delete('inStock');
                    navigate(`/filter?${params.toString()}`);
                    return next;
                  });
                }}
              >
                In Stock Only
              </button>
            </div>
          </div>
        </aside>

        {/* Right Side: Results. `min-width: 0` in Filter.css: without it a
            flex child refuses to shrink below the width of its content, which
            is how a grid of book cards pushed the page sideways. */}
        <section className="results" aria-label="Results">
          <div className="results-bar">
            <div className="min-w-0">
              <h1>{searchTerm ? `Results for “${searchTerm}”` : 'Browse books'}</h1>
              <p className="results-count">
                {catalogue ? `${total} ${total === 1 ? 'book' : 'books'}` : 'Finding books…'}
              </p>
            </div>
            {/* Sort Dropdown */}
            <select
              id="catalogue-sort"
              name="sort"
              aria-label="Sort books"
              className="field sort-field"
              value={sortOption}
              onChange={(e) => {
                setSortOption(e.target.value as CatalogueSort);
                // Page 3 of an order nobody is using any more is a dead end.
                update({ page: 1 });
              }}
              title="Sort books"
            >
              {SORTS.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </select>
          </div>

          {/* Book List: two to a row on a phone, as many as fit above that. */}
          <div
            className="results-grid"
            style={{
              // The previous page stays on screen while the next one is
              // fetched, dimmed rather than replaced by an empty grid.
              opacity: isFetching && catalogue ? 0.6 : 1,
            }}
            aria-busy={isFetching}
          >
            {!catalogue && isFetching ? (
              // The first load: the shape of the grid, rather than "nothing
              // found" - which is what the empty answer used to say meanwhile.
              Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="book-card animate-pulse" aria-hidden="true">
                  <div className="book-image rounded-[14px]" style={{ background: '#f3efff' }} />
                  <div className="mb-2 h-4 w-4/5 rounded-full" style={{ background: '#ece8f7' }} />
                  <div className="mb-3 h-3 w-1/2 rounded-full" style={{ background: '#f3efff' }} />
                  <div className="h-10 rounded-full" style={{ background: '#f3efff' }} />
                </div>
              ))
            ) : total === 0 ? (
              <div className="empty-results">
                <p style={{ fontSize: 34, marginBottom: 6 }} aria-hidden="true">🔎</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>No book or author found</p>
                <p style={{ marginTop: 6 }}>Try a shorter search, or turn a filter or two off.</p>
              </div>
            ) : (
              booksOnThisPage.map((book) => (
                <BookCard
                  key={book._id}
                  book={book}
                  // The heart is shown signed out too, where it asks to sign in.
                  signedIn
                  inWishlist={Boolean(wishlist[book._id])}
                  inCart={Boolean(cart[book._id])}
                  onToggleWishlist={handleToggleWishlist}
                  onToggleCart={handleToggleCart}
                />
              ))
            )}
          </div>

          {/* Paging. Below the results, because that is where somebody is when
              they have run out of them. */}
          {total > 0 && (
            <div className="pager">
              <div className="flex flex-wrap items-center gap-3">
                <p className="m-0 text-sm" style={{ color: '#6b7280' }}>
                  Showing {firstOnPage}&ndash;{lastOnPage} of {total}
                </p>
                <label className="pager-size">
                  <span>Per page</span>
                  <select
                    name="pageSize"
                    className="field"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {pageCount > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="btn btn-ghost"
                  >
                    Previous
                  </button>

                  <span className="px-1 text-sm font-semibold" style={{ color: '#374151' }}>
                    Page {currentPage} of {pageCount}
                  </span>

                  <button
                    type="button"
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage === pageCount}
                    className="btn btn-ghost"
                  >
                    Next
                  </button>

                  <form
                    className="pager-jump"
                    onSubmit={(e) => {
                      e.preventDefault();
                      goToTypedPage();
                    }}
                  >
                    <label htmlFor="go-to-page" className="sr-only">
                      Go to page (1 to {pageCount})
                    </label>
                    <input
                      id="go-to-page"
                      name="goToPage"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={pageCount}
                      placeholder="Page"
                      className="field"
                      value={pageDraft}
                      onChange={(e) => setPageDraft(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary" disabled={!pageDraft}>
                      Go
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
