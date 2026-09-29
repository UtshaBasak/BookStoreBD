import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

interface PagerProps {
  /** The page being shown, as the API reported it. */
  page: number;
  pageCount: number;
  pageSize: number;
  /** How many rows matched in total, not how many are on screen. */
  total: number;
  onPage: (page: number) => void;
  /** What is being counted, for the line above the buttons. */
  noun?: string;
}

/**
 * "Showing 1–25 of 307", and the two buttons.
 *
 * Every table that moved its paging to the API needs the same three numbers
 * and the same two buttons, and four copies of them would drift.
 */
export default function Pager({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  noun = 'rows',
}: PagerProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm font-medium text-ink-muted">
        {total === 0 ? `No ${noun}` : `Showing ${first}–${last} of ${total} ${noun}`}
      </span>

      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {/* Pills in the site's style. `btn-ghost` stays white when disabled,
              so the faded, arrowless look is what says "nowhere to go". */}
          <button
            type="button"
            className="btn btn-ghost px-4 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
            onClick={() => onPage(page - 1)}
            disabled={page === 1}
          >
            <FaChevronLeft aria-hidden="true" size={11} />
            Previous
          </button>
          <span className="inline-flex min-h-9 items-center rounded-full bg-brand px-3.5 text-sm font-bold whitespace-nowrap text-white shadow-[0_6px_16px_rgba(109,40,217,0.25)]">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="btn btn-ghost px-4 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
            onClick={() => onPage(page + 1)}
            disabled={page === pageCount}
          >
            Next
            <FaChevronRight aria-hidden="true" size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
