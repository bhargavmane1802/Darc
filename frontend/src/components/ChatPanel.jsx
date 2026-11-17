import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { getSocket } from '../services/socket.js';
import { apiDeleteMessage, apiUpdateMessage, apiSendMessage, apiGetMessages } from '../services/api.js';
import Avatar from './Avatar.jsx';

export default function ChatPanel({ roomId, user }) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [input, setInput] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [readReceipts, setReadReceipts] = useState({}); // { user_id: lastReadMessageId }
  const [imagePreview, setImagePreview] = useState(null); // { file, url }
  const [uploading, setUploading] = useState(false);
  const endRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const typingTimeout = useRef(null);
  const fileInputRef = useRef(null);
  const scrollPositionRef = useRef(null);

  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Preserve scroll position when older messages are prepended
  useLayoutEffect(() => {
    if (scrollPositionRef.current && messagesContainerRef.current) {
      const { prevScrollHeight, prevScrollTop } = scrollPositionRef.current;
      const currentScrollHeight = messagesContainerRef.current.scrollHeight;
      messagesContainerRef.current.scrollTop = currentScrollHeight - prevScrollHeight + prevScrollTop;
      scrollPositionRef.current = null;
    }
  }, [messages]);

  const loadPreviousMessages = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || messagesRef.current.length === 0) {
      return;
    }

    const oldestMessage = messagesRef.current[0];
    if (!oldestMessage?._id) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    const container = messagesContainerRef.current;
    if (container) {
      scrollPositionRef.current = {
        prevScrollHeight: container.scrollHeight,
        prevScrollTop: container.scrollTop,
      };
    }

    try {
      const res = await apiGetMessages(roomId, oldestMessage._id, 30);
      const olderMessages = res?.messages || res?.message || (Array.isArray(res) ? res : []);
      const more = res?.hasMore !== undefined ? Boolean(res.hasMore) : olderMessages.length >= 30;

      hasMoreRef.current = more;
      setHasMore(more);

      if (olderMessages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m._id));
          const uniqueOlder = olderMessages.filter((m) => !existingIds.has(m._id));
          return [...uniqueOlder, ...prev];
        });
      } else {
        hasMoreRef.current = false;
        setHasMore(false);
        scrollPositionRef.current = null;
      }
    } catch (err) {
      console.error('Failed to load previous messages:', err);
      scrollPositionRef.current = null;
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [roomId]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // When scrolled near the top and previous messages exist, fetch more
    if (container.scrollTop <= 40 && hasMoreRef.current && !loadingMoreRef.current) {
      loadPreviousMessages();
    }
  };

  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    hasMoreRef.current = false;
    setLoadingMore(false);
    loadingMoreRef.current = false;
    scrollPositionRef.current = null;

    const socket = getSocket();
    if (!socket) return;

    const onDisplay = (payload) => {
      let msgs = [];
      let more = false;

      if (Array.isArray(payload)) {
        msgs = payload;
        more = payload.length >= 30;
      } else if (payload && typeof payload === 'object') {
        msgs = payload.messages || payload.message || [];
        more = Boolean(payload.hasMore);
      }

      scrollPositionRef.current = null;
      setMessages(msgs);
      setHasMore(more);
      hasMoreRef.current = more;

      setTimeout(() => {
        scrollToBottom();
        // Mark last message as read
        if (msgs.length > 0) {
          emitRead(msgs[msgs.length - 1]._id);
        }
      }, 100);
    };
    const onNew = (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => {
        const container = messagesContainerRef.current;
        const isNearBottom = container
          ? container.scrollHeight - container.scrollTop - container.clientHeight < 150
          : true;
        const isOwn = msg.sender?.username === user?.username || msg.sender?._id === user?.id;

        if (isNearBottom || isOwn) {
          scrollToBottom();
        }
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
    if ((!input.trim() && !imagePreview) || uploading) return;

    const socket = getSocket();
    const text = input.trim();
    const file = imagePreview?.file;

    // Send in ONE server request when uploading image
    if (file) {
      setUploading(true);
      try {
        const res = await apiSendMessage(roomId, text, file);
        setInput('');
        cancelImagePreview();
        // If socket is disconnected, append message directly from response
        if (res?.data && (!socket || !socket.connected)) {
          setMessages((prev) => {
            if (prev.some((m) => m._id === res.data._id)) return prev;
            return [...prev, res.data];
          });
          setTimeout(scrollToBottom, 100);
        }
      } catch (err) {
        console.error('Failed to send image message:', err);
        alert(err.message || 'Failed to send image message');
      } finally {
        setUploading(false);
      }
    } else {
      if (socket && socket.connected) {
        socket.emit('message_send', {
          room_id: roomId,
          content: text,
        });
      } else {
        setUploading(true);
        try {
          const res = await apiSendMessage(roomId, text);
          if (res?.data) {
            setMessages((prev) => {
              if (prev.some((m) => m._id === res.data._id)) return prev;
              return [...prev, res.data];
            });
            setTimeout(scrollToBottom, 100);
          }
        } catch (err) {
          console.error('Failed to send message:', err);
          alert(err.message || 'Failed to send message');
        } finally {
          setUploading(false);
        }
      }
      setInput('');
    }

    if (socket) {
      socket.emit('typing_end', { room_id: roomId });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!uploading) {
        handleSend();
      }
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
      <div
        ref={messagesContainerRef}
        className="chat-panel__messages"
        onScroll={handleScroll}
      >
        {loadingMore && (
          <div className="chat-panel__loading-more">
            <span className="spinner spinner--sm" />
            <span>Loading older messages…</span>
          </div>
        )}

        {!hasMore && messages.length > 0 && (
          <div className="chat-panel__history-start">
            <span>Beginning of conversation history</span>
          </div>
        )}

        {messages.map((msg) => {
          const isOwn = msg.sender?.username === user?.username || msg.sender?._id === user?.id;
          const readCount = isOwn ? getReadCount(msg._id) : 0;
          const senderAvatar = msg.sender?.imageUrl || msg.sender?.avatar || null;
          const ownAvatar = user?.imageUrl || user?.avatar || msg.sender?.imageUrl || msg.sender?.avatar || null;
          return (
            <div key={msg._id} className={`chat-bubble ${isOwn ? 'chat-bubble--own' : 'chat-bubble--other'}`}>
              {!isOwn && (
                <Avatar
                  src={senderAvatar}
                  alt={msg.sender?.username || 'Avatar'}
                  fallback={msg.sender?.username?.[0]?.toUpperCase() || '?'}
                  className="chat-bubble__avatar"
                  imgClassName="chat-bubble__avatar-img"
                />
              )}
              <div className="chat-bubble__wrapper">
                {!isOwn && (
                  <span className="chat-bubble__name">{msg.sender?.username || 'Unknown'}</span>
                )}
                <div className="chat-bubble__content">
                  {editingId === msg._id ? (
                    <div className="chat-bubble__edit">
                      <input
                        className="chat-bubble__edit-input"
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
                        <div className="chat-bubble__image">
                          <img
                            src={msg.imageUrl}
                            alt="Shared image"
                            loading="lazy"
                            onClick={() => window.open(msg.imageUrl, '_blank')}
                          />
                        </div>
                      )}
                      {msg.content && <p className="chat-bubble__text">{msg.content}</p>}
                    </>
                  )}
                  <div className="chat-bubble__footer">
                    {isOwn && readCount > 0 && (
                      <span className="chat-bubble__views">👁 {readCount}</span>
                    )}
                    <span className="chat-bubble__time">{formatTime(msg.createdAt)}</span>
                  </div>
                  {/* Floating actions on hover */}
                  {isOwn && editingId !== msg._id && (
                    <div className="chat-bubble__actions">
                      <button className="icon-btn icon-btn--sm" onClick={() => { setEditingId(msg._id); setEditText(msg.content || ''); }} title="Edit">✎</button>
                      <button className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => handleDelete(msg._id)} title="Delete">🗑</button>
                    </div>
                  )}
                </div>
              </div>
              {isOwn && (
                <Avatar
                  src={ownAvatar}
                  alt={user?.username || msg.sender?.username || 'Avatar'}
                  fallback={(user?.username || msg.sender?.username)?.[0]?.toUpperCase() || '?'}
                  className="chat-bubble__avatar"
                  imgClassName="chat-bubble__avatar-img"
                />
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

      {imagePreview && (
        <div className="chat-panel__image-preview">
          <img src={imagePreview.url} alt="Preview" />
          <button
            className="chat-panel__image-preview-cancel"
            onClick={cancelImagePreview}
            disabled={uploading}
          >
            ✕
          </button>
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
          📎
        </button>
        <input
          className="chat-panel__input"
          placeholder="Your message"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={uploading}
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
