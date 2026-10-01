import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaClock, FaFire, FaFolderOpen, FaMicrophone, FaPenNib, FaSearch, FaStore } from 'react-icons/fa';

import { usePopularSearches, useSuggest } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import { useToast } from '../hooks/useToast.js';
import { PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { isCloudinary, sized } from '../utils/imageUrl.js';
import { clearRecentSearches, readRecentSearches, rememberSearch } from '../utils/recentSearches.js';
import {
  listen,
  readVoiceLanguage,
  rememberVoiceLanguage,
  voiceSearchSupported,
  type Listening,
  type VoiceLanguage,
} from '../utils/voiceSearch.js';
import './SearchField.css';

type Option =
  | { kind: 'book'; key: string; to: string; title: string; detail: string; cover: string | null; price: string; soldOut: boolean }
  | { kind: 'seller'; key: string; to: string; title: string; detail: string; avatar: string | null }
  | { kind: 'author'; key: string; to: string; title: string; detail: string }
  | { kind: 'category'; key: string; to: string; title: string; detail: string }
  | { kind: 'recent'; key: string; title: string }
  | { kind: 'popular'; key: string; title: string }
  | { kind: 'all'; key: string; title: string };

/** The part of a suggestion that matches what was typed, in bold. */
const highlight = (text: string, typed: string): ReactNode => {
  const at = typed ? text.toLowerCase().indexOf(typed.toLowerCase()) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="sg-mark">{text.slice(at, at + typed.length)}</mark>
      {text.slice(at + typed.length)}
    </>
  );
};

/**
 * A search box that helps as you type, or before: recent and popular searches
 * when it is empty; then books - in Bangla or English, whichever you typed
 * in - authors, categories and sellers that match, and "search for" what you
 * typed. Tab completes the top match, and the microphone searches by voice.
 *
 * Only the input, the microphone and the list are drawn here. The box around
 * them is the page's own (`.search-bar`, `.hero-search`), so each search box
 * keeps its look; it just has to be `position: relative`.
 *
 * A combobox in the ARIA sense: arrows move through the list, Enter opens the
 * one highlighted - or searches, if none is - and Escape closes it.
 */
