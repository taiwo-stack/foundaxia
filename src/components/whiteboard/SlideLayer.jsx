import React from 'react';
import SandboxedFrame from '../SandboxedFrame';
import { hasSupabaseConfig } from '../../supabaseClient';

// Live HTML teaching slide, rendered behind the drawing canvas so the tutor can
// annotate directly on top of it with the existing pen/highlighter/shape tools.
// `interactive` toggles whether clicks reach the slide (for using its own buttons/
// links) or pass through to nothing so the canvas underneath can be drawn on instead.
export default function SlideLayer({ slideUrl, interactive, onNavigate, gotoIndex }) {
  if (!slideUrl) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
      <SandboxedFrame
        src={slideUrl}
        title="Teaching slide"
        allowInteraction={interactive}
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
