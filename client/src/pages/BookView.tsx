import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    FaEye,
    FaHeart,
    FaRegHeart,
    FaChevronLeft,
    FaChevronRight,
    FaComments,
    FaSearch,
    FaShoppingBag,
    FaStore,
} from 'react-icons/fa';
import './Homepage.css';
import './BookView.css';

import type { ChatMessage } from '@shared/api.js';

import { subscribeToMessages } from '../utils/socket.js';
import ChatWindow from '../components/ChatWindow';
import { API_BASE_URL } from '../config/api.js';
import {
    useBook,
    useCart,
    useProfile,
    useSetCartQuantity,
    useToggleCart,
    useToggleWishlist,
    useUnreadChatCount,
    useWishlist,
} from '../hooks/queries.js';
import { promptSignIn, useToast } from '../hooks/useToast.js';
import { useSeo } from '../hooks/useSeo.js';
import BookReviews from '../components/BookReviews.js';
import { Stars } from '../components/Stars.js';
import { messageOf } from '../utils/apiError.js';
import { site } from '../config/site.js';
import Logo from '../components/Logo.js';
import SearchField from '../components/SearchField.js';
import RequestBookButton from '../components/RequestBookButton.js';
import ShareBook from '../components/ShareBook.js';
import NotificationBell from '../components/NotificationBell.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import QuantityStepper from '../components/QuantityStepper.js';
import { getUserEmail } from '../utils/auth.js';
import { flagsFor } from '../utils/bookFlags.js';
import { PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { isCloudinary, sized, IMAGE_WIDTHS } from '../utils/imageUrl.js';
import { reportError } from '../utils/report.js';
import PriceTag from '../components/PriceTag.js';
import { priceOf } from '../utils/pricing.js';
import { recordView } from '../utils/recentlyViewed.js';
import { countLabel } from '../utils/compactCount.js';

export default function BookView() {
    const [searchQuery, setSearchQuery] = useState('');
    const [showChat, setShowChat] = useState(false);
    /** Which photograph is on show, for the book it was chosen on. */
    const [picked, setPicked] = useState<{ id?: string; index: number }>({ index: 0 });
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const userEmail = getUserEmail();
    const signedIn = Boolean(userEmail);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    // Everything below is derived from a query rather than fetched into state
    // by an effect, so a second visit to a book is served from the cache and
    // the loading and error flags are the query's rather than hand-rolled.
    const bookQuery = useBook(id);
    const book = bookQuery.data ?? null;
    const loading = bookQuery.isPending;
    const error = bookQuery.isError ? messageOf(bookQuery.error) : null;

    // The seller's public details, which only exist once the book has loaded.
    const { data: sellerInfo = null } = useProfile(book?.sellerEmail, {
        enabled: Boolean(book?.sellerEmail),
    });

    // Remembered on this device for the homepage's Recently viewed, once the
    // book has loaded - so an address that turns out not to be a book is not.
    useEffect(() => {
        if (book?._id) recordView(book._id);
    }, [book?._id]);

    const { data: profile } = useProfile(userEmail, { enabled: signedIn });
    const profilePic = profile?.profilePicture ?? null;
    const username = profile?.username ?? '';
    const user = userEmail ? { email: userEmail } : null;

    // Only the ids are needed for the heart and cart buttons.
    const { data: cart = {} } = useCart({ enabled: signedIn, select: flagsFor });
    // How many copies of each are in the cart, for the stepper beside the button.
    const { data: cartCopies = {} } = useCart({
        enabled: signedIn,
        select: (books) => Object.fromEntries(books.map((b) => [b._id, b.cartQuantity ?? 1])) as Record<string, number>,
    });
    // How many to add, before the book is in the cart.
    const [copies, setCopies] = useState(1);
    const { mutate: setCartQuantity, isPending: savingQuantity } = useSetCartQuantity();
    const { data: wishlist = {} } = useWishlist({ enabled: signedIn, select: flagsFor });

    const { mutateAsync: toggleCartMutation } = useToggleCart();
    const { mutateAsync: toggleWishlistMutation } = useToggleWishlist();

    const { data: unread } = useUnreadChatCount(signedIn);
    // Live arrivals bump the badge on top of whatever the query last returned.
    const [liveUnread, setLiveUnread] = useState(0);
    const unreadCount = (unread?.count ?? 0) + liveUnread;

    useEffect(() => {
        if (!userEmail) return undefined;

        const handleNewMessage = (data: ChatMessage) => {
            if (data.receiver === userEmail && !window.location.pathname.includes('/chat')) {
                setLiveUnread((count) => count + 1);
            }
        };

        return subscribeToMessages(handleNewMessage);
    }, [userEmail]);

    const toggleCart = async (bookId: string) => {
        if (!userEmail) {
            promptSignIn(toast, () => navigate('/sign-in'), 'cart');
            return;
        }

        if (!book || book.stock <= 0) {
            toast.warning('This book is out of stock.');
            return;
        }

        const isInCart = Boolean(cart[bookId]);
        try {
            // The mutation invalidates the cart, so every page showing it - the
            // badge here included - updates without this one tracking a copy.
            const quantity = Math.min(copies, book.stock);
            await toggleCartMutation({ bookId, inCart: isInCart, quantity });
            toast.success(
                isInCart
                    ? 'Removed from your cart.'
                    : quantity > 1
                      ? `${quantity} copies added to your cart.`
                      : 'Added to your cart.'
            );
            if (isInCart) setCopies(1);
        } catch (error) {
            reportError('Cart error:', error);
            toast.error(messageOf(error) || 'Could not update your cart.');
        }
    };

    const toggleWishlist = async (bookId: string) => {
        if (!userEmail) {
            promptSignIn(toast, () => navigate('/sign-in'), 'wishlist');
            return;
        }

        const isInWishlist = Boolean(wishlist[bookId]);
        try {
            await toggleWishlistMutation({ bookId, inWishlist: isInWishlist });
            toast.success(
                isInWishlist ? 'Removed from your wishlist.' : 'Added to your wishlist.'
            );
        } catch (error) {
            reportError('Wishlist error:', error);
            toast.error(messageOf(error) || 'Could not update your wishlist.');
        }
    };

    /*
     * A listing, described for a search engine.
     *
     * The cover is only offered as an image when it is a URL: most covers are
     * stored as base64 on the document, and a data URI is no use to a crawler
     * or to a link preview. The page falls back to the site banner.
     */
    const cover = book?.images?.[0];
    const coverUrl = cover && /^https?:\/\//.test(cover) ? cover : undefined;
    const summary = book
        ? `${book.title} by ${book.author}. ${book.bookType === 'old' ? 'Second-hand' : 'New'}, ${priceOf(book)} Tk${(book.discountPercent ?? 0) > 0 ? ` (${book.discountPercent}% off)` : ''}${book.stock > 0 ? ', in stock' : ', out of stock'}.`
        : undefined;

    useSeo({
        title: book?.title,
        description: summary,
        image: coverUrl,
        type: 'product',
        jsonLd: book
            ? {
                  '@context': 'https://schema.org',
                  '@type': 'Book',
                  name: book.title,
                  author: { '@type': 'Person', name: book.author },
                  publisher: book.publisher,
                  isbn: book.isbn,
                  numberOfPages: book.pages,
                  inLanguage: book.language,
                  bookEdition: book.bookType === 'old' ? 'Second-hand' : 'New',
                  ...(coverUrl ? { image: coverUrl } : {}),
                  ...(book.desc ? { description: book.desc } : {}),
                  ...((book.ratingCount ?? 0) > 0
                      ? {
                            aggregateRating: {
                                '@type': 'AggregateRating',
                                ratingValue: book.ratingAverage,
                                reviewCount: book.ratingCount,
                            },
                        }
                      : {}),
                  offers: {
                      '@type': 'Offer',
                      // What it sells for, which is the sale price on a deal.
                      price: priceOf(book),
                      priceCurrency: 'BDT',
                      itemCondition:
                          book.bookType === 'old'
                              ? 'https://schema.org/UsedCondition'
                              : 'https://schema.org/NewCondition',
                      availability:
                          book.stock > 0
                              ? 'https://schema.org/InStock'
                              : 'https://schema.org/OutOfStock',
                      url: window.location.href,
                  },
              }
            : null,
    });

    const scrollAmount = 320;
    const handleScrollLeft = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        }
    };
    const handleScrollRight = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    };

    /** Where one of a book's images is, whichever way it was stored. */
    const imageSrc = (img: string | undefined): string => {
        if (!img) return PLACEHOLDER_IMAGE;
        if (img.startsWith('data:image/')) return img;
        // Cloudinary delivers the size the page draws, not the original.
        if (isCloudinary(img)) return sized(img, IMAGE_WIDTHS.detail);
        if (/^https?:\/\//.test(img)) return img;
        // A cover served by the API arrives as a path, not as bytes.
        if (img.startsWith('/')) return img;
        return `${API_BASE_URL}/uploads/${img}`;
    };

    if (loading) {
        return (
            <div className="book-page-state" role="status">
                <span className="book-page-spinner" aria-hidden="true" />
                Loading...
            </div>
        );
    }

    if (error) {
        return (
            <div className="book-page-state" role="alert" style={{ color: 'var(--color-danger-ink)' }}>
                Error: {error}
                <Link to="/filter" className="btn btn-ghost">Browse books</Link>
            </div>
        );
    }

    if (!book) {
        return (
            <div className="book-page-state">
                Book not found
                <Link to="/filter" className="btn btn-ghost">Browse books</Link>
            </div>
        );
    }

    const images = book.images?.length ? book.images : [undefined];
    const shownIndex = Math.min(picked.id === id ? picked.index : 0, images.length - 1);
    const isOld = book.bookType === 'old';
    const inCart = Boolean(cart[book._id]);
    const inWishlist = Boolean(wishlist[book._id]);
    const sellerName = sellerInfo?.username || book?.sellerEmail;
    const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

    return (
        <div className="homepage book-page">
            {/* The homepage's header. */}
            <header className="header">
                <div className="logo">
                    {/* A client-side link, with no reload: the queries refetch
                        on their own, as on the homepage. */}
                    <Link to="/"
                        className="logo-button"
                        aria-label="BookStoreBD home"
                    >
                        <Logo size={38} />
                    </Link>
                </div>

                <div className="search-bar" role="search">
                    <FaSearch className="search-icon" aria-hidden="true" />
                    <SearchField
                        value={searchQuery}
                        onChange={setSearchQuery}
                        onSubmit={(text) => navigate(`/filter?search=${encodeURIComponent(text.trim())}`)}
                        inputProps={{ name: 'q', 'aria-label': 'Search books', placeholder: 'Search books...' }}
                    />
                    <button onClick={() => navigate(`/filter?search=${encodeURIComponent(searchQuery.trim())}`)}>Search</button>
                </div>

                <div className="user-options" style={{ position: 'relative' }}>
                    {user && (
                        <Link to="/chat"
                            className="chat-icon icon-button"
                            style={{ color: 'var(--color-brand)' }}
                            title="Chat"
                            aria-label="Chat"
                        >
                            <FaComments />
                            {unreadCount > 0 && (
                                <span className="book-page-unread">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </Link>
                    )}

                    <ThemeToggle className="icon-button theme-toggle header-theme-toggle" />

                    <NotificationBell />

                    <Link to="/wishlist"
                        className="wishlist-icon icon-button"
                        style={{ color: 'var(--color-accent)' }}
                        title="Wishlist"
                        aria-label="Wishlist"
                    >
                        <FaHeart />
                    </Link>

                    <Link to="/cart" className="icon-link" style={{ color: 'var(--color-brand)' }} title="Cart" aria-label="Cart">
                        <FaShoppingBag />
                    </Link>

                    {user ? (
                        // A link to the profile, and nothing on hover.
                        <Link to="/profile" className="profile-link" title="Your profile" aria-label="Your profile">
                            <img
                                src={
                                    profilePic ||
                                    `https://ui-avatars.com/api/?name=${encodeURIComponent(username ? username[0] : 'U')}&background=6d28d9&color=fff&bold=true`
                                }
                                alt=""
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    border: '2px solid #6d28d9',
                                    verticalAlign: 'middle',
                                }}
                            />
                        </Link>
                    ) : (
                        <Link
                            to="/sign-in"
                            className="btn btn-primary"
                            style={{ minHeight: 40, padding: '0 1.1rem' }}
                        >
                            Sign In
                        </Link>
                    )}
                </div>
            </header>

            <main className="book-page-main">
                <div className="book-layout">
                    {/* The cover column: full width on a phone, a fixed column
                        beside the details once there is room. */}
                    <div className="book-gallery">
                        <div className="book-cover">
                            <img src={imageSrc(images[shownIndex])} alt={book.title} />
                            <span
                                className="badge"
                                style={{
                                    position: 'absolute',
                                    top: 14,
                                    left: 14,
                                    fontSize: '0.8rem',
                                    padding: '5px 12px',
                                    background: isOld ? 'var(--color-surface)' : '#facc15',
                                    color: isOld ? 'var(--color-brand-dark)' : '#111827',
                                    boxShadow: '0 2px 8px rgba(30,27,75,0.18)',
                                }}
                            >
                                {isOld ? 'Used' : 'New'}
                            </span>
                        </div>

                        {/* The other photographs, when a seller took more than
                            one - the back cover, the spine, a worn corner. */}
                        {images.length > 1 && (
                            <div className="book-thumbs" role="group" aria-label="Photos of this book">
                                {images.map((img, index) => (
                                    <button
                                        key={index}
                                        type="button"
                                        className={`book-thumb${index === shownIndex ? ' is-on' : ''}`}
                                        onClick={() => setPicked({ id, index })}
                                        aria-label={`Photo ${index + 1} of ${images.length}`}
                                        aria-pressed={index === shownIndex}
                                    >
                                        <img src={imageSrc(img)} alt="" loading="lazy" decoding="async" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="book-details">
                        <div className="card book-summary">
                            {book.category?.length > 0 && (
                                <p className="book-kicker">{book.category.join(' · ')}</p>
                            )}
                            <h1 className="book-title">{book.title}</h1>
                            <p className="book-author">By {book.author}</p>
                            {(book.ratingCount ?? 0) > 0 ? (
                                <a href="#reviews" className="book-rating">
                                    <Stars value={book.ratingAverage ?? 0} size={18} />
                                    <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                                        {(book.ratingAverage ?? 0).toFixed(1)}
                                    </span>
                                    <span style={{ color: 'var(--color-ink-muted)' }}>
                                        ({book.ratingCount} {book.ratingCount === 1 ? 'review' : 'reviews'})
                                    </span>
                                </a>
                            ) : (
                                <p className="book-rating" style={{ color: 'var(--color-ink-muted)' }}>No reviews yet</p>
                            )}

                            {/* How wanted it is: views and wishlists. */}
                            <ul className="book-demand" aria-label="Demand for this book">
                                <li>
                                    <FaEye aria-hidden="true" /> {countLabel(book.viewCount, 'view', 'views')}
                                </li>
                                <li>
                                    <FaHeart aria-hidden="true" /> On {countLabel(book.wishlistCount, 'wishlist', 'wishlists')}
                                </li>
                            </ul>

                            <div className="book-price-row">
                                <span className="book-price">
                                    <PriceTag book={book} size="lg" />
                                </span>
                                <span
                                    className="badge"
                                    style={
                                        book.stock > 0
                                            ? { background: 'var(--color-success-tint)', color: 'var(--color-success-dark)' }
                                            : { background: 'var(--color-danger-tint)', color: 'var(--color-danger-ink)' }
                                    }
                                >
                                    {book.stock <= 0
                                        ? 'Out of Stock'
                                        : book.stock <= 5
                                          ? `Only ${book.stock} left`
                                          : `${book.stock} copies available`}
                                </span>
                            </div>

                            {/* How many: before it is in the cart, what to add;
                                after, what the cart holds - changed in place. */}
                            {book.stock > 1 && (
                                <div className="book-qty">
                                    <span className="book-qty-label">{inCart ? 'In your cart' : 'Quantity'}</span>
                                    <QuantityStepper
                                        value={inCart ? Math.min(cartCopies[book._id] ?? 1, book.stock) : Math.min(copies, book.stock)}
                                        max={book.stock}
                                        disabled={savingQuantity}
                                        label={`Copies of ${book.title}`}
                                        onChange={(value) => {
                                            if (!inCart) {
                                                setCopies(value);
                                                return;
                                            }
                                            setCartQuantity(
                                                { bookId: book._id, quantity: value },
                                                { onError: (err) => toast.error(messageOf(err) || 'Could not change the quantity.') }
                                            );
                                        }}
                                    />
                                </div>
                            )}

                            <div className="book-actions">
                                {book.stock <= 0 && userEmail !== book.sellerEmail ? (
                                    <RequestBookButton bookId={book._id} sellerEmail={book.sellerEmail} className="btn btn-accent" />
                                ) : (
                                <button
                                    type="button"
                                    onClick={() => toggleCart(book._id)}
                                    disabled={book.stock === 0}
                                    className={
                                        book.stock === 0
                                            ? 'btn book-sold-out'
                                            : inCart
                                              ? 'btn btn-danger'
                                              : 'btn btn-primary'
                                    }
                                >
                                    {book.stock > 0 && <FaShoppingBag aria-hidden="true" />}
                                    {book.stock === 0 ? 'Out of Stock' : (inCart ? 'Remove from Cart' : 'Add to Cart')}
                                </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => toggleWishlist(book._id)}
                                    className="btn btn-ghost book-wish"
                                    aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
                                    aria-pressed={inWishlist}
                                    title={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
                                >
                                    {inWishlist ? (
                                        <FaHeart aria-hidden="true" style={{ color: 'var(--color-accent)' }} />
                                    ) : (
                                        <FaRegHeart aria-hidden="true" />
                                    )}
                                    <span className="book-wish-text">Wishlist</span>
                                </button>
                            </div>

                            <div className="book-share-row">
                                <ShareBook bookId={book._id} title={book.title} author={book.author} />
                            </div>

                            <ul className="book-perks" aria-label="Buying here">
                                <li>💵 {site.payment}</li>
                                <li>↩️ {site.returns.windowDays}-day returns</li>
                                <li>🚚 From {site.delivery.insideDhaka} Tk delivery</li>
                            </ul>
                        </div>

                        {/* The seller, and the way to reach them. */}
                        <div className="card book-seller">
                            <span className="book-seller-avatar" aria-hidden="true">
                                {(sellerName || '?').charAt(0).toUpperCase()}
                            </span>
                            <div className="book-seller-who">
                                <p className="book-seller-label">Seller:</p>
                                <p className="book-seller-name">
                                    {sellerInfo?.username ? (
                                        <Link to={`/shop/${encodeURIComponent(sellerInfo.username)}`}>{sellerName}</Link>
                                    ) : (
                                        sellerName
                                    )}
                                </p>
                                {sellerInfo?.username && (sellerInfo.sellerRating?.count ?? 0) > 0 && (
                                    <Link
                                        to={`/shop/${encodeURIComponent(sellerInfo.username)}#ratings`}
                                        className="book-seller-rating"
                                    >
                                        <Stars value={sellerInfo.sellerRating?.average ?? 0} size={13} />
                                        <span style={{ color: 'var(--color-ink)' }}>{(sellerInfo.sellerRating?.average ?? 0).toFixed(1)}</span>
                                        <span>
                                            ({sellerInfo.sellerRating?.count}{' '}
                                            {sellerInfo.sellerRating?.count === 1 ? 'rating' : 'ratings'})
                                        </span>
                                    </Link>
                                )}
                            </div>
                            {sellerInfo?.username && (
                                <Link to={`/shop/${encodeURIComponent(sellerInfo.username)}`} className="btn btn-ghost">
                                    <FaStore aria-hidden="true" /> Visit shop
                                </Link>
                            )}
                            {userEmail !== book?.sellerEmail && (
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    // The chat window only renders for a
                                    // signed-in visitor, so anyone else is
                                    // offered a sign-in instead.
                                    onClick={() => {
                                        if (!userEmail) {
                                            toast.info('Sign in to message the seller.', {
                                                action: {
                                                    label: 'Sign in',
                                                    onClick: () => navigate('/sign-in'),
                                                },
                                            });
                                            return;
                                        }
                                        setShowChat(true);
                                    }}
                                >
                                    <FaComments aria-hidden="true" /> Chat with Seller
                                </button>
                            )}
                        </div>

                        <div className="card book-section">
                            <h2>Book Details</h2>
                            <dl className="book-facts">
                                <div><dt>Category</dt><dd>{book.category.join(', ')}</dd></div>
                                <div><dt>Publisher</dt><dd>{book.publisher || 'N/A'}</dd></div>
                                <div><dt>ISBN</dt><dd>{book.isbn || 'N/A'}</dd></div>
                                <div><dt>Language</dt><dd>{book.language || 'N/A'}</dd></div>
                                <div><dt>Pages</dt><dd>{book.pages || 'N/A'}</dd></div>
                                {isOld && (
                                    <>
                                        <div><dt>Condition</dt><dd>{book.condition ? capitalise(book.condition) : 'N/A'}</dd></div>
                                        <div className="book-facts-wide">
                                            <dt>Condition Details</dt>
                                            <dd>{book.conditionDetails || 'N/A'}</dd>
                                        </div>
                                    </>
                                )}
                            </dl>
                        </div>

                        {book.desc && (
                            <div className="card book-section">
                                <h2>Description</h2>
                                <p className="book-desc">{book.desc}</p>
                            </div>
                        )}

                        <div id="reviews">
                            <BookReviews bookId={id} />
                        </div>
                    </div>
                </div>

                {book.relatedBooks?.length > 0 && (
                    <section className="popular-section book-similar">
                        <h2>Similar Books</h2>
                        <div style={{ position: 'relative' }}>
                            <button
                                type="button"
                                onClick={handleScrollLeft}
                                className="scroll-button"
                                style={{ left: 0 }}
                                aria-label="Scroll left"
                            >
                                <FaChevronLeft />
                            </button>
                            <div ref={scrollRef} className="book-similar-strip">
                                {book.relatedBooks.map((relatedBook) => (
                                    <Link
                                        key={relatedBook._id}
                                        to={`/book/${relatedBook._id}`}
                                        className="book-card book-similar-card"
                                    >
                                        <div className="book-image" style={{ position: 'relative' }}>
                                            <img
                                                loading="lazy"
                                                decoding="async"
                                                src={sized(relatedBook.images?.[0] || PLACEHOLDER_IMAGE, IMAGE_WIDTHS.card)}
                                                alt={relatedBook.title}
                                            />
                                            <span
                                                className="badge"
                                                style={{
                                                    position: 'absolute',
                                                    top: 10,
                                                    left: 10,
                                                    background: relatedBook.bookType === 'old' ? 'var(--color-surface)' : '#facc15',
                                                    color: relatedBook.bookType === 'old' ? 'var(--color-brand-dark)' : '#111827',
                                                    boxShadow: '0 2px 8px rgba(30,27,75,0.18)',
                                                }}
                                            >
                                                {relatedBook.bookType === 'old' ? 'Used' : 'New'}
                                            </span>
                                        </div>
                                        <div className="book-info">
                                            <h3>{relatedBook.title}</h3>
                                            <p className="book-similar-author">{relatedBook.author}</p>
                                            <p className="book-similar-price">
                                                <PriceTag book={relatedBook} size="sm" showSaving={false} />
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={handleScrollRight}
                                className="scroll-button"
                                style={{ right: 0 }}
                                aria-label="Scroll right"
                            >
                                <FaChevronRight />
                            </button>
                        </div>
                    </section>
                )}
            </main>

            {showChat && userEmail && book?.sellerEmail && (
                <ChatWindow
                    receiver={book.sellerEmail}
                    receiverName={sellerInfo?.username || book.sellerEmail}
                    onClose={() => setShowChat(false)}
                />
            )}
        </div>
    );
}
