import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createBooking } from '../services/dataService';
import { withRequestedSubject } from '../utils/booking';
import '../styles/BookingForm.css';

// The "Book Meeting" consultation form. Shared by the landing page hero card and the
// student dashboard's Consultations tab so both always ask for the same details.

const allTimeZones = (() => {
  try {
    if (typeof Intl !== 'undefined' && Intl.supportedValuesOf) {
      return Intl.supportedValuesOf('timeZone');
    }
  } catch {
    console.warn('Intl.supportedValuesOf not supported in this environment');
  }
  return [
    'Africa/Lagos', 'Africa/Cairo', 'Africa/Johannesburg',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
    'Australia/Sydney', 'Europe/London', 'Europe/Paris', 'Europe/Moscow', 'UTC'
  ];
})();

const tzOptions = allTimeZones.map(tz => {
  try {
    const date = new Date();
    // Offset format: "GMT+1"
    const offsetParts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(date);
    const offsetVal = offsetParts.find(p => p.type === 'timeZoneName')?.value || '';
    // Abbreviation format: "WAT"
    const abbrParts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(date);
    const abbrVal = abbrParts.find(p => p.type === 'timeZoneName')?.value || '';

    let label = tz.replace(/_/g, ' ');
    if (abbrVal && offsetVal) {
      label = abbrVal !== offsetVal ? `${label} (${abbrVal}, ${offsetVal})` : `${label} (${offsetVal})`;
    } else if (offsetVal) {
      label = `${label} (${offsetVal})`;
    }
    return { value: tz, label };
  } catch {
    return { value: tz, label: tz.replace(/_/g, ' ') };
  }
});

const TIME_SLOTS = ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'];

const getDefaultTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Lagos';

// Today's date in the visitor's local timezone, formatted YYYY-MM-DD (matches <input type="date">)
const getLocalDateString = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const makeForm = (prefill = {}) => ({
  bookingStudentName: prefill.studentName || '',
  bookingParentName: prefill.parentName || '',
  bookingPhone: prefill.phone || '',
  bookingEmail: prefill.email || '',
  meetingType: 'virtual',
  bookingDate: '',
  bookingTime: '',
  bookingMessage: '',
  bookingTimezone: getDefaultTimezone()
});

/**
 * props:
 *  - variant: 'dark' (landing hero card) | 'light' (dashboard card)
 *  - prefill: { studentName, parentName, phone, email } initial values
 *  - lockedFields: field names (e.g. ['bookingEmail']) shown read-only
 *  - requestedSubject: subject picked on the /subjects page, prepended to the message
 *  - onBooked(booking): called after a successful booking
 */
