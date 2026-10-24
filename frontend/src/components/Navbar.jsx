import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MdMenu, MdClose } from 'react-icons/md';
import '../styles/landing.css';

export default function Navbar() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNav = (path) => { navigate(path); setMobileOpen(false); };

  const handleAnchor = (e, href) => {
    if (href.startsWith('#')) {
      e.preventDefault();
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMobileOpen(false);
    }
  };

  const NAV_LINKS = [
    { label: 'Features', href: '#features' },
    { label: 'AI Mentor', href: '#ai-mentor' },
    { label: "What's New", href: '#whats-new' },
    { label: 'About', href: '#about' },
  ];

  return (
    <header className={`landing-header${scrolled ? ' scrolled' : ''}`}>
      <Link to="/" className="landing-header__logo">
        <div className="landing-header__logo-icon" aria-hidden="true">{'\u25C8'}</div>
        DARC
      </Link>

      <nav className="landing-header__nav">
        {NAV_LINKS.map(({ label, href }) => (
          <a key={label} href={href} className="landing-header__nav-link" onClick={e => handleAnchor(e, href)}>
            {label}
          </a>
        ))}
      </nav>

      <div className="landing-header__cta-group">
        <button className="landing-header__cta-signin" onClick={() => handleNav('/auth')}>Sign in</button>
        <button className="landing-header__cta-start" onClick={() => handleNav('/auth')}>GET STARTED</button>
      </div>

      <button className="landing-header__mobile-btn" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
        {mobileOpen ? <MdClose size={24} /> : <MdMenu size={24} />}
      </button>

      {mobileOpen && (
        <div className="landing-header__mobile-menu">
          {NAV_LINKS.map(({ label, href }) => (
            <a key={label} href={href} className="landing-header__nav-link" onClick={e => handleAnchor(e, href)}>
              {label}
            </a>
          ))}
          <button className="landing-header__cta-start" onClick={() => handleNav('/auth')} style={{width:'100%'}}>GET STARTED</button>
        </div>
      )}
    </header>
  );
}