import React, { memo, useState, useEffect } from 'react';
import { FiArrowLeft, FiMail, FiUser, FiCheckCircle } from 'react-icons/fi';

function ProfileHeaderComponent({
  name,
  username,
  email,
  status,
  avatarUrl,
  onBack,
}) {
  const initial = (name || username || '?')[0].toUpperCase();
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const showImage = Boolean(avatarUrl) && !imgError;

  return (
    <div className="profile-header">
      <div className="profile-header__banner">
        <button
          type="button"
          className="profile-header__back-btn"
          onClick={onBack}
          aria-label="Back to App"
          title="Back to App"
        >
          <FiArrowLeft className="profile-header__back-icon" />
          <span>Back to Workspace</span>
        </button>
        <div className="profile-header__banner-overlay" />
      </div>

      <div className="profile-header__main">
        <div className="profile-header__avatar-wrapper">
          <div className="profile-header__avatar-ring">
            {showImage ? (
              <img
                src={avatarUrl}
                alt={name || username}
                className="profile-header__avatar-img"
                loading="lazy"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="profile-header__avatar-fallback">
                {initial}
              </div>
            )}
            <span className="profile-header__status-dot" title="Active" />
          </div>
        </div>

        <div className="profile-header__info">
          <div className="profile-header__title-row">
            <h1 className="profile-header__name">
              {name || username || 'Developer'}
            </h1>
            <span className="profile-header__verified" title="Verified Member">
              <FiCheckCircle size={16} />
            </span>
          </div>

          <div className="profile-header__meta-row">
            <span className="profile-header__handle">@{username}</span>
            {email && (
              <span className="profile-header__email">
                <FiMail size={13} />
                <span>{email}</span>
              </span>
            )}
          </div>

          {status && (
            <div className="profile-header__status-pill">
              <span className="profile-header__status-text">{status}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const ProfileHeader = memo(ProfileHeaderComponent, (prevProps, nextProps) => {
  return (
    prevProps.name === nextProps.name &&
    prevProps.username === nextProps.username &&
    prevProps.email === nextProps.email &&
    prevProps.status === nextProps.status &&
    prevProps.avatarUrl === nextProps.avatarUrl &&
    prevProps.onBack === nextProps.onBack
  );
});

export default ProfileHeader;
