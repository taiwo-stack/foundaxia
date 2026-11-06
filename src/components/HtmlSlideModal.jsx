import React from 'react';
import { X } from 'lucide-react';
import SandboxedFrame from './SandboxedFrame';

// Embedded viewer for an html_slide material, used in place of opening the raw
// file in a new tab (target="_blank") from the Student/Tutor/Admin material lists.
export default function HtmlSlideModal({ url, title, onClose }) {
  if (!url) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(15, 23, 42, 0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white', borderRadius: '12px', width: '100%', maxWidth: '1100px', height: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.35)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.75rem 1.25rem', borderBottom: '1px solid #edf2f7', flexShrink: 0
        }}>
          <strong style={{ fontSize: '0.95rem', color: 'var(--primary-color)' }}>{title || 'Teaching Slide'}</strong>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', padding: '0.3rem', display: 'flex' }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {/* url comes from our own course_materials row; legacy uploads may be inline data: URLs */}
          <SandboxedFrame src={url} title={title} allowDataUrl />
        </div>
      </div>
    </div>
  );
}
