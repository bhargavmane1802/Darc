import React, { useState, useEffect } from 'react';
import { apiGetJournals, apiCreateJournal, apiUpdateJournal, apiDeleteJournal, streamAIFeedback } from '../services/api.js';
import { getSocket } from '../services/socket.js';
import { useToast } from '../context/ToastContext.jsx';

export default function JournalPanel({ roomId, user }) {
  const [entries, setEntries] = useState([]);
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [aiStreamId, setAiStreamId] = useState(null);
  const [aiText, setAiText] = useState('');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    loadEntries();
    const socket = getSocket();
    if (!socket) return;

    const onCreate = (j) => setEntries((prev) => [...prev, j]);
    const onUpdate = ({ journal }) => setEntries((prev) => prev.map((e) => (e._id === journal._id ? journal : e)));
    const onDelete = ({ entry_id }) => setEntries((prev) => prev.filter((e) => e._id !== entry_id));

    socket.on('create_journal', onCreate);
    socket.on('update_journal', onUpdate);
    socket.on('delete_journal', onDelete);

    return () => {
      socket.off('create_journal', onCreate);
      socket.off('update_journal', onUpdate);
      socket.off('delete_journal', onDelete);
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
    } catch (err) {
      addToast('Failed to delete entry', 'error');
    }
  };

  const handleAI = (entryId) => {
    setAiStreamId(entryId);
    setAiText('');
    streamAIFeedback(
      roomId,
      entryId,
      (token) => setAiText((prev) => prev + token),
      () => addToast('AI feedback complete', 'success'),
      (err) => addToast(err || 'AI feedback failed', 'error')
    );
  };

  const formatDate = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

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
            return (
              <div key={entry._id} className="journal-entry glass">
                <div className="journal-entry__header">
                  <div className="journal-entry__author">
                    <span className="journal-entry__avatar">
                      {entry.author?.username?.[0]?.toUpperCase() || '?'}
                    </span>
                    <span className="journal-entry__name">{entry.author?.username || 'Unknown'}</span>
                    <span className="journal-entry__date">{formatDate(entry.createdAt)}</span>
                  </div>
                  {isOwn && (
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
                  <p className="journal-entry__content">{entry.content}</p>
                )}

                {/* AI Feedback */}
                <div className="journal-entry__footer">
                  <button className="btn btn--ghost btn--sm" onClick={() => handleAI(entry._id)}>
                    🤖 Get AI Feedback
                  </button>
                  {entry.aiResponse && aiStreamId !== entry._id && (
                    <div className="journal-entry__ai">
                      <div className="journal-entry__ai-label">🤖 AI Mentor</div>
                      <p>{entry.aiResponse}</p>
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
