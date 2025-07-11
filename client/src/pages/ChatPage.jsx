import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHome, FaArrowLeft, FaPaperPlane, FaComments, FaTrash, FaImage } from 'react-icons/fa';
import io from 'socket.io-client';

export default function ChatPage() {
    const [conversations, setConversations] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [selectedImage, setSelectedImage] = useState(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const socketRef = useRef();
    const fileInputRef = useRef(null);
    const navigate = useNavigate();
    const userEmail = localStorage.getItem('userEmail');
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);

    const scrollToBottom = () => { 
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        socketRef.current = io('http://localhost:4000');
        
        if (userEmail) {
            // Add logging to debug
            console.log('Fetching chat history for:', userEmail);
            
            fetch(`http://localhost:4000/chat/history/${userEmail}`)
                .then(res => res.json())
                .then(data => {
                    console.log('Chat history response:', data);
                    // Make sure data is an array before setting
                    setConversations(Array.isArray(data) ? data : []);
                })
                .catch(err => {
                    console.error('Error fetching chat history:', err);
                });
        }

        return () => {
            socketRef.current.disconnect();
        };
    }, [userEmail]);

    useEffect(() => {
        if (selectedUser && userEmail) {
            // Mark messages as read when chat is opened
            fetch('http://localhost:4000/chat/read', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sender: selectedUser.email,
                    receiver: userEmail
                })
            });

            // Only reset messages if switching user
            setMessages([]);
            setPage(1);
            setHasMore(true);

            const room = [userEmail, selectedUser.email].sort().join('-');
            socketRef.current.emit('join_chat', room);

            // Use async/await for initial fetch
            const fetchMessages = async () => {
                setLoading(true);
                try {
                    const res = await fetch(`http://localhost:4000/chat/messages?sender=${userEmail}&receiver=${selectedUser.email}&page=1&limit=20`);
                    const data = await res.json();
                    setMessages(Array.isArray(data.messages) ? data.messages : []);
                } catch (err) {
                    setMessages([]);
                } finally {
                    setLoading(false);
                }
            };
            fetchMessages();

            // Clean up socket listener to prevent message duplication
            const handleMessage = (data) => {
                // Only add message if it's for the current conversation
                if (
                    (data.sender === userEmail && data.receiver === selectedUser.email) ||
                    (data.sender === selectedUser.email && data.receiver === userEmail)
                ) {
                    setMessages(prev => [...prev, data]);
                }
            };
            
            socketRef.current.on('receive_message', handleMessage);

            return () => {
                socketRef.current.off('receive_message', handleMessage);
                setMessages([]); // Clear messages when unmounting
            };
        }
    }, [selectedUser, userEmail]);

    const loadMessages = async (pageNum) => {
        if (loading || !hasMore || !selectedUser) return;
        
        setLoading(true);
        try {
            const response = await fetch(
                `http://localhost:4000/chat/messages?sender=${userEmail}&receiver=${selectedUser.email}&page=${pageNum}&limit=20`
            );
            const data = await response.json();
            
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
            console.error('Error loading messages:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleScroll = (e) => {
        const container = e.target;
        if (container.scrollTop === 0 && hasMore && !loading && selectedUser) {
            const nextPage = page + 1;
            setPage(nextPage);
            loadMessages(nextPage);
        }
    };

    const handleImageSelect = (event) => {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            setSelectedImage(file);
        }
    };

    const sendMessage = async () => {
        if ((!newMessage.trim() && !selectedImage) || !selectedUser) return;

        try {
            const formData = new FormData();
            formData.append('sender', userEmail);
            formData.append('receiver', selectedUser.email);
            formData.append('message', newMessage.trim());
            
            if (selectedImage) {
                formData.append('image', selectedImage);
            }

            const response = await fetch('http://localhost:4000/chat/message', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Failed to send message');

            const newMsg = await response.json();
            setMessages(prev => [...prev, newMsg]);
            setNewMessage('');
            setSelectedImage(null);

            const room = [userEmail, selectedUser.email].sort().join('-');
            socketRef.current?.emit('send_message', { ...newMsg, room });

            scrollToBottom();
        } catch (err) {
            console.error('Error sending message:', err);
            alert('Failed to send message. Please try again.');
        }
    };

    const deleteConversation = async (userToDelete) => {
        if (!window.confirm('Are you sure you want to delete this conversation?')) return;
        
        try {
            const response = await fetch('http://localhost:4000/chat/delete', {
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
            console.error('Error deleting conversation:', err);
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

            {/* Main Content */}
            <div style={{ 
                flex: 1,
                display: 'flex',
                padding: '1rem',
                gap: '1rem',
                maxWidth: '1600px',
                margin: '0 auto',
                width: '85%',
            }}>
                {/* Conversations List */}
                <div style={{ 
                    width: '300px',
                    flexShrink: 0,
                    background: '#fff',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid #eee' }}>
                        <h2 style={{ margin: 0, color: '#666' }}>Conversations</h2>
                    </div>
                    <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
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
                <div style={{ 
                    flex: 1,
                    minWidth: '800px',
                    background: '#fff',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: '1000px',
                    height: 'calc(100vh - 150px)',
                    maxHeight: 'calc(100vh - 150px)'
                }}>
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
                                    <div key={i} style={{ 
                                        alignSelf: msg.sender === userEmail ? 'flex-end' : 'flex-start',
                                        maxWidth: '60%',
                                        margin: '0.5rem 0'
                                    }}>
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
                                    accept="image/*"
                                    onChange={handleImageSelect}
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    onClick={() => fileInputRef.current.click()}
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
                                            src={URL.createObjectURL(selectedImage)}
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
