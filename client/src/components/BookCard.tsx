import { Link } from 'react-router-dom';
import { FaHeart, FaRegHeart } from 'react-icons/fa';

import type { Book } from '@shared/api.js';

import './BookCard.css';
import PriceTag from './PriceTag.js';
import { Stars } from './Stars.js';
import { hasDeal } from '../utils/pricing.js';
import { PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { sized, IMAGE_WIDTHS } from '../utils/imageUrl.js';

const capitalise = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export interface BookCardProps {
  book: Book;
  /** Shows the heart; hidden for signed-out visitors, who cannot keep a list. */
  signedIn?: boolean;
  inWishlist?: boolean;
  inCart?: boolean;
  onToggleWishlist?: (bookId: string) => void;
  onToggleCart?: (bookId: string) => void;
}

/**
 * One book, as every shelf and the catalogue draw it.
 *
 * The cover and the title are real links. The homepage cards were a <div>
 * with an onClick, so a right-click offered nothing to copy or open in a new
 * tab, a middle-click did nothing, and a crawler found no way to the books.
 * The heart and the cart button are buttons beside the links, not inside
 * them: a control inside a link is two things at once to a screen reader.
 */
export default function BookCard({
  book,
  signedIn = false,
  inWishlist = false,
  inCart = false,
  onToggleWishlist,
  onToggleCart,
}: BookCardProps) {
  const href = `/book/${book._id}`;
  const soldOut = Number(book.stock) === 0;

  return (
    <article className="bc">
      <div className="bc-cover">
        {/* The same address as the title; hidden from screen readers so it is not
            announced twice, and still a link to a right-click. */}
        <Link to={href} className="bc-cover-link" aria-hidden="true" tabIndex={-1}>
          <img
            src={sized(book.images?.[0] || PLACEHOLDER_IMAGE, IMAGE_WIDTHS.card)}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </Link>
        <span className={`bc-type ${book.bookType === 'old' ? 'is-used' : 'is-new'}`}>
          {book.bookType === 'old' ? (book.condition ? `Used · ${capitalise(book.condition)}` : 'Used') : 'New'}
        </span>
        {hasDeal(book) && (
          <span className="bc-deal" aria-hidden="true">
            -{book.discountType === 'amount' ? `৳${book.discountAmount}` : `${book.discountPercent}%`}
          </span>
        )}
        {signedIn && onToggleWishlist && (
          <button
            type="button"
            className={`bc-heart${inWishlist ? ' is-on' : ''}`}
            onClick={() => onToggleWishlist(book._id)}
            aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
            aria-pressed={inWishlist}
            title={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            {inWishlist ? <FaHeart /> : <FaRegHeart />}
          </button>
        )}
      </div>

      <div className="bc-body">
        <h3 className="bc-title">
          <Link to={href}>{book.title}</Link>
        </h3>
        <p className="bc-author">{book.author}</p>
        <PriceTag book={book} size="md" showSaving={false} />
        {(book.ratingCount ?? 0) > 0 && (
          <div className="bc-rating">
            <Stars value={book.ratingAverage ?? 0} size={13} />
            <span>({book.ratingCount})</span>
          </div>
        )}
        {onToggleCart && (
          <div className="bc-actions">
            {soldOut ? (
              <span className="bc-soldout">Out of Stock</span>
            ) : (
              <button
                type="button"
                className={inCart ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => onToggleCart(book._id)}
              >
                {inCart ? 'Remove from Cart' : 'Add to Cart'}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
