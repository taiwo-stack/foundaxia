import React from 'react';
import { ChevronRight, Copy, Mic, MicOff } from 'lucide-react';

export default function CollaborationSidebar({
  isCollaborating,
  showCollabSidebar,
  setShowCollabSidebar,
  roomId,
  copyShareLink,
  participants,
  localUserId,
  isHost,
  onLowerHand,
  toggleParticipantDrawAccess
}) {
  if (!isCollaborating || !showCollabSidebar) return null;

  return (
    <div className="whiteboard-collab-sidebar">
      <div className="collab-sidebar-header">
        <span style={{ fontWeight: 600 }}>Active Classroom</span>
        <button className="whiteboard-btn-icon" onClick={() => setShowCollabSidebar(false)}>
          <ChevronRight size={18} />
        </button>
      </div>
      
      <div className="collab-sidebar-share">
        <span className="prop-title" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '8px' }}>INVITE OTHERS</span>
        <div className="share-link-box">
          <input 
            type="text" 
            readOnly 
            value={`${window.location.origin}${window.location.pathname}?room=${roomId}`}
            className="share-link-input"
          />
          <button className="whiteboard-btn-icon" onClick={copyShareLink} title="Copy link">
            <Copy size={16} />
          </button>
        </div>
      </div>

      <div className="collab-participants-list">
        <span className="prop-title" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '8px' }}>PARTICIPANTS ({Object.keys(participants).length})</span>
        <div className="participants-scroll-area">
          {Object.values(participants).map(peer => {
            const isPeerHost = peer.isHost;
            const hasPeerAccess = peer.hasDrawAccess;
            const isLocal = peer.userId === localUserId;
            const initials = peer.userName ? peer.userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';
            
            return (
              <div key={peer.userId} className="participant-card">
                <div className="participant-avatar" style={{ backgroundColor: peer.color || '#6366f1', position: 'relative' }}>
                  {initials}
                  {peer.handRaised && (
                    <div style={{
                      position: 'absolute',
                      bottom: '-4px',
                      right: '-4px',
                      background: '#f59e0b',
                      color: '#fff',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.65rem',
                      border: '1.5px solid #1e1e24',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                    }} title="Hand Raised">
                      ✋
                    </div>
                  )}
                </div>
                
                <div className="participant-info">
                  <span className="participant-name">{peer.userName} {isLocal && '(You)'}</span>
                  <span className="participant-role">{isPeerHost ? '👑 Host / Tutor' : 'Student'}</span>
                </div>
                
                <div className="participant-actions">
                  <span className={`participant-mic-status ${peer.isMicOn ? 'active' : ''}`} title={peer.isMicOn ? 'Microphone Active' : 'Muted'}>
                    {peer.isMicOn ? <Mic size={14} style={{ color: '#10b981' }} /> : <MicOff size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />}
                  </span>

                  {!isPeerHost && isHost && peer.handRaised && (
                    <button 
                      onClick={() => onLowerHand(peer.userId)}
                      style={{
                        background: 'rgba(245, 158, 11, 0.2)',
                        border: '1px solid rgba(245, 158, 11, 0.5)',
                        color: '#fbbf24',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        marginRight: '5px',
                        transition: 'all 0.2s'
                      }}
                      title="Lower hand"
                    >
                      Lower Hand
                    </button>
                  )}

                  {!isPeerHost && isHost && (
                    <button 
                      className={`draw-access-badge ${hasPeerAccess ? 'granted' : 'locked'}`}
                      onClick={() => toggleParticipantDrawAccess(peer.userId, hasPeerAccess)}
                      title={hasPeerAccess ? "Click to revoke drawing access" : "Click to grant drawing access"}
                      style={{
                        background: hasPeerAccess ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                        border: `1px solid ${hasPeerAccess ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.4)'}`,
                        color: hasPeerAccess ? '#6ee7b7' : '#fca5a5',
                        borderRadius: '6px',
                        padding: '4px 9px',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {hasPeerAccess ? '✏️ Can Draw' : '🔒 Locked'}
                    </button>
                  )}
                  {!isPeerHost && !isHost && (
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: '600',
                      color: hasPeerAccess ? '#6ee7b7' : 'rgba(255,255,255,0.3)',
                      padding: '3px 8px',
                      borderRadius: '5px',
                      background: hasPeerAccess ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${hasPeerAccess ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`
                    }}>
                      {hasPeerAccess ? '✏️ Drawing' : '🔒 Watching'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
