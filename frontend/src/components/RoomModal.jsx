import React, { useState } from 'react';
import { apiCreateRoom, apiJoinRoom } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { getSocket } from '../services/socket.js';
export default function RoomModal({ mode, onClose, onRoomCreated, onRoomJoined }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();
  const socket=getSocket();
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return addToast('Room name is required', 'error');
    setLoading(true);
    try {
      const data = await apiCreateRoom(name.trim(), description.trim());
      onRoomCreated({ _id: data.room_id, name: name.trim(), description: description.trim(),inviteCode:data.inviteCode, });
    } catch (err) {
      addToast(err.message || 'Failed to create room', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return addToast('Invite code is required', 'error');
    setLoading(true);
    try {
      const data = await apiJoinRoom(inviteCode.trim());
      // data will have room_id, name, description from the backend
      onRoomJoined({
        _id: data.room_id,
        name: data.name || `Room`,
        description: data.description || '',
        inviteCode:inviteCode,
      });
      socket.emit('room_join',{room_id:data.room_id});
      
    } catch (err) {
      addToast(err.message || 'Failed to join room', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">
            {mode === 'create' ? 'Create a Room' : 'Join a Room'}
          </h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {mode === 'create' ? (
          <form className="modal__form" onSubmit={handleCreate}>
            <div className="input-group">
              <label className="input-group__label">Room Name</label>
              <input
                className="input-group__input"
                placeholder="e.g. project-alpha"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="input-group">
              <label className="input-group__label">Description (optional)</label>
              <input
                className="input-group__input"
                placeholder="What's this room about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create Room'}
            </button>
          </form>
        ) : (
          <form className="modal__form" onSubmit={handleJoin}>
            <div className="input-group">
              <label className="input-group__label">Invite Code</label>
              <input
                className="input-group__input"
                placeholder="Paste the room invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn--primary btn--full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Join Room'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
