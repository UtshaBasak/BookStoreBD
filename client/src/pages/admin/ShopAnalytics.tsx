import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FaBook,
  FaBoxOpen,
  FaChartLine,
  FaCoins,
  FaEye,
  FaHeart,
  FaLightbulb,
  FaReceipt,
  FaSearch,
  FaShoppingBag,
  FaStore,
  FaUserPlus,
  FaUsers,
} from 'react-icons/fa';
import type { IconType } from 'react-icons';

import type { AnalyticsKpi, AnalyticsPoint, AnalyticsRange, ShopAnalytics as Stats } from '@shared/api.js';

import { useShopAnalytics } from '../../hooks/queries.js';
import { messageOf } from '../../utils/apiError.js';
import { taka } from '../../utils/pricing.js';
import { BarList, Change, Heatmap, Meter, SplitBar, TrendChart } from './charts.js';
import { dayName, hourLabel } from './chartLabels.js';
import '../AdminPanel.css';
import './ShopAnalytics.css';

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '12 months' },
  { value: 'all', label: 'All time' },
];

type Measure = 'revenue' | 'orders' | 'signups' | 'listings';
const MEASURES: { value: Measure; label: string }[] = [
  { value: 'revenue', label: 'Sales' },
  { value: 'orders', label: 'Orders' },
  { value: 'signups', label: 'New members' },
  { value: 'listings', label: 'New listings' },
];

