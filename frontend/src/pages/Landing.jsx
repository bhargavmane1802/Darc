import React from 'react';
import '../styles/landing.css';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import AIMentorSection from '../components/AIMentorSection';
import WhatsNew from '../components/WhatsNew';
import TabbedFeatures from '../components/TabbedFeatures';
import FinalCTA from '../components/FinalCTA';
import Footer from '../components/Footer';

export default function Landing() {
  return (
    <div className="landing">
      <Navbar />
      <main>
        <Hero />
        <AIMentorSection />
        <WhatsNew />
        <TabbedFeatures />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}