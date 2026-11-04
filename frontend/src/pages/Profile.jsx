import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiGetProfile, apiUpdateProfile, apiUpdateProfileAvatar } from '../services/api.js';
import ProfileHeader from '../components/profile/ProfileHeader.jsx';
import AvatarUploader from '../components/profile/AvatarUploader.jsx';
import ProfileForm from '../components/profile/ProfileForm.jsx';
import ProfileStatsCard from '../components/profile/ProfileStatsCard.jsx';
import ProfileSkeleton from '../components/profile/ProfileSkeleton.jsx';
import '../styles/profile.css';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [profile, setProfile] = useState(null);

  // Fetch user profile on mount
  useEffect(() => {
    let isMounted = true;

    async function fetchProfile() {
      try {
        setLoading(true);
        const data = await apiGetProfile();
        if (isMounted && data) {
          setProfile(data);
          // Sync with global auth user
          updateUser({
            name: data.name,
            about: data.about,
            status: data.status,
            avatar: data.imageUrl || data.avatar,
            imageUrl: data.imageUrl || data.avatar,
          });
        }
      } catch (err) {
        if (isMounted) {
          addToast(err.message || 'Failed to load profile details', 'error');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [addToast, updateUser]);

  // Navigate back
  const handleBack = useCallback(() => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/app');
    }
  }, [navigate]);

  // Handle saving text details (name, about, status)
  const handleSaveDetails = useCallback(
    async (formData) => {
      setIsSaving(true);
      try {
        const updated = await apiUpdateProfile(formData);
        setProfile((prev) => ({
          ...prev,
          name: updated?.name ?? formData.name,
          about: updated?.about ?? formData.about,
          status: updated?.status ?? formData.status,
        }));

        updateUser({
          name: updated?.name ?? formData.name,
          about: updated?.about ?? formData.about,
          status: updated?.status ?? formData.status,
        });

        addToast('Profile updated successfully!', 'success');
      } catch (err) {
        addToast(err.message || 'Failed to update profile', 'error');
      } finally {
        setIsSaving(false);
      }
    },
    [addToast, updateUser]
  );

  // Handle uploading avatar
  const handleUploadAvatar = useCallback(
    async (file) => {
      setIsUploading(true);
      try {
        const res = await apiUpdateProfileAvatar(file);
        // Backend might return raw string url or object { imageUrl, avatar }
        const newUrl =
          typeof res === 'string'
            ? res
            : res?.imageUrl || res?.avatar || res?.profile?.imageUrl || res?.profile?.avatar;

        if (newUrl) {
          setProfile((prev) => ({
            ...prev,
            imageUrl: newUrl,
            avatar: newUrl,
          }));

          updateUser({
            avatar: newUrl,
            imageUrl: newUrl,
          });

          addToast('Profile avatar uploaded successfully!', 'success');
        }
      } catch (err) {
        addToast(err.message || 'Failed to upload avatar', 'error');
        throw err; // Let AvatarUploader show localized error as well
      } finally {
        setIsUploading(false);
      }
    },
    [addToast, updateUser]
  );

  // Memoized initial data for form to avoid re-creating object reference on unrelated renders
  const formInitialData = useMemo(() => {
    return {
      name: profile?.name || '',
      about: profile?.about || '',
      status: profile?.status || '',
    };
  }, [profile?.name, profile?.about, profile?.status]);

  // Avatar URL helper
  const avatarUrl = useMemo(() => {
    return profile?.imageUrl || profile?.avatar || '';
  }, [profile?.imageUrl, profile?.avatar]);

  return (
    <div className="profile-page">
      <div className="profile-page__glow profile-page__glow--1" />
      <div className="profile-page__glow profile-page__glow--2" />

      <div className="profile-container">
        {loading ? (
          <ProfileSkeleton />
        ) : (
          <>
            <ProfileHeader
              name={profile?.name}
              username={profile?.username || user?.username}
              email={profile?.email}
              status={profile?.status}
              avatarUrl={avatarUrl}
              onBack={handleBack}
            />

            <div className="profile-content-grid">
              <div className="profile-content-grid__left">
                <AvatarUploader
                  currentAvatar={avatarUrl}
                  username={profile?.username || user?.username}
                  onUpload={handleUploadAvatar}
                  isUploading={isUploading}
                />

                <ProfileStatsCard
                  profileId={profile?._id || user?.id}
                  email={profile?.email}
                  createdAt={profile?.createdAt}
                />
              </div>

              <div className="profile-content-grid__right">
                <ProfileForm
                  initialData={formInitialData}
                  onSave={handleSaveDetails}
                  isSaving={isSaving}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
