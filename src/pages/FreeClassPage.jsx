import React, { useState } from 'react';
import { CalendarDays, Monitor, Gift, CheckCircle2, ArrowDown, Smartphone } from 'lucide-react';
import { registerStudent } from '../services/dataService';
import { FREE_CLASS, FREE_CLASS_COURSES, SCHOOL_CLASSES } from '../data/freeTeenClass';
import '../styles/FreeClass.css';

// Landing + sign-up page for the free 6-week teen class.
// The church flyer's QR code points here (foundaxia.com/free-class).

const EMPTY = { teenName: '', schoolClass: '', parentName: '', phone: '', email: '', consent: false };

export default function FreeClassPage() {
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null); // teen's first name once registered

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      await registerStudent({
        full_name: form.teenName.trim(),
        grade_level: form.schoolClass,
        program: 'group',
        phone: form.phone.trim(),
        email: form.email.trim(),
        parentName: form.parentName.trim(),
        relationship: 'Parent/Guardian',
        date_of_birth: null,
        gender: null,
        start_date: null,
        additional_comments: `${FREE_CLASS.tag} (church outreach) | Parent/guardian: ${form.parentName.trim()} | Parent consent: yes`
      });
      setDone(form.teenName.trim().split(' ')[0] || 'your teen');
      setForm(EMPTY);
      setTimeout(() => document.getElementById('fc-register')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (err) {
      alert('Sorry, the registration did not go through: ' + err.message + '\nPlease try again.');
    } finally {
      setSending(false);
    }
  };

  const goToForm = () => document.getElementById('fc-register')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  let week = 0;
  return (
    <div className="fc-page">
      <section className="fc-hero">
        <div className="fc-hero-bg fc-hero-bg--a" aria-hidden="true" />
        <div className="fc-hero-bg fc-hero-bg--b" aria-hidden="true" />
        <div className="fc-wrap">
          <span className="fc-badge"><Gift size={15} /> 100% FREE · 6 WEEKS</span>
          <h1>{FREE_CLASS.name}</h1>
          <p className="fc-sub">{FREE_CLASS.tagline} for teenagers</p>
          <p className="fc-trio">{FREE_CLASS_COURSES.map(c => c.short).join('  ·  ')}</p>
          <ul className="fc-facts">
            <li><CalendarDays size={17} /> {FREE_CLASS.when} · {FREE_CLASS.start}</li>
            <li><Monitor size={17} /> {FREE_CLASS.where}</li>
          </ul>
          <button type="button" className="fc-cta" onClick={goToForm}>Register for free <ArrowDown size={17} /></button>
        </div>
      </section>

      <section className="fc-wrap fc-courses-section">
        <h2>3 courses · 6 Saturdays</h2>
        <p className="fc-lead">Two live, hands-on Saturdays for each course, taught by FoundaXia tutors.</p>
        <div className="fc-courses">
          {FREE_CLASS_COURSES.map((c) => {
            const first = week + 1;
            week += c.weeks.length;
            return (
              <article key={c.title} className="fc-course">
                <div className="fc-course-img" style={{ backgroundImage: `url('${c.image}')` }}>
                  <span className="fc-course-weeks">Weeks {first}–{week}</span>
                </div>
                <div className="fc-course-body">
                  <h3>{c.title}</h3>
                  <p className="fc-course-sum">{c.summary}</p>
                  <ol className="fc-course-list">
                    {c.weeks.map((w, i) => (
                      <li key={w.title}>
                        <span className="fc-wk">Week {first + i}</span>
                        <strong>{w.title}</strong>
                        <p>{w.text}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            );
          })}
        </div>
        <p className="fc-need"><Smartphone size={18} /> All your teen needs: a smartphone or laptop with internet.</p>
      </section>

      <section className="fc-wrap fc-form-section" id="fc-register">
        <div className="fc-form-card">
          {done ? (
            <div className="fc-done">
              <CheckCircle2 size={48} />
              <h2>{done} is registered!</h2>
              <p>Thank you. We will send the start date and the class link to the phone number and email you gave us before the first Saturday.</p>
              <button type="button" className="fc-link" onClick={() => setDone(null)}>Register another teen</button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <h2>Register for free</h2>
              <p className="fc-lead">Takes one minute. A parent or guardian should fill this in.</p>

              <div className="fc-row">
                <label className="fc-field">
                  <span>Teen's full name *</span>
                  <input name="teenName" value={form.teenName} onChange={change} required maxLength={80} placeholder="e.g. David Adeyemi" autoComplete="off" />
                </label>
                <label className="fc-field">
                  <span>Class in school *</span>
                  <select name="schoolClass" value={form.schoolClass} onChange={change} required>
                    <option value="">Select</option>
                    {SCHOOL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <label className="fc-field">
                <span>Parent / guardian name *</span>
                <input name="parentName" value={form.parentName} onChange={change} required maxLength={80} placeholder="e.g. Mrs. Funmi Adeyemi" />
              </label>
              <div className="fc-row">
                <label className="fc-field">
                  <span>Phone (WhatsApp) *</span>
                  <input name="phone" type="tel" value={form.phone} onChange={change} required maxLength={20} placeholder="080..." />
                </label>
                <label className="fc-field">
                  <span>Email *</span>
                  <input name="email" type="email" value={form.email} onChange={change} required maxLength={120} placeholder="parent@example.com" />
                </label>
              </div>
              <label className="fc-consent">
                <input type="checkbox" name="consent" checked={form.consent} onChange={change} required />
                <span>I am the parent/guardian and I agree to my teen joining these free online classes.</span>
              </label>
              <button type="submit" className="fc-submit" disabled={sending}>{sending ? 'Registering…' : 'Register my teen'}</button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
