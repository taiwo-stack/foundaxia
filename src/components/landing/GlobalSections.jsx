import React, { useEffect, useRef, useState } from 'react';
import '../../styles/LandingGlobal.css';
import { FLAGS } from './Flags';

// Homepage sections for families outside Nigeria as well as inside it.
// Copy rule: only say what is true today. No guarantees, no unverifiable checks or stats.

/* ---------- 2. Inside the classroom (real platform screenshots) ---------- */
const CLASSROOM = [
  { img: '/images/platform/student-lesson.jpg', title: 'Every lesson in one place', text: 'Slides, practice files and homework stay on your child’s dashboard, so they can revise or catch up any time.', alt: 'A FoundaXia course page with weekly lesson slides, a practice sheet, flashcards and a quiz' },
  { img: '/images/platform/student-quiz.jpg', title: 'Practice that sticks', text: 'Interactive quizzes, marked instantly, plus flashcards for revision between lessons.', alt: 'A FoundaXia quiz with multiple-choice, drag-and-drop matching and put-in-order questions' },
  { img: '/images/platform/parent-progress.jpg', title: 'Progress you can see', text: 'Your private Parent Area shows attendance, scores and notes from the tutor after lessons.', alt: 'The FoundaXia Parent Area showing progress by course and recent results for a sample student' },
  { img: '/images/platform/student-timetable.jpg', title: 'Your time zone, automatically', text: 'Lesson times and join links appear in your local time, whether you are in London, Toronto, New York or Lagos.', alt: 'A FoundaXia timetable listing upcoming classes with times and join links' }
];

