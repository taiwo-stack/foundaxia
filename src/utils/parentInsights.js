// Turns the student dashboard's raw lists into what the Parent Area shows.

const classEnd = (sch) => (sch.end_time
  ? new Date(sch.end_time)
  : new Date(new Date(sch.start_time).getTime() + 60 * 60 * 1000));

// tz (optional): show the class in the zone it was booked in.
export const fmtDay = (d, tz) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', ...(tz ? { timeZone: tz } : {}) });
export const fmtTime = (d, tz) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) });
export const fmtDate = (v) => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const pct = (grade, max) => {
  const g = Number(grade);
  const m = Number(max) || 100;
  return Number.isFinite(g) ? Math.round((g / m) * 100) : null;
};

export const scoreTone = (p) => (p === null ? '' : p >= 70 ? 'is-good' : p >= 50 ? 'is-ok' : 'is-low');

// Everything the views need, computed once from the raw lists.
export function buildInsights({ schedules = [], attendanceLogs = [], tasks = [], submissions = [], courses = [], tutorContacts = [] }) {
  const now = new Date();
  const courseTitle = (id) => courses.find(c => c.id === id)?.title || 'Class';
  const tutorName = (id) => tutorContacts.find(c => c.tutor.id === id || c.tutor.profile_id === id)?.tutor.full_name || 'Tutor';

  const upcoming = schedules.filter(s => classEnd(s) >= now).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const past = schedules.filter(s => classEnd(s) < now).sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  const attBySchedule = new Map(attendanceLogs.map(a => [a.schedule_id, a.status]));
  const statusOf = (s) => attBySchedule.get(s.id) || 'unmarked';

  const tally = (list) => {
    const attended = list.filter(s => statusOf(s) === 'attended').length;
    const missed = list.filter(s => statusOf(s) === 'missed').length;
    const marked = attended + missed;
    return { attended, missed, marked, rate: marked ? Math.round((attended / marked) * 100) : null };
  };
  const thisMonth = past.filter(s => {
    const d = new Date(s.start_time);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const subByTask = new Map(submissions.map(s => [s.task_id, s]));
  const homeworkToDo = tasks.filter(t => !subByTask.has(t.id));
  const graded = submissions
    .filter(s => s.grade !== null && s.grade !== undefined && s.grade !== '')
    .map(s => {
      const task = tasks.find(t => t.id === s.task_id);
      return { ...s, task, percent: pct(s.grade, task?.max_points), when: s.graded_at || s.submitted_at };
    })
    .sort((a, b) => new Date(b.when) - new Date(a.when));

  // Per class: average score and a simple trend (latest vs the average of earlier ones).
  const byCourse = courses
    .map(c => {
      const items = graded.filter(g => g.task?.course_id === c.id && g.percent !== null);
      if (items.length === 0) return null;
      const avg = Math.round(items.reduce((s, g) => s + g.percent, 0) / items.length);
      let trend = 'steady';
      if (items.length >= 2) {
        const earlier = items.slice(1);
        const earlierAvg = earlier.reduce((s, g) => s + g.percent, 0) / earlier.length;
        if (items[0].percent >= earlierAvg + 5) trend = 'up';
        else if (items[0].percent <= earlierAvg - 5) trend = 'down';
      }
      return { course: c, avg, count: items.length, trend };
    })
    .filter(Boolean);

  return {
    courseTitle, tutorName, upcoming, past, statusOf,
    overall: tally(past), month: tally(thisMonth),
    homeworkToDo, graded, byCourse, tutorContacts
  };
}
