import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ZoomIn, ZoomOut, Maximize, Trash2, ChevronLeft, ChevronRight, ChevronDown, Image as ImageIcon, MonitorPlay } from 'lucide-react';
import { supabase, hasSupabaseConfig } from '../supabaseClient';
import { getMaterials, getCourseTutors, endLiveSession } from '../services/dataService';
import {
  claimWhiteboardHost,
  uploadWhiteboardImage,
  isAllowedImageSrc,
  isTrustedRemoteUrl,
  mainChannelTopic,
  hostChannelTopic
} from '../services/whiteboardAuth';
import '../styles/Whiteboard.css';

// â”€â”€ Whiteboard Sub-Components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import WhiteboardHeader from '../components/whiteboard/WhiteboardHeader';
import SlideLayer from '../components/whiteboard/SlideLayer';
import WhiteboardToolbar from '../components/whiteboard/WhiteboardToolbar';
import WhiteboardProperties from '../components/whiteboard/WhiteboardProperties';
import CollaborationSidebar from '../components/whiteboard/CollaborationSidebar';
import ParticipantStrip from '../components/whiteboard/ParticipantStrip';
import NameModal from '../components/whiteboard/NameModal';
import WipeBoardModal from '../components/whiteboard/WipeBoardModal';
import BoardErrorBoundary from '../components/whiteboard/BoardErrorBoundary';
import { AVATAR_COLORS, generateRandomName } from '../components/whiteboard/constants';

// ── Realtime transport limits ─────────────────────────────────────────────────
// Supabase Realtime rejects broadcast messages above its payload limit (256KB on the
// free plan), so anything bigger is split into 'chunk' messages and reassembled.
const CHUNK_SIZE = 60000;          // characters of JSON per chunk message
const MAX_CHUNKS = 300;            // ~18MB per logical message, hard cap
const CHUNK_PACING_MS = 40;        // stay well under the per-client message rate limit
const CHUNK_TTL_MS = 60000;        // drop partially received messages after a minute
const MAX_PENDING_CHUNKED = 20;    // concurrent partial messages kept per client
const MAX_BUFFERED_CHARS = 40000000; // total partial-message data held at once (~40MB)

// ── Payload validation ─────────────────────────────────────────────────────────
// Everything arriving over the network (and anything loaded from localStorage) goes
// through these before it touches state, so a malformed or hostile payload is dropped
// instead of crashing every renderer.
const MAX_ELEMENTS = 5000;
const MAX_POINTS = 20000;
const ELEMENT_TYPES = new Set(['stroke', 'shape', 'text', 'image']);
const SHAPE_TYPES = new Set(['rectangle', 'circle', 'line', 'arrow']);
const FILL_MODES = new Set(['none', 'semi', 'solid']);
const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n);
const clampNum = (n, min, max) => Math.min(max, Math.max(min, n));
const isShortId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 100;
const safeColor = (c) => (typeof c === 'string' && c.length <= 64 ? c : '#6366f1');

const sanitizePoint = (p) => (
  p && typeof p === 'object' && isFiniteNum(p.x) && isFiniteNum(p.y)
    ? { x: p.x, y: p.y, pressure: isFiniteNum(p.pressure) ? clampNum(p.pressure, 0, 1) : 0.5 }
    : null
);

const sanitizePoints = (pts) => (Array.isArray(pts) ? pts.slice(0, MAX_POINTS).map(sanitizePoint).filter(Boolean) : null);

const sanitizeElement = (el) => {
  if (!el || typeof el !== 'object' || !ELEMENT_TYPES.has(el.type)) return null;
  if (!(isShortId(el.id) || isFiniteNum(el.id))) return null;
  const base = { id: String(el.id), type: el.type, color: safeColor(el.color) };
  if (el.isHighlighter === true) base.isHighlighter = true;
  if (el.locked === true) base.locked = true;
  const width = isFiniteNum(el.width) ? clampNum(el.width, 0.5, 400) : 4;
  switch (el.type) {
    case 'stroke': {
      const points = sanitizePoints(el.points);
      if (!points || points.length === 0) return null;
      return { ...base, points, width };
    }
    case 'shape':
      if (!SHAPE_TYPES.has(el.shapeType) || ![el.x1, el.y1, el.x2, el.y2].every(isFiniteNum)) return null;
      return {
        ...base, shapeType: el.shapeType, x1: el.x1, y1: el.y1, x2: el.x2, y2: el.y2,
        width, fill: FILL_MODES.has(el.fill) ? el.fill : 'none'
      };
    case 'text':
      if (typeof el.text !== 'string' || !isFiniteNum(el.x) || !isFiniteNum(el.y)) return null;
      return {
        ...base, x: el.x, y: el.y, text: el.text.slice(0, 5000),
        fontSize: isFiniteNum(el.fontSize) ? clampNum(el.fontSize, 4, 400) : 24
      };
    case 'image':
      if (!isAllowedImageSrc(el.src) || ![el.x, el.y, el.width, el.height].every(isFiniteNum)) return null;
      return { ...base, src: el.src, x: el.x, y: el.y, width: el.width, height: el.height };
    default:
      return null;
  }
};

const sanitizeElements = (arr) => (
  Array.isArray(arr) ? arr.slice(0, MAX_ELEMENTS).map(sanitizeElement).filter(Boolean) : null
);

const sanitizeSlideUrl = (u) => (typeof u === 'string' && isTrustedRemoteUrl(u) ? u : null);

// The wire form of a page: no undo/redo history (it's local-only and can be many
// times the size of the page itself).
const toWirePage = (p, elementsOverride) => ({
  id: String(p?.id ?? 'page-1'),
  elements: elementsOverride || p?.elements || [],
  slideUrl: p?.slideUrl || null
});

// Downscale an image data URL before sharing it (max 1280px, JPEG unless PNG is
// needed for transparency). Resolves to the original on any decode failure.
const compressImageDataUrl = (dataUrl, preferPng = false) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    try {
      const MAX_DIM = 1280;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(preferPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.8));
    } catch {
      resolve(dataUrl);
    }
  };
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});

const estTextHeight = (el) => (isFiniteNum(el.fontSize) ? el.fontSize : 24);
const estTextWidth = (el) => (typeof el.text === 'string' ? el.text.length : 0) * (estTextHeight(el) * 0.55);

export default function Whiteboard(props) {
  return (
    <BoardErrorBoundary>
      <WhiteboardBoard {...props} />
    </BoardErrorBoundary>
  );
}

