import React, { useEffect, useState } from 'react';
import SandboxedFrame from '../SandboxedFrame';
import { hasSupabaseConfig } from '../../supabaseClient';

// Room kept free around a PowerPoint so the whiteboard's floating controls never cover it:
// tool bar (left), participant strip (right) and zoom / page controls (bottom).
const safeAreaFor = (w) => w <= 600
  ? { top: 8, right: 8, bottom: 128, left: 84 }
  : { top: 12, right: w <= 900 ? 20 : 136, bottom: 84, left: 92 };

// Live HTML teaching slide, rendered behind the drawing canvas so the tutor can
// annotate directly on top of it with the existing pen/highlighter/shape tools.
// `interactive` toggles whether clicks reach the slide (for using its own buttons/
// links) or pass through to nothing so the canvas underneath can be drawn on instead.
export default function SlideLayer({ slideUrl, interactive, onNavigate, gotoIndex }) {
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!slideUrl) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <SandboxedFrame
        src={slideUrl}
        title="Teaching slide"
        allowInteraction={interactive}
        safeArea={safeAreaFor(vw)}
        onNavigate={onNavigate}
        gotoIndex={gotoIndex}
        // Mock mode stores uploaded slides as inline data: URLs and has no collaboration,
        // so nothing remote can reach this prop there. With Supabase, slide URLs from other
        // participants are filtered to Storage/same-origin before they get here.
        allowDataUrl={!hasSupabaseConfig}
      />
    </div>
  );
}
