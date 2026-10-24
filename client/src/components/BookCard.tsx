import { Link } from 'react-router-dom';
import { FaEye, FaHeart, FaRegHeart } from 'react-icons/fa';

import type { Book } from '@shared/api.js';

import './BookCard.css';
import PriceTag from './PriceTag.js';
import { Stars } from './Stars.js';
import { compactCount, countLabel } from '../utils/compactCount.js';
import { hasDeal } from '../utils/pricing.js';
import { PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { cardSrcSet, sized, CARD_SIZES, IMAGE_WIDTHS } from '../utils/imageUrl.js';
import { digits, t } from '../utils/language.js';
import { conditionLabel } from '../utils/bookText.js';

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
 * The cover and the title are real links, so a book can be opened in a new tab
 * and a crawler can follow them. The heart and the cart button sit beside the
 * links, not inside them: a control inside a link is two things at once to a
 * screen reader.
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
            srcSet={cardSrcSet(book.images?.[0])}
            sizes={CARD_SIZES}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </Link>
        <span className={`bc-type ${book.bookType === 'old' ? 'is-used' : 'is-new'}`}>
          {book.bookType === 'old'
            ? book.condition
              ? t(`Used · ${capitalise(book.condition)}`, `পুরোনো · ${conditionLabel(book.condition)}`)
              : t('Used', 'পুরোনো')
            : t('New', 'নতুন')}
        </span>
        {hasDeal(book) && (
          <span className="bc-deal" aria-hidden="true">
            -{book.discountType === 'amount' ? `৳${digits(book.discountAmount ?? 0)}` : `${digits(book.discountPercent ?? 0)}%`}
          </span>
        )}
        {signedIn && onToggleWishlist && (
          <button
            type="button"
            className={`bc-heart${inWishlist ? ' is-on' : ''}`}
            onClick={() => onToggleWishlist(book._id)}
            aria-label={inWishlist ? t('Remove from wishlist', 'উইশলিস্ট থেকে সরান') : t('Add to wishlist', 'উইশলিস্টে যোগ করুন')}
            aria-pressed={inWishlist}
            title={inWishlist ? t('Remove from wishlist', 'উইশলিস্ট থেকে সরান') : t('Add to wishlist', 'উইশলিস্টে যোগ করুন')}
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
        {((book.ratingCount ?? 0) > 0 || (book.viewCount ?? 0) > 0 || (book.wishlistCount ?? 0) > 0) && (
          <div className="bc-rating">
            {(book.ratingCount ?? 0) > 0 && (
              <>
                <Stars value={book.ratingAverage ?? 0} size={13} />
                <span>({digits(book.ratingCount ?? 0)})</span>
              </>
            )}
            {/* How wanted it is, at a glance. */}
            <span className="bc-demand">
              <span className="sr-only">
                {`${countLabel(book.viewCount, 'view', 'views', 'বার দেখা')}, ${countLabel(book.wishlistCount, 'wishlist', 'wishlists', 'জনের উইশলিস্টে')}`}
              </span>
              {(book.viewCount ?? 0) > 0 && (
                <span aria-hidden="true">
                  <FaEye /> {compactCount(book.viewCount)}
                </span>
              )}
              {(book.wishlistCount ?? 0) > 0 && (
                <span aria-hidden="true">
                  <FaHeart /> {compactCount(book.wishlistCount)}
                </span>
              )}
            </span>
          </div>
        )}
        {onToggleCart && (
          <div className="bc-actions">
            {soldOut ? (
              <span className="bc-soldout">{t('Out of Stock', 'স্টক শেষ')}</span>
            ) : (
              <button
                type="button"
                className={inCart ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => onToggleCart(book._id)}
              >
                {inCart ? t('Remove from Cart', 'কার্ট থেকে সরান') : t('Add to Cart', 'কার্টে যোগ করুন')}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
