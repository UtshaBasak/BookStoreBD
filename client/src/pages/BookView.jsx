import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FaHeart, FaRegHeart, FaChevronLeft, FaChevronRight, FaComments, FaBell } from 'react-icons/fa';
import ChatWindow from '../components/ChatWindow';

export default function BookView() {
    const [book, setBook] = useState(null);
    const [user, setUser] = useState(null);
    const [profilePic, setProfilePic] = useState(null);
    const [username, setUsername] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [wishlist, setWishlist] = useState({});
    const [cart, setCart] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [showChat, setShowChat] = useState(false);
    const [sellerInfo, setSellerInfo] = useState(null);
    const { id } = useParams();
    const navigate = useNavigate();
    const userEmail = localStorage.getItem('userEmail');
    const scrollRef = React.useRef();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch book details with stock info
    useEffect(() => {
        const fetchBook = async () => {
            try {
                setLoading(true);
                const response = await fetch(`http://localhost:1015/book/${id}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch book');
                }
                const data = await response.json();
                console.log('Fetched book:', data); // Debug log
                setBook(data);
            } catch (err) {
                console.error('Error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchBook();
        }
    }, [id]);

    // Fetch seller info
    useEffect(() => {
        if (book?.sellerEmail) {
            fetch(`http://localhost:1015/user/profile?email=${book.sellerEmail}`)
                .then(res => res.json())
                .then(data => setSellerInfo(data));
        }
    }, [book?.sellerEmail]);

    // Get user data
    useEffect(() => {
        const email = localStorage.getItem('userEmail');
        if (email) {
            setUser({ email });
            fetch(`http://localhost:1015/user/profile?email=${email}`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) {
                        if (data.profilePicture) setProfilePic(data.profilePicture);
                        if (data.username) setUsername(data.username);
                    }
                });
        }
    }, []);

    // Add/update cart state loading
    useEffect(() => {
        if (!userEmail) return;
        fetch(`http://localhost:1015/cart?email=${encodeURIComponent(userEmail)}`)
            .then(res => res.json())
            .then(data => {
                const cartMap = {};
                data.forEach(book => { cartMap[book._id] = true; });
                setCart(cartMap);
            });
    }, [userEmail]);

    // Add/update wishlist state loading
    useEffect(() => {
        if (!userEmail) return;
        fetch(`http://localhost:1015/wishlist?email=${encodeURIComponent(userEmail)}`)
            .then(res => res.json())
            .then(data => {
                const wishMap = {};
                data.forEach(book => { wishMap[book._id] = true; });
                setWishlist(wishMap);
            });
    }, [userEmail]);

    const toggleCart = async (bookId) => {
        if (!userEmail) {
            alert('Please sign in to use cart.');
            return;
        }

        if (book.stock <= 0) {
            alert('Sorry, this book is out of stock!');
            return;
        }

        try {
            const isInCart = !!cart[bookId];
            const response = await fetch(`http://localhost:1015/cart/${isInCart ? 'remove' : 'add'}/${bookId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userEmail })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update cart');
            }

            const data = await response.json();
            const cartMap = {};
            data.forEach(book => { cartMap[book._id] = true; });
            setCart(cartMap);
            alert(isInCart ? 'Removed from cart!' : 'Added to cart successfully!');
        } catch (error) {
            console.error('Cart error:', error);
            alert(error.message || 'Failed to update cart');
        }
    };

    const toggleWishlist = async (bookId) => {
        if (!userEmail) {
            alert('Please sign in to use wishlist.');
            return;
        }

        try {
            const isInWishlist = !!wishlist[bookId];
            const response = await fetch(`http://localhost:1015/wishlist/${isInWishlist ? 'remove' : 'add'}/${bookId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userEmail })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update wishlist');
            }

            const data = await response.json();
            const wishMap = {};
            data.forEach(book => { wishMap[book._id] = true; });
            setWishlist(wishMap);
            alert(isInWishlist ? 'Removed from wishlist!' : 'Added to wishlist successfully!');
        } catch (error) {
            console.error('Wishlist error:', error);
            alert(error.message || 'Failed to update wishlist');
        }
    };

    const handleSignOut = () => {
        localStorage.removeItem('userEmail');
        setUser(null);
        setProfilePic(null);
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

    const getBookImageSrc = (book) => {
        if (!book) return 'https://via.placeholder.com/300x450?text=No+Image';
        const img = book.images?.[0];
        if (!img) return 'https://via.placeholder.com/300x450?text=No+Image';
        if (img.startsWith('data:image/')) return img;
        if (/^https?:\/\//.test(img)) return img;
        return `http://localhost:1015/uploads/${img}`;
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
                        placeholder="Search books or authors..."
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
                            style={{ cursor: 'pointer', marginRight: '0.5rem', fontSize: 22, color: '#8B6F6F', display: 'inline-flex', alignItems: 'center' }}
                            onClick={() => navigate('/chat')}
                            title="Chat"
                            tabIndex={0}
                            aria-label="Chat"
                        >
                            <FaComments />
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
                                    <div><strong>Publisher:</strong> {book.publisher || 'N/A'}</div>
                                    <div><strong>ISBN:</strong> {book.isbn || 'N/A'}</div>
                                    <div><strong>Language:</strong> {book.language || 'N/A'}</div>
                                    <div><strong>Pages:</strong> {book.pages || 'N/A'}</div>
                                    {book.bookType === 'old' && (
                                        <div><strong>Condition:</strong> {book.condition}</div>
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
                                                ':hover': {
                                                    transform: 'translateY(-5px)'
                                                }
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
