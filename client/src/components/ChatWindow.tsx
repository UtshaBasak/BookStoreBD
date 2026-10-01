import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { FaTimes, FaPaperPlane, FaImage } from 'react-icons/fa';

import type { ChatMessage, ChatMessagesResponse } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { subscribeToMessages } from '../utils/socket.js';
import { reportError } from '../utils/report.js';
import AuthImage from './AuthImage.js';
import FilePreview from './FilePreview.js';
import './Chat.css';

interface ChatWindowProps {
  receiver: string;
  receiverName: string;
  onClose: () => void;
}

export default function ChatWindow({ receiver, receiverName, onClose }: ChatWindowProps) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const userEmail = getUserEmail();
  const toast = useToast();
  useEffect(() => {
    // Mark messages as read
    apiFetch(`${API_BASE_URL}/chat/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: receiver,
        receiver: userEmail
      })
    });

    // Load chat history
    apiFetch(`${API_BASE_URL}/chat/messages?sender=${userEmail}&receiver=${receiver}`)
      .then(res => res.json() as Promise<ChatMessagesResponse>)
      .then(data => {
        if (data && data.messages) {
          setMessages(data.messages);
        }
      })
      .catch(err => reportError('Error loading messages:', err));

    // Handle incoming messages
    const handleNewMessage = (data: ChatMessage) => {
      if ((data.sender === receiver && data.receiver === userEmail) ||
          (data.sender === userEmail && data.receiver === receiver)) {
        setMessages(prev => [...prev, data]);
      }
    };

    // Live messages. The server sends each person only what is addressed to
    // them, so nothing is joined and nothing is sent from here.
    const stop = subscribeToMessages(handleNewMessage);

    return stop;
  }, [userEmail, receiver]);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
    }
  };

  const sendMessage = async () => {
    if ((!message.trim() && !selectedImage) || !receiver) return;

    try {
      const formData = new FormData();
      formData.append('sender', userEmail ?? '');
      formData.append('receiver', receiver);
      formData.append('message', message.trim() || '');
      
      if (selectedImage) {
        formData.append('image', selectedImage);
      }

      const res = await apiFetch(`${API_BASE_URL}/chat/message`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Failed to send message');

      const messageData = (await res.json()) as ChatMessage;
      setMessages(prev => [...prev, messageData]);
      setMessage('');
      setSelectedImage(null);
    } catch (err) {
      reportError('Error sending message:', err);
      toast.error('Message not sent. Please try again.');
    }
  };

  if (!userEmail || !receiver) return null;

  // Same bubbles and composer as the messages page (Chat.css), in a floating
  // card with a deep-indigo head, spanning the width of a phone.
  return (
    <div className="chat-window" role="region" aria-label={`Chat with ${receiverName}`}>
      {/* Chat Header */}
      <div className="chat-window-head">
        <span className="chat-avatar is-tiny" aria-hidden="true">
          {initialsOf(receiverName || receiver)}
        </span>
        <span className="chat-window-title">Chat with {receiverName}</span>
        <button
          type="button"
          className="chat-window-close"
          onClick={onClose}
          aria-label="Close chat"
        >
          <FaTimes size={15} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`chat-msg${msg.sender === userEmail ? ' is-own' : ''}`}
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
                {timeOf(msg.timestamp)}
              </time>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
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
          <FaImage size={18} />
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
          className="field chat-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
        />
        <button
          type="button"
          className="btn btn-primary chat-send"
          onClick={sendMessage}
          aria-label="Send message"
        >
          <FaPaperPlane size={15} />
        </button>
      </div>
    </div>
  );
}

/** Two letters for the person at the other end: "nadia_books" is NB. */
function initialsOf(name: string) {
  const words = name.split(/[\s._@-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase() || '?';
}

/** "3:05 pm" today, with the date in front before that. */
function timeOf(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}
