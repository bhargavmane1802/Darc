import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';

export default function Hero() {
  const navigate = useNavigate();

  const PILLS = [
    { label: 'AI Mentor', emoji: '\uD83E\uDD16', active: true },
    { label: 'Real-time Chat', emoji: '\uD83D\uDCAC' },
    { label: 'Project Journals', emoji: '\uD83D\uDCD3' },
    { label: 'Daily Digests', emoji: '\uD83D\uDCCA' },
    { label: 'Private Rooms', emoji: '\uD83D\uDD12' },
  ];

  const TRUSTED = ['TechCorp', 'DevStudio', 'CodeBase', 'BuildFast', 'ShipIt', 'StackTeam'];

  return (
    <>
      <section className="landing-hero">
        <h1 className="landing-hero__title">
          Your entire team and AI{' '}
          <span className="landing-hero__title-gradient">working together.</span>
        </h1>
        <p className="landing-hero__subtitle">
          DARC connects your dev team. AI Mentor multiplies what they can do.
        </p>
        <div className="landing-hero__cta-group">
          <button className="landing-hero__btn-primary" onClick={() => navigate('/auth')}>
            GET STARTED
          </button>
          <button className="landing-hero__btn-secondary" onClick={() => {
            const el = document.querySelector('#features');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}>
            EXPLORE FEATURES &rarr;
          </button>
        </div>
      </section>

      <div className="landing-trusted">
        <p className="landing-trusted__label">Trusted by dev teams</p>
        <div className="landing-trusted__logos">
          {TRUSTED.map(name => (
            <span key={name} className="landing-trusted__logo-item">{name}</span>
          ))}
        </div>
      </div>

      <div className="landing-mockup">
        <div className="landing-mockup__frame">
          <div className="landing-mockup__dots">
            <span /><span /><span />
          </div>
          <div className="landing-mockup__placeholder">
            Product screenshot will go here
          </div>
        </div>
      </div>

      <div className="landing-pills">
        {PILLS.map(({ label, emoji, active }) => (
          <button
            key={label}
            className={`landing-pill${active ? ' landing-pill--active' : ''}`}
          >
            {label} {emoji}
          </button>
        ))}
      </div>
    </>
  );
}