import React, { useState, useEffect, useCallback } from 'react';
import { X, Send, MessageSquareQuote } from 'lucide-react';
import { parentApi } from '../services/dataService';
import '../styles/ParentArea.css';

// Tutor: write a private note to a student's parents. Parents read it in the Parent Area
// (behind the parent code); the student never sees it.

const fmtDate = (v) => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const MAX = 2000;

export default function ParentNoteModal({ student, courseOptions = [], currentUserId, onClose }) {
  const [text, setText] = useState('');
  const [courseId, setCourseId] = useState(courseOptions[0]?.id || '');
  const [notes, setNotes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await parentApi('tutor-list-notes', { studentId: student.id });
      setNotes(r.notes || []);
    } catch (err) {
      setNotes([]);
      setError(err.message);
    }
  }, [student.id]);

  useEffect(() => { load(); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setError('');
    setSent(false);
    try {
      await parentApi('tutor-add-note', { studentId: student.id, note: text.trim(), courseId: courseId || null });
      setText('');
      setSent(true);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (note) => {
    if (!window.confirm('Delete this note? Parents will no longer see it.')) return;
    try {
      await parentApi('tutor-delete-note', { noteId: note.id });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const courseTitle = (id) => courseOptions.find(c => c.id === id)?.title;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquareQuote size={20} /> Note to {student.full_name}'s parents
        </h3>

        {error && <div className="pa-alert pa-alert-err" style={{ marginBottom: '0.75rem' }}>{error}</div>}
        {sent && <div className="pa-alert pa-alert-ok" style={{ marginBottom: '0.75rem' }}>Sent. Parents will see it in their Parent Area.</div>}

        <form onSubmit={send} className="tn-form">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX))}
            placeholder={`e.g. ${student.full_name?.split(' ')[0] || 'Your child'} did really well with fractions this week. Practising times tables at home for 10 minutes a day would help a lot.`}
            required
          />
          <div className="tn-form-row">
            {courseOptions.length > 0 ? (
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Class">
                <option value="">General</option>
                {courseOptions.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            ) : <span />}
            <button type="submit" className="pa-btn-primary" disabled={busy || !text.trim()}>
              <Send size={15} /> {busy ? 'Sending...' : 'Send to parents'}
            </button>
          </div>
          <p className="tn-hint">Only the parents see this, in the Parent Area. The student can't. {text.length}/{MAX}</p>
        </form>

        <div className="tn-history">
          <h4>Previous notes</h4>
          {notes === null ? <p className="pa-muted">Loading...</p> : notes.length === 0 ? <p className="pa-muted">No notes yet.</p> : (
            <ul className="pi-notes">
              {notes.map(n => (
                <li key={n.id}>
                  <div className="pi-note-head">
                    <strong>{n.author_name || 'Tutor'}</strong>
                    <span>
                      {courseTitle(n.course_id) ? `${courseTitle(n.course_id)} · ` : ''}{fmtDate(n.created_at)}
                      {String(n.author_id) === String(currentUserId) && (
                        <> · <button type="button" className="tn-del" onClick={() => remove(n)}>Delete</button></>
                      )}
                    </span>
                  </div>
                  <p>{n.note}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
