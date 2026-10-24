import React, { useState } from 'react';
import '../styles/landing.css';

const TABS = [
  {
    id: 'chat',
    label: 'Chat',
    headline: <>Let your team connect <em>in real time.</em></>,
    desc: "DARC's conversational UI makes collaborating more approachable, whether you're working with a teammate or an AI agent.",
    features: [
      { title: 'It all starts with a channel.', desc: 'Channels are flexible, transparent spaces for your team, AI assistants, and integrations.' },
      { title: 'When typing is easier than talking...', desc: null },
      { title: 'Bring conversations out of the inbox.', desc: null },
    ],
    learnMore: 'Learn about channels →',
    testimonial: {
      quote: '"DARC has been essential to our growth, our speed and our ability to stay aligned as we scale."',
      author: 'Sarah Chen',
      role: 'CTO, DevForge',
    },
  },
  {
    id: 'journal',
    label: 'Journal',
    headline: <>Give everyone <em>instant context.</em></>,
    desc: 'Get access to every decision and conversation, so you can build on past work instead of recreating it.',
    features: [
      { title: 'Meet AI Mentor: Your project memory.', desc: "It's AI that knows your project. It connects across conversations so decisions never get lost." },
      { title: 'One search to find them all.', desc: null },
      { title: 'Bring code context to the conversation.', desc: null },
    ],
    learnMore: 'Learn about journals →',
    stat: { number: '10×', label: 'Faster onboarding with AI-powered context' },
  },
  {
    id: 'ai',
    label: 'AI',
    headline: <>Your personal <em>AI mentor.</em></>,
    desc: 'AI in DARC doesn\'t make you think, it helps you do. It summarizes and searches based on actual conversations.',
    features: [
      { title: 'Review code with AI suggestions.', desc: null },
      { title: 'Get daily project digests automatically.', desc: null },
      { title: 'Summarize what you missed overnight.', desc: null },
    ],
    learnMore: 'Learn about AI Mentor →',
    stat: { number: '97 mins', label: 'Average time teams save weekly with AI in DARC' },
  },
  {
    id: 'rooms',
    label: 'Rooms',
    headline: <>Organize work <em>by project.</em></>,
    desc: 'Private, invite-only rooms keep your conversations focused and your projects organized.',
    features: [
      { title: 'Create rooms in seconds.', desc: 'Share an invite code and your team is in.' },
      { title: 'Per-room journals and AI.', desc: null },
      { title: 'Role-based access control.', desc: null },
    ],
    learnMore: 'Learn about rooms →',
  },
];

export default function TabbedFeatures() {
  const [activeTab, setActiveTab] = useState(0);
  const tab = TABS[activeTab];

  return (
    <section className="landing-tabbed" id="features">
      <div className="landing-tabbed__pills">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            className={`landing-tabbed__pill${i === activeTab ? ' landing-tabbed__pill--active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="landing-tabbed__content">
        <div className="landing-tabbed__text">
          <h2 className="landing-tabbed__headline">{tab.headline}</h2>
          <p className="landing-tabbed__desc">{tab.desc}</p>

          <div className="landing-tabbed__feature-list">
            {tab.features.map((f, i) => (
              <div key={i} className="landing-tabbed__feature-item">
                {f.title}
                {f.desc && <div className="landing-tabbed__feature-item-desc">{f.desc}</div>}
              </div>
            ))}
          </div>

          <a href="#" className="landing-tabbed__learn-link">{tab.learnMore}</a>

          {tab.stat && (
            <div className="landing-tabbed__stat">
              <div className="landing-tabbed__stat-number">{tab.stat.number}</div>
              <div className="landing-tabbed__stat-label">{tab.stat.label}</div>
            </div>
          )}

          {tab.testimonial && (
            <div className="landing-tabbed__testimonial">
              <p className="landing-tabbed__testimonial-quote">{tab.testimonial.quote}</p>
              <div className="landing-tabbed__testimonial-author">{tab.testimonial.author}</div>
              <div className="landing-tabbed__testimonial-role">{tab.testimonial.role}</div>
            </div>
          )}
        </div>

        <div className="landing-tabbed__mockup">
          <div className="landing-mockup__dots">
            <span /><span /><span />
          </div>
          <div className="landing-mockup__placeholder">
            {tab.label} interface preview
          </div>
        </div>
      </div>
    </section>
  );
}
