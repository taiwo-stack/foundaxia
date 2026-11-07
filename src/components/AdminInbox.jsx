import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, Send, Plus, MessageSquare } from 'lucide-react';
import { sendChatMessage, markMessagesRead } from '../services/dataService';
import { personIds, isOneOf, inThread } from '../utils/chatIds';

// Admin inbox: conversations between students and the school office (any admin account).
// Students reach it through the "FoundaXia Admin" contact in their Messages.

const fmtTime = (v) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

export default function AdminInbox({ user, adminIds, students, messages, setMessages }) {
  const [activeId, setActiveId] = useState(null); // student row id
  const [mobileView, setMobileView] = useState('list');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [picking, setPicking] = useState(false);
  const scrollRef = useRef(null);

  const admins = useMemo(() => personIds(user?.id, ...(adminIds || [])), [user?.id, adminIds]);
  const studentOf = useMemo(() => {
    const map = new Map();
    students.forEach(s => { if (s.id) map.set(String(s.id), s); if (s.profile_id) map.set(String(s.profile_id), s); });
    return map;
  }, [students]);

  // One conversation per student who has written to / been written to by an admin.
  const conversations = useMemo(() => {
    const byStudent = new Map();
    messages.forEach(m => {
      let other = null;
      if (isOneOf(m.sender_id, admins)) other = studentOf.get(String(m.receiver_id));
      else if (isOneOf(m.receiver_id, admins)) other = studentOf.get(String(m.sender_id));
      if (!other) return;
      const c = byStudent.get(other.id) || { student: other, last: null, unread: 0 };
      if (!c.last || new Date(m.created_at) > new Date(c.last.created_at)) c.last = m;
      if (isOneOf(m.receiver_id, admins) && !m.read) c.unread += 1;
      byStudent.set(other.id, c);
    });
    return [...byStudent.values()].sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
  }, [messages, admins, studentOf]);

  const active = activeId ? students.find(s => s.id === activeId) : null;
  const thread = useMemo(
    () => (active ? messages.filter(m => inThread(m, admins, personIds(active))) : []),
    [active, messages, admins]
  );

  // Mark the student's messages read when the conversation is open.
  useEffect(() => {
    if (!active) return;
    const unread = thread.filter(m => isOneOf(m.receiver_id, admins) && !m.read).map(m => m.id);
    if (unread.length === 0) return;
    markMessagesRead(unread)
      .then(() => setMessages(prev => prev.map(m => unread.includes(m.id) ? { ...m, read: true } : m)))
      .catch(err => console.error('Could not mark messages read:', err));
  }, [active, thread, admins, setMessages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeId, thread.length]);

  const open = (studentId) => { setActiveId(studentId); setMobileView('chat'); setPicking(false); };

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !active || sending) return;
    setSending(true);
    try {
      const saved = await sendChatMessage({
        course_id: null,
        sender_id: user.id,
        sender_name: 'FoundaXia Admin',
        receiver_id: active.profile_id || active.id,
        message_text: text.trim()
      });
      setMessages(prev => [...prev, saved]);
      setText('');
    } catch (err) {
      alert('Failed to send message: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  // Only students with a login can receive messages (receiver must be a real account).
  const messageable = students
    .filter(s => s.is_active !== false && s.status !== 'pending')
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  return (
    <div className="whatsapp-chat-container">
      <div className={`whatsapp-contacts-sidebar ${active && mobileView === 'chat' ? 'mobile-hidden' : ''}`}>
        <div className="whatsapp-sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <h3>Student Messages</h3>
          <button type="button" className="btn-action edit" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => setPicking(p => !p)}>
            <Plus size={14} /> New
          </button>
        </div>

        {picking && (
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e9edef' }}>
            <select
              defaultValue=""
              onChange={(e) => e.target.value && open(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', border: '1.5px solid #e2e8f0', fontFamily: 'inherit' }}
            >
              <option value="">Message a student…</option>
              {messageable.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
        )}

        <ul className="whatsapp-contacts-list">
          {conversations.map(({ student, last, unread }) => (
            <li key={student.id} className={`whatsapp-contact-item ${activeId === student.id ? 'active' : ''}`} onClick={() => open(student.id)}>
              <div className="whatsapp-avatar">
                {student.avatar_url ? <img src={student.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (student.full_name || 'S')[0]}
              </div>
              <div className="whatsapp-contact-info">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="whatsapp-contact-name">{student.full_name}</div>
                  {unread > 0
                    ? <span className="st-unread-dot">{unread}</span>
                    : <span style={{ fontSize: '0.7rem', color: '#8696a0' }}>{fmtTime(last.created_at)}</span>}
                </div>
                <div className="whatsapp-contact-status" style={unread > 0 ? { fontWeight: 700, color: '#111b21' } : undefined}>
                  {isOneOf(last.sender_id, admins) ? 'You: ' : ''}{last.message_text}
                </div>
              </div>
            </li>
          ))}
          {conversations.length === 0 && (
            <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: '#8696a0', fontSize: '0.88rem', lineHeight: 1.5 }}>
              <strong style={{ display: 'block', color: '#4a5568', marginBottom: '0.3rem' }}>No messages yet</strong>
              When a student messages FoundaXia Admin it appears here. Use <b>New</b> to message a student first.
            </div>
          )}
        </ul>
      </div>

      <div className={`whatsapp-chat-window ${!active || mobileView === 'list' ? 'mobile-hidden' : ''}`}>
        {active ? (
          <>
            <div className="whatsapp-chat-header">
              <div className="whatsapp-header-user">
                <button className="whatsapp-header-back-btn" onClick={() => setMobileView('list')}><ChevronLeft size={20} /></button>
                <div className="whatsapp-avatar" style={{ width: '40px', height: '40px', fontSize: '0.95rem' }}>{(active.full_name || 'S')[0]}</div>
                <div className="whatsapp-header-details">
                  <div className="whatsapp-header-name">{active.full_name}</div>
                  <div className="whatsapp-header-status">{[active.grade_level, active.email].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
            </div>
            <div className="whatsapp-messages-container" ref={scrollRef}>
              {thread.length === 0 && (
                <div style={{ textAlign: 'center', color: '#8696a0', fontSize: '0.85rem', margin: 'auto' }}>No messages yet. Say hello to {active.full_name?.split(' ')[0]}.</div>
              )}
              {thread.map(m => {
                const mine = isOneOf(m.sender_id, admins);
                return (
                  <div key={m.id} className={`whatsapp-bubble ${mine ? 'sent' : 'received'}`}>
                    <div style={{ fontSize: '0.88rem', color: '#111b21', whiteSpace: 'pre-wrap' }}>{m.message_text}</div>
                    <div className="whatsapp-bubble-time">{fmtTime(m.created_at)}{mine && <span className="whatsapp-bubble-checks"> {m.read ? '✓✓' : '✓'}</span>}</div>
                  </div>
                );
              })}
            </div>
            <form onSubmit={send} className="whatsapp-input-bar">
              <input className="whatsapp-input-field" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply to ${active.full_name?.split(' ')[0] || 'student'}`} required />
              <button type="submit" className="whatsapp-send-btn" disabled={sending}><Send size={16} /></button>
            </form>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8696a0', padding: '2rem', textAlign: 'center' }}>
            <MessageSquare size={46} style={{ marginBottom: '0.75rem' }} />
            <h3 style={{ color: '#54656f', fontSize: '1.15rem', margin: '0 0 0.4rem', fontFamily: 'var(--font-heading)' }}>Student Messages</h3>
            <p style={{ fontSize: '0.88rem', maxWidth: '320px', margin: 0, lineHeight: 1.5 }}>Pick a conversation to read and reply. Students see your replies under FoundaXia Admin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