const count = (n: number): string => Math.round(n).toLocaleString('en-IN');
const money = (n: number): string => taka(Math.round(n));
/** Fees are small figures, so they keep their paisa. */
const fee = (n: number): string => `৳${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "24 Sep" for a day or a week's first day, "Sep 2026" for a month. */
const pointLabel = (date: string): string => {
  const [year, month, day] = date.split('-').map(Number);
  const at = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return day
    ? at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    : at.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

function Tile({
  icon: Icon,
  label,
  kpi,
  format,
  note,
}: {
  icon: IconType;
  label: string;
  kpi: AnalyticsKpi;
  format: (n: number) => string;
  note?: string;
}) {
  return (
    <div className="sa-tile">
      <span className="sa-tile-label">
        <Icon aria-hidden="true" /> {label}
      </span>
      <strong className="sa-tile-value">{format(kpi.value)}</strong>
      <Change value={kpi.value} previous={kpi.previous} />
      {note && <small className="sa-muted">{note}</small>}
    </div>
  );
}

function Card({ title, icon: Icon, children, wide, action }: { title: string; icon?: IconType; children: React.ReactNode; wide?: boolean; action?: React.ReactNode }) {
  return (
    <section className={`sa-card${wide ? ' is-wide' : ''}`} aria-label={title}>
      <header className="sa-card-head">
        <h3>
          {Icon && <Icon aria-hidden="true" />} {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

/** What the figures say, in sentences, for a quick read before the charts. */
const insightsOf = (stats: Stats): string[] => {
  const lines: string[] = [];
  const cells = stats.busyHours.flatMap((row, day) => row.map((orders, hour) => ({ day, hour, orders })));
  const busiest = cells.reduce((best, cell) => (cell.orders > best.orders ? cell : best), { day: 0, hour: 0, orders: 0 });
  if (busiest.orders > 0) {
    const days = stats.busyHours.map((row) => row.reduce((a, b) => a + b, 0));
    const bestDay = days.indexOf(Math.max(...days));
    lines.push(
      `${dayName(bestDay)} is the busiest day, and the busiest hour is ${dayName(busiest.day)} at ${hourLabel(busiest.hour)}: a good time for a deal or an announcement.`
    );
  }
  const [top] = stats.categories;
  if (top) lines.push(`${top.name} sells the most: ${money(top.revenue)} from ${count(top.copies)} ${top.copies === 1 ? 'copy' : 'copies'}.`);
  const [unmet] = stats.searches.unmet;
  if (unmet) {
    lines.push(
      `${stats.searches.unmet.length === 1 ? 'One search' : `${stats.searches.unmet.length} searches`} found nothing, “${unmet.term}” most often. Sellers with those books would find buyers waiting.`
    );
  }
  const [wanted] = stats.wanted.top;
  if (wanted && wanted.requesterCount > 1) {
    lines.push(`${wanted.requesterCount} readers are waiting for “${wanted.title}” on the Wanted board.`);
  }
  if (stats.kpis.feesPending > 0) {
    lines.push(`${fee(stats.kpis.feesPending)} more in fees arrives as the books now on their way are delivered.`);
  }
  if (stats.rates.cancelled >= 0.15) {
    lines.push(`${Math.round(stats.rates.cancelled * 100)}% of books ordered were cancelled. Worth a look at why.`);
  }
  if (!lines.length) lines.push('Nothing to report yet. Insights appear here as orders and searches come in.');
  return lines;
};

/** The colours for new and second-hand: two fixed hues that tell apart for everyone, named in the legend. */
const TYPE_COLOURS = { new: 'var(--color-chart-1)', old: 'var(--color-chart-2)' };

export default function ShopAnalytics() {
  const [params, setParams] = useSearchParams();
  const range = (RANGES.find((r) => r.value === params.get('range'))?.value ?? '30d');
  const [measure, setMeasure] = useState<Measure>('revenue');
  const { data: stats, isPending, isError, error, isFetching } = useShopAnalytics(range);

  const measureLabel = MEASURES.find((m) => m.value === measure)?.label ?? '';
  const formatMeasure = measure === 'revenue' ? money : count;
  const points = (stats?.series ?? []).map((point: AnalyticsPoint) => ({
    label: pointLabel(point.date),
    value: point[measure],
  }));

  return (
    <div className="admin-page sa-page">
      <header className="admin-page-head">
        <div>
          <h2 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaChartLine />
            </span>
            Shop analytics
          </h2>
          <p className="admin-lede">
            Sales, fees, what sells and when. Sales are book totals without delivery; times are Dhaka time.
          </p>
        </div>
        <div className="sa-ranges" role="radiogroup" aria-label="Period">
          {RANGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={range === value}
              className={`sa-range${range === value ? ' is-on' : ''}`}
              onClick={() => setParams(value === '30d' ? {} : { range: value }, { replace: true })}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {isPending ? (
        <p className="sa-empty" role="status">
          Adding up the figures…
        </p>
      ) : isError || !stats ? (
        <p className="sa-empty" role="alert">
          Could not load the analytics: {messageOf(error)}
        </p>
      ) : (
        <div className={`sa-body${isFetching ? ' is-refreshing' : ''}`} aria-busy={isFetching}>
          <div className="sa-tiles">
            <Tile icon={FaCoins} label="Sales" kpi={stats.kpis.revenue} format={money} />
            <Tile icon={FaReceipt} label="Orders" kpi={stats.kpis.orders} format={count} />
            <Tile icon={FaShoppingBag} label="Average order" kpi={stats.kpis.averageOrder} format={money} />
            <Tile
              icon={FaStore}
              label={`Fees earned (${stats.feePercent}%)`}
              kpi={stats.kpis.feesEarned}
              format={fee}
              note={stats.kpis.feesPending ? `${fee(stats.kpis.feesPending)} more on books still on their way` : undefined}
            />
            <Tile icon={FaBook} label="Copies sold" kpi={stats.kpis.copiesSold} format={count} />
            <Tile icon={FaUserPlus} label="New members" kpi={stats.kpis.newUsers} format={count} />
            <Tile icon={FaBoxOpen} label="New listings" kpi={stats.kpis.newListings} format={count} />
            <div className="sa-tile">
              <span className="sa-tile-label">
                <FaUsers aria-hidden="true" /> Members today
              </span>
              <strong className="sa-tile-value">{count(stats.people.buyers + stats.people.sellers)}</strong>
              <small className="sa-muted">
                {count(stats.people.sellers)} set up to sell, {count(stats.people.buyers)} buying only
              </small>
            </div>
          </div>

          <div className="sa-grid">
            <Card
              title={`${measureLabel} over time`}
              icon={FaChartLine}
              wide
              action={
                <div className="sa-ranges is-small" role="radiogroup" aria-label="Measure">
                  {MEASURES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={measure === value}
                      className={`sa-range${measure === value ? ' is-on' : ''}`}
                      onClick={() => setMeasure(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            >
              <TrendChart points={points} format={formatMeasure} name={measureLabel} />
              <details className="sa-details">
                <summary>Show the numbers</summary>
                <div className="sa-table-wrap">
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th scope="col">{stats.bucket === 'day' ? 'Day' : stats.bucket === 'week' ? 'Week from' : 'Month'}</th>
                        <th scope="col">Sales</th>
                        <th scope="col">Orders</th>
                        <th scope="col">New members</th>
                        <th scope="col">New listings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.series.map((point) => (
                        <tr key={point.date}>
                          <th scope="row">{pointLabel(point.date)}</th>
                          <td>{money(point.revenue)}</td>
                          <td>{count(point.orders)}</td>
                          <td>{count(point.signups)}</td>
                          <td>{count(point.listings)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </Card>

            <Card title="Busy hours" icon={FaReceipt} wide>
              <Heatmap
                grid={stats.busyHours}
                label={`Orders by day and hour, Dhaka time. ${insightsOf(stats)[0] ?? ''}`}
              />
            </Card>

            <Card title="Worth knowing" icon={FaLightbulb}>
              <ul className="sa-insights">
                {insightsOf(stats).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card>

            <Card title="Popular categories">
              <BarList
                empty="No sales in this period."
                format={money}
                bars={stats.categories.map((c) => ({ key: c.name, label: c.name, value: c.revenue, note: `${money(c.revenue)} · ${count(c.copies)} sold` }))}
              />
            </Card>

            <Card title="New or second-hand">
              <SplitBar
                format={money}
                parts={[
                  { key: 'new', label: 'New', value: stats.bookTypes.find((t) => t.type === 'new')?.revenue ?? 0, color: TYPE_COLOURS.new },
                  { key: 'old', label: 'Second-hand', value: stats.bookTypes.find((t) => t.type === 'old')?.revenue ?? 0, color: TYPE_COLOURS.old },
                ]}
              />
              <div className="sa-meters">
                <Meter label="Cancelled" value={stats.rates.cancelled} hint="Of the books ordered in this period." />
                <Meter label="Returned" value={stats.rates.returned} hint="Of the books delivered." />
                <Meter label="Used a promo code" value={stats.rates.promo} hint="Of the orders placed." />
              </div>
            </Card>

            <Card title="Where orders are going">
              <BarList
                empty="No orders in this period."
                format={count}
                bars={stats.regions.map((r) => ({ key: r.division, label: r.division, value: r.orders }))}
              />
            </Card>

            <Card title="Order status">
              <BarList
                empty="No orders in this period."
                format={count}
                bars={stats.statuses.map((s) => ({ key: s.status, label: s.status, value: s.count }))}
              />
            </Card>

            <Card title="Best-selling books" icon={FaBook}>
              <BarList
                empty="No sales in this period."
                format={count}
                bars={stats.topBooks.map((b) => ({
                  key: b.id,
                  label: (
                    <Link to={`/book/${b.id}`} title={b.author ? `${b.title}, by ${b.author}` : b.title}>
                      {b.title}
                    </Link>
                  ),
                  value: b.copies,
                  note: `${count(b.copies)} sold`,
                }))}
              />
            </Card>

            <Card title="Top sellers" icon={FaStore}>
              <BarList
                empty="No sales in this period."
                format={money}
                bars={stats.topSellers.map((s) => ({
                  key: s.email,
                  label: <span title={s.email}>{s.username || s.email}</span>,
                  value: s.revenue,
                  note: `${money(s.revenue)} · ${count(s.orders)} ${s.orders === 1 ? 'order' : 'orders'}`,
                }))}
              />
            </Card>

            <Card title="What people search for" icon={FaSearch}>
              <p className="sa-muted sa-card-note">{count(stats.searches.total)} searches in this period.</p>
              <BarList
                empty="No searches in this period."
                format={count}
                bars={stats.searches.top.map((s) => ({ key: s.term, label: s.term, value: s.count }))}
              />
            </Card>

            <Card title="Searches that found nothing" icon={FaSearch}>
              <p className="sa-muted sa-card-note">Books people want that nobody is selling: worth telling sellers about.</p>
              <BarList
                empty="Every search found something."
                format={count}
                bars={stats.searches.unmet.map((s) => ({ key: s.term, label: s.term, value: s.count }))}
              />
            </Card>

            <Card title="Wanted board" icon={FaHeart} action={<Link to="/wanted" className="sa-link">Open the board</Link>}>
              <p className="sa-muted sa-card-note">
                {count(stats.wanted.open)} open {stats.wanted.open === 1 ? 'request' : 'requests'};{' '}
                {count(stats.wanted.foundInRange)} found a seller in this period.
              </p>
              <BarList
                empty="Nobody is waiting for a book."
                format={count}
                bars={stats.wanted.top.map((w) => ({
                  key: w.id,
                  label: w.author ? `${w.title} (${w.author})` : w.title,
                  value: w.requesterCount,
                  note: `${count(w.requesterCount)} waiting`,
                }))}
              />
            </Card>

            <Card title="The catalogue today" icon={FaEye} wide>
              <div className="sa-mini-tiles">
                <div>
                  <span>Listings</span>
                  <strong>{count(stats.catalogue.listings)}</strong>
                </div>
                <div>
                  <span>In stock</span>
                  <strong>{count(stats.catalogue.inStock)}</strong>
                </div>
                <div>
                  <span>Book views</span>
                  <strong>{count(stats.catalogue.views)}</strong>
                </div>
                <div>
                  <span>On wishlists</span>
                  <strong>{count(stats.catalogue.wishlists)}</strong>
                </div>
              </div>
              <h4 className="sa-subhead">Most viewed</h4>
              <BarList
                empty="No views yet."
                format={count}
                bars={stats.catalogue.mostViewed.map((b) => ({
                  key: b.id,
                  label: <Link to={`/book/${b.id}`}>{b.title}</Link>,
                  value: b.viewCount,
                  note: `${count(b.viewCount)} views · ${count(b.wishlistCount)} on wishlists`,
                }))}
              />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

/** The last 30 days in four figures, at the top of the admin home. */
export function AnalyticsGlance() {
  const { data: stats } = useShopAnalytics('30d');
  if (!stats) return null;
  return (
    <section className="sa-glance" aria-labelledby="sa-glance-title">
      <div className="sa-glance-head">
        <h2 id="sa-glance-title">The last 30 days</h2>
        <Link to="/admin/analytics" className="sa-link">
          All the analytics
        </Link>
      </div>
      <div className="sa-tiles">
        <Tile icon={FaCoins} label="Sales" kpi={stats.kpis.revenue} format={money} />
        <Tile icon={FaReceipt} label="Orders" kpi={stats.kpis.orders} format={count} />
        <Tile icon={FaStore} label="Fees earned" kpi={stats.kpis.feesEarned} format={fee} />
        <Tile icon={FaUserPlus} label="New members" kpi={stats.kpis.newUsers} format={count} />
      </div>
    </section>
  );
}
