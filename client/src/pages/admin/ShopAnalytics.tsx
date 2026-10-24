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
  FaSyncAlt,
  FaUserPlus,
  FaUsers,
} from 'react-icons/fa';
import type { IconType } from 'react-icons';

import type { AnalyticsKpi, AnalyticsPoint, AnalyticsRange, ShopAnalytics as Stats } from '@shared/api.js';

import { useShopAnalytics } from '../../hooks/queries.js';
import { messageOf } from '../../utils/apiError.js';
import { formatDate, formatNumber, formatTime, t } from '../../utils/language.js';
import { statusLabel } from '../../utils/orderStatus.js';
import { taka } from '../../utils/pricing.js';
import { BarList, Change, Heatmap, Meter, SplitBar, TrendChart } from './charts.js';
import { dayName, hourLabel } from './chartLabels.js';
import '../AdminPanel.css';
import './ShopAnalytics.css';

const RANGES: { value: AnalyticsRange; label: () => string }[] = [
  { value: '7d', label: () => t('7 days', '৭ দিন') },
  { value: '30d', label: () => t('30 days', '৩০ দিন') },
  { value: '90d', label: () => t('90 days', '৯০ দিন') },
  { value: '12m', label: () => t('12 months', '১২ মাস') },
  { value: 'all', label: () => t('All time', 'শুরু থেকে') },
];

type Measure = 'revenue' | 'orders' | 'signups' | 'listings';
const MEASURES: { value: Measure; label: () => string }[] = [
  { value: 'revenue', label: () => t('Sales', 'বিক্রি') },
  { value: 'orders', label: () => t('Orders', 'অর্ডার') },
  { value: 'signups', label: () => t('New members', 'নতুন সদস্য') },
  { value: 'listings', label: () => t('New listings', 'নতুন লিস্টিং') },
];

