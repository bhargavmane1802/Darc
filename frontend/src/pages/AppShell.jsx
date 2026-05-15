import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import JournalPanel from '../components/JournalPanel.jsx';
import MemberList from '../components/MemberList.jsx';
import RoomModal from '../components/RoomModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiDeleteRoom } from '../services/api.js';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket.js';
import '../styles/app.css';

export default function AppShell() {
  const { token, user, logout } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [members, setMembers] = useState([]);
  const [showModal, setShowModal] = useState(null); // 'create' | 'join' | null
  const [showMembers, setShowMembers] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Track active room ID in a ref so socket handlers always have latest value
  const activeRoomRef = useRef(null);
  useEffect(() => {
    activeRoomRef.current = activeRoom?._id || null;
  }, [activeRoom?._id]);

  // Connect socket on mount
  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);

    socket.on('connect_error', (err) => {
      if (err.message === 'Unauthorised') {
        addToast('Session expired. Please log in again.', 'error');
        logout();
        navigate('/auth');
      }
    });

    // Generic socket error handler
    socket.on('error', ({ message }) => {
      addToast(message || 'Something went wrong', 'error');
    });

    // Room-specific presence: only update members if the event is for the active room
    socket.on('room_members', ({ room_id, members: m }) => {
      if (room_id && room_id === activeRoomRef.current) {
        setMembers(m || []);
      }
    });

    return () => disconnectSocket();
  }, [token]);

  // Join socket room when activeRoom changes
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !activeRoom) return;
    socket.emit('join_room', { room_id: activeRoom._id });
  }, [activeRoom?._id, activeTab]);

  const handleSelectRoom = useCallback((room) => {
    setActiveRoom(room);
    setActiveTab('chat');
    setInviteCopied(false);
  }, []);

  const handleLogout = () => {
    disconnectSocket();
    logout();
    navigate('/');
  };

  const handleRoomCreated = (room) => {
    setRooms((prev) => [...prev, room]);
    setActiveRoom(room);
    setShowModal(null);
    addToast('Room created!', 'success');
  };

  const handleRoomJoined = (room) => {
    setRooms((prev) => [...prev, room]);
    setActiveRoom(room);
    setShowModal(null);
    addToast('Joined room!', 'success');
  };

  // Room delete handler — only for room owner
  const handleDeleteRoom = async (room) => {
    const confirmed = window.confirm(`Delete room "${room.name}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await apiDeleteRoom(room.name);
      setRooms((prev) => prev.filter((r) => r._id !== room._id));
      if (activeRoom?._id === room._id) {
        setActiveRoom(null);
        setMembers([]);
      }
      addToast(`Room "${room.name}" deleted`, 'success');
    } catch (err) {
      addToast(err.message || 'Failed to delete room', 'error');
    }
  };

  // Copy invite code to clipboard
  const handleCopyInvite = () => {
    if (!activeRoom?.inviteCode) return;
    navigator.clipboard.writeText(activeRoom.inviteCode).then(() => {
      setInviteCopied(true);
      addToast('Invite code copied!', 'success');
      setTimeout(() => setInviteCopied(false), 2000);
    }).catch(() => {
      addToast('Failed to copy', 'error');
    });
  };

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        rooms={rooms}
        setRooms={setRooms}
        activeRoom={activeRoom}
        onSelectRoom={handleSelectRoom}
        onLogout={handleLogout}
        onCreateRoom={() => setShowModal('create')}
        onJoinRoom={() => setShowModal('join')}
        onDeleteRoom={handleDeleteRoom}
      />

      <main className="app-shell__main">
        {activeRoom ? (
          <>
            {/* Room header */}
            <header className="room-header">
              <div className="room-header__info">
                <h2 className="room-header__name">{activeRoom.name}</h2>
                {activeRoom.description && (
                  <span className="room-header__desc">{activeRoom.description}</span>
                )}
              </div>
              <div className="room-header__actions">
                {/* Invite Code Copy Button */}
                {activeRoom.inviteCode && (
                  <button
                    className={`invite-btn ${inviteCopied ? 'invite-btn--copied' : ''}`}
                    onClick={handleCopyInvite}
                    title={`Invite code: ${activeRoom.inviteCode}`}
                  >
                    <span className="invite-btn__icon">{inviteCopied ? '✓' : '🔗'}</span>
                    <span className="invite-btn__text">
                      {inviteCopied ? 'Copied!' : 'Invite'}
                    </span>
                  </button>
                )}
                <div className="room-header__tabs">
                  <button
                    className={`tab-btn ${activeTab === 'chat' ? 'tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('chat')}
                  >
                    💬 Chat
                  </button>
                  <button
                    className={`tab-btn ${activeTab === 'journal' ? 'tab-btn--active' : ''}`}
                    onClick={() => setActiveTab('journal')}
                  >
                    📓 Journal
                  </button>
                </div>
                <button
                  className={`icon-btn ${showMembers ? 'icon-btn--active' : ''}`}
                  onClick={() => setShowMembers(!showMembers)}
                  title="Toggle members"
                >
                  👥 <span className="member-count">{members.length}</span>
                </button>
              </div>
            </header>

            <div className="room-body">
              <div className="room-body__content">
                {activeTab === 'chat' ? (
                  <ChatPanel roomId={activeRoom._id} user={user} />
                ) : (
                  <JournalPanel roomId={activeRoom._id} user={user} />
                )}
              </div>
              {showMembers && (
                <aside className="room-body__members">
                  <MemberList members={members} />
                </aside>
              )}
            </div>
          </>
        ) : (
          <div className="app-shell__empty">
            <div className="app-shell__empty-icon">◈</div>
            <h2>Welcome to DARC</h2>
            <p>Select a room or create one to get started.</p>
            <div className="app-shell__empty-actions">
              <button className="btn btn--primary" onClick={() => setShowModal('create')}>
                Create Room
              </button>
              <button className="btn btn--ghost" onClick={() => setShowModal('join')}>
                Join Room
              </button>
            </div>
          </div>
        )}
      </main>

      {showModal && (
        <RoomModal
          mode={showModal}
          onClose={() => setShowModal(null)}
          onRoomCreated={handleRoomCreated}
          onRoomJoined={handleRoomJoined}
        />
      )}
    </div>
  );
}
