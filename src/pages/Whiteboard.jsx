import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ZoomIn, ZoomOut, Maximize, Trash2, ChevronLeft, ChevronRight, ChevronDown, Image as ImageIcon, MonitorPlay } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getMaterials, getCourseTutors, endLiveSession } from '../services/dataService';
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
import { AVATAR_COLORS, generateRandomName } from '../components/whiteboard/constants';

export default function Whiteboard({ user }) {
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
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [{ id: 'page-1', elements: [], undoStack: [], redoStack: [] }];
  };

  const [pages, setPages] = useState(loadPersistedPages);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

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
    if (isHost && channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'slide-nav', payload: { index } });
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

  const broadcastPagesUpdate = (updatedPages) => {
    if (isCollaborating && isHost && channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'page-change',
        payload: { pages: updatedPages, pageIndex: currentPageIndex }
      });
    }
  };

  const attachSlideToCurrentPage = (material) => {
    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = { ...updatedPages[currentPageIndex], slideUrl: material.file_url };
    setPages(updatedPages);
    setShowSlidePicker(false);
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
      const toStore = pages.map(p => ({ id: p.id, elements: p.elements }));
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
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Host-only: end the session for everyone, remove the join link from invited
  // students' dashboards, and boot any currently-connected participants out.
  const handleEndSession = async () => {
    if (!window.confirm('End this session for everyone?')) return;
    try {
      await endLiveSession(roomId);
    } catch (_) {
      // Non-fatal: an ad-hoc room (no matching live_sessions row) is a harmless no-op.
    }
    if (channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'session-ended', payload: {} });
    }
    navigate(user?.role === 'admin' ? '/admin' : '/tutor');
  };

  // Best-effort cleanup if the host just closes the tab instead of clicking "End Session" -
  // without this, the live_sessions row (and the student's join banner) would never go away
  // on its own. A normal supabase-js call made during page teardown gets cancelled before it
  // completes, so this fires a raw fetch with keepalive: true, which browsers guarantee is
  // allowed to finish even after the page starts unloading. This is a safety net on top of
  // the explicit End Session flow, not a replacement for it - and getLiveSessionsForStudent's
  // own age-based expiry covers the rest (tab killed outright, offline, etc.).
  useEffect(() => {
    if (!isHost || !roomId) return;
    const cleanup = () => {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!url || !key) return;
      try {
        fetch(`${url}/rest/v1/live_sessions?id=eq.${encodeURIComponent(roomId)}`, {
          method: 'DELETE',
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          keepalive: true
        });
      } catch (_) {}
    };
    window.addEventListener('pagehide', cleanup);
    return () => window.removeEventListener('pagehide', cleanup);
  }, [isHost, roomId]);

  // On mount: check room ID, join collaboration automatically if URL link exists.
  // Guarded to run at most once: this effect has been observed firing twice in both dev
  // and production (not just StrictMode), and Supabase's realtime client dedupes channels
  // by topic name - a second `supabase.channel('room-X')` call for the same room reuses
  // the already-subscribed instance, so `channel.on(...)` throws on the second attempt and
  // silently corrupts that invocation's own listener setup (broadcast events like
  // board-state-response/page-change then never reach that client).
  useEffect(() => {
    if (collaborationStartedRef.current) return;
    collaborationStartedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    
    // Deterministic Host Role check: a client is the host if they are the room creator and not a student
    const isRoomCreator = !roomParam || sessionStorage.getItem(`wb-host-${roomParam}`) === 'true';
    const clientIsHost = isRoomCreator && !(user && user.role === 'student');

    if (roomParam && !clientIsHost) {
      // Guest joining via shared link
      setRoomId(roomParam);
      setIsHost(false);
      setHasDrawAccess(false);
      
      const storedName = localStorage.getItem(`wb-name-${roomParam}`);
      if (user && user.full_name) {
        // Logged-in student: auto-join immediately with their name!
        setTimeout(() => {
          startCollaboration(roomParam, user.full_name, false);
        }, 100);
      } else if (storedName) {
        // Guest who already filled out their name before refresh: auto-join!
        setTimeout(() => {
          startCollaboration(roomParam, storedName, false);
        }, 100);
      } else {
        // Anonymous guest: ask for name in modal
        setShowNameModal(true);
      }
    } else {
      // Host: auto-join the room immediately
      const activeRoom = roomParam || 'room-' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem(`wb-host-${activeRoom}`, 'true');
      
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
      setTimeout(() => {
        startCollaboration(activeRoom, defaultName, true);
      }, 100);
    }

    return () => {
      // Cleanup WebRTC and Supabase channel on unmount
      closeAllPeerConnections();
      stopLocalStream();
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const updatePresenceState = async (updates = {}) => {
    if (!channelRef.current) return;
    await channelRef.current.track({
      userId: localUserId.current,
      userName: userName,
      isHost: isHost,
      hasDrawAccess: isHost ? true : hasDrawAccess,
      color: userColor.current,
      isMicOn: isMicOn,
      isVideoOn: isVideoOn,
      cursor: null,
      ...updates
    });
  };

  const startCollaboration = async (id, chosenName, asHost = null) => {
    if (!supabase) {
      alert("Supabase configuration not detected. Multiplayer collaboration is unavailable.");
      return;
    }

    const hostMode = asHost !== null ? asHost : isHost;

    const name = chosenName || userName || generateRandomName();
    setUserName(name);
    setRoomId(id);
    setIsCollaborating(true);
    setShowNameModal(false);
    localStorage.setItem(`wb-name-${id}`, name);
    if (asHost !== null) {
      setIsHost(asHost);
      setHasDrawAccess(asHost ? true : hasDrawAccess);
    }

    // Update browser URL query parameter without page reload
    const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?room=${id}`;
    window.history.replaceState({ path: newurl }, '', newurl);

    const channel = supabase.channel('room-' + id, {
      config: {
        presence: {
          key: localUserId.current,
        },
      },
    });

    channelRef.current = channel;

    // Track participant joins/leaves using dynamic ref to avoid stale closures
    channel.on('presence', { event: 'sync' }, () => {
      if (presenceSyncHandlerRef.current) {
        presenceSyncHandlerRef.current();
      }
    });

    // Handle broadcast signals using fresh ref to avoid stale closures
    channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
      if (handleBroadcastEventRef.current) {
        handleBroadcastEventRef.current(event, payload);
      }
    });

    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          userId: localUserId.current,
          userName: name,
          isHost: hostMode,
          hasDrawAccess: hostMode ? true : hasDrawAccess,
          color: userColor.current,
          isMicOn: isMicOn,
          isVideoOn: isVideoOn,
          handRaised: isHandRaised,
          cursor: null
        });
        triggerToast(`Connected to room! Welcome ${name}.`);

        // Sync board state from the host on join
        if (!hostMode) {
          channel.send({
            type: 'broadcast',
            event: 'request-board-state',
            payload: { senderUserId: localUserId.current }
          });
        } else {
          // Broadcast state to any existing peers
          channel.send({
            type: 'broadcast',
            event: 'board-state-response',
            payload: {
              targetUserId: 'all',
              pages: pages,
              currentPageIndex: currentPageIndex
            }
          });
        }
      }
    });
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

    channelRef.current.send({
      type: 'broadcast',
      event: 'drawing-stroke',
      payload: { userId: localUserId.current, newPoints, color, width, isHighlighter }
    });
    return true;
  };

  const broadcastDrawingEnd = (element) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'drawing-end',
      payload: { userId: localUserId.current, element }
    });
  };

  const broadcastElementsUpdate = (updatedElements) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'element-update',
      payload: { action: 'update-all', elements: updatedElements }
    });
  };

  const broadcastElementsClear = () => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'element-update',
      payload: { action: 'clear' }
    });
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

    channelRef.current.send({
      type: 'broadcast',
      event: 'peer-cursor',
      payload: { userId: localUserId.current, cursor: { x, y } }
    });
  };

  const toggleParticipantDrawAccess = (peerId, currentAccess) => {
    if (!isHost || !channelRef.current) return;
    const nextAccess = !currentAccess;
    
    // Auto-lower student's hand when granting draw access
    channelRef.current.send({
      type: 'broadcast',
      event: 'access-changed',
      payload: { 
        targetUserId: peerId, 
        hasDrawAccess: nextAccess,
        lowerHand: nextAccess
      }
    });
    
    // Also trigger local state indicator redraw
    setParticipants(prev => {
      const next = { ...prev };
      if (next[peerId]) {
        next[peerId].hasDrawAccess = nextAccess;
        if (nextAccess) next[peerId].handRaised = false;
      }
      return next;
    });
  };

  const toggleRaiseHand = async () => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
    if (isCollaborating) {
      updatePresenceState({ handRaised: nextState });
      if (nextState) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'hand-raised',
          payload: { userId: localUserId.current, userName: userName }
        });
      }
    }
  };

  const handleBroadcastEvent = (event, payload) => {
    switch (event) {
      case 'drawing-stroke':
        if (!activeDrawingsRef.current[payload.userId]) {
          activeDrawingsRef.current[payload.userId] = {
            type: 'stroke',
            points: [],
            color: payload.color,
            width: payload.width,
            isHighlighter: payload.isHighlighter
          };
        }
        // Append newly arrived delta points
        if (payload.newPoints && Array.isArray(payload.newPoints)) {
          activeDrawingsRef.current[payload.userId].points.push(...payload.newPoints);
        }
        drawCanvas();
        break;

      case 'drawing-end':
        // Drop malformed elements instead of letting them crash every renderer.
        if (!payload.element || typeof payload.element !== 'object' ||
            (payload.element.type === 'stroke' && !Array.isArray(payload.element.points)) ||
            (payload.element.type === 'text' && typeof payload.element.text !== 'string')) {
          break;
        }
        // Record a history checkpoint before applying the remote stroke, so a local
        // Undo reverts this specific change instead of popping a now-stale snapshot
        // from before the remote update (which would silently drop it).
        setUndoStack(prev => [...prev, elements]);
        setRedoStack([]);
        setElements(prev => [...prev, payload.element]);
        // Delay active drawing ref cleanup slightly to overlap with React state commit
        // and prevent concurrent cursor-move updates from wiping the stroke off canvas
        setTimeout(() => {
          delete activeDrawingsRef.current[payload.userId];
          drawCanvas();
        }, 80);
        break;

      case 'element-update':
        if (payload.action === 'update-all' && !Array.isArray(payload.elements)) break;
        setUndoStack(prev => [...prev, elements]);
        setRedoStack([]);
        if (payload.action === 'clear') {
          setElements([]);
          updateCurrentPageElements([]);
          setSelectedElement(null);
        } else if (payload.action === 'update-all') {
          setElements(payload.elements);
          updateCurrentPageElements(payload.elements);
        }
        drawCanvas();
        break;

      case 'page-change':
        if (!isHost) {
          console.log("Receiver: page-change event received", payload);
          if (payload.pages) {
            setPages(payload.pages);
          }
          setCurrentPageIndex(payload.pageIndex);
          const targetPage = payload.pages ? payload.pages[payload.pageIndex] : pages[payload.pageIndex];
          if (targetPage) {
            setElements(targetPage.elements || []);
            setUndoStack(targetPage.undoStack || []);
            setRedoStack(targetPage.redoStack || []);
          }
          requestAnimationFrame(() => {
            drawCanvas();
          });
        }
        break;

      case 'access-changed':
        if (payload.targetUserId === localUserId.current) {
          setHasDrawAccess(payload.hasDrawAccess);
          const updates = { hasDrawAccess: payload.hasDrawAccess };
          if (payload.lowerHand) {
            setIsHandRaised(false);
            updates.handRaised = false;
          }
          updatePresenceState(updates);
          triggerToast(payload.hasDrawAccess ? "Drawing access GRANTED by host!" : "Drawing access REVOKED by host.");
        }
        break;

      case 'hand-raised':
        if (isHost) {
          triggerToast(`âœ‹ ${payload.userName} raised their hand!`);
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
            osc.start();
            osc.stop(audioCtx.currentTime + 0.22);
          } catch (_) {}
        }
        break;

      case 'lower-hand-request':
        if (payload.targetUserId === localUserId.current) {
          setIsHandRaised(false);
          updatePresenceState({ handRaised: false });
          triggerToast("Tutor lowered your hand.");
        }
        break;

      case 'peer-cursor':
        if (participantsRef.current[payload.userId]) {
          participantsRef.current[payload.userId].cursor = payload.cursor;
          drawCanvas();
        }
        break;

      // WebRTC voice chat signaling
      case 'webrtc-offer':
        if (payload.targetUserId === localUserId.current) {
          handleWebRTCOffer(payload.offer, payload.senderUserId);
        }
        break;
      case 'webrtc-answer':
        if (payload.targetUserId === localUserId.current) {
          handleWebRTCAnswer(payload.answer, payload.senderUserId);
        }
        break;
      case 'webrtc-ice':
        if (payload.targetUserId === localUserId.current) {
          handleWebRTCIce(payload.candidate, payload.senderUserId);
        }
        break;

      case 'peer-reconnect':
        const peerId = payload.senderUserId;
        if (peerConnectionsRef.current[peerId]) {
          try {
            peerConnectionsRef.current[peerId].close();
          } catch (_) {}
          delete peerConnectionsRef.current[peerId];
        }
        setRemoteVideoStreams(prev => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
        if (remoteAnalysersRef.current[peerId]) {
          delete remoteAnalysersRef.current[peerId];
        }
        const audioEl = document.getElementById('peer-audio-' + peerId);
        if (audioEl) audioEl.remove();

        // Create fresh connection
        createPeerConnection(peerId, localUserId.current > peerId);
        break;

      case 'request-board-state':
        if (isHost && channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'board-state-response',
            payload: {
              targetUserId: payload.senderUserId,
              pages: pages,
              currentPageIndex: currentPageIndex
            }
          });
        }
        break;

      case 'board-state-response':
        console.log("Receiver: board-state-response event received", payload);
        if (!Array.isArray(payload.pages) || payload.pages.length === 0 || !Number.isInteger(payload.currentPageIndex)) break;
        if (payload.targetUserId === 'all' || payload.targetUserId === localUserId.current) {
          if (!isHost) {
            console.log("Receiver: Updating pages to:", payload.pages, "and index to:", payload.currentPageIndex);
            setPages(payload.pages);
            setCurrentPageIndex(payload.currentPageIndex);
            const activePage = payload.pages[payload.currentPageIndex];
            if (activePage) {
              console.log("Receiver: Setting elements to active page elements:", activePage.elements);
              setElements(activePage.elements || []);
              setUndoStack(activePage.undoStack || []);
              setRedoStack(activePage.redoStack || []);
            } else {
              console.warn("Receiver: Active page not found at index", payload.currentPageIndex);
            }
            requestAnimationFrame(() => {
              drawCanvas();
            });
            triggerToast("Whiteboard sync complete!");
          }
        }
        break;

      case 'session-ended':
        if (!isHost) {
          triggerToast('The tutor ended this session.');
          setTimeout(() => navigate('/student'), 1500);
        }
        break;

      case 'slide-nav':
        if (!isHost) {
          setRemoteSlideGoto({ index: payload.index, nonce: Date.now() });
        }
        break;

      default:
        break;
    }
  };

  handleBroadcastEventRef.current = handleBroadcastEvent;

  presenceSyncHandlerRef.current = () => {
    const channel = channelRef.current;
    if (!channel) return;
    const state = channel.presenceState();
    const mapped = {};
    Object.keys(state).forEach(key => {
      mapped[key] = state[key][0];
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
    return analyser;
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
    channelRef.current.send({
      type: 'broadcast',
      event: 'peer-reconnect',
      payload: { senderUserId: localUserId.current }
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
        delete remoteAnalysersRef.current[peerId];
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
      await getLocalStream(constraints);
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

      if (hasVideo) {
        setRemoteVideoStreams(prev => ({ ...prev, [peerId]: stream }));
        setShowVideoGrid(true);
      }

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
        if (!localAnalyserRef.current) {
          try {
            localAnalyserRef.current = createAnalyserForStream(stream);
          } catch (_) {}
        }
        startLevelLoop();
        if (isCollaborating) {
          closeAllPeerConnections();
          broadcastReconnect();
          Object.keys(participantsRef.current).forEach(peerId => {
            if (peerId === localUserId.current) return;
            createPeerConnection(peerId, localUserId.current > peerId);
          });
          updatePresenceState({ isMicOn: true });
        }
      }
    } else {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = false; });
      }
      localAnalyserRef.current = null;
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
        if (isCollaborating) {
          closeAllPeerConnections();
          broadcastReconnect();
          Object.keys(participantsRef.current).forEach(peerId => {
            if (peerId === localUserId.current) return;
            createPeerConnection(peerId, localUserId.current > peerId);
          });
        }
        updatePresenceState({ isVideoOn: true });
        triggerToast('Camera ON â€” peers can now see you.');
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
      if (el.type === 'image') {
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
        const padding = 10;
        // Text hit boundary calculation is an estimation based on font size and text length
        const estWidth = el.text.length * (el.fontSize * 0.55);
        const estHeight = el.fontSize;
        if (x >= el.x - padding && x <= el.x + estWidth + padding &&
            y >= el.y - estHeight - padding && y <= el.y + padding) {
          const handleSize = 15;
          const isNearResize = (x >= el.x + estWidth - handleSize && x <= el.x + estWidth + handleSize &&
                                y >= el.y - estHeight - handleSize && y <= el.y + handleSize);
          return { element: el, type: isNearResize ? 'resize' : 'drag' };
        }
      } else if (el.type === 'shape') {
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
        const threshold = el.width / 2 + 10;
        const isNear = el.points.some(p => Math.hypot(p.x - x, p.y - y) < threshold);
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
    if (isCollaborating && isHost && channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'page-change',
        payload: {
          pages: nextPages,
          pageIndex: nextIndex
        }
      });
    }
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
    if (isCollaborating && isHost && channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'page-change',
        payload: {
          pages: updatedPages,
          pageIndex: targetIndex
        }
      });
    }
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
    if (isCollaborating && isHost && channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'page-change',
        payload: {
          pages: updatedPages,
          pageIndex: newIdx
        }
      });
    }
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
        const textEl = hit.element;
        setEditingText({
          id: textEl.id,
          x: textEl.x,
          y: textEl.y,
          screenX,
          screenY,
          value: textEl.text
        });
        // Temp hide during editing
        setElements(elements.filter(el => el.id !== textEl.id));
      } else {
        setEditingText({
          id: Date.now().toString(),
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
      const textEl = hit.element;
      setEditingText({
        id: textEl.id,
        x: textEl.x,
        y: textEl.y,
        screenX,
        screenY,
        value: textEl.text
      });
      setElements(elements.filter(el => el.id !== textEl.id));
    } else if (activeTool === 'select' || activeTool === 'text') {
      // Create new text block on empty canvas double click
      setEditingText({
        id: Date.now().toString(),
        x,
        y,
        screenX,
        screenY,
        value: ''
      });
    }
  };

  // Confirm and finish typing overlay text
  const finishTextInput = () => {
    if (!editingText) return;
    
    const trimmedVal = editingText.value.trim();
    if (trimmedVal !== '') {
      const newTextElement = {
        id: editingText.id,
        type: 'text',
        x: editingText.x,
        y: editingText.y,
        text: trimmedVal,
        fontSize: fontSize,
        color: activeColor
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
  }, [elements, selectedElement, activeTool, undoStack, redoStack, editingText]);

  // Handle uploading locally stored image files
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    loadImageFile(file);
  };

  const loadImageFile = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Place in the center of current viewport
        const canvas = canvasRef.current;
        const viewportCenterX = (-pan.x + canvas.width / 2) / zoom;
        const viewportCenterY = (-pan.y + canvas.height / 2) / zoom;
        
        // Scale default size to look good
        const maxW = 350;
        const ratio = img.width / img.height;
        const w = Math.min(maxW, img.width);
        const h = w / ratio;

        // Cache image object locally
        imageCache.current[event.target.result] = img;

        const imgElement = {
          id: Date.now().toString(),
          type: 'image',
          src: event.target.result,
          x: viewportCenterX - w / 2,
          y: viewportCenterY - h / 2,
          width: w,
          height: h
        };
        pushToHistory([...elements, imgElement]);
        setActiveTool('select');
        setSelectedElement(imgElement);
      };
      img.src = event.target.result;
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

        // Pre-cache the rendered image
        const imgObj = new Image();
        imgObj.src = dataUrl;
        imageCache.current[dataUrl] = imgObj;

        // Position slide image at center of canvas coordinate space
        const slideImageElement = {
          id: `pdf-slide-${Date.now()}-${pageNum}`,
          type: 'image',
          src: dataUrl,
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

      // Broadcast the newly imported PDF deck to all participants
      if (isCollaborating && isHost && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'page-change',
          payload: {
            pages: newSlidePages,
            pageIndex: 0
          }
        });
      }

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
    const renderElement = (el) => {
      if (!el) return;
      ctx.strokeStyle = el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.type === 'stroke') {
        const pts = el.points;
        if (pts.length < 2) return;
        
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
        const img = imageCache.current[el.src];
        if (img) {
          ctx.drawImage(img, el.x, el.y, el.width, el.height);
        } else {
          // Preload image if not cached
          const preImg = new Image();
          preImg.onload = () => {
            imageCache.current[el.src] = preImg;
            drawCanvas(); // Trigger redraw
          };
          preImg.src = el.src;
          // Temp outline
          ctx.strokeStyle = '#6366f1';
          ctx.strokeRect(el.x, el.y, el.width, el.height);
          ctx.font = '12px Inter';
          ctx.fillText('Loading image...', el.x + 10, el.y + 20);
        }
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
          minY = el.y - el.fontSize * 0.1;
          w = el.text.length * (el.fontSize * 0.55);
          h = el.fontSize * 1.1;
        } else if (el.type === 'shape') {
          minX = Math.min(el.x1, el.x2);
          minY = Math.min(el.y1, el.y2);
          w = Math.abs(el.x2 - el.x1);
          h = Math.abs(el.y2 - el.y1);
        } else if (el.type === 'stroke') {
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
      if (el.type === 'stroke') {
        el.points.forEach(p => {
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
        const estWidth = el.text.length * (el.fontSize * 0.6);
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y - el.fontSize);
        maxX = Math.max(maxX, el.x + estWidth);
        maxY = Math.max(maxY, el.y + el.fontSize * 0.5);
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

    if (width <= 0 || height <= 0) return;

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
      tempCtx.strokeStyle = el.color;
      tempCtx.fillStyle = el.color;
      tempCtx.lineWidth = el.width;
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';

      if (el.type === 'stroke') {
        const pts = el.points;
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
        if (img) {
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
    link.href = tempCanvas.toDataURL('image/png');
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
      minY = el.y - el.fontSize * 0.1;
      w = el.text.length * (el.fontSize * 0.55);
      h = el.fontSize * 1.1;
    } else if (el.type === 'shape') {
      minX = Math.min(el.x1, el.x2);
      minY = Math.min(el.y1, el.y2);
      w = Math.abs(el.x2 - el.x1);
      h = Math.abs(el.y2 - el.y1);
    } else if (el.type === 'stroke') {
      const xs = el.points.map(p => p.x);
      const ys = el.points.map(p => p.y);
      minX = Math.min(...xs);
      minY = Math.min(...ys);
      w = Math.max(...xs) - minX;
      h = Math.max(...ys) - minY;
    }

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
                fontSize: fontSize * zoom + 'px',
                color: activeColor,
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
        channelRef={channelRef}
        setParticipants={setParticipants}
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
// Harmless comment to trigger IDE diagnostics refresh