const count = (n: number): string => formatNumber(Math.round(n));
const money = (n: number): string => taka(Math.round(n));
/** Fees are small figures, so they keep their paisa. */
const fee = (n: number): string => `৳${formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "24 Sep" for a day or a week's first day, "Sep 2026" for a month. */
const pointLabel = (date: string): string => {
  const [year, month, day] = date.split('-').map(Number);
  const at = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  return day
    ? formatDate(at, { day: 'numeric', month: 'short', timeZone: 'UTC' }, 'en-GB')
    : formatDate(at, { month: 'short', year: 'numeric', timeZone: 'UTC' }, 'en-GB');
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
      t(
        `${dayName(bestDay)} is the busiest day, and the busiest hour is ${dayName(busiest.day)} at ${hourLabel(busiest.hour)}: a good time for a deal or an announcement.`,
        `${dayName(bestDay)} সবচেয়ে ব্যস্ত দিন, আর সবচেয়ে ব্যস্ত সময় ${dayName(busiest.day)} ${hourLabel(busiest.hour)}: ছাড় বা ঘোষণার জন্য ভালো সময়।`
      )
    );
  }
  const [top] = stats.categories;
  if (top) {
    lines.push(
      t(
        `${top.name} sells the most: ${money(top.revenue)} from ${count(top.copies)} ${top.copies === 1 ? 'copy' : 'copies'}.`,
        `সবচেয়ে বেশি বিক্রি ${top.name}: ${count(top.copies)}টি কপি থেকে ${money(top.revenue)}।`
      )
    );
  }
  const [unmet] = stats.searches.unmet;
  if (unmet) {
    lines.push(
      t(
        `${stats.searches.unmet.length === 1 ? 'One search' : `${stats.searches.unmet.length} searches`} found nothing, “${unmet.term}” most often. Sellers with those books would find buyers waiting.`,
        `${count(stats.searches.unmet.length)}টি খোঁজে কিছু পাওয়া যায়নি, সবচেয়ে বেশি “${unmet.term}”। এই বইগুলো যাঁদের আছে, সেই বিক্রেতাদের জন্য ক্রেতারা অপেক্ষা করছেন।`
      )
    );
  }
  const [wanted] = stats.wanted.top;
  if (wanted && wanted.requesterCount > 1) {
    lines.push(
      t(
        `${wanted.requesterCount} readers are waiting for “${wanted.title}” on the Wanted board.`,
        `চাহিদার বোর্ডে ${count(wanted.requesterCount)} জন পাঠক “${wanted.title}”-এর অপেক্ষায় আছেন।`
      )
    );
  }
  if (stats.kpis.feesPending > 0) {
    lines.push(
      t(
        `${fee(stats.kpis.feesPending)} more in fees arrives as the books now on their way are delivered.`,
        `পথে থাকা বইগুলো ডেলিভারি হলে ফি হিসেবে আরও ${fee(stats.kpis.feesPending)} আসবে।`
      )
    );
  }
  if (stats.rates.cancelled >= 0.15) {
    lines.push(
      t(
        `${Math.round(stats.rates.cancelled * 100)}% of books ordered were cancelled. Worth a look at why.`,
        `অর্ডার করা বইয়ের ${count(stats.rates.cancelled * 100)}% বাতিল হয়েছে। কারণটা দেখে নেওয়া ভালো।`
      )
    );
  }
  if (!lines.length) {
    lines.push(
      t(
        'Nothing to report yet. Insights appear here as orders and searches come in.',
        'এখনো জানানোর মতো কিছু নেই। অর্ডার ও খোঁজ আসতে থাকলে এখানে তথ্য দেখা যাবে।'
      )
    );
  }
  return lines;
};

/** The colours for new and second-hand: two fixed hues that tell apart for everyone, named in the legend. */
const TYPE_COLOURS = { new: 'var(--color-chart-1)', old: 'var(--color-chart-2)' };

export default function ShopAnalytics() {
  const [params, setParams] = useSearchParams();
  const range = (RANGES.find((r) => r.value === params.get('range'))?.value ?? '30d');
  const [measure, setMeasure] = useState<Measure>('revenue');
  const { data: stats, isPending, isError, error, isFetching, dataUpdatedAt, refetch } = useShopAnalytics(range);

  const measureLabel = MEASURES.find((m) => m.value === measure)?.label() ?? '';
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
            {t('Shop analytics', 'শপের পরিসংখ্যান')}
          </h2>
          <p className="admin-lede">
            {t(
              'Sales, fees, what sells and when. Sales are book totals without delivery; times are Dhaka time.',
              'বিক্রি, ফি, কী বিক্রি হয় আর কখন। বিক্রি মানে ডেলিভারি ছাড়া বইয়ের মোট দাম; সময় ঢাকার সময় অনুযায়ী।'
            )}
          </p>
          {stats && (
            <p className="sa-updated" aria-live="polite">
              <span className={`sa-live-dot${isFetching ? ' is-busy' : ''}`} aria-hidden="true" />
              {isFetching
                ? t('Updating…', 'হালনাগাদ হচ্ছে…')
                : t(
                    `Live: updated ${formatTime(dataUpdatedAt, { hour: '2-digit', minute: '2-digit' }, 'en-GB')}, every minute`,
                    `লাইভ: ${formatTime(dataUpdatedAt, { hour: '2-digit', minute: '2-digit' }, 'en-GB')}-এ হালনাগাদ, প্রতি মিনিটে`
                  )}
              <button type="button" className="sa-link sa-refresh" onClick={() => void refetch()} disabled={isFetching}>
                <FaSyncAlt aria-hidden="true" /> {t('Refresh now', 'এখনই হালনাগাদ করুন')}
              </button>
            </p>
          )}
        </div>
        <div className="sa-ranges" role="radiogroup" aria-label={t('Period', 'সময়কাল')}>
          {RANGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={range === value}
              className={`sa-range${range === value ? ' is-on' : ''}`}
              onClick={() => setParams(value === '30d' ? {} : { range: value }, { replace: true })}
            >
              {label()}
            </button>
          ))}
        </div>
      </header>

      {isPending ? (
        <p className="sa-empty" role="status">
          {t('Adding up the figures…', 'হিসাব করা হচ্ছে…')}
        </p>
      ) : isError || !stats ? (
        <p className="sa-empty" role="alert">
          {t('Could not load the analytics:', 'পরিসংখ্যান লোড করা যায়নি:')} {messageOf(error)}
        </p>
      ) : (
        <div className={`sa-body${isFetching ? ' is-refreshing' : ''}`} aria-busy={isFetching}>
          <div className="sa-tiles">
            <Tile icon={FaCoins} label={t('Sales', 'বিক্রি')} kpi={stats.kpis.revenue} format={money} />
            <Tile icon={FaReceipt} label={t('Orders', 'অর্ডার')} kpi={stats.kpis.orders} format={count} />
            <Tile icon={FaShoppingBag} label={t('Average order', 'গড় অর্ডার')} kpi={stats.kpis.averageOrder} format={money} />
            <Tile
              icon={FaStore}
              label={t(`Fees earned (${stats.feePercent}%)`, `আয় করা ফি (${formatNumber(stats.feePercent)}%)`)}
              kpi={stats.kpis.feesEarned}
              format={fee}
              note={
                stats.kpis.feesPending
                  ? t(
                      `${fee(stats.kpis.feesPending)} more on books still on their way`,
                      `পথে থাকা বই থেকে আরও ${fee(stats.kpis.feesPending)}`
                    )
                  : undefined
              }
            />
            <Tile icon={FaBook} label={t('Copies sold', 'বিক্রি হওয়া কপি')} kpi={stats.kpis.copiesSold} format={count} />
            <Tile icon={FaUserPlus} label={t('New members', 'নতুন সদস্য')} kpi={stats.kpis.newUsers} format={count} />
            <Tile icon={FaBoxOpen} label={t('New listings', 'নতুন লিস্টিং')} kpi={stats.kpis.newListings} format={count} />
            <div className="sa-tile">
              <span className="sa-tile-label">
                <FaUsers aria-hidden="true" /> {t('Members today', 'আজকের সদস্য')}
              </span>
              <strong className="sa-tile-value">{count(stats.people.buyers + stats.people.sellers)}</strong>
              <small className="sa-muted">
                {t(
                  `${count(stats.people.sellers)} set up to sell, ${count(stats.people.buyers)} buying only`,
                  `${count(stats.people.sellers)} জন বিক্রেতা, ${count(stats.people.buyers)} জন শুধু ক্রেতা`
                )}
              </small>
            </div>
          </div>

          <div className="sa-grid">
            <Card
              title={t(`${measureLabel} over time`, `সময়ের সঙ্গে ${measureLabel}`)}
              icon={FaChartLine}
              wide
              action={
                <div className="sa-ranges is-small" role="radiogroup" aria-label={t('Measure', 'পরিমাপ')}>
                  {MEASURES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={measure === value}
                      className={`sa-range${measure === value ? ' is-on' : ''}`}
                      onClick={() => setMeasure(value)}
                    >
                      {label()}
                    </button>
                  ))}
                </div>
              }
            >
              <TrendChart points={points} format={formatMeasure} name={measureLabel} />
              <details className="sa-details">
                <summary>{t('Show the numbers', 'সংখ্যাগুলো দেখুন')}</summary>
                <div className="sa-table-wrap">
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th scope="col">
                          {stats.bucket === 'day'
                            ? t('Day', 'দিন')
                            : stats.bucket === 'week'
                              ? t('Week from', 'সপ্তাহের শুরু')
                              : t('Month', 'মাস')}
                        </th>
                        <th scope="col">{t('Sales', 'বিক্রি')}</th>
                        <th scope="col">{t('Orders', 'অর্ডার')}</th>
                        <th scope="col">{t('New members', 'নতুন সদস্য')}</th>
                        <th scope="col">{t('New listings', 'নতুন লিস্টিং')}</th>
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

            <Card title={t('Busy hours', 'ব্যস্ত সময়')} icon={FaReceipt} wide>
              <Heatmap
                grid={stats.busyHours}
                label={t(
                  `Orders by day and hour, Dhaka time. ${insightsOf(stats)[0] ?? ''}`,
                  `দিন ও ঘণ্টা অনুযায়ী অর্ডার, ঢাকার সময়ে। ${insightsOf(stats)[0] ?? ''}`
                )}
              />
            </Card>

            <Card title={t('Worth knowing', 'জেনে রাখুন')} icon={FaLightbulb}>
              <ul className="sa-insights">
                {insightsOf(stats).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card>

            <Card title={t('Popular categories', 'জনপ্রিয় বিষয়')}>
              <BarList
                empty={t('No sales in this period.', 'এই সময়ে কোনো বিক্রি হয়নি।')}
                format={money}
                bars={stats.categories.map((c) => ({ key: c.name, label: c.name, value: c.revenue, note: t(`${money(c.revenue)} · ${count(c.copies)} sold`, `${money(c.revenue)} · ${count(c.copies)}টি বিক্রি`) }))}
              />
            </Card>

            <Card title={t('New or second-hand', 'নতুন না পুরোনো')}>
              <SplitBar
                format={money}
                parts={[
                  { key: 'new', label: t('New', 'নতুন'), value: stats.bookTypes.find((t) => t.type === 'new')?.revenue ?? 0, color: TYPE_COLOURS.new },
                  { key: 'old', label: t('Second-hand', 'পুরোনো'), value: stats.bookTypes.find((t) => t.type === 'old')?.revenue ?? 0, color: TYPE_COLOURS.old },
                ]}
              />
              <div className="sa-meters">
                <Meter
                  label={t('Cancelled', 'বাতিল')}
                  value={stats.rates.cancelled}
                  hint={t('Of the books ordered in this period.', 'এই সময়ে অর্ডার করা বইয়ের মধ্যে।')}
                />
                <Meter label={t('Returned', 'ফেরত')} value={stats.rates.returned} hint={t('Of the books delivered.', 'ডেলিভারি হওয়া বইয়ের মধ্যে।')} />
                <Meter
                  label={t('Used a promo code', 'প্রোমো কোড ব্যবহার')}
                  value={stats.rates.promo}
                  hint={t('Of the orders placed.', 'দেওয়া অর্ডারের মধ্যে।')}
                />
              </div>
            </Card>

            <Card title={t('Where orders are going', 'অর্ডার কোথায় যাচ্ছে')}>
              <BarList
                empty={t('No orders in this period.', 'এই সময়ে কোনো অর্ডার নেই।')}
                format={count}
                bars={stats.regions.map((r) => ({ key: r.division, label: r.division, value: r.orders }))}
              />
            </Card>

            <Card title={t('Order status', 'অর্ডারের অবস্থা')}>
              <BarList
                empty={t('No orders in this period.', 'এই সময়ে কোনো অর্ডার নেই।')}
                format={count}
                bars={stats.statuses.map((s) => ({ key: s.status, label: statusLabel(s.status), value: s.count }))}
              />
            </Card>

            <Card title={t('Best-selling books', 'সবচেয়ে বেশি বিক্রি হওয়া বই')} icon={FaBook}>
              <BarList
                empty={t('No sales in this period.', 'এই সময়ে কোনো বিক্রি হয়নি।')}
                format={count}
                bars={stats.topBooks.map((b) => ({
                  key: b.id,
                  label: (
                    <Link to={`/book/${b.id}`} title={b.author ? t(`${b.title}, by ${b.author}`, `${b.title}, ${b.author}`) : b.title}>
                      {b.title}
                    </Link>
                  ),
                  value: b.copies,
                  note: t(`${count(b.copies)} sold`, `${count(b.copies)}টি বিক্রি`),
                }))}
              />
            </Card>

            <Card title={t('Top sellers', 'শীর্ষ বিক্রেতা')} icon={FaStore}>
              <BarList
                empty={t('No sales in this period.', 'এই সময়ে কোনো বিক্রি হয়নি।')}
                format={money}
                bars={stats.topSellers.map((s) => ({
                  key: s.email,
                  label: <span title={s.email}>{s.username || s.email}</span>,
                  value: s.revenue,
                  note: t(
                    `${money(s.revenue)} · ${count(s.orders)} ${s.orders === 1 ? 'order' : 'orders'}`,
                    `${money(s.revenue)} · ${count(s.orders)}টি অর্ডার`
                  ),
                }))}
              />
            </Card>

            <Card title={t('What people search for', 'মানুষ কী খোঁজে')} icon={FaSearch}>
              <p className="sa-muted sa-card-note">
                {t(`${count(stats.searches.total)} searches in this period.`, `এই সময়ে ${count(stats.searches.total)} বার খোঁজা হয়েছে।`)}
              </p>
              <BarList
                empty={t('No searches in this period.', 'এই সময়ে কোনো খোঁজ হয়নি।')}
                format={count}
                bars={stats.searches.top.map((s) => ({ key: s.term, label: s.term, value: s.count }))}
              />
            </Card>

            <Card title={t('Searches that found nothing', 'যে খোঁজে কিছু মেলেনি')} icon={FaSearch}>
              <p className="sa-muted sa-card-note">
                {t(
                  'Books people want that nobody is selling: worth telling sellers about.',
                  'মানুষ যে বই চায় কিন্তু কেউ বিক্রি করছে না: বিক্রেতাদের জানানো ভালো।'
                )}
              </p>
              <BarList
                empty={t('Every search found something.', 'প্রতিটি খোঁজে কিছু না কিছু পাওয়া গেছে।')}
                format={count}
                bars={stats.searches.unmet.map((s) => ({ key: s.term, label: s.term, value: s.count }))}
              />
            </Card>

            <Card
              title={t('Wanted board', 'চাহিদার বোর্ড')}
              icon={FaHeart}
              action={
                <Link to="/wanted" className="sa-link">
                  {t('Open the board', 'বোর্ড খুলুন')}
                </Link>
              }
            >
              <p className="sa-muted sa-card-note">
                {t(
                  `${count(stats.wanted.open)} open ${stats.wanted.open === 1 ? 'request' : 'requests'}; ${count(stats.wanted.foundInRange)} found a seller in this period.`,
                  `${count(stats.wanted.open)}টি খোলা অনুরোধ; এই সময়ে ${count(stats.wanted.foundInRange)}টি বিক্রেতা পেয়েছে।`
                )}
              </p>
              <BarList
                empty={t('Nobody is waiting for a book.', 'কেউ কোনো বইয়ের অপেক্ষায় নেই।')}
                format={count}
                bars={stats.wanted.top.map((w) => ({
                  key: w.id,
                  label: w.author ? `${w.title} (${w.author})` : w.title,
                  value: w.requesterCount,
                  note: t(`${count(w.requesterCount)} waiting`, `${count(w.requesterCount)} জন অপেক্ষায়`),
                }))}
              />
            </Card>

            <Card title={t('The catalogue today', 'আজকের ক্যাটালগ')} icon={FaEye} wide>
              <div className="sa-mini-tiles">
                <div>
                  <span>{t('Listings', 'লিস্টিং')}</span>
                  <strong>{count(stats.catalogue.listings)}</strong>
                </div>
                <div>
                  <span>{t('In stock', 'স্টকে আছে')}</span>
                  <strong>{count(stats.catalogue.inStock)}</strong>
                </div>
                <div>
                  <span>{t('Book views', 'বই দেখা হয়েছে')}</span>
                  <strong>{count(stats.catalogue.views)}</strong>
                </div>
                <div>
                  <span>{t('On wishlists', 'উইশলিস্টে')}</span>
                  <strong>{count(stats.catalogue.wishlists)}</strong>
                </div>
              </div>
              <h4 className="sa-subhead">{t('Most viewed', 'সবচেয়ে বেশি দেখা')}</h4>
              <BarList
                empty={t('No views yet.', 'এখনো কেউ দেখেনি।')}
                format={count}
                bars={stats.catalogue.mostViewed.map((b) => ({
                  key: b.id,
                  label: <Link to={`/book/${b.id}`}>{b.title}</Link>,
                  value: b.viewCount,
                  note: t(
                    `${count(b.viewCount)} views · ${count(b.wishlistCount)} on wishlists`,
                    `${count(b.viewCount)} বার দেখা · ${count(b.wishlistCount)}টি উইশলিস্টে`
                  ),
                }))}
              />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
