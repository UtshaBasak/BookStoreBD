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
    const socketRef = useRef();
    const fileInputRef = useRef(null);
    const navigate = useNavigate();
    const userEmail = localStorage.getItem('userEmail');

    // Add messageRef for scrolling
    const messagesEndRef = useRef(null);

    // Add scrollToBottom function
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // Add useEffect for auto-scrolling when new messages arrive
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        // Connect to Socket.IO
        socketRef.current = io('http://localhost:1015');
        
        // Load chat history
        if (userEmail) {
            fetch(`http://localhost:1015/chat/history/${userEmail}`)
                .then(res => res.json())
                .then(data => setConversations(data));
        }

        return () => {
            socketRef.current.disconnect();
        };
    }, [userEmail]);

    useEffect(() => {
        if (selectedUser && socketRef.current) {
            // Join chat room
            const room = [userEmail, selectedUser.email].sort().join('-');
            socketRef.current.emit('join_chat', room);

            // Load messages
            fetch(`http://localhost:1015/chat/messages?sender=${userEmail}&receiver=${selectedUser.email}`)
                .then(res => res.json())
                .then(data => setMessages(data));

            // Listen for new messages
            socketRef.current.on('receive_message', (data) => {
                setMessages(prev => [...prev, data]);
            });
        }
    }, [selectedUser, userEmail]);

    const handleImageSelect = (event) => {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            setSelectedImage(file);
        }
    };

    const sendMessage = async () => {
        if (!newMessage.trim() || !selectedUser) return;

        try {
            const messageData = {
                sender: userEmail,
                receiver: selectedUser.email,
                message: newMessage.trim(),
                timestamp: new Date()
            };

            const response = await fetch('http://localhost:1015/chat/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(messageData)
            });

            if (!response.ok) throw new Error('Failed to send message');

            const newMsg = await response.json();

            // Update messages state
            setMessages(prev => [...prev, newMsg]);
            
            // Clear input field
            setNewMessage('');

            // Send through socket
            const room = [userEmail, selectedUser.email].sort().join('-');
            socketRef.current?.emit('send_message', { ...messageData, room });

            // Scroll to bottom
            scrollToBottom();
        } catch (err) {
            console.error('Error sending message:', err);
            alert('Failed to send message. Please try again.');
        }
    };

    const deleteConversation = async (userToDelete) => {
        if (!window.confirm('Are you sure you want to delete this conversation?')) return;
        
        try {
            const response = await fetch('http://localhost:1015/chat/delete', {
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
                                            fontWeight: 600,
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
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {user.lastMessage || 'Start a conversation'}
                                        </div>
                                    </div>
                                </div>
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

                            <div style={{ 
                                flex: 1,
                                overflowY: 'auto',
                                padding: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                                background: '#f0f2f5'
                            }}>
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
