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
    summary: 'This activity introduces students to Artificial Intelligence in a developmentally appropriate manner! Students explore the difference between artificial and natural items and learn how machines act “smart” by using sensors and more!',
    weeks: [
      { title: 'Natural vs. Artificial & What Is AI?', text: 'Tell natural things from human-made ones, then explore what intelligence is and how people build machines that can think.' },
      { title: 'Senses, Sensors & Meeting an AI Robot', text: 'Compare human senses with machine sensors, learn the key AI words, and explore an AI robot through live games.' }
    ]
  },
  {
    title: 'Computing Systems and Networks: The Internet',
    short: 'The Internet',
    image: '/images/course-internet.jpg',
    summary: 'Learners will explore how the internet works as a network of networks and why it needs to be kept secure. They will understand the relationship between the internet and the World Wide Web, explore online content and ownership, and learn what they can access, create, and share. They will also evaluate online information for accuracy and reliability and understand the consequences of false information. This unit requires internet-connected devices, with Chrome Music Lab used to demonstrate content creation on the Web.',
    weeks: [
      { title: 'How the Internet Works', text: 'See how networks and routers connect to form the internet, and how the internet differs from the World Wide Web.' },
      { title: 'Websites, Ownership & Truth Online', text: 'Take apart a website, learn who owns what you see online, and spot false or unreliable information.' }
    ]
  },
  {
    title: 'Modelling Data Using Spreadsheets',
    short: 'Spreadsheets',
    image: '/images/student5.jpg',
    summary: 'Introduce your learners to the wonderful world of spreadsheets and the concept of cell referencing. Ask them to collect, analyse, and manipulate data, before turning it into graphs and charts. Data is beautiful!',
    weeks: [
      { title: 'Getting to Know Spreadsheets', text: 'Rows, columns and cell references, then quick calculations with your first formulas and autofill.' },
      { title: 'Become a Data Master', text: 'Collect real data and analyse it with SUM, MAX, MIN and AVERAGE, then turn it into charts.' }
    ]
  }
];

export const SCHOOL_CLASSES = ['Primary School', 'Junior Secondary (JSS 1–3)', 'Senior Secondary (SS 1–3)', 'University / Polytechnic', 'Other'];
