import { socketRequest, connectSocket, updateSocketAuth } from './socket.js';

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO based API Services replacing previous HTTP REST endpoints
// ─────────────────────────────────────────────────────────────────────────────

// Auth
export const apiRegister = (username, password, email) =>
  socketRequest('user:register', { username, password, email });

export const apiLogin = async (username, password) => {
  const res = await socketRequest('user:login', { username, password });
  if (res?.token) {
    updateSocketAuth(res.token);
  }
  return res;
};

// Profile
export const apiGetProfile = async () => {
  const res = await socketRequest('profile:details', {});
  return res?.data !== undefined ? res.data : res;
};

export const apiGetUser = apiGetProfile;

export const apiUpdateProfile = async ({ name, about, status }) => {
  const res = await socketRequest('profile:update', { name, about, status });
  return res?.data !== undefined ? res.data : res;
};

// Upload
export async function apiUploadImage(file) {
  let rawFile = file;
  if (typeof FormData !== 'undefined' && file instanceof FormData) {
    rawFile = file.get('image') || file.get('file');
  }

  let imagePayload = rawFile;
  if (typeof window !== 'undefined' && (rawFile instanceof File || rawFile instanceof Blob)) {
    imagePayload = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(rawFile);
    });
  }

  const res = await socketRequest('upload:image', { image: imagePayload });
  return res?.data !== undefined ? res.data : res;
}

export const apiUpdateProfileAvatar = async (file) => {
  let imageUrl = null;
  let publicId = null;

  if (
    typeof window !== 'undefined' &&
    (file instanceof File || file instanceof Blob || (typeof FormData !== 'undefined' && file instanceof FormData))
  ) {
    const uploadRes = await apiUploadImage(file);
    imageUrl = uploadRes?.imageUrl;
    publicId = uploadRes?.publicId;
  } else if (file && typeof file === 'object') {
    imageUrl = file.imageUrl || file.url || file.image || null;
    publicId = file.publicId || null;
  } else if (typeof file === 'string') {
    imageUrl = file;
  }

  const res = await socketRequest('profile:avatar', { imageUrl, publicId });
  return res?.data !== undefined ? res.data : res;
};

// Rooms
export const apiCreateRoom = async (name, description) => {
  const res = await socketRequest('room:create', { name, description });
  return res?.data !== undefined ? res.data : res;
};

export const apiJoinRoom = async (inviteCode) => {
  const res = await socketRequest('room:join', { inviteCode });
  return res?.data !== undefined ? res.data : res;
};

export const apiDeleteRoom = async (name) => {
  const res = await socketRequest('room:remove', { name });
  return res?.data !== undefined ? res.data : res;
};

export const apiGetMyRooms = async () => {
  const res = await socketRequest('room:my_rooms', {});
  return res?.data !== undefined ? res.data : res;
};

// Messages
export const apiGetMessages = async (roomId) => {
  const res = await socketRequest('message:display', { roomId, room_id: roomId });
  if (res?.data !== undefined) return res.data;
  if (Array.isArray(res?.message)) return res.message;
  return res;
};

export const apiSendMessage = async (roomId, contentOrData, maybeImage) => {
  let content = '';
  let imageFile = null;

  if (typeof FormData !== 'undefined' && contentOrData instanceof FormData) {
    content = contentOrData.get('content') || '';
    imageFile = contentOrData.get('image') || contentOrData.get('file');
  } else if (contentOrData && typeof contentOrData === 'object' && !(contentOrData instanceof File)) {
    content = contentOrData.content || '';
    imageFile = contentOrData.image || contentOrData.file || maybeImage;
  } else {
    content = typeof contentOrData === 'string' ? contentOrData : '';
    imageFile = maybeImage;
  }

  let imageUrl = null;
  let publicId = null;

  if (imageFile) {
    const uploadRes = await apiUploadImage(imageFile);
    imageUrl = uploadRes?.imageUrl || null;
    publicId = uploadRes?.publicId || null;
  }

  const text = typeof content === 'string' ? content.trim() : '';

  const res = await socketRequest('message:send', {
    roomId,
    room_id: roomId,
    content: text,
    imageUrl,
    publicId,
  });

  return res;
};

export const apiUpdateMessage = (roomId, messageId, content) =>
  socketRequest('message:update', {
    roomId,
    room_id: roomId,
    messageId,
    content: typeof content === 'string' ? content.trim() : content,
  });

export const apiDeleteMessage = (roomId, messageId) =>
  socketRequest('message:delete', {
    roomId,
    room_id: roomId,
    messageId,
  });

