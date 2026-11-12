import React from 'react';
import { isPowerPointMaterial } from '../../utils/slideMaterials';
import {
  ChevronLeft,
  Undo2,
  Redo2,
  Download,
  FileDown,
  MonitorPlay,
  Trash2,
  Share2,
  Users,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Hand,
  ChevronUp,
  Presentation,
  MousePointerClick,
  Pencil,
  PhoneOff
} from 'lucide-react';

export default function WhiteboardHeader({
  isHeaderCollapsed,
  setIsHeaderCollapsed,
  navigate,
  undoStack,
  redoStack,
  handleUndo,
  handleRedo,
  isCollaborating,
  hasDrawAccess,
  isHost,
  elements,
  handleExport,
  handleExportPdf,
  isExportingPdf,
  pageCount,
  isProcessingPdf,
  pdfProgress,
  pdfInputRef,
  setShowClearModal,
  initiateRoomCollab,
  showCollabSidebar,
  setShowCollabSidebar,
  participants,
  isMicOn,
  toggleMicrophone,
  micLevel,
  isVideoOn,
  toggleCamera,
  showVideoGrid,
  setShowVideoGrid,
  showParticipantStrip,
  setShowParticipantStrip,
  isHandRaised,
  toggleRaiseHand,
  slideMaterials,
  currentSlideUrl,
  showSlidePicker,
  setShowSlidePicker,
  attachSlideToCurrentPage,
  clearSlideFromCurrentPage,
  isSlideInteractive,
  setIsSlideInteractive,
  handleEndSession
}) {
  return (
    <header className={`whiteboard-header ${isHeaderCollapsed ? 'collapsed' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <button className="whiteboard-btn-icon" onClick={() => navigate(-1)} data-tooltip="Go Back">
          <ChevronLeft size={20} />
        </button>
        
        <div className="whiteboard-logo-container" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img src="/images/logo_icon.png" alt="Foundaxia Logo" className="whiteboard-logo-icon" />
          <img src="/images/logo_text.png" alt="Foundaxia Text" className="whiteboard-logo-text" />
        </div>
      </div>

      {/* Undo/Redo & Save Buttons */}
      <div className="whiteboard-top-controls">
        <button 
          className="whiteboard-btn-icon" 
          onClick={handleUndo} 
          disabled={undoStack.length === 0 || (isCollaborating && !hasDrawAccess)}
          data-tooltip="Undo (Ctrl+Z)"
        >
          <Undo2 size={18} />
        </button>
        <button 
          className="whiteboard-btn-icon" 
          onClick={handleRedo} 
          disabled={redoStack.length === 0 || (isCollaborating && !hasDrawAccess)}
          data-tooltip="Redo (Ctrl+Y)"
        >
          <Redo2 size={18} />
        </button>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 5px' }} />

        <button 
          className="whiteboard-btn primary" 
          onClick={handleExport}
          disabled={elements.length === 0}
          data-tooltip="Export classroom notes"
        >
          <Download size={16} />
          <span>Export Board</span>
        </button>

        {handleExportPdf && (
          <button
            className="whiteboard-btn"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            data-tooltip="Download every page of the board as one PDF"
          >
            <FileDown size={16} />
            <span>{isExportingPdf ? 'Making PDF…' : `PDF (${pageCount || 1} page${pageCount === 1 ? '' : 's'})`}</span>
          </button>
        )}

        {/* PDF / Presentation Upload — Host only */}
        {isHost && (
          <button
            className="whiteboard-btn"
            style={{
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#34d399',
              borderColor: 'rgba(16, 185, 129, 0.3)',
              opacity: isProcessingPdf ? 0.6 : 1,
              cursor: isProcessingPdf ? 'not-allowed' : 'pointer'
            }}
            onClick={() => !isProcessingPdf && pdfInputRef.current?.click()}
            data-tooltip="Upload a PDF presentation and sync to all students"
            disabled={isProcessingPdf}
          >
            <MonitorPlay size={16} />
            <span>{isProcessingPdf ? `Importing ${pdfProgress.current}/${pdfProgress.total}…` : 'Upload Deck'}</span>
          </button>
        )}

        {/* HTML Teaching Slide — Host only */}
        {isHost && (
          <div style={{ position: 'relative' }}>
            <button
              className="whiteboard-btn"
              style={{
                background: currentSlideUrl ? 'rgba(129, 140, 248, 0.18)' : 'rgba(129, 140, 248, 0.12)',
                color: '#818cf8',
                borderColor: 'rgba(129, 140, 248, 0.3)'
              }}
              onClick={() => setShowSlidePicker(prev => !prev)}
              data-tooltip="Attach an HTML slide or PowerPoint to this page"
            >
              <Presentation size={16} />
              <span>{currentSlideUrl ? 'Change Slide' : 'Attach Slide'}</span>
            </button>

            {showSlidePicker && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
                background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px',
                padding: '0.5rem', minWidth: '220px', maxHeight: '260px', overflowY: 'auto',
                boxShadow: '0 12px 30px rgba(0,0,0,0.4)'
              }}>
                {slideMaterials.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.78rem', padding: '0.5rem' }}>
                    No slides uploaded yet. Upload an HTML slide or a PowerPoint from your Course Materials first.
                  </div>
                ) : (
                  slideMaterials.map(m => (
                    <button
                      key={m.id}
                      onClick={() => attachSlideToCurrentPage(m)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                        color: '#e2e8f0', padding: '0.5rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {isPowerPointMaterial(m) ? '📊' : '🖥️'} {m.title}
                    </button>
                  ))
                )}
                {currentSlideUrl && (
                  <button
                    onClick={clearSlideFromCurrentPage}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                      borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '0.3rem', paddingTop: '0.6rem',
                      color: '#fca5a5', padding: '0.5rem 0.6rem', cursor: 'pointer', fontSize: '0.82rem'
                    }}
                  >
                    ✕ Remove slide from this page
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Draw vs Interact-with-slide toggle — only meaningful once a slide is attached */}
        {currentSlideUrl && (
          <button
            className="whiteboard-btn"
            style={{
              background: isSlideInteractive ? 'rgba(52, 211, 153, 0.18)' : 'rgba(255,255,255,0.06)',
              color: isSlideInteractive ? '#34d399' : '#cbd5e1'
            }}
            onClick={() => setIsSlideInteractive(prev => !prev)}
            data-tooltip={isSlideInteractive ? 'Clicks go to the slide — switch back to drawing' : 'Clicks draw on the canvas — switch to click the slide itself'}
          >
            {isSlideInteractive ? <MousePointerClick size={16} /> : <Pencil size={16} />}
            <span>{isSlideInteractive ? 'Interacting' : 'Drawing'}</span>
          </button>
        )}

        <button
          className="whiteboard-btn danger" 
          onClick={() => setShowClearModal(true)}
          disabled={elements.length === 0 || (isCollaborating && !isHost)}
          data-tooltip={isHost ? "Wipe canvas board" : "Only the tutor can clear the board"}
        >
          <Trash2 size={16} />
          <span>Clear</span>
        </button>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 5px' }} />

        {!isCollaborating ? (
          <button 
            className="whiteboard-btn" 
            style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', borderColor: 'rgba(99, 102, 241, 0.3)' }}
            onClick={initiateRoomCollab}
            data-tooltip="Invite students to collaborate"
          >
            <Share2 size={16} />
            <span>Invite / Collaborate</span>
          </button>
        ) : (
          <>
            <button 
              className={`whiteboard-btn ${showCollabSidebar ? 'primary' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={() => setShowCollabSidebar(prev => !prev)}
              data-tooltip="View online participants"
            >
              <Users size={16} />
              <span>Classroom ({Object.keys(participants).length})</span>
            </button>

            {/* Mic button with audio level ring */}
            <div className="mic-level-wrapper" data-tooltip={isMicOn ? "Mute Microphone" : "Unmute Microphone"}>
              {isMicOn && (
                <svg className="mic-level-ring" viewBox="0 0 44 44" width="44" height="44">
                  <circle
                    cx="22" cy="22" r="19"
                    fill="none"
                    stroke="rgba(52,211,153,0.25)"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="22" cy="22" r="19"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2.5"
                    strokeDasharray={`${(micLevel / 100) * 119.4} 119.4`}
                    strokeLinecap="round"
                    transform="rotate(-90 22 22)"
                    style={{ transition: 'stroke-dasharray 0.05s linear' }}
                  />
                </svg>
              )}
              <button 
                className={`whiteboard-btn-icon ${isMicOn ? 'active' : ''}`} 
                style={{ 
                  background: isMicOn ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: isMicOn ? '#34d399' : '#f87171',
                  borderColor: isMicOn ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px'
                }}
                onClick={toggleMicrophone}
              >
                {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
              </button>
            </div>

            <button
              className={`whiteboard-btn-icon ${isVideoOn ? 'active' : ''}`}
              style={{
                background: isVideoOn ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isVideoOn ? '#34d399' : '#f87171',
                borderColor: isVideoOn ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                width: '38px',
                height: '38px',
                borderRadius: '10px'
              }}
              onClick={toggleCamera}
              data-tooltip={isVideoOn ? "Turn Camera Off" : "Turn Camera On"}
            >
              {isVideoOn ? <Video size={18} /> : <VideoOff size={18} />}
            </button>

            <button
              className="whiteboard-btn-icon"
              style={{
                background: showVideoGrid ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                color: showVideoGrid ? '#818cf8' : 'rgba(255,255,255,0.5)',
                borderColor: showVideoGrid ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255,255,255,0.1)',
                width: '38px',
                height: '38px',
                borderRadius: '10px'
              }}
              onClick={() => setShowVideoGrid(prev => !prev)}
              data-tooltip={showVideoGrid ? "Hide Video Grid" : "Show Video Grid"}
            >
              <MonitorPlay size={18} />
            </button>

            <button
              className="whiteboard-btn-icon"
              style={{
                background: showParticipantStrip ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
                color: showParticipantStrip ? '#818cf8' : 'rgba(255,255,255,0.5)',
                borderColor: showParticipantStrip ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255,255,255,0.1)',
                width: '38px',
                height: '38px',
                borderRadius: '10px'
              }}
              onClick={() => setShowParticipantStrip(prev => !prev)}
              data-tooltip={showParticipantStrip ? "Hide Participant Strip" : "Show Participant Strip"}
            >
              <Users size={18} />
            </button>

            {!isHost && (
              <button
                className="whiteboard-btn-icon"
                style={{
                  background: isHandRaised ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255,255,255,0.05)',
                  color: isHandRaised ? '#fbbf24' : 'rgba(255,255,255,0.5)',
                  borderColor: isHandRaised ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255,255,255,0.1)',
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px'
                }}
                onClick={toggleRaiseHand}
                data-tooltip={isHandRaised ? "Lower Hand" : "Raise Hand"}
              >
                <Hand size={18} style={isHandRaised ? { transform: 'scale(1.15)', transition: 'all 0.2s' } : {}} />
              </button>
            )}
          </>
        )}

        {isHost && (
          <button
            className="whiteboard-btn danger"
            onClick={handleEndSession}
            data-tooltip="End this session for everyone and remove the join link from students' dashboards"
          >
            <PhoneOff size={16} />
            <span>End Session</span>
          </button>
        )}

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 5px' }} />

        <button
          className="whiteboard-btn-icon"
          onClick={() => setIsHeaderCollapsed(true)}
          data-tooltip="Collapse Header"
        >
          <ChevronUp size={18} />
        </button>
      </div>
    </header>
  );
}
