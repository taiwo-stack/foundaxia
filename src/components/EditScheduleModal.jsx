import React, { useState } from 'react';
import { X } from 'lucide-react';
import { updateSchedule } from '../services/dataService';
import {
  zoneOptions, zonedToUtc, utcToZonedInput, recallStudentZone, rememberStudentZone,
  viewerTimeZone, fmtInViewerZone, tzAbbr
} from '../utils/timeZone';

// Time zone dropdown for class forms. Shows what the chosen time is in the viewer's own clock.
export const TimeZoneSelect = ({ value, onChange, previewDate, style }) => {
  const mine = viewerTimeZone();
  const showPreview = value !== mine && previewDate && !isNaN(previewDate);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', ...style }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Time zone for the class times"
        style={{ padding: '0.55rem 0.7rem', borderRadius: 10, border: '2px solid #e2e8f0', fontFamily: 'inherit', fontSize: '0.88rem', background: '#fff' }}>
        {zoneOptions().map(z => (
          <option key={z.tz} value={z.tz}>{z.label} ({tzAbbr(previewDate && !isNaN(previewDate) ? previewDate : new Date(), z.tz)}){z.tz === mine ? ' · your time' : ''}</option>
        ))}
      </select>
      {showPreview && (
        <span style={{ fontSize: '0.76rem', color: '#2b6cb0' }}>= {fmtInViewerZone(previewDate)} for you</span>
      )}
    </div>
  );
};

// Edit one class. Times can be typed in any time zone (e.g. the student's UK time).
const EditScheduleModal = ({ schedule, studentName, onClose, onSaved }) => {
  const [zone, setZone] = useState(() => recallStudentZone(schedule.student_id));
  const [title, setTitle] = useState(schedule.title || '');
  const [start, setStart] = useState(() => schedule.start_time ? utcToZonedInput(schedule.start_time, zone) : '');
  const [end, setEnd] = useState(() => schedule.end_time ? utcToZonedInput(schedule.end_time, zone) : '');
  const [link, setLink] = useState(schedule.meeting_link || '');
  const [link2, setLink2] = useState(schedule.meeting_link_2 || '');
  const [saving, setSaving] = useState(false);

  // Switching zone keeps the same moment and re-shows it in the new zone's clock.
  const changeZone = (tz) => {
    if (start) setStart(utcToZonedInput(zonedToUtc(start, zone), tz));
    if (end) setEnd(utcToZonedInput(zonedToUtc(end, zone), tz));
    setZone(tz);
  };

  const startDate = start ? zonedToUtc(start, zone) : null;
  const endDate = end ? zonedToUtc(end, zone) : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!startDate || isNaN(startDate)) return alert('Start time is required.');
    if (endDate && endDate <= startDate) return alert('End time must be after the start time.');
    setSaving(true);
    try {
      const updated = await updateSchedule(schedule.id, {
        title,
        start_time: startDate.toISOString(),
        end_time: endDate ? endDate.toISOString() : null,
        meeting_link: link || null,
        meeting_link_2: link2 || null
      });
      rememberStudentZone(schedule.student_id, zone);
      onSaved(updated || { ...schedule, title, start_time: startDate.toISOString(), end_time: endDate ? endDate.toISOString() : null, meeting_link: link || null, meeting_link_2: link2 || null });
      alert('Class schedule updated!');
    } catch (err) {
      alert('Error updating schedule: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}><X size={20} /></button>
        <h3 className="modal-title">Edit Class Schedule</h3>
        {studentName && <p style={{ margin: '-0.5rem 0 1rem', color: '#4a5568', fontSize: '0.88rem' }}>Student: <strong>{studentName}</strong></p>}
        <form onSubmit={submit}>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label>Class Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label>Time zone for these times</label>
            <TimeZoneSelect value={zone} onChange={changeZone} previewDate={startDate} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label>Start Time *</label>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>End Time</label>
              <input type="datetime-local" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label>Meeting Join Link - First Session</label>
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://zoom.us/j/..." />
          </div>
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label>Meeting Join Link - Second Session (optional)</label>
            <input type="url" value={link2} onChange={(e) => setLink2(e.target.value)} placeholder="https://zoom.us/j/..." />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn-prev" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditScheduleModal;