// Journals
export const apiGetJournals = async (roomId) => {
  const res = await socketRequest('journal:display', { roomId, room_id: roomId });
  return res?.data !== undefined ? res.data : res;
};

export const apiCreateJournal = async (roomId, contentOrData, maybeImage) => {
  let content = '';
  let imageFile = null;

  if (typeof FormData !== 'undefined' && contentOrData instanceof FormData) {
    content = contentOrData.get('content') || '';
    imageFile = contentOrData.get('image') || contentOrData.get('file');
  } else if (contentOrData && typeof contentOrData === 'object' && !(contentOrData instanceof File)) {
    content = contentOrData.content || '';
    imageFile = contentOrData.image || contentOrData.file || maybeImage;
  } else {
    content = typeof contentOrData === 'string' ? contentOrData : '';
    imageFile = maybeImage;
  }

  let imageUrl = null;
  let publicId = null;

  if (imageFile) {
    const uploadRes = await apiUploadImage(imageFile);
    imageUrl = uploadRes?.imageUrl || null;
    publicId = uploadRes?.publicId || null;
  }

  const text = typeof content === 'string' ? content.trim() : '';

  const res = await socketRequest('journal:create', {
    roomId,
    room_id: roomId,
    content: text,
    imageUrl,
    publicId,
  });

  return res?.data !== undefined ? res.data : res;
};

export const apiDeleteJournal = (roomId, journalId) =>
  socketRequest('journal:delete', {
    roomId,
    room_id: roomId,
    journalId,
  });

// Journal Reactions
export const apiToggleReaction = async (roomId, journalId, emoji) => {
  const res = await socketRequest('journal:reaction', {
    roomId,
    room_id: roomId,
    journalId,
    emoji,
  });
  return res?.data !== undefined ? res.data : res;
};

// AI Feedback (Socket.IO stream)
export function streamAIFeedback(roomId, journalId, onToken, onDone, onError, onRemainingCredits) {
  const socket = connectSocket();
  if (!socket) {
    onError?.('Socket connection not available');
    return () => {};
  }

  let finished = false;

  const handleAiResponse = (payload) => {
    if (payload?.journalId && String(payload.journalId) !== String(journalId)) return;

    if (payload?.error) {
      if (!finished) {
        finished = true;
        cleanup();
        onError?.(payload.error);
      }
      return;
    }

    if (payload?.token === '[DONE]') {
      if (!finished) {
        finished = true;
        cleanup();
        onDone?.();
      }
      return;
    }

    if (payload?.token) {
      onToken?.(payload.token);
    }
  };

  const handleAiDone = (payload) => {
    if (payload?.journalId && String(payload.journalId) !== String(journalId)) return;
    if (!finished) {
      finished = true;
      cleanup();
      onDone?.();
    }
  };

  const handleRateLimit = (payload) => {
    if (payload?.remaining !== undefined) {
      onRemainingCredits?.(payload.remaining);
    }
  };

  const handleError = (err) => {
    if (err?.message?.includes('limit reached') || err?.status === 429) {
      onRemainingCredits?.(0);
      if (!finished) {
        finished = true;
        cleanup();
        onError?.(err.message || 'Daily AI feedback limit reached. Try again tomorrow!');
      }
    }
  };

  const timeoutId = setTimeout(() => {
    if (!finished) {
      finished = true;
      cleanup();
      onError?.('Request timed out. The AI took too long to respond.');
    }
  }, 45000);

  const cleanup = () => {
    clearTimeout(timeoutId);
    socket.off('ai_response', handleAiResponse);
    socket.off('ai_response_done', handleAiDone);
    socket.off('rate_limit_status', handleRateLimit);
    socket.off('error', handleError);
  };

  socket.on('ai_response', handleAiResponse);
  socket.on('ai_response_done', handleAiDone);
  socket.on('rate_limit_status', handleRateLimit);
  socket.on('error', handleError);

  socket.emit(
    'journal:ai_response',
    { roomId, room_id: roomId, journalId, entryId: journalId },
    (res) => {
      if (res?.status === 429) {
        if (!finished) {
          finished = true;
          cleanup();
          onRemainingCredits?.(0);
          onError?.(res.message || 'Daily AI feedback limit reached. Try again tomorrow!');
        }
      } else if (res?.status && res.status >= 400) {
        if (!finished) {
          finished = true;
          cleanup();
          onError?.(res.message || res.error || 'AI feedback failed');
        }
      } else if (res?.remaining !== undefined) {
        onRemainingCredits?.(res.remaining);
      }
    }
  );

  return cleanup;
}
