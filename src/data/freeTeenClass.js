// Free 6-week "Future-Ready Teens" class (church outreach). Shared by the
// /tbn-teens page; the flyer uses the same wording so they never disagree.
// Built from three real FoundaXia courses, two Saturdays each, using their existing lessons.

export const FREE_CLASS = {
  name: 'Future-Ready Teens',
  tagline: 'Tech & Digital Skills',
  when: 'Every Saturday',
  where: 'Online (Zoom / Google Meet)',
  start: 'Starting soon',
  // Saved on each registration so these sign-ups are easy to spot in the admin Students list.
  tag: 'FREE 6-WEEK TEEN TECH CLASS',
  // Questions go to the FoundaXia WhatsApp line (same number as the site footer).
  whatsappDisplay: '+234 906 181 4608',
  whatsappLink: 'https://wa.me/2349061814608?text=' + encodeURIComponent('Hello FoundaXia, I have a question about the free 6-week class for teenagers.')
};

export const FREE_CLASS_COURSES = [
  {
    title: 'AI Fluency: The Journey from Data to Intelligent',
    short: 'AI Fluency',
    image: '/images/ai.jpg',
    summary: 'Discover how machines learn from data and act “smart”.',
    weeks: [
      { title: 'What Is AI? From Data to Intelligence', text: 'Natural vs. artificial, senses vs. sensors.' },
      { title: 'Build with AI', text: 'Train your own AI model, then create with AI tools.' }
    ]
  },
  {
    title: 'Computing Systems and Networks: The Internet',
    short: 'The Internet',
    image: '/images/course-internet.jpg',
    summary: 'How the internet works, and how to use it wisely and safely.',
    weeks: [
      { title: 'How the Internet Works', text: 'Networks, routers and the World Wide Web.' },
      { title: 'Websites, Ownership & Truth Online', text: 'Who owns what online, and spotting false information.' }
    ]
  },
  {
    title: 'Modelling Data Using Spreadsheets',
    short: 'Spreadsheets',
    image: '/images/student5.jpg',
    summary: 'Turn data into answers, graphs and charts. Data is beautiful!',
    weeks: [
      { title: 'Getting to Know Spreadsheets', text: 'Cells, formulas and quick calculations.' },
      { title: 'Become a Data Master', text: 'Analyse real data and turn it into charts.' }
    ]
  }
];

export const SCHOOL_CLASSES = ['Primary School', 'Junior Secondary (JSS 1–3)', 'Senior Secondary (SS 1–3)', 'University / Polytechnic', 'Other'];
