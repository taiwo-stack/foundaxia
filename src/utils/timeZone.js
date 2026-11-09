// Class times are stored as one universal moment and shown in the VIEWER's own clock.
// These helpers label that clock so nobody has to guess, e.g. "5:00 PM Canada time (EST)".

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
