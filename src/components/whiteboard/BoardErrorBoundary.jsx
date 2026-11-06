import React from 'react';

// Catches render-time crashes inside the whiteboard (e.g. a malformed element that
// slipped past validation) so the user gets a recoverable screen instead of a blank
// page. Unmounting the crashed board also runs its cleanup (realtime channels,
// peer connections, media tracks), so "Reload board" starts from a clean slate.
export default class BoardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Whiteboard crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '14px',
        background: '#121214', color: '#e2e8f0', fontFamily: 'Inter, sans-serif', padding: '24px', textAlign: 'center'
      }}>
        <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>The whiteboard hit an unexpected error.</div>
        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', maxWidth: '460px' }}>
          Your session link still works. Reload to reconnect and resync the board from the tutor.
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: '#6366f1', color: '#fff', border: 'none', borderRadius: '10px',
            padding: '10px 20px', fontWeight: 600, cursor: 'pointer'
          }}
        >
          Reload board
        </button>
      </div>
    );
  }
}
