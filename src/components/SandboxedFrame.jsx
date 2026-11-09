import React, { useEffect, useRef, useState } from 'react';
import { isTrustedRemoteUrl } from '../services/whiteboardAuth';
import { isPowerPointUrl, officeViewerUrl, getPowerPointAspect, cachedPowerPointAspect } from '../utils/slideMaterials';

// Many of this app's uploaded slide decks share one generator template, which drives
// internal navigation through a top-level `function go(n){...}` (or a couple of common
// alternate names) wired to Next/Prev buttons. This snippet gets injected into the fetched
// HTML before it's rendered - it never touches the uploaded file itself - and does two things:
// wraps that function so a local click also tells the parent page which slide it jumped to,
// and listens for the parent telling IT to jump to a given slide, so a whiteboard session can
// relay one participant's internal slide navigation to everyone else in real time. If the file
// doesn't define any of the candidate function names, the polling below just gives up quietly -
// the slide still renders and behaves exactly as it would on its own.
const NAV_BRIDGE_SCRIPT = `
<script>(function(){
  var NAMES = ['go', 'goTo', 'goto', 'navigate'];
  var suppress = false;
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    for (var k = 0; k < NAMES.length; k++) {
      var name = NAMES[k];
      if (typeof window[name] === 'function' && !window[name].__fxWrapped) {
        (function (name, orig) {
          var wrapped = function (n) {
            orig(n);
            if (!suppress) {
              try { parent.postMessage({ __fx: true, type: 'slideNav', index: n }, '*'); } catch (e) {}
            }
          };
          wrapped.__fxWrapped = true;
          window[name] = wrapped;
        })(name, window[name]);
        clearInterval(iv);
        return;
      }
    }
    if (tries > 40) clearInterval(iv);
  }, 50);

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.__fxCmd !== true || d.type !== 'gotoSlide') return;
    for (var k = 0; k < NAMES.length; k++) {
      if (typeof window[NAMES[k]] === 'function') {
        suppress = true;
        try { window[NAMES[k]](d.index); } finally { suppress = false; }
        break;
      }
    }
  });
})();</script>
`;

const injectNavBridge = (htmlText) => {
  if (/<head[\s>]/i.test(htmlText)) {
    return htmlText.replace(/<head([\s>])/i, (match, after) => `<head${after}${NAV_BRIDGE_SCRIPT}`);
  }
  if (/<html[\s>]/i.test(htmlText)) {
    return htmlText.replace(/<html([^>]*)>/i, (match) => `${match}${NAV_BRIDGE_SCRIPT}`);
  }
  return NAV_BRIDGE_SCRIPT + htmlText;
};

// Renders an uploaded HTML file safely: scripts run (so interactive slide decks work),
// but the frame gets no access to our cookies, localStorage, or the parent window —
// deliberately omitting `allow-same-origin` alongside `allow-scripts` is what makes that hold.
//
// We fetch the file ourselves and load it via `srcDoc` rather than pointing `src` straight
// at the storage URL. Supabase Storage (like most object storage) deliberately serves
// uploaded .html files as Content-Type: text/plain with a locked-down CSP, specifically to
// stop hosted files from executing as live pages when linked to directly - so `src={url}`
// would just show the raw source as text. `srcDoc` hands the browser literal HTML to
// render, bypassing whatever Content-Type the file was served with.
//
// `onNavigate(index)` fires when THIS iframe's own Next/Prev navigation runs locally.
// `gotoIndex` is an externally-driven `{ index, nonce }` - set a new nonce each time (even for
// the same index) to force re-delivery, since this frame should jump whenever told to.
//
// Only URLs under this project's Supabase Storage public prefix or this site's own origin
// are fetched - `src` can arrive from a whiteboard broadcast, and fetching an arbitrary URL
// would let a participant make everyone's browser request (and render) third-party content.
// `allowDataUrl` additionally permits inline `data:text/html` documents; it's only set by
// callers whose URL comes straight from our own database (legacy base64 materials).
const isAllowedSlideSrc = (src, allowDataUrl) => {
  if (typeof src !== 'string' || src.length === 0) return false;
  if (/^data:/i.test(src)) return !!allowDataUrl && /^data:text\/html[;,]/i.test(src);
  return isTrustedRemoteUrl(src);
};

