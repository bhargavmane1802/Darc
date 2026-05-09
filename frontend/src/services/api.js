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

export const apiCreateJournal = (roomId, content) =>
  request(`/auth/journal/${roomId}/create`, { method: 'POST', body: JSON.stringify({ content }) });

export const apiUpdateJournal = (roomId, journalId, content) =>
  request(`/auth/journal/${roomId}/update/${journalId}`, { method: 'PUT', body: JSON.stringify({ content }) });

export const apiDeleteJournal = (roomId, journalId) =>
  request(`/auth/journal/${roomId}/delete/${journalId}`, { method: 'DELETE' });

// AI Feedback (SSE) — path: /:roomId/aiResponce/:journalId
export function streamAIFeedback(roomId, journalId, onToken, onDone, onError) {
  const token = localStorage.getItem('darc_token');
  const url = `${BASE}/auth/journal/${roomId}/aiResponce/${journalId}`;

  // EventSource doesn't support custom headers, so we use fetch + ReadableStream
  fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
    .then((res) => {
      if (!res.ok) throw new Error('AI request failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            onDone?.();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.token === '[DONE]') {
                  onDone?.();
                  return;
                } else if (data.error) {
                  onError?.(data.error);
                  return;
                } else {
                  onToken?.(data.token);
                }
              } catch {
                // skip unparseable lines
              }
            }
          }
          read();
        });
      }
      read();
    })
    .catch((err) => {
      onError?.(err.message || 'Stream connection failed');
    });
}
