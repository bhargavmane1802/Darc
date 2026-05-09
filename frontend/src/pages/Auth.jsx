import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiLogin, apiRegister } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import '../styles/auth.css';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { addToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      addToast('Please fill in all fields', 'error');
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        const data = await apiLogin(username, password);
        if (data?.token) {
          login(data.token, { username: username.toLowerCase() });
          addToast('Welcome back!', 'success');
          navigate('/app');
        } else {
          addToast('Invalid credentials', 'error');
        }
      } else {
        await apiRegister(username, password);
        addToast('Account created! Please log in.', 'success');
        setIsLogin(true);
      }
    } catch (err) {
      addToast(err.message || 'Something went wrong', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__orb auth-page__orb--1" />
      <div className="auth-page__orb auth-page__orb--2" />

      <div className="auth-card glass">
        <div className="auth-card__header">
          <span className="auth-card__logo">◈</span>
          <h1 className="auth-card__title">
            {isLogin ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="auth-card__subtitle">
            {isLogin ? 'Sign in to continue to DARC' : 'Join the developer collaboration hub'}
          </p>
        </div>

        <form className="auth-card__form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="auth-username" className="input-group__label">Username</label>
            <input
              id="auth-username"
              type="text"
              className="input-group__input"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="input-group">
            <label htmlFor="auth-password" className="input-group__label">Password</label>
            <input
              id="auth-password"
              type="password"
              className="input-group__input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </div>
          <button type="submit" className="btn btn--primary btn--lg btn--full" disabled={loading}>
            {loading ? <span className="spinner" /> : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-card__footer">
          <span>
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button className="auth-card__toggle" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
