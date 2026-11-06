import React, { useState } from 'react';
import {
  CalendarClock, CheckCircle2, XCircle, HelpCircle, TrendingUp, TrendingDown, Minus,
  BookOpen, ClipboardList, MessageSquareQuote, Wallet, Award, GraduationCap
} from 'lucide-react';

import { fmtDay, fmtTime, fmtDate, scoreTone } from '../utils/parentInsights';

// Parent-facing views of the child's learning: built from the data the student dashboard
// already loads (classes, attendance, homework, grades, tutors) plus tutor notes.

// ---------------- Overview ----------------
export function OverviewTab({ ins, notes, outstandingText, onGo }) {
  const next = ins.upcoming[0];
  const latest = ins.graded[0];
  const latestNote = notes?.[0];
  return (
    <div className="pi-grid">
      <section className="dashboard-card pi-card">
        <h3><CalendarClock size={18} color="var(--primary-color)" /> Next class</h3>
        {next ? (
          <div className="pi-big">
            <strong>{next.title || ins.courseTitle(next.course_id)}</strong>
            <span>{fmtDay(new Date(next.start_time))} · {fmtTime(new Date(next.start_time))}</span>
            <small>{ins.courseTitle(next.course_id)} with {ins.tutorName(next.tutor_id)}</small>
          </div>
        ) : <p className="pa-muted">No upcoming classes scheduled.</p>}
      </section>

      <section className="dashboard-card pi-card pi-click" onClick={() => onGo('attendance')} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onGo('attendance'); }}>
        <h3><CheckCircle2 size={18} color="var(--primary-color)" /> Attendance this month</h3>
        <div className="pi-big">
          <strong>{ins.month.marked ? `${ins.month.attended} of ${ins.month.marked}` : 'No classes yet'}</strong>
          <span>{ins.month.marked ? `classes attended (${ins.month.rate}%)` : 'Attendance will show after classes are marked'}</span>
        </div>
      </section>

      <section className="dashboard-card pi-card pi-click" onClick={() => onGo('progress')} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onGo('progress'); }}>
        <h3><Award size={18} color="var(--primary-color)" /> Latest result</h3>
        {latest ? (
          <div className="pi-big">
            <strong className={scoreTone(latest.percent)}>{latest.percent !== null ? `${latest.percent}%` : latest.grade}</strong>
            <span>{latest.task?.title || 'Assignment'}</span>
            <small>{ins.courseTitle(latest.task?.course_id)} · {fmtDate(latest.when)}</small>
          </div>
        ) : <p className="pa-muted">No graded work yet.</p>}
      </section>

      <section className="dashboard-card pi-card pi-click" onClick={() => onGo('progress')} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onGo('progress'); }}>
        <h3><ClipboardList size={18} color="var(--primary-color)" /> Homework to do</h3>
        <div className="pi-big">
          <strong>{ins.homeworkToDo.length}</strong>
          <span>{ins.homeworkToDo.length === 1 ? 'task not yet submitted' : 'tasks not yet submitted'}</span>
        </div>
      </section>

      <section className="dashboard-card pi-card pi-wide pi-click" onClick={() => onGo('notes')} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onGo('notes'); }}>
        <h3><MessageSquareQuote size={18} color="var(--primary-color)" /> Latest note from a tutor</h3>
        {latestNote ? (
          <blockquote className="pi-quote">
            <p>{latestNote.note.length > 220 ? latestNote.note.slice(0, 220) + '…' : latestNote.note}</p>
            <footer>{latestNote.author_name || 'Tutor'} · {fmtDate(latestNote.created_at)}</footer>
          </blockquote>
        ) : <p className="pa-muted">No notes yet. Tutors will share updates about your child here.</p>}
      </section>

      <section className="dashboard-card pi-card pi-wide">
        <h3><GraduationCap size={18} color="var(--primary-color)" /> Your child's tutors</h3>
        {ins.tutorContacts.length === 0 ? <p className="pa-muted">Tutors will appear here once classes are assigned.</p> : (
          <ul className="pi-tutors">
            {ins.tutorContacts.map(({ tutor, course_id }) => (
              <li key={tutor.id}>
                {tutor.avatar_url
                  ? <img src={tutor.avatar_url} alt={tutor.full_name} />
                  : <span className="pi-initial">{(tutor.full_name || 'T')[0]}</span>}
                <div>
                  <strong>{tutor.full_name}</strong>
                  <small>{ins.courseTitle(course_id)}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outstandingText && (
        <section className="dashboard-card pi-card pi-wide pi-click pi-fees-hint" onClick={() => onGo('payments')} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onGo('payments'); }}>
          <Wallet size={18} /> {outstandingText} <span>View payments →</span>
        </section>
      )}
    </div>
  );
}