function HtmlSlideFrame({ src, title = 'Slide content', allowInteraction = true, style, onNavigate, gotoIndex, allowDataUrl = false }) {
  const [html, setHtml] = useState(null);
  const [failed, setFailed] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setFailed(false);
    if (!isAllowedSlideSrc(src, allowDataUrl)) {
      console.warn('SandboxedFrame: refusing to load slide from an untrusted URL.');
      setFailed(true);
      return () => { cancelled = true; };
    }
    fetch(src, { credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch slide (' + res.status + ')');
        return res.text();
      })
      .then((text) => { if (!cancelled) setHtml(injectNavBridge(text)); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [src, allowDataUrl]);

  useEffect(() => {
    if (!onNavigate) return;
    const handler = (event) => {
      if (iframeRef.current && event.source === iframeRef.current.contentWindow && event.data?.__fx && event.data.type === 'slideNav') {
        onNavigate(event.data.index);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onNavigate]);

  useEffect(() => {
    if (!gotoIndex || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ __fxCmd: true, type: 'gotoSlide', index: gotoIndex.index }, '*');
  }, [gotoIndex]);

  if (failed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: '#94a3b8', background: 'white', ...style }}>
        Failed to load slide content.
      </div>
    );
  }

  // While the fetch is in flight, show something rather than a blank white pane -
  // otherwise a slower connection makes an in-progress load look like a broken/blank slide.
  if (html === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: '#94a3b8', background: 'white', gap: '0.6rem', ...style }}>
        <div className="loading-spinner" style={{ borderColor: 'rgba(15, 44, 89, 0.15)', borderTopColor: 'var(--primary-color)', width: '20px', height: '20px' }} />
        Loading slide…
      </div>
    );
  }

  return (
    <iframe
      // Forces a full remount instead of React mutating srcDoc on an existing iframe -
      // some browsers don't reliably reload an iframe's document when only its srcDoc
      // property changes on an already-mounted element.
      key={src}
      ref={iframeRef}
      srcDoc={html}
      title={title}
      sandbox="allow-scripts"
      style={{
        border: 'none',
        width: '100%',
        height: '100%',
        background: 'white',
        pointerEvents: allowInteraction ? 'auto' : 'none',
        ...style
      }}
    />
  );
}

// PowerPoint decks: shown through Microsoft's Office Online viewer, untouched, so they look
// and play exactly like PowerPoint. Microsoft fetches the file itself, so it must be a public
// URL - only our own Storage/site URLs are accepted, never one from an arbitrary broadcast.
// The viewer is cross-origin, so there is no slide-number bridge: each viewer clicks
// through the deck on their own. Draw/Interact still works (pointer-events on the frame).
// Height of Microsoft's own bar under the slide (slide counter, arrows).
const OFFICE_BAR_PX = 40;

// `safeArea` keeps the slide clear of things floating over it (e.g. the whiteboard
// toolbar on the left, participant strip on the right, zoom controls at the bottom).
function PowerPointFrame({ src, title = 'PowerPoint slides', allowInteraction = true, style, safeArea }) {
  const [loaded, setLoaded] = useState(false);
  const [aspect, setAspect] = useState(() => cachedPowerPointAspect(src));
  const [box, setBox] = useState(null);
  const areaRef = useRef(null);
  const ok = typeof src === 'string' && !/^data:/i.test(src) && isTrustedRemoteUrl(src);

  useEffect(() => {
    if (!ok) return undefined;
    let alive = true;
    setAspect(cachedPowerPointAspect(src));
    getPowerPointAspect(src).then(a => { if (alive) setAspect(a); });
    return () => { alive = false; };
  }, [src, ok]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ok]);

  if (!ok) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: '#94a3b8', background: 'white', padding: '1rem', textAlign: 'center', ...style }}>
        This PowerPoint can only be shown on the live site.
      </div>
    );
  }

  // Largest frame of the slide's shape (plus Microsoft's bar) that fits the free area,
  // so no part of a slide is cropped or hidden behind the whiteboard controls.
  let frame = { width: '100%', height: '100%' };
  if (box && box.w > 0 && box.h > 0) {
    const w = Math.max(0, Math.min(box.w, (box.h - OFFICE_BAR_PX) * aspect));
    frame = { width: Math.floor(w), height: Math.floor(w / aspect + OFFICE_BAR_PX) };
  }
  const pad = safeArea || {};

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', background: '#1f1f1f', boxSizing: 'border-box',
      paddingTop: pad.top || 0, paddingRight: pad.right || 0, paddingBottom: pad.bottom || 0, paddingLeft: pad.left || 0,
      ...style
    }}>
      <div ref={areaRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {!loaded && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', color: '#cbd5e0', pointerEvents: 'none' }}>
            <div className="loading-spinner" style={{ borderColor: 'rgba(255,255,255,0.15)', borderTopColor: 'white', width: '20px', height: '20px' }} />
            Loading PowerPoint…
          </div>
        )}
        <iframe
          key={src}
          src={officeViewerUrl(src)}
          title={title}
          onLoad={() => setLoaded(true)}
          allow="fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
          // Microsoft's own origin, so allow-same-origin cannot reach our cookies or storage.
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
          style={{
            border: 'none',
            ...frame,
            display: 'block',
            flex: 'none',
            pointerEvents: allowInteraction ? 'auto' : 'none'
          }}
        />
      </div>
    </div>
  );
}

export default function SandboxedFrame(props) {
  return isPowerPointUrl(props.src) ? <PowerPointFrame {...props} /> : <HtmlSlideFrame {...props} />;
}
