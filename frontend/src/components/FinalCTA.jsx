import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';

export default function FinalCTA() {
  const navigate = useNavigate();

  return (
    <section className="landing-final-cta" id="about">
      <h2 className="landing-final-cta__title">
        Ready to build together?
      </h2>
      <p className="landing-final-cta__subtitle">
        Bring your team's conversations, knowledge, and AI insights into one collaborative workspace.
      </p>
      <div className="landing-final-cta__btns">
        <button className="landing-hero__btn-primary" onClick={() => navigate('/auth')}>
          Get Started Free
        </button>
        <button className="landing-hero__btn-secondary" onClick={() => navigate('/auth')}>
          Request a Demo
        </button>
      </div>
    </section>
  );
}