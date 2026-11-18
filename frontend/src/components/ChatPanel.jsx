import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { getSocket, connectSocket } from '../services/socket.js';
import {
  apiDeleteMessage,
  apiUpdateMessage,
  apiSendMessage,
  apiGetMessages,
  MESSAGE_INITIAL_LIMIT,
  RECENT_MESSAGE_LIMIT,
} from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import Avatar from './Avatar.jsx';

export default function ChatPanel({ roomId, user }) {
  const { addToast } = useToast();
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
  const loadedLimitRef = useRef(0);
  const activeRoomIdRef = useRef(roomId);
  const userRef = useRef(user);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  useEffect(() => {
    activeRoomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

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
    if (
      loadingMoreRef.current ||
      !hasMoreRef.current ||
      messagesRef.current.length === 0 ||
      loadedLimitRef.current >= RECENT_MESSAGE_LIMIT
    ) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    const container = messagesContainerRef.current;
    if (container) {
      scrollPositionRef.current = {
        prevScrollHeight: container.scrollHeight,
        prevScrollTop: container.scrollTop,
      };
    }

    const requestRoomId = roomId;

    try {
      const response = await apiGetMessages(requestRoomId, RECENT_MESSAGE_LIMIT);
      if (activeRoomIdRef.current !== requestRoomId) return;

      const fetchedMessages = response?.messages || response?.message || [];
      loadedLimitRef.current = RECENT_MESSAGE_LIMIT;
      setHasMore(false);
      hasMoreRef.current = false;

      if (fetchedMessages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m._id));
          const oldestExistingTime = prev[0]?.createdAt
            ? new Date(prev[0].createdAt).getTime()
            : Infinity;
          const uniqueOlder = fetchedMessages.filter(
            (m) =>
              !existingIds.has(m._id) &&
              (!m.createdAt || new Date(m.createdAt).getTime() <= oldestExistingTime)
          );
          if (uniqueOlder.length === 0) {
            scrollPositionRef.current = null;
            return prev;
          }
          return [...uniqueOlder, ...prev];
        });
      } else {
        scrollPositionRef.current = null;
      }
    } catch (err) {
      console.error('Failed to load previous messages:', err);
      scrollPositionRef.current = null;
    } finally {
      if (activeRoomIdRef.current === requestRoomId) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [roomId]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // When scrolled near the top and additional cached messages may exist (60 -> 100), fetch them
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
    loadedLimitRef.current = 0;
    scrollPositionRef.current = null;
    setEditingId(null);
    setEditText('');
    setTypingUsers([]);
    setReadReceipts({});

    let isSubscribed = true;

    const emitReadForRoom = (messageId) => {
      const s = getSocket();
      if (s && messageId) {
        s.emit('read_message', roomId, messageId);
      }
    };

    const handleInitialResponse = (response) => {
      if (!isSubscribed) return;
      if (response?.roomId && String(response.roomId) !== String(roomId)) return;

      const msgs = response?.messages || response?.message || [];
      const canLoadMoreFromCache =
        msgs.length >= MESSAGE_INITIAL_LIMIT && MESSAGE_INITIAL_LIMIT < RECENT_MESSAGE_LIMIT;

      scrollPositionRef.current = null;
      loadedLimitRef.current = MESSAGE_INITIAL_LIMIT;
      setHasMore(canLoadMoreFromCache);
      hasMoreRef.current = canLoadMoreFromCache;

      setMessages((prev) => {
        if (prev.length === 0) return msgs;
        const fetchedIds = new Set(msgs.map((m) => m._id));
        const liveNewer = prev.filter((m) => !fetchedIds.has(m._id));
        return [...msgs, ...liveNewer];
      });

      setTimeout(() => {
        if (!isSubscribed) return;
        scrollToBottom();
        if (msgs.length > 0) {
          emitReadForRoom(msgs[msgs.length - 1]._id);
        }
      }, 100);
    };

    apiGetMessages(roomId, MESSAGE_INITIAL_LIMIT)
      .then(handleInitialResponse)
      .catch((err) => {
        if (!isSubscribed) return;
        console.error('Failed to load initial messages:', err);
      });

    const socket = getSocket() || connectSocket();

    const onNew = (msg) => {
      if (!msg?._id) return;
      if (msg.room && String(msg.room) !== String(roomId)) return;

      setMessages((prev) => {
        if (prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => {
        const container = messagesContainerRef.current;
        const isNearBottom = container
          ? container.scrollHeight - container.scrollTop - container.clientHeight < 150
          : true;
        const currentUser = userRef.current;
        const senderUsername = msg.sender?.username;
        const senderId = msg.sender?._id || msg.sender?.id || (typeof msg.sender === 'string' ? msg.sender : null);
        const currentUserId = currentUser?.id || currentUser?._id;
        const isOwn = (senderUsername && currentUser?.username && senderUsername === currentUser.username) ||
                      (senderId && currentUserId && String(senderId) === String(currentUserId));

        if (isNearBottom || isOwn) {
          scrollToBottom();
        }
        emitReadForRoom(msg._id);
      }, 100);
    };

    const onUpdate = (msg) => {
      if (!msg?._id) return;
      if (msg.room && String(msg.room) !== String(roomId)) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (m._id !== msg._id) return m;
          const nextSender =
            msg.sender && typeof msg.sender === 'object' && msg.sender.username
              ? msg.sender
              : m.sender;
          return { ...m, ...msg, sender: nextSender };
        })
      );
    };

    const onDelete = (id) => {
      setMessages((prev) => prev.filter((m) => m._id !== id));
    };

    const onTyping = ({ username, id }) => {
      const currentUserId = userRef.current?.id || userRef.current?._id;
      if (id && currentUserId && String(id) === String(currentUserId)) return;
      setTypingUsers((prev) => {
        if (prev.find((u) => u.id === id)) return prev;
        return [...prev, { username, id }];
      });
    };

    const onStopTyping = ({ id }) => {
      setTypingUsers((prev) => prev.filter((u) => u.id !== id));
    };

    const onReadUpdate = ({ room_id, user_id, lastReadMessageId }) => {
      if (room_id && String(room_id) !== String(roomId)) return;
      setReadReceipts((prev) => ({ ...prev, [user_id]: lastReadMessageId }));
    };

    if (socket) {
      socket.on('message_new', onNew);
      socket.on('update_message', onUpdate);
      socket.on('delete_message', onDelete);
      socket.on('is_typing', onTyping);
      socket.on('stop_typing', onStopTyping);
      socket.on('readUpdate_message', onReadUpdate);
    }

    return () => {
      isSubscribed = false;
      if (socket) {
        socket.off('message_new', onNew);
        socket.off('update_message', onUpdate);
        socket.off('delete_message', onDelete);
        socket.off('is_typing', onTyping);
        socket.off('stop_typing', onStopTyping);
        socket.off('readUpdate_message', onReadUpdate);
      }
    };
  }, [roomId]);

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

  const handleDelete = async (msgId) => {
    try {
      await apiDeleteMessage(roomId, msgId);
    } catch (err) {
      console.error('Failed to delete message:', err);
      addToast(err?.message || 'Failed to delete message', 'error');
    }
  };

  const handleEditSave = async (msgId) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    try {
      const res = await apiUpdateMessage(roomId, msgId, trimmed);
      const updatedMsg = res?.data;
      if (updatedMsg?._id) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m._id !== updatedMsg._id) return m;
            const nextSender =
              updatedMsg.sender && typeof updatedMsg.sender === 'object' && updatedMsg.sender.username
                ? updatedMsg.sender
                : m.sender;
            return { ...m, ...updatedMsg, sender: nextSender };
          })
        );
      }
      setEditingId(null);
      setEditText('');
    } catch (err) {
      console.error('Failed to update message:', err);
      addToast(err?.message || 'Failed to update message', 'error');
    }
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
            <span>
              {messages.length >= RECENT_MESSAGE_LIMIT
                ? `Showing latest ${RECENT_MESSAGE_LIMIT} messages`
                : 'Beginning of conversation history'}
            </span>
          </div>
        )}

        {messages.map((msg) => {
          const senderUsername = msg.sender?.username || null;
          const senderId = msg.sender?._id || msg.sender?.id || (typeof msg.sender === 'string' ? msg.sender : null);
          const currentUserId = user?.id || user?._id;
          const isOwn = (senderUsername && user?.username && senderUsername === user.username) ||
                        (senderId && currentUserId && String(senderId) === String(currentUserId));
          const readCount = isOwn ? getReadCount(msg._id) : 0;
          const senderAvatar = msg.sender?.imageUrl || msg.sender?.avatar || null;
          const ownAvatar = user?.imageUrl || user?.avatar || msg.sender?.imageUrl || msg.sender?.avatar || null;
          return (
            <div key={msg._id} className={`chat-bubble ${isOwn ? 'chat-bubble--own' : 'chat-bubble--other'}`}>
              {!isOwn && (
                <Avatar
                  src={senderAvatar}
                  alt={senderUsername || 'Avatar'}
                  fallback={senderUsername?.[0]?.toUpperCase() || '?'}
                  className="chat-bubble__avatar"
                  imgClassName="chat-bubble__avatar-img"
                />
              )}
              <div className="chat-bubble__wrapper">
                {!isOwn && (
                  <span className="chat-bubble__name">{senderUsername || 'Unknown'}</span>
                )}
                <div className="chat-bubble__content">
                  {editingId === msg._id ? (
                    <div className="chat-bubble__edit">
                      <input
                        className="chat-bubble__edit-input"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave(msg._id);
                          if (e.key === 'Escape') {
                            setEditingId(null);
                            setEditText('');
                          }
                        }}
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
                  alt={user?.username || senderUsername || 'Avatar'}
                  fallback={(user?.username || senderUsername)?.[0]?.toUpperCase() || '?'}
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
