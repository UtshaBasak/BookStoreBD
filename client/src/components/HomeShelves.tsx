import { Link } from 'react-router-dom';

import type { Book, HomeSections } from '@shared/api.js';

import './HomeShelves.css';
import BookCard from './BookCard.js';
import BookShelf, { ShelfSkeleton } from './BookShelf.js';
import { CATEGORY_GROUPS, categoryLabel, categoryLink, groupOf } from '../config/categories.js';
import { useBooksByIds, useFeatured, useForYou, useHomeSections } from '../hooks/queries.js';
import { getRecentlyViewed } from '../utils/recentlyViewed.js';
import { formatNumber, t } from '../utils/language.js';

export interface ShelfActions {
  signedIn: boolean;
  wishlist: Record<string, boolean>;
  cart: Record<string, boolean>;
  onToggleWishlist: (bookId: string) => void;
  onToggleCart: (bookId: string) => void;
}

/** Up to two initials: a monogram, since the shop has no photographs of writers. */
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/** Categories on the tiles when the shop has few of its own yet. */
const STARTER_CATEGORIES = ['Novels', 'Textbooks', 'Admission Test', 'Programming', 'Self-Help', 'Mystery', 'History', "Children's", 'Islamic', 'Poetry', 'Comics', 'Cooking'];

/**
 * Every shelf below the hero, in the order a shopper meets them: what is on
 * offer now, what is new, what everyone else is buying, then ways in by
 * subject and by writer, and finally what is theirs - picks and history.
 *
 * A shelf with nothing on it is not drawn: a new shop has no bestsellers, and
 * a row of skeletons that never fills is worse than no row.
 */
