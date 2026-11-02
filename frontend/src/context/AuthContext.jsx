import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const AuthContext = createContext(null);

function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return { id: decoded.id, username: decoded.username };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('darc_token'));
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('darc_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch {
        // fallback
      }
    }
    const savedToken = localStorage.getItem('darc_token');
    if (savedToken) {
      const decoded = decodeJWT(savedToken);
      if (decoded) return decoded;
    }
    return null;
  });

  const login = useCallback((newToken, userData) => {
    localStorage.setItem('darc_token', newToken);
    // Decode the JWT to get the id
    const decoded = decodeJWT(newToken);
    const fullUser = { ...userData, ...decoded };
    localStorage.setItem('darc_user', JSON.stringify(fullUser));
    setToken(newToken);
    setUser(fullUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('darc_token');
    localStorage.removeItem('darc_user');
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((userData) => {
    setUser((prev) => {
      const updated = { ...(prev || {}), ...userData };
      localStorage.setItem('darc_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const contextValue = useMemo(
    () => ({ token, user, login, logout, updateUser }),
    [token, user, login, logout, updateUser]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
