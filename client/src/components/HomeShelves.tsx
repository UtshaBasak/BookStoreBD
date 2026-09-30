import { Link } from 'react-router-dom';

import type { Book, HomeSections } from '@shared/api.js';

import './HomeShelves.css';
import BookCard from './BookCard.js';
import BookShelf, { ShelfSkeleton } from './BookShelf.js';
import { CATEGORY_GROUPS, categoryLink, groupOf } from '../config/categories.js';
import { useBooksByIds, useFeatured, useForYou, useHomeSections } from '../hooks/queries.js';
import { getRecentlyViewed } from '../utils/recentlyViewed.js';

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

  return (
    <>
      {shelf('deals', s.deals, {
        title: 'Quick deals',
        emoji: '⚡',
        subtitle: 'Discounts from our sellers, the biggest first.',
        seeAllTo: '/filter?deals=1&sort=dealPercent',
      })}

      {shelfEmpty ? (
        <section className="shelf" aria-labelledby="latest-title">
          <h2 id="latest-title" className="shelf-title">
            <span className="shelf-emoji" aria-hidden="true">🆕</span>Latest books
          </h2>
          <div role="status" className="home-empty">
            <p className="home-empty-title">No books on the shelf yet.</p>
            <p>Have books you have finished with? Listing is free - be the first to sell one.</p>
            <Link to="/add-book" className="btn btn-primary">
              List a book
            </Link>
          </div>
        </section>
      ) : latest.length ? (
        <BookShelf id="latest" title="Latest books" emoji="🆕" subtitle="Just listed, one copy of each." seeAllTo="/filter?sort=newest">
          {row(latest)}
        </BookShelf>
      ) : featured.isPending ? (
        <section className="shelf">
          <ShelfSkeleton />
        </section>
      ) : null}

      {shelf('trending', s.trending, {
        title: 'Trending now',
        emoji: '🔥',
        subtitle: 'What readers have been buying and saving this fortnight.',
      })}

      {shelf('for-you', forYou.data?.items, {
        title: 'Top picks for you',
        emoji: '✨',
        subtitle: forYou.data?.personal
          ? 'Chosen from what you have bought, saved and looked at.'
          : 'The best-rated books in stock - browse a little and these become yours.',
      })}

      {/* One row, like the other shelves, rather than a wall of tiles
          pushing everything below it down the page. */}
      {tiles.length > 0 && (
        <BookShelf
          id="categories"
          title="Shop by category"
          emoji="🗂️"
          subtitle={`${CATEGORY_GROUPS.reduce((n, g) => n + g.items.length, 0)} subjects, from admission tests to manga.`}
          seeAllTo="/filter"
          seeAllLabel="All books"
          variant="categories"
        >
          {tiles.map((tile, index) => (
            <Link key={tile.name} to={categoryLink(tile.name)} className={`cat-tile cat-tone-${index % 6}`}>
              <span className="cat-tile-emoji" aria-hidden="true">
                {groupOf(tile.name)?.emoji ?? '📚'}
              </span>
              <span className="cat-tile-name">{tile.name}</span>
              {tile.books > 0 && <span className="cat-tile-count">{tile.books} {tile.books === 1 ? 'book' : 'books'}</span>}
            </Link>
          ))}
        </BookShelf>
      )}

      {shelf('bestsellers', s.bestsellers, {
        title: 'Bestsellers',
        emoji: '🏆',
        subtitle: 'The most copies sold, ever.',
      })}

      {shelf('popular', s.popular, {
        title: 'Most popular',
        emoji: '❤️',
        subtitle: 'The books most saved to wishlists.',
      })}

      {s.writers && s.writers.length > 0 && (
        <BookShelf id="writers" title="Popular writers" emoji="✍️" subtitle="The authors readers keep coming back to." variant="writers">
          {s.writers.map((writer) => (
            <Link key={writer.name} to={`/filter?search=${encodeURIComponent(writer.name)}`} className="writer">
              <span className="writer-photo" aria-hidden="true">
                {initials(writer.name)}
              </span>
              <span className="writer-name">{writer.name}</span>
              <span className="writer-meta">
                {writer.books} {writer.books === 1 ? 'book' : 'books'}
                {writer.sold > 0 ? ` · ${writer.sold} sold` : ''}
              </span>
            </Link>
          ))}
        </BookShelf>
      )}

      {shelf('top-rated', s.topRated, {
        title: 'Top rated',
        emoji: '⭐',
        subtitle: 'Scored highest by readers who bought them.',
        seeAllTo: '/filter?sort=rated',
      })}

      {shelf('budget', s.budget, {
        title: 'Under ৳300',
        emoji: '💸',
        subtitle: 'Good reads that leave change in your pocket.',
        seeAllTo: '/filter?maxPrice=300&sort=priceLowHigh',
      })}

      {shelf('discover', s.discover, {
        title: 'Discover something new',
        emoji: '🎲',
        subtitle: 'A different handful every visit.',
      })}

      {recentBooks.length > 0 &&
        shelf('recent', recentBooks, {
          title: 'Recently viewed',
          emoji: '🕘',
          subtitle: 'Kept on this device only.',
        })}
    </>
  );
}