export default function HomeShelves(actions: ShelfActions) {
  const sections = useHomeSections();
  const featured = useFeatured(12);
  const seen = getRecentlyViewed();
  const recent = useBooksByIds(seen);
  const forYou = useForYou(seen);

  const s: Partial<HomeSections> = sections.data ?? {};
  const latest = featured.data ?? [];
  const shelfEmpty = featured.isSuccess && latest.length === 0;

  const row = (books: readonly Book[] | undefined) =>
    (books ?? []).map((book) => (
      <BookCard
        key={book._id}
        book={book}
        signedIn={actions.signedIn}
        inWishlist={Boolean(actions.wishlist[book._id])}
        inCart={Boolean(actions.cart[book._id])}
        onToggleWishlist={actions.onToggleWishlist}
        onToggleCart={actions.onToggleCart}
      />
    ));

  const shelf = (
    id: string,
    books: readonly Book[] | undefined,
    props: { title: string; emoji: string; subtitle?: string; seeAllTo?: string }
  ) => (books?.length ? <BookShelf id={id} {...props}>{row(books)}</BookShelf> : null);

  // Categories with listings first, busiest first; the list's own picks after.
  const tiles = (() => {
    const counted = (s.categories ?? []).map((c) => ({ name: c.name, books: c.books }));
    const named = new Set(counted.map((c) => c.name.toLowerCase()));
    const extra = STARTER_CATEGORIES.filter((name) => !named.has(name.toLowerCase())).map((name) => ({ name, books: 0 }));
    return [...counted, ...extra].slice(0, 24);
  })();

  const recentBooks = (recent.data ?? []).filter((book) => book && book._id);

  /*
   * The first two shelves come from two requests. Drawn as each arrived, Quick
   * deals could land above an already drawn Latest books and push it down the
   * screen (Lighthouse's layout shift). One placeholder holds the place until
   * both are in, and they appear together.
   */
  const firstShelvesReady = !sections.isPending && !featured.isPending;

  return (
    <>
      {!firstShelvesReady && (
        <section className="shelf" aria-busy="true">
          <ShelfSkeleton />
        </section>
      )}

      {firstShelvesReady && shelf('deals', s.deals, {
        title: t('Quick deals', 'চটজলদি ছাড়'),
        emoji: '⚡',
        subtitle: t('Discounts from our sellers, the biggest first.', 'বিক্রেতাদের দেওয়া ছাড়, সবচেয়ে বড়টি আগে।'),
        seeAllTo: '/filter?deals=1&sort=dealPercent',
      })}

      {!firstShelvesReady ? null : shelfEmpty ? (
        <section className="shelf" aria-labelledby="latest-title">
          <h2 id="latest-title" className="shelf-title">
            <span className="shelf-emoji" aria-hidden="true">🆕</span>{t('Latest books', 'সদ্য আসা বই')}
          </h2>
          <div role="status" className="home-empty">
            <p className="home-empty-title">{t('No books on the shelf yet.', 'তাকে এখনো কোনো বই নেই।')}</p>
            <p>
              {t(
                'Have books you have finished with? Listing is free - be the first to sell one.',
                'পড়া শেষ এমন বই আছে? তালিকাভুক্ত করা বিনামূল্যে - প্রথম বিক্রেতা হোন।'
              )}
            </p>
            <Link to="/add-book" className="btn btn-primary">
              {t('List a book', 'বই তালিকাভুক্ত করুন')}
            </Link>
          </div>
        </section>
      ) : latest.length ? (
        <BookShelf
          id="latest"
          title={t('Latest books', 'সদ্য আসা বই')}
          emoji="🆕"
          subtitle={t('Just listed, one copy of each.', 'সদ্য তালিকায় আসা, প্রতিটির একটি করে।')}
          seeAllTo="/filter?sort=newest"
        >
          {row(latest)}
        </BookShelf>
      ) : null}

      {shelf('trending', s.trending, {
        title: t('Trending now', 'এখন জনপ্রিয়'),
        emoji: '🔥',
        subtitle: t('What readers have been buying and saving this fortnight.', 'গত দুই সপ্তাহে পাঠকেরা যা কিনছেন ও সংরক্ষণ করছেন।'),
      })}

      {shelf('for-you', forYou.data?.items, {
        title: t('Top picks for you', 'আপনার জন্য বাছাই'),
        emoji: '✨',
        subtitle: forYou.data?.personal
          ? t('Chosen from what you have bought, saved and looked at.', 'আপনি যা কিনেছেন, সংরক্ষণ করেছেন ও দেখেছেন, তা থেকে বাছাই।')
          : t(
              'The best-rated books in stock - browse a little and these become yours.',
              'স্টকে থাকা সেরা রেটিংয়ের বই - কিছু বই দেখলেই এগুলো আপনার পছন্দমতো হয়ে উঠবে।'
            ),
      })}

      {/* One row, like the other shelves, rather than a wall of tiles.
          Drawn once the counts are in, so the row's scroll-snap position
          does not shift when the counted categories arrive. */}
      {tiles.length > 0 && !sections.isPending && (
        <BookShelf
          id="categories"
          title={t('Shop by category', 'বিষয় অনুযায়ী কিনুন')}
          emoji="🗂️"
          subtitle={t(
            `${CATEGORY_GROUPS.reduce((n, g) => n + g.items.length, 0)} subjects, from admission tests to manga.`,
            `ভর্তি পরীক্ষা থেকে মাঙ্গা, ${formatNumber(CATEGORY_GROUPS.reduce((n, g) => n + g.items.length, 0))}টি বিষয়।`
          )}
          seeAllTo="/filter"
          seeAllLabel={t('All books', 'সব বই')}
          variant="categories"
        >
          {tiles.map((tile, index) => (
            <Link key={tile.name} to={categoryLink(tile.name)} className={`cat-tile cat-tone-${index % 6}`}>
              <span className="cat-tile-emoji" aria-hidden="true">
                {groupOf(tile.name)?.emoji ?? '📚'}
              </span>
              <span className="cat-tile-name">{categoryLabel(tile.name)}</span>
              {tile.books > 0 && (
                <span className="cat-tile-count">
                  {t(`${tile.books} ${tile.books === 1 ? 'book' : 'books'}`, `${formatNumber(tile.books)}টি বই`)}
                </span>
              )}
            </Link>
          ))}
        </BookShelf>
      )}

      {shelf('bestsellers', s.bestsellers, {
        title: t('Bestsellers', 'বেস্টসেলার'),
        emoji: '🏆',
        subtitle: t('The most copies sold, ever.', 'এ যাবৎ সবচেয়ে বেশি কপি বিক্রি হওয়া বই।'),
      })}

      {shelf('popular', s.popular, {
        title: t('Most popular', 'সবচেয়ে জনপ্রিয়'),
        emoji: '❤️',
        subtitle: t('The books most saved to wishlists.', 'উইশলিস্টে সবচেয়ে বেশি রাখা বই।'),
      })}

      {s.writers && s.writers.length > 0 && (
        <BookShelf
          id="writers"
          title={t('Popular writers', 'জনপ্রিয় লেখক')}
          emoji="✍️"
          subtitle={t('The authors readers keep coming back to.', 'যে লেখকদের কাছে পাঠকেরা বারবার ফিরে আসেন।')}
          variant="writers"
        >
          {s.writers.map((writer) => (
            <Link key={writer.name} to={`/filter?search=${encodeURIComponent(writer.name)}`} className="writer">
              <span className="writer-photo" aria-hidden="true">
                {initials(writer.name)}
              </span>
              <span className="writer-name">{writer.name}</span>
              <span className="writer-meta">
                {t(`${writer.books} ${writer.books === 1 ? 'book' : 'books'}`, `${formatNumber(writer.books)}টি বই`)}
                {writer.sold > 0 ? t(` · ${writer.sold} sold`, ` · ${formatNumber(writer.sold)}টি বিক্রি`) : ''}
              </span>
            </Link>
          ))}
        </BookShelf>
      )}

      {shelf('top-rated', s.topRated, {
        title: t('Top rated', 'সেরা রেটিং'),
        emoji: '⭐',
        subtitle: t('Scored highest by readers who bought them.', 'যাঁরা কিনেছেন, সেই পাঠকদের দেওয়া সবচেয়ে বেশি নম্বর।'),
        seeAllTo: '/filter?sort=rated',
      })}

      {shelf('budget', s.budget, {
        title: t('Under ৳300', '৳৩০০-এর মধ্যে'),
        emoji: '💸',
        subtitle: t('Good reads that leave change in your pocket.', 'ভালো বই, পকেটেও টাকা থাকবে।'),
        seeAllTo: '/filter?maxPrice=300&sort=priceLowHigh',
      })}

      {shelf('discover', s.discover, {
        title: t('Discover something new', 'নতুন কিছু খুঁজে নিন'),
        emoji: '🎲',
        subtitle: t('A different handful every visit.', 'প্রতিবার এলে নতুন কয়েকটি বই।'),
      })}

      {recentBooks.length > 0 &&
        shelf('recent', recentBooks, {
          title: t('Recently viewed', 'সম্প্রতি দেখা'),
          emoji: '🕘',
          subtitle: t('Kept on this device only.', 'শুধু এই ডিভাইসে রাখা।'),
        })}
    </>
  );
}
