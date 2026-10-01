import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

import './BookShelf.css';

/**
 * A titled, sideways-scrolling row: every shelf on the homepage.
 *
 * Scrolls with a finger, a trackpad, shift and the wheel, or the two arrow
 * buttons, and snaps to a card. A plain vertical wheel scrolls the page, not
 * the shelf, so a pointer resting over a shelf never traps the page scroll.
 */
export default function BookShelf({
  id,
  title,
  emoji,
  subtitle,
  seeAllTo,
  seeAllLabel = 'See all',
  children,
  variant = 'books',
}: {
  id: string;
  title: string;
  emoji?: string;
  subtitle?: string;
  seeAllTo?: string;
  seeAllLabel?: string;
  children: ReactNode;
  /** Books are card-wide; writers and category tiles are narrower. */
  variant?: 'books' | 'writers' | 'categories';
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const scroll = (direction: 1 | -1) => {
    const row = rowRef.current;
    if (row) row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section className={`shelf shelf-${variant}`} aria-labelledby={`${id}-title`}>
      <div className="shelf-head">
        <div>
          <h2 id={`${id}-title`} className="shelf-title">
            {emoji && (
              <span className="shelf-emoji" aria-hidden="true">
                {emoji}
              </span>
            )}
            {title}
          </h2>
          {subtitle && <p className="shelf-sub">{subtitle}</p>}
        </div>
        <div className="shelf-tools">
          {seeAllTo && (
            <Link to={seeAllTo} className="shelf-all">
              {seeAllLabel} <FaChevronRight aria-hidden="true" />
            </Link>
          )}
          <button type="button" className="shelf-arrow" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`}>
            <FaChevronLeft />
          </button>
          <button type="button" className="shelf-arrow" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`}>
            <FaChevronRight />
          </button>
        </div>
      </div>
      <div className="shelf-row" ref={rowRef}>
        {children}
      </div>
    </section>
  );
}

/** A shelf's placeholder while it loads, so the page does not jump when it arrives. */
export function ShelfSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="shelf-row" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="shelf-skeleton" />
      ))}
    </div>
  );
}
