import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';

const FEATURES = [
  {
    icon: '💬',
    title: 'Real-Time Chat',
    desc: 'Instant messaging with live typing indicators and presence tracking across your team.',
  },
  {
    icon: '📓',
    title: 'Developer Journals',
    desc: 'Document your progress, ideas and blockers in per-room collaborative journals.',
  },
  {
    icon: '🤖',
    title: 'AI Feedback',
    desc: 'Get streamed AI-powered insights on your journal entries from a senior-dev mentor.',
  },
  {
    icon: '🔐',
    title: 'Private Rooms',
    desc: 'Create invite-only rooms with unique codes. Full control over your collaboration space.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const heroRef = useRef(null);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty('--mx', `${x}%`);
      el.style.setProperty('--my', `${y}%`);
    };
    el.addEventListener('mousemove', onMove);
    return () => el.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div className="landing" ref={heroRef}>
      {/* Nav */}
      <nav className="landing__nav">
        <div className="landing__logo">
          <span className="landing__logo-icon">◈</span> DARC
        </div>
        <button className="btn btn--primary btn--sm" onClick={() => navigate('/auth')}>
          Get Started
        </button>
      </nav>

      {/* Hero */}
      <section className="landing__hero">
        <div className="landing__badge">✦ Built for developers, by developers</div>
        <h1 className="landing__title">
          Where code teams <br />
          <span className="landing__gradient-text">collaborate in real-time</span>
        </h1>
        <p className="landing__subtitle">
          Chat, journal your dev progress, and get AI-powered feedback — all in one sleek platform.
        </p>
        <div className="landing__cta-group">
          <button className="btn btn--primary btn--lg" onClick={() => navigate('/auth')}>
            Start Collaborating
            <span className="btn__arrow">→</span>
          </button>
          <button className="btn btn--ghost btn--lg" onClick={() => {
            document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
          }}>
            Learn More
          </button>
        </div>

        {/* Decorative orbs */}
        <div className="landing__orb landing__orb--1" />
        <div className="landing__orb landing__orb--2" />
        <div className="landing__orb landing__orb--3" />
      </section>

      {/* Features */}
      <section className="landing__features" id="features">
        <h2 className="landing__section-title">Everything your team needs</h2>
        <div className="landing__features-grid">
          {FEATURES.map((f, i) => (
            <div className="feature-card" key={i} style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="feature-card__icon">{f.icon}</div>
              <h3 className="feature-card__title">{f.title}</h3>
              <p className="feature-card__desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="landing__footer">
        <span className="landing__logo-icon">◈</span> DARC &nbsp;·&nbsp; Built with Socket.IO, MongoDB & Gemini AI
      </footer>
    </div>
  );
}
