import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  return socket;
}

export function updateSocketAuth(token) {
  if (token && typeof window !== 'undefined') {
    localStorage.setItem('darc_token', token);
  }
  if (socket) {
    socket.auth = { token: token || (typeof window !== 'undefined' ? localStorage.getItem('darc_token') : undefined) };
  }
}

export function connectSocket(token) {
  const effectiveToken = token || (typeof window !== 'undefined' ? localStorage.getItem('darc_token') : null);

  if (socket) {
    if (effectiveToken && socket.auth?.token !== effectiveToken) {
      socket.auth = { token: effectiveToken };
    }
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  const serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  socket = io(serverUrl, {
    auth: { token: effectiveToken || undefined },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Promise-based Socket.IO request helper mirroring REST request lifecycle.
 * Emits an event with data and awaits the server acknowledgment callback.
 * Automatically ensures socket connection, handles timeouts and server error statuses.
 */
export function socketRequest(event, data = {}, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20000;

  return new Promise((resolve, reject) => {
    const s = connectSocket();
    let timer = null;
    let settled = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      settled = true;
    };

    const doEmit = () => {
      timer = setTimeout(() => {
        if (!settled) {
          cleanup();
          reject(new Error(`Socket request timed out for event "${event}"`));
        }
      }, timeoutMs);

      try {
        s.emit(event, data, (response) => {
          if (settled) return;
          cleanup();

          if (!response) {
            return resolve(undefined);
          }

          // Check if response indicates an HTTP/Socket error status
          if (response.status && response.status >= 400) {
            const errMsg = response.message || response.error || `Request failed (${response.status})`;
            const err = new Error(errMsg);
            err.status = response.status;
            err.response = response;
            return reject(err);
          }

          // Check for error property without status
          if (response.error && response.status === undefined) {
            const err = new Error(typeof response.error === 'string' ? response.error : 'Request failed');
            err.response = response;
            return reject(err);
          }

          resolve(response);
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    if (s.connected) {
      doEmit();
    } else {
      const handleConnect = () => {
        s.off('connect_error', handleConnectError);
        if (!settled) doEmit();
      };
      const handleConnectError = (err) => {
        s.off('connect', handleConnect);
        if (!settled) {
          cleanup();
          reject(new Error(err?.message || 'Socket connection failed'));
        }
      };
      s.once('connect', handleConnect);
      s.once('connect_error', handleConnectError);
    }
  });
}
