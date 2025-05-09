import React, { useState, useEffect, useRef } from 'react';
import { FaImage, FaPaperPlane } from 'react-icons/fa';
import io from 'socket.io-client';

const socket = io.connect('http://localhost:1015');

export default function Chat({ receiver, onClose }) {
  const [message, setMessage] = useState('');
  const [messageList, setMessageList] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const fileInputRef = useRef(null);
  const [room, setRoom] = useState('');
  const userEmail = localStorage.getItem('userEmail');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const roomId = [userEmail, receiver].sort().join('_');
    setRoom(roomId);
    socket.emit('join_room', roomId);

    fetch(`http://localhost:1015/chat/messages?room=${roomId}`)
      .then(res => res.json())
      .then(data => setMessageList(data));

    socket.on('receive_message', (data) => {
      setMessageList(prev => [...prev, data]);
    });

    return () => socket.off('receive_message');
  }, [receiver]);

  const handleImageSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() && !selectedImage) return;

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
      socket.emit('send_message', { ...messageData, room });
      setMessageList(prev => [...prev, messageData]);
      setMessage('');
      setSelectedImage(null);
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Failed to send message. Please try again.');
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <span>Chat with {receiver}</span>
        <button onClick={onClose}>×</button>
      </div>
      
      <div className="chat-messages">
        {messageList.map((msg, index) => (
          <div 
            key={index} 
            className={`message ${msg.sender === userEmail ? 'sent' : 'received'}`}
          >
            {msg.message && <div>{msg.message}</div>}
            {msg.image && (
              <img 
                src={msg.image} 
                alt="Chat attachment"
                style={{
                  maxWidth: '100%',
                  maxHeight: '200px',
                  borderRadius: '4px',
                  marginTop: msg.message ? '8px' : 0
                }}
              />
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
        
        {selectedImage && (
          <div style={{ position: 'relative', marginRight: '8px' }}>
            <img
              src={URL.createObjectURL(selectedImage)}
              alt="Selected"
              style={{
                width: '40px',
                height: '40px',
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

        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '20px',
            border: '1px solid #ddd',
            marginRight: '8px'
          }}
        />
        
        <button 
          onClick={sendMessage}
          style={{
            background: '#8B6F6F',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <FaPaperPlane />
        </button>
      </div>
    </div>
  );
}
