import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
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
import { site, sitePayment } from '../config/site.js';
import { conditionLabel } from '../utils/bookText.js';
import { categoryLabel } from '../config/categories.js';
import { digits, formatNumber, t } from '../utils/language.js';
import Logo from '../components/Logo.js';
import SearchField from '../components/SearchField.js';
import RequestBookButton from '../components/RequestBookButton.js';
import ShareBook from '../components/ShareBook.js';
import NotificationBell from '../components/NotificationBell.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { LanguageToggle } from '../components/LanguageToggle.js';
import QuantityStepper from '../components/QuantityStepper.js';
import { getUserEmail } from '../utils/auth.js';
import { flagsFor } from '../utils/bookFlags.js';
import { PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { cardSrcSet, isCloudinary, sized, CARD_SIZES, IMAGE_WIDTHS } from '../utils/imageUrl.js';
import { reportError } from '../utils/report.js';
import PriceTag from '../components/PriceTag.js';
import { priceOf } from '../utils/pricing.js';
import { recordView } from '../utils/recentlyViewed.js';
import { countLabel } from '../utils/compactCount.js';
import { given } from '../utils/bookText.js';

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

    // A link to the reviews - from the "delivered" e-mail or a notification -
    // lands on them once the book above has taken its space.
    const { hash } = useLocation();
    useEffect(() => {
        if (!loading && hash === '#reviews') document.getElementById('reviews')?.scrollIntoView();
    }, [loading, hash]);
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
            toast.warning(t('This book is out of stock.', 'বইটির স্টক শেষ।'));
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
                    ? t('Removed from your cart.', 'কার্ট থেকে সরানো হয়েছে।')
                    : quantity > 1
                      ? t(`${quantity} copies added to your cart.`, `${formatNumber(quantity)}টি কপি কার্টে যোগ হয়েছে।`)
                      : t('Added to your cart.', 'কার্টে যোগ হয়েছে।')
            );
            if (isInCart) setCopies(1);
        } catch (error) {
            reportError('Cart error:', error);
            toast.error(messageOf(error) || t('Could not update your cart.', 'কার্ট আপডেট করা যায়নি।'));
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
                isInWishlist
                    ? t('Removed from your wishlist.', 'উইশলিস্ট থেকে সরানো হয়েছে।')
                    : t('Added to your wishlist.', 'উইশলিস্টে যোগ হয়েছে।')
            );
        } catch (error) {
            reportError('Wishlist error:', error);
            toast.error(messageOf(error) || t('Could not update your wishlist.', 'উইশলিস্ট আপডেট করা যায়নি।'));
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
        ? t(
              `${book.title} by ${book.author}. ${book.bookType === 'old' ? 'Second-hand' : 'New'}, ${priceOf(book)} Tk${(book.discountPercent ?? 0) > 0 ? ` (${book.discountPercent}% off)` : ''}${book.stock > 0 ? ', in stock' : ', out of stock'}.`,
              `${book.author}-এর ${book.title}। ${book.bookType === 'old' ? 'পুরোনো' : 'নতুন'}, ${digits(priceOf(book))} টাকা${(book.discountPercent ?? 0) > 0 ? ` (${digits(book.discountPercent ?? 0)}% ছাড়)` : ''}${book.stock > 0 ? ', স্টকে আছে' : ', স্টক শেষ'}।`
          )
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
                  ...(given(book.desc) ? { description: given(book.desc) } : {}),
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
                {t('Loading...', 'লোড হচ্ছে...')}
            </div>
        );
    }

    if (error) {
        return (
            <div className="book-page-state" role="alert" style={{ color: 'var(--color-danger-ink)' }}>
                {t('Error:', 'সমস্যা:')} {error}
                <Link to="/filter" className="btn btn-ghost">{t('Browse books', 'বই দেখুন')}</Link>
            </div>
        );
    }

    if (!book) {
        return (
            <div className="book-page-state">
                {t('Book not found', 'বইটি পাওয়া যায়নি')}
                <Link to="/filter" className="btn btn-ghost">{t('Browse books', 'বই দেখুন')}</Link>
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
                        aria-label={t('BookStoreBD home', 'BookStoreBD হোম')}
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
                        inputProps={{ name: 'q', 'aria-label': t('Search books', 'বই খুঁজুন'), placeholder: t('Search books...', 'বই খুঁজুন...') }}
                    />
                    <button onClick={() => navigate(`/filter?search=${encodeURIComponent(searchQuery.trim())}`)}>{t('Search', 'খুঁজুন')}</button>
                </div>

                <div className="user-options" style={{ position: 'relative' }}>
                    {user && (
                        <Link to="/chat"
                            className="chat-icon icon-button"
                            style={{ color: 'var(--color-brand)' }}
                            title={t('Chat', 'চ্যাট')}
                            aria-label={t('Chat', 'চ্যাট')}
                        >
                            <FaComments />
                            {unreadCount > 0 && (
                                <span className="book-page-unread">
                                    {unreadCount > 99 ? digits('99+') : digits(unreadCount)}
                                </span>
                            )}
                        </Link>
                    )}

                    <LanguageToggle />
                    <ThemeToggle className="icon-button theme-toggle header-theme-toggle" />

                    <NotificationBell />

                    <Link to="/wishlist"
                        className="wishlist-icon icon-button"
                        style={{ color: 'var(--color-accent)' }}
                        title={t('Wishlist', 'উইশলিস্ট')}
                        aria-label={t('Wishlist', 'উইশলিস্ট')}
                    >
                        <FaHeart />
                    </Link>

                    <Link to="/cart" className="icon-link" style={{ color: 'var(--color-brand)' }} title={t('Cart', 'কার্ট')} aria-label={t('Cart', 'কার্ট')}>
                        <FaShoppingBag />
                    </Link>

                    {user ? (
                        // A link to the profile, and nothing on hover.
                        <Link to="/profile" className="profile-link" title={t('Your profile', 'আপনার প্রোফাইল')} aria-label={t('Your profile', 'আপনার প্রোফাইল')}>
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
                            {t('Sign In', 'সাইন ইন')}
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
                                {isOld ? t('Used', 'পুরোনো') : t('New', 'নতুন')}
                            </span>
                        </div>

                        {/* The other photographs, when a seller took more than
                            one - the back cover, the spine, a worn corner. */}
                        {images.length > 1 && (
                            <div className="book-thumbs" role="group" aria-label={t('Photos of this book', 'বইটির ছবি')}>
                                {images.map((img, index) => (
                                    <button
                                        key={index}
                                        type="button"
                                        className={`book-thumb${index === shownIndex ? ' is-on' : ''}`}
                                        onClick={() => setPicked({ id, index })}
                                        aria-label={t(`Photo ${index + 1} of ${images.length}`, `ছবি ${formatNumber(index + 1)} / ${formatNumber(images.length)}`)}
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
                                <p className="book-kicker">{book.category.map(categoryLabel).join(' · ')}</p>
                            )}
                            <h1 className="book-title">{book.title}</h1>
                            <p className="book-author">{t(`By ${book.author}`, `লেখক: ${book.author}`)}</p>
                            {(book.ratingCount ?? 0) > 0 ? (
                                <a href="#reviews" className="book-rating">
                                    <Stars value={book.ratingAverage ?? 0} size={18} />
                                    <span style={{ fontWeight: 700, color: 'var(--color-ink)' }}>
                                        {digits((book.ratingAverage ?? 0).toFixed(1))}
                                    </span>
                                    <span style={{ color: 'var(--color-ink-muted)' }}>
                                        {t(
                                            `(${book.ratingCount} ${book.ratingCount === 1 ? 'review' : 'reviews'})`,
                                            `(${formatNumber(book.ratingCount ?? 0)}টি রিভিউ)`
                                        )}
                                    </span>
                                </a>
                            ) : (
                                <p className="book-rating" style={{ color: 'var(--color-ink-muted)' }}>{t('No reviews yet', 'এখনো কোনো রিভিউ নেই')}</p>
                            )}

                            {/* How wanted it is: views and wishlists. */}
                            <ul className="book-demand" aria-label={t('Demand for this book', 'বইটির চাহিদা')}>
                                <li>
                                    <FaEye aria-hidden="true" /> {countLabel(book.viewCount, 'view', 'views', 'বার দেখা হয়েছে')}
                                </li>
                                <li>
                                    <FaHeart aria-hidden="true" />{' '}
                                    {t(
                                        `On ${countLabel(book.wishlistCount, 'wishlist', 'wishlists')}`,
                                        countLabel(book.wishlistCount, 'wishlist', 'wishlists', 'জনের উইশলিস্টে')
                                    )}
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
                                        ? t('Out of Stock', 'স্টক শেষ')
                                        : book.stock <= 5
                                          ? t(`Only ${book.stock} left`, `মাত্র ${formatNumber(book.stock)}টি বাকি`)
                                          : t(`${book.stock} copies available`, `${formatNumber(book.stock)}টি কপি আছে`)}
                                </span>
                            </div>

                            {/* How many: before it is in the cart, what to add;
                                after, what the cart holds - changed in place. */}
                            {book.stock > 1 && (
                                <div className="book-qty">
                                    <span className="book-qty-label">{inCart ? t('In your cart', 'আপনার কার্টে') : t('Quantity', 'পরিমাণ')}</span>
                                    <QuantityStepper
                                        value={inCart ? Math.min(cartCopies[book._id] ?? 1, book.stock) : Math.min(copies, book.stock)}
                                        max={book.stock}
                                        disabled={savingQuantity}
                                        label={t(`Copies of ${book.title}`, `${book.title}-এর কপি`)}
                                        onChange={(value) => {
                                            if (!inCart) {
                                                setCopies(value);
                                                return;
                                            }
                                            setCartQuantity(
                                                { bookId: book._id, quantity: value },
                                                { onError: (err) => toast.error(messageOf(err) || t('Could not change the quantity.', 'পরিমাণ বদলানো যায়নি।')) }
                                            );
                                        }}
                                    />
                                </div>
                            )}

                            <div className="book-actions">
                                {userEmail && userEmail === book.sellerEmail ? (
                                    // A seller cannot buy their own book; the shop refuses it too.
                                    <Link to="/seller-books" className="btn btn-primary">{t('Your listing: manage it', 'আপনার তালিকা: পরিচালনা করুন')}</Link>
                                ) : book.stock <= 0 ? (
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
                                    {book.stock === 0
                                        ? t('Out of Stock', 'স্টক শেষ')
                                        : inCart
                                          ? t('Remove from Cart', 'কার্ট থেকে সরান')
                                          : t('Add to Cart', 'কার্টে যোগ করুন')}
                                </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => toggleWishlist(book._id)}
                                    className="btn btn-ghost book-wish"
                                    aria-label={inWishlist ? t('Remove from wishlist', 'উইশলিস্ট থেকে সরান') : t('Add to wishlist', 'উইশলিস্টে যোগ করুন')}
                                    aria-pressed={inWishlist}
                                    title={inWishlist ? t('Remove from wishlist', 'উইশলিস্ট থেকে সরান') : t('Add to wishlist', 'উইশলিস্টে যোগ করুন')}
                                >
                                    {inWishlist ? (
                                        <FaHeart aria-hidden="true" style={{ color: 'var(--color-accent)' }} />
                                    ) : (
                                        <FaRegHeart aria-hidden="true" />
                                    )}
                                    <span className="book-wish-text">{t('Wishlist', 'উইশলিস্ট')}</span>
                                </button>
                            </div>

                            <div className="book-share-row">
                                <ShareBook bookId={book._id} title={book.title} author={book.author} />
                            </div>

                            <ul className="book-perks" aria-label={t('Buying here', 'এখানে কেনা')}>
                                <li>💵 {sitePayment()}</li>
                                <li>
                                    ↩️{' '}
                                    {t(
                                        `${site.returns.windowDays}-day returns if not as described`,
                                        `বর্ণনার সঙ্গে না মিললে ${digits(site.returns.windowDays)} দিনে ফেরত`
                                    )}
                                </li>
                                <li>
                                    🚚{' '}
                                    {t(`From ${site.delivery.insideDhaka} Tk delivery`, `ডেলিভারি ${digits(site.delivery.insideDhaka)} টাকা থেকে`)}
                                </li>
                            </ul>
                        </div>

                        {/* The seller, and the way to reach them. */}
                        <div className="card book-seller">
                            <span className="book-seller-avatar" aria-hidden="true">
                                {(sellerName || '?').charAt(0).toUpperCase()}
                            </span>
                            <div className="book-seller-who">
                                <p className="book-seller-label">{t('Seller:', 'বিক্রেতা:')}</p>
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
                                        <span style={{ color: 'var(--color-ink)' }}>{digits((sellerInfo.sellerRating?.average ?? 0).toFixed(1))}</span>
                                        <span>
                                            {t(
                                                `(${sellerInfo.sellerRating?.count} ${sellerInfo.sellerRating?.count === 1 ? 'rating' : 'ratings'})`,
                                                `(${formatNumber(sellerInfo.sellerRating?.count ?? 0)}টি রেটিং)`
                                            )}
                                        </span>
                                    </Link>
                                )}
                            </div>
                            {sellerInfo?.username && (
                                <Link to={`/shop/${encodeURIComponent(sellerInfo.username)}`} className="btn btn-ghost">
                                    <FaStore aria-hidden="true" /> {t('Visit shop', 'দোকানে যান')}
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
                                            toast.info(t('Sign in to message the seller.', 'বিক্রেতাকে মেসেজ দিতে সাইন ইন করুন।'), {
                                                action: {
                                                    label: t('Sign in', 'সাইন ইন'),
                                                    onClick: () => navigate('/sign-in'),
                                                },
                                            });
                                            return;
                                        }
                                        setShowChat(true);
                                    }}
                                >
                                    <FaComments aria-hidden="true" /> {t('Chat with Seller', 'বিক্রেতার সঙ্গে চ্যাট')}
                                </button>
                            )}
                        </div>

                        <div className="card book-section">
                            <h2>{t('Book Details', 'বইয়ের বিবরণ')}</h2>
                            <dl className="book-facts">
                                {/* Only what the seller filled in: a blank field is left out
                                    rather than shown as "N/A". */}
                                <div><dt>{t('Category', 'বিষয়')}</dt><dd>{book.category.map(categoryLabel).join(', ')}</dd></div>
                                {given(book.publisher) && <div><dt>{t('Publisher', 'প্রকাশক')}</dt><dd>{given(book.publisher)}</dd></div>}
                                {given(book.isbn) && <div><dt>{t('ISBN', 'আইএসবিএন')}</dt><dd>{given(book.isbn)}</dd></div>}
                                {given(book.language) && <div><dt>{t('Language', 'ভাষা')}</dt><dd>{given(book.language)}</dd></div>}
                                {Number(book.pages) > 0 && <div><dt>{t('Pages', 'পৃষ্ঠা')}</dt><dd>{digits(book.pages ?? 0)}</dd></div>}
                                {isOld && given(book.condition) && (
                                    <div><dt>{t('Condition', 'অবস্থা')}</dt><dd>{t(capitalise(given(book.condition)), conditionLabel(given(book.condition)))}</dd></div>
                                )}
                                {isOld && given(book.conditionDetails) && (
                                    <div className="book-facts-wide">
                                        <dt>{t('Condition Details', 'অবস্থার বিস্তারিত')}</dt>
                                        <dd>{given(book.conditionDetails)}</dd>
                                    </div>
                                )}
                            </dl>
                        </div>

                        {given(book.desc) && (
                            <div className="card book-section">
                                <h2>{t('Description', 'বিবরণ')}</h2>
                                <p className="book-desc">{given(book.desc)}</p>
                            </div>
                        )}

                        <div id="reviews">
                            <BookReviews bookId={id} />
                        </div>
                    </div>
                </div>

                {book.relatedBooks?.length > 0 && (
                    <section className="popular-section book-similar">
                        <h2>{t('Similar Books', 'একই ধরনের বই')}</h2>
                        <div style={{ position: 'relative' }}>
                            <button
                                type="button"
                                onClick={handleScrollLeft}
                                className="scroll-button"
                                style={{ left: 0 }}
                                aria-label={t('Scroll left', 'বাঁয়ে সরান')}
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
                                                srcSet={cardSrcSet(relatedBook.images?.[0])}
                                                sizes={CARD_SIZES}
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
                                                {relatedBook.bookType === 'old' ? t('Used', 'পুরোনো') : t('New', 'নতুন')}
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
                                aria-label={t('Scroll right', 'ডানে সরান')}
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
