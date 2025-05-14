import React, { useState, useEffect, useRef } from 'react';
import { FaTimes, FaPaperPlane, FaImage } from 'react-icons/fa';
import io from 'socket.io-client';

export default function ChatWindow({ receiver, receiverName, onClose }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const userEmail = localStorage.getItem('userEmail');
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io('http://localhost:1015');
    setSocket(newSocket);

    // Mark messages as read
    fetch('http://localhost:1015/chat/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: receiver,
        receiver: userEmail
      })
    });

    // Join chat room
    const room = [userEmail, receiver].sort().join('-');
    newSocket.emit('join_chat', room);

    // Load chat history
    fetch(`http://localhost:1015/chat/messages?sender=${userEmail}&receiver=${receiver}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.messages) {
          setMessages(data.messages);
        }
      })
      .catch(err => console.error('Error loading messages:', err));

    // Handle incoming messages
    const handleNewMessage = (data) => {
      if ((data.sender === receiver && data.receiver === userEmail) ||
          (data.sender === userEmail && data.receiver === receiver)) {
        setMessages(prev => [...prev, data]);
      }
    };

    newSocket.on('receive_message', handleNewMessage);

    return () => {
      newSocket.off('receive_message', handleNewMessage);
      newSocket.disconnect();
    };
  }, [userEmail, receiver]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
    }
  };

  const sendMessage = async () => {
    if ((!message.trim() && !selectedImage) || !receiver) return;

    try {
      const formData = new FormData();
      formData.append('sender', userEmail);
      formData.append('receiver', receiver);
      formData.append('message', message.trim() || '');
      
      if (selectedImage) {
        formData.append('image', selectedImage);
      }

      const res = await fetch('http://localhost:1015/chat/message', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Failed to send message');

      const messageData = await res.json();

      // Send through socket
      const room = [userEmail, receiver].sort().join('-');
      socket.emit('send_message', { ...messageData, room });

      setMessages(prev => [...prev, messageData]);
      setMessage('');
      setSelectedImage(null);
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send message. Please try again.');
    }
  };

  if (!userEmail || !receiver) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      width: 320,
      height: 400,
      backgroundColor: 'white',
      borderRadius: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
      overflow: 'hidden'
    }}>
      {/* Chat Header */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#8B6F6F',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ fontWeight: 500 }}>Chat with {receiverName}</span>
        <FaTimes 
          onClick={onClose}
          style={{ cursor: 'pointer' }}
        />
      </div>

      {/* Messages Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        backgroundColor: '#f8f9fa'
      }}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              alignSelf: msg.sender === userEmail ? 'flex-end' : 'flex-start',
              maxWidth: '60%',
              margin: '0.5rem 0'
            }}
          >
            <div style={{
              background: msg.sender === userEmail ? '#8B6F6F' : '#e9ecef',
              color: msg.sender === userEmail ? 'white' : 'black',
              padding: msg.image ? '0.5rem' : '8px 12px',
              borderRadius: 12,
              maxWidth: '100%',
              wordBreak: 'break-word'
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

      {/* Input Area */}
      <div style={{
        padding: 12,
        borderTop: '1px solid #eee',
        display: 'flex',
        gap: 8,
        backgroundColor: 'white',
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
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 20,
            border: '1px solid #ddd',
            outline: 'none'
          }}
        />
        <button
          onClick={sendMessage}
          style={{
            backgroundColor: '#8B6F6F',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <FaPaperPlane size={16} />
        </button>
      </div>
    </div>
  );
}
