import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { FaArrowDown, FaArrowUp, FaMinus } from 'react-icons/fa';

import { dayName, hourLabel } from './chartLabels.js';

/**
 * The dashboard's charts, drawn by hand in SVG and HTML rather than with a
 * charting library: a dozen shapes do not justify a hundred kilobytes, and
 * these follow the site's colour tokens, so dark mode comes free.
 *
 * Each one carries its numbers for a screen reader and on hover; none says
 * anything by colour alone.
 */

/** The width a chart has to draw in, followed as the window changes. */
const useWidth = (fallback = 640): [React.RefObject<HTMLDivElement | null>, number] => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
};

/** Round numbers for an axis: 0 and three steps up to just above the top value. */
const niceTicks = (max: number): number[] => {
  if (max <= 0) return [0, 1];
  const rough = max / 3;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * power).find((s) => s >= rough) ?? rough;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
};

export interface Point {
  /** The x-axis label: a date, already worded. */
  label: string;
  value: number;
}

/**
 * One measure over time: a line over a soft fill, with a crosshair and the
 * figure for wherever the pointer or keyboard is. One series only - two
 * measures of different size get two charts, never two axes.
 */
export function TrendChart({
  points,
  format,
  name,
  height = 240,
}: {
  points: Point[];
  format: (value: number) => string;
  /** What is measured, for the tooltip and the screen reader. */
  name: string;
  height?: number;
}) {
  const [box, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const gradient = useId();
  const pad = { top: 12, right: 12, bottom: 28, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(0, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const x = (i: number) => pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : '';
  // About six dates along the bottom, whatever the number of points.
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 90))));
  const last = points.length - 1;
  // The last date always, and the regular ones that do not crowd it.
  const labelAt = (i: number) => i === last || (i % every === 0 && last - i >= every / 2);

  const pick = (clientX: number, rect: DOMRect) => {
    if (!points.length) return;
    const ratio = (clientX - rect.left - pad.left) / Math.max(1, innerW);
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
  };
  const shown = active === null ? null : points[active];

  return (
    <div className="sa-trend" ref={box}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${name}: ${points.map((p) => `${p.label} ${format(p.value)}`).join(', ')}`}
        tabIndex={0}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
          else if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? points.length) - 1));
          else return;
          e.preventDefault();
        }}
      >
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="sa-gridline" />
            <text x={pad.left - 8} y={y(t)} className="sa-axis" textAnchor="end" dominantBaseline="middle">
              {format(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          labelAt(i) ? (
            <text key={p.label} x={x(i)} y={height - 8} className="sa-axis" textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}>
              {p.label}
            </text>
          ) : null
        )}
        <path d={area} fill={`url(#${gradient})`} />
        <path d={line} className="sa-line" />
        {shown && active !== null && (
          <g>
            <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} className="sa-crosshair" />
            <circle cx={x(active)} cy={y(shown.value)} r={5} className="sa-dot" />
          </g>
        )}
      </svg>
      {shown && active !== null && (
        <div
          className="sa-tooltip"
          role="status"
          style={{ left: Math.min(width - 150, Math.max(0, x(active) - 70)), top: Math.max(0, y(shown.value) - 64) }}
        >
          <span>{shown.label}</span>
          <strong>{format(shown.value)}</strong>
        </div>
      )}
    </div>
  );
}

export interface Bar {
  key: string;
  label: ReactNode;
  value: number;
  /** The figure written at the end of the bar; the value, formatted, by default. */
  note?: string;
}

