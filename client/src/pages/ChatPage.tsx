import { useState, useEffect, useRef, type ChangeEvent, type UIEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaPaperPlane, FaComments, FaTrash, FaImage } from 'react-icons/fa';
import { io, type Socket } from 'socket.io-client';

import type { ChatMessage, ChatMessagesResponse, ChatSummary } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { safeObjectUrl } from '../utils/safeImageSrc.js';
import { reportError } from '../utils/report.js';

export default function ChatPage() {
    const [conversations, setConversations] = useState<ChatSummary[]>([]);
    const [selectedUser, setSelectedUser] = useState<ChatSummary | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const socketRef = useRef<Socket | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const navigate = useNavigate();
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
        socketRef.current = io(API_BASE_URL);
        
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

        return () => {
            socketRef.current?.disconnect();
        };
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

            const room = [userEmail, selectedUser.email].sort().join('-');
            socketRef.current?.emit('join_chat', room);

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
            
            socketRef.current?.on('receive_message', handleMessage);

            return () => {
                socketRef.current?.off('receive_message', handleMessage);
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

            const room = [userEmail, selectedUser.email].sort().join('-');
            socketRef.current?.emit('send_message', { ...newMsg, room });

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
        <div style={{ 
            minHeight: '100vh',
            backgroundColor: '#f0f2f5',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Header */}
            <div style={{ 
                padding: '1rem',
                background: '#fff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                position: 'sticky',
                top: 0,
                zIndex: 100
            }}>
                <button 
                    onClick={() => navigate('/')}
                    style={{ 
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: '#8B6F6F',
                        fontSize: '1rem',
                        padding: '0.5rem'
                    }}
                >
                    <FaArrowLeft size={20} />
                    Back to Home
                </button>
                <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: '#8B6F6F'
                }}>
                    <FaComments size={24} />
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Messages</h1>
                </div>
            </div>

            {/* Main Content.

                On a phone the two panes take it in turns, the way every chat
                application does it: the list until a conversation is picked,
                then the conversation with a way back. Side by side from `lg`,
                where both fit. The message pane used to carry
                `minWidth: 1000px`, which put the page 999px past the edge of a
                360px screen. */}
            <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-2 sm:p-4 lg:w-[85%] lg:flex-row">
                {/* Conversations List */}
                <div
                    className={`${selectedUser ? 'hidden lg:block' : 'block'} w-full overflow-hidden rounded-xl lg:w-[300px] lg:shrink-0`}
                    style={{
                        background: '#fff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                >
                    <div style={{ padding: '1rem', borderBottom: '1px solid #eee' }}>
                        <h2 style={{ margin: 0, color: '#666' }}>Conversations</h2>
                    </div>
                    <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
                        {/* An empty panel says nothing about what to do next. */}
                        {conversations.length === 0 && (
                            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#666' }}>
                                <p style={{ margin: '0 0 0.5rem' }}>No conversations yet.</p>
                                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                                    Open any book and use <strong>Chat with Seller</strong> to start one.
                                </p>
                            </div>
                        )}
                        {conversations.map(user => (
                            <div
                                key={user.email}
                                style={{
                                    padding: '1rem',
                                    background: selectedUser?.email === user.email ? '#f0f2f5' : '#fff',
                                    borderBottom: '1px solid #eee',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    transition: 'background-color 0.2s'
                                }}
                            >
                                <div 
                                    onClick={() => setSelectedUser(user)}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <img
                                        src={user.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || 'U')}&background=8B6F6F&color=fff`}
                                        alt=""
                                        style={{ 
                                            width: 50,
                                            height: 50,
                                            borderRadius: '50%',
                                            objectFit: 'cover'
                                        }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ 
                                            fontWeight: user.unreadCount > 0 ? 700 : 600,
                                            color: '#333',
                                            marginBottom: '0.25rem'
                                        }}>
                                            {user.username || user.email}
                                        </div>
                                        <div style={{ 
                                            fontSize: '0.875rem',
                                            color: '#666',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            fontWeight: user.unreadCount > 0 ? 600 : 'normal'
                                        }}>
                                            {user.lastMessage || 'Start a conversation'}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteConversation(user);
                                    }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#dc3545',
                                        cursor: 'pointer',
                                        padding: '8px',
                                        opacity: 0.7,
                                        transition: 'opacity 0.2s'
                                    }}
                                    title="Delete conversation"
                                >
                                    <FaTrash size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Message Area */}
                <div
                    className={`${selectedUser ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col overflow-hidden rounded-xl`}
                    style={{
                        background: '#fff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        height: 'calc(100vh - 150px)',
                        maxHeight: 'calc(100vh - 150px)'
                    }}
                >
                    {selectedUser ? (
                        <>
                            <div style={{
                                padding: '1rem',
                                borderBottom: '1px solid #eee',
                                background: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem'
                            }}>
                                {/* The only way back to the list on a phone,
                                    where the list is not on screen. */}
                                <button
                                    type="button"
                                    className="icon-button lg:hidden"
                                    onClick={() => setSelectedUser(null)}
                                    aria-label="Back to conversations"
                                >
                                    <FaArrowLeft />
                                </button>
                                <img
                                    src={selectedUser.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedUser.username || 'U')}&background=8B6F6F&color=fff`}
                                    alt=""
                                    style={{ width: 40, height: 40, borderRadius: '50%' }}
                                />
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                                        {selectedUser.username || selectedUser.email}
                                    </h2>
                                </div>
                            </div>

                            <div 
                                ref={messagesContainerRef}
                                onScroll={handleScroll}
                                style={{ 
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '1rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem',
                                    background: '#f0f2f5'
                                }}
                            >
                                {loading && <div style={{ textAlign: 'center', padding: '10px' }}>Loading...</div>}
                                {messages.map((msg, i) => (
                                    <div
                                        key={i}
                                        // 60% of a 360px screen is 216px for a
                                        // message; 85% until there is room.
                                        className="my-2 max-w-[85%] sm:max-w-[60%]"
                                        style={{
                                            alignSelf: msg.sender === userEmail ? 'flex-end' : 'flex-start'
                                        }}
                                    >
                                        <div style={{
                                            background: msg.sender === userEmail ? '#8B6F6F' : '#fff',
                                            color: msg.sender === userEmail ? '#fff' : '#333',
                                            padding: msg.image ? '0.5rem' : '0.75rem 1rem',
                                            borderRadius: '1rem',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                        }}>
                                            {msg.message && <div style={{ marginBottom: msg.image ? '0.5rem' : 0 }}>{msg.message}</div>}
                                            {msg.image && (
                                                <img
                                                    src={msg.image}
                                                    alt="Chat attachment"
                                                    style={{
                                                        maxWidth: '100%',
                                                        maxHeight: '200px',
                                                        width: 'auto',
                                                        height: 'auto',
                                                        borderRadius: '0.5rem',
                                                        display: 'block'
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            <div style={{ 
                                padding: '1rem',
                                background: '#fff',
                                borderTop: '1px solid #eee',
                                display: 'flex',
                                gap: '1rem',
                                alignItems: 'center'
                            }}>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    onChange={handleImageSelect}
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#8B6F6F',
                                        cursor: 'pointer',
                                        padding: '8px'
                                    }}
                                    title="Add image"
                                >
                                    <FaImage size={20} />
                                </button>
                                
                                {selectedImage && (
                                    <div style={{ 
                                        position: 'relative', 
                                        width: 40, 
                                        height: 40 
                                    }}>
                                        <img
                                            src={safeObjectUrl(selectedImage)}
                                            alt="Selected"
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                                borderRadius: '4px'
                                            }}
                                        />
                                        <button
                                            onClick={() => setSelectedImage(null)}
                                            style={{
                                                position: 'absolute',
                                                top: -8,
                                                right: -8,
                                                background: '#fff',
                                                border: '1px solid #ddd',
                                                borderRadius: '50%',
                                                width: 20,
                                                height: 20,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}

                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                    placeholder="Type a message..."
                                    style={{
                                        flex: 1,
                                        padding: '0.75rem 1rem',
                                        border: '1px solid #ddd',
                                        borderRadius: '2rem',
                                        outline: 'none',
                                        fontSize: '1rem'
                                    }}
                                />
                                <button
                                    onClick={() => sendMessage()}
                                    style={{
                                        background: '#8B6F6F',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '50%',
                                        width: 45,
                                        height: 45,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s'
                                    }}
                                >
                                    <FaPaperPlane size={20} />
                                </button>
                            </div>
                        </>
                    ) : (
                        <div style={{ 
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#666',
                            padding: '2rem',
                            textAlign: 'center'
                        }}>
                            <FaComments size={48} style={{ marginBottom: '1rem', color: '#8B6F6F' }} />
                            <h2 style={{ margin: '0 0 0.5rem 0' }}>Your Messages</h2>
                            <p style={{ margin: 0, color: '#888' }}>
                                Select a conversation to start chatting
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
