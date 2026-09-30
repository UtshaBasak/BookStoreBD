import { useState, useEffect, useRef, type ChangeEvent, type UIEvent } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaPaperPlane, FaComments, FaTrash, FaImage, FaBookOpen } from 'react-icons/fa';

import type { ChatMessage, ChatMessagesResponse, ChatSummary } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { subscribeToMessages } from '../utils/socket.js';
import { reportError } from '../utils/report.js';
import AuthImage from '../components/AuthImage.js';
import FilePreview from '../components/FilePreview.js';
import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import './Homepage.css';
import '../components/Chat.css';

export default function ChatPage() {
    const [conversations, setConversations] = useState<ChatSummary[]>([]);
    const [selectedUser, setSelectedUser] = useState<ChatSummary | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    /** What the open conversation does with a live message; nothing when none is open. */
    const onMessageRef = useRef<((message: ChatMessage) => void) | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const toast = useToast();
    const userEmail = getUserEmail();
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const messagesContainerRef = useRef<HTMLDivElement | null>(null);

    const scrollToBottom = () => { 
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        // Live messages. The server sends each person only what is addressed
        // to them, so nothing is joined and nothing is sent from here.
        const stop = subscribeToMessages((message) => onMessageRef.current?.(message));
        
        if (userEmail) {
            // Add logging to debug
            
            apiFetch(`${API_BASE_URL}/chat/history/${userEmail}`)
                .then(res => res.json() as Promise<ChatSummary[]>)
                .then(data => {
                    // Make sure data is an array before setting
                    setConversations(Array.isArray(data) ? data : []);
                })
                .catch(err => {
                    reportError('Error fetching chat history:', err);
                });
        }

        return stop;
    }, [userEmail]);

    // Switching conversation resets the thread. Done during render, comparing
    // against the previous selection, which is the documented alternative to
    // resetting state from an effect.
    const [shownUser, setShownUser] = useState(selectedUser?.email ?? null);
    if ((selectedUser?.email ?? null) !== shownUser) {
        setShownUser(selectedUser?.email ?? null);
        setMessages([]);
        setPage(1);
        setHasMore(true);
    }

    useEffect(() => {
        if (selectedUser && userEmail) {
            // Mark messages as read when chat is opened
            apiFetch(`${API_BASE_URL}/chat/read`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sender: selectedUser.email,
                    receiver: userEmail
                })
            });

            // Use async/await for initial fetch
            const fetchMessages = async () => {
                setLoading(true);
                try {
                    const res = await apiFetch(`${API_BASE_URL}/chat/messages?sender=${userEmail}&receiver=${selectedUser.email}&page=1&limit=20`);
                    const data = (await res.json()) as ChatMessagesResponse;
                    setMessages(Array.isArray(data.messages) ? data.messages : []);
                } catch (error) {
                    reportError('Failed to load messages:', error);
                    setMessages([]);
                } finally {
                    setLoading(false);
                }
            };
            fetchMessages();

            // Clean up socket listener to prevent message duplication
            const handleMessage = (data: ChatMessage) => {
                // Only add message if it's for the current conversation
                if (
                    (data.sender === userEmail && data.receiver === selectedUser.email) ||
                    (data.sender === selectedUser.email && data.receiver === userEmail)
                ) {
                    setMessages(prev => [...prev, data]);
                }
            };
            
            onMessageRef.current = handleMessage;

            return () => {
                onMessageRef.current = null;
                setMessages([]); // Clear messages when unmounting
            };
        }
    }, [selectedUser, userEmail]);

    const loadMessages = async (pageNum: number) => {
        if (loading || !hasMore || !selectedUser) return;
        
        setLoading(true);
        try {
            const response = await fetch(
                `${API_BASE_URL}/chat/messages?sender=${userEmail}&receiver=${selectedUser.email}&page=${pageNum}&limit=20`
            );
            const data = (await response.json()) as ChatMessagesResponse;
            
            if (!Array.isArray(data.messages)) {
                setHasMore(false);
                setLoading(false);
                return;
            }

            if (data.messages.length < 20) {
                setHasMore(false);
            }

            if (pageNum === 1) {
                setMessages(data.messages);
            } else {
                setMessages(prev => [...data.messages, ...prev]);
            }
        } catch (error) {
            reportError('Error loading messages:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleScroll = (e: UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        if (container.scrollTop === 0 && hasMore && !loading && selectedUser) {
            const nextPage = page + 1;
            setPage(nextPage);
            loadMessages(nextPage);
        }
    };

    const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            setSelectedImage(file);
        }
    };

    const sendMessage = async () => {
        if ((!newMessage.trim() && !selectedImage) || !selectedUser) return;

        try {
            const formData = new FormData();
            formData.append('sender', userEmail ?? '');
            formData.append('receiver', selectedUser.email);
            formData.append('message', newMessage.trim());
            
            if (selectedImage) {
                formData.append('image', selectedImage);
            }

            const response = await apiFetch(`${API_BASE_URL}/chat/message`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Failed to send message');

            const newMsg = (await response.json()) as ChatMessage;
            setMessages(prev => [...prev, newMsg]);
            setNewMessage('');
            setSelectedImage(null);

            scrollToBottom();
        } catch (err) {
            reportError('Error sending message:', err);
            toast.error('Message not sent. Please try again.');
        }
    };

    const deleteConversation = async (userToDelete: ChatSummary) => {
        // eslint-disable-next-line no-alert -- a confirmation needs an answer; replacing it needs a dialog component
        if (!window.confirm('Are you sure you want to delete this conversation?')) return;
        
        try {
            const response = await apiFetch(`${API_BASE_URL}/chat/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user1: userEmail,
                    user2: userToDelete.email
                })
            });

            if (response.ok) {
                setConversations(prev => 
                    prev.filter(conv => conv.email !== userToDelete.email)
                );
                if (selectedUser?.email === userToDelete.email) {
                    setSelectedUser(null);
                    setMessages([]);
                }
            }
        } catch (err) {
            reportError('Error deleting conversation:', err);
        }
    };

    return (
        <div className="chat-page">
            {/* The homepage's frosted bar, with the page's name beside the logo. */}
            <header className="header">
                <div className="chat-header-title">
                    <Link to="/" className="logo-link inline-flex min-h-11 items-center no-underline">
                        <Logo size={34} />
                    </Link>
                    <span className="chat-divider" aria-hidden="true" />
                    <FaComments className="chat-header-icon" size={22} aria-hidden="true" />
                    <h1>Messages</h1>
                </div>
                <div className="user-options">
                    <NotificationBell />
                </div>
            </header>

            {/* Main Content.

                On a phone the two panes take it in turns, the way every chat
                application does it: the list until a conversation is picked,
                then the conversation with a way back. Side by side from `lg`,
                where both fit (see Chat.css). The message pane used to carry
                `minWidth: 1000px`, which put the page 999px past the edge of a
                360px screen. */}
            <div className={`chat-shell${selectedUser ? ' has-thread' : ''}`}>
                {/* Conversations List */}
                <section className="card chat-list" aria-label="Conversations">
                    <div className="chat-list-head">
                        <h2>Conversations</h2>
                        {conversations.length > 0 && (
                            <span className="badge chat-count">{conversations.length}</span>
                        )}
                    </div>
                    <div className="chat-list-body">
                        {/* An empty panel says nothing about what to do next. */}
                        {conversations.length === 0 && (
                            <div className="chat-empty">
                                <span className="chat-empty-icon is-small" aria-hidden="true">
                                    <FaComments size={26} />
                                </span>
                                <p style={{ margin: '0.75rem 0 0.25rem', fontWeight: 700, color: '#111827' }}>No conversations yet.</p>
                                <p style={{ fontSize: '0.9rem' }}>
                                    Open any book and use <strong>Chat with Seller</strong> to start one.
                                </p>
                                <Link to="/filter" className="btn btn-ghost">
                                    <FaBookOpen size={14} aria-hidden="true" />
                                    Browse books
                                </Link>
                            </div>
                        )}
                        {conversations.map(user => {
                            const active = selectedUser?.email === user.email;
                            const unread = user.unreadCount > 0;
                            return (
                                <div
                                    key={user.email}
                                    className={`chat-row${active ? ' is-active' : ''}${unread ? ' is-unread' : ''}`}
                                >
                                    <button
                                        type="button"
                                        className="chat-row-main"
                                        onClick={() => setSelectedUser(user)}
                                        aria-current={active ? 'true' : undefined}
                                    >
                                        <Avatar user={user} />
                                        <span className="chat-row-text">
                                            <span className="chat-row-top">
                                                <span className="chat-row-name">
                                                    {user.username || user.email}
                                                </span>
                                                <span className="chat-row-time">
                                                    {shortWhen(user.lastMessageTime)}
                                                </span>
                                            </span>
                                            <span className="chat-row-bottom">
                                                <span className="chat-row-preview">
                                                    {user.lastMessage || 'Start a conversation'}
                                                </span>
                                                {unread && (
                                                    <span className="chat-unread" aria-label={`${user.unreadCount} unread`}>
                                                        {user.unreadCount > 99 ? '99+' : user.unreadCount}
                                                    </span>
                                                )}
                                            </span>
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        className="chat-delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteConversation(user);
                                        }}
                                        title="Delete conversation"
                                        aria-label="Delete conversation"
                                    >
                                        <FaTrash size={15} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Message Area */}
                <section className="card chat-thread" aria-label="Messages">
                    {selectedUser ? (
                        <>
                            <div className="chat-thread-head">
                                {/* The only way back to the list on a phone,
                                    where the list is not on screen. */}
                                <button
                                    type="button"
                                    className="icon-button chat-back-list"
                                    onClick={() => setSelectedUser(null)}
                                    aria-label="Back to conversations"
                                >
                                    <FaArrowLeft size={18} />
                                </button>
                                <Avatar user={selectedUser} className="is-small" />
                                <div className="chat-thread-who">
                                    <h2>
                                        {selectedUser.username || selectedUser.email}
                                    </h2>
                                </div>
                            </div>

                            <div
                                ref={messagesContainerRef}
                                onScroll={handleScroll}
                                className="chat-messages"
                            >
                                {loading && <div className="chat-loading">Loading...</div>}
                                {messages.map((msg, i) => {
                                    const own = msg.sender === userEmail;
                                    return (
                                        <div
                                            key={i}
                                            className={`chat-msg${own ? ' is-own' : ''}`}
                                        >
                                            <div className={`chat-bubble${msg.image ? ' has-image' : ''}`}>
                                                {msg.image && (
                                                    <AuthImage
                                                        src={msg.image}
                                                        alt="Chat attachment"
                                                        className="chat-bubble-image"
                                                    />
                                                )}
                                                {msg.message && <div className="chat-bubble-text">{msg.message}</div>}
                                            </div>
                                            {msg.timestamp && (
                                                <time className="chat-time" dateTime={msg.timestamp}>
                                                    {messageWhen(msg.timestamp)}
                                                </time>
                                            )}
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            <div className="chat-composer">
                                <input name="image"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    onChange={handleImageSelect}
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    type="button"
                                    className="chat-attach"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Add image"
                                    aria-label="Add image"
                                >
                                    <FaImage size={19} />
                                </button>

                                {selectedImage && (
                                    <div className="chat-preview">
                                        <FilePreview file={selectedImage} alt="Selected" max={120} />
                                        <button
                                            type="button"
                                            className="chat-preview-remove"
                                            onClick={() => setSelectedImage(null)}
                                            aria-label="Remove image"
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}

                                <input name="message"
                                    type="text"
                                    className="field chat-input"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                    placeholder="Type a message..."
                                />
                                <button
                                    type="button"
                                    className="btn btn-primary chat-send"
                                    onClick={() => sendMessage()}
                                    aria-label="Send message"
                                >
                                    <FaPaperPlane size={17} />
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="chat-empty">
                            <span className="chat-empty-icon" aria-hidden="true">
                                <FaComments size={36} />
                            </span>
                            <h2>Your Messages</h2>
                            <p>
                                Select a conversation to start chatting
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

/** Two letters for someone with no photo: "nadia_books" is NB. */
function initialsOf(name: string) {
    const words = name.split(/[\s._@-]+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
    return letters.toUpperCase() || '?';
}

/*
 * A photo when there is one, initials on the brand gradient when not. It used
 * to fall back to ui-avatars.com, which meant a request to a third party with
 * the person's name in it, in the old brown.
 */
function Avatar({ user, className = '' }: { user: ChatSummary; className?: string }) {
    if (user.profilePicture) {
        return <img src={user.profilePicture} alt="" className={`chat-avatar ${className}`} />;
    }
    return (
        <span className={`chat-avatar ${className}`} aria-hidden="true">
            {initialsOf(user.username || user.email)}
        </span>
    );
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "3:05 pm" today, "12 Sep" before that - for the list. */
function shortWhen(iso?: string) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return sameDay(d, new Date())
        ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** The time under a bubble, with the date too when it was not today. */
function messageWhen(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return sameDay(d, new Date())
        ? time
        : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}
