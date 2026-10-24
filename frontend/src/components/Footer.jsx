import React from 'react';
import '../styles/landing.css';

export default function Footer() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer__inner">
        <div className="landing-footer__brand">
          <div className="landing-footer__logo">
            <div className="landing-footer__logo-icon">{'\u25C8'}</div>
            DARC
          </div>
          <p className="landing-footer__tagline">
            Real-time chat, collaborative journaling, and AI-powered insights for developer teams.
          </p>
        </div>
        <nav>
          <div className="landing-footer__col-title">Product</div>
          <ul className="landing-footer__links">
            {['Features', 'AI Mentor', 'Rooms', 'Pricing'].map(l => (
              <li key={l}><a href="#">{l}</a></li>
            ))}
          </ul>
        </nav>
        <nav>
          <div className="landing-footer__col-title">Company</div>
          <ul className="landing-footer__links">
            {['About', 'Blog', 'Careers', 'Contact'].map(l => (
              <li key={l}><a href="#">{l}</a></li>
            ))}
          </ul>
        </nav>
        <nav>
          <div className="landing-footer__col-title">Resources</div>
          <ul className="landing-footer__links">
            {['Docs', 'Changelog', 'Community', 'Support'].map(l => (
              <li key={l}><a href="#">{l}</a></li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="landing-footer__bottom">
        &copy; 2026 DARC. All rights reserved.
      </div>
    </footer>
  );
}