export function InsideClassroom() {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);

  // Which slide is mostly in view, for the dots and arrows.
  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const slides = [...el.children];
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0, bestDist = Infinity;
    slides.forEach((s, i) => {
      const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    setActive(best);
  };
  const goTo = (i) => {
    const el = trackRef.current;
    const slide = el && el.children[Math.max(0, Math.min(CLASSROOM.length - 1, i))];
    if (slide) el.scrollTo({ left: slide.offsetLeft - (el.clientWidth - slide.offsetWidth) / 2, behavior: 'smooth' });
  };

  // Move to the next screenshot every 15 seconds, looping back to the first.
  // Pauses while the visitor hovers or touches the slider, and for 30 seconds after
  // they use it, so it never moves under their finger. Off for "reduce motion".
  const activeRef = useRef(0);
  activeRef.current = active;
  const hoverRef = useRef(false);
  const lastTouchRef = useRef(0);
  const touched = () => { lastTouchRef.current = Date.now(); };
  useEffect(() => {
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* old browser */ }
    if (reduce) return undefined;
    const t = setInterval(() => {
      if (hoverRef.current || Date.now() - lastTouchRef.current < 30000 || document.hidden) return;
      goTo((activeRef.current + 1) % CLASSROOM.length);
    }, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="lg-section lg-darker" id="platform">
      <div className="container">
        <div className="lg-head">
          <p className="lg-eyebrow">More than a video call</p>
          <h2 className="landing-section-heading">A live tutor, plus a learning platform built for families</h2>
          <p className="lg-lead">Every FoundaXia student gets live one-to-one lessons and their own online classroom. Here is what you and your child see.</p>
        </div>
        <div
          className="lg-slider"
          onMouseEnter={() => { hoverRef.current = true; }}
          onMouseLeave={() => { hoverRef.current = false; }}
          onTouchStart={touched}
          onPointerDown={touched}
          onFocus={touched}
        >
          <button type="button" className="lg-arrow prev" onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Previous screenshot">‹</button>
          <div className="lg-shots" ref={trackRef} onScroll={onScroll} tabIndex={0} aria-label="Screenshots of the FoundaXia platform">
            {CLASSROOM.map((s, i) => (
              <figure key={s.title} className="lg-shot" aria-label={`${i + 1} of ${CLASSROOM.length}`}>
                <div className="lg-shot-frame"><img src={s.img} alt={s.alt} width="1200" height="750" /></div>
                <figcaption>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </figcaption>
              </figure>
            ))}
          </div>
          <button type="button" className="lg-arrow next" onClick={() => goTo(active + 1)} disabled={active === CLASSROOM.length - 1} aria-label="Next screenshot">›</button>
        </div>
        <div className="lg-dots">
          {CLASSROOM.map((s, i) => (
            <button key={s.title} type="button" className={`lg-dot${i === active ? ' on' : ''}`} onClick={() => { touched(); goTo(i); }} aria-label={`Show: ${s.title}`} aria-current={i === active} />
          ))}
        </div>
        <p className="lg-small lg-center" style={{ marginTop: '1rem' }}>Screenshots of the FoundaXia platform, shown with sample students.</p>
      </div>
    </section>
  );
}

/* ---------- 2b. Subjects & exam boards ---------- */
// Subjects match the courses FoundaXia offers.
const SUBJECT_TABS = {
  'Maths': ['Early maths & number', 'Times tables & arithmetic', 'Fractions, decimals & percentages', 'Ratio & proportion', 'Pre-algebra', 'Algebra', 'Geometry', 'Trigonometry', 'Statistics & probability', 'Functions & pre-calculus', 'Calculus', 'Exam technique & past papers'],
  'English': ['Phonics', 'Reading & comprehension', 'Spelling, grammar & punctuation', 'Vocabulary', 'Creative writing', 'Essay writing', 'English language', 'English literature', 'Poetry & set texts', 'Speaking & presenting'],
  'Science': ['Primary & general science', 'Life science', 'Combined science', 'Biology', 'Chemistry', 'Physics', 'Earth & environmental science', 'Practicals & lab skills'],
  'Coding & Tech': ['Scratch (block coding)', 'Python', 'Intro to coding', 'Web design (HTML & CSS)', 'Computer science', 'Spreadsheets & data', 'Microsoft Excel, Word & PowerPoint', 'Databases', 'Data science', 'AI fluency', 'AI & machine learning basics', 'The internet & networks', 'Robotics', 'Cybersecurity & online safety']
};

// Exams for the subjects and ages we teach. Boards shown under each exam.
const EXAMS = [
  { key: 'uk', note: 'Reception to Year 13', name: 'United Kingdom', groups: [
    ['Phonics screening check (Year 1)', []],
    ['Multiplication tables check (Year 4)', []],
    ['KS2 SATs', []],
    ['11+ entrance exams', ['GL Assessment', 'CEM', 'CSSE', 'ISEB Pre-Test']],
    ['13+ Common Entrance', ['ISEB']],
    ['GCSE', ['AQA', 'Edexcel', 'OCR', 'WJEC / Eduqas', 'CCEA']],
    ['A-level maths & sciences', ['AQA', 'Edexcel', 'OCR']],
    ['Scotland: National 5 & Highers', ['SQA']]
  ] },
  { key: 'us', note: 'Kindergarten to Grade 12', name: 'United States', groups: [
    ['SAT & PSAT/NMSQT', []],
    ['ACT', []],
    ['AP exams', ['Calculus', 'Biology', 'Chemistry', 'Physics', 'Computer Science']],
    ['State tests', ['e.g. NY Regents', 'Texas STAAR']],
    ['ISEE & SSAT', []]
  ] },
  { key: 'ca', note: 'Grade 1 to Grade 12', name: 'Canada', groups: [
    ['EQAO', ['Ontario']],
    ['Provincial Achievement Tests', ['Alberta']],
    ['Diploma exams', ['Alberta']],
    ['Graduation assessments', ['British Columbia']]
  ] },
  { key: 'ng', note: 'Primary, JSS & SSS', name: 'Nigeria', groups: [
    ['Common Entrance', ['NCEE']],
    ['BECE (Junior WAEC)', []],
    ['WAEC (WASSCE)', []],
    ['NECO (SSCE)', []],
    ['JAMB (UTME)', []],
    ['Post-UTME', []]
  ] },
  { key: 'intl', note: 'IGCSE, A-level & IB', name: 'International schools', groups: [
    ['IGCSE', ['Cambridge', 'Pearson Edexcel']],
    ['International A-level', ['Cambridge', 'Pearson Edexcel']],
    ['IB', ['MYP', 'Diploma Programme']]
  ] }
];

export function SubjectsAndExams({ onPickSubject, onViewAll }) {
  const [tab, setTab] = useState('Maths');
  return (
    <section className="lg-section lg-dark" id="subjects-section">
      <div className="container">
        <div className="lg-head">
          <p className="lg-eyebrow">Subjects &amp; exams</p>
          <h2 className="landing-section-heading">Every subject. Every exam. One tutor matched to your child.</h2>
          <p className="lg-lead">From first steps in reading to final exam revision. Choose a subject to book a free consultation about it.</p>
        </div>

        <div className="lg-tabs" role="tablist" aria-label="Subjects">
          {Object.keys(SUBJECT_TABS).map(t => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`lg-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
              <span className="lg-tab-name">{t}</span>
              <span className="lg-tab-count">{SUBJECT_TABS[t].length}</span>
            </button>
          ))}
        </div>
        {/* All lists share one grid cell, so the area keeps the height of the longest list */}
        <div className="lg-chip-stack">
          {Object.keys(SUBJECT_TABS).map(t => (
            <div key={t} className={`lg-chips${t === tab ? " on" : ""}`} role="tabpanel" aria-hidden={t !== tab}>
              {SUBJECT_TABS[t].map(s => (
                <button key={s} type="button" className="lg-chip" tabIndex={t === tab ? 0 : -1} onClick={() => onPickSubject(s)}>{s}</button>
              ))}
            </div>
          ))}
        </div>

        <div className="lg-exams" id="exams">
          <div className="lg-exams-head">
            <h3>Exams &amp; boards we prepare for</h3>
            <p>Tell us the exam board and we’ll match a tutor who knows that specification.</p>
          </div>
          <div className="lg-exam-cols">
            {EXAMS.map(c => {
              const Flag = FLAGS[c.key];
              return (
                <div key={c.key} className="lg-exam-col">
                  <div className="lg-exam-country">
                    <span className="lg-flag sm" aria-hidden="true"><Flag width="100%" height="100%" /></span>
                    <div>
                      <strong>{c.name}</strong>
                      <small>{c.note}</small>
                    </div>
                  </div>
                  <ul>
                    {c.groups.map(([exam, boards]) => (
                      <li key={exam}>
                        <button type="button" className="lg-exam" onClick={() => onPickSubject(`${exam} preparation`)}>{exam}</button>
                        {boards.length > 0 && <span className="lg-boards">{boards.join(' · ')}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg-center">
          <button type="button" className="lg-ghost" onClick={onViewAll}>View all subjects →</button>
        </div>
      </div>
    </section>
  );
}

/* ---------- 2c. Contact ---------- */
// Topic values stay the same (admin inbox and the Pricing link rely on them); only labels changed.
const CONTACT_TOPICS = [
  ['enrollment', 'Free consultation & enrolment'],
  ['programs', 'Subjects, exams & programmes'],
  ['scheduling', 'Lesson times & scheduling'],
  ['fees', 'Fees & payments'],
  ['tutor_application', 'Become a tutor'],
  ['careers', 'Careers & partnerships'],
  ['other', 'Something else']
];

export function ContactSection({ form, onChange, onSubmit, sending, success, onBook }) {
  return (
    <section className="lg-section lg-darker" id="contact">
      <div className="container">
        <div className="lg-head">
          <p className="lg-eyebrow">Get in touch</p>
          <h2 className="landing-section-heading">Questions? Talk to a real person.</h2>
          <p className="lg-lead">Message us on WhatsApp, send an email, or use the form. We usually reply within 24 hours.</p>
        </div>

        <div className="lg-contact">
          <aside className="lg-contact-info">
            <h3>Reach us directly</h3>
            <a className="lg-contact-way" href="https://wa.me/2349061814608" target="_blank" rel="noopener noreferrer">
              <span className="lg-contact-icon wa" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.2-.7-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9.9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.6-.1 1.2z"/></svg>
              </span>
              <span>
                <strong>WhatsApp</strong>
                <small>Chat with our team</small>
              </span>
            </a>
            <a className="lg-contact-way" href="mailto:foundaxia@gmail.com">
              <span className="lg-contact-icon mail" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
              </span>
              <span>
                <strong>Email</strong>
                <small>foundaxia@gmail.com</small>
              </span>
            </a>
            <div className="lg-contact-flags">
              <span className="lg-contact-label">Supporting families in</span>
              <div>
                {['uk', 'us', 'ca', 'ng'].map(k => {
                  const Flag = FLAGS[k];
                  return <span key={k} className="lg-flag sm" aria-hidden="true"><Flag width="100%" height="100%" /></span>;
                })}
              </div>
              <span className="lg-contact-label">the UK, US, Canada and Nigeria</span>
            </div>
            <div className="lg-contact-book">
              <p>Prefer to talk it through?</p>
              <button type="button" className="btn-primary lg-cta" onClick={onBook}>Book a free consultation</button>
            </div>
          </aside>

          <form className="lg-contact-form" onSubmit={onSubmit}>
            <h3>Send us a message</h3>
            {success && <div className="lg-contact-success" role="status">Thank you! Your message is on its way. We’ll get back to you within 24 hours.</div>}
            <div className="lg-form-row">
              <label className="lg-field">
                <span>Your name *</span>
                <input type="text" name="contactName" value={form.contactName} onChange={onChange} placeholder="Full name" required />
              </label>
              <label className="lg-field">
                <span>Email *</span>
                <input type="email" name="contactEmail" value={form.contactEmail} onChange={onChange} placeholder="you@example.com" required />
              </label>
            </div>
            <div className="lg-form-row">
              <label className="lg-field">
                <span>Phone or WhatsApp</span>
                <input type="tel" name="contactPhone" value={form.contactPhone} onChange={onChange} placeholder="With country code, e.g. +44" />
              </label>
              <label className="lg-field">
                <span>Topic</span>
                <select name="contactSubject" value={form.contactSubject} onChange={onChange}>
                  <option value="">Choose a topic</option>
                  {CONTACT_TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            <label className="lg-field">
              <span>Your message *</span>
              <textarea name="contactMessage" value={form.contactMessage} onChange={onChange} rows={5} placeholder="Tell us about your child, their year or grade, and how we can help." required />
            </label>
            <button type="submit" className="btn-primary lg-contact-send" disabled={sending} aria-busy={sending}>
              {sending ? 'Sending…' : 'Send message'}
            </button>
            <p className="lg-contact-note">We only use your details to reply to you. See our <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
          </form>
        </div>
      </div>
    </section>
  );
}

/* ---------- 4. Founder ---------- */
// Add a real photo at /public/images/founder.jpg and set FOUNDER_PHOTO to '/images/founder.jpg'.
const FOUNDER_PHOTO = '/images/founder.jpg';

export function FounderSection({ onBook }) {
  return (
    <section className="lg-section lg-darker" id="founder">
      <div className="container lg-founder">
        <div className="lg-founder-card">
          {FOUNDER_PHOTO
            ? <img src={FOUNDER_PHOTO} alt="Adedotun Kehinde Taiwo, founder of FoundaXia Academy" className="lg-founder-photo" />
            : <div className="lg-founder-photo lg-founder-initials" aria-hidden="true">AT</div>}
          <div>
            <p className="lg-founder-name">Adedotun Kehinde Taiwo</p>
            <p className="lg-founder-role">Founder · AI engineer</p>
            <p className="lg-founder-role">Electrical &amp; Electronic Engineering graduate</p>
          </div>
        </div>
        <div className="lg-founder-copy">
          <p className="lg-eyebrow">Why FoundaXia exists</p>
          <h2 className="landing-section-heading">One child. One tutor. A lifetime of confidence.</h2>
          <p className="lg-lead">“The right teacher at the right time changes everything. A child who was stuck starts to understand. A child who was quiet starts to ask questions. A child who doubted themselves starts to believe they can. FoundaXia exists to give every child that moment, wherever they are in the world: a dedicated tutor who knows their name, their goals and how they learn best, and strong foundations in maths, English, science and technology to carry them far.”</p>
          <p className="lg-small">Every family speaks with our team before lessons begin, and every tutor match is made by a person, not an algorithm.</p>
          <button type="button" className="btn-primary lg-cta" onClick={onBook}>Book a free consultation</button>
        </div>
      </div>
    </section>
  );
}

/* ---------- 5. Parent quotes (hidden until real, approved quotes exist) ---------- */
// Add only real quotes, with the parent's permission to show their first name and city.
// e.g. { quote: '…', name: 'Sarah', detail: 'Parent of a Year 6 student, London' }
export const TESTIMONIALS = [];

export function Testimonials() {
  if (!TESTIMONIALS.length) return null;
  return (
    <section className="lg-section lg-dark" id="families">
      <div className="container">
        <div className="lg-head">
          <p className="lg-eyebrow">From our families</p>
          <h2 className="landing-section-heading">What parents say</h2>
        </div>
        <div className={`lg-quotes ${TESTIMONIALS.length === 1 ? 'one' : ''}`}>
          {TESTIMONIALS.map((t, i) => (
            <blockquote key={i} className="lg-quote">
              <p>“{t.quote}”</p>
              <footer><strong>{t.name}</strong> · {t.detail}</footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