function WhiteboardBoard({ user }) {
  const navigate = useNavigate();

  // Collaboration States
  const [roomId, setRoomId] = useState(null);
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [hasDrawAccess, setHasDrawAccess] = useState(false); // Guests start LOCKED. Host sets true via startCollaboration.
  const [userName, setUserName] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [participants, setParticipants] = useState({});
  const [isMicOn, setIsMicOn] = useState(false);
  const [showCollabSidebar, setShowCollabSidebar] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);

  // Connection & Media Refs
  const localUserId = useRef((() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || 'default-room';
    const key = `wb-uid-${room}`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = 'user-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem(key, id);
    }
    return id;
  })());
  const userColor = useRef(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
  const channelRef = useRef(null);
  const peerConnectionsRef = useRef({}); // { peerId: RTCPeerConnection }
  const iceCandidateQueuesRef = useRef({}); // { peerId: RTCIceCandidate[] }
  const activeDrawingsRef = useRef({}); // { userId: { points, color, width, isHighlighter } }
  const participantsRef = useRef({}); // Mirror participants state for draw loop access
  const localStreamRef = useRef(null);
  const localVideoGridRef = useRef(null); // Local camera preview in Floating Video Grid
  const localVideoStripRef = useRef(null); // Local camera preview in Right Participant Strip
  const remoteVideoRefs = useRef({}); // { peerId: HTMLVideoElement }
  const currentStrokeRef = useRef(null);
  const collaborationStartedRef = useRef(false); // guards against the mount effect below running more than once
  const dragOriginalElementsRef = useRef(null); // pre-gesture elements snapshot for select-drag/resize and eraser-drag, so undo restores the true "before" state
  const handleBroadcastEventRef = useRef(null);
  const presenceSyncHandlerRef = useRef(null);
  const pointsSentCountRef = useRef(0);

  // ── Session authority ──
  // hostChannelRef is the PRIVATE channel 'room-<id>-host': RLS (enable_realtime_auth.sql)
  // only lets the session's tutor/admin broadcast on it, so anything received there is
  // genuinely from the host. Host-only events arriving on the public channel are ignored.
  const hostChannelRef = useRef(null);
  const isHostRef = useRef(false);
  const grantedRef = useRef(new Set());       // userIds the host has granted draw access (host-issued)
  const trustedHostIdRef = useRef(null);      // host's userId as announced on the host channel
  const channelStatusRef = useRef({ main: false, host: false });
  const sendQueuesRef = useRef({ main: Promise.resolve(), host: Promise.resolve() });
  const chunkBuffersRef = useRef({});
  const mountedRef = useRef(false);
  const collabStartingRef = useRef(false);
  const startTokenRef = useRef(0);
  const hostChannelErrorShownRef = useRef(false);
  const lastStateRequestRef = useRef(0);
  const pendingStateRequestersRef = useRef(new Set());
  const stateResponseTimerRef = useRef(null);
  const lastStateResponseRef = useRef(0);
  const lastHandRaiseRef = useRef({});
  const toastTimerRef = useRef(null);
  const miscTimersRef = useRef([]);
  const presenceRef = useRef({ userName: '', hasDrawAccess: false, isMicOn: false, isVideoOn: false, handRaised: false });
  const editingHiddenIdRef = useRef(null);    // id of the text element currently being edited (not drawn underneath the textarea)
  const textCommitTokenRef = useRef(null);
  const imageFailedRef = useRef(new Set());   // image srcs that failed to load - never refetched every redraw
  const localAnalyserStreamRef = useRef(null);

  // Video call states
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [showVideoGrid, setShowVideoGrid] = useState(false);
  const [remoteVideoStreams, setRemoteVideoStreams] = useState({}); // { peerId: MediaStream }

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const pdfInputRef = useRef(null); // Separate file input for PDF uploads

  // Audio level analysis
  const audioCtxRef = useRef(null);          // shared AudioContext
  const localAnalyserRef = useRef(null);     // AnalyserNode for local mic
  const remoteAnalysersRef = useRef({});     // { peerId: AnalyserNode }
  const levelRafRef = useRef(null);          // requestAnimationFrame ID for level loop
  const [micLevel, setMicLevel] = useState(0);         // 0-100 RMS level for local mic
  const [speakingPeers, setSpeakingPeers] = useState(new Set()); // set of peerId strings

  // Participant strip (right side)
  const [showParticipantStrip, setShowParticipantStrip] = useState(true);


  // Layout & Settings State
  const [theme, setTheme] = useState('dark'); // 'light' | 'dark'
  const [gridType, setGridType] = useState('dots'); // 'blank' | 'dots' | 'lines' | 'graph'
  const [activeTool, setActiveTool] = useState('pen'); // 'select' | 'pen' | 'eraser' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'text' | 'highlighter' | 'laser'
  const [activeColor, setActiveColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fillMode, setFillMode] = useState('none'); // 'none' | 'semi' | 'solid'
  const [fontSize, setFontSize] = useState(24);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [isPressureSensitive, setIsPressureSensitive] = useState(true);

  // Minimization States for Fullscreen Writing Space
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);

  // Hover states for elements & handles under 'select' tool
  const [hoveredElement, setHoveredElement] = useState(null);
  const [hoveredResizeHandle, setHoveredResizeHandle] = useState(false);

  // Laser Pointer trail references & animation frame tracker
  const laserPointsRef = useRef([]);
  const laserAnimationRef = useRef(null);
  const laserPointerPos = useRef({ x: 0, y: 0, over: false });

  // View State (Pan & Zoom)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Stylus / Pen State Display
  const [pointerType, setPointerType] = useState('mouse');
  const [pointerPressure, setPointerPressure] = useState(0);

  // Multi-page Slide State â€” persisted to localStorage per room
  const STORAGE_KEY = () => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || 'solo';
    return `wb-pages-${room}`;
  };

  const loadPersistedPages = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY());
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 1000).map((p, i) => ({
          id: isShortId(p?.id) ? p.id : `page-${i + 1}`,
          elements: sanitizeElements(p?.elements) || [],
          slideUrl: typeof p?.slideUrl === 'string' ? p.slideUrl : null,
          undoStack: [],
          redoStack: []
        }));
      }
    } catch (_) {}
    return [{ id: 'page-1', elements: [], undoStack: [], redoStack: [] }];
  };

  const [pages, setPages] = useState(loadPersistedPages);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  // Latest-value mirrors for realtime callbacks (subscribe/reconnect handlers outlive renders)
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const currentPageIndexRef = useRef(currentPageIndex);
  currentPageIndexRef.current = currentPageIndex;

  // HTML Teaching Slide attached to the current page (live behind the drawing canvas)
  const currentSlideUrl = pages[currentPageIndex]?.slideUrl || null;
  const [slideMaterials, setSlideMaterials] = useState([]); // this tutor/admin's uploaded html_slide materials
  const [showSlidePicker, setShowSlidePicker] = useState(false);
  const [isSlideInteractive, setIsSlideInteractive] = useState(true); // false = draw on canvas, true = clicks pass through to the slide

  // Relays a slide deck's OWN internal Next/Prev navigation (most uploaded decks drive this
  // through a `go(n)`-style function - see SandboxedFrame's injected bridge) to everyone else
  // in the session, the same way page navigation and drawing already sync live.
  const [remoteSlideGoto, setRemoteSlideGoto] = useState(null); // { index, nonce }
  const handleSlideNavigate = (index) => {
    if (isHost && Number.isInteger(index)) {
      sendOn('host', 'slide-nav', { index });
    }
  };

  // Default to "interactive" whenever a (new) slide becomes active - most uploaded slide
  // decks are click-driven (their own Next/Back nav, quiz buttons, etc.), so navigating
  // them should work immediately without an extra manual toggle. Drawing over it is the
  // opt-in action via the Draw/Interact toggle, not the other way around.
  useEffect(() => {
    if (currentSlideUrl) setIsSlideInteractive(true);
  }, [currentSlideUrl]);

  // Load the host's available html_slide materials once, so the "Attach Slide" picker has something to show
  useEffect(() => {
    if (!isHost) return;
    (async () => {
      try {
        const [allMaterials, courseTutors] = await Promise.all([getMaterials(), getCourseTutors()]);
        const htmlSlides = allMaterials.filter(m => m.file_type === 'html_slide');
        if (user?.role === 'admin') {
          setSlideMaterials(htmlSlides);
        } else {
          const myCourseIds = new Set(courseTutors.filter(ct => ct.tutor_id === user?.id).map(ct => ct.course_id));
          setSlideMaterials(htmlSlides.filter(m => myCourseIds.has(m.course_id)));
        }
      } catch (err) {
        console.error('Failed to load slide materials for whiteboard picker:', err);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  // Host-only: tell everyone which page is showing. Only the target page's content is
  // sent (plus the ordered page ids), never the whole deck or any undo/redo history -
  // participants only ever display the current page, and each navigation delivers it.
  const broadcastPageChange = (pagesArr, pageIndex, elementsOverride) => {
    if (!isCollaborating || !isHost) return;
    const page = pagesArr[pageIndex];
    if (!page) return;
    sendOn('host', 'page-change', {
      pageIndex,
      pageIds: pagesArr.map(p => String(p.id)),
      page: toWirePage(page, elementsOverride)
    });
  };

  const broadcastPagesUpdate = (updatedPages) => {
    broadcastPageChange(updatedPages, currentPageIndex, elements);
  };

  const attachSlideToCurrentPage = (material) => {
    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = { ...updatedPages[currentPageIndex], slideUrl: material.file_url };
    setPages(updatedPages);
    setShowSlidePicker(false);
    if (hasSupabaseConfig && !sanitizeSlideUrl(material.file_url)) {
      triggerToast('This slide is stored inline and cannot be shared live. Re-upload it to share with students.');
    }
    broadcastPagesUpdate(updatedPages);
  };

  const clearSlideFromCurrentPage = () => {
    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = { ...updatedPages[currentPageIndex], slideUrl: null };
    setPages(updatedPages);
    setIsSlideInteractive(false);
    broadcastPagesUpdate(updatedPages);
  };

  // Active slide state (mirrors current page elements and history)
  const [elements, setElements] = useState([]);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Sync active page elements & history to pages array whenever they update
  useEffect(() => {
    // Only update pages from elements state if this client is the host.
    // If they are a student (even with drawing access), they should not sync elements back to pages locally
    // to avoid race conditions and overwriting the host's page state.
    if (!isHost) return;

    setPages(prev => {
      if (prev[currentPageIndex] && 
          (prev[currentPageIndex].elements !== elements ||
           prev[currentPageIndex].undoStack !== undoStack ||
           prev[currentPageIndex].redoStack !== redoStack)) {
        const next = [...prev];
        next[currentPageIndex] = {
          ...next[currentPageIndex],
          elements,
          undoStack,
          redoStack
        };
        return next;
      }
      return prev;
    });
  }, [elements, undoStack, redoStack, currentPageIndex, isHost]);

  // Persist pages to localStorage on every change (debounced to avoid thrashing)
  useEffect(() => {
    try {
      // Strip undo/redo stacks from storage to keep payload small
      // (slideUrl is kept so a host refresh doesn't silently drop the attached slide)
      const toStore = pages.map(p => ({ id: p.id, elements: p.elements, slideUrl: p.slideUrl || null }));
      localStorage.setItem(STORAGE_KEY(), JSON.stringify(toStore));
    } catch (_) {}
  }, [pages]);

  // On first mount: load persisted elements into active drawing state
  useEffect(() => {
    const persisted = loadPersistedPages();
    const firstPage = persisted[0];
    if (firstPage?.elements?.length) {
      setElements(firstPage.elements);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [currentShape, setCurrentShape] = useState(null);
  const [selectedElement, setSelectedElement] = useState(null);
  const [resizeMode, setResizeMode] = useState(null); // 'se' (south-east resize handle)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Text Tool State
  const [editingText, setEditingText] = useState(null); // { id, x, y, screenX, screenY, value }

  // Drag & Drop File State
  const [isDragOver, setIsDragOver] = useState(false);

  // Modal Dialogs
  const [showClearModal, setShowClearModal] = useState(false);

  // PDF / Presentation Upload State
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });

  // Cache loaded images in memory to prevent canvas redraw flashing
  const imageCache = useRef({});

  // Prevent body scrolling when the whiteboard is mounted
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Load PDF.js dynamically from CDN
  useEffect(() => {
    if (!window.pdfjsLib) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.async = true;
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          console.log("PDF.js library loaded successfully!");
        }
      };
      document.body.appendChild(script);
    } else {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }, []);

  // Sync background state with color defaults
  useEffect(() => {
    if (theme === 'dark' && activeColor === '#000000') {
      setActiveColor('#ffffff');
    } else if (theme === 'light' && activeColor === '#ffffff') {
      setActiveColor('#000000');
    }
  }, [theme]);

  // Re-wire local camera stream to both separate components whenever panels toggle
  useEffect(() => {
    if (isVideoOn && localStreamRef.current) {
      if (localVideoGridRef.current && localVideoGridRef.current.srcObject !== localStreamRef.current) {
        localVideoGridRef.current.srcObject = localStreamRef.current;
      }
      if (localVideoStripRef.current && localVideoStripRef.current.srcObject !== localStreamRef.current) {
        localVideoStripRef.current.srcObject = localStreamRef.current;
      }
    }
  }, [showParticipantStrip, showVideoGrid, isVideoOn]);



  // Toast notifications
  const [toastMessage, setToastMessage] = useState('');
  const triggerToast = (msg) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToastMessage('');
    }, 3000);
  };

  // ── Realtime transport ────────────────────────────────────────────────────
  // All outgoing broadcasts go through sendOn(): per-channel FIFO queue (so a large
  // chunked message can't be overtaken by a later small one), and automatic chunking
  // of anything over CHUNK_SIZE so big boards never exceed Realtime's payload limit.
  const sendOn = (kind, event, payload) => {
    const channel = kind === 'host' ? hostChannelRef.current : channelRef.current;
    if (!channel) return;
    let json;
    try {
      json = JSON.stringify(payload ?? {});
    } catch (_) {
      return;
    }
    const queues = sendQueuesRef.current;
    if (json.length <= CHUNK_SIZE) {
      queues[kind] = queues[kind].then(() => {
        try {
          const res = channel.send({ type: 'broadcast', event, payload });
          if (res && typeof res.catch === 'function') res.catch(() => {});
        } catch (_) {}
      });
      return;
    }
    const total = Math.ceil(json.length / CHUNK_SIZE);
    if (total > MAX_CHUNKS) {
      console.warn(`Whiteboard: '${event}' payload too large to sync (${json.length} chars).`);
      triggerToast('This board is too large to sync live. Try removing some images.');
      return;
    }
    const msgId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    queues[kind] = queues[kind].then(async () => {
      for (let i = 0; i < total; i++) {
        const current = kind === 'host' ? hostChannelRef.current : channelRef.current;
        if (current !== channel) return; // channel was torn down / replaced mid-send
        try {
          const res = channel.send({
            type: 'broadcast',
            event: 'chunk',
            payload: { id: msgId, ev: event, i, n: total, d: json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) }
          });
          if (res && typeof res.catch === 'function') res.catch(() => {});
        } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, CHUNK_PACING_MS));
      }
    }).catch(() => {});
  };

  // Board edits travel on the host channel when the host makes them (trusted by
  // everyone) and on the public channel for granted participants (receivers check the
  // sender against the host-issued grant list).
  const sendBoardEvent = (event, payload) => {
    sendOn(isHostRef.current ? 'host' : 'main', event, payload);
  };

  const handleChunk = (payload, kind) => {
    const { id, ev, i, n, d } = payload;
    if (typeof id !== 'string' || id.length > 64 || typeof ev !== 'string' || ev === 'chunk' || ev.length > 64) return;
    if (!Number.isInteger(n) || n < 1 || n > MAX_CHUNKS || !Number.isInteger(i) || i < 0 || i >= n) return;
    if (typeof d !== 'string' || d.length > CHUNK_SIZE) return;
    const buffers = chunkBuffersRef.current;
    const now = Date.now();
    Object.keys(buffers).forEach(k => {
      if (now - buffers[k].t > CHUNK_TTL_MS) delete buffers[k];
    });
    const key = `${kind}:${id}`;
    let buf = buffers[key];
    if (!buf) {
      if (Object.keys(buffers).length >= MAX_PENDING_CHUNKED) return;
      buf = buffers[key] = { t: now, ev, n, parts: new Array(n), got: 0, size: 0 };
    }
    if (buf.ev !== ev || buf.n !== n) return;
    if (buf.parts[i] === undefined) {
      const buffered = Object.values(buffers).reduce((sum, b) => sum + b.size, 0);
      if (buffered + d.length > MAX_BUFFERED_CHARS) {
        delete buffers[key]; // refuse to let chunk floods exhaust memory
        return;
      }
      buf.parts[i] = d;
      buf.size += d.length;
      buf.got += 1;
    }
    if (buf.got === n) {
      delete buffers[key];
      let full;
      try {
        full = JSON.parse(buf.parts.join(''));
      } catch (_) {
        return;
      }
      dispatchIncoming(ev, full, kind);
    }
  };

  const dispatchIncoming = (event, payload, kind) => {
    if (typeof event !== 'string' || !payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    if (event === 'chunk') {
      handleChunk(payload, kind);
      return;
    }
    if (handleBroadcastEventRef.current) {
      handleBroadcastEventRef.current(event, payload, kind === 'host');
    }
  };

  const persistGrants = () => {
    if (!roomId) return;
    try {
      sessionStorage.setItem(`wb-grants-${roomId}`, JSON.stringify([...grantedRef.current]));
    } catch (_) {}
  };

  const loadGrants = (room) => {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(`wb-grants-${room}`) || '[]');
      return Array.isArray(parsed) ? parsed.filter(isShortId) : [];
    } catch (_) {
      return [];
    }
  };

  // Current page snapshot for late joiners, built from refs so it is never stale.
  const buildBoardSnapshot = () => {
    const pagesNow = pagesRef.current;
    const idx = Math.min(Math.max(0, currentPageIndexRef.current), Math.max(0, pagesNow.length - 1));
    return {
      pageIndex: idx,
      pageIds: pagesNow.map(p => String(p.id)),
      page: toWirePage(pagesNow[idx], elementsRef.current)
    };
  };

  const broadcastBoardState = (targetUserIds) => {
    if (!isHostRef.current) return;
    lastStateResponseRef.current = Date.now();
    sendOn('host', 'board-state-response', {
      targetUserIds,
      ...buildBoardSnapshot(),
      granted: [...grantedRef.current],
      hostUserId: localUserId.current
    });
  };

  // Coalesce join requests so a burst of (possibly hostile) request-board-state messages
  // can't make the host flood the room with snapshots.
  const queueBoardStateResponse = (requesterId) => {
    pendingStateRequestersRef.current.add(requesterId);
    if (stateResponseTimerRef.current) return;
    const wait = Math.max(250, 1000 - (Date.now() - lastStateResponseRef.current));
    stateResponseTimerRef.current = setTimeout(() => {
      stateResponseTimerRef.current = null;
      const targets = [...pendingStateRequestersRef.current];
      pendingStateRequestersRef.current = new Set();
      if (targets.length === 0) return;
      broadcastBoardState(targets.length > 20 ? ['all'] : targets);
    }, wait);
  };

  const maybeRequestBoardState = () => {
    if (isHostRef.current) return;
    const status = channelStatusRef.current;
    if (!status.main || !status.host) return; // the response arrives on the host channel - wait until both are joined
    const now = Date.now();
    if (now - lastStateRequestRef.current < 1000) return;
    lastStateRequestRef.current = now;
    sendOn('main', 'request-board-state', { senderUserId: localUserId.current });
  };

  const teardownChannels = () => {
    const main = channelRef.current;
    const host = hostChannelRef.current;
    channelRef.current = null;
    hostChannelRef.current = null;
    channelStatusRef.current = { main: false, host: false };
    chunkBuffersRef.current = {};
    sendQueuesRef.current = { main: Promise.resolve(), host: Promise.resolve() };
    if (stateResponseTimerRef.current) {
      clearTimeout(stateResponseTimerRef.current);
      stateResponseTimerRef.current = null;
    }
    if (supabase) {
      [main, host].forEach(ch => {
        if (!ch) return;
        try {
          supabase.removeChannel(ch).catch(() => {});
        } catch (_) {}
      });
    }
  };

  // Host-only: end the session for everyone, remove the join link from invited
  // students' dashboards, and boot any currently-connected participants out.
  // This is the ONLY place the live_sessions row is deleted from the whiteboard (a page
  // reload also fires pagehide, so deleting there killed the session on every refresh;
  // abandoned rows expire via getLiveSessionsForStudent's 4h age check instead).
  const handleEndSession = async () => {
    if (!window.confirm('End this session for everyone?')) return;
    try {
      await endLiveSession(roomId);
    } catch (_) {
      // Non-fatal: RLS only lets the real host delete the row; nothing else to do here.
    }
    const hostChannel = hostChannelRef.current;
    if (hostChannel) {
      try {
        await Promise.race([
          hostChannel.send({ type: 'broadcast', event: 'session-ended', payload: {} }),
          new Promise(resolve => setTimeout(resolve, 1500))
        ]);
      } catch (_) {}
    }
    navigate(user?.role === 'admin' ? '/admin' : '/tutor');
  };

  // Full teardown on unmount (separate from the join effect below so the StrictMode
  // mount/unmount/mount cycle and `user` re-renders can't leak channels, streams,
  // animation frames or AudioContexts).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startTokenRef.current += 1; // abort any startCollaboration still awaiting
      closeAllPeerConnections();
      stopLocalStream();
      if (levelRafRef.current) {
        cancelAnimationFrame(levelRafRef.current);
        levelRafRef.current = null;
      }
      if (laserAnimationRef.current) {
        cancelAnimationFrame(laserAnimationRef.current);
        laserAnimationRef.current = null;
      }
      disconnectLocalAnalyser();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      miscTimersRef.current.forEach(clearTimeout);
      miscTimersRef.current = [];
      teardownChannels();
      collaborationStartedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount: check room ID, join collaboration automatically if URL link exists.
  // Guarded so the join runs once: Supabase's realtime client dedupes channels by topic,
  // so a second join for the same room while the first is still subscribed would reuse
  // (and corrupt) that channel. The guard is released again if this effect is cleaned up
  // before anything was actually started (StrictMode's immediate mount/unmount/mount, or
  // `user` loading while the host check is still in flight), so the next run can start.
  useEffect(() => {
    if (collaborationStartedRef.current) return undefined;
    collaborationStartedRef.current = true;
    let cancelled = false;
    const timers = [];
    const schedule = (fn) => {
      timers.push(setTimeout(() => {
        if (!cancelled) fn();
      }, 100));
    };

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    const legacyIsHost = () =>
      (!roomParam || sessionStorage.getItem(`wb-host-${roomParam}`) === 'true') && !(user && user.role === 'student');

    (async () => {
      // Host status comes from the database (auth user == live_sessions.tutor_id), not
      // sessionStorage. A page without ?room is a brand-new board (route is tutor/admin
      // only); startCollaboration registers it as an ad-hoc room.
      let clientIsHost;
      if (!roomParam) {
        clientIsHost = true;
      } else if (!hasSupabaseConfig) {
        clientIsHost = legacyIsHost(); // mock mode: no collaboration, UI only
      } else {
        const { isHost: dbIsHost, error } = await claimWhiteboardHost(roomParam);
        if (error) {
          // UI-only fallback (e.g. enable_realtime_auth.sql not run yet). It grants no
          // power: host events are only accepted from the RLS-protected host channel.
          console.error('Whiteboard: host check failed, falling back to local role check:', error);
          clientIsHost = legacyIsHost();
        } else {
          clientIsHost = dbIsHost;
        }
      }
      if (cancelled) return;

      if (roomParam && !clientIsHost) {
        // Guest joining via shared link
        setRoomId(roomParam);
        setIsHost(false);
        isHostRef.current = false;
        setHasDrawAccess(false);

        const storedName = localStorage.getItem(`wb-name-${roomParam}`);
        if (user && user.full_name) {
          // Logged-in student: auto-join immediately with their name!
          schedule(() => startCollaboration(roomParam, user.full_name, false));
        } else if (storedName) {
          // Guest who already filled out their name before refresh: auto-join!
          schedule(() => startCollaboration(roomParam, storedName, false));
        } else {
          // Anonymous guest: ask for name in modal
          setShowNameModal(true);
        }
      } else {
        // Host: auto-join the room immediately
        const activeRoom = roomParam || 'room-' + Math.random().toString(36).substr(2, 9);

        let defaultName = 'Tutor';
        if (user) {
          if (user.role === 'admin') {
            defaultName = user.full_name || 'Admin';
          } else if (user.role === 'tutor') {
            defaultName = user.full_name || 'Tutor';
          } else if (user.full_name) {
            defaultName = user.full_name;
          }
        }

        // Use setTimeout to allow supabase import to settle before subscribing
        schedule(() => startCollaboration(activeRoom, defaultName, true));
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      // Nothing started yet -> let the next run of this effect start the session.
      if (!channelRef.current && !collabStartingRef.current) {
        collaborationStartedRef.current = false;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Presence payload, always built from the latest values (refs), never a stale closure.
  const buildPresence = (updates = {}) => ({
    userId: localUserId.current,
    userName: presenceRef.current.userName,
    isHost: isHostRef.current,
    hasDrawAccess: isHostRef.current ? true : presenceRef.current.hasDrawAccess,
    color: userColor.current,
    isMicOn: presenceRef.current.isMicOn,
    isVideoOn: presenceRef.current.isVideoOn,
    handRaised: presenceRef.current.handRaised,
    cursor: null,
    ...updates
  });

  const updatePresenceState = async (updates = {}) => {
    Object.keys(updates).forEach(k => {
      if (k in presenceRef.current) presenceRef.current[k] = updates[k];
    });
    if (!channelRef.current) return;
    try {
      await channelRef.current.track(buildPresence(updates));
    } catch (_) {}
  };

  const startCollaboration = async (id, chosenName, asHost = null) => {
    if (!supabase) {
      alert("Supabase configuration not detected. Multiplayer collaboration is unavailable.");
      return;
    }
    if (!mountedRef.current || !isShortId(id)) return;

    const token = ++startTokenRef.current;
    collabStartingRef.current = true;
    try {
      const hostMode = asHost !== null ? asHost : isHostRef.current;

      const name = chosenName || userName || generateRandomName();
      setUserName(name);
      presenceRef.current.userName = name;
      setRoomId(id);
      setIsCollaborating(true);
      setShowNameModal(false);
      localStorage.setItem(`wb-name-${id}`, name);
      if (asHost !== null) {
        setIsHost(asHost);
        setHasDrawAccess(asHost ? true : hasDrawAccess);
      }
      isHostRef.current = hostMode;

      // Update browser URL query parameter without page reload
      const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?room=${id}`;
      window.history.replaceState({ path: newurl }, '', newurl);

      if (hostMode) {
        // Registers a brand-new ad-hoc room (live_sessions row with us as tutor) so RLS lets
        // us broadcast on its host channel; a no-op for rooms we already own.
        const { isHost: confirmed, error } = await claimWhiteboardHost(id);
        if (token !== startTokenRef.current || !mountedRef.current) return;
        if (error || !confirmed) {
          console.warn('Whiteboard: the server did not confirm host rights for this room - live sync to participants will not work.', error || '');
        }
        trustedHostIdRef.current = localUserId.current;
        grantedRef.current = new Set(loadGrants(id));
      } else {
        trustedHostIdRef.current = null;
        grantedRef.current = new Set();
      }

      teardownChannels();

      // Make sure Realtime carries the logged-in user's JWT (the private host channel's
      // RLS checks it); anonymous guests keep the anon key.
      try { await supabase.realtime.setAuth(); } catch (_) {}
      if (token !== startTokenRef.current || !mountedRef.current) return;

      const channel = supabase.channel(mainChannelTopic(id), {
        config: {
          presence: {
            key: localUserId.current,
          },
        },
      });
      const hostChannel = supabase.channel(hostChannelTopic(id), {
        config: { private: true }
      });

      channelRef.current = channel;
      hostChannelRef.current = hostChannel;

      // Track participant joins/leaves using dynamic ref to avoid stale closures
      channel.on('presence', { event: 'sync' }, () => {
        if (presenceSyncHandlerRef.current) {
          presenceSyncHandlerRef.current();
        }
      });

      // Handle broadcast signals using fresh ref to avoid stale closures
      channel.on('broadcast', { event: '*' }, ({ event, payload }) => dispatchIncoming(event, payload, 'main'));
      hostChannel.on('broadcast', { event: '*' }, ({ event, payload }) => dispatchIncoming(event, payload, 'host'));

      // Callbacks fire again on every reconnect: everything below reads refs, and the
      // one-shot bits (welcome toast, host's initial snapshot) only run the first time.
      let mainJoinedOnce = false;
      let hostJoinedOnce = false;

      channel.subscribe(async (status) => {
        if (channelRef.current !== channel) return;
        if (status === 'SUBSCRIBED') {
          channelStatusRef.current.main = true;
          try {
            await channel.track(buildPresence());
          } catch (_) {}
          if (!mainJoinedOnce) {
            mainJoinedOnce = true;
            triggerToast(`Connected to room! Welcome ${name}.`);
          }
          // A (re)joining participant may have missed events - resync from the host.
          maybeRequestBoardState();
        } else {
          channelStatusRef.current.main = false;
        }
      });

      hostChannel.subscribe((status, err) => {
        if (hostChannelRef.current !== hostChannel) return;
        if (status === 'SUBSCRIBED') {
          channelStatusRef.current.host = true;
          if (isHostRef.current) {
            if (!hostJoinedOnce) broadcastBoardState(['all']);
          } else {
            maybeRequestBoardState();
          }
          hostJoinedOnce = true;
        } else {
          channelStatusRef.current.host = false;
          if (status === 'CHANNEL_ERROR') {
            console.error('Whiteboard: could not join the secure host channel:', err);
            if (!hostChannelErrorShownRef.current) {
              hostChannelErrorShownRef.current = true;
              triggerToast(isHostRef.current
                ? 'Secure session channel unavailable - participants will not see your board.'
                : 'Could not connect to the tutor\'s board. Try reloading.');
            }
          }
        }
      });
    } finally {
      if (token === startTokenRef.current) collabStartingRef.current = false;
    }
  };

  const initiateRoomCollab = () => {
    const roomUuid = 'room-' + Math.random().toString(36).substr(2, 9);
    startCollaboration(roomUuid, userName || 'Host Tutor', true);
  };

  const updateCurrentPageElements = (newElements) => {
    setPages(prev => {
      const updated = [...prev];
      if (updated[currentPageIndex]) {
        updated[currentPageIndex].elements = newElements;
      }
      return updated;
    });
  };

  const lastDrawingBroadcastRef = useRef(0);
  const broadcastDrawingStroke = (newPoints, color, width, isHighlighter) => {
    if (!channelRef.current) return false;
    const now = Date.now();
    if (now - lastDrawingBroadcastRef.current < 16) return false; // ~60fps throttle for instant sync
    lastDrawingBroadcastRef.current = now;

    sendBoardEvent('drawing-stroke', { userId: localUserId.current, newPoints, color, width, isHighlighter });
    return true;
  };

  // Receivers upsert by element id, so re-sending an existing element (e.g. edited
  // text) replaces it on every peer instead of duplicating it.
  const broadcastDrawingEnd = (element) => {
    if (!channelRef.current) return;
    sendBoardEvent('drawing-end', { userId: localUserId.current, element });
  };

  const broadcastElementsUpdate = (updatedElements) => {
    if (!channelRef.current) return;
    sendBoardEvent('element-update', { action: 'update-all', elements: updatedElements, senderUserId: localUserId.current });
  };

  const broadcastElementsClear = () => {
    if (!channelRef.current) return;
    if (isHostRef.current) {
      sendOn('host', 'element-update', { action: 'clear' });
    } else {
      // Only the host may 'clear'; anyone else expresses it as an (authorised) update-all.
      broadcastElementsUpdate([]);
    }
  };

  const lastCursorBroadcastRef = useRef(0);
  const broadcastCursor = (clientX, clientY) => {
    if (!isCollaborating || !channelRef.current || !canvasRef.current) return;
    const now = Date.now();
    if (now - lastCursorBroadcastRef.current < 80) return; // Throttle cursor events
    lastCursorBroadcastRef.current = now;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y) / zoom;

    sendOn('main', 'peer-cursor', { userId: localUserId.current, cursor: { x, y } });
  };

  // Re-derive the participants list from presence, overriding the self-reported
  // isHost / hasDrawAccess flags with host-issued (trusted) state.
  const remapParticipants = () => {
    if (presenceSyncHandlerRef.current) presenceSyncHandlerRef.current();
  };

  const applyGrantedList = (granted) => {
    if (!Array.isArray(granted)) return;
    grantedRef.current = new Set(granted.filter(isShortId).slice(0, 500));
    if (!isHostRef.current) {
      const mine = grantedRef.current.has(localUserId.current);
      setHasDrawAccess(mine);
      if (presenceRef.current.hasDrawAccess !== mine) updatePresenceState({ hasDrawAccess: mine });
    }
    remapParticipants();
  };

  const toggleParticipantDrawAccess = (peerId) => {
    if (!isHost || !hostChannelRef.current || !isShortId(peerId)) return;
    const nextAccess = !grantedRef.current.has(peerId);
    if (nextAccess) grantedRef.current.add(peerId);
    else grantedRef.current.delete(peerId);
    persistGrants();

    // Auto-lower student's hand when granting draw access
    sendOn('host', 'access-changed', {
      targetUserId: peerId,
      hasDrawAccess: nextAccess,
      lowerHand: nextAccess,
      granted: [...grantedRef.current]
    });

    // Also trigger local state indicator redraw
    setParticipants(prev => {
      if (!prev[peerId]) return prev;
      const updated = { ...prev[peerId], hasDrawAccess: nextAccess };
      if (nextAccess) updated.handRaised = false;
      return { ...prev, [peerId]: updated };
    });
  };

  const lowerParticipantHand = (peerId) => {
    if (!isHost || !isShortId(peerId)) return;
    sendOn('host', 'lower-hand-request', { targetUserId: peerId });
    setParticipants(prev => (prev[peerId] ? { ...prev, [peerId]: { ...prev[peerId], handRaised: false } } : prev));
  };

  const toggleRaiseHand = async () => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
    if (isCollaborating) {
      updatePresenceState({ handRaised: nextState });
      if (nextState) {
        sendOn('main', 'hand-raised', { userId: localUserId.current, userName: userName });
      }
    }
  };

  // Events only the host may send: accepted ONLY from the RLS-protected host channel.
  const HOST_ONLY_EVENTS = ['session-ended', 'page-change', 'board-state-response', 'access-changed', 'lower-hand-request', 'slide-nav'];
  // Board edits: from the host channel, or from the public channel when the sender is on
  // the host-issued grant list.
  const BOARD_EDIT_EVENTS = ['drawing-stroke', 'drawing-end', 'element-update'];

  const handleBroadcastEvent = (event, payload, fromHostChannel = false) => {
    if (!payload || typeof payload !== 'object') return;
    if (HOST_ONLY_EVENTS.includes(event) && !fromHostChannel) return;
    if (BOARD_EDIT_EVENTS.includes(event) && !fromHostChannel) {
      const sender = event === 'element-update' ? payload.senderUserId : payload.userId;
      // Residual risk (documented): userIds are client-chosen, so a participant who copies
      // a currently-granted participant's id can still draw as them on the public channel.
      if (!isShortId(sender) || sender === trustedHostIdRef.current || !grantedRef.current.has(sender)) return;
      if (event === 'element-update' && payload.action !== 'update-all') return;
    }

    switch (event) {
      case 'drawing-stroke': {
        const userKey = payload.userId;
        const newPoints = sanitizePoints(payload.newPoints);
        if (!isShortId(userKey) || !newPoints) break;
        if (!activeDrawingsRef.current[userKey]) {
          activeDrawingsRef.current[userKey] = {
            type: 'stroke',
            points: [],
            color: safeColor(payload.color),
            width: isFiniteNum(payload.width) ? clampNum(payload.width, 0.5, 400) : 4,
            isHighlighter: payload.isHighlighter === true
          };
        }
        // Append newly arrived delta points
        const live = activeDrawingsRef.current[userKey];
        if (live.points.length + newPoints.length <= MAX_POINTS) {
          live.points.push(...newPoints);
        }
        drawCanvas();
        break;
      }

      case 'drawing-end': {
        // Drop malformed elements instead of letting them crash every renderer.
        const element = sanitizeElement(payload.element);
        if (!element) break;
        // Record a history checkpoint before applying the remote stroke, so a local
        // Undo reverts this specific change instead of popping a now-stale snapshot
        // from before the remote update (which would silently drop it).
        setUndoStack(prev => [...prev, elements]);
        setRedoStack([]);
        // Upsert: an element that already exists (edited text) is replaced in place.
        setElements(prev => {
          const idx = prev.findIndex(el => el.id === element.id);
          if (idx === -1) return [...prev, element];
          const next = [...prev];
          next[idx] = element;
          return next;
        });
        // Delay active drawing ref cleanup slightly to overlap with React state commit
        // and prevent concurrent cursor-move updates from wiping the stroke off canvas
        const endedUser = payload.userId;
        miscTimersRef.current.push(setTimeout(() => {
          if (isShortId(endedUser)) delete activeDrawingsRef.current[endedUser];
          drawCanvas();
        }, 80));
        break;
      }

      case 'element-update': {
        let nextElements = null;
        if (payload.action === 'clear') {
          nextElements = [];
        } else if (payload.action === 'update-all') {
          nextElements = sanitizeElements(payload.elements);
        }
        if (!nextElements) break;
        setUndoStack(prev => [...prev, elements]);
        setRedoStack([]);
        setElements(nextElements);
        updateCurrentPageElements(nextElements);
        if (payload.action === 'clear') setSelectedElement(null);
        drawCanvas();
        break;
      }

      case 'page-change':
        if (!isHost) {
          applyRemotePageState(payload);
        }
        break;

      case 'access-changed':
        if (isHost) break;
        applyGrantedList(payload.granted);
        if (payload.targetUserId === localUserId.current && typeof payload.hasDrawAccess === 'boolean') {
          setHasDrawAccess(payload.hasDrawAccess);
          const updates = { hasDrawAccess: payload.hasDrawAccess };
          if (payload.lowerHand === true) {
            setIsHandRaised(false);
            updates.handRaised = false;
          }
          updatePresenceState(updates);
          triggerToast(payload.hasDrawAccess ? "Drawing access GRANTED by host!" : "Drawing access REVOKED by host.");
        }
        break;

      case 'hand-raised': {
        if (!isHost || !isShortId(payload.userId)) break;
        // Throttle per sender so a participant can't spam toasts/chimes.
        const now = Date.now();
        if (now - (lastHandRaiseRef.current[payload.userId] || 0) < 3000) break;
        lastHandRaiseRef.current[payload.userId] = now;
        const who = typeof payload.userName === 'string' ? payload.userName.slice(0, 60) : 'A participant';
        triggerToast(`✋ ${who} raised their hand!`);
        try {
          // Subtle, high-quality pop chime using Web Audio API
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 note
          osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.12); // A5 note
          gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.22);
          // Release the context once the chime has played (browsers cap live AudioContexts).
          osc.onended = () => {
            audioCtx.close().catch(() => {});
          };
          osc.start();
          osc.stop(audioCtx.currentTime + 0.22);
        } catch (_) {}
        break;
      }

      case 'lower-hand-request':
        if (payload.targetUserId === localUserId.current) {
          setIsHandRaised(false);
          updatePresenceState({ handRaised: false });
          triggerToast("Tutor lowered your hand.");
        }
        break;

      case 'peer-cursor':
        if (isShortId(payload.userId) && participantsRef.current[payload.userId] &&
            payload.cursor && isFiniteNum(payload.cursor.x) && isFiniteNum(payload.cursor.y)) {
          participantsRef.current[payload.userId].cursor = { x: payload.cursor.x, y: payload.cursor.y };
          drawCanvas();
        }
        break;

      // WebRTC voice chat signaling
      // WebRTC voice chat signaling (public channel; see residual-risk note in the report)
      case 'webrtc-offer':
        if (payload.targetUserId === localUserId.current && isShortId(payload.senderUserId) &&
            payload.offer && typeof payload.offer === 'object') {
          handleWebRTCOffer(payload.offer, payload.senderUserId);
        }
        break;
      case 'webrtc-answer':
        if (payload.targetUserId === localUserId.current && isShortId(payload.senderUserId) &&
            payload.answer && typeof payload.answer === 'object') {
          handleWebRTCAnswer(payload.answer, payload.senderUserId);
        }
        break;
      case 'webrtc-ice':
        if (payload.targetUserId === localUserId.current && isShortId(payload.senderUserId) &&
            payload.candidate && typeof payload.candidate === 'object') {
          handleWebRTCIce(payload.candidate, payload.senderUserId);
        }
        break;

      case 'peer-reconnect': {
        const peerId = payload.senderUserId;
        if (!isShortId(peerId) || peerId === localUserId.current) break;
        if (peerConnectionsRef.current[peerId]) {
          try {
            peerConnectionsRef.current[peerId].close();
          } catch (_) {}
          delete peerConnectionsRef.current[peerId];
        }
        // Candidates queued for the old connection belong to a dead ICE session.
        delete iceCandidateQueuesRef.current[peerId];
        delete remoteVideoRefs.current[peerId];
        setRemoteVideoStreams(prev => {
          if (!(peerId in prev)) return prev;
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
        removeRemoteAnalyser(peerId);
        const audioEl = document.getElementById('peer-audio-' + peerId);
        if (audioEl) audioEl.remove();

        // Create fresh connection
        createPeerConnection(peerId, localUserId.current > peerId);
        break;
      }

      case 'request-board-state':
        if (isHost && hostChannelRef.current && isShortId(payload.senderUserId)) {
          queueBoardStateResponse(payload.senderUserId);
        }
        break;

      case 'board-state-response': {
        if (isHost) break;
        const targets = Array.isArray(payload.targetUserIds) ? payload.targetUserIds : [];
        if (!targets.includes('all') && !targets.includes(localUserId.current)) break;
        if (isShortId(payload.hostUserId)) trustedHostIdRef.current = payload.hostUserId;
        applyGrantedList(payload.granted);
        if (applyRemotePageState(payload)) {
          triggerToast("Whiteboard sync complete!");
        }
        break;
      }

      case 'session-ended':
        if (!isHost) {
          triggerToast('The tutor ended this session.');
          miscTimersRef.current.push(setTimeout(() => navigate('/student'), 1500));
        }
        break;

      case 'slide-nav':
        if (!isHost && Number.isInteger(payload.index) && payload.index >= 0 && payload.index < 10000) {
          setRemoteSlideGoto({ index: payload.index, nonce: Date.now() });
        }
        break;

      default:
        break;
    }
  };

  // Apply a host page snapshot ({ pageIndex, pageIds, page }) from page-change or
  // board-state-response. Returns false (and changes nothing) for malformed payloads.
  const applyRemotePageState = (payload) => {
    const { pageIds, pageIndex, page } = payload;
    if (!Array.isArray(pageIds) || pageIds.length === 0 || pageIds.length > 1000 || !pageIds.every(isShortId)) return false;
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageIds.length) return false;
    if (!page || typeof page !== 'object') return false;
    const pageElements = sanitizeElements(page.elements);
    if (!pageElements) return false;
    const slideUrl = sanitizeSlideUrl(page.slideUrl);

    const existingById = {};
    pagesRef.current.forEach(p => { existingById[p.id] = p; });
    const nextPages = pageIds.map((pid, i) => {
      if (i === pageIndex) return { id: pid, elements: pageElements, slideUrl, undoStack: [], redoStack: [] };
      const existing = existingById[pid];
      return existing
        ? { ...existing, undoStack: [], redoStack: [] }
        : { id: pid, elements: [], slideUrl: null, undoStack: [], redoStack: [] };
    });

    setPages(nextPages);
    setCurrentPageIndex(pageIndex);
    setElements(pageElements);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedElement(null);
    requestAnimationFrame(() => {
      drawCanvas();
    });
    return true;
  };

  presenceRef.current.hasDrawAccess = hasDrawAccess;
  presenceRef.current.isMicOn = isMicOn;
  presenceRef.current.isVideoOn = isVideoOn;
  presenceRef.current.handRaised = isHandRaised;
  if (userName) presenceRef.current.userName = userName;
  isHostRef.current = isHost;

  handleBroadcastEventRef.current = handleBroadcastEvent;

  presenceSyncHandlerRef.current = () => {
    const channel = channelRef.current;
    if (!channel) return;
    const state = channel.presenceState();
    const mapped = {};
    Object.keys(state).forEach(key => {
      const meta = Array.isArray(state[key]) ? state[key][0] : null;
      if (!meta || typeof meta !== 'object') return;
      // Presence metadata is self-reported, so isHost / hasDrawAccess come from
      // host-issued state instead, and userId is pinned to the presence key.
      const isPeerHost = key === trustedHostIdRef.current;
      mapped[key] = {
        ...meta,
        userId: key,
        userName: typeof meta.userName === 'string' ? meta.userName.slice(0, 60) : 'Guest',
        isHost: isPeerHost,
        hasDrawAccess: isPeerHost || grantedRef.current.has(key),
        cursor: participantsRef.current[key]?.cursor || null
      };
    });
    setParticipants(mapped);
    participantsRef.current = mapped;
    
    // Clean up active drawing trails of users who left so they don't get stuck on screen
    Object.keys(activeDrawingsRef.current).forEach(userId => {
      if (!mapped[userId]) {
        delete activeDrawingsRef.current[userId];
      }
    });

    // Update WebRTC voice streams when new peers join
    syncVoicePeers(mapped);
    drawCanvas();
  };

  // WebRTC Audio + Video Stream Helpers
  const getLocalStream = async (constraints = {}) => {
    // Inject voice-optimized audio constraints to prevent breaking and feedback echo
    const optimizedConstraints = { ...constraints };
    if (optimizedConstraints.audio) {
      optimizedConstraints.audio = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
        // Removed strict 5ms latency parameter which causes OverconstrainedError on many systems
      };
    }
    if (optimizedConstraints.video) {
      // Standard definition ideal resolution to prevent bandwidth lags & glitching
      optimizedConstraints.video = {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 20 }
      };
    }

    // If existing stream already has the right tracks, reuse it
    if (localStreamRef.current) {
      const hasMic = localStreamRef.current.getAudioTracks().length > 0;
      const hasCam = localStreamRef.current.getVideoTracks().length > 0;
      const needsMic = constraints.audio !== false && !!constraints.audio;
      const needsCam = constraints.video !== false && !!constraints.video;
      if ((hasMic || !needsMic) && (hasCam || !needsCam)) {
        return localStreamRef.current;
      }
    }

    // Try to acquire the new stream first before stopping/overwriting the working stream!
    try {
      const stream = await navigator.mediaDevices.getUserMedia(optimizedConstraints);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      localStreamRef.current = stream;
      return stream;
    } catch (e) {
      console.error("Media capture failed with full constraints, attempting fallback...", e);
      
      // Fallback Strategy: If requesting both failed, try to acquire them individually
      if (optimizedConstraints.audio && optimizedConstraints.video) {
        // Try audio-only first if audio is active
        try {
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: optimizedConstraints.audio });
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
          }
          localStreamRef.current = audioOnlyStream;
          triggerToast("Camera failed. Started Audio only.");
          setIsVideoOn(false);
          return audioOnlyStream;
        } catch (audioErr) {
          console.error("Audio fallback failed too", audioErr);
        }

        // Try video-only next if audio-only failed
        try {
          const videoOnlyStream = await navigator.mediaDevices.getUserMedia({ video: optimizedConstraints.video });
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
          }
          localStreamRef.current = videoOnlyStream;
          triggerToast("Microphone failed. Started Camera only.");
          setIsMicOn(false);
          return videoOnlyStream;
        } catch (videoErr) {
          console.error("Video fallback failed too", videoErr);
        }
      }

      // If simple/single constraint failed, or fallbacks failed, notify specific permission issue
      if (constraints.video) {
        triggerToast("Camera access failed! Please check device/permissions.");
        setIsVideoOn(false);
      } else {
        triggerToast("Microphone access failed! Please check device/permissions.");
        setIsMicOn(false);
      }
      return null;
    }
  };

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    // Clear both local video previews
    if (localVideoGridRef.current) {
      localVideoGridRef.current.srcObject = null;
    }
    if (localVideoStripRef.current) {
      localVideoStripRef.current.srcObject = null;
    }
  };

  // â”€â”€â”€ Audio Level Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getAudioContext = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const createAnalyserForStream = (stream) => {
    const ctx = getAudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    analyser.__source = source; // kept so the graph can be disconnected when the stream changes
    return analyser;
  };

  const disconnectAnalyser = (analyser) => {
    if (!analyser) return;
    try { analyser.__source?.disconnect(); } catch (_) {}
    try { analyser.disconnect(); } catch (_) {}
  };

  const disconnectLocalAnalyser = () => {
    disconnectAnalyser(localAnalyserRef.current);
    localAnalyserRef.current = null;
    localAnalyserStreamRef.current = null;
  };

  // Point the local mic meter at `stream` (getLocalStream may have swapped in a brand
  // new MediaStream, e.g. when the camera is turned on, which stops the old tracks).
  const ensureLocalAnalyser = (stream) => {
    if (!stream || stream.getAudioTracks().length === 0) {
      disconnectLocalAnalyser();
      return;
    }
    if (localAnalyserRef.current && localAnalyserStreamRef.current === stream) return;
    disconnectLocalAnalyser();
    try {
      localAnalyserRef.current = createAnalyserForStream(stream);
      localAnalyserStreamRef.current = stream;
    } catch (_) {}
  };

  const removeRemoteAnalyser = (peerId) => {
    if (remoteAnalysersRef.current[peerId]) {
      disconnectAnalyser(remoteAnalysersRef.current[peerId]);
      delete remoteAnalysersRef.current[peerId];
    }
  };

  const getRMS = (analyser) => {
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  };

  const startLevelLoop = () => {
    if (levelRafRef.current) return; // already running
    const SPEAKING_THRESHOLD = 0.015;
    // Reading audio data every frame is cheap, but each setMicLevel/setSpeakingPeers call
    // re-renders this whole component - at 60fps that's enough forced re-renders to make the
    // local <video> tile's ref callback keep re-firing and glitch. 10 updates/sec is still a
    // smooth-looking level meter, so throttle the STATE UPDATES, not the read loop itself.
    let lastUpdate = 0;
    const UPDATE_INTERVAL_MS = 100;
    let prevSpeaking = new Set();
    const tick = (now) => {
      if (now - lastUpdate >= UPDATE_INTERVAL_MS) {
        lastUpdate = now;
        // Local mic level
        if (localAnalyserRef.current) {
          const rms = getRMS(localAnalyserRef.current);
          setMicLevel(Math.min(100, Math.round(rms * 600)));
        }
        // Remote peer speaking detection
        const talking = new Set();
        Object.entries(remoteAnalysersRef.current).forEach(([pid, analyser]) => {
          if (getRMS(analyser) > SPEAKING_THRESHOLD) talking.add(pid);
        });
        const changed = talking.size !== prevSpeaking.size || [...talking].some(id => !prevSpeaking.has(id));
        if (changed) {
          setSpeakingPeers(talking);
          prevSpeaking = talking;
        }
      }
      levelRafRef.current = requestAnimationFrame(tick);
    };
    levelRafRef.current = requestAnimationFrame(tick);
  };

  const stopLevelLoop = () => {
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    setMicLevel(0);
    setSpeakingPeers(new Set());
  };

  const attachRemoteAnalyser = (peerId, stream) => {
    if (remoteAnalysersRef.current[peerId]) return;
    try {
      remoteAnalysersRef.current[peerId] = createAnalyserForStream(stream);
      startLevelLoop();
    } catch (_) {}
  };


  const broadcastReconnect = () => {
    if (!channelRef.current) return;
    sendOn('main', 'peer-reconnect', { senderUserId: localUserId.current });
  };

  // Tear down and re-offer every peer connection so peers pick up our current set of
  // tracks (e.g. video removed while the mic stays on) - they drop our old streams on
  // the peer-reconnect notice.
  const renegotiateAllPeers = () => {
    if (!isCollaborating) return;
    closeAllPeerConnections();
    broadcastReconnect();
    Object.keys(participantsRef.current).forEach(peerId => {
      if (peerId === localUserId.current) return;
      createPeerConnection(peerId, localUserId.current > peerId);
    });
  };

  const syncMediaPeers = async (presenceMap) => {
    // 1. Clean up old connections for peers who are no longer in presence
    Object.keys(peerConnectionsRef.current).forEach(peerId => {
      if (!presenceMap[peerId]) {
        try {
          peerConnectionsRef.current[peerId].close();
        } catch (_) {}
        delete peerConnectionsRef.current[peerId];
        delete iceCandidateQueuesRef.current[peerId];
        delete remoteVideoRefs.current[peerId];
        removeRemoteAnalyser(peerId);
        const audioEl = document.getElementById('peer-audio-' + peerId);
        if (audioEl) audioEl.remove();
        setRemoteVideoStreams(prev => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }
    });

    // Try to acquire local stream if either mic or camera is active
    if (isMicOn || isVideoOn) {
      const constraints = {
        audio: isMicOn,
        video: isVideoOn ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } } : false
      };
      const stream = await getLocalStream(constraints);
      if (stream && isMicOn) ensureLocalAnalyser(stream);
    }

    // Always establish peer connection with all participants, even if we are not sending media,
    // so we can receive their media tracks.
    Object.keys(presenceMap).forEach(peerId => {
      if (peerId === localUserId.current) return;
      const isInitiator = localUserId.current > peerId;
      createPeerConnection(peerId, isInitiator);
    });
  };

  const syncVoicePeers = syncMediaPeers;

  const createPeerConnection = async (peerId, isInitiator) => {
    if (peerConnectionsRef.current[peerId]) return;

    const pcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(pcConfig);
    peerConnectionsRef.current[peerId] = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc-ice',
          payload: { candidate: e.candidate, targetUserId: peerId, senderUserId: localUserId.current }
        });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;

      const hasVideo = stream.getVideoTracks().length > 0;
      const hasAudio = stream.getAudioTracks().length > 0;

      // Ignore late events from a connection that has since been replaced
      if (peerConnectionsRef.current[peerId] !== pc) return;

      if (hasVideo) {
        setRemoteVideoStreams(prev => ({ ...prev, [peerId]: stream }));
        setShowVideoGrid(true);
      } else {
        // Audio-only stream from this peer: drop any stale (frozen) video tile.
        setRemoteVideoStreams(prev => {
          if (!(peerId in prev)) return prev;
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }
      stream.onremovetrack = () => {
        if (stream.getVideoTracks().length === 0) {
          setRemoteVideoStreams(prev => {
            if (prev[peerId] !== stream) return prev;
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        }
      };

      if (hasAudio) {
        let audio = document.getElementById('peer-audio-' + peerId);
        if (!audio) {
          audio = document.createElement('audio');
          audio.id = 'peer-audio-' + peerId;
          audio.autoplay = true;
          audio.style.display = 'none';
          document.body.appendChild(audio);
        }
        if (audio.srcObject !== stream) {
          audio.srcObject = stream;
        }
        audio.play().catch(err => {
          console.warn("Autoplay blocked or audio play failed; user interaction may be required:", err);
        });
        attachRemoteAnalyser(peerId, stream);
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'webrtc-offer',
            payload: { offer, targetUserId: peerId, senderUserId: localUserId.current }
          });
        }
      } catch (e) {
        console.error("Error creating WebRTC P2P offer", e);
      }
    }
  };

  const processQueuedIceCandidates = async (senderUserId) => {
    const pc = peerConnectionsRef.current[senderUserId];
    const queue = iceCandidateQueuesRef.current[senderUserId];
    if (pc && queue) {
      while (queue.length > 0) {
        const candidate = queue.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("Error setting queued ICE candidate", e);
        }
      }
    }
  };

  const handleWebRTCOffer = async (offer, senderUserId) => {
    if (!peerConnectionsRef.current[senderUserId]) {
      await createPeerConnection(senderUserId, false);
    }
    const pc = peerConnectionsRef.current[senderUserId];
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await processQueuedIceCandidates(senderUserId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc-answer',
          payload: { answer, targetUserId: senderUserId, senderUserId: localUserId.current }
        });
      }
    } catch (e) {
      console.error("Error setting WebRTC P2P offer description", e);
    }
  };

  const handleWebRTCAnswer = async (answer, senderUserId) => {
    const pc = peerConnectionsRef.current[senderUserId];
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await processQueuedIceCandidates(senderUserId);
      } catch (e) {
        console.error("Error setting WebRTC remote answer", e);
      }
    }
  };

  const handleWebRTCIce = async (candidate, senderUserId) => {
    const pc = peerConnectionsRef.current[senderUserId];
    if (!pc) return;

    if (!pc.remoteDescription) {
      if (!iceCandidateQueuesRef.current[senderUserId]) {
        iceCandidateQueuesRef.current[senderUserId] = [];
      }
      iceCandidateQueuesRef.current[senderUserId].push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error("Error setting ICE candidate description", e);
    }
  };

  const closeAllPeerConnections = () => {
    Object.keys(peerConnectionsRef.current).forEach(peerId => {
      try {
        peerConnectionsRef.current[peerId].close();
      } catch (_) {}
      const audioEl = document.getElementById('peer-audio-' + peerId);
      if (audioEl) audioEl.remove();
    });
    peerConnectionsRef.current = {};
    Object.values(remoteAnalysersRef.current).forEach(disconnectAnalyser);
    remoteAnalysersRef.current = {};
    iceCandidateQueuesRef.current = {};
    setRemoteVideoStreams({});
  };

  const toggleMicrophone = async () => {
    const nextState = !isMicOn;
    setIsMicOn(nextState);

    if (nextState) {
      const constraints = {
        audio: true,
        video: isVideoOn ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } } : false
      };
      const stream = await getLocalStream(constraints);
      if (stream) {
        stream.getAudioTracks().forEach(t => { t.enabled = true; });
        ensureLocalAnalyser(stream);
        startLevelLoop();
        if (isCollaborating) {
          renegotiateAllPeers();
          updatePresenceState({ isMicOn: true });
        }
      }
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
      }
      disconnectLocalAnalyser();
      if (!isVideoOn) {
        stopLocalStream();
        closeAllPeerConnections();
        broadcastReconnect();
      }
      stopLevelLoop();
      updatePresenceState({ isMicOn: false });
    }
  };

  const toggleCamera = async () => {
    const nextState = !isVideoOn;
    setIsVideoOn(nextState);
    setShowVideoGrid(nextState || Object.keys(remoteVideoStreams).length > 0);

    if (nextState) {
      const constraints = {
        audio: isMicOn,
        video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } }
      };
      const stream = await getLocalStream(constraints);
      if (stream) {
        // getLocalStream may have replaced the stream (stopping the old mic track), so the
        // level meter has to follow it or it keeps reading a dead track.
        if (isMicOn) ensureLocalAnalyser(stream);
        renegotiateAllPeers();
        updatePresenceState({ isVideoOn: true });
        triggerToast('Camera ON — peers can now see you.');
      }
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(t => { t.stop(); });
        localStreamRef.current.getVideoTracks().forEach(t => localStreamRef.current.removeTrack(t));
      }
      if (!isMicOn) {
        stopLocalStream();
        closeAllPeerConnections();
        broadcastReconnect();
      } else {
        // Mic stays on: renegotiate without the video track so peers drop our frozen tile.
        renegotiateAllPeers();
      }
      updatePresenceState({ isVideoOn: false });
      triggerToast('Camera OFF.');
    }
  };

  const copyShareLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      triggerToast("Room share link copied to clipboard!");
    });
  };

  // Adjust canvas bounds on window resize (guarded to prevent backing store clears during drawing)
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      const newWidth = canvas.parentElement.clientWidth;
      const newHeight = canvas.parentElement.clientHeight;
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        drawCanvas();
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial setup

    return () => window.removeEventListener('resize', handleResize);
  }, [elements, zoom, pan, currentStroke, currentShape, selectedElement, theme, gridType]);

  // Redraw Canvas whenever relevant elements update
  useEffect(() => {
    drawCanvas();
  }, [elements, zoom, pan, currentStroke, currentShape, selectedElement, theme, gridType]);

  // Helper to convert screen mouse/touch pointer position to world canvas coordinates
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    return {
      screenX,
      screenY,
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom
    };
  };

  // Helper to determine canvas cursor styling dynamically
  const getCanvasCursor = () => {
    // If participant is locked out, show not-allowed cursor
    if (isCollaborating && !isHost && !hasDrawAccess) return 'not-allowed';
    if (isPanning) return 'grabbing';
    if (activeTool === 'select') {
      if (hoveredResizeHandle) return 'se-resize';
      if (hoveredElement) return 'move';
      return 'default';
    }
    if (activeTool === 'eraser') return 'cell';
    if (activeTool === 'text') return 'text';
    if (activeTool === 'laser') return 'none';
    return 'crosshair';
  };

  // Laser Pointer fading animation loop (runs in requestAnimationFrame for high performance)
  const updateLaser = () => {
    const now = Date.now();
    // Keeps laser points for 1.2s before fading completely
    laserPointsRef.current = laserPointsRef.current.filter(p => now - p.time < 1200);

    drawCanvas();

    if (laserPointsRef.current.length > 0) {
      laserAnimationRef.current = requestAnimationFrame(updateLaser);
    } else {
      laserAnimationRef.current = null;
    }
  };

  // Check if pointer is near/within an element (Hit Testing)
  const getElementAtPosition = (x, y) => {
    // Search elements in reverse order (top to bottom visual layers)
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (!el || typeof el !== 'object') continue;
      // Locked elements (imported PDF page backgrounds) can't be picked, moved or erased.
      if (el.locked) continue;
      if (el.type === 'image') {
        if (![el.x, el.y, el.width, el.height].every(isFiniteNum)) continue;
        const padding = 10;
        if (x >= el.x - padding && x <= el.x + el.width + padding &&
            y >= el.y - padding && y <= el.y + el.height + padding) {
          // Check if user clicked the resize handle (bottom right corner, 15px box)
          const handleSize = 15;
          const isNearResize = (x >= el.x + el.width - handleSize && x <= el.x + el.width + handleSize &&
                                y >= el.y + el.height - handleSize && y <= el.y + el.height + handleSize);
          return { element: el, type: isNearResize ? 'resize' : 'drag' };
        }
      } else if (el.type === 'text') {
        if (!isFiniteNum(el.x) || !isFiniteNum(el.y)) continue;
        const padding = 10;
        // Text hit boundary calculation is an estimation based on font size and text length.
        // Text is drawn with textBaseline 'top', so it occupies y .. y + fontSize.
        const estWidth = estTextWidth(el);
        const estHeight = estTextHeight(el);
        if (x >= el.x - padding && x <= el.x + estWidth + padding &&
            y >= el.y - padding && y <= el.y + estHeight + padding) {
          const handleSize = 15;
          const isNearResize = (x >= el.x + estWidth - handleSize && x <= el.x + estWidth + handleSize &&
                                y >= el.y + estHeight - handleSize && y <= el.y + estHeight + handleSize);
          return { element: el, type: isNearResize ? 'resize' : 'drag' };
        }
      } else if (el.type === 'shape') {
        if (![el.x1, el.y1, el.x2, el.y2].every(isFiniteNum)) continue;
        if (el.shapeType === 'rectangle') {
          const minX = Math.min(el.x1, el.x2);
          const maxX = Math.max(el.x1, el.x2);
          const minY = Math.min(el.y1, el.y2);
          const maxY = Math.max(el.y1, el.y2);
          
          // If filled shape, hit testing is easy
          if (el.fill && el.fill !== 'none') {
            if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
              return { element: el, type: 'drag' };
            }
          } else {
            // Outline hit test
            const borderDistance = 8;
            const onTop = Math.abs(y - minY) < borderDistance && x >= minX && x <= maxX;
            const onBottom = Math.abs(y - maxY) < borderDistance && x >= minX && x <= maxX;
            const onLeft = Math.abs(x - minX) < borderDistance && y >= minY && y <= maxY;
            const onRight = Math.abs(x - maxX) < borderDistance && y >= minY && y <= maxY;
            if (onTop || onBottom || onLeft || onRight) {
              return { element: el, type: 'drag' };
            }
          }
        } else if (el.shapeType === 'circle') {
          const cx = el.x1;
          const cy = el.y1;
          const r = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
          const dist = Math.hypot(x - cx, y - cy);
          
          if (el.fill && el.fill !== 'none') {
            if (dist <= r) return { element: el, type: 'drag' };
          } else {
            if (Math.abs(dist - r) < 8) return { element: el, type: 'drag' };
          }
        } else if (el.shapeType === 'line' || el.shapeType === 'arrow') {
          // Distance from point to line segment
          const A = x - el.x1;
          const B = y - el.y1;
          const C = el.x2 - el.x1;
          const D = el.y2 - el.y1;

          const dot = A * C + B * D;
          const lenSq = C * C + D * D;
          let param = -1;
          if (lenSq !== 0) param = dot / lenSq;

          let xx, yy;
          if (param < 0) {
            xx = el.x1;
            yy = el.y1;
          } else if (param > 1) {
            xx = el.x2;
            yy = el.y2;
          } else {
            xx = el.x1 + param * C;
            yy = el.y1 + param * D;
          }

          const dist = Math.hypot(x - xx, y - yy);
          if (dist < 8) return { element: el, type: 'drag' };
        }
      } else if (el.type === 'stroke') {
        // Proximity hit test for freehand strokes
        if (!Array.isArray(el.points)) continue;
        const threshold = (isFiniteNum(el.width) ? el.width : 4) / 2 + 10;
        const isNear = el.points.some(p => p && Math.hypot(p.x - x, p.y - y) < threshold);
        if (isNear) {
          return { element: el, type: 'drag' };
        }
      }
    }
    return null;
  };

  // Smart smoothing point low-pass filter
  const getSmoothedPoint = (currentRaw, points) => {
    if (!points || points.length === 0) return currentRaw;
    const last = points[points.length - 1];
    
    // Low-pass filter coefficient (smoothing factor): 0.4 makes the pen smooth out jitter
    const k = 0.45; 
    return {
      x: last.x + (currentRaw.x - last.x) * k,
      y: last.y + (currentRaw.y - last.y) * k,
      pressure: currentRaw.pressure
    };
  };

  // Push new state to undo history
  const pushToHistory = (newElements) => {
    setUndoStack(prev => [...prev, elements]);
    setElements(newElements);
    setRedoStack([]); // Clear redo stack on new action
    
    // Update slide page elements
    updateCurrentPageElements(newElements);
  };

  // Undo operation
  const handleUndo = () => {
    // Locked guests can't undo: their stack is full of remote strokes, so Ctrl+Z
    // would revert the tutor's work for everyone.
    if (isCollaborating && !isHost && !hasDrawAccess) return;
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));
    setRedoStack([elements, ...redoStack]);
    setElements(prev);
    setSelectedElement(null);

    // Sync slide and broadcast update
    updateCurrentPageElements(prev);
    broadcastElementsUpdate(prev);
  };

  // Redo operation
  const handleRedo = () => {
    if (isCollaborating && !isHost && !hasDrawAccess) return;
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setRedoStack(redoStack.slice(1));
    setUndoStack([...undoStack, elements]);
    setElements(next);

    // Sync slide and broadcast update
    updateCurrentPageElements(next);
    broadcastElementsUpdate(next);
  };

  // Slide / Page Management
  const handleAddPage = () => {
    // 1. Save current page state first
    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = {
      ...updatedPages[currentPageIndex],
      elements,
      undoStack,
      redoStack
    };

    // 2. Append new blank page
    const newPageId = `page-${Date.now()}`;
    const newPage = { id: newPageId, elements: [], undoStack: [], redoStack: [] };
    const nextPages = [...updatedPages, newPage];
    setPages(nextPages);

    // 3. Move to new page
    const nextIndex = updatedPages.length;
    setCurrentPageIndex(nextIndex);
    setElements([]);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedElement(null);

    // 4. Broadcast the new pages layout and active page index
    broadcastPageChange(nextPages, nextIndex);
  };

  const navigatePages = (targetIndex) => {
    if (targetIndex < 0 || targetIndex >= pages.length) return;
    
    // Save current page state
    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = {
      ...updatedPages[currentPageIndex],
      elements,
      undoStack,
      redoStack
    };
    setPages(updatedPages);

    // Load target page state
    const targetPage = updatedPages[targetIndex];
    setCurrentPageIndex(targetIndex);
    setElements(targetPage.elements || []);
    setUndoStack(targetPage.undoStack || []);
    setRedoStack(targetPage.redoStack || []);
    setSelectedElement(null);

    // Broadcast page-change and pages layout if host
    broadcastPageChange(updatedPages, targetIndex);
  };

  const handlePrevPage = () => {
    if (currentPageIndex === 0) return;
    navigatePages(currentPageIndex - 1);
  };

  const handleNextPage = () => {
    if (currentPageIndex === pages.length - 1) {
      handleAddPage();
    } else {
      navigatePages(currentPageIndex + 1);
    }
  };

  const handleDeletePage = () => {
    if (pages.length <= 1) return; // Cannot delete last remaining page
    
    const updatedPages = pages.filter((_, idx) => idx !== currentPageIndex);
    setPages(updatedPages);

    // Navigate to previous page or index 0
    const newIdx = Math.max(0, currentPageIndex - 1);
    setCurrentPageIndex(newIdx);
    
    const targetPage = updatedPages[newIdx];
    setElements(targetPage.elements || []);
    setUndoStack(targetPage.undoStack || []);
    setRedoStack(targetPage.redoStack || []);
    setSelectedElement(null);

    // Broadcast deletion and new pages layout to peers
    broadcastPageChange(updatedPages, newIdx);
  };

  // Pointer Down event handler
  const handlePointerDown = (e) => {
    if (editingText) {
      finishTextInput();
      return;
    }

    setPointerType(e.pointerType);
    setPointerPressure(e.pressure || 0.5);

    // If middle click or space key drag is active, trigger panning
    if (e.button === 1 || isPanning) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // Collaboration draw access lock
    if (isCollaborating && !hasDrawAccess) {
      triggerToast("Drawing locked! Ask the tutor (host) to grant you drawing access.");
      return;
    }

    const { x, y, screenX, screenY } = getCanvasCoords(e);

    // ERASER: Stroke / element eraser checks intersection and deletes (restricted to strokes and text)
    if (activeTool === 'eraser') {
      dragOriginalElementsRef.current = elements;
      const hit = getElementAtPosition(x, y);
      if (hit && (hit.element.type === 'stroke' || hit.element.type === 'text')) {
        const remaining = elements.filter(el => el.id !== hit.element.id);
        setElements(remaining);
      }
      setIsDrawing(true);
      return;
    }

    // SELECT: Moving or Resizing elements
    if (activeTool === 'select') {
      const hit = getElementAtPosition(x, y);
      if (hit) {
        dragOriginalElementsRef.current = elements;
        setSelectedElement(hit.element);
        setDragStart({ x: x, y: y });
        if (hit.type === 'resize') {
          setResizeMode('se');
        } else {
          setResizeMode(null);
        }
        setIsDrawing(true);
      } else {
        setSelectedElement(null);
      }
      return;
    }

    // TEXT: Add new text element
    if (activeTool === 'text') {
      // Find if clicked existing text to edit it
      const hit = getElementAtPosition(x, y);
      if (hit && hit.element.type === 'text') {
        beginEditExistingText(hit.element);
      } else {
        setEditingText({
          id: Date.now().toString(),
          token: Math.random().toString(36).slice(2),
          isExisting: false,
          x,
          y,
          screenX,
          screenY,
          value: ''
        });
      }
      return;
    }

    // PEN: Start handwriting drawing
    if (activeTool === 'pen') {
      setIsDrawing(true);
      const firstPoint = { x, y, pressure: e.pressure || 0.5 };
      const newStroke = {
        id: Date.now().toString(),
        type: 'stroke',
        points: [firstPoint],
        color: activeColor,
        width: strokeWidth
      };
      currentStrokeRef.current = newStroke;
      pointsSentCountRef.current = 1;
      setCurrentStroke(newStroke);
      return;
    }

    // HIGHLIGHTER: Start semi-transparent highlight stroke
    if (activeTool === 'highlighter') {
      setIsDrawing(true);
      const firstPoint = { x, y, pressure: e.pressure || 0.5 };
      const newStroke = {
        id: Date.now().toString(),
        type: 'stroke',
        points: [firstPoint],
        color: activeColor,
        width: strokeWidth * 2.5, // Highlighter is thicker
        isHighlighter: true
      };
      currentStrokeRef.current = newStroke;
      pointsSentCountRef.current = 1;
      setCurrentStroke(newStroke);
      return;
    }

    // LASER POINTER: Add a temporary point, trigger animation loop
    if (activeTool === 'laser') {
      setIsDrawing(true);
      laserPointsRef.current = [{ x, y, time: Date.now() }];
      laserPointerPos.current = { x, y, over: true };
      if (!laserAnimationRef.current) {
        laserAnimationRef.current = requestAnimationFrame(updateLaser);
      }
      return;
    }

    // SHAPES: Draw Line, Arrow, Rect, Circle (with Snap to Grid check)
    if (['line', 'arrow', 'rectangle', 'circle'].includes(activeTool)) {
      setIsDrawing(true);
      let shapeX = x;
      let shapeY = y;
      if (snapToGrid) {
        shapeX = Math.round(x / 24) * 24;
        shapeY = Math.round(y / 24) * 24;
      }
      setCurrentShape({
        id: Date.now().toString(),
        type: 'shape',
        shapeType: activeTool,
        x1: shapeX,
        y1: shapeY,
        x2: shapeX,
        y2: shapeY,
        color: activeColor,
        width: strokeWidth,
        fill: fillMode
      });
      return;
    }
  };

  // Pointer Move event handler
  const handlePointerMove = (e) => {
    setPointerPressure(e.pressure || 0);

    // Broadcast cursor position to peers
    broadcastCursor(e.clientX, e.clientY);

    const { x, y } = getCanvasCoords(e);

    // Canvas panning
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    // Update hover states when pointer is moving but NOT drawing
    if (!isDrawing) {
      // 1. SELECT tool hover tests
      if (activeTool === 'select') {
        const hit = getElementAtPosition(x, y);
        if (hit) {
          setHoveredElement(hit.element);
          setHoveredResizeHandle(hit.type === 'resize');
        } else {
          setHoveredElement(null);
          setHoveredResizeHandle(false);
        }
      }
      
      // 2. LASER pointer cursor tracking
      if (activeTool === 'laser') {
        laserPointerPos.current = { x, y, over: true };
        drawCanvas();
      } else {
        laserPointerPos.current.over = false;
      }
      return;
    }

    // ERASER: Wipe elements when moving eraser (restricted to strokes and text)
    if (activeTool === 'eraser') {
      const hit = getElementAtPosition(x, y);
      if (hit && (hit.element.type === 'stroke' || hit.element.type === 'text')) {
        const remaining = elements.filter(el => el.id !== hit.element.id);
        setElements(remaining);
      }
      return;
    }

    // SELECT: Move or resize the selected element
    if (activeTool === 'select' && selectedElement) {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      
      setElements(elements.map(el => {
        if (el.id === selectedElement.id) {
          if (resizeMode === 'se') {
            if (el.type === 'image') {
              return {
                ...el,
                width: Math.max(20, el.width + dx),
                height: Math.max(20, el.height + dy)
              };
            } else if (el.type === 'text') {
              // Font size adjustment for text elements based on dragging
              const newFontSize = Math.max(10, el.fontSize + dx * 0.4);
              return {
                ...el,
                fontSize: newFontSize
              };
            }
          } else {
            // Drag move
            if (el.type === 'shape') {
              return {
                ...el,
                x1: el.x1 + dx,
                y1: el.y1 + dy,
                x2: el.x2 + dx,
                y2: el.y2 + dy
              };
            } else if (el.type === 'stroke') {
              return {
                ...el,
                points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy, pressure: p.pressure }))
              };
            } else {
              return {
                ...el,
                x: el.x + dx,
                y: el.y + dy
              };
            }
          }
        }
        return el;
      }));

      // Update drag start position to cursor position for cumulative dragging
      setDragStart({ x, y });
      return;
    }

    // PEN / HIGHLIGHTER: Add points with jitter smoothing filter using currentStrokeRef to prevent stale state coordinate loss
    if (['pen', 'highlighter'].includes(activeTool) && currentStrokeRef.current) {
      const rawPoint = { x, y, pressure: e.pressure || 0.5 };
      const smoothed = getSmoothedPoint(rawPoint, currentStrokeRef.current.points);
      
      const nextPoints = [...currentStrokeRef.current.points, smoothed];
      currentStrokeRef.current.points = nextPoints;

      // Update state to trigger local redraw
      setCurrentStroke({ ...currentStrokeRef.current });
      
      // Slice and broadcast only newly added points since last broadcast to prevent WebSocket congestion
      const unsentPoints = nextPoints.slice(pointsSentCountRef.current);
      if (unsentPoints.length > 0) {
        const sent = broadcastDrawingStroke(unsentPoints, currentStrokeRef.current.color, currentStrokeRef.current.width, currentStrokeRef.current.isHighlighter);
        if (sent) {
          pointsSentCountRef.current = nextPoints.length;
        }
      }
      return;
    }

    // LASER POINTER: Add fading points on drag
    if (activeTool === 'laser') {
      laserPointsRef.current.push({ x, y, time: Date.now() });
      laserPointerPos.current = { x, y, over: true };
      if (!laserAnimationRef.current) {
        laserAnimationRef.current = requestAnimationFrame(updateLaser);
      }
      return;
    }

    // SHAPES: Update boundary coordinate (with Snap to Grid check)
    if (currentShape) {
      let shapeX = x;
      let shapeY = y;
      if (snapToGrid) {
        shapeX = Math.round(shapeX / 24) * 24;
        shapeY = Math.round(shapeY / 24) * 24;
      }
      setCurrentShape(prev => ({
        ...prev,
        x2: shapeX,
        y2: shapeY
      }));
      return;
    }
  };

  // Pointer Up event handler
  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    setIsDrawing(false);

    if (activeTool === 'eraser' && isDrawing) {
      // Use the snapshot captured at gesture start, not the current `elements` closure —
      // by pointer-up, `elements` already reflects every deletion made during the drag,
      // so the true "before" state has to come from the ref, not this render's state.
      const before = dragOriginalElementsRef.current !== null ? dragOriginalElementsRef.current : elements;
      setUndoStack(prev => [...prev, before]);
      setRedoStack([]);
      dragOriginalElementsRef.current = null;
      // Broadcast elements state after eraser wipe
      broadcastElementsUpdate(elements);
      return;
    }

    if (activeTool === 'select' && selectedElement) {
      // Same as above: `elements` already reflects the final dragged/resized position by
      // the time we get here, so history has to be seeded from the pre-drag snapshot.
      const before = dragOriginalElementsRef.current !== null ? dragOriginalElementsRef.current : elements;
      setUndoStack(prev => [...prev, before]);
      setRedoStack([]);
      dragOriginalElementsRef.current = null;
      // Broadcast updated layout
      broadcastElementsUpdate(elements);
      return;
    }

    if (['pen', 'highlighter'].includes(activeTool) && currentStrokeRef.current) {
      const finalStroke = currentStrokeRef.current;
      // Only keep if the stroke actually contains points
      if (finalStroke.points.length > 0) {
        pushToHistory([...elements, finalStroke]);
        // Broadcast finished drawing stroke
        broadcastDrawingEnd(finalStroke);
      }
      currentStrokeRef.current = null;
      setCurrentStroke(null);
      return;
    }

    if (currentShape) {
      pushToHistory([...elements, currentShape]);
      // Broadcast finished shape
      broadcastDrawingEnd(currentShape);
      setCurrentShape(null);
      return;
    }
  };

  // Double click handler (can edit text easily or add text anywhere)
  const handleDoubleClick = (e) => {
    if (isCollaborating && !hasDrawAccess) {
      triggerToast("Drawing locked! Ask the tutor (host) to grant you drawing access.");
      return;
    }

    const { x, y, screenX, screenY } = getCanvasCoords(e);
    const hit = getElementAtPosition(x, y);
    
    if (hit && hit.element.type === 'text') {
      beginEditExistingText(hit.element);
    } else if (activeTool === 'select' || activeTool === 'text') {
      // Create new text block on empty canvas double click
      setEditingText({
        id: Date.now().toString(),
        token: Math.random().toString(36).slice(2),
        isExisting: false,
        x,
        y,
        screenX,
        screenY,
        value: ''
      });
    }
  };

  // Edit an existing text element in place. It stays in `elements` (so history,
  // page sync and peers are untouched while typing) and is only hidden from the
  // canvas underneath the textarea; finishTextInput then replaces or deletes it.
  const beginEditExistingText = (textEl) => {
    editingHiddenIdRef.current = textEl.id;
    setEditingText({
      id: textEl.id,
      token: Math.random().toString(36).slice(2),
      isExisting: true,
      x: textEl.x,
      y: textEl.y,
      // Place the editor over the text itself, in its own size and colour
      screenX: textEl.x * zoom + pan.x,
      screenY: textEl.y * zoom + pan.y,
      fontSize: estTextHeight(textEl),
      color: textEl.color,
      value: textEl.text
    });
    drawCanvas();
  };

  // Confirm and finish typing overlay text
  const finishTextInput = () => {
    const et = editingText;
    if (!et) return;
    // pointer-down and the textarea's blur can both fire for one commit
    if (textCommitTokenRef.current === et.token) return;
    textCommitTokenRef.current = et.token;
    editingHiddenIdRef.current = null;

    const trimmedVal = et.value.trim();
    const existingIdx = et.isExisting ? elements.findIndex(el => el.id === et.id) : -1;

    if (existingIdx !== -1) {
      const original = elements[existingIdx];
      if (trimmedVal === '') {
        // Cleared: delete it for everyone (undo restores the original)
        const remaining = elements.filter(el => el.id !== et.id);
        pushToHistory(remaining);
        broadcastElementsUpdate(remaining);
      } else if (trimmedVal !== original.text) {
        // Changed: replace in place; peers upsert by id instead of appending a duplicate
        const updated = { ...original, text: trimmedVal };
        pushToHistory(elements.map(el => (el.id === et.id ? updated : el)));
        broadcastDrawingEnd(updated);
      } else {
        drawCanvas();
      }
    } else if (trimmedVal !== '') {
      const newTextElement = {
        id: et.id,
        type: 'text',
        x: et.x,
        y: et.y,
        text: trimmedVal,
        fontSize: et.isExisting && isFiniteNum(et.fontSize) ? et.fontSize : fontSize,
        color: et.isExisting && et.color ? et.color : activeColor
      };
      pushToHistory([...elements, newTextElement]);
      // Broadcast new text element
      broadcastDrawingEnd(newTextElement);
    } else {
      // Re-render elements
      drawCanvas();
    }

    setEditingText(null);
  };

  // Keyboard shortcut handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore shortcut keys if user is currently typing text
      if (editingText) return;
      // ...or typing in any form field (hex colour box, name modal, chat), where
      // Backspace / Ctrl+Z must edit the field, not the board.
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeTool === 'select' && selectedElement && !(isCollaborating && !isHost && !hasDrawAccess)) {
          const remaining = elements.filter(el => el.id !== selectedElement.id);
          pushToHistory(remaining);
          setSelectedElement(null);
          // Broadcast deletion layout update
          broadcastElementsUpdate(remaining);
        }
      } else if (e.key === ' ') {
        // Spacebar activates panning mode
        setIsPanning(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === ' ') {
        setIsPanning(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [elements, selectedElement, activeTool, undoStack, redoStack, editingText, isHost, hasDrawAccess, isCollaborating]);

  // Handle uploading locally stored image files
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loadImageFile(file);
  };

  // While collaborating, images are downscaled and uploaded to Storage so only a short URL
  // is broadcast (a raw photo as a data: URL is far past Realtime's payload limit). If the
  // upload isn't possible (anonymous guest, storage error) the compressed data URL is used
  // and the transport chunks it.
  const prepareSharedImageSrc = async (dataUrl, preferPng) => {
    if (!isCollaborating) return dataUrl;
    const compressed = await compressImageDataUrl(dataUrl, preferPng);
    try {
      const blob = await (await fetch(compressed)).blob();
      const url = await uploadWhiteboardImage(blob, roomId, preferPng ? 'png' : 'jpg');
      if (url) return url;
    } catch (_) {}
    return compressed;
  };

  const loadImageFile = (file) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      const img = new Image();
      img.onload = async () => {
        const preferPng = file.type === 'image/png' || file.type === 'image/gif';
        const src = await prepareSharedImageSrc(dataUrl, preferPng);
        if (!mountedRef.current) return;

        // Place in the center of current viewport
        const canvas = canvasRef.current;
        if (!canvas) return;
        const viewportCenterX = (-pan.x + canvas.width / 2) / zoom;
        const viewportCenterY = (-pan.y + canvas.height / 2) / zoom;

        // Scale default size to look good
        const maxW = 350;
        const ratio = img.width / img.height;
        const w = Math.min(maxW, img.width);
        const h = w / ratio;

        // Cache image object locally (keyed by whatever src we ended up using)
        imageCache.current[src] = img;

        const imgElement = {
          id: Date.now().toString(),
          type: 'image',
          src,
          x: viewportCenterX - w / 2,
          y: viewportCenterY - h / 2,
          width: w,
          height: h
        };
        pushToHistory([...elementsRef.current, imgElement]);
        setActiveTool('select');
        setSelectedElement(imgElement);
        // Previously images were never sent to peers at all; share them like any other element.
        broadcastDrawingEnd(imgElement);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // PDF / Presentation Upload Handler
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      triggerToast('Please upload a valid PDF file.');
      return;
    }

    // Reset the input so the same file can be re-selected if needed
    if (pdfInputRef.current) pdfInputRef.current.value = '';

    if (!window.pdfjsLib) {
      triggerToast('PDF engine is still loading. Please try again in a moment.');
      return;
    }

    setIsProcessingPdf(true);
    setPdfProgress({ current: 0, total: 0 });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdfDoc.numPages;

      setPdfProgress({ current: 0, total: totalPages });
      triggerToast(`Importing ${totalPages} page PDF. Please wait...`);

      const newSlidePages = [];

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        setPdfProgress({ current: pageNum, total: totalPages });

        const page = await pdfDoc.getPage(pageNum);

        // Render at a scale that fills a ~1200px wide canvas for good quality
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1200 / unscaledViewport.width, 900 / unscaledViewport.height);
        const viewport = page.getViewport({ scale });

        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = Math.round(viewport.width);
        offscreenCanvas.height = Math.round(viewport.height);
        const ctx = offscreenCanvas.getContext('2d');

        // Fill with white background before rendering
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

        await page.render({
          canvasContext: ctx,
          viewport
        }).promise;

        const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.85);

        // Upload the page render to Storage so only its URL is broadcast (one rendered
        // page is ~100-300KB, past Realtime's payload limit). Falls back to the inline
        // data URL (mock mode / upload failure); the transport then chunks it.
        let src = dataUrl;
        if (isCollaborating) {
          const blob = await new Promise(resolve => offscreenCanvas.toBlob(resolve, 'image/jpeg', 0.85));
          const uploadedUrl = await uploadWhiteboardImage(blob, roomId, 'jpg');
          if (uploadedUrl) src = uploadedUrl;
        }

        // Pre-cache the rendered image
        const imgObj = new Image();
        imgObj.onload = () => drawCanvas();
        imgObj.src = dataUrl;
        imageCache.current[src] = imgObj;

        // Position slide image at center of canvas coordinate space
        const slideImageElement = {
          id: `pdf-slide-${Date.now()}-${pageNum}`,
          type: 'image',
          src,
          x: 0,
          y: 0,
          width: offscreenCanvas.width,
          height: offscreenCanvas.height,
          locked: true // Prevent accidental moving of the slide background
        };

        newSlidePages.push({
          id: `pdf-page-${Date.now()}-${pageNum}`,
          elements: [slideImageElement],
          undoStack: [],
          redoStack: []
        });
      }

      // Replace all existing pages with the newly imported PDF slides
      setPages(newSlidePages);
      setCurrentPageIndex(0);
      setElements(newSlidePages[0].elements);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedElement(null);

      // Broadcast the newly imported PDF deck to all participants (only the page being
      // shown is sent; each later page travels with its own page-change)
      broadcastPageChange(newSlidePages, 0);

      triggerToast(`âœ… PDF imported successfully! ${totalPages} slides loaded.`);
    } catch (err) {
      console.error('PDF import failed:', err);
      triggerToast('âŒ Failed to import PDF. Please try again.');
    } finally {
      setIsProcessingPdf(false);
      setPdfProgress({ current: 0, total: 0 });
    }
  };

  // Image Drag & Drop File Handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (isCollaborating && !isHost && !hasDrawAccess) {
      triggerToast("Drawing locked! Ask the tutor (host) to grant you drawing access.");
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        loadImageFile(file);
      }
    }
  };

  // Clear entire drawing canvas board
  const clearBoard = () => {
    pushToHistory([]);
    setSelectedElement(null);
    setShowClearModal(false);
    // Broadcast clear action
    broadcastElementsClear();
  };

  // Zoom shortcuts
  const handleZoom = (factor) => {
    setZoom(prev => {
      const target = factor === 'reset' ? 1 : Math.max(0.1, Math.min(8, prev + factor));
      // Zoom relative to center screen
      if (factor === 'reset') {
        setPan({ x: 0, y: 0 });
      }
      return target;
    });
  };

  // Draw arrow shape helper on canvas context
  const drawArrow = (ctx, x1, y1, x2, y2, strokeWidth) => {
    const headlen = 12 + strokeWidth * 1.5; // length of head in pixels
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // arrow head points
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  };

  // Mirror state variables in refs to prevent stale closure bugs in drawCanvas and async event callbacks
  const elementsRef = useRef(elements);
  elementsRef.current = elements;

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const panRef = useRef(pan);
  panRef.current = pan;

  const currentShapeRef = useRef(currentShape);
  currentShapeRef.current = currentShape;

  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  const selectedElementRef = useRef(selectedElement);
  selectedElementRef.current = selectedElement;

  const isPressureSensitiveRef = useRef(isPressureSensitive);
  isPressureSensitiveRef.current = isPressureSensitive;

  const isCollaboratingRef = useRef(isCollaborating);
  isCollaboratingRef.current = isCollaborating;

  // Canvas Vector Drawing Renderer
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas viewport
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    
    // Transform coordinates using viewport pan and zoom
    ctx.translate(panRef.current.x, panRef.current.y);
    ctx.scale(zoomRef.current, zoomRef.current);

    // Helper: Draw elements (strokes, shapes, text, images)
    // One bad element must never abort the whole frame: render each in isolation.
    const renderElement = (el) => {
      if (!el || typeof el !== 'object') return;
      if (el.id !== undefined && el.id === editingHiddenIdRef.current) return; // text under the editor
      ctx.save();
      try {
        renderElementUnsafe(el);
      } catch (_) {
        // skip malformed element
      } finally {
        ctx.restore();
      }
    };

    const renderElementUnsafe = (el) => {
      ctx.strokeStyle = el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.type === 'stroke') {
        const pts = el.points;
        if (!Array.isArray(pts) || pts.length < 2) return;
        
        if (el.isHighlighter) {
          // Render Highlighter stroke
          ctx.save();
          ctx.globalAlpha = 0.45;
          ctx.lineCap = 'square';
          ctx.lineJoin = 'miter';
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 2; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
          }
          if (pts.length > 2) {
            ctx.quadraticCurveTo(
              pts[pts.length - 2].x,
              pts[pts.length - 2].y,
              pts[pts.length - 1].x,
              pts[pts.length - 1].y
            );
          } else {
            ctx.lineTo(pts[1].x, pts[1].y);
          }
          ctx.stroke();
          ctx.restore();
        } else if (isPressureSensitiveRef.current) {
          // Draw pressure-sensitive segmented stroke
          for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p1Pres = p1.pressure !== undefined ? p1.pressure : 0.5;
            const p2Pres = p2.pressure !== undefined ? p2.pressure : 0.5;
            const segmentPressure = (p1Pres + p2Pres) / 2;
            
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            // Modulate line width based on pressure
            ctx.lineWidth = el.width * (0.35 + 1.3 * segmentPressure);
            ctx.stroke();
          }
        } else {
          // Draw constant-width smooth stroke
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          
          // Draw using Quadratic Bezier Curve Smoothing
          for (let i = 1; i < pts.length - 2; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
          }
          
          // curve to the last two points
          if (pts.length > 2) {
            ctx.quadraticCurveTo(
              pts[pts.length - 2].x,
              pts[pts.length - 2].y,
              pts[pts.length - 1].x,
              pts[pts.length - 1].y
            );
          } else {
            ctx.lineTo(pts[1].x, pts[1].y);
          }
          ctx.stroke();
        }

      } else if (el.type === 'shape') {
        const x = Math.min(el.x1, el.x2);
        const y = Math.min(el.y1, el.y2);
        const w = Math.abs(el.x2 - el.x1);
        const h = Math.abs(el.y2 - el.y1);

        if (el.shapeType === 'rectangle') {
          if (el.fill === 'solid') {
            ctx.fillRect(x, y, w, h);
          } else if (el.fill === 'semi') {
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.fillRect(x, y, w, h);
            ctx.restore();
            ctx.strokeRect(x, y, w, h);
          } else {
            ctx.strokeRect(x, y, w, h);
          }
        } else if (el.shapeType === 'circle') {
          const cx = el.x1;
          const cy = el.y1;
          const r = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, 2 * Math.PI);
          if (el.fill === 'solid') {
            ctx.fill();
          } else if (el.fill === 'semi') {
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.fill();
            ctx.restore();
            ctx.stroke();
          } else {
            ctx.stroke();
          }
        } else if (el.shapeType === 'line') {
          ctx.beginPath();
          ctx.moveTo(el.x1, el.y1);
          ctx.lineTo(el.x2, el.y2);
          ctx.stroke();
        } else if (el.shapeType === 'arrow') {
          drawArrow(ctx, el.x1, el.y1, el.x2, el.y2, el.width);
        }

      } else if (el.type === 'text') {
        ctx.font = `${el.fontSize}px 'Inter', sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(el.text, el.x, el.y);

      } else if (el.type === 'image') {
        const src = el.src;
        const img = typeof src === 'string' ? imageCache.current[src] : null;
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, el.x, el.y, el.width, el.height);
          return;
        }
        const failed = typeof src !== 'string' || imageFailedRef.current.has(src);
        if (!failed && !img) {
          if (!isAllowedImageSrc(src)) {
            imageFailedRef.current.add(src);
          } else {
            // Start ONE load per src (the cache entry doubles as the in-flight marker);
            // failures are remembered so a broken URL isn't re-fetched on every redraw.
            const preImg = new Image();
            if (!src.startsWith('data:')) preImg.crossOrigin = 'anonymous'; // keep PNG export untainted
            imageCache.current[src] = preImg;
            preImg.onload = () => drawCanvas(); // Trigger redraw
            preImg.onerror = () => {
              if (imageCache.current[src] === preImg) delete imageCache.current[src];
              imageFailedRef.current.add(src);
              drawCanvas();
            };
            preImg.src = src;
          }
        }
        // Temp outline
        ctx.strokeStyle = '#6366f1';
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        ctx.font = '12px Inter';
        ctx.fillStyle = '#6366f1';
        ctx.fillText(imageFailedRef.current.has(src) ? 'Image failed to load' : 'Loading image...', el.x + 10, el.y + 20);
      }
    };

    // 1. Draw saved highlighters (rendered first to stay behind handwriting and text)
    elementsRef.current.filter(el => el.isHighlighter).forEach(renderElement);
    if (currentStrokeRef.current && currentStrokeRef.current.isHighlighter) {
      renderElement(currentStrokeRef.current);
    }
    // Draw active multiplayer highlighter strokes
    Object.values(activeDrawingsRef.current).forEach(stroke => {
      if (stroke.isHighlighter) {
        renderElement(stroke);
      }
    });

    // 2. Draw normal elements (pen, shapes, text, images)
    elementsRef.current.filter(el => !el.isHighlighter).forEach(renderElement);
    if (currentStrokeRef.current && !currentStrokeRef.current.isHighlighter) {
      renderElement(currentStrokeRef.current);
    }
    if (currentShapeRef.current) {
      renderElement(currentShapeRef.current);
    }
    // Draw active multiplayer normal strokes
    Object.values(activeDrawingsRef.current).forEach(stroke => {
      if (!stroke.isHighlighter) {
        renderElement(stroke);
      }
    });

    // 3. Draw bounding box and handles if an element is selected
    if (activeToolRef.current === 'select' && selectedElementRef.current) {
      const el = elementsRef.current.find(item => item.id === selectedElementRef.current.id);
      if (el) {
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 1.5 / zoomRef.current;
        ctx.setLineDash([4, 4]);

        let minX, minY, w, h;
        if (el.type === 'image') {
          minX = el.x;
          minY = el.y;
          w = el.width;
          h = el.height;
        } else if (el.type === 'text') {
          minX = el.x;
          minY = el.y - estTextHeight(el) * 0.1;
          w = estTextWidth(el);
          h = estTextHeight(el) * 1.1;
        } else if (el.type === 'shape') {
          minX = Math.min(el.x1, el.x2);
          minY = Math.min(el.y1, el.y2);
          w = Math.abs(el.x2 - el.x1);
          h = Math.abs(el.y2 - el.y1);
        } else if (el.type === 'stroke' && Array.isArray(el.points) && el.points.length > 0) {
          // Compute bounding box for strokes
          const xs = el.points.map(p => p.x);
          const ys = el.points.map(p => p.y);
          minX = Math.min(...xs);
          minY = Math.min(...ys);
          w = Math.max(...xs) - minX;
          h = Math.max(...ys) - minY;
        }

        // Draw dotted bounding box
        ctx.strokeRect(minX - 4, minY - 4, w + 8, h + 8);
        ctx.setLineDash([]); // Reset line dash

        // Draw resize indicator for text/image objects
        if (el.type === 'image' || el.type === 'text') {
          ctx.fillStyle = '#6366f1';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          const handleSize = 8 / zoomRef.current;
          ctx.fillRect(minX + w + 4 - handleSize / 2, minY + h + 4 - handleSize / 2, handleSize, handleSize);
          ctx.strokeRect(minX + w + 4 - handleSize / 2, minY + h + 4 - handleSize / 2, handleSize, handleSize);
        }
      }
    }

    // 4. Draw laser pointer trails
    if (laserPointsRef.current && laserPointsRef.current.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ef4444';
      
      const now = Date.now();
      for (let i = 0; i < laserPointsRef.current.length - 1; i++) {
        const p1 = laserPointsRef.current[i];
        const p2 = laserPointsRef.current[i + 1];
        const age = now - p1.time;
        const ratio = Math.max(0, 1 - age / 1200);
        
        if (ratio <= 0) continue;
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `rgba(239, 68, 68, ${ratio * 0.95})`;
        ctx.lineWidth = strokeWidth * 2.5 * ratio;
        ctx.stroke();
      }
      
      // Draw a glowing pulsing white core at the pointer tip
      const tip = laserPointsRef.current[laserPointsRef.current.length - 1];
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ff3333';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.restore();
    }
    
    // 5. Draw laser pointer cursor hover dot
    if (activeToolRef.current === 'laser' && laserPointerPos.current.over) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(laserPointerPos.current.x, laserPointerPos.current.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#ff3333';
      ctx.shadowColor = '#ff3333';
      ctx.shadowBlur = 12;
      ctx.fill();
      
      // Inner glowing core
      ctx.beginPath();
      ctx.arc(laserPointerPos.current.x, laserPointerPos.current.y, 2, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 0;
      ctx.fill();
      ctx.restore();
    }
 
    // 6. Draw other participants' cursors
    if (isCollaboratingRef.current) {
      Object.values(participantsRef.current || {}).forEach(peer => {
        if (peer.userId === localUserId.current || !peer.cursor) return;
        
        ctx.save();
        ctx.translate(peer.cursor.x, peer.cursor.y);
        
        // Draw small pointer cursor
        ctx.fillStyle = peer.color || '#6366f1';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 16);
        ctx.lineTo(4, 12);
        ctx.lineTo(10, 18);
        ctx.lineTo(12, 16);
        ctx.lineTo(6, 10);
        ctx.lineTo(12, 10);
        ctx.closePath();
        ctx.fill();
        
        // Draw name label block
        ctx.font = '10px Inter';
        const textWidth = ctx.measureText(peer.userName).width;
        ctx.fillStyle = peer.color || '#6366f1';
        ctx.fillRect(10, 15, textWidth + 8, 16);
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(peer.userName, 14, 27);
        ctx.restore();
      });
    }

    ctx.restore();
  };

  // Convert canvas output to PNG download link
  const handleExport = () => {
    if (elements.length === 0) return;
    
    // Create an offscreen canvas to compute bounding boundaries of all drawings
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // Find bounding box containing all drawings to crop intelligently
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    elements.forEach(el => {
      if (!el || typeof el !== 'object') return;
      if (el.type === 'stroke') {
        (Array.isArray(el.points) ? el.points : []).forEach(p => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
      } else if (el.type === 'shape') {
        minX = Math.min(minX, el.x1, el.x2);
        minY = Math.min(minY, el.y1, el.y2);
        maxX = Math.max(maxX, el.x1, el.x2);
        maxY = Math.max(maxY, el.y1, el.y2);
      } else if (el.type === 'text') {
        // Text is drawn with textBaseline 'top': it spans y .. y + fontSize (plus descenders)
        const estWidth = (typeof el.text === 'string' ? el.text.length : 0) * (estTextHeight(el) * 0.6);
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + estWidth);
        maxY = Math.max(maxY, el.y + estTextHeight(el) * 1.2);
      } else if (el.type === 'image') {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
      }
    });

    // Add padding around elements
    const padding = 40;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    if (!isFiniteNum(width) || !isFiniteNum(height) || width <= 0 || height <= 0) return;

    tempCanvas.width = width;
    tempCanvas.height = height;

    // Draw background grid or theme color onto exported canvas
    if (theme === 'light') {
      tempCtx.fillStyle = '#ffffff';
    } else {
      tempCtx.fillStyle = '#121214';
    }
    tempCtx.fillRect(0, 0, width, height);

    // Apply translations relative to bounding offset
    tempCtx.save();
    tempCtx.translate(-minX, -minY);

    // Draw all objects
    const renderExportElement = (el) => {
      if (!el || typeof el !== 'object') return;
      tempCtx.strokeStyle = el.color;
      tempCtx.fillStyle = el.color;
      tempCtx.lineWidth = el.width;
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';

      if (el.type === 'stroke') {
        const pts = Array.isArray(el.points) ? el.points : [];
        if (pts.length >= 2) {
          if (el.isHighlighter) {
            tempCtx.save();
            tempCtx.globalAlpha = 0.45;
            tempCtx.lineCap = 'square';
            tempCtx.lineJoin = 'miter';
          }
          tempCtx.beginPath();
          tempCtx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 2; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            tempCtx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
          }
          if (pts.length > 2) {
            tempCtx.quadraticCurveTo(
              pts[pts.length - 2].x,
              pts[pts.length - 2].y,
              pts[pts.length - 1].x,
              pts[pts.length - 1].y
            );
          } else {
            tempCtx.lineTo(pts[1].x, pts[1].y);
          }
          tempCtx.stroke();
          if (el.isHighlighter) {
            tempCtx.restore();
          }
        }
      } else if (el.type === 'shape') {
        const x = Math.min(el.x1, el.x2);
        const y = Math.min(el.y1, el.y2);
        const w = Math.abs(el.x2 - el.x1);
        const h = Math.abs(el.y2 - el.y1);

        if (el.shapeType === 'rectangle') {
          if (el.fill === 'solid') {
            tempCtx.fillRect(x, y, w, h);
          } else if (el.fill === 'semi') {
            tempCtx.save();
            tempCtx.globalAlpha = 0.25;
            tempCtx.fillRect(x, y, w, h);
            tempCtx.restore();
            tempCtx.strokeRect(x, y, w, h);
          } else {
            tempCtx.strokeRect(x, y, w, h);
          }
        } else if (el.shapeType === 'circle') {
          const cx = el.x1;
          const cy = el.y1;
          const r = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
          tempCtx.beginPath();
          tempCtx.arc(cx, cy, r, 0, 2 * Math.PI);
          if (el.fill === 'solid') {
            tempCtx.fill();
          } else if (el.fill === 'semi') {
            tempCtx.save();
            tempCtx.globalAlpha = 0.25;
            tempCtx.fill();
            tempCtx.restore();
            tempCtx.stroke();
          } else {
            tempCtx.stroke();
          }
        } else if (el.shapeType === 'line') {
          tempCtx.beginPath();
          tempCtx.moveTo(el.x1, el.y1);
          tempCtx.lineTo(el.x2, el.y2);
          tempCtx.stroke();
        } else if (el.shapeType === 'arrow') {
          drawArrow(tempCtx, el.x1, el.y1, el.x2, el.y2, el.width);
        }
      } else if (el.type === 'text') {
        tempCtx.font = `${el.fontSize}px 'Inter', sans-serif`;
        tempCtx.textBaseline = 'top';
        tempCtx.fillText(el.text, el.x, el.y);
      } else if (el.type === 'image') {
        const img = imageCache.current[el.src];
        if (img && img.complete && img.naturalWidth > 0) {
          tempCtx.drawImage(img, el.x, el.y, el.width, el.height);
        }
      }
    };

    // Draw highlighters first (so they are rendered behind other drawing elements in export)
    elements.filter(el => el.isHighlighter).forEach(renderExportElement);
    // Draw all non-highlighters on top
    elements.filter(el => !el.isHighlighter).forEach(renderExportElement);

    tempCtx.restore();

    // Trigger PNG image download link
    const link = document.createElement('a');
    link.download = `foundaxia-whiteboard-${Date.now()}.png`;
    try {
      link.href = tempCanvas.toDataURL('image/png');
    } catch (err) {
      // A remote image without CORS headers taints the canvas
      console.error('PNG export failed:', err);
      triggerToast('Export failed: an image on the board could not be included.');
      return;
    }
    link.click();
  };

  // Get selected element screen bounds for rendering delete/resize UI
  const getSelectedElementBounds = () => {
    if (!selectedElement) return null;
    const el = elements.find(item => item.id === selectedElement.id);
    if (!el) return null;

    let minX, minY, w, h;
    if (el.type === 'image') {
      minX = el.x;
      minY = el.y;
      w = el.width;
      h = el.height;
    } else if (el.type === 'text') {
      minX = el.x;
      minY = el.y - estTextHeight(el) * 0.1;
      w = estTextWidth(el);
      h = estTextHeight(el) * 1.1;
    } else if (el.type === 'shape') {
      minX = Math.min(el.x1, el.x2);
      minY = Math.min(el.y1, el.y2);
      w = Math.abs(el.x2 - el.x1);
      h = Math.abs(el.y2 - el.y1);
    } else if (el.type === 'stroke' && Array.isArray(el.points) && el.points.length > 0) {
      const xs = el.points.map(p => p.x);
      const ys = el.points.map(p => p.y);
      minX = Math.min(...xs);
      minY = Math.min(...ys);
      w = Math.max(...xs) - minX;
      h = Math.max(...ys) - minY;
    }

    if (![minX, minY, w, h].every(isFiniteNum)) return null;

    // Convert world bounds to screen bounds
    const screenLeft = minX * zoom + pan.x;
    const screenTop = minY * zoom + pan.y;
    const screenWidth = w * zoom;
    const screenHeight = h * zoom;

    return {
      left: screenLeft,
      top: screenTop,
      width: screenWidth,
      height: screenHeight,
      right: screenLeft + screenWidth,
      bottom: screenTop + screenHeight
    };
  };

  const selectedBounds = getSelectedElementBounds();

  return (
    <div 
      className="whiteboard-container" 
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* File Drop Highlight Screen */}
      {isDragOver && (
        <div className="drag-drop-overlay">
          <div className="drag-drop-message">
            <ImageIcon size={24} className="text-indigo-400" />
            <span>Drop image files here to upload to whiteboard</span>
          </div>
        </div>
      )}

      {/* â”€â”€ Header Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <WhiteboardHeader
        isHeaderCollapsed={isHeaderCollapsed}
        setIsHeaderCollapsed={setIsHeaderCollapsed}
        navigate={navigate}
        undoStack={undoStack}
        redoStack={redoStack}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        isCollaborating={isCollaborating}
        hasDrawAccess={hasDrawAccess}
        isHost={isHost}
        elements={elements}
        handleExport={handleExport}
        isProcessingPdf={isProcessingPdf}
        pdfProgress={pdfProgress}
        pdfInputRef={pdfInputRef}
        setShowClearModal={setShowClearModal}
        initiateRoomCollab={initiateRoomCollab}
        showCollabSidebar={showCollabSidebar}
        setShowCollabSidebar={setShowCollabSidebar}
        participants={participants}
        isMicOn={isMicOn}
        toggleMicrophone={toggleMicrophone}
        micLevel={micLevel}
        isVideoOn={isVideoOn}
        toggleCamera={toggleCamera}
        showVideoGrid={showVideoGrid}
        setShowVideoGrid={setShowVideoGrid}
        showParticipantStrip={showParticipantStrip}
        setShowParticipantStrip={setShowParticipantStrip}
        isHandRaised={isHandRaised}
        toggleRaiseHand={toggleRaiseHand}
        slideMaterials={slideMaterials}
        currentSlideUrl={currentSlideUrl}
        showSlidePicker={showSlidePicker}
        setShowSlidePicker={setShowSlidePicker}
        attachSlideToCurrentPage={attachSlideToCurrentPage}
        clearSlideFromCurrentPage={clearSlideFromCurrentPage}
        isSlideInteractive={isSlideInteractive}
        setIsSlideInteractive={setIsSlideInteractive}
        handleEndSession={handleEndSession}
      />

      {/* â”€â”€ Main Workspace Frame â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className={`whiteboard-workspace ${isHeaderCollapsed ? 'fullscreen' : ''}`}>
        {/* Floating Expand Header Tab */}
        {isHeaderCollapsed && (
          <button 
            className="whiteboard-header-expand-trigger"
            onClick={() => setIsHeaderCollapsed(false)}
            data-tooltip="Expand Header"
          >
            <ChevronDown size={16} />
          </button>
        )}

        {/* â”€â”€ HTML Teaching Slide (live, behind the canvas) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <SlideLayer
          slideUrl={currentSlideUrl}
          interactive={isSlideInteractive}
          onNavigate={handleSlideNavigate}
          gotoIndex={remoteSlideGoto}
        />

        {/* â”€â”€ Canvas Element â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <canvas
          ref={canvasRef}
          className={`whiteboard-canvas theme-${theme} grid-${gridType} ${isPanning ? 'grabbing' : ''}`}
          style={{
            cursor: getCanvasCursor(),
            position: currentSlideUrl ? 'relative' : undefined,
            background: currentSlideUrl ? 'transparent' : undefined,
            pointerEvents: (currentSlideUrl && isSlideInteractive) ? 'none' : 'auto'
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onPointerLeave={() => {
            laserPointerPos.current.over = false;
            drawCanvas();
          }}
        />

        {/* Read-Only Banner */}
        {isCollaborating && !isHost && !hasDrawAccess && (
          <div style={{
            position: 'absolute', bottom: '70px', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(15, 15, 20, 0.88)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '12px',
            padding: '10px 20px', color: '#fca5a5', fontSize: '0.85rem', fontWeight: '600',
            display: 'flex', alignItems: 'center', gap: '10px', zIndex: 200,
            pointerEvents: 'none', userSelect: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
          }}>
            <span style={{ fontSize: '1rem' }}>ðŸ”’</span>
            <span>View Only â€” waiting for the tutor to grant you drawing access</span>
          </div>
        )}

        {/* Granted Access Banner */}
        {isCollaborating && !isHost && hasDrawAccess && (
          <div style={{
            position: 'absolute', bottom: '70px', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(15, 15, 20, 0.88)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '12px',
            padding: '10px 20px', color: '#6ee7b7', fontSize: '0.85rem', fontWeight: '600',
            display: 'flex', alignItems: 'center', gap: '10px', zIndex: 200,
            pointerEvents: 'none', userSelect: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
          }}>
            <span style={{ fontSize: '1rem' }}>âœï¸</span>
            <span>Drawing access granted â€” you can now draw on the board</span>
          </div>
        )}

        {/* Floating Delete Button for selected element */}
        {selectedBounds && activeTool === 'select' && (
          <button
            className="whiteboard-floating-delete-btn"
            style={{
              position: 'absolute',
              left: `${selectedBounds.right + 10}px`,
              top: `${selectedBounds.top - 15}px`,
              zIndex: 90
            }}
            onClick={() => {
              const remaining = elements.filter(el => el.id !== selectedElement.id);
              pushToHistory(remaining);
              setSelectedElement(null);
              broadcastElementsUpdate(remaining);
            }}
            title="Delete Selected Element"
          >
            <Trash2 size={14} />
          </button>
        )}

        {/* Text Area Overlay Input */}
        {editingText && (
          <div
            className="canvas-text-input-overlay"
            style={{
              left: editingText.screenX + 'px',
              top: editingText.screenY + 'px',
            }}
          >
            <textarea
              autoFocus
              className="canvas-text-input-textarea"
              value={editingText.value}
              rows={Math.max(1, editingText.value.split('\n').length)}
              style={{
                fontSize: (editingText.isExisting && isFiniteNum(editingText.fontSize) ? editingText.fontSize : fontSize) * zoom + 'px',
                color: editingText.isExisting && editingText.color ? editingText.color : activeColor,
                minWidth: '150px',
                lineHeight: '1.2'
              }}
              onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
              onBlur={finishTextInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  finishTextInput();
                }
              }}
            />
          </div>
        )}

        {/* â”€â”€ Floating Video Grid Overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {showVideoGrid && isCollaborating && (
          <div className="video-grid-overlay">
            <div className="video-grid-header">
              <span className="video-grid-title">
                <MonitorPlay size={13} style={{ marginRight: 5 }} />
                Live Video
              </span>
              <button className="video-grid-close" onClick={() => setShowVideoGrid(false)} title="Hide Video Grid">âœ•</button>
            </div>

            <div className="video-grid-tiles">
              {/* Local Camera Tile */}
              <div className="video-tile local-tile">
                <video
                  ref={(el) => {
                    localVideoGridRef.current = el;
                    if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                      el.srcObject = localStreamRef.current;
                    }
                  }}
                  className="video-tile-stream"
                  autoPlay muted playsInline
                  style={{ display: isVideoOn ? 'block' : 'none' }}
                />
                {!isVideoOn && (
                  <div className="video-tile-avatar" style={{ background: userColor.current }}>
                    {(userName || 'Y').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="video-tile-label">
                  {userName || 'You'} (You)
                  <span className="video-tile-icons">
                    {isMicOn ? <span style={{ color: '#34d399', fontSize: '0.7rem' }}>â— MIC</span> : <span style={{ opacity: 0.4, fontSize: '0.7rem' }}>MUTED</span>}
                  </span>
                </div>
              </div>

              {/* Remote Participant Tiles */}
              {Object.entries(participants).map(([peerId, pData]) => {
                if (peerId === localUserId.current) return null;
                const remoteStream = remoteVideoStreams[peerId];
                const pColor = pData?.color || '#6366f1';
                const pName = pData?.userName || 'Participant';
                const pMicOn = pData?.isMicOn;
                const pVideoOn = pData?.isVideoOn;

                return (
                  <div key={peerId} className="video-tile">
                    {remoteStream ? (
                      <video
                        ref={(el) => {
                          if (el) {
                            remoteVideoRefs.current[peerId] = el;
                            if (el.srcObject !== remoteStream) el.srcObject = remoteStream;
                          }
                        }}
                        className="video-tile-stream"
                        autoPlay playsInline
                      />
                    ) : (
                      <div className="video-tile-avatar" style={{ background: pColor }}>
                        {pName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="video-tile-label">
                      {pName}
                      <span className="video-tile-icons">
                        {pMicOn ? 'ðŸŽ¤' : 'ðŸ”‡'}
                        {pVideoOn ? 'ðŸ“·' : 'ðŸ“·ðŸš«'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* â”€â”€ Right-Side Participant Strip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {/* Hidden while the Classroom sidebar is open: both float on the same right edge and
            the strip's avatar tiles sat on top of (and blocked clicks on) the sidebar's
            per-student draw-access toggle. The sidebar already shows mic status per participant,
            so nothing is lost by not showing both at once. */}
        <ParticipantStrip
          isCollaborating={isCollaborating}
          showParticipantStrip={showParticipantStrip && !showCollabSidebar}
          participants={participants}
          localUserId={localUserId.current}
          userName={userName}
          userColor={userColor.current}
          isMicOn={isMicOn}
          isVideoOn={isVideoOn}
          isHandRaised={isHandRaised}
          speakingPeers={speakingPeers}
          micLevel={micLevel}
          remoteVideoStreams={remoteVideoStreams}
          remoteVideoRefs={remoteVideoRefs}
          localVideoStripRef={localVideoStripRef}
          localStreamRef={localStreamRef}
          showVideoGrid={showVideoGrid}
        />

        {/* While actively interacting with an attached slide, hide the drawing-only chrome
            entirely - these floating panels would otherwise sit on top of (and block clicks
            on) the slide's own UI, which every uploaded deck has pinned to fixed positions. */}
        {!(currentSlideUrl && isSlideInteractive) && (
        <>
        {/* â”€â”€ Floating Left Toolbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <WhiteboardToolbar
          isToolbarCollapsed={isToolbarCollapsed}
          setIsToolbarCollapsed={setIsToolbarCollapsed}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          setSelectedElement={setSelectedElement}
          fileInputRef={fileInputRef}
          isCollaborating={isCollaborating}
          hasDrawAccess={hasDrawAccess}
          isHost={isHost}
        />

        {/* â”€â”€ Floating Right Properties Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <WhiteboardProperties
          isPropertiesCollapsed={isPropertiesCollapsed}
          setIsPropertiesCollapsed={setIsPropertiesCollapsed}
          isCollaborating={isCollaborating}
          hasDrawAccess={hasDrawAccess}
          isHost={isHost}
          activeColor={activeColor}
          setActiveColor={setActiveColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          fontSize={fontSize}
          setFontSize={setFontSize}
          activeTool={activeTool}
          fillMode={fillMode}
          setFillMode={setFillMode}
          gridType={gridType}
          setGridType={setGridType}
          snapToGrid={snapToGrid}
          setSnapToGrid={setSnapToGrid}
          isPressureSensitive={isPressureSensitive}
          setIsPressureSensitive={setIsPressureSensitive}
          theme={theme}
          setTheme={setTheme}
          selectedElement={selectedElement}
          setSelectedElement={setSelectedElement}
          elements={elements}
          pushToHistory={pushToHistory}
          broadcastElementsUpdate={broadcastElementsUpdate}
        />

        {/* â”€â”€ Center Canvas Zoom Slider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="whiteboard-zoom-controls">
          <button className="zoom-btn" onClick={() => handleZoom(-0.1)} data-tooltip="Zoom Out">
            <ZoomIn size={14} style={{ transform: 'scale(0.8)' }} />
          </button>
          <span className="zoom-text">{Math.round(zoom * 100)}%</span>
          <button className="zoom-btn" onClick={() => handleZoom(0.1)} data-tooltip="Zoom In">
            <ZoomOut size={14} style={{ transform: 'scale(0.8)' }} />
          </button>
          <button className="zoom-btn" onClick={() => handleZoom('reset')} data-tooltip="Recenter Canvas">
            <Maximize size={14} style={{ transform: 'scale(0.8)' }} />
          </button>
        </div>
        </>
        )}

        {/* â”€â”€ Center Bottom Slide Navigator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {!(currentSlideUrl && isSlideInteractive) && (
        <div className="whiteboard-slide-controls">
          <button 
            className="slide-btn" 
            onClick={handlePrevPage} 
            disabled={currentPageIndex === 0 || (isCollaborating && !isHost)}
            title={isHost ? "Previous Page" : "Only the tutor can change slides"}
          >
            <ChevronLeft size={16} />
          </button>
          
          <span className="slide-text">
            Slide {currentPageIndex + 1} of {pages.length}
          </span>
          
          <button 
            className="slide-btn" 
            onClick={handleNextPage} 
            disabled={isCollaborating && !isHost}
            title={isHost ? (currentPageIndex === pages.length - 1 ? "Add New Page" : "Next Page") : "Only the tutor can change slides"}
          >
            {currentPageIndex === pages.length - 1 ? '+' : <ChevronRight size={16} />}
          </button>

          {pages.length > 1 && isHost && (
            <button 
              className="slide-btn" 
              onClick={handleDeletePage}
              style={{ color: '#ef4444', marginLeft: '5px' }}
              title="Delete Slide"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        )}

        {/* â”€â”€ Floating Bottom Status Indicator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="whiteboard-statusbar">
          <div className="status-item">
            <span>Pointer:</span>
            <span className="status-highlight" style={{ textTransform: 'capitalize' }}>{pointerType}</span>
          </div>
          {pointerType === 'pen' && (
            <div className="status-item">
              <span>Stylus Pressure:</span>
              <span className="status-highlight">{Math.round(pointerPressure * 100)}%</span>
            </div>
          )}
          <div className="status-item">
            <span>Active elements:</span>
            <span className="status-highlight">{elements.length}</span>
          </div>
        </div>
      </div>

      {/* â”€â”€ Hidden File Inputs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden-file-input"
        accept="image/*"
        onChange={handleImageUpload}
      />
      <input
        type="file"
        ref={pdfInputRef}
        className="hidden-file-input"
        accept="application/pdf"
        onChange={handlePdfUpload}
      />

      {/* â”€â”€ PDF Import Progress Overlay â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {isProcessingPdf && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(10, 10, 15, 0.78)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '18px'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            borderRadius: '20px', border: '1px solid rgba(99,102,241,0.3)',
            padding: '40px 56px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: '22px', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', minWidth: '360px'
          }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '50%',
              border: '3px solid rgba(99,102,241,0.2)', borderTop: '3px solid #6366f1',
              animation: 'spin 0.9s linear infinite'
            }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
                Importing Presentation
              </div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
                {pdfProgress.total > 0
                  ? `Rendering page ${pdfProgress.current} of ${pdfProgress.total}â€¦`
                  : 'Loading PDF fileâ€¦'}
              </div>
            </div>
            {pdfProgress.total > 0 && (
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: '100px', height: '7px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '100px',
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                  width: `${(pdfProgress.current / pdfProgress.total) * 100}%`,
                  transition: 'width 0.3s ease'
                }} />
              </div>
            )}
            <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
              Please wait â€” slides will sync to all participants automatically
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Modals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <WipeBoardModal
        showClearModal={showClearModal}
        setShowClearModal={setShowClearModal}
        clearBoard={clearBoard}
      />

      <CollaborationSidebar
        isCollaborating={isCollaborating}
        showCollabSidebar={showCollabSidebar}
        setShowCollabSidebar={setShowCollabSidebar}
        roomId={roomId}
        copyShareLink={copyShareLink}
        participants={participants}
        localUserId={localUserId.current}
        isHost={isHost}
        onLowerHand={lowerParticipantHand}
        toggleParticipantDrawAccess={toggleParticipantDrawAccess}
      />

      <NameModal
        showNameModal={showNameModal}
        roomId={roomId}
        userName={userName}
        setUserName={setUserName}
        startCollaboration={startCollaboration}
      />

      {/* Live Toast banner indicator */}
      {toastMessage && (
        <div className="whiteboard-toast">
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}


