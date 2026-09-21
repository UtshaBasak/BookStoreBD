import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FaHeart, FaRegHeart, FaChevronLeft, FaChevronRight, FaComments, FaBell } from 'react-icons/fa';

import type { Book, BookDetail, ChatMessage } from '@shared/api.js';

import socket from '../utils/socket';  // Add this import
import ChatWindow from '../components/ChatWindow';
import { API_BASE_URL, signOut } from '../config/api.js';
import {
    useBook,
    useCart,
    useProfile,
    useToggleCart,
    useToggleWishlist,
    useUnreadChatCount,
    useWishlist,
} from '../hooks/queries.js';
import { messageOf } from '../utils/apiError.js';
import { getUserEmail } from '../utils/auth.js';
import { flagsFor } from '../utils/bookFlags.js';
import { PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';

export default function BookView() {
    const [showDropdown, setShowDropdown] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showChat, setShowChat] = useState(false);
    const { id } = useParams();
    const navigate = useNavigate();
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

    const { data: profile } = useProfile(userEmail, { enabled: signedIn });
    const profilePic = profile?.profilePicture ?? null;
    const username = profile?.username ?? '';
    const user = userEmail ? { email: userEmail } : null;

    // Only the ids are needed for the heart and cart buttons.
    const { data: cart = {} } = useCart({ enabled: signedIn, select: flagsFor });
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

        socket.on('receive_message', handleNewMessage);

        return () => {
            socket.off('receive_message', handleNewMessage);
        };
    }, [userEmail]);

    const toggleCart = async (bookId: string) => {
        if (!userEmail) {
            alert('Please sign in to use cart.');
            return;
        }

        if (!book || book.stock <= 0) {
            alert('Sorry, this book is out of stock!');
            return;
        }

        const isInCart = Boolean(cart[bookId]);
        try {
            // The mutation invalidates the cart, so every page showing it - the
            // badge here included - updates without this one tracking a copy.
            await toggleCartMutation({ bookId, inCart: isInCart });
            alert(isInCart ? 'Removed from cart!' : 'Added to cart successfully!');
        } catch (error) {
            console.error('Cart error:', error);
            alert(messageOf(error) || 'Failed to update cart');
        }
    };

    const toggleWishlist = async (bookId: string) => {
        if (!userEmail) {
            alert('Please sign in to use wishlist.');
            return;
        }

        const isInWishlist = Boolean(wishlist[bookId]);
        try {
            await toggleWishlistMutation({ bookId, inWishlist: isInWishlist });
            alert(isInWishlist ? 'Removed from wishlist!' : 'Added to wishlist successfully!');
        } catch (error) {
            console.error('Wishlist error:', error);
            alert(messageOf(error) || 'Failed to update wishlist');
        }
    };

    const handleSignOut = async () => {
        await signOut();
        setShowDropdown(false);
        navigate('/sign-in');
    };

    const handleViewProfile = () => {
        navigate('/profile');
    };

    // Scroll handlers for similar books
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

    const getBookImageSrc = (book: Book | BookDetail | null | undefined): string => {
        if (!book) return PLACEHOLDER_IMAGE;
        const img = book.images?.[0];
        if (!img) return PLACEHOLDER_IMAGE;
        if (img.startsWith('data:image/')) return img;
        if (/^https?:\/\//.test(img)) return img;
        return `${API_BASE_URL}/uploads/${img}`;
    };

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>;
    }

    if (error) {
        return <div style={{ textAlign: 'center', padding: '2rem', color: 'red' }}>Error: {error}</div>;
    }

    if (!book) {
        return <div style={{ textAlign: 'center', padding: '2rem' }}>Book not found</div>;
    }

    return (
        <div style={{ minHeight: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
            <header className="header">
                <div className="logo">
                    <span
                        style={{ cursor: 'pointer', color: '#8B6F6F', fontSize: '2rem', fontWeight: 'bold', userSelect: 'none' }}
                        onClick={() => { navigate('/'); window.location.reload(); }}
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { navigate('/'); window.location.reload(); } }}
                        aria-label="Go to homepage"
                        role="button"
                    >
                        BookStore
                    </span>
                </div>

                <div className="search-bar">
                    <input
                        type="text"
                        placeholder="Search books..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                navigate(`/filter?search=${encodeURIComponent(searchQuery.trim())}`);
                            }
                        }}
                    />
                    <button onClick={() => navigate(`/filter?search=${encodeURIComponent(searchQuery.trim())}`)}>Search</button>
                </div>

                <div className="user-options" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    {user && (
                        <span
                            className="chat-icon"
                            style={{ 
                                cursor: 'pointer',
                                marginRight: '0.5rem', 
                                fontSize: 22, 
                                color: '#8B6F6F', 
                                display: 'inline-flex',
                                alignItems: 'center',
                                position: 'relative'
                            }}
                            onClick={() => navigate('/chat')}
                            title="Chat"
                            tabIndex={0}
                            aria-label="Chat"
                        >
                            <FaComments />
                            {unreadCount > 0 && (
                                <span style={{
                                    position: 'absolute',
                                    top: -8,
                                    right: -8,
                                    background: '#e65100',
                                    color: 'white',
                                    borderRadius: '50%',
                                    padding: '2px 6px',
                                    fontSize: '12px',
                                    minWidth: '18px',
                                    height: '18px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </span>
                    )}
                    
                    <span
                        className="notification-icon"
                        style={{ cursor: 'pointer', marginRight: '0.5rem', fontSize: 22, color: '#8B6F6F', display: 'inline-flex', alignItems: 'center' }}
                        title="Notifications"
                        tabIndex={0}
                        onClick={() => alert('No notifications')}
                        aria-label="Notifications"
                    >
                        <FaBell />
                    </span>

                    <span
                        className="wishlist-icon"
                        style={{ cursor: 'pointer', marginRight: '0.5rem', fontSize: 22, color: '#e65100', display: 'inline-flex', alignItems: 'center' }}
                        onClick={() => navigate('/wishlist')}
                        title="Wishlist"
                        tabIndex={0}
                        aria-label="Wishlist"
                    >
                        <FaHeart />
                    </span>

                    <Link to="/cart" style={{ color: '#8B6F6F', fontSize: 22, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} title="Cart" aria-label="Cart">
                        🛒
                    </Link>

                    {user ? (
                        <div
                            style={{ display: 'inline-block', marginLeft: '1rem', cursor: 'pointer', position: 'relative' }}
                            tabIndex={0}
                            onMouseEnter={() => setShowDropdown(true)}
                            onMouseLeave={() => setShowDropdown(false)}
                        >
                            <img
                                src={profilePic || `https://ui-avatars.com/api/?name=${encodeURIComponent(username ? username[0] : 'U')}`}
                                alt="Profile"
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    border: '2px solid #8B6F6F',
                                    verticalAlign: 'middle',
                                }}
                            />
                            {showDropdown && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        background: '#fff',
                                        color: '#333',
                                        border: '1px solid #ddd',
                                        borderRadius: 6,
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                        minWidth: 140,
                                        zIndex: 10
                                    }}
                                >
                                    <button
                                        style={{
                                            width: '100%',
                                            background: 'none',
                                            border: 'none',
                                            padding: '0.75rem 1rem',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            color: '#333',
                                            fontWeight: 500,
                                            borderRadius: '6px 6px 0 0',
                                            borderBottom: '1px solid #eee'
                                        }}
                                        onClick={handleViewProfile}
                                        tabIndex={0}
                                    >
                                        View Profile
                                    </button>
                                    <button
                                        style={{
                                            width: '100%',
                                            background: 'none',
                                            border: 'none',
                                            padding: '0.75rem 1rem',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            color: '#e74c3c',
                                            fontWeight: 500,
                                            borderRadius: '0 0 6px 6px'
                                        }}
                                        onClick={handleSignOut}
                                        tabIndex={0}
                                    >
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link to="/sign-in" style={{ color: '#8B6F6F', fontWeight: 600, textDecoration: 'none', fontSize: 16 }}>Sign In</Link>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <div style={{ flex: 1, padding: '2rem', backgroundColor: '#f5f5f5' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        {/* Left Column */}
                        <div style={{ flex: '0 0 300px' }}>
                            <div style={{ position: 'relative' }}>
                                <img
                                    src={getBookImageSrc(book)}
                                    alt={book.title}
                                    style={{ width: '100%', height: '400px', objectFit: 'cover', borderRadius: '8px' }}
                                />
                                {/* Book type label */}
                                <div style={{
                                    position: 'absolute',
                                    top: 8,
                                    left: 8,
                                    background: book.bookType === 'old' ? '#e65100' : '#4CAF50',
                                    color: '#fff',
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    fontSize: '0.875rem',
                                    fontWeight: '600'
                                }}>
                                    {book.bookType === 'old' ? 'OLD' : 'NEW'}
                                </div>
                            </div>

                            {/* Stock Status */}
                            <div style={{ 
                                marginTop: '1rem',
                                padding: '0.5rem',
                                background: '#f8f9fa',
                                color: '#333',
                                borderRadius: '4px',
                                textAlign: 'center',
                                fontWeight: '500'
                            }}>
                                {book.stock > 0 
                                    ? `${book.stock} copies available` 
                                    : 'Out of Stock'}
                            </div>

                            {/* Cart and Wishlist Buttons */}
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button
                                    onClick={() => toggleCart(book._id)}
                                    disabled={book.stock === 0}
                                    style={{
                                        flex: 1,
                                        padding: '0.75rem',
                                        background: book.stock === 0 ? '#ccc' : (cart[book._id] ? '#e74c3c' : '#8B6F6F'),
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: book.stock === 0 ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {book.stock === 0 ? 'Out of Stock' : (cart[book._id] ? 'Remove from Cart' : 'Add to Cart')}
                                </button>
                                <button
                                    onClick={() => toggleWishlist(book._id)}
                                    style={{
                                        padding: '0.75rem',
                                        background: wishlist[book._id] ? '#e65100' : '#8B6F6F',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        width: '50px'
                                    }}
                                >
                                    {wishlist[book._id] ? <FaHeart /> : <FaRegHeart />}
                                </button>
                            </div>
                        </div>

                        {/* Right Column - Book Info */}
                        <div style={{ flex: 1 }}>
                            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#333' }}>{book.title}</h1>
                            <p style={{ fontSize: '1.25rem', color: '#666', marginBottom: '1rem' }}>By {book.author}</p>
                            <p style={{ fontSize: '1.5rem', color: '#e65100', fontWeight: '600', marginBottom: '1.5rem' }}>
                                {book.price} Tk
                            </p>
                            <div style={{ 
                                background: '#f8f9fa', 
                                padding: '1.5rem', 
                                borderRadius: '8px',
                                marginBottom: '1.5rem'
                            }}>
                                <h3 style={{ color: '#333', marginBottom: '1rem' }}>Book Details</h3>
                                <div style={{ display: 'grid', gap: '0.75rem', color: '#666' }}>
                                    <div><strong>Category:</strong> {book.category.join(', ')}</div> 
                                    <div><strong>Publisher:</strong> {book.publisher || 'N/A'}</div>
                                    <div><strong>ISBN:</strong> {book.isbn || 'N/A'}</div>
                                    <div><strong>Language:</strong> {book.language || 'N/A'}</div>
                                    <div><strong>Pages:</strong> {book.pages || 'N/A'}</div>
                                    {book.bookType === 'old' && (
                                        <>
                                            <div><strong>Condition:</strong> {book.condition}</div>
                                            <div><strong>Condition Details:</strong> {book.conditionDetails || 'N/A'}</div>
                                        </>
                                    )}
                                    <div>
                                        <strong>Seller:</strong> {sellerInfo?.username || book?.sellerEmail}
                                        {userEmail !== book?.sellerEmail && (
                                            <button
                                                onClick={() => setShowChat(true)}
                                                style={{
                                                    marginLeft: 12,
                                                    backgroundColor: '#8B6F6F',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: 20,
                                                    padding: '4px 12px',
                                                    fontSize: 14,
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 6
                                                }}
                                            >
                                                <FaComments /> Chat with Seller
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {book.desc && (
                                <div>
                                    <h3 style={{ color: '#333', marginBottom: '0.75rem' }}>Description</h3>
                                    <p style={{ color: '#666', lineHeight: '1.6' }}>{book.desc}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Similar Books Section */}
                    {book.relatedBooks?.length > 0 && (
                        <div style={{ marginTop: '3rem', borderTop: '1px solid #eee', paddingTop: '2rem' }}>
                            <h2 style={{ color: '#8B6F6F', marginBottom: '1.5rem' }}>Similar Books</h2>
                            <div style={{ position: 'relative' }}>
                                <button onClick={handleScrollLeft} className="scroll-button" style={{ left: 0 }}>
                                    <FaChevronLeft />
                                </button>
                                <div
                                    ref={scrollRef}
                                    style={{
                                        overflowX: 'auto',
                                        whiteSpace: 'nowrap',
                                        padding: '1rem 48px',
                                        scrollBehavior: 'smooth',
                                        WebkitOverflowScrolling: 'touch',
                                        msOverflowStyle: 'none',
                                        scrollbarWidth: 'none'
                                    }}
                                >
                                    {book.relatedBooks.map((relatedBook) => (
                                        <div
                                            key={relatedBook._id}
                                            onClick={() => navigate(`/book/${relatedBook._id}`)}
                                            style={{
                                                display: 'inline-block',
                                                width: '200px',
                                                marginRight: '1.5rem',
                                                verticalAlign: 'top',
                                                cursor: 'pointer',
                                                transition: 'transform 0.2s',
                                            }}
                                        >
                                            <div style={{ position: 'relative' }}>
                                                <img
                                                    src={relatedBook.images?.[0] || '/books/default-book.jpg'}
                                                    alt={relatedBook.title}
                                                    style={{
                                                        width: '100%',
                                                        height: '280px',
                                                        objectFit: 'cover',
                                                        borderRadius: '4px'
                                                    }}
                                                />
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: 8,
                                                        left: 8,
                                                        background: relatedBook.bookType === 'old' ? '#e65100' : '#4CAF50',
                                                        color: '#fff',
                                                        padding: '2px 8px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600'
                                                    }}
                                                >
                                                    {relatedBook.bookType === 'old' ? 'OLD' : 'NEW'}
                                                </div>
                                            </div>
                                            <h3 style={{ 
                                                fontSize: '1rem',
                                                marginTop: '0.5rem',
                                                marginBottom: '0.25rem',
                                                color: '#333',
                                                whiteSpace: 'normal'
                                            }}>
                                                {relatedBook.title}
                                            </h3>
                                            <p style={{ fontSize: '0.875rem', color: '#666' }}>{relatedBook.author}</p>
                                            <p style={{ color: '#e65100', fontWeight: '600' }}>{relatedBook.price} Tk</p>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={handleScrollRight} className="scroll-button" style={{ right: 0 }}>
                                    <FaChevronRight />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Window */}
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
