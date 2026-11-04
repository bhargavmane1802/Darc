import React, { useState, useCallback, useMemo, memo } from 'react';
import { FiCopy, FiCheck, FiShield, FiCalendar, FiHash, FiZap } from 'react-icons/fi';

function ProfileStatsCardComponent({ profileId, email, createdAt }) {
  const [copied, setCopied] = useState(false);

  const formattedDate = useMemo(() => {
    if (!createdAt) return 'Active Member';
    try {
      const d = new Date(createdAt);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(d);
    } catch {
      return 'Active Member';
    }
  }, [createdAt]);

  const handleCopyId = useCallback(() => {
    if (!profileId) return;
    navigator.clipboard.writeText(profileId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [profileId]);

  return (
    <div className="profile-stats-card glass">
      <div className="profile-stats-card__header">
        <h3 className="profile-stats-card__title">Account Information</h3>
        <span className="profile-stats-card__badge">
          <FiShield size={12} />
          <span>Secured</span>
        </span>
      </div>

      <div className="profile-stats-card__list">
        {/* User ID */}
        <div className="profile-stats-item">
          <div className="profile-stats-item__icon-wrap">
            <FiHash size={16} />
          </div>
          <div className="profile-stats-item__content">
            <span className="profile-stats-item__label">User ID</span>
            <span className="profile-stats-item__val profile-stats-item__val--mono">
              {profileId ? `${profileId.slice(0, 10)}...${profileId.slice(-6)}` : '—'}
            </span>
          </div>
          {profileId && (
            <button
              type="button"
              className={`profile-stats-item__copy-btn ${copied ? 'profile-stats-item__copy-btn--copied' : ''}`}
              onClick={handleCopyId}
              title="Copy Full User ID"
            >
              {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
        </div>

        {/* Member Since */}
        <div className="profile-stats-item">
          <div className="profile-stats-item__icon-wrap">
            <FiCalendar size={16} />
          </div>
          <div className="profile-stats-item__content">
            <span className="profile-stats-item__label">Member Since</span>
            <span className="profile-stats-item__val">{formattedDate}</span>
          </div>
        </div>

        {/* Real-time System Connectivity */}
        <div className="profile-stats-item">
          <div className="profile-stats-item__icon-wrap">
            <FiZap size={16} />
          </div>
          <div className="profile-stats-item__content">
            <span className="profile-stats-item__label">Real-time Node</span>
            <span className="profile-stats-item__val">Socket.io + Redis Connected</span>
          </div>
          <span className="profile-stats-item__status-indicator" />
        </div>
      </div>
    </div>
  );
}

export const ProfileStatsCard = memo(ProfileStatsCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.profileId === nextProps.profileId &&
    prevProps.email === nextProps.email &&
    prevProps.createdAt === nextProps.createdAt
  );
});

export default ProfileStatsCard;
