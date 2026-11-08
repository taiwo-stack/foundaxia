import React, { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

// Desktop dashboards: the sidebar can shrink to an icon rail. The choice is remembered
// per browser under `storageKey`. Styling lives in Dashboard.css (.dashboard-sidebar.collapsed).
export function useSidebarCollapsed(storageKey) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
  });
  const toggle = () => setCollapsed(prev => {
    const next = !prev;
    try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* storage unavailable */ }
    return next;
  });
  return [collapsed, toggle];
}

export function SidebarCollapseButton({ collapsed, onToggle }) {
  return (
    <button
      type="button"
      className="sidebar-collapse-btn"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
    </button>
  );
}
