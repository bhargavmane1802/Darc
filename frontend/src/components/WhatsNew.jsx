import React from 'react';
import '../styles/landing.css';

const FEATURES = [
  {
    badge: 'NEW FEATURE',
    title: 'AI Mentor',
    desc: 'Context-aware feedback that reads like advice from a senior developer.',
  },
  {
    badge: 'NEW FEATURE',
    title: 'Daily Digests',
    desc: 'Wake up knowing exactly what happened while you were away.',
  },
  {
    badge: 'NEW FEATURE',
    title: 'Project Rooms',
    desc: 'Invite-only spaces with real-time chat, journals, and AI insights.',
  },
];

export default function WhatsNew() {
  return (
    <section className="landing-whats-new" id="whats-new">
      <div className="landing-whats-new__header">
        <h2 className="landing-whats-new__title">What's new in DARC</h2>
        <a href="#" className="landing-whats-new__link">See all updates →</a>
      </div>

      <div className="landing-whats-new__grid">
        {FEATURES.map((f, i) => (
          <div key={i} className="landing-whats-new__card">
            <div className="landing-whats-new__card-image">
              <div className="landing-mockup__placeholder" style={{minHeight: 'auto', padding: '60px 20px', fontSize: '13px'}}>
                Feature preview
              </div>
            </div>
            <div className="landing-whats-new__card-body">
              <span className="landing-whats-new__card-badge">{f.badge}</span>
              <h3 className="landing-whats-new__card-title">{f.title}</h3>
              <p className="landing-whats-new__card-desc">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