export default function BookingForm({ variant = 'dark', prefill, lockedFields = [], requestedSubject = null, onBooked }) {
  const [form, setForm] = useState(() => makeForm(prefill));
  const [isBooking, setIsBooking] = useState(false);
  const [success, setSuccess] = useState(false);

  // Prefill can arrive after mount (dashboard loads the student asynchronously).
  const prefillKey = prefill ? `${prefill.studentName}|${prefill.parentName}|${prefill.phone}|${prefill.email}` : '';
  useEffect(() => {
    if (!prefill) return;
    setForm(prev => ({
      ...prev,
      bookingStudentName: prev.bookingStudentName || prefill.studentName || '',
      bookingParentName: prev.bookingParentName || prefill.parentName || '',
      bookingPhone: prev.bookingPhone || prefill.phone || '',
      bookingEmail: lockedFields.includes('bookingEmail') ? (prefill.email || '') : (prev.bookingEmail || prefill.email || '')
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey]);

  // Searchable timezone dropdown
  const [tzSearch, setTzSearch] = useState('');
  const [tzOpen, setTzOpen] = useState(false);
  const [tzRect, setTzRect] = useState(null);
  const tzDropdownRef = useRef(null);
  const tzPanelRef = useRef(null); // the portalled panel lives outside tzDropdownRef in the DOM
  const tzTriggerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      const inTrigger = tzDropdownRef.current && tzDropdownRef.current.contains(e.target);
      const inPanel = tzPanelRef.current && tzPanelRef.current.contains(e.target);
      if (!inTrigger && !inPanel) setTzOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // A fixed-position panel drifts away from its trigger when the page scrolls; close it.
  useEffect(() => {
    if (!tzOpen) return undefined;
    const close = (e) => {
      if (tzPanelRef.current && tzPanelRef.current.contains(e.target)) return;
      setTzOpen(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [tzOpen]);

  const isLocked = (name) => lockedFields.includes(name);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (isLocked(name)) return;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isBooking) return;
    // YYYY-MM-DD strings compare correctly as plain strings
    if (!form.bookingDate || form.bookingDate < getLocalDateString()) {
      alert('Please choose a meeting date from today onwards.');
      return;
    }
    setIsBooking(true);
    try {
      const bookingData = {
        tutor_id: null,
        tutor_name: 'Unassigned',
        student_name: form.bookingStudentName,
        parent_name: form.bookingParentName,
        phone: form.bookingPhone,
        email: form.bookingEmail,
        meeting_type: form.meetingType,
        booking_date: form.bookingDate,
        booking_time: form.bookingTime,
        timezone: form.bookingTimezone,
        message: withRequestedSubject(requestedSubject, form.bookingMessage)
      };
      await createBooking(bookingData);
      setSuccess(true);
      // Keep the prefilled identity fields; clear the meeting-specific ones.
      setForm(makeForm(prefill));
      onBooked?.({ ...bookingData, status: 'pending' });
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      alert('Error scheduling booking: ' + err.message);
    } finally {
      setIsBooking(false);
    }
  };

  const todayStr = getLocalDateString();
  const filteredTz = tzOptions.filter(opt =>
    opt.label.toLowerCase().includes(tzSearch.toLowerCase()) ||
    opt.value.toLowerCase().includes(tzSearch.toLowerCase())
  );
  const lockedProps = (name) => (isLocked(name) ? { readOnly: true, className: 'booking-locked', title: 'From your student account' } : {});

  return (
    <form onSubmit={handleSubmit} className={`booking-form booking-form--${variant}`}>
      <p className="booking-form-intro">
        Schedule a 1-on-1 counseling call or academic consultation session with a tutor.
      </p>
      {success && (
        <div className="booking-form-success" role="status">Meeting scheduled successfully!</div>
      )}
      <div className="form-group" style={{ margin: 0 }}>
        <label>Parent Name *</label>
        <input type="text" name="bookingParentName" value={form.bookingParentName} onChange={handleChange} placeholder="e.g. David Doe" required {...lockedProps('bookingParentName')} />
      </div>
      <div className="form-row-2col">
        <div className="form-group" style={{ margin: 0 }}>
          <label>Parent Email *</label>
          <input type="email" name="bookingEmail" value={form.bookingEmail} onChange={handleChange} placeholder="parent@example.com" required {...lockedProps('bookingEmail')} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Contact Phone *</label>
          <input type="tel" name="bookingPhone" value={form.bookingPhone} onChange={handleChange} placeholder="080..." required {...lockedProps('bookingPhone')} />
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label>Student's Full Name *</label>
        <input type="text" name="bookingStudentName" value={form.bookingStudentName} onChange={handleChange} placeholder="Child's Name" required {...lockedProps('bookingStudentName')} />
      </div>
      <div className="form-row-2col">
        <div className="form-group" style={{ margin: 0 }}>
          <label>Preferred Date *</label>
          <input type="date" name="bookingDate" min={todayStr} value={form.bookingDate} onChange={handleChange} required />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Preferred Time *</label>
          <select name="bookingTime" value={form.bookingTime} onChange={handleChange} required>
            <option value="">Select Time</option>
            {TIME_SLOTS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label>Time Zone *</label>
        {/* Panel is portalled to body to escape transform stacking contexts */}
        <div ref={tzDropdownRef} style={{ position: 'relative' }}>
          <div
            ref={tzTriggerRef}
            role="button"
            tabIndex={0}
            aria-haspopup="listbox"
            aria-expanded={tzOpen}
            onClick={() => {
              if (!tzOpen) setTzRect(tzTriggerRef.current.getBoundingClientRect());
              setTzOpen(o => !o);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!tzOpen) setTzRect(tzTriggerRef.current.getBoundingClientRect());
                setTzOpen(o => !o);
              } else if (e.key === 'Escape') {
                setTzOpen(false);
              }
            }}
            className="booking-tz-trigger"
            style={{
              padding: '0.65rem', borderRadius: '8px',
              border: `1.5px solid ${tzOpen ? 'var(--primary-color)' : '#cbd5e0'}`,
              background: 'white', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: '0.85rem', color: form.bookingTimezone ? 'var(--primary-color)' : '#a0aec0',
              userSelect: 'none'
            }}
          >
            {form.bookingTimezone || 'Select Timezone'}
            <span>{tzOpen ? '▲' : '▼'}</span>
          </div>

          {tzOpen && tzRect && createPortal(
            <div
              ref={tzPanelRef}
              style={{
                position: 'fixed', top: tzRect.bottom + 4, left: tzRect.left, width: tzRect.width,
                background: 'white', border: '1.5px solid var(--primary-color)', borderRadius: '8px',
                zIndex: 99999, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', overflow: 'hidden'
              }}
            >
              <div style={{ padding: '0.5rem' }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search timezone..."
                  value={tzSearch}
                  onChange={e => setTzSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setTzOpen(false); }}
                  style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div role="listbox" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {filteredTz.map(opt => {
                  const selected = form.bookingTimezone === opt.value;
                  return (
                    <div
                      key={opt.value}
                      role="option"
                      aria-selected={selected}
                      onMouseDown={e => {
                        // onMouseDown + preventDefault so the outside-click handler doesn't close first
                        e.preventDefault();
                        setForm(prev => ({ ...prev, bookingTimezone: opt.value }));
                        setTzOpen(false);
                        setTzSearch('');
                      }}
                      style={{
                        padding: '0.55rem 0.75rem', fontSize: '0.82rem', cursor: 'pointer',
                        background: selected ? 'rgba(59,130,246,0.08)' : 'transparent',
                        color: selected ? 'var(--primary-color)' : '#2d3748',
                        fontWeight: selected ? '600' : '400'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f7fafc'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = selected ? 'rgba(59,130,246,0.08)' : 'transparent'; }}
                    >
                      {opt.label}
                    </div>
                  );
                })}
                {filteredTz.length === 0 && (
                  <div style={{ padding: '0.75rem', fontSize: '0.82rem', color: '#a0aec0', textAlign: 'center' }}>No timezones found</div>
                )}
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label>Add Message (Optional)</label>
        <textarea
          name="bookingMessage"
          value={form.bookingMessage}
          onChange={handleChange}
          placeholder="Tell us about your child's learning goals, grade level, or areas of struggle..."
          rows={2}
          style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1.5px solid #cbd5e0', background: 'white', color: '#2d3748', fontFamily: 'inherit', fontSize: '0.85rem' }}
        />
      </div>
      <button
        type="submit"
        className="btn-primary booking-form-submit"
        disabled={isBooking}
        aria-busy={isBooking}
        style={{ padding: '0.65rem', fontSize: '0.85rem', width: '100%', marginTop: '0.5rem', boxShadow: 'none', opacity: isBooking ? 0.7 : 1, cursor: isBooking ? 'not-allowed' : 'pointer' }}
      >
        {isBooking ? 'Booking...' : 'Book Session'}
      </button>
    </form>
  );
}
