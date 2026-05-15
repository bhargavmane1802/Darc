import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../services/socket.js';
import { apiDeleteMessage, apiUpdateMessage, apiUploadImage } from '../services/api.js';

export default function ChatPanel({ roomId, user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [readReceipts, setReadReceipts] = useState({}); // { user_id: lastReadMessageId }
  const [imagePreview, setImagePreview] = useState(null); // { file, url }
  const [uploading, setUploading] = useState(false);
  const endRef = useRef(null);
  const typingTimeout = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onDisplay = (msgs) => {
      setMessages(msgs);
      setTimeout(() => {
        scrollToBottom();
        // Mark last message as read
        if (msgs.length > 0) {
          emitRead(msgs[msgs.length - 1]._id);
        }
      }, 100);
    };
    const onNew = (msg) => {
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => {
        scrollToBottom();
        emitRead(msg._id);
      }, 100);
    };
    const onUpdate = (msg) => {
      // Merge update while preserving the populated sender (backend sends unpopulated ObjectId)
      setMessages((prev) => prev.map((m) =>
        m._id === msg._id ? { ...m, ...msg, sender: m.sender } : m
      ));
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
    const onReadUpdate = ({ user_id, lastReadMessageId }) => {
      setReadReceipts((prev) => ({ ...prev, [user_id]: lastReadMessageId }));
    };

    socket.on('message_display', onDisplay);
    socket.on('message_new', onNew);
    socket.on('update_message', onUpdate);
    socket.on('delete_message', onDelete);
    socket.on('is_typing', onTyping);
    socket.on('stop_typing', onStopTyping);
    socket.on('readUpdate_message', onReadUpdate);

    return () => {
      socket.off('message_display', onDisplay);
      socket.off('message_new', onNew);
      socket.off('update_message', onUpdate);
      socket.off('delete_message', onDelete);
      socket.off('is_typing', onTyping);
      socket.off('stop_typing', onStopTyping);
      socket.off('readUpdate_message', onReadUpdate);
    };
  }, [roomId]);

  const emitRead = (messageId) => {
    const socket = getSocket();
    if (socket && messageId) {
      socket.emit('read_message', roomId, messageId);
    }
  };

  const handleSend = async () => {
    const socket = getSocket();
    if (!socket || (!input.trim() && !imagePreview)) return;

    let imageUrl = null;

    // Upload image if attached
    if (imagePreview) {
      setUploading(true);
      try {
        const data = await apiUploadImage(imagePreview.file);
        imageUrl = data.imageUrl;
      } catch (err) {
        console.error('Image upload failed:', err);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    socket.emit('message_send', {
      room_id: roomId,
      content: input.trim() || (imageUrl ? '📷 Image' : ''),
      imageUrl,
    });
    setInput('');
    setImagePreview(null);
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
    apiDeleteMessage(roomId, msgId).catch(() => {});
  };

  const handleEditSave = (msgId) => {
    if (!editText.trim()) return;
    apiUpdateMessage(roomId, msgId, editText.trim()).catch(() => {});
    setEditingId(null);
    setEditText('');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('File exceeds the 5MB limit.');
      return;
    }
    setImagePreview({ file, url: URL.createObjectURL(file) });
    e.target.value = ''; // reset so same file can be selected again
  };

  const cancelImagePreview = () => {
    if (imagePreview?.url) URL.revokeObjectURL(imagePreview.url);
    setImagePreview(null);
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Count how many users have read up to a given message
  const getReadCount = (msgId) => {
    return Object.values(readReceipts).filter((lastRead) => lastRead === msgId).length;
  };

  return (
    <div className="chat-panel">
      <div className="chat-panel__messages">
        {messages.map((msg, idx) => {
          const isOwn = msg.sender?.username === user?.username || msg.sender?._id === user?.id;
          const readCount = isOwn ? getReadCount(msg._id) : 0;
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
                  <>
                    {msg.imageUrl && (
                      <div className="chat-msg__image">
                        <img src={msg.imageUrl} alt="Shared image" loading="lazy" />
                      </div>
                    )}
                    <p className="chat-msg__text">{msg.content}</p>
                  </>
                )}
                {/* Read receipt indicator for own messages */}
                {isOwn && readCount > 0 && (
                  <span className="chat-msg__read-receipt" title={`Read by ${readCount}`}>
                    ✓✓ <span className="chat-msg__read-count">{readCount}</span>
                  </span>
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

      {/* Image Preview */}
      {imagePreview && (
        <div className="chat-panel__image-preview">
          <img src={imagePreview.url} alt="Preview" />
          <button className="chat-panel__image-preview-cancel" onClick={cancelImagePreview}>✕</button>
        </div>
      )}

      <div className="chat-panel__input-bar">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <button
          className="btn btn--ghost btn--sm btn--upload"
          onClick={() => fileInputRef.current?.click()}
          title="Upload image (jpg, png, webp — max 5MB)"
          disabled={uploading}
        >
          📎 Upload Image
        </button>
        <input
          className="chat-panel__input"
          placeholder="Type a message…"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn btn--primary btn--send"
          onClick={handleSend}
          disabled={(!input.trim() && !imagePreview) || uploading}
        >
          {uploading ? <span className="spinner" /> : '➤'}
        </button>
      </div>
    </div>
  );
}
