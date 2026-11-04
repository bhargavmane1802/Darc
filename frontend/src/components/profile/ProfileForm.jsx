import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { FiSave, FiRotateCcw, FiUser, FiInfo, FiActivity } from 'react-icons/fi';
import StatusPresetPicker from './StatusPresetPicker.jsx';

const MAX_NAME_LEN = 50;
const MAX_STATUS_LEN = 80;
const MAX_ABOUT_LEN = 300;

function ProfileFormComponent({ initialData, onSave, isSaving }) {
  const [name, setName] = useState(initialData?.name || '');
  const [about, setAbout] = useState(initialData?.about || '');
  const [status, setStatus] = useState(initialData?.status || '');

  // Keep local state in sync if initialData changes externally (e.g. after fetch or save)
  useEffect(() => {
    setName(initialData?.name || '');
    setAbout(initialData?.about || '');
    setStatus(initialData?.status || '');
  }, [initialData?.name, initialData?.about, initialData?.status]);

  // Determine if form has dirty / unsaved changes
  const hasChanges = useMemo(() => {
    const currentName = (name || '').trim();
    const origName = (initialData?.name || '').trim();

    const currentAbout = (about || '').trim();
    const origAbout = (initialData?.about || '').trim();

    const currentStatus = (status || '').trim();
    const origStatus = (initialData?.status || '').trim();

    return (
      currentName !== origName ||
      currentAbout !== origAbout ||
      currentStatus !== origStatus
    );
  }, [name, about, status, initialData]);

  const handleNameChange = useCallback((e) => {
    if (e.target.value.length <= MAX_NAME_LEN) {
      setName(e.target.value);
    }
  }, []);

  const handleAboutChange = useCallback((e) => {
    if (e.target.value.length <= MAX_ABOUT_LEN) {
      setAbout(e.target.value);
    }
  }, []);

  const handleStatusChange = useCallback((e) => {
    if (e.target.value.length <= MAX_STATUS_LEN) {
      setStatus(e.target.value);
    }
  }, []);

  const handleSelectPresetStatus = useCallback((presetText) => {
    setStatus(presetText);
  }, []);

  const handleReset = useCallback(() => {
    setName(initialData?.name || '');
    setAbout(initialData?.about || '');
    setStatus(initialData?.status || '');
  }, [initialData]);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (!hasChanges || isSaving) return;
      onSave({
        name: name.trim(),
        about: about.trim(),
        status: status.trim(),
      });
    },
    [hasChanges, isSaving, name, about, status, onSave]
  );

  return (
    <div className="profile-form-card glass">
      <div className="profile-form-card__header">
        <div className="profile-form-card__title-group">
          <h3 className="profile-form-card__title">Profile Details</h3>
          <p className="profile-form-card__subtitle">
            Update your public display name, personal bio, and developer status.
          </p>
        </div>
        {hasChanges && (
          <span className="profile-form-card__unsaved-pill">
            ● Unsaved Changes
          </span>
        )}
      </div>

      <form className="profile-form" onSubmit={handleSubmit}>
        {/* Display Name */}
        <div className="form-field">
          <div className="form-field__label-row">
            <label htmlFor="profile-name" className="form-field__label">
              <FiUser className="form-field__icon" />
              <span>Display Name</span>
            </label>
            <span className="form-field__counter">
              {name.length}/{MAX_NAME_LEN}
            </span>
          </div>
          <input
            id="profile-name"
            type="text"
            className="form-field__input"
            placeholder="e.g. Alex Morgan"
            value={name}
            onChange={handleNameChange}
            disabled={isSaving}
          />
        </div>

        {/* Status Field & Presets */}
        <div className="form-field">
          <div className="form-field__label-row">
            <label htmlFor="profile-status" className="form-field__label">
              <FiActivity className="form-field__icon" />
              <span>Status</span>
            </label>
            <span className="form-field__counter">
              {status.length}/{MAX_STATUS_LEN}
            </span>
          </div>
          <input
            id="profile-status"
            type="text"
            className="form-field__input"
            placeholder="e.g. 💻 Building real-time features"
            value={status}
            onChange={handleStatusChange}
            disabled={isSaving}
          />
          <StatusPresetPicker
            currentStatus={status}
            onSelectStatus={handleSelectPresetStatus}
          />
        </div>

        {/* About / Bio */}
        <div className="form-field">
          <div className="form-field__label-row">
            <label htmlFor="profile-about" className="form-field__label">
              <FiInfo className="form-field__icon" />
              <span>About / Bio</span>
            </label>
            <span className="form-field__counter">
              {about.length}/{MAX_ABOUT_LEN}
            </span>
          </div>
          <textarea
            id="profile-about"
            className="form-field__textarea"
            rows={4}
            placeholder="Tell your team or peers a bit about yourself, interests, tech stack..."
            value={about}
            onChange={handleAboutChange}
            disabled={isSaving}
          />
        </div>

        {/* Action Buttons */}
        <div className="profile-form__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={handleReset}
            disabled={!hasChanges || isSaving}
            title="Discard current changes"
          >
            <FiRotateCcw size={14} />
            <span>Discard</span>
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <>
                <span className="spinner spinner--sm" />
                <span>Saving…</span>
              </>
            ) : (
              <>
                <FiSave size={14} />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export const ProfileForm = memo(ProfileFormComponent, (prevProps, nextProps) => {
  return (
    prevProps.isSaving === nextProps.isSaving &&
    prevProps.onSave === nextProps.onSave &&
    prevProps.initialData?.name === nextProps.initialData?.name &&
    prevProps.initialData?.about === nextProps.initialData?.about &&
    prevProps.initialData?.status === nextProps.initialData?.status
  );
});

export default ProfileForm;
