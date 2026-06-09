import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';

/* ── Showcase data ── */
const SHOWCASE = [
  {
    eyebrow: 'Real-Time Chat',
    title: 'Stay in sync, light-years apart',
    desc: 'Instant messaging with live typing indicators, read receipts, and presence tracking so your distributed team never misses a beat.',
    image: '/showcase-chat.jpg',
    alt: 'DARC real-time chat panel showing live conversations',
    reverse: false,
  },
  {
    eyebrow: 'Collaborative Journals',
    title: 'Document decisions as you go',
    desc: 'Capture ideas, blockers, and decisions in per-room shared journals with code blocks and live sync — your team\'s single source of truth.',
    image: '/showcase-journal.jpg',
    alt: 'DARC collaborative developer journal with code snippets',
    reverse: true,
  },
  {
    eyebrow: 'AI Insights',
    title: 'Mentor-level feedback, always on',
    desc: 'Stream AI-powered insights on your journal entries that read like advice from a senior developer — helping your whole team grow faster.',
    image: '/showcase-ai.jpg',
    alt: 'DARC AI feedback card with streamed insights',
    reverse: false,
  },
];

/* ── Feature cards ── */
const FEATURES = [
  {
    icon: '💬',
    title: 'Real-Time Chat',
    desc: 'Instant messaging with live typing indicators and presence tracking across your team.',
  },
  {
    icon: '📓',
    title: 'Developer Journals',
    desc: 'Document your progress, ideas, and blockers in per-room collaborative journals.',
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

/* ── Nav links ── */
const NAV_LINKS = [
  { label: 'Showcase', href: '#showcase' },
  { label: 'Features',  href: '#features' },
  { label: 'Get Started', href: '/auth' },
];

export default function Landing() {
  const navigate = useNavigate();
  const pageRef  = useRef(null);

  /* Smooth anchor scrolling */
  const handleNavClick = (e, href) => {
    if (href.startsWith('#')) {
      e.preventDefault();
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="landing" ref={pageRef}>
      {/* ── Background layers ── */}
      <div className="landing__starfield" aria-hidden="true" />
      <div className="landing__nebula"    aria-hidden="true" />

      {/* ── HEADER ── */}
      <header className="landing-header" role="banner">
        {/* Logo */}
        <a href="/" className="landing-header__logo" aria-label="DARC home">
          <div className="landing-header__logo-icon" aria-hidden="true">◈</div>
          DARC
        </a>

        {/* Nav */}
        <nav className="landing-header__nav" aria-label="Main navigation">
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="landing-header__nav-link"
              onClick={(e) => handleNavClick(e, href)}
              id={`nav-link-${label.toLowerCase().replace(' ', '-')}`}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* CTA */}
        <a
          href="/app"
          className="landing-header__cta"
          id="header-open-workspace"
          onClick={(e) => { e.preventDefault(); navigate('/auth'); }}
        >
          Open Workspace →
        </a>
      </header>

      {/* ── MAIN ── */}
      <main>
        {/* ── HERO ── */}
        <section className="landing-hero" aria-labelledby="hero-heading">
          {/* Planet (decorative) */}
          <div className="landing-hero__planet" aria-hidden="true">
            <img
              src="/planet-glow.png"
              alt=""
              loading="eager"
            />
          </div>

          {/* Eyebrow */}
          <div className="landing-hero__badge" aria-label="Tagline">
            ✦ Built for developers, by developers
          </div>

          {/* Headline */}
          <h1 className="landing-hero__title" id="hero-heading">
            Where code teams{' '}
            <span className="landing-hero__title-gradient">
              collaborate across the galaxy
            </span>
          </h1>

          {/* Subcopy */}
          <p className="landing-hero__subtitle">
            Chat in real-time, journal your dev progress, and get AI-powered
            feedback — all in one sleek, distributed workspace built for
            engineering teams.
          </p>

          {/* CTAs */}
          <div className="landing-hero__cta-group">
            <button
              id="hero-cta-start"
              className="landing-hero__btn-primary"
              onClick={() => navigate('/auth')}
            >
              Start Collaborating →
            </button>
            <button
              id="hero-cta-learn"
              className="landing-hero__btn-secondary"
              onClick={() => {
                document
                  .querySelector('#showcase')
                  ?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Learn More
            </button>
          </div>


        </section>

        {/* ── SHOWCASE ── */}
        <section
          className="landing-showcase"
          id="showcase"
          aria-labelledby="showcase-heading"
        >
          <div className="landing-showcase__header">
            <h2 className="landing-showcase__title" id="showcase-heading">
              A workspace built for deep work
            </h2>
            <p className="landing-showcase__subtitle">
              Everything your team needs to communicate, document, and decide
              — in one orbit.
            </p>
          </div>

          {SHOWCASE.map(({ eyebrow, title, desc, image, alt, reverse }, idx) => (
            <div
              key={idx}
              className={`landing-showcase__row${reverse ? ' landing-showcase__row--reverse' : ''}`}
            >
              {/* Screenshot frame */}
              <div className="landing-showcase__frame">
                <div className="landing-showcase__image-wrap">
                  <img
                    src={image}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </div>

              {/* Text */}
              <div className="landing-showcase__info">
                <span className="landing-showcase__eyebrow">{eyebrow}</span>
                <h3 className="landing-showcase__feature-title">{title}</h3>
                <p className="landing-showcase__feature-desc">{desc}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── FEATURES GRID ── */}
        <section
          className="landing-features"
          id="features"
          aria-labelledby="features-heading"
        >
          <h2 className="landing-features__title" id="features-heading">
            Everything your team needs
          </h2>
          <div className="landing-features__grid">
            {FEATURES.map(({ icon, title, desc }, idx) => (
              <article className="landing-feature-card" key={idx}>
                <div
                  className="landing-feature-card__icon"
                  aria-hidden="true"
                >
                  {icon}
                </div>
                <h3 className="landing-feature-card__title">{title}</h3>
                <p className="landing-feature-card__desc">{desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── CTA BAND ── */}
        <section
          className="landing-cta"
          aria-labelledby="cta-heading"
        >
          <div className="landing-cta__inner">
            <h2 className="landing-cta__title" id="cta-heading">
              Ready to launch your team into orbit?
            </h2>
            <p className="landing-cta__subtitle">
              Join distributed teams using DARC to communicate, document, and
              decide — together.
            </p>
            <button
              id="cta-band-start"
              className="landing-cta__btn"
              onClick={() => navigate('/auth')}
            >
              Start Collaborating →
            </button>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="landing-footer" role="contentinfo">
        <div className="landing-footer__inner">
          {/* Brand */}
          <div className="landing-footer__brand">
            <div className="landing-footer__logo">
              <div className="landing-footer__logo-icon" aria-hidden="true">◈</div>
              DARC
            </div>
            <p className="landing-footer__tagline">
              Real-time chat, collaborative journaling, and AI-powered insights
              for distributed developer teams.
            </p>
          </div>

          {/* Product */}
          <nav aria-label="Product links">
            <div className="landing-footer__col-title">Product</div>
            <ul className="landing-footer__links">
              {['Showcase', 'Features', 'Workspace', 'Pricing'].map((l) => (
                <li key={l}>
                  <a href={`#${l.toLowerCase()}`} onClick={(e) => handleNavClick(e, `#${l.toLowerCase()}`)}>{l}</a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Company */}
          <nav aria-label="Company links">
            <div className="landing-footer__col-title">Company</div>
            <ul className="landing-footer__links">
              {['About', 'Blog', 'Careers', 'Contact'].map((l) => (
                <li key={l}><a href="#">{l}</a></li>
              ))}
            </ul>
          </nav>

          {/* Resources */}
          <nav aria-label="Resources links">
            <div className="landing-footer__col-title">Resources</div>
            <ul className="landing-footer__links">
              {['Docs', 'Changelog', 'Community', 'Support'].map((l) => (
                <li key={l}><a href="#">{l}</a></li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="landing-footer__bottom">
          © 2026 DARC. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