/** A ranked list of horizontal bars, each labelled with its figure. */
export function BarList({ bars, format, empty }: { bars: Bar[]; format: (value: number) => string; empty: string }) {
  if (!bars.length) return <p className="sa-empty">{empty}</p>;
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <ul className="sa-bars">
      {bars.map((bar) => (
        <li key={bar.key} title={`${typeof bar.label === 'string' ? bar.label : bar.key}: ${bar.note ?? format(bar.value)}`}>
          <span className="sa-bar-label">{bar.label}</span>
          <span className="sa-bar-track" aria-hidden="true">
            <span className="sa-bar-fill" style={{ width: `${Math.max(2, (bar.value / max) * 100)}%` }} />
          </span>
          <span className="sa-bar-value">{bar.note ?? format(bar.value)}</span>
        </li>
      ))}
    </ul>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Orders by weekday and hour, darker for busier: one hue from pale to deep,
 * so it reads the same to everyone, and each cell names its count on hover.
 */
export function Heatmap({ grid, label }: { grid: number[][]; label: string }) {
  const [active, setActive] = useState<{ day: number; hour: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  const shown = active ? (grid[active.day]?.[active.hour] ?? 0) : null;
  const orders = (count: number) => `${count} ${count === 1 ? 'order' : 'orders'}`;
  return (
    <div className="sa-heat">
      <div className="sa-heat-grid" role="img" aria-label={label} onPointerLeave={() => setActive(null)}>
        <span />
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={`h${hour}`} className="sa-heat-hour">
            {hour % 3 === 0 ? hourLabel(hour).replace(' ', '') : ''}
          </span>
        ))}
        {grid.flatMap((row, day) => [
          <span key={`d${day}`} className="sa-heat-day">
            {DAYS[day]}
          </span>,
          ...row.map((count, hour) => (
            <span
              key={`${day}-${hour}`}
              title={`${dayName(day)} ${hourLabel(hour)}: ${orders(count)}`}
              className={`sa-heat-cell${active?.day === day && active.hour === hour ? ' is-active' : ''}`}
              style={{
                background:
                  count === 0
                    ? 'var(--color-surface-muted)'
                    : `color-mix(in oklab, var(--color-brand) ${Math.round(18 + (count / max) * 82)}%, var(--color-surface))`,
              }}
              onPointerEnter={() => setActive({ day, hour })}
            />
          )),
        ])}
      </div>
      <div className="sa-heat-foot">
        <span className="sa-heat-readout">
          {active && shown !== null ? `${dayName(active.day)}, ${hourLabel(active.hour)}: ${orders(shown)}` : 'Point at a square for its count.'}
        </span>
        <span className="sa-heat-scale" aria-hidden="true">
          Fewer
          {[18, 45, 72, 100].map((mix) => (
            <span key={mix} style={{ background: `color-mix(in oklab, var(--color-brand) ${mix}%, var(--color-surface))` }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

/** Two parts of one whole, side by side in one bar, with a legend that names both. */
export function SplitBar({
  parts,
  format,
}: {
  parts: { key: string; label: string; value: number; color: string }[];
  format: (value: number) => string;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (!total) return <p className="sa-empty">No sales in this period.</p>;
  return (
    <div>
      <div className="sa-split" aria-hidden="true">
        {parts.map((part) =>
          part.value ? <span key={part.key} style={{ flexGrow: part.value, background: part.color }} /> : null
        )}
      </div>
      <ul className="sa-legend">
        {parts.map((part) => (
          <li key={part.key}>
            <span className="sa-swatch" style={{ background: part.color }} aria-hidden="true" />
            {part.label}
            <strong>{Math.round((part.value / total) * 100)}%</strong>
            <span className="sa-muted">{format(part.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A share out of a hundred, as a thin meter with the figure beside it. */
export function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  const percent = Math.round(value * 1000) / 10;
  return (
    <div className="sa-meter">
      <div className="sa-meter-head">
        <span>{label}</span>
        <strong>{percent}%</strong>
      </div>
      <span className="sa-meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${Math.min(100, percent)}%` }} />
      </span>
      <small>{hint}</small>
    </div>
  );
}

/** The change from the window before, as an arrow, a word and a figure: up, down or level. */
export function Change({ value, previous }: { value: number; previous: number | null }) {
  if (previous === null) return null;
  if (previous === 0) {
    return value > 0 ? (
      <span className="sa-change is-up">
        <FaArrowUp aria-hidden="true" /> Up from none the period before
      </span>
    ) : (
      <span className="sa-change">
        <FaMinus aria-hidden="true" /> No change
      </span>
    );
  }
  const change = Math.round(((value - previous) / previous) * 100);
  if (change === 0) {
    return (
      <span className="sa-change">
        <FaMinus aria-hidden="true" /> Level with the period before
      </span>
    );
  }
  return (
    <span className={`sa-change ${change > 0 ? 'is-up' : 'is-down'}`}>
      {change > 0 ? <FaArrowUp aria-hidden="true" /> : <FaArrowDown aria-hidden="true" />}
      {change > 0 ? 'Up' : 'Down'} {Math.abs(change)}% on the period before
    </span>
  );
}
