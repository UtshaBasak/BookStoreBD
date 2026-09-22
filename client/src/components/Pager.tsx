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
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 16,
      }}
    >
      <span>
        {total === 0 ? `No ${noun}` : `Showing ${first}–${last} of ${total} ${noun}`}
      </span>

      {pageCount > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page === 1}
            style={{ minHeight: 40, padding: '0 14px' }}
          >
            Previous
          </button>
          <span>
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page === pageCount}
            style={{ minHeight: 40, padding: '0 14px' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
