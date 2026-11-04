import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { FiCamera, FiUploadCloud, FiCheck, FiAlertCircle } from 'react-icons/fi';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function AvatarUploaderComponent({
  currentAvatar,
  username,
  onUpload,
  isUploading,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [localPreview, setLocalPreview] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(false);
  const fileInputRef = useRef(null);
  const prevPreviewRef = useRef(null);

  // Clean up object URLs when localPreview changes or on unmount
  useEffect(() => {
    return () => {
      if (prevPreviewRef.current) {
        URL.revokeObjectURL(prevPreviewRef.current);
      }
    };
  }, []);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setErrorMsg(null);
    setSuccessMsg(false);

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setErrorMsg('Please upload a JPG, PNG, or WEBP image.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMsg('Image size exceeds 5MB limit. Please choose a smaller file.');
      return;
    }

    // Revoke previous preview URL if any
    if (prevPreviewRef.current) {
      URL.revokeObjectURL(prevPreviewRef.current);
    }

    const objectUrl = URL.createObjectURL(file);
    prevPreviewRef.current = objectUrl;
    setLocalPreview(objectUrl);

    try {
      await onUpload(file);
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 3000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to upload avatar. Please try again.');
    }
  }, [onUpload]);

  const handleChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    // Reset file input value so re-selecting same file triggers change
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const [imgError, setImgError] = useState(false);
  const displayImage = localPreview || currentAvatar;

  useEffect(() => {
    setImgError(false);
  }, [displayImage]);

  const showImage = Boolean(displayImage) && !imgError;
  const initial = (username || '?')[0].toUpperCase();

  return (
    <div className="avatar-uploader glass">
      <div className="avatar-uploader__header">
        <h3 className="avatar-uploader__title">Profile Picture</h3>
        <span className="avatar-uploader__badge">Cloudinary Sync</span>
      </div>

      <div
        className={`avatar-uploader__dropzone ${dragOver ? 'avatar-uploader__dropzone--active' : ''} ${isUploading ? 'avatar-uploader__dropzone--uploading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload profile picture"
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <div className="avatar-uploader__preview-container">
          {showImage ? (
            <img
              src={displayImage}
              alt="Avatar preview"
              className="avatar-uploader__image"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="avatar-uploader__placeholder">
              {initial}
            </div>
          )}

          <div className="avatar-uploader__overlay">
            {isUploading ? (
              <div className="avatar-uploader__spinner" />
            ) : (
              <FiCamera className="avatar-uploader__camera-icon" />
            )}
            <span className="avatar-uploader__overlay-text">
              {isUploading ? 'Uploading…' : 'Change photo'}
            </span>
          </div>
        </div>

        <div className="avatar-uploader__instructions">
          <div className="avatar-uploader__action-prompt">
            <FiUploadCloud size={18} />
            <span>Click or drag image to upload</span>
          </div>
          <span className="avatar-uploader__meta-text">
            Supports JPG, PNG, WEBP (Max 5MB)
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="avatar-uploader__input"
          onChange={handleChange}
          disabled={isUploading}
          tabIndex={-1}
        />
      </div>

      {errorMsg && (
        <div className="avatar-uploader__alert avatar-uploader__alert--error">
          <FiAlertCircle size={15} />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="avatar-uploader__alert avatar-uploader__alert--success">
          <FiCheck size={15} />
          <span>Profile picture updated successfully!</span>
        </div>
      )}
    </div>
  );
}

export const AvatarUploader = memo(AvatarUploaderComponent, (prevProps, nextProps) => {
  return (
    prevProps.currentAvatar === nextProps.currentAvatar &&
    prevProps.username === nextProps.username &&
    prevProps.isUploading === nextProps.isUploading &&
    prevProps.onUpload === nextProps.onUpload
  );
});

export default AvatarUploader;
