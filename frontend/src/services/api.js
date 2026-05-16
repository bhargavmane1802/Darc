const BASE = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('darc_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  // 204 No Content — return empty success
  if (res.status === 204) return {};

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// Auth
export const apiRegister = (username, password) =>
  request('/user/register', { method: 'POST', body: JSON.stringify({ username, password }) });

export const apiLogin = (username, password) =>
  request('/user/login', { method: 'POST', body: JSON.stringify({ username, password }) });

export const apiGetUser = () => request('/auth/');

// Rooms
export const apiCreateRoom = (name, description) =>
  request('/auth/room/create', { method: 'POST', body: JSON.stringify({ name, description }) });

export const apiJoinRoom = (inviteCode) =>request(`/auth/room/join/${inviteCode}`);

export const apiDeleteRoom = (name) =>
  request(`/auth/room/remove/${name}`, { method: 'DELETE' });

export const apiGetMyRooms = () => request('/auth/room/my-rooms');

// Messages (REST) — paths match backend: /:roomId/create, /:roomId/display, /:roomId/update/:messageId, /:roomId/delete/:messageId
export const apiGetMessages = (roomId) => request(`/auth/message/${roomId}/display`);

export const apiSendMessage = (roomId, content) =>
  request(`/auth/message/${roomId}/create`, { method: 'POST', body: JSON.stringify({ content }) });

export const apiUpdateMessage = (roomId, messageId, content) =>
  request(`/auth/message/${roomId}/update/${messageId}`, { method: 'PUT', body: JSON.stringify({ content }) });

export const apiDeleteMessage = (roomId, messageId) =>
  request(`/auth/message/${roomId}/delete/${messageId}`, { method: 'DELETE' });

// Journal — paths match backend: /:roomId/create, /:roomId/display, /:roomId/update/:journalId, /:roomId/delete/:journalId
export const apiGetJournals = (roomId) => request(`/auth/journal/${roomId}/display`);

export const apiCreateJournal = (roomId, content, imageUrl) =>
  request(`/auth/journal/${roomId}/create`, { method: 'POST', body: JSON.stringify({ content, imageUrl }) });

export const apiUpdateJournal = (roomId, journalId, content) =>
  request(`/auth/journal/${roomId}/update/${journalId}`, { method: 'PUT', body: JSON.stringify({ content }) });

export const apiDeleteJournal = (roomId, journalId) =>
  request(`/auth/journal/${roomId}/delete/${journalId}`, { method: 'DELETE' });

// Journal Reactions — PATCH /:roomId/reaction/:journalId
export const apiToggleReaction = (roomId, journalId, emoji) =>
  request(`/auth/journal/${roomId}/reaction/${journalId}`, { method: 'PATCH', body: JSON.stringify({ emoji }) });

// Image Upload — POST /auth/upload (multipart/form-data, no Content-Type header)
export async function apiUploadImage(file) {
  const token = localStorage.getItem('darc_token');
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch(`${BASE}/auth/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || 'Image upload failed');
  return data; // { imageUrl, publicId }
}

// AI Feedback (SSE) — path: /:roomId/aiResponce/:journalId
// Returns remaining AI credits via onRemainingCredits callback
export function streamAIFeedback(roomId, journalId, onToken, onDone, onError, onRemainingCredits) {
  const token = localStorage.getItem('darc_token');
  const url = `${BASE}/auth/journal/${roomId}/aiResponse/${journalId}`;

  // 1. Create a controller to handle timeouts
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s client-side timeout

  fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
    signal: controller.signal // Link the abort signal to the fetch
  })
    .then(async (res) => {
      clearTimeout(timeoutId); // Request started, clear the connection timeout

      // Read rate limit header before checking response status
      const remaining = res.headers.get('X-RateLimit-Remaining');
      if (remaining !== null) {
        onRemainingCredits?.(parseInt(remaining, 10));
      }

      if (res.status === 429) {
        const data = await res.json().catch(() => null);
        onError?.(data?.message || 'Daily AI feedback limit reached. Try again tomorrow!');
        return;
      }

      if (!res.ok) throw new Error('AI request failed (Server Error)');
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      async function read() {
        try {
          const { done, value } = await reader.read();
          
          if (done) {
            onDone?.();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const content = line.slice(6).trim();
              if (content === '[DONE]') {
                onDone?.();
                return;
              }
              const data = JSON.parse(content);
              if (data.error) throw new Error(data.error);
              onToken?.(data.token);
            }
          }
          read(); // Recursive call for next chunk
        } catch (readError) {
          // 2. Handle stream interruption (SSE connection drop)
          console.error("Stream interrupted:", readError);
          onError?.("AI response interrupted — please try again.");
        }
      }
      read();
    })
    .catch((err) => {
      if (err.name === 'AbortError') {
        onError?.("Request timed out. The AI took too long to respond.");
      } else {
        onError?.(err.message || 'Stream connection failed');
      }
    });
}