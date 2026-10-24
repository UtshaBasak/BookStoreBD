import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaCheckCircle, FaHandPaper, FaPlus, FaSearch, FaTrashAlt } from 'react-icons/fa';

import type { WantedItem } from '@shared/api.js';

import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import Pager from '../components/Pager.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { LanguageToggle } from '../components/LanguageToggle.js';
import { useCreateWanted, useRemoveWanted, useToggleWanted, useWanted } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import { useSeo } from '../hooks/useSeo.js';
import { useToast } from '../hooks/useToast.js';
import { messageOf } from '../utils/apiError.js';
import { isAdmin, isAuthenticated } from '../utils/auth.js';
import { timeAgo } from '../utils/notificationLook.js';
import { digits, pick, t } from '../utils/language.js';
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
    title: t('Wanted board', 'চাহিদার বোর্ড'),
    description: t(
      'Books readers in Bangladesh are looking for. Ask for a book nobody has listed yet, and hear the moment it is.',
      'বাংলাদেশের পাঠকেরা যে বই খুঁজছেন। কেউ এখনো তালিকাভুক্ত করেনি এমন বই চেয়ে রাখুন, তালিকায় এলেই জানতে পারবেন।'
    ),
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
      toast.warning(t('Give the title as it is printed on the book.', 'বইয়ে যেভাবে ছাপা আছে, সেভাবে শিরোনাম লিখুন।'));
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
      toast.error(messageOf(error) || t('Could not add that request.', 'অনুরোধটি যোগ করা যায়নি।'));
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="wb-page">
      <header className="header">
        <Link to="/" className="logo-button" aria-label={t('BookStoreBD home', 'BookStoreBD হোম')}>
          <Logo size={38} />
        </Link>
        <div className="user-options">
          <LanguageToggle />
          <ThemeToggle />
          {signedIn ? (
            <NotificationBell />
          ) : (
            <Link to="/sign-in" className="btn btn-primary" style={{ minHeight: 40, padding: '0 1.1rem' }}>
              {t('Sign in', 'সাইন ইন')}
            </Link>
          )}
        </div>
      </header>

      <main className="wb-main">
        <section className="wb-hero">
          <p className="wb-kicker">🎯 {t('Wanted board', 'চাহিদার বোর্ড')}</p>
          <h1>{t('Can\u2019t find a book? Ask for it.', 'বই খুঁজে পাচ্ছেন না? চেয়ে রাখুন।')}</h1>
          <p>
            {t(
              'Tell us what you are looking for. The moment anyone lists it, you hear about it, in the app and by e-mail. Selling? These are books readers already want.',
              'কী খুঁজছেন জানান। কেউ তালিকাভুক্ত করলেই অ্যাপে ও ই-মেইলে জানতে পারবেন। বিক্রি করেন? পাঠকেরা এই বইগুলোই চাইছেন।'
            )}
          </p>
        </section>

        <div className="wb-layout">
          <section className="card wb-form-card" aria-labelledby="wb-ask">
            <h2 id="wb-ask">{t('Ask for a book', 'বই চান')}</h2>
            {signedIn ? (
              <form onSubmit={ask} className="wb-form">
                <label>
                  <span>{t('Title', 'শিরোনাম')}</span>
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
                  <span>
                    {t('Author', 'লেখক')} <small>{t('(optional)', '(ঐচ্ছিক)')}</small>
                  </span>
                  <input className="field" name="author" maxLength={120} value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
                </label>
                <label>
                  <span>
                    {t('ISBN', 'আইএসবিএন')} <small>{t('(optional, for an exact edition)', '(ঐচ্ছিক, নির্দিষ্ট সংস্করণের জন্য)')}</small>
                  </span>
                  <input className="field" name="isbn" inputMode="numeric" maxLength={20} value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
                </label>
                <label>
                  <span>
                    {t('Anything else?', 'আর কিছু?')} <small>{t('(optional)', '(ঐচ্ছিক)')}</small>
                  </span>
                  <input
                    className="field"
                    name="details"
                    maxLength={300}
                    placeholder={t('Edition, language, condition...', 'সংস্করণ, ভাষা, অবস্থা...')}
                    value={form.details}
                    onChange={(e) => setForm({ ...form, details: e.target.value })}
                  />
                </label>
                <button type="submit" className="btn btn-accent" disabled={asking}>
                  <FaPlus aria-hidden="true" /> {asking ? t('Asking...', 'পাঠানো হচ্ছে...') : t('Ask for this book', 'বইটি চান')}
                </button>
                {listed && (
                  <p className="wb-listed" role="status">
                    <FaCheckCircle aria-hidden="true" />{' '}
                    {pick(
                      <>
                        Good news: <strong>{listed.title}</strong> is in the shop already.
                      </>,
                      <>
                        সুখবর: <strong>{listed.title}</strong> শপে আগে থেকেই আছে।
                      </>
                    )}{' '}
                    <Link to={`/book/${listed._id}`}>{t('See it', 'দেখুন')}</Link>
                  </p>
                )}
                <p className="wb-hint">
                  {t(
                    'If someone has asked for it already, you join their request, so each book is listed once.',
                    'কেউ আগেই চেয়ে থাকলে আপনি তাঁর অনুরোধে যুক্ত হবেন, তাই প্রতিটি বই একবারই তালিকায় থাকে।'
                  )}
                </p>
              </form>
            ) : (
              <div className="wb-signin">
                <p>
                  {t(
                    'Sign in to ask for a book. It is free, and you hear the moment it is listed.',
                    'বই চাইতে সাইন ইন করুন। এটি বিনামূল্যে, আর বইটি তালিকায় এলেই জানতে পারবেন।'
                  )}
                </p>
                <Link to="/sign-in" className="btn btn-primary">{t('Sign in', 'সাইন ইন')}</Link>
                <Link to="/sign-up" className="btn btn-ghost">{t('Create an account', 'অ্যাকাউন্ট খুলুন')}</Link>
              </div>
            )}
          </section>

          <section className="wb-list" aria-labelledby="wb-list-title">
            <h2 id="wb-list-title" className="sr-only">{t('Requests', 'অনুরোধ')}</h2>
            <div className="wb-toolbar">
              <div role="tablist" className="wb-tabs" aria-label={t('Which requests', 'কোন অনুরোধ')}>
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
                    {value === 'open' ? t('Still wanted', 'এখনো খোঁজা হচ্ছে') : t('Found', 'পাওয়া গেছে')}
                  </button>
                ))}
              </div>
              <div className="wb-search">
                <FaSearch aria-hidden="true" />
                <input
                  type="search"
                  className="field"
                  name="q"
                  aria-label={t('Search the Wanted board', 'চাহিদার বোর্ডে খুঁজুন')}
                  placeholder={t('Search requests...', 'অনুরোধ খুঁজুন...')}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <select
                className="field wb-sort"
                aria-label={t('Sort requests', 'অনুরোধ সাজান')}
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as 'popular' | 'newest');
                  setPage(1);
                }}
              >
                <option value="popular">{t('Most wanted', 'সবচেয়ে চাওয়া')}</option>
                <option value="newest">{t('Newest', 'নতুন আগে')}</option>
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
                  {t('Mine', 'আমার')}
                </button>
              )}
            </div>

            {isPending ? (
              <p className="wb-empty" role="status">{t('Loading the board…', 'বোর্ড লোড হচ্ছে…')}</p>
            ) : items.length === 0 ? (
              <div className="card wb-empty">
                <p>
                  {settled || mine
                    ? t('No request matches.', 'মেলে এমন কোনো অনুরোধ নেই।')
                    : status === 'open'
                      ? t('Nobody is waiting for a book right now. Be the first to ask!', 'এই মুহূর্তে কেউ কোনো বইয়ের অপেক্ষায় নেই। আপনিই প্রথম চেয়ে দেখুন!')
                      : t('No requests have been found yet.', 'এখনো কোনো অনুরোধের বই পাওয়া যায়নি।')}
                </p>
              </div>
            ) : (
              <ul className="wb-items">
                {items.map((item) => (
                  <li key={item._id} className="card wb-item">
                    <div
                      className="wb-count"
                      aria-label={t(
                        `${item.count} ${item.count === 1 ? 'reader wants' : 'readers want'} this`,
                        `${digits(item.count)} জন পাঠক এটি চান`
                      )}
                    >
                      <strong>{digits(item.count)}</strong>
                      <span>{t(item.count === 1 ? 'reader' : 'readers', 'জন পাঠক')}</span>
                    </div>
                    <div className="wb-book">
                      <h3>{item.title}</h3>
                      {(item.author || item.isbn) && (
                        <p className="wb-meta">
                          {item.author && t(`by ${item.author}`, `লেখক: ${item.author}`)}
                          {item.author && item.isbn && ' · '}
                          {item.isbn && t(`ISBN ${item.isbn}`, `আইএসবিএন ${item.isbn}`)}
                        </p>
                      )}
                      {item.details && <p className="wb-details">{item.details}</p>}
                      <p className="wb-when">
                        {item.status === 'found' && item.foundAt
                          ? t(`Found ${timeAgo(item.foundAt)}`, `পাওয়া গেছে ${timeAgo(item.foundAt)}`)
                          : t(`Asked ${timeAgo(item.createdAt)}`, `চাওয়া হয়েছে ${timeAgo(item.createdAt)}`)}
                      </p>
                    </div>
                    <div className="wb-actions">
                      {item.status === 'found' ? (
                        item.foundBook && (
                          <Link to={`/book/${item.foundBook._id}`} className="btn btn-primary">
                            <FaCheckCircle aria-hidden="true" /> {t('See it', 'দেখুন')}
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
                                  { onError: (error) => toast.error(messageOf(error) || t('Could not save that.', 'সংরক্ষণ করা যায়নি।')) }
                                )
                              }
                            >
                              <FaHandPaper aria-hidden="true" />{' '}
                              {item.wantedByMe ? t('You want this', 'আপনি এটি চান') : t('I want this too', 'আমিও চাই')}
                            </button>
                          ) : (
                            <Link to="/sign-in" className="btn btn-ghost">
                              {t('I want this too', 'আমিও চাই')}
                            </Link>
                          )}
                          <Link to={listLink(item)} className="btn btn-ghost">
                            {t('Have it? List it', 'আপনার কাছে আছে? তালিকাভুক্ত করুন')}
                          </Link>
                        </>
                      )}
                      {admin && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => {
                            // eslint-disable-next-line no-alert -- removing somebody's request needs a yes
                            if (window.confirm(t(`Remove "${item.title}" from the board?`, `“${item.title}” বোর্ড থেকে সরাবেন?`))) remove(item._id);
                          }}
                        >
                          <FaTrashAlt aria-hidden="true" /> {t('Remove', 'সরান')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {data && data.pageCount > 1 && (
              <div className="wb-pager">
                <Pager page={data.page} pageCount={data.pageCount} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} noun={t('requests', 'অনুরোধ')} />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
