import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../services/socket.js';
import { apiDeleteMessage, apiUpdateMessage } from '../services/api.js';

export default function ChatPanel({ roomId, user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const endRef = useRef(null);
  const typingTimeout = useRef(null);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onDisplay = (msgs) => {
      setMessages(msgs);
      setTimeout(scrollToBottom, 100);
    };
    const onNew = (msg) => {
      setMessages((prev) => [...prev, msg]);
      setTimeout(scrollToBottom, 100);
    };
    const onUpdate = (msg) => {
      setMessages((prev) => prev.map((m) => (m._id === msg._id ? msg : m)));
    };
    const onDelete = (id) => {
      setMessages((prev) => prev.filter((m) => m._id !== id));
    };
    const onTyping = ({ username, id }) => {
      if (id === user?.id) return;
      setTypingUsers((prev) => {
        if (prev.find((u) => u.id === id)) return prev;
        return [...prev, { username, id }];
      });
    };
    const onStopTyping = ({ id }) => {
      setTypingUsers((prev) => prev.filter((u) => u.id !== id));
    };

    socket.on('message_display', onDisplay);
    socket.on('message_new', onNew);
    socket.on('update_message', onUpdate);
    socket.on('delete_message', onDelete);
    socket.on('is_typing', onTyping);
    socket.on('stop_typing', onStopTyping);

    return () => {
      socket.off('message_display', onDisplay);
      socket.off('message_new', onNew);
      socket.off('update_message', onUpdate);
      socket.off('delete_message', onDelete);
      socket.off('is_typing', onTyping);
      socket.off('stop_typing', onStopTyping);
    };
  }, [roomId]);

  const handleSend = () => {
    const socket = getSocket();
    if (!socket || !input.trim()) return;
    socket.emit('message_send', { room_id: roomId, content: input.trim() });
    setInput('');
    socket.emit('typing_end', { room_id: roomId });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const socket = getSocket();
    if (!socket) return;
    socket.emit('typing_start', { room_id: roomId });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('typing_end', { room_id: roomId });
    }, 2000);
  };

  const handleDelete = (msgId) => {
    const socket = getSocket();
    apiDeleteMessage(roomId, msgId).catch(() => {});
  };

  const handleEditSave = (msgId) => {
    if (!editText.trim()) return;
    apiUpdateMessage(roomId, msgId, editText.trim()).catch(() => {});
    setEditingId(null);
    setEditText('');
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  // Frontend logic (React/Vue/Vanilla)
  const submitJournalWithImage = async (text, file) => {
    let uploadedImageUrl = null;

    // STEP 1: Upload Image (if one is selected)
    if (file) {
      const formData = new FormData();
      formData.append("image", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }, // NO 'Content-Type' header here!
        body: formData,
      });
      
      if (!uploadRes.ok) throw new Error("Image upload failed");
      
      const uploadData = await uploadRes.json();
      uploadedImageUrl = uploadData.imageUrl;
    }

    // STEP 2: Create Journal Entry
    const journalRes = await fetch("/api/journals", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        content: text,
        imageUrl: uploadedImageUrl // Null if no image, URL if successful
      }),
    });
  };

  return (
    <div className="chat-panel">
      <div className="chat-panel__messages">
        {messages.map((msg) => {
          const isOwn = msg.sender?.username === user?.username || msg.sender?._id === user?.id;
          return (
            <div key={msg._id} className={`chat-msg ${isOwn ? 'chat-msg--own' : ''}`}>
              <div className="chat-msg__avatar">
                {msg.sender?.username?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="chat-msg__body">
                <div className="chat-msg__meta">
                  <span className="chat-msg__author">{msg.sender?.username || 'Unknown'}</span>
                  <span className="chat-msg__time">{formatTime(msg.createdAt)}</span>
                </div>
                {editingId === msg._id ? (
                  <div className="chat-msg__edit">
                    <input
                      className="input-group__input"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleEditSave(msg._id)}
                      autoFocus
                    />
                    <button className="icon-btn icon-btn--sm" onClick={() => handleEditSave(msg._id)}>✓</button>
                    <button className="icon-btn icon-btn--sm" onClick={() => setEditingId(null)}>✕</button>
                  </div>
                ) : (
                  <p className="chat-msg__text">{msg.content}</p>
                )}
              </div>
              {isOwn && editingId !== msg._id && (
                <div className="chat-msg__actions">
                  <button className="icon-btn icon-btn--sm" onClick={() => { setEditingId(msg._id); setEditText(msg.content); }} title="Edit">✎</button>
                  <button className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => handleDelete(msg._id)} title="Delete">🗑</button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {typingUsers.length > 0 && (
        <div className="chat-panel__typing">
          <span className="typing-dots"><span /><span /><span /></span>
          {typingUsers.map((u) => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
        </div>
      )}

      <div className="chat-panel__input-bar">
        <input
          className="chat-panel__input"
          placeholder="Type a message…"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />
        <button className="btn btn--primary btn--send" onClick={handleSend} disabled={!input.trim()}>
          ➤
        </button>
      </div>
    </div>
  );
}
