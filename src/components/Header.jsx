import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Download, RotateCw } from 'lucide-react';
import { signOut } from '../services/dataService';
import { isInstallAvailable, isRunningStandalone, subscribeToInstallAvailability, promptInstall } from '../pwaInstall';

export default function Header({ currentUser, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMobileDropdown, setActiveMobileDropdown] = useState(null);
  const [canInstall, setCanInstall] = useState(isInstallAvailable());
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => subscribeToInstallAvailability(setCanInstall), []);

  const handleInstallClick = async () => {
    setMobileOpen(false);
    await promptInstall();
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const isDashboard = ['/student', '/tutor', '/admin'].some(path => location.pathname.startsWith(path));

  // Navigate to a landing-page section. The target is passed via navigation state and
  // LandingPage scrolls to it once mounted (it may still be lazy-loading). extraState can
  // carry pre-fill hints (e.g. contactSubject).
  const handleNavClick = (sectionId, extraState = {}) => {
    setMobileOpen(false);
    const onLanding = location.pathname === '/';
    navigate(
      { pathname: '/', search: onLanding ? location.search : '' },
      { replace: onLanding, state: { scrollTo: sectionId, ...extraState } }
    );
  };

  const handleSubjectFilterNav = (categoryName) => {
    setMobileOpen(false);
    navigate('/subjects', { state: { initialCategory: categoryName } });
  };

  const handleGradeFilterNav = (gradeName) => {
    setMobileOpen(false);
    navigate('/subjects', { state: { initialGrade: gradeName } });
  };

  const handleSignOut = async () => {
    try {
      setMobileOpen(false);
      await signOut();
      onLogout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      // Fallback logout
      onLogout();
      navigate('/login');
    }
  };

  return (
    <header>
      <nav>
        <div className="logo" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }} onClick={() => navigate('/')}>
          <img src="/images/logo_icon.png" alt="Foundaxia Icon" style={{ height: '48px', objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', overflow: 'hidden', position: 'relative', minHeight: '40px' }} className="logo-text-block">
            <img src="/images/logo_text.png" alt="Foundaxia Brand" style={{ height: '26px', objectFit: 'contain', marginBottom: '2px', maxWidth: '180px' }} />
            <span className="logo-tagline" style={{ textTransform: 'capitalize', fontSize: '0.68rem', letterSpacing: '0.3px', opacity: 0.85 }}>Committed to Building Excellent Foundations</span>
          </div>
        </div>

        <div className="nav-right">
        {/* Desktop and Mobile navigation links */}
        <ul className={`nav-links ${mobileOpen ? 'show' : ''}`}>
          {!isDashboard ? (
            <>
              {/* Grades Dropdown */}
              <li className={`dropdown ${activeMobileDropdown === 'grades' ? 'open' : ''}`}>
                <a 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
                  onClick={(e) => {
                    if (window.innerWidth <= 1150) {
                      e.preventDefault();
                      setActiveMobileDropdown(activeMobileDropdown === 'grades' ? null : 'grades');
                    }
                  }}
                >
                  Grades <span style={{ fontSize: '0.62rem', opacity: 0.8, transform: activeMobileDropdown === 'grades' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                </a>
                <ul className={`dropdown-menu ${activeMobileDropdown === 'grades' ? 'mobile-show' : ''}`}>
                  <li><a onClick={() => { setActiveMobileDropdown(null); handleGradeFilterNav('K-5'); }}>Early Learners (K–5)</a></li>
                  <li><a onClick={() => { setActiveMobileDropdown(null); handleGradeFilterNav('Middle School'); }}>Middle School</a></li>
                  <li><a onClick={() => { setActiveMobileDropdown(null); handleGradeFilterNav('High School'); }}>High School</a></li>
                  <li><a onClick={() => { setActiveMobileDropdown(null); handleGradeFilterNav('K-5'); }}>Homeschool Support</a></li>
                </ul>
              </li>

              {/* Subjects Dropdown */}
              <li className={`dropdown ${activeMobileDropdown === 'subjects' ? 'open' : ''}`}>
                <a 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
                  onClick={(e) => {
                    if (window.innerWidth <= 1150) {
                      e.preventDefault();
                      setActiveMobileDropdown(activeMobileDropdown === 'subjects' ? null : 'subjects');
                    }
                  }}
                >
                  Subjects <span style={{ fontSize: '0.62rem', opacity: 0.8, transform: activeMobileDropdown === 'subjects' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                </a>
                <ul className={`dropdown-menu ${activeMobileDropdown === 'subjects' ? 'mobile-show' : ''}`}>
                  <li><a onClick={() => { setActiveMobileDropdown(null); handleSubjectFilterNav('Math'); }}>Math</a></li>
                  <li><a onClick={() => { setActiveMobileDropdown(null); handleSubjectFilterNav('English & Reading'); }}>Reading &amp; English</a></li>
                  <li><a onClick={() => { setActiveMobileDropdown(null); handleSubjectFilterNav('Science'); }}>Science</a></li>
                  <li><a onClick={() => { setActiveMobileDropdown(null); handleSubjectFilterNav('Test Prep'); }}>Test Prep</a></li>
                  <li><a onClick={() => { setActiveMobileDropdown(null); handleSubjectFilterNav('World Languages'); }}>World Languages</a></li>
                  <li><a onClick={() => { setActiveMobileDropdown(null); handleSubjectFilterNav('Coding & Tech'); }}>Coding</a></li>
                </ul>
              </li>

              <li><a onClick={() => handleNavClick('how-it-works')}>How It Works</a></li>
              <li><a onClick={() => handleNavClick('about')}>Why FoundaXia</a></li>

              {/* No public pricing table yet: pricing enquiries go through the contact form */}
              <li><a onClick={() => handleNavClick('contact', { contactSubject: 'fees' })}>Pricing</a></li>
              
              {/* Add direct Dashboard link if already logged in */}
              {currentUser && currentUser.role !== 'guest' && (
                <li>
                  <a 
                    style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}
                    onClick={() => {
                      setMobileOpen(false);
                      navigate(`/${currentUser.role}`);
                    }}
                  >
                    Dashboard
                  </a>
                </li>
              )}
            </>
          ) : (
            <>

              {currentUser.role === 'student' && !location.pathname.startsWith('/student') && (
                <li><a className="active" onClick={() => { setMobileOpen(false); navigate('/student'); }}>Student Dashboard</a></li>
              )}
              {currentUser.role === 'tutor' && (
                <li><a className="active" onClick={() => { setMobileOpen(false); navigate('/tutor'); }}>Tutor Dashboard</a></li>
              )}
              {currentUser.role === 'admin' && (
                <li><a className="active" onClick={() => { setMobileOpen(false); navigate('/admin'); }}>Admin Control Panel</a></li>
              )}
              {currentUser.role !== 'admin' && currentUser.role !== 'tutor' && !location.pathname.startsWith('/student') && (
                <li><a onClick={() => { setMobileOpen(false); navigate('/'); }}>Public Site</a></li>
              )}
            </>
          )}

          {/* Authentication Badge & Actions */}
          <li style={{ marginLeft: '10px' }}>
            {(!currentUser || currentUser.role === 'guest') ? (
              <button 
                onClick={() => { setMobileOpen(false); navigate('/login'); }}
                className="btn-next"
                style={{ padding: '0.45rem 1.4rem', fontSize: '0.85rem' }}
              >
                Login
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-dark)', fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentUser.full_name ? currentUser.full_name.split(' ')[0] : currentUser.email}
                </span>
                <button 
                  onClick={handleSignOut}
                  className="btn-next"
                  style={{ 
                    padding: '0.4rem 0.9rem', 
                    fontSize: '0.82rem', 
                    background: 'var(--danger)', 
                    boxShadow: '0 4px 10px rgba(220, 53, 69, 0.25)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Log Out
                </button>
              </div>
            )}
          </li>
        </ul>

        {/* Persistent icon actions: always visible, even with the mobile menu collapsed */}
        <div className="header-icon-actions">
          <button onClick={handleRefresh} className="btn-icon-action" title="Refresh page" aria-label="Refresh page">
            <RotateCw size={16} />
          </button>
          {canInstall && !isRunningStandalone() && (
            <button onClick={handleInstallClick} className="btn-install" title="Install app" aria-label="Install app">
              <Download size={15} /> <span className="btn-install-label">Install</span>
            </button>
          )}
        </div>

        <button
          className="mobile-menu-toggle"
          onClick={() => {
            setMobileOpen(!mobileOpen);
            setActiveMobileDropdown(null);
          }}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X /> : <Menu />}
        </button>
        </div>
      </nav>
    </header>
  );
}
