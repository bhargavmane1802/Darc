import React, { useState, useEffect } from 'react';
import { apiGetJournals, apiCreateJournal, apiUpdateJournal, apiDeleteJournal, streamAIFeedback, apiToggleReaction } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { useToast } from '../context/ToastContext.jsx';

const QUICK_REACTIONS = ['👍', '🔥', '🎉', '💡', '❤️'];

export default function JournalPanel({ roomId, user }) {
  const [entries, setEntries] = useState([]);
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [aiStreamId, setAiStreamId] = useState(null);
  const [aiText, setAiText] = useState('');
  const [aiRemaining, setAiRemaining] = useState(null);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    loadEntries();
    const socket = getSocket();
    if (!socket) return;

    const onCreate = (j) => setEntries((prev) => [...prev, j]);
    const onUpdate = ({ journal }) => {
      // Merge update while preserving the populated author (backend sends unpopulated ObjectId)
      setEntries((prev) => prev.map((e) =>
        e._id === journal._id ? { ...e, ...journal, author: e.author } : e
      ));
    };
    const onDelete = ({ entry_id }) => setEntries((prev) => prev.filter((e) => e._id !== entry_id));
    const onReaction = ({ entryId, reactions }) => {
      setEntries((prev) => prev.map((e) =>
        e._id === entryId ? { ...e, reaction: reactions } : e
      ));
    };

    socket.on('create_journal', onCreate);
    socket.on('update_journal', onUpdate);
    socket.on('delete_journal', onDelete);
    socket.on('reaction_journal', onReaction);

    return () => {
      socket.off('create_journal', onCreate);
      socket.off('update_journal', onUpdate);
      socket.off('delete_journal', onDelete);
      socket.off('reaction_journal', onReaction);
    };
  }, [roomId]);

  const loadEntries = async () => {
    try {
      const data = await apiGetJournals(roomId);
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast('Failed to load journals', 'error');
    }
  };

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    setLoading(true);
    try {
      await apiCreateJournal(roomId, newContent.trim());
      setNewContent('');
    } catch (err) {
      addToast('Failed to create entry', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditSave = async (id) => {
    if (!editText.trim()) return;
    try {
      await apiUpdateJournal(roomId, id, editText.trim());
      setEditingId(null);
      setEditText('');
    } catch (err) {
      addToast('Failed to update entry', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiDeleteJournal(roomId, id);
      // Optimistic removal — backend has a bug where socket emit fails (missing getIO())
      setEntries((prev) => prev.filter((e) => e._id !== id));
    } catch (err) {
      addToast('Failed to delete entry', 'error');
    }
  };

  const handleAI = (entryId) => {
    if (aiRemaining === 0) {
      addToast('Daily AI feedback limit reached. Try again tomorrow!', 'error');
      return;
    }
    setAiStreamId(entryId);
    setAiText('');
    streamAIFeedback(
      roomId,
      entryId,
      (token) => setAiText((prev) => prev + token),
      () => addToast('AI feedback complete', 'success'),
      (err) => addToast(err || 'AI feedback failed', 'error'),
      (remaining) => setAiRemaining(remaining)
    );
  };

  const handleReaction = async (entryId, emoji) => {
    try {
      await apiToggleReaction(roomId, entryId, emoji);
    } catch (err) {
      addToast('Reaction failed', 'error');
    }
  };

  const formatDate = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Detect bot/digest entries
  const isBotEntry = (entry) => {
    return entry.author?.username === 'AI Mentor' || entry.content?.startsWith('🤖');
  };

  // Render markdown bold (**text**) as <strong>
  const renderContent = (text) => {
    if (!text) return '';
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  // Get AI remaining class
  const aiRemainingClass = aiRemaining === null ? '' :
    aiRemaining === 0 ? 'ai-remaining--zero' :
    aiRemaining <= 3 ? 'ai-remaining--low' : '';

  return (
    <div className="journal-panel">
      {/* New Entry */}
      <div className="journal-panel__compose glass">
        <textarea
          className="journal-panel__textarea"
          placeholder="Write a journal entry… document your progress, ideas, blockers."
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          rows={3}
        />
        <button className="btn btn--primary btn--sm" onClick={handleCreate} disabled={loading || !newContent.trim()}>
          {loading ? <span className="spinner" /> : 'Post Entry'}
        </button>
      </div>

      {/* Entries */}
      <div className="journal-panel__entries">
        {entries.length === 0 ? (
          <div className="journal-panel__empty">
            <p>No journal entries yet. Start documenting!</p>
          </div>
        ) : (
          [...entries].reverse().map((entry) => {
            const isOwn = entry.author?.username === user?.username;
            const isBot = isBotEntry(entry);
            return (
              <div key={entry._id} className={`journal-entry glass ${isBot ? 'journal-entry--bot' : ''}`}>
                <div className="journal-entry__header">
                  <div className="journal-entry__author">
                    <span className="journal-entry__avatar">
                      {isBot ? '🤖' : (entry.author?.username?.[0]?.toUpperCase() || '?')}
                    </span>
                    <span className="journal-entry__name">{entry.author?.username || 'Unknown'}</span>
                    {isBot && <span className="journal-entry__bot-badge">BOT</span>}
                    <span className="journal-entry__date">{formatDate(entry.createdAt)}</span>
                  </div>
                  {isOwn && !isBot && (
                    <div className="journal-entry__actions">
                      <button className="icon-btn icon-btn--sm" onClick={() => { setEditingId(entry._id); setEditText(entry.content); }} title="Edit">✎</button>
                      <button className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => handleDelete(entry._id)} title="Delete">🗑</button>
                    </div>
                  )}
                </div>

                {editingId === entry._id ? (
                  <div className="journal-entry__edit">
                    <textarea className="journal-panel__textarea" value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} autoFocus />
                    <div className="journal-entry__edit-actions">
                      <button className="btn btn--primary btn--sm" onClick={() => handleEditSave(entry._id)}>Save</button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="journal-entry__content">{renderContent(entry.content)}</p>
                )}

                {/* Reactions */}
                <div className="journal-entry__reactions">
                  {(entry.reaction || []).map((r) => {
                    const count = Array.isArray(r.users) ? r.users.length : 0;
                    const isActive = Array.isArray(r.users) && user?.id && r.users.includes(user.id);
                    if (count === 0) return null;
                    return (
                      <button
                        key={r.emoji}
                        className={`reaction-pill ${isActive ? 'reaction-pill--active' : ''}`}
                        onClick={() => handleReaction(entry._id, r.emoji)}
                        title={`${r.emoji} ${count}`}
                      >
                        {r.emoji} <span className="reaction-pill__count">{count}</span>
                      </button>
                    );
                  })}
                  {QUICK_REACTIONS.filter(e => !(entry.reaction || []).some(r => r.emoji === e && r.users?.length > 0)).slice(0, 3).map((emoji) => (
                    <button
                      key={emoji}
                      className="reaction-add"
                      onClick={() => handleReaction(entry._id, emoji)}
                      title={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* AI Feedback */}
                <div className="journal-entry__footer">
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => handleAI(entry._id)}
                    disabled={aiRemaining === 0}
                  >
                    🤖 Get AI Feedback
                    {aiRemaining !== null && (
                      <span className={`ai-remaining ${aiRemainingClass}`}>
                        ({aiRemaining} left)
                      </span>
                    )}
                  </button>
                  {entry.aiResponse && aiStreamId !== entry._id && (
                    <div className="journal-entry__ai">
                      <div className="journal-entry__ai-label">🤖 AI Mentor</div>
                      <p>{renderContent(entry.aiResponse)}</p>
                    </div>
                  )}
                  {aiStreamId === entry._id && aiText && (
                    <div className="journal-entry__ai journal-entry__ai--streaming">
                      <div className="journal-entry__ai-label">🤖 AI Mentor <span className="streaming-dot" /></div>
                      <p>{aiText}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
