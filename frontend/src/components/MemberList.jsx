import React from 'react';

export default function MemberList({ members }) {
  return (
    <div className="member-list">
      <h3 className="member-list__title">Online — {members.length}</h3>
      <div className="member-list__items">
        {members.map((m, i) => (
          <div key={m.id || i} className="member-list__item">
            <span className="member-list__avatar">
              {m.username?.[0]?.toUpperCase() || '?'}
            </span>
            <span className="member-list__name">{m.username}</span>
            <span className="member-list__dot" />
          </div>
        ))}
        {members.length === 0 && (
          <p className="member-list__empty">No one online</p>
        )}
      </div>
    </div>
  );
}
