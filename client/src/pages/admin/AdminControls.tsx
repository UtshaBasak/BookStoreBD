import { FaSyncAlt } from 'react-icons/fa';

import type { ReviewKind } from '../../hooks/queries.js';

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * One filter or sort on an admin page's toolbar: a compact select with a
 * name for screen readers. Every admin list uses the same one, so the six
 * pages read alike.
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  name,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly FilterOption[];
  name: string;
}) {
  return (
    <label className="admin-filter">
      <span className="admin-filter-label">{label}</span>
      <select name={name} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Book reviews or seller ratings, on the two review pages. */
export function ReviewKindTabs({ kind, onChange }: { kind: ReviewKind; onChange: (kind: ReviewKind) => void }) {
  const tabs: readonly { value: ReviewKind; label: string }[] = [
    { value: 'book', label: 'Book reviews' },
    { value: 'seller', label: 'Seller ratings' },
  ];
  return (
    <div role="tablist" aria-label="Which reviews" className="admin-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={kind === tab.value}
          onClick={() => onChange(tab.value)}
          className="admin-tab"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Refetches the page's list; spins while it does. */
export function RefreshButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button type="button" className="btn btn-ghost admin-btn-sm" onClick={onClick} disabled={busy}>
      <FaSyncAlt aria-hidden="true" className={busy ? 'admin-spin' : undefined} />
      {busy ? 'Refreshing...' : 'Refresh'}
    </button>
  );
}