export default function SearchField({
  value,
  onChange,
  onSubmit,
  inputProps,
}: {
  value: string;
  onChange: (value: string) => void;
  /** A full search for the text, on the browse page. */
  onSubmit: (value: string) => void;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>(readRecentSearches);
  const settled = useDebounced(value, 200);
  const typed = value.trim();
  const { data, isFetching } = useSuggest(open ? settled : '');
  const { data: popular } = usePopularSearches(open && typed.length < 2);

  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>(readVoiceLanguage);
  const [listening, setListening] = useState(false);
  const session = useRef<Listening | null>(null);
  const canSpeak = voiceSearchSupported();
  useEffect(() => () => session.current?.stop(), []);

  const search = (text: string) => {
    rememberSearch(text);
    setRecent(readRecentSearches());
    onSubmit(text);
  };

  let options: Option[] = [];
  if (typed.length >= 2 && data) {
    options = [
      ...data.books.map(
        (book): Option => ({
          kind: 'book',
          key: `b-${book._id}`,
          to: `/book/${book._id}`,
          title: book.title,
          detail: book.author,
          cover: book.cover,
          price: `৳${book.salePrice}`,
          soldOut: !book.inStock,
        })
      ),
      ...(data.authors ?? []).map(
        (author): Option => ({
          kind: 'author',
          key: `a-${author.name}`,
          to: `/filter?search=${encodeURIComponent(author.name)}`,
          title: author.name,
          detail: `Author · ${author.books} ${author.books === 1 ? 'book' : 'books'}`,
        })
      ),
      ...(data.categories ?? []).map(
        (category): Option => ({
          kind: 'category',
          key: `c-${category.name}`,
          to: `/filter?category=${encodeURIComponent(category.name.toLowerCase())}`,
          title: category.name,
          detail: `Category · ${category.books} ${category.books === 1 ? 'book' : 'books'}`,
        })
      ),
      ...data.sellers.map(
        (seller): Option => ({
          kind: 'seller',
          key: `s-${seller.username}`,
          to: `/shop/${encodeURIComponent(seller.username)}`,
          title: seller.username,
          detail: `Seller · ${seller.books} ${seller.books === 1 ? 'book' : 'books'}`,
          avatar: seller.avatar,
        })
      ),
      { kind: 'all', key: 'all', title: typed },
    ];
  } else if (typed.length < 2) {
    const recentOptions = recent.map((term): Option => ({ kind: 'recent', key: `r-${term}`, title: term }));
    const seen = new Set(recent.map((term) => term.toLowerCase()));
    const popularOptions = (popular?.terms ?? [])
      .filter((term) => !seen.has(term.toLowerCase()))
      .slice(0, 6)
      .map((term): Option => ({ kind: 'popular', key: `p-${term}`, title: term }));
    options = [...recentOptions, ...popularOptions];
  }
  const showing = open && !listening && options.length > 0;

  // Tab completes the top title or author that begins with what was typed.
  const completion =
    typed.length >= 2
      ? options.find(
          (option) =>
            (option.kind === 'book' || option.kind === 'author') &&
            option.title.toLowerCase().startsWith(typed.toLowerCase()) &&
            option.title.length > typed.length
        )?.title
      : undefined;

  const choose = (option: Option | undefined) => {
    setOpen(false);
    setActive(-1);
    if (!option || option.kind === 'all') {
      search(value);
      return;
    }
    if (option.kind === 'recent' || option.kind === 'popular') {
      onChange(option.title);
      search(option.title);
      return;
    }
    if (option.kind === 'author' || option.kind === 'category') rememberSearch(option.title);
    navigate(option.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === 'Tab' && !event.shiftKey && completion && showing) {
      event.preventDefault();
      onChange(completion);
      setActive(-1);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(showing && active >= 0 ? options[active] : undefined);
    }
    inputProps?.onKeyDown?.(event);
  };

  const startListening = () => {
    if (listening) {
      session.current?.stop();
      return;
    }
    setOpen(false);
    const started = listen(
      voiceLanguage,
      (words, done) => {
        onChange(words);
        if (done && words) {
          session.current = null;
          setListening(false);
          search(words);
        }
      },
      (message) => toast.warning(message),
      () => {
        session.current = null;
        setListening(false);
      }
    );
    if (started) {
      session.current = started;
      setListening(true);
    }
  };

  const switchLanguage = (language: VoiceLanguage) => {
    setVoiceLanguage(language);
    rememberVoiceLanguage(language);
    // Starting again in the new language, if already listening.
    if (listening) {
      session.current?.stop();
      setTimeout(() => {
        const started = listen(
          language,
          (words, done) => {
            onChange(words);
            if (done && words) {
              session.current = null;
              setListening(false);
              search(words);
            }
          },
          (message) => toast.warning(message),
          () => {
            session.current = null;
            setListening(false);
          }
        );
        if (started) {
          session.current = started;
          setListening(true);
        }
      }, 250);
    }
  };

  const thumb = (src: string | null) => {
    if (!src) return PLACEHOLDER_IMAGE;
    return isCloudinary(src) ? sized(src, 96) : src;
  };

  const firstRecent = options.findIndex((option) => option.kind === 'recent');
  const firstPopular = options.findIndex((option) => option.kind === 'popular');

  return (
    <>
      <input
        type="search"
        autoComplete="off"
        {...inputProps}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={listId}
        aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={(event) => {
          setRecent(readRecentSearches());
          setOpen(true);
          inputProps?.onFocus?.(event);
        }}
        // A moment's grace, so a click on a suggestion lands before the list goes.
        onBlur={(event) => {
          setTimeout(() => setOpen(false), 150);
          inputProps?.onBlur?.(event);
        }}
        onKeyDown={onKeyDown}
      />
      {canSpeak && (
        <button
          type="button"
          className={`sg-mic${listening ? ' is-on' : ''}`}
          onClick={startListening}
          aria-label={listening ? 'Stop listening' : 'Search by voice'}
          aria-pressed={listening}
          title="Search by voice"
        >
          <FaMicrophone aria-hidden="true" />
        </button>
      )}

      {listening && (
        <div className="sg-panel sg-voice" role="status" aria-live="polite">
          <span className="sg-voice-pulse" aria-hidden="true">
            <FaMicrophone />
          </span>
          <div className="sg-voice-text">
            <strong>{value ? `“${value}”` : 'Listening…'}</strong>
            <span>Say a title, an author or a subject.</span>
          </div>
          <div className="sg-voice-langs" role="radiogroup" aria-label="Language">
            {(
              [
                ['en-US', 'English'],
                ['bn-BD', 'বাংলা'],
              ] as const
            ).map(([language, label]) => (
              <button
                key={language}
                type="button"
                role="radio"
                aria-checked={voiceLanguage === language}
                className={voiceLanguage === language ? 'is-on' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => switchLanguage(language)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showing && (
        <ul id={listId} role="listbox" className={`sg-panel${isFetching ? ' is-busy' : ''}`} aria-label="Suggestions">
          {options.map((option, index) => (
            <li
              key={option.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`sg-option is-${option.kind}${index === active ? ' is-active' : ''}${
                index === firstRecent || index === firstPopular ? ' starts-group' : ''
              }`}
              data-group={index === firstRecent ? 'Recent searches' : index === firstPopular ? 'Popular right now' : undefined}
              // mousedown, not click: it fires before the input's blur.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(index)}
            >
              {option.kind === 'book' && (
                <>
                  <img src={thumb(option.cover)} alt="" className="sg-cover" loading="lazy" />
                  <span className="sg-text">
                    <span className="sg-title">{highlight(option.title, typed)}</span>
                    <span className="sg-detail">{option.detail}</span>
                  </span>
                  <span className={`sg-price${option.soldOut ? ' is-out' : ''}`}>{option.soldOut ? 'Sold out' : option.price}</span>
                </>
              )}
              {(option.kind === 'author' || option.kind === 'category') && (
                <>
                  <span className="sg-all-icon" aria-hidden="true">
                    {option.kind === 'author' ? <FaPenNib /> : <FaFolderOpen />}
                  </span>
                  <span className="sg-text">
                    <span className="sg-title">{highlight(option.title, typed)}</span>
                    <span className="sg-detail">{option.detail}</span>
                  </span>
                </>
              )}
              {option.kind === 'seller' && (
                <>
                  {option.avatar ? (
                    <img src={option.avatar} alt="" className="sg-avatar" loading="lazy" />
                  ) : (
                    <span className="sg-avatar sg-avatar-letter" aria-hidden="true">
                      <FaStore />
                    </span>
                  )}
                  <span className="sg-text">
                    <span className="sg-title">{highlight(option.title, typed)}</span>
                    <span className="sg-detail">{option.detail}</span>
                  </span>
                </>
              )}
              {(option.kind === 'recent' || option.kind === 'popular') && (
                <>
                  <span className="sg-all-icon" aria-hidden="true">
                    {option.kind === 'recent' ? <FaClock /> : <FaFire />}
                  </span>
                  <span className="sg-text">
                    <span className="sg-title sg-plain">{option.title}</span>
                  </span>
                </>
              )}
              {option.kind === 'all' && (
                <>
                  <span className="sg-all-icon" aria-hidden="true">
                    <FaSearch />
                  </span>
                  <span className="sg-text">
                    <span className="sg-title">Search for “{option.title}”</span>
                  </span>
                </>
              )}
            </li>
          ))}
          {completion && (
            <li role="presentation" className="sg-hint">
              <kbd>Tab</kbd> completes “{completion}”
            </li>
          )}
          {firstRecent >= 0 && (
            <li role="presentation" className="sg-hint">
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  clearRecentSearches();
                  setRecent([]);
                }}
              >
                Clear recent searches
              </button>
            </li>
          )}
        </ul>
      )}
    </>
  );
}
