import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, LogOut } from 'lucide-react';
import { signOut } from '../services/dataService';
import { isInstallAvailable, isRunningStandalone, subscribeToInstallAvailability, promptInstall } from '../pwaInstall';

// Install + Log out at the bottom of the dashboard menu drawer on phones. On phones the
// site header shows only Refresh, so these live here instead (hidden on desktop by CSS,
// where the header still has them).
export default function DrawerAccount({ user, onLogout }) {
  const navigate = useNavigate();
  const [canInstall, setCanInstall] = useState(isInstallAvailable());
  useEffect(() => subscribeToInstallAvailability(setCanInstall), []);

  const logOut = async () => {
    try { await signOut(); } catch (err) { console.error('Logout error:', err); }
    onLogout?.();
    navigate('/login');
  };

  const name = user?.full_name ? user.full_name.split(' ')[0] : user?.email;

  return (
    <div className="drawer-account">
      {name && <div className="drawer-account-name">Signed in as <strong>{name}</strong></div>}
      {canInstall && !isRunningStandalone() && (
        <button type="button" className="drawer-account-btn" onClick={() => promptInstall()}>
          <Download size={18} /> Install app
        </button>
      )}
      <button type="button" className="drawer-account-btn is-danger" onClick={logOut}>
        <LogOut size={18} /> Log out
      </button>
    </div>
  );
}
