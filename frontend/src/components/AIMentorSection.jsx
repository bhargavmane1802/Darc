import React, { useState } from 'react';
import '../styles/landing.css';

const AI_FEATURES = [
  'Review journal entries with AI Mentor',
  'Get daily project digests',
  'Summarize conversations you missed',
  'Get contextual code suggestions',
  'Connect decisions across time',
  'Track team progress automatically',
];

export default function AIMentorSection() {
  const [active, setActive] = useState(0);

  return (
    <section className="landing-ai" id="ai-mentor">
      <div className="landing-ai__inner">
        <div className="landing-ai__header">
          <h2 className="landing-ai__title">
            Reimagine what's possible<br />
            <em>with AI‑powered collaboration.</em>
          </h2>
          <p className="landing-ai__subtitle">
            AI in DARC doesn't just summarize — it connects today's work with your
            entire project history, making every conversation and decision contextually aware.
          </p>
        </div>

        <div className="landing-ai__content">
          <div className="landing-ai__features">
            {AI_FEATURES.map((feat, i) => (
              <button
                key={i}
                className={`landing-ai__feature${i === active ? ' landing-ai__feature--active' : ''}`}
                onClick={() => setActive(i)}
              >
                {feat}
              </button>
            ))}
          </div>

          <div className="landing-ai__mockup">
            <div className="landing-mockup__dots" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{background:'#ff5f57'}} />
              <span style={{background:'#ffbd2e'}} />
              <span style={{background:'#28c840'}} />
            </div>
            <div className="landing-mockup__placeholder" style={{color: 'rgba(255,255,255,0.4)'}}>
              AI Mentor interface preview
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
