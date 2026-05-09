import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import JournalPanel from '../components/JournalPanel.jsx';
import MemberList from '../components/MemberList.jsx';
import RoomModal from '../components/RoomModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
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

    socket.on('room_members', ({ room_id, members: m }) => {
      if (room_id) setMembers(m || []);
    });

    return () => disconnectSocket();
  }, [token]);

  // Join socket room when activeRoom changes
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !activeRoom) return;
    socket.emit('join_room', { room_id: activeRoom._id });
  }, [activeRoom?._id,activeTab]);

  const handleSelectRoom = useCallback((room) => {
    setActiveRoom(room);
    setActiveTab('chat');
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
