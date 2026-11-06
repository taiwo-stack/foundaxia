import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import './styles/global.css';

// Each page loads as its own chunk instead of all being bundled together, so visiting
// e.g. /login doesn't force downloading the Whiteboard's WebRTC/canvas code first.
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Login = lazy(() => import('./pages/Login'));
const SubjectsPage = lazy(() => import('./pages/SubjectsPage'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const TutorDashboard = lazy(() => import('./pages/TutorDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Whiteboard = lazy(() => import('./pages/Whiteboard'));
const SlideEditor = lazy(() => import('./pages/SlideEditor'));

const RouteFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
    <div
      className="loading-spinner"
      style={{ borderColor: 'rgba(15, 44, 89, 0.15)', borderTopColor: 'var(--primary-color)', width: '32px', height: '32px' }}
    />
  </div>
);

function AppContent() {
  // Persist session across refreshes via sessionStorage
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem('currentUser');
      return stored ? JSON.parse(stored) : { role: 'guest' };
    } catch {
      return { role: 'guest' };
    }
  });
  const location = useLocation();

  const isWhiteboard = location.pathname.startsWith('/whiteboard');
  
  // Hide the footer on dashboard and whiteboard pages for a cleaner web app dashboard workspace feel
  const isDashboardOrWhiteboard = ['/student', '/tutor', '/admin', '/whiteboard', '/slide-editor'].some(path =>
    location.pathname.startsWith(path)
  );

  const handleLogout = () => {
    sessionStorage.removeItem('currentUser');
    setCurrentUser({ role: 'guest' });
  };

  const handleLoginSuccess = (user) => {
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    setCurrentUser(user);
  };

  return (
    <>
      {!isWhiteboard && <Header currentUser={currentUser} onLogout={handleLogout} />}
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/subjects" element={<SubjectsPage />} />
          <Route path="/login" element={<Login onLoginSuccess={handleLoginSuccess} />} />
          <Route
            path="/whiteboard"
            element={
              <ProtectedRoute allowedRoles={['tutor', 'admin']} user={currentUser} allowRoomParticipant={true}>
                <Whiteboard user={currentUser} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student"
            element={
              <ProtectedRoute allowedRoles={['student']} user={currentUser}>
                <StudentDashboard user={currentUser} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tutor"
            element={
              <ProtectedRoute allowedRoles={['tutor']} user={currentUser}>
                <TutorDashboard user={currentUser} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']} user={currentUser}>
                <AdminDashboard user={currentUser} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/slide-editor"
            element={
              <ProtectedRoute allowedRoles={['tutor', 'admin']} user={currentUser}>
                <SlideEditor user={currentUser} />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
      {!isDashboardOrWhiteboard && !location.pathname.startsWith('/login') && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
