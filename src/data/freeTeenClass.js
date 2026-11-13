// Free 6-week "Future-Ready Teens" class (church outreach). Shared by the
// /tbn-teens page; the flyer uses the same wording so they never disagree.
// Two courses, three Saturdays each: data first, then AI (AI learns from data).

export const FREE_CLASS = {
  name: 'Future-Ready Teens',
  tagline: 'Tech & Digital Skills',
  when: 'Every Saturday',
  where: 'Online (Zoom / Google Meet)',
  start: 'Starts Saturday 28 November',
  // Saved on each registration as the student's start date.
  startDate: '2026-11-28',
  // Saved on each registration so these sign-ups are easy to spot in the admin Students list.
  tag: 'FREE 6-WEEK TEEN TECH CLASS',
  // Questions go to the FoundaXia WhatsApp line (same number as the site footer).
  whatsappDisplay: '+234 906 181 4608',
  whatsappLink: 'https://wa.me/2349061814608?text=' + encodeURIComponent('Hello FoundaXia, I have a question about the free 6-week class for teenagers.')
};

export const FREE_CLASS_COURSES = [
  {
    title: 'Spreadsheet Data Master',
    short: 'Spreadsheets & Data',
    image: '/images/student5.jpg',
    summary: 'Collect real data, find the patterns and turn them into charts.',
    weeks: [
      { title: 'Getting to Know Spreadsheets', text: 'Cells, formulas and quick calculations.' },
      { title: 'Collecting Real Data', text: 'Run a survey of the group, then clean and sort the answers.' },
      { title: 'Tell a Story with Data', text: 'Find patterns, make charts and present what the data shows.' }
    ]
  },
  {
    title: 'AI Fluency: The Journey from Data to Intelligence',
    short: 'Artificial Intelligence',
    image: '/images/ai.jpg',
    summary: 'Discover how machines learn from data, and use AI wisely and safely.',
    weeks: [
      { title: 'What Is AI? From Data to Intelligence', text: 'How machines learn rules from examples.' },
      { title: 'Train Your Own AI', text: 'Train an AI model and see how good data makes better AI.' },
      { title: 'Create with AI, Wisely', text: 'Create with AI tools, check what AI tells you, and get your certificate.' }
    ]
  }
];

export const SCHOOL_CLASSES = ['Primary School', 'Junior Secondary (JSS 1–3)', 'Senior Secondary (SS 1–3)', 'University / Polytechnic', 'Other'];
