import React, { useEffect, useRef, useState } from 'react';
import '../../styles/LandingGlobal.css';
import { FLAGS } from './Flags';

// Homepage sections for families outside Nigeria as well as inside it.
// Copy rule: only say what is true today. No guarantees, no unverifiable checks or stats.

/* ---------- 1. Choose your country ---------- */
export const COUNTRY_PATHS = [
  {
    key: 'uk', code: 'UK', name: 'United Kingdom',
    note: 'National Curriculum, Year 1 to Year 13',
    items: ['KS1 & KS2: phonics, reading, maths', 'KS2 SATs & 11+ preparation', 'KS3 maths, English & science', 'GCSE: maths, English, sciences, computer science']
  },
  {
    key: 'us', code: 'US', name: 'United States',
    note: 'Kindergarten to Grade 12',
    items: ['Elementary reading, writing & math', 'Middle school pre-algebra & science', 'High school algebra, geometry & sciences', 'SAT preparation']
  },
  {
    key: 'ca', code: 'CA', name: 'Canada',
    note: 'Grade 1 to Grade 12',
    items: ['Elementary literacy & math', 'Middle school math & science', 'High school functions, calculus & sciences', 'Coding & tech skills']
  },
  {
    key: 'ng', code: 'NG', name: 'Nigeria',
    note: 'Primary, JSS & SSS',
    items: ['Primary maths & English', 'JSS & SSS core subjects', 'WAEC, NECO & JAMB preparation', 'Coding & tech skills']
  }
];

export function CountryPaths({ onBook }) {
  return (
    <section className="lg-section lg-dark" id="curricula">
      <div className="container">
        <div className="lg-head">
          <p className="lg-eyebrow">Wherever your child studies</p>
          <h2 className="landing-section-heading">Tutoring that follows your country’s curriculum</h2>
          <p className="lg-lead">Tell us your child’s year or grade and what they are studying. We match a tutor who knows that syllabus and teaches at times that suit your family.</p>
        </div>
        <div className="lg-countries">
          {COUNTRY_PATHS.map(c => {
            const Flag = FLAGS[c.key];
            return (
            <article key={c.key} className="lg-country">
              <div className="lg-country-top">
                <span className="lg-flag" aria-hidden="true"><Flag width="100%" height="100%" /></span>
                <div>
                  <h3>{c.name}</h3>
                  <p>{c.note}</p>
                </div>
              </div>
              <ul>
                {c.items.map(i => <li key={i}>{i}</li>)}
              </ul>
            </article>
            );
          })}
        </div>
        <div className="lg-center">
          <button type="button" className="btn-primary lg-cta" onClick={onBook}>Book a free consultation</button>
          <p className="lg-small">Not sure where your child fits? We’ll work it out together on the call.</p>
        </div>
      </div>
    </section>
  );
}

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

/* ---------- 3. Time zones (live clocks) ---------- */
const CITIES = [
  { city: 'London', tz: 'Europe/London' },
  { city: 'Toronto', tz: 'America/Toronto' },
  { city: 'New York', tz: 'America/New_York' },
  { city: 'Lagos', tz: 'Africa/Lagos' }
];
const clock = (tz, d) => {
  try { return d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

export function TimeZoneBand({ onBook }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="lg-section lg-dark" id="time-zones">
      <div className="container lg-tz">
        <div className="lg-tz-copy">
          <p className="lg-eyebrow">Lessons at after-school times</p>
          <h2 className="landing-section-heading">Our team works just one hour from UK time</h2>
          <p className="lg-lead">Our tutors are based on West Africa Time (UTC+1): the same time as the UK in summer, and one hour ahead in winter. That makes after-school lessons in the UK easy to arrange. Families in Canada and the US book lessons that suit their day too.</p>
          <button type="button" className="btn-primary lg-cta" onClick={onBook}>Find a lesson time</button>
        </div>
        <div className="lg-clocks" aria-label="Current time in four cities">
          {CITIES.map(c => (
            <div key={c.city} className="lg-clock">
              <span className="lg-clock-time">{clock(c.tz, now)}</span>
              <span className="lg-clock-city">{c.city}</span>
            </div>
          ))}
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
            <p className="lg-founder-role">B.Sc. Electronic &amp; Electrical Engineering, Obafemi Awolowo University</p>
          </div>
        </div>
        <div className="lg-founder-copy">
          <p className="lg-eyebrow">Why FoundaXia exists</p>
          <h2 className="landing-section-heading">Founded by an engineer who knows what a head start is worth</h2>
          <p className="lg-lead">“I didn’t have a laptop of my own until my third year of university. By then, some classmates were already building real projects, not because they were smarter, but because they had started earlier. I caught up, and today I work as an AI engineer. That journey taught me something I believe about every child, wherever they live: talent is everywhere, but a head start isn’t. FoundaXia exists to give young people that head start: strong foundations in maths, English and science, and the confidence and tech skills to build the future, not just use it.”</p>
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
