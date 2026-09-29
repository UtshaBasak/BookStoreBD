import { useId } from 'react';

import { site } from '../config/site.js';

interface LogoProps {
  /** Height of the mark in pixels; the wordmark scales with it. */
  size?: number;
  /** Hide the words and show the mark only, e.g. in a tight header. */
  markOnly?: boolean;
  /** White words, for a dark background. */
  inverted?: boolean;
}

/**
 * The shop's mark: an open book and a rising sun on a violet-to-sunset tile,
 * and the name with "BD" picked out in the same gradient.
 *
 * The mark is SVG, sharp at every size and free of any request; the name is
 * text, so it measures like the rest of the page and never spills over what
 * sits beside it. Everything is sized in em from one font size, which a
 * stylesheet can override through `--logo-size` - how the header shrinks it
 * on a phone. The gradient id is unique per instance: two logos on a page
 * (header and footer) with the same id would share whichever came first.
 */
export default function Logo({ size = 36, markOnly = false, inverted = false }: LogoProps) {
  const tile = `logo-tile-${useId().replace(/:/g, '')}`;
  const name = site.name.replace(/BD$/, '');

  return (
    <span
      role="img"
      aria-label={site.name}
      className="logo"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.28em',
        lineHeight: 1,
        fontSize: `var(--logo-size, ${String(size)}px)`,
      }}
    >
      <svg width="1em" height="1em" viewBox="0 0 64 64" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
        <defs>
          <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c3aed" />
            <stop offset="0.6" stopColor="#c026d3" />
            <stop offset="1" stopColor="#ff5c35" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="18" fill={`url(#${tile})`} />
        <path d="M13 21c6.5-2.2 12.5-1.6 17.5 2v24.5c-5-3.4-11-4-17.5-2z" fill="#fff" />
        <path d="M51 21c-6.5-2.2-12.5-1.6-17.5 2v24.5c5-3.4 11-4 17.5-2z" fill="#fff" opacity="0.82" />
        <circle cx="47" cy="14.5" r="4.5" fill="#facc15" />
      </svg>
      {!markOnly && (
        <span
          aria-hidden="true"
          style={{
            fontWeight: 800,
            fontSize: '0.62em',
            letterSpacing: '-0.035em',
            color: inverted ? '#fff' : '#111827',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
          <span
            style={{
              background: 'linear-gradient(90deg, #8b5cf6, #ff5c35)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            BD
          </span>
        </span>
      )}
    </span>
  );
}
