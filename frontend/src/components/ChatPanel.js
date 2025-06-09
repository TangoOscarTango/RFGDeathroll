// ChatPanel.js — Floating chat panel with global and private tabs, real-time via socket.io

import React, { useState, useEffect, useRef } from 'react';
import './ChatPanel.css';

const ChatPanel = ({ user, socket }) => {
  const [globalMessages, setGlobalMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!user || !socket) return;

    // Fetch last 25 messages from server
    fetch(`${process.env.REACT_APP_API_URL}/api/chat/global`, {
      headers: { Authorization: `Bearer ${user.token}` }
    })
      .then(res => res.json())
      .then(data => setGlobalMessages(data))
      .catch(err => console.error('Error loading global chat:', err));

    socket.on('globalMessage', (data) => {
      setGlobalMessages((prev) => [...prev.slice(-24), data]); // Keep only 25 max
    });

    return () => {
      socket.off('globalMessage');
    };
  }, [user, socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [globalMessages]);

  const sendMessage = () => {
    if (!message.trim()) return;
    socket.emit('globalMessage', { content: message });
    setMessage('');
  };

  if (!user) return null;

  return (
    <div className={`chat-panel ${isOpen ? 'open' : 'closed'}`}>
      <div className="chat-header" onClick={() => setIsOpen(!isOpen)}>
        💬 Global Chat
      </div>
      {isOpen && (
        <div className="chat-body">
          <div className="chat-messages">
            {globalMessages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.senderId === user._id ? 'own' : ''}`}>
                <strong>{msg.senderUsername || 'User'}:</strong> {msg.content}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="chat-input">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPanel;
