import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaCheckCircle, FaHandPaper, FaPlus, FaSearch, FaTrashAlt } from 'react-icons/fa';

import type { WantedItem } from '@shared/api.js';

import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import Pager from '../components/Pager.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { useCreateWanted, useRemoveWanted, useToggleWanted, useWanted } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import { useSeo } from '../hooks/useSeo.js';
import { useToast } from '../hooks/useToast.js';
import { messageOf } from '../utils/apiError.js';
import { isAdmin, isAuthenticated } from '../utils/auth.js';
import { timeAgo } from '../utils/notificationLook.js';
import './Homepage.css';
import './WantedBoard.css';

const PAGE_SIZE = 20;
const EMPTY = { title: '', author: '', isbn: '', details: '' };

/** "Have it? List it", with the title and author already filled in. */
const listLink = (item: WantedItem): string => {
  const params = new URLSearchParams({ title: item.title, ...(item.author ? { author: item.author } : {}), ...(item.isbn ? { isbn: item.isbn } : {}) });
  return `/add-book?${params.toString()}`;
};

/**
 * Books readers want that nobody has listed yet. Ask for one, or say you want
 * one already asked for; everyone on a book hears together when it is listed.
 * Sellers see what to list next.
 */
export default function WantedBoard() {
  useSeo({
    title: 'Wanted board',
    description: 'Books readers in Bangladesh are looking for. Ask for a book nobody has listed yet, and hear the moment it is.',
  });
  const toast = useToast();
  const signedIn = isAuthenticated();
  const admin = isAdmin();

  // From an empty search: what was searched for, ready to ask for.
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ ...EMPTY, title: searchParams.get('ask') ?? '' });
  const [listed, setListed] = useState<{ _id: string; title: string } | null>(null);
  const [status, setStatus] = useState<'open' | 'found'>('open');
  const [sort, setSort] = useState<'popular' | 'newest'>('popular');
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const settled = useDebounced(search);

  const { data, isPending } = useWanted({
    search: settled || undefined,
    page,
    pageSize: PAGE_SIZE,
    filters: { status, sort, mine: mine ? '1' : undefined },
  });
  const { mutateAsync: create, isPending: asking } = useCreateWanted();
  const { mutate: toggle, isPending: toggling } = useToggleWanted();
  const { mutate: remove } = useRemoveWanted();

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    setListed(null);
    if (form.title.trim().length < 2) {
      toast.warning('Give the title as it is printed on the book.');
      return;
    }
    try {
      const answer = await create({
        title: form.title.trim(),
        author: form.author.trim() || undefined,
        isbn: form.isbn.trim() || undefined,
        details: form.details.trim() || undefined,
      });
      if (answer.result === 'listed' && answer.book) {
        setListed(answer.book);
        return;
      }
      toast.success(answer.message);
      setForm(EMPTY);
      setStatus('open');
      setPage(1);
    } catch (error) {
      toast.error(messageOf(error) || 'Could not add that request.');
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="wb-page">
      <header className="header">
        <Link to="/" className="logo-button" aria-label="BookStoreBD home">
          <Logo size={38} />
        </Link>
        <div className="user-options">
          <ThemeToggle />
          {signedIn ? (
            <NotificationBell />
          ) : (
            <Link to="/sign-in" className="btn btn-primary" style={{ minHeight: 40, padding: '0 1.1rem' }}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="wb-main">
        <section className="wb-hero">
          <p className="wb-kicker">🎯 Wanted board</p>
          <h1>Can&rsquo;t find a book? Ask for it.</h1>
          <p>
            Tell us what you are looking for. The moment anyone lists it, you hear about it, in the app and by
            e-mail. Selling? These are books readers already want.
          </p>
        </section>

        <div className="wb-layout">
          <section className="card wb-form-card" aria-labelledby="wb-ask">
            <h2 id="wb-ask">Ask for a book</h2>
            {signedIn ? (
              <form onSubmit={ask} className="wb-form">
                <label>
                  <span>Title</span>
                  <input
                    className="field"
                    name="title"
                    required
                    maxLength={200}
                    placeholder="Pather Panchali, পথের পাঁচালী..."
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </label>
                <label>
                  <span>Author <small>(optional)</small></span>
                  <input className="field" name="author" maxLength={120} value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
                </label>
                <label>
                  <span>ISBN <small>(optional, for an exact edition)</small></span>
                  <input className="field" name="isbn" inputMode="numeric" maxLength={20} value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
                </label>
                <label>
                  <span>Anything else? <small>(optional)</small></span>
                  <input
                    className="field"
                    name="details"
                    maxLength={300}
                    placeholder="Edition, language, condition..."
                    value={form.details}
                    onChange={(e) => setForm({ ...form, details: e.target.value })}
                  />
                </label>
                <button type="submit" className="btn btn-accent" disabled={asking}>
                  <FaPlus aria-hidden="true" /> {asking ? 'Asking...' : 'Ask for this book'}
                </button>
                {listed && (
                  <p className="wb-listed" role="status">
                    <FaCheckCircle aria-hidden="true" /> Good news: <strong>{listed.title}</strong> is in the shop already.{' '}
                    <Link to={`/book/${listed._id}`}>See it</Link>
                  </p>
                )}
                <p className="wb-hint">If someone has asked for it already, you join their request, so each book is listed once.</p>
              </form>
            ) : (
              <div className="wb-signin">
                <p>Sign in to ask for a book. It is free, and you hear the moment it is listed.</p>
                <Link to="/sign-in" className="btn btn-primary">Sign in</Link>
                <Link to="/sign-up" className="btn btn-ghost">Create an account</Link>
              </div>
            )}
          </section>

          <section className="wb-list" aria-labelledby="wb-list-title">
            <h2 id="wb-list-title" className="sr-only">Requests</h2>
            <div className="wb-toolbar">
              <div role="tablist" className="wb-tabs" aria-label="Which requests">
                {(['open', 'found'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={status === value}
                    onClick={() => {
                      setStatus(value);
                      setPage(1);
                    }}
                  >
                    {value === 'open' ? 'Still wanted' : 'Found'}
                  </button>
                ))}
              </div>
              <div className="wb-search">
                <FaSearch aria-hidden="true" />
                <input
                  type="search"
                  className="field"
                  name="q"
                  aria-label="Search the Wanted board"
                  placeholder="Search requests..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <select
                className="field wb-sort"
                aria-label="Sort requests"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as 'popular' | 'newest');
                  setPage(1);
                }}
              >
                <option value="popular">Most wanted</option>
                <option value="newest">Newest</option>
              </select>
              {signedIn && (
                <button
                  type="button"
                  className={`chip${mine ? ' is-on' : ''}`}
                  aria-pressed={mine}
                  onClick={() => {
                    setMine((value) => !value);
                    setPage(1);
                  }}
                >
                  Mine
                </button>
              )}
            </div>

            {isPending ? (
              <p className="wb-empty" role="status">Loading the board…</p>
            ) : items.length === 0 ? (
              <div className="card wb-empty">
                <p>
                  {settled || mine
                    ? 'No request matches.'
                    : status === 'open'
                      ? 'Nobody is waiting for a book right now. Be the first to ask!'
                      : 'No requests have been found yet.'}
                </p>
              </div>
            ) : (
              <ul className="wb-items">
                {items.map((item) => (
                  <li key={item._id} className="card wb-item">
                    <div className="wb-count" aria-label={`${item.count} ${item.count === 1 ? 'reader wants' : 'readers want'} this`}>
                      <strong>{item.count}</strong>
                      <span>{item.count === 1 ? 'reader' : 'readers'}</span>
                    </div>
                    <div className="wb-book">
                      <h3>{item.title}</h3>
                      {(item.author || item.isbn) && (
                        <p className="wb-meta">
                          {item.author && <>by {item.author}</>}
                          {item.author && item.isbn && ' · '}
                          {item.isbn && <>ISBN {item.isbn}</>}
                        </p>
                      )}
                      {item.details && <p className="wb-details">{item.details}</p>}
                      <p className="wb-when">
                        {item.status === 'found' && item.foundAt ? `Found ${timeAgo(item.foundAt)}` : `Asked ${timeAgo(item.createdAt)}`}
                      </p>
                    </div>
                    <div className="wb-actions">
                      {item.status === 'found' ? (
                        item.foundBook && (
                          <Link to={`/book/${item.foundBook._id}`} className="btn btn-primary">
                            <FaCheckCircle aria-hidden="true" /> See it
                          </Link>
                        )
                      ) : (
                        <>
                          {signedIn ? (
                            <button
                              type="button"
                              className={`btn ${item.wantedByMe ? 'btn-ghost' : 'btn-primary'}`}
                              disabled={toggling}
                              aria-pressed={item.wantedByMe}
                              onClick={() =>
                                toggle(
                                  { id: item._id, want: !item.wantedByMe },
                                  { onError: (error) => toast.error(messageOf(error) || 'Could not save that.') }
                                )
                              }
                            >
                              <FaHandPaper aria-hidden="true" /> {item.wantedByMe ? 'You want this' : 'I want this too'}
                            </button>
                          ) : (
                            <Link to="/sign-in" className="btn btn-ghost">
                              I want this too
                            </Link>
                          )}
                          <Link to={listLink(item)} className="btn btn-ghost">
                            Have it? List it
                          </Link>
                        </>
                      )}
                      {admin && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => {
                            // eslint-disable-next-line no-alert -- removing somebody's request needs a yes
                            if (window.confirm(`Remove "${item.title}" from the board?`)) remove(item._id);
                          }}
                        >
                          <FaTrashAlt aria-hidden="true" /> Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {data && data.pageCount > 1 && (
              <div className="wb-pager">
                <Pager page={data.page} pageCount={data.pageCount} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} noun="requests" />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
