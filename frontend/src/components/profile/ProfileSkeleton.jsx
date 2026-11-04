import React, { memo } from 'react';

function ProfileSkeletonComponent() {
  return (
    <div className="profile-skeleton" aria-busy="true" aria-label="Loading profile">
      <div className="profile-skeleton__header shimmer" />
      <div className="profile-skeleton__body">
        <div className="profile-skeleton__avatar-wrap">
          <div className="profile-skeleton__avatar shimmer" />
          <div className="profile-skeleton__lines">
            <div className="profile-skeleton__line shimmer" style={{ width: '45%', height: '24px' }} />
            <div className="profile-skeleton__line shimmer" style={{ width: '25%', height: '16px' }} />
          </div>
        </div>
        <div className="profile-skeleton__grid">
          <div className="profile-skeleton__card shimmer" style={{ height: '280px' }} />
          <div className="profile-skeleton__card shimmer" style={{ height: '280px' }} />
        </div>
      </div>
    </div>
  );
}

export const ProfileSkeleton = memo(ProfileSkeletonComponent);
export default ProfileSkeleton;
