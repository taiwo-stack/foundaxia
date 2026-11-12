// Class times are stored as one universal moment plus the zone they were booked in
// (the student's). They are shown in that zone and labelled, e.g. "4:00 PM UK time (GMT)".

const CANADA = [
  'Toronto', 'Montreal', 'Vancouver', 'Edmonton', 'Winnipeg', 'Halifax', 'Regina',
  'St_Johns', 'Moncton', 'Whitehorse', 'Yellowknife', 'Iqaluit', 'Glace_Bay', 'Goose_Bay',
  'Swift_Current', 'Dawson_Creek', 'Fort_Nelson', 'Creston', 'Dawson', 'Rankin_Inlet',
  'Resolute', 'Cambridge_Bay', 'Inuvik', 'Atikokan', 'Blanc-Sablon', 'Nipigon', 'Thunder_Bay',
  'Rainy_River', 'Pangnirtung'
].map(c => 'America/' + c);

const PLACE = {
  'Africa/Lagos': 'Nigeria',
  'Europe/London': 'UK',
  'Europe/Belfast': 'UK',
  'Europe/Dublin': 'Ireland',
  'America/New_York': 'US Eastern',
  'America/Chicago': 'US Central',
  'America/Denver': 'US Mountain',
  'America/Los_Angeles': 'US Pacific',
  'Africa/Accra': 'Ghana',
  'Africa/Johannesburg': 'South Africa',
  'Africa/Nairobi': 'Kenya'
};
CANADA.forEach(z => { PLACE[z] = 'Canada'; });

// Some zones have no common letters in every browser (Intl prints "GMT+1"), so pin them.
const FIXED_ABBR = { 'Africa/Lagos': 'WAT', 'Africa/Accra': 'GMT', 'Africa/Nairobi': 'EAT', 'Africa/Johannesburg': 'SAST' };

export const viewerTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

const abbrIn = (locale, date, tz) => {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(date).find(p => p.type === 'timeZoneName')?.value || '';
  } catch { return ''; }
};

// "EST", "EDT", "GMT", "BST", "WAT" ... (changes with daylight saving, so it needs the date)
export const tzAbbr = (date = new Date(), tz = viewerTimeZone()) => {
  if (FIXED_ABBR[tz]) return FIXED_ABBR[tz];
  let a = abbrIn('en-US', date, tz);
  if (/^(GMT|UTC)[+-]/.test(a)) {
    const gb = abbrIn('en-GB', date, tz);
    if (gb && !/^(GMT|UTC)[+-]/.test(gb)) a = gb;
  }
  return a;
};

// "Canada time (EST)", "UK time (GMT)", "Nigeria time (WAT)", "Dubai time (GMT+4)"
export const tzLabel = (date = new Date(), tz = viewerTimeZone()) => {
  const d = date instanceof Date ? date : new Date(date);
  const place = PLACE[tz] || (tz.split('/').pop() || tz).replace(/_/g, ' ');
  const abbr = tzAbbr(isNaN(d) ? new Date() : d, tz);
  return abbr ? `${place} time (${abbr})` : `${place} time`;
};

/* ---------- entering class times in a chosen time zone ---------- */

// Zones offered in the schedule forms. The viewer's own zone is added if missing.
export const ZONE_OPTIONS = [
  { tz: 'Africa/Lagos', label: 'Nigeria time' },
  { tz: 'Europe/London', label: 'UK time' },
  { tz: 'America/Toronto', label: 'Canada – Eastern (Toronto, Ottawa, Montreal)' },
  { tz: 'America/Halifax', label: 'Canada – Atlantic (Halifax)' },
  { tz: 'America/St_Johns', label: 'Canada – Newfoundland' },
  { tz: 'America/Winnipeg', label: 'Canada – Central (Winnipeg)' },
  { tz: 'America/Regina', label: 'Canada – Saskatchewan' },
  { tz: 'America/Edmonton', label: 'Canada – Mountain (Calgary, Edmonton)' },
  { tz: 'America/Vancouver', label: 'Canada – Pacific (Vancouver)' },
  { tz: 'America/New_York', label: 'US – Eastern' },
  { tz: 'America/Chicago', label: 'US – Central' },
  { tz: 'America/Los_Angeles', label: 'US – Pacific' },
  { tz: 'Europe/Dublin', label: 'Ireland' },
  { tz: 'Africa/Accra', label: 'Ghana' }
];

export const zoneOptions = () => {
  const mine = viewerTimeZone();
  return ZONE_OPTIONS.some(z => z.tz === mine)
    ? ZONE_OPTIONS
    : [{ tz: mine, label: `${(mine.split('/').pop() || mine).replace(/_/g, ' ')} time` }, ...ZONE_OPTIONS];
};

// Minutes ahead of UTC that `tz` is at the instant `date`.
const offsetMinutes = (date, tz) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
};

// "2026-11-09T17:00" read as a wall-clock time in `tz` -> real Date.
export const zonedToUtc = (local, tz = viewerTimeZone()) => {
  const m = String(local || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date(NaN);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let t = guess - offsetMinutes(new Date(guess), tz) * 60000;
  t = guess - offsetMinutes(new Date(t), tz) * 60000; // settle across clock changes
  return new Date(t);
};

// Date/ISO -> "2026-11-09T16:00" as the clock reads in `tz` (for datetime-local inputs).
export const utcToZonedInput = (value, tz = viewerTimeZone()) => {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${String(+p.hour % 24).padStart(2, '0')}:${p.minute}`;
};

// Remember which zone a student's classes are entered in, per browser.
export const recallStudentZone = (studentId) => {
  try { return (studentId && localStorage.getItem('classTz:' + studentId)) || viewerTimeZone(); } catch { return viewerTimeZone(); }
};
export const rememberStudentZone = (studentId, tz) => {
  try { if (studentId && tz) localStorage.setItem('classTz:' + studentId, tz); } catch { /* storage blocked */ }
};

/* ---------- showing a class in the zone it was booked in ---------- */

// The zone a class was booked in (the student's), saved with the class.
// Older classes have none: use the zone remembered for that student, else the viewer's.
export const classZone = (sch) => {
  const tz = sch && sch.time_zone;
  if (tz) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { /* unknown zone */ }
  }
  return recallStudentZone(sch && sch.student_id);
};

const inZone = (d, tz, opts, kind) => {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  try { return date[kind]([], { ...opts, timeZone: tz }); } catch { return date[kind]([], opts); }
};
// Date / time / day-of-month as the clock reads in `tz`.
export const dateIn = (d, tz, opts) => inZone(d, tz, opts, 'toLocaleDateString');
export const timeIn = (d, tz, opts = { hour: '2-digit', minute: '2-digit' }) => inZone(d, tz, opts, 'toLocaleTimeString');
export const dateTimeIn = (d, tz, opts) => inZone(d, tz, opts, 'toLocaleString');

// "5:00 PM Nigeria time (WAT)" for a Date, in the viewer's own zone.
export const fmtInViewerZone = (d) => d && !isNaN(d)
  ? `${d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} ${tzLabel(d)}`
  : '';