// ---------------- Progress ----------------
export function ProgressTab({ ins }) {
  const TrendIcon = { up: TrendingUp, down: TrendingDown, steady: Minus };
  const trendText = { up: 'Improving', down: 'Needs attention', steady: 'Steady' };
  return (
    <>
      <section className="dashboard-card">
        <h3><TrendingUp size={18} color="var(--primary-color)" /> Progress by class</h3>
        {ins.byCourse.length === 0 ? <p className="pa-muted">Scores will appear here once work has been graded.</p> : (
          <ul className="pi-courses">
            {ins.byCourse.map(({ course, avg, count, trend }) => {
              const Icon = TrendIcon[trend];
              return (
                <li key={course.id}>
                  <div className="pi-course-head">
                    <strong><BookOpen size={15} /> {course.title}</strong>
                    <span className={`pi-trend pi-trend-${trend}`}><Icon size={14} /> {trendText[trend]}</span>
                  </div>
                  <div className="pi-bar"><span className={scoreTone(avg)} style={{ width: `${Math.min(100, avg)}%` }} /></div>
                  <small>Average {avg}% across {count} graded {count === 1 ? 'task' : 'tasks'}</small>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dashboard-card">
        <h3><Award size={18} color="var(--primary-color)" /> Recent results</h3>
        {ins.graded.length === 0 ? <p className="pa-muted">No graded work yet.</p> : (
          <ul className="pa-list">
            {ins.graded.slice(0, 10).map(g => (
              <li key={g.id} className="pa-fee pi-result">
                <div className="pa-fee-main">
                  <div className="pa-fee-title">{g.task?.title || 'Assignment'}</div>
                  <div className="pa-fee-due">{ins.courseTitle(g.task?.course_id)} · {fmtDate(g.when)}</div>
                  {g.feedback && <div className="pi-feedback">“{g.feedback}”</div>}
                </div>
                <div className={`pi-score ${scoreTone(g.percent)}`}>{g.percent !== null ? `${g.percent}%` : g.grade}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dashboard-card">
        <h3><ClipboardList size={18} color="var(--primary-color)" /> Homework not yet submitted</h3>
        {ins.homeworkToDo.length === 0 ? <div className="pa-empty"><CheckCircle2 size={22} /> All homework is submitted.</div> : (
          <ul className="pa-list">
            {ins.homeworkToDo.map(t => (
              <li key={t.id} className="pa-fee">
                <div className="pa-fee-main">
                  <div className="pa-fee-title">{t.title}</div>
                  <div className="pa-fee-due">{ins.courseTitle(t.course_id)} · {t.task_type === 'quiz' ? 'Quiz' : 'Assignment'}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ---------------- Attendance ----------------
const STATUS = {
  attended: { label: 'Attended', Icon: CheckCircle2, cls: 'is-good' },
  missed: { label: 'Missed', Icon: XCircle, cls: 'is-low' },
  unmarked: { label: 'Not marked', Icon: HelpCircle, cls: 'is-muted' }
};

export function AttendanceTab({ ins }) {
  const [limit, setLimit] = useState(15);
  return (
    <>
      <div className="pa-stats">
        <div className="pa-stat pa-stat-due">
          <span>This month</span>
          <strong>{ins.month.rate !== null ? `${ins.month.rate}%` : '-'}</strong>
          <small>{ins.month.attended} attended · {ins.month.missed} missed</small>
        </div>
        <div className="pa-stat">
          <span>All time</span>
          <strong>{ins.overall.rate !== null ? `${ins.overall.rate}%` : '-'}</strong>
          <small>{ins.overall.attended} attended · {ins.overall.missed} missed</small>
        </div>
      </div>

      <section className="dashboard-card">
        <h3><CalendarClock size={18} color="var(--primary-color)" /> Class history</h3>
        {ins.past.length === 0 ? <p className="pa-muted">No classes have taken place yet.</p> : (
          <>
            <ul className="pa-list">
              {ins.past.slice(0, limit).map(s => {
                const st = STATUS[ins.statusOf(s)] || STATUS.unmarked;
                const d = new Date(s.start_time);
                return (
                  <li key={s.id} className="pa-fee">
                    <div className="pa-fee-main">
                      <div className="pa-fee-title">{s.title || ins.courseTitle(s.course_id)}</div>
                      <div className="pa-fee-due">{fmtDay(d)} · {fmtTime(d)} · {ins.tutorName(s.tutor_id)}</div>
                    </div>
                    <span className={`pi-status ${st.cls}`}><st.Icon size={14} /> {st.label}</span>
                  </li>
                );
              })}
            </ul>
            {ins.past.length > limit && (
              <button type="button" className="pa-btn-ghost pi-more" onClick={() => setLimit(l => l + 15)}>Show more</button>
            )}
          </>
        )}
      </section>

      {ins.upcoming.length > 0 && (
        <section className="dashboard-card">
          <h3><CalendarClock size={18} color="var(--primary-color)" /> Coming up</h3>
          <ul className="pa-list">
            {ins.upcoming.slice(0, 5).map(s => {
              const d = new Date(s.start_time);
              return (
                <li key={s.id} className="pa-fee">
                  <div className="pa-fee-main">
                    <div className="pa-fee-title">{s.title || ins.courseTitle(s.course_id)}</div>
                    <div className="pa-fee-due">{fmtDay(d)} · {fmtTime(d)} · {ins.tutorName(s.tutor_id)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

// ---------------- Tutor notes ----------------
export function NotesTab({ notes, notesError, ins }) {
  return (
    <section className="dashboard-card">
      <h3><MessageSquareQuote size={18} color="var(--primary-color)" /> Notes from tutors</h3>
      {notesError ? <div className="pa-alert pa-alert-err">{notesError}</div>
        : notes === null ? <p className="pa-muted">Loading...</p>
          : notes.length === 0 ? <p className="pa-muted">No notes yet. Your child's tutors will share updates, praise and tips for home here.</p> : (
            <ul className="pi-notes">
              {notes.map(n => (
                <li key={n.id}>
                  <div className="pi-note-head">
                    <strong>{n.author_name || 'Tutor'}</strong>
                    <span>{n.course_id ? `${ins.courseTitle(n.course_id)} · ` : ''}{fmtDate(n.created_at)}</span>
                  </div>
                  <p>{n.note}</p>
                </li>
              ))}
            </ul>
          )}
    </section>
  );
}
