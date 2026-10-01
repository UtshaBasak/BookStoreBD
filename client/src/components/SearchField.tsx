import { useId, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSearch, FaStore } from 'react-icons/fa';

import { useSuggest } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import { PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { isCloudinary, sized } from '../utils/imageUrl.js';
import './SearchField.css';

type Option =
  | { kind: 'book'; key: string; to: string; title: string; detail: string; cover: string | null; price: string; soldOut: boolean }
  | { kind: 'seller'; key: string; to: string; title: string; detail: string; avatar: string | null }
  | { kind: 'all'; key: string; title: string };

/**
 * A search box that suggests as you type: a few books - in Bangla or English,
 * whichever you typed in - the sellers whose name matches, and "search for"
 * what you typed.
 *
 * Only the input and its list are drawn here. The box around them is the
 * page's own (`.search-bar`, `.hero-search`), so each search box keeps its
 * look; it just has to be `position: relative`.
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
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const settled = useDebounced(value, 200);
  const { data, isFetching } = useSuggest(open ? settled : '');

  const typed = value.trim();
  const options: Option[] =
    typed.length >= 2 && data
      ? [
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
        ]
      : [];
  const showing = open && options.length > 0;

  const choose = (option: Option | undefined) => {
    setOpen(false);
    setActive(-1);
    if (!option || option.kind === 'all') {
      onSubmit(value);
      return;
    }
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
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(showing && active >= 0 ? options[active] : undefined);
    }
    inputProps?.onKeyDown?.(event);
  };

  const thumb = (src: string | null) => {
    if (!src) return PLACEHOLDER_IMAGE;
    return isCloudinary(src) ? sized(src, 96) : src;
  };

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
      {showing && (
        <ul id={listId} role="listbox" className={`sg-panel${isFetching ? ' is-busy' : ''}`} aria-label="Suggestions">
          {options.map((option, index) => (
            <li
              key={option.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`sg-option is-${option.kind}${index === active ? ' is-active' : ''}`}
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
                    <span className="sg-title">{option.title}</span>
                    <span className="sg-detail">{option.detail}</span>
                  </span>
                  <span className={`sg-price${option.soldOut ? ' is-out' : ''}`}>{option.soldOut ? 'Sold out' : option.price}</span>
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
                    <span className="sg-title">{option.title}</span>
                    <span className="sg-detail">{option.detail}</span>
                  </span>
                </>
              )}
              {option.kind === 'all' && (
                <>
                  <span className="sg-all-icon" aria-hidden="true">
                    <FaSearch />
                  </span>
                  <span className="sg-text">
                    <span className="sg-title">
                      Search for “{option.title}”
                    </span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
