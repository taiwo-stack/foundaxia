import React, { useState, useEffect } from 'react';
import { LayoutGrid, X } from 'lucide-react';
import DrawerAccount from './DrawerAccount';

// Phones/tablets only (hidden above 800px by CSS): a floating Menu button that opens a
// bottom sheet with every dashboard section as a tile, plus Install / Log out.
// items: [{ key, label, Icon, badge?, onClick? }] - onClick for actions that aren't tabs.
export default function MobileMenuSheet({ title, items, active, onSelect, user, onLogout }) {
  const [open, setOpen] = useState(false);
  const totalBadge = items.reduce((n, i) => n + (i.badge || 0), 0);

  // Escape closes; the page behind doesn't scroll while the sheet is open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const pick = (item) => {
    setOpen(false);
    if (item.onClick) item.onClick();
    else onSelect(item.key);
  };

  const current = items.find(i => i.key === active);

  return (
    <>
      <button
        type="button"
        className={`menu-fab ${open ? 'is-hidden' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
      >
        <LayoutGrid size={22} />
        <span className="menu-fab-label">{current ? current.label : 'Menu'}</span>
        {totalBadge > 0 && <b className="menu-fab-badge">{totalBadge > 9 ? '9+' : totalBadge}</b>}
      </button>

      {open && (
        <div className="menu-sheet-backdrop" onClick={() => setOpen(false)}>
          <div className="menu-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
            <div className="menu-sheet-handle" aria-hidden="true" />
            <div className="menu-sheet-head">
              <h2>{title}</h2>
              <button type="button" className="menu-sheet-close" onClick={() => setOpen(false)} aria-label="Close menu">
                <X size={20} />
              </button>
            </div>

            <div className="menu-sheet-grid">
              {items.map((item) => {
                const { key, label, Icon, badge, accent } = item;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`menu-tile ${active === key ? 'is-active' : ''} ${accent ? 'is-accent' : ''}`}
                    aria-current={active === key ? 'page' : undefined}
                    onClick={() => pick(item)}
                  >
                    <span className="menu-tile-icon">
                      <Icon size={22} />
                      {badge > 0 && <b className="menu-tile-badge">{badge > 9 ? '9+' : badge}</b>}
                    </span>
                    <span className="menu-tile-label">{label}</span>
                  </button>
                );
              })}
            </div>

            <DrawerAccount user={user} onLogout={onLogout} className="menu-sheet-account" />
          </div>
        </div>
      )}
    </>
  );
}
