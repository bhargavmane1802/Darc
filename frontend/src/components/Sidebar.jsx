import React, { useEffect, useState } from 'react';
import { apiGetMyRooms } from '../services/api.js';

export default function Sidebar({
  user, rooms, setRooms, activeRoom, onSelectRoom, onLogout, onCreateRoom, onJoinRoom,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch user's rooms on mount
  useEffect(() => {
    apiGetMyRooms()
      .then((data) => {
        if (Array.isArray(data)) {
          setRooms(data.map((r) => ({ _id: r._id, name: r.name, description: r.description || '', inviteCode: r.inviteCode })));
        }
      })
      .catch((err) => console.error('Failed to load rooms:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <div className="sidebar__header">
        <div className="sidebar__brand">
          <span className="sidebar__logo">◈</span>
          {!collapsed && <span className="sidebar__brand-name">DARC</span>}
        </div>
        <button className="icon-btn" onClick={() => setCollapsed(!collapsed)} title="Toggle sidebar">
          {collapsed ? '▸' : '◂'}
        </button>
      </div>

      <div className="sidebar__actions">
        <button className="btn btn--primary btn--sm btn--full" onClick={onCreateRoom}>
          {collapsed ? '+' : '+ Create Room'}
        </button>
        <button className="btn btn--ghost btn--sm btn--full" onClick={onJoinRoom}>
          {collapsed ? '⬊' : '⬊ Join Room'}
        </button>
      </div>

      <div className="sidebar__rooms">
        <div className="sidebar__section-title">{collapsed ? '—' : 'Your Rooms'}</div>
        {loading ? (
          <div className="sidebar__empty">
            {!collapsed && <span>Loading…</span>}
          </div>
        ) : rooms.length === 0 ? (
          <div className="sidebar__empty">
            {!collapsed && <span>No rooms yet</span>}
          </div>
        ) : (
          rooms.map((r) => (
            <button
              key={r._id || r.name}
              className={`sidebar__room ${activeRoom?._id === r._id ? 'sidebar__room--active' : ''}`}
              onClick={() => onSelectRoom(r)}
              title={r.name}
            >
              <span className="sidebar__room-hash">#</span>
              {!collapsed && <span className="sidebar__room-name">{r.name}</span>}
            </button>
          ))
        )}
      </div>

      <div className="sidebar__footer">
        <div className="sidebar__user" title={user?.username}>
          <span className="sidebar__avatar">
            {user?.username?.[0]?.toUpperCase() || '?'}
          </span>
          {!collapsed && <span className="sidebar__username">{user?.username}</span>}
        </div>
        <button className="icon-btn icon-btn--danger" onClick={onLogout} title="Logout">
          ⏻
        </button>
      </div>
    </aside>
  );
}
