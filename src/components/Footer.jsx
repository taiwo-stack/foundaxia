import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Footer() {
  const navigate = useNavigate();
  const location = useLocation();

  // Navigate to a landing-page section; LandingPage scrolls to state.scrollTo once mounted
  // (it may still be lazy-loading when coming from another route).
  const handleNavClick = (sectionId, extraState = {}) => {
    const onLanding = location.pathname === '/';
    navigate(
      { pathname: '/', search: onLanding ? location.search : '' },
      { replace: onLanding, state: { scrollTo: sectionId, ...extraState } }
    );
  };

  return (
    <footer>
      <div className="footer-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2.5rem', maxWidth: '1200px', margin: '0 auto', padding: '3.5rem 2rem 2.5rem' }}>
        {/* Contact block */}
        <div className="footer-section">
          <div className="footer-logo" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'white', padding: '6px 12px', borderRadius: '8px', marginBottom: '1.2rem' }}>
            <img src="/images/logo_icon.png" alt="Foundaxia Icon" style={{ height: '35px', objectFit: 'contain' }} />
            <img src="/images/logo_text.png" alt="Foundaxia Brand" style={{ height: '25px', objectFit: 'contain' }} />
          </div>
          <p style={{ fontSize: '0.88rem', color: 'rgba(255, 255, 255, 0.7)', lineHeight: '1.6', marginBottom: '1.2rem' }}>
            One-on-One Tutoring That Builds Strong Foundations for Lifelong Success.
          </p>
          <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.8)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div>📍 Darka Street,</div>
            <div>📍 Wuse Zone I, FCT Abuja, Nigeria</div>
            <div>📞 +2349061814608</div>
            <div style={{ marginTop: '0.2rem' }}>✉️ info@foundaxia.com</div>
          </div>
        </div>

        {/* Company Column */}
        <div className="footer-section">
          <h3>Company</h3>
          <ul>
            <li><a onClick={() => handleNavClick('about')}>About</a></li>
            <li><a onClick={() => handleNavClick('contact', { contactSubject: 'careers' })}>Careers</a></li>
            <li><a onClick={() => handleNavClick('contact', { contactSubject: 'tutor_application' })}>Become a Tutor</a></li>
            <li><a onClick={() => handleNavClick('contact')}>Contact</a></li>
          </ul>
        </div>

        {/* For Families Column */}
        <div className="footer-section">
          <h3>For Families</h3>
          <ul>
            <li><a onClick={() => handleNavClick('how-it-works')}>How It Works</a></li>
            <li><a onClick={() => handleNavClick('contact', { contactSubject: 'fees' })}>Pricing</a></li>
            <li><a onClick={() => handleNavClick('faq')}>FAQs</a></li>
          </ul>
        </div>

        {/* Subjects Column */}
        <div className="footer-section">
          <h3>Subjects</h3>
          <ul>
            <li><a onClick={() => handleNavClick('subjects-section')}>Math</a></li>
            <li><a onClick={() => handleNavClick('subjects-section')}>English</a></li>
            <li><a onClick={() => handleNavClick('subjects-section')}>Science</a></li>
            <li><a onClick={() => handleNavClick('subjects-section')}>Test Prep</a></li>
            <li><a onClick={() => handleNavClick('subjects-section')}>World Languages</a></li>
            <li><a onClick={() => handleNavClick('subjects-section')}>Coding</a></li>
          </ul>
        </div>

      </div>
      
      <div className="footer-bottom" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', padding: '1.5rem 2rem', textAlign: 'center', color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.85rem' }}>
        <p>&copy; 2026 FoundaXia. All rights reserved.</p>
      </div>
    </footer>
  );
}
