import React from 'react';
import { Menu } from 'lucide-react';

// Bottom navigation for dashboards on phones (hidden above 800px by CSS).
// items: [{ key, label, Icon, badge? }]; "More" opens the full sidebar menu.
export default function MobileTabBar({ items, active, onSelect, onMore, moreActive }) {
  const inBar = items.some(i => i.key === active);
  return (
    <nav className="mobile-tabbar" aria-label="Main sections">
      {items.map(({ key, label, Icon, badge }) => (
        <button
          key={key}
          type="button"
          className={`mobile-tab ${active === key ? 'is-active' : ''}`}
          aria-current={active === key ? 'page' : undefined}
          onClick={() => onSelect(key)}
        >
          <span className="mobile-tab-icon">
            <Icon size={21} />
            {badge > 0 && <b className="mobile-tab-badge">{badge > 9 ? '9+' : badge}</b>}
          </span>
          <span className="mobile-tab-label">{label}</span>
        </button>
      ))}
      <button
        type="button"
        className={`mobile-tab ${moreActive || !inBar ? 'is-active' : ''}`}
        onClick={onMore}
        aria-label="More sections"
      >
        <span className="mobile-tab-icon"><Menu size={21} /></span>
        <span className="mobile-tab-label">More</span>
      </button>
    </nav>
  );
}
