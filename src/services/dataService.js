import { supabase, hasSupabaseConfig } from '../supabaseClient';

const initialMockUsers = [
  { id: 'admin_mock_id', email: 'admin@foundaxia.com', password: 'admin123', role: 'admin', full_name: 'Administrator' },
  { id: 's1', email: 'student@foundaxia.com', password: 'student123', role: 'student', full_name: 'Tobi Coker' }
];

// --- MOCK DATA ---
const initialTutors = [];

const initialStudents = [
  { id: 's1', profile_id: 's1', full_name: 'Tobi Coker', phone: '08034567890', email: 'student@foundaxia.com', date_of_birth: '2012-05-15', gender: 'male', grade_level: 'Grade 6', special_needs: 'None', program: 'tutoring', schedule: 'afternoon', start_date: '2026-01-10', additional_comments: 'Prefers virtual lectures.', avatar_url: '' }
];

const initialBookings = [
  { id: 'b1', student_name: 'Tobi Coker', parent_name: 'David Coker', phone: '08034567890', email: 'student@foundaxia.com', tutor_id: null, tutor_name: 'Unassigned', booking_date: '2026-07-02', booking_time: '14:00', meeting_type: 'virtual', status: 'approved', created_at: new Date().toISOString() }
];

const initialMessages = [
  { id: 'm1', name: 'David Coker', email: 'david@coker.com', phone: '08034567890', subject: 'Weekend Class Shift', message: 'Hello, I want to inquire if Tobi can have an extra session this weekend.', created_at: new Date().toISOString() }
];

const initialCourseCategories = [
  { id: 'cat_math', name: 'Math', description: 'Mathematics and quantitative courses' },
  { id: 'cat_english', name: 'English & Reading', description: 'Reading, writing, and language arts' },
  { id: 'cat_science', name: 'Science', description: 'Natural and physical sciences' },
  { id: 'cat_testprep', name: 'Test Prep', description: 'Preparation for examinations like JAMB, WAEC, NECO, SAT, ACT' },
  { id: 'cat_languages', name: 'World Languages', description: 'Spanish, French, and world language courses' },
  { id: 'cat_coding', name: 'Coding & Tech', description: 'Software programming and future technology skills' }
];

const initialCourses = [
  // Math
  { id: 'c_math_elem', title: 'Elementary Math', description: 'Building strong number sense, core arithmetic, fractions, decimals, and basic geometric shapes.', category: 'Math', course_type: 'regular', image_url: '/images/book1.jpg' },
  { id: 'c_math_prealg', title: 'Pre-Algebra', description: 'Transitioning from arithmetic to algebraic thinking with variables, proportions, and equations.', category: 'Math', course_type: 'regular', image_url: '/images/book1.jpg' },
  { id: 'c_math_alg', title: 'Algebra I & II', description: 'Solving complex equations, graphing functions, inequalities, logarithms, and quadratic relationships.', category: 'Math', course_type: 'regular', image_url: '/images/book1.jpg' },
  { id: 'c_math_geom', title: 'Geometry', description: 'Exploring Euclidean geometry, shapes, similarity, proofs, and foundational trigonometry principles.', category: 'Math', course_type: 'regular', image_url: '/images/book1.jpg' },
  { id: 'c_math_trig', title: 'Trigonometry', description: 'Comprehensive study of trigonometric functions, circular logic, laws of sines/cosines, and graphing waves.', category: 'Math', course_type: 'regular', image_url: '/images/book1.jpg' },
  { id: 'c_math_calc', title: 'Calculus', description: 'Limits, derivatives, integrals, and their application to physics and mathematics systems.', category: 'Math', course_type: 'regular', image_url: '/images/book1.jpg' },
  
  // English & Reading
  { id: 'c_eng_phonics', title: 'Phonics', description: 'Early child decoding skills, sounds, word combinations, and introductory reading exercises.', category: 'English & Reading', course_type: 'regular', image_url: '/images/book2.jpg' },
  { id: 'c_eng_compre', title: 'Reading Comprehension', description: 'Developing active reading habits, extracting core ideas, context clues, and summarizing text structure.', category: 'English & Reading', course_type: 'regular', image_url: '/images/book2.jpg' },
  { id: 'c_eng_creative', title: 'Creative Writing', description: 'Drafting stories, building fictional worlds, and refining voice and tone.', category: 'English & Reading', course_type: 'regular', image_url: '/images/book2.jpg' },
  { id: 'c_eng_essay', title: 'Essay Writing', description: 'Constructing five-paragraph outlines, narrative descriptions, arguments, and academic research papers.', category: 'English & Reading', course_type: 'regular', image_url: '/images/book2.jpg' },
  { id: 'c_eng_lit', title: 'Literature', description: 'Exploring classical books, plays, thematic motifs, character development, and narrative arcs.', category: 'English & Reading', course_type: 'regular', image_url: '/images/book2.jpg' },
  
  // Science
  { id: 'c_sci_life', title: 'Life Science', description: 'Basic structures of cells, plant systems, food cycles, and elementary biological traits.', category: 'Science', course_type: 'regular', image_url: '/images/child online.jpg' },
  { id: 'c_sci_bio', title: 'Biology', description: 'Microscopic organisms, cell mitosis, genetics, DNA transcription, and human anatomy systems.', category: 'Science', course_type: 'regular', image_url: '/images/child online.jpg' },
  { id: 'c_sci_chem', title: 'Chemistry', description: 'Periodic table structure, atomic bonding, stoichiometry equations, acid/base balances, and lab procedures.', category: 'Science', course_type: 'regular', image_url: '/images/child online.jpg' },
  { id: 'c_sci_phys', title: 'Physics', description: 'Mechanics, Newton laws, velocity vectors, work-energy theorems, waves, and electrical currents.', category: 'Science', course_type: 'regular', image_url: '/images/child online.jpg' },
  { id: 'c_sci_earth', title: 'Earth Science', description: 'Rock formations, plate tectonics, weather cycles, water conservation, and planetary astronomy.', category: 'Science', course_type: 'regular', image_url: '/images/child online.jpg' },
  
  // Test Prep
  { id: 'c_tp_jamb', title: 'JAMB Prep', description: 'Nigeria Joint Admissions and Matriculation Board exam preparation (UTME). Key past questions and exam strategies.', category: 'Test Prep', course_type: 'special', image_url: '/images/whyus.jpg' },
  { id: 'c_tp_waec', title: 'WAEC Prep', description: 'West African Examinations Council senior school certificate prep. Core syllabus walkthroughs.', category: 'Test Prep', course_type: 'special', image_url: '/images/whyus.jpg' },
  { id: 'c_tp_neco', title: 'NECO Prep', description: 'National Examinations Council exam preparation. Full subject drills and tips.', category: 'Test Prep', course_type: 'special', image_url: '/images/whyus.jpg' },
  { id: 'c_tp_postutme', title: 'Post-UTME Prep', description: 'University-specific Post-UTME screening prep for candidate selection success.', category: 'Test Prep', course_type: 'special', image_url: '/images/whyus.jpg' },
  { id: 'c_tp_sat', title: 'SAT Prep', description: 'College Board SAT reasoning test prep covering reading, writing, and math strategy.', category: 'Test Prep', course_type: 'special', image_url: '/images/whyus.jpg' },
  { id: 'c_tp_act', title: 'ACT Prep', description: 'Comprehensive ACT exam review covering English, math, reading, and science reasoning.', category: 'Test Prep', course_type: 'special', image_url: '/images/whyus.jpg' },
  { id: 'c_tp_state', title: 'State Assessments', description: 'Preparation for localized state tests and benchmark standard compliance assessments.', category: 'Test Prep', course_type: 'special', image_url: '/images/whyus.jpg' },
  
  // World Languages
  { id: 'c_lang_spanish', title: 'Spanish', description: 'Introduction to Spanish vocabulary, grammar rules, and conversational dialogues.', category: 'World Languages', course_type: 'regular', image_url: '/images/book2.jpg' },
  { id: 'c_lang_french', title: 'French', description: 'Foundational French syntax, pronouns, spelling rules, and listening comprehension.', category: 'World Languages', course_type: 'regular', image_url: '/images/book2.jpg' },
  
  // Coding & Tech
  { id: 'c_code_intro', title: 'Intro to Coding', description: 'Learn basic block logic, scratch sequences, loop parameters, and coding structures.', category: 'Coding & Tech', course_type: 'special', image_url: '/images/boylearning.jpg' },
  { id: 'c_code_cs', title: 'Computer Science Fundamentals', description: 'Understanding machine architectures, data variables, array lists, and memory paradigms.', category: 'Coding & Tech', course_type: 'special', image_url: '/images/boylearning.jpg' }
];

const initialTopics = [
  { id: 'tp1', course_id: 'c_code_intro', title: 'HTML5 Semantic Web', description: 'Introduction to document outlines, elements, and layout trees.', sort_order: 1 },
  { id: 'tp2', course_id: 'c_code_intro', title: 'CSS3 Flexbox & Grid', description: 'Flexible layouts, margins, relative sizes, and media-query responses.', sort_order: 2 },
  { id: 'tp3', course_id: 'c_code_intro', title: 'React Hooks & State', description: 'Managing interactive client states using useState, useEffect, and custom hooks.', sort_order: 3 },
  { id: 'tp4', course_id: 'c_math_elem', title: 'Narrative Essay Outline', description: 'Structuring introductions, build-ups, and logical conclusions in writing.', sort_order: 1 }
];

const initialMaterials = [
  { id: 'mat1', course_id: 'c_code_intro', topic_id: 'tp1', title: 'HTML5 Reference Guide PDF', file_url: 'https://www.w3.org/html/html5-cheat-sheet.pdf', file_type: 'pdf' },
  { id: 'mat2', course_id: 'c_code_intro', topic_id: 'tp2', title: 'Flexbox Cheatsheet Image', file_url: 'https://css-tricks.com/flexbox-poster.png', file_type: 'image' }
];

const initialCourseTutors = [];

const initialStudentCourses = [
  { student_id: 's1', course_id: 'c1', tutor_id: null, assigned_at: new Date().toISOString() },
  { student_id: 's1', course_id: 'c2', tutor_id: null, assigned_at: new Date().toISOString() }
];

const initialTasks = [
  { 
    id: 'tk1', 
    course_id: 'c1', 
    topic_id: 'tp1', 
    title: 'HTML Structural Syntax Test', 
    description: 'Solve this interactive quiz to review layout elements.', 
    task_type: 'quiz', 
    max_points: 100,
    quiz_questions: [
      { question: 'Which tag defines a header container?', options: ['<head>', '<header>', '<hgroup>'], correct: 1 },
      { question: 'What is the correct tag for a line break?', options: ['<br>', '<lb>', '<break>'], correct: 0 }
    ]
  },
  { id: 'tk2', course_id: 'c1', topic_id: 'tp3', title: 'React To-Do List Application', description: 'Build a small list application managing items in a React state array.', task_type: 'assignment', max_points: 100 }
];

const initialStudentTasks = [
  { id: 'st1', task_id: 'tk1', student_id: 's1', submission_text: 'Completed Quiz. Score: 100%', grade: 100, feedback: 'Excellent structural understanding!', submitted_at: new Date(Date.now() - 36000000).toISOString(), graded_at: new Date().toISOString(), graded_by: null }
];

const initialSchedules = [
  {
    id: 'sch1',
    student_id: 's1',
    course_id: 'c1',
    tutor_id: 'tutor_mock_id',
    title: 'HTML & CSS Foundations Class',
    start_time: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    meeting_link: 'https://zoom.us/j/1111111111',
    meeting_link_2: 'https://zoom.us/j/2222222222',
    scheduled_date: new Date().toISOString().split('T')[0]
  },
  {
    id: 'sch2',
    student_id: 's1',
    course_id: 'c1',
    tutor_id: 'tutor_mock_id',
    title: 'CSS Grid & Flexbox Deep Dive',
    start_time: new Date(Date.now() + 26 * 3600 * 1000).toISOString(),
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    scheduled_date: new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0]
  },
  {
    id: 'sch3',
    student_id: 's1',
    course_id: 'c2',
    tutor_id: 'tutor_mock_id',
    title: 'Javascript Functions & Scope',
    start_time: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    scheduled_date: new Date().toISOString().split('T')[0]
  }
];
const initialAttendance = [];
const initialAnnouncements = [];
const initialChatMessages = [];

const initLocalStorage = () => {
  if (!localStorage.getItem('lc_users')) {
    localStorage.setItem('lc_users', JSON.stringify(initialMockUsers));
  }
  if (!localStorage.getItem('lc_tutors')) {
    localStorage.setItem('lc_tutors', JSON.stringify(initialTutors));
  }
  if (!localStorage.getItem('lc_students')) {
    localStorage.setItem('lc_students', JSON.stringify(initialStudents));
  }
  if (!localStorage.getItem('lc_bookings')) {
    localStorage.setItem('lc_bookings', JSON.stringify(initialBookings));
  }
  if (!localStorage.getItem('lc_messages')) {
    localStorage.setItem('lc_messages', JSON.stringify(initialMessages));
  }
  if (!localStorage.getItem('lc_course_categories')) {
    localStorage.setItem('lc_course_categories', JSON.stringify(initialCourseCategories));
  }
  if (!localStorage.getItem('lc_courses')) {
    localStorage.setItem('lc_courses', JSON.stringify(initialCourses));
  }
  if (!localStorage.getItem('lc_topics')) {
    localStorage.setItem('lc_topics', JSON.stringify(initialTopics));
  }
  if (!localStorage.getItem('lc_materials')) {
    localStorage.setItem('lc_materials', JSON.stringify(initialMaterials));
  }
  if (!localStorage.getItem('lc_course_tutors')) {
    localStorage.setItem('lc_course_tutors', JSON.stringify(initialCourseTutors));
  }
  if (!localStorage.getItem('lc_student_courses')) {
    localStorage.setItem('lc_student_courses', JSON.stringify(initialStudentCourses));
  }
  if (!localStorage.getItem('lc_tasks')) {
    localStorage.setItem('lc_tasks', JSON.stringify(initialTasks));
  }
  if (!localStorage.getItem('lc_student_tasks')) {
    localStorage.setItem('lc_student_tasks', JSON.stringify(initialStudentTasks));
  }
  if (!localStorage.getItem('lc_schedules')) {
    localStorage.setItem('lc_schedules', JSON.stringify(initialSchedules));
  }
  if (!localStorage.getItem('lc_attendance')) {
    localStorage.setItem('lc_attendance', JSON.stringify(initialAttendance));
  }
  if (!localStorage.getItem('lc_announcements')) {
    localStorage.setItem('lc_announcements', JSON.stringify(initialAnnouncements));
  }
  if (!localStorage.getItem('lc_chat_messages')) {
    localStorage.setItem('lc_chat_messages', JSON.stringify(initialChatMessages));
  }
};

// --- DATA SERVICES ---


export const getTutors = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('tutors').select('*');
    if (error) throw error;
    // Tutor rows don't store the login email; fill it from profiles where the caller
    // may read them (admins see all; others just get no email - best effort).
    const { data: profiles } = await supabase.from('profiles').select('id, email');
    const emailById = new Map((profiles || []).map(p => [String(p.id), p.email]));
    return data.map(t => ({
      ...t,
      email: t.email || emailById.get(String(t.profile_id || t.id)) || t.email
    }));
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_tutors'));
  }
};

// Public tutor directory for the landing page. Logged-out visitors can't read the
// tutors table (RLS); the public_tutors view exposes only profile fields. Falls back to
// the table if the view hasn't been created yet.
export const getPublicTutors = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('public_tutors').select('*');
    if (!error) return data;
    console.warn('public_tutors view unavailable, falling back to tutors table:', error.message);
    return getTutors();
  }
  return getTutors();
};

export const saveTutor = async (tutor) => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('tutors').insert([tutor]).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const tutors = JSON.parse(localStorage.getItem('lc_tutors'));
    const newTutor = { id: 't_' + crypto.randomUUID(), rating: 5.0, ...tutor };
    tutors.push(newTutor);
    localStorage.setItem('lc_tutors', JSON.stringify(tutors));
    return newTutor;
  }
};

export const updateTutor = async (id, updates) => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('tutors').update(updates).eq('id', id).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const tutors = JSON.parse(localStorage.getItem('lc_tutors'));
    const idx = tutors.findIndex(t => t.id === id);
    if (idx !== -1) {
      tutors[idx] = { ...tutors[idx], ...updates };
      localStorage.setItem('lc_tutors', JSON.stringify(tutors));
      return tutors[idx];
    }
    throw new Error('Tutor not found');
  }
};

export const deleteTutor = async (id) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('tutors').delete().eq('id', id);
    if (error) throw error;
  } else {
    initLocalStorage();
    let tutors = JSON.parse(localStorage.getItem('lc_tutors'));
    tutors = tutors.filter(t => t.id !== id);
    localStorage.setItem('lc_tutors', JSON.stringify(tutors));
  }
};

export const getStudents = async () => {
  if (hasSupabaseConfig) {
    try {
      // 1. Fetch all student records
      const { data: students, error: studentError } = await supabase.from('students').select('*');
      if (studentError) throw studentError;

      // 2. Fetch all profile IDs to accurately identify active login accounts
      const { data: profiles, error: profileError } = await supabase.from('profiles').select('id');
      if (profileError) throw profileError;
      const activeUserIds = new Set((profiles || []).map(p => String(p.id)));

      return students.map(s => {
        // A student has a login if their row id OR linked profile_id is a profile.
        const isActive = activeUserIds.has(String(s.id)) || (s.profile_id != null && activeUserIds.has(String(s.profile_id)));
        return {
          ...s,
          is_active: isActive,
          status: isActive ? 'approved' : (s.status || 'pending')
        };
      });
    } catch (err) {
      console.error('Error in getStudents:', err.message);
      // Fallback: select just student records and default status
      const { data: students, error: studentError } = await supabase.from('students').select('*');
      if (studentError) throw studentError;
      return students.map(s => ({
        ...s,
        is_active: false,
        status: s.status || 'pending'
      }));
    }
  } else {
    initLocalStorage();
    const students = JSON.parse(localStorage.getItem('lc_students'));
    const users = JSON.parse(localStorage.getItem('lc_users'));
    return students.map(s => {
      const isActive = users.some(u => u.id === s.id);
      return {
        ...s,
        is_active: isActive,
        status: isActive ? 'approved' : (s.status || 'pending')
      };
    });
  }
};

export const registerStudent = async (student) => {
  let savedStudent;
  if (hasSupabaseConfig) {
    // Map variables cleanly matching the database schema columns
    const dbPayload = {
      full_name: student.full_name,
      phone: student.phone,
      email: student.email,
      date_of_birth: student.date_of_birth,
      gender: student.gender,
      grade_level: student.grade_level,
      special_needs: student.special_needs,
      program: student.program,
      schedule: student.schedule,
      start_date: student.start_date,
      additional_comments: student.additional_comments,
      avatar_url: student.avatar_url,
      parent_name: student.parentName || student.parent_name || null,
      parent_email: student.email || student.parent_email || null,
      relationship: student.relationship || null,
      previous_school: student.previous_school || null,
      emergency_name: student.emergencyName || student.emergency_name || null,
      emergency_phone: student.emergencyPhone || student.emergency_phone || null,
      address: student.address || null
    };

    // Missing dates are stored as NULL (not today's date, which looked like real data).
    // Requires the NOT NULL constraint to be dropped - see rls_followup.sql.
    if (!dbPayload.date_of_birth) dbPayload.date_of_birth = null;
    if (!dbPayload.start_date) dbPayload.start_date = null;
    if (dbPayload.gender === '') dbPayload.gender = null;

    const studentId = self.crypto.randomUUID();
    // No .select(): anonymous visitors may INSERT a pending registration but are not
    // allowed to read the students table back (see enable_rls.sql).
    const newStudent = { id: studentId, status: 'pending', ...dbPayload };
    const { error } = await supabase.from('students').insert([newStudent]);
    if (error) throw error;
    savedStudent = newStudent;
  } else {
    initLocalStorage();
    const students = JSON.parse(localStorage.getItem('lc_students'));
    const studentId = 's_' + crypto.randomUUID();
    savedStudent = { id: studentId, status: 'pending', ...student };
    students.push(savedStudent);
    localStorage.setItem('lc_students', JSON.stringify(students));
  }

  return savedStudent;
};

export const updateStudent = async (id, updates) => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('students').update(updates).eq('id', id).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const students = JSON.parse(localStorage.getItem('lc_students'));
    const idx = students.findIndex(s => s.id === id);
    if (idx !== -1) {
      students[idx] = { ...students[idx], ...updates };
      localStorage.setItem('lc_students', JSON.stringify(students));
      return students[idx];
    }
    throw new Error('Student not found');
  }
};

export const deleteStudent = async (id) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) throw error;
  } else {
    initLocalStorage();
    let students = JSON.parse(localStorage.getItem('lc_students'));
    students = students.filter(s => s.id !== id);
    localStorage.setItem('lc_students', JSON.stringify(students));
  }
};

// Admin: delete a student/tutor record AND their login (auth user + profile), so a
// removed user can't keep signing in. Server side, via /api/admin-action.
export const deleteUserAccount = async (kind, id) => {
  if (kind !== 'student' && kind !== 'tutor') throw new Error('Unknown account type: ' + kind);
  if (hasSupabaseConfig) {
    return await callAdminApi('deleteUserAccount', { kind, id });
  }
  if (kind === 'student') await deleteStudent(id); else await deleteTutor(id);
  initLocalStorage();
  const users = JSON.parse(localStorage.getItem('lc_users'));
  localStorage.setItem('lc_users', JSON.stringify(users.filter(u => u.id !== id || u.role === 'admin')));
};

export const getBookings = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('bookings').select('*');
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_bookings'));
  }
};

export const createBooking = async (booking) => {
  // Sanitize date fields — Postgres DATE column rejects empty strings and 'N/A'
  const sanitizeDate = (val) => {
    if (!val || val === '' || val === 'N/A' || val === 'null') return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : val;
  };

  const cleanBooking = {
    ...booking,
    booking_date: sanitizeDate(booking.booking_date),
  };

  let savedBooking;
  if (hasSupabaseConfig) {
    // No .select(): public visitors can create bookings but not read them back.
    const { error } = await supabase.from('bookings').insert([cleanBooking]);
    if (error) {
      // If the error is about missing columns (timezone/message not yet migrated),
      // retry without those fields so the booking still saves.
      // Only for an undefined-column error that names one of the optional columns -
      // anything else (e.g. a NOT NULL violation) must surface, not silently drop data.
      const isMissingColumn = (error.code === '42703' || error.code === 'PGRST204') &&
        /timezone|message/.test(error.message || '');
      if (isMissingColumn) {
        console.warn(
          '[LearnCil] bookings table is missing timezone/message columns. ' +
          'Run the migration in Supabase SQL Editor:\n' +
          'ALTER TABLE public.bookings\n' +
          '  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT \'Africa/Lagos\',\n' +
          '  ADD COLUMN IF NOT EXISTS message TEXT;\n' +
          'Saving booking without those fields for now.'
        );
        const { timezone, message, ...coreBooking } = cleanBooking;
        const { error: retryError } = await supabase.from('bookings').insert([coreBooking]);
        if (retryError) throw retryError;
        savedBooking = coreBooking;
      } else {
        throw error;
      }
    } else {
      savedBooking = cleanBooking;
    }
  } else {
    initLocalStorage();
    const bookings = JSON.parse(localStorage.getItem('lc_bookings'));
    savedBooking = { 
      id: 'b_' + crypto.randomUUID(), 
      status: 'pending', 
      created_at: new Date().toISOString(),
      ...cleanBooking
    };
    bookings.push(savedBooking);
    localStorage.setItem('lc_bookings', JSON.stringify(bookings));
  }

  return savedBooking;
};

export const updateBookingStatus = async (id, status) => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('bookings').update({ status }).eq('id', id).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const bookings = JSON.parse(localStorage.getItem('lc_bookings'));
    const idx = bookings.findIndex(b => b.id === id);
    if (idx !== -1) {
      bookings[idx].status = status;
      localStorage.setItem('lc_bookings', JSON.stringify(bookings));
      return bookings[idx];
    }
    throw new Error('Booking not found');
  }
};

export const deleteBooking = async (id) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) throw error;
  } else {
    initLocalStorage();
    let bookings = JSON.parse(localStorage.getItem('lc_bookings'));
    bookings = bookings.filter(b => b.id !== id);
    localStorage.setItem('lc_bookings', JSON.stringify(bookings));
  }
};

export const getContactMessages = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('contact_messages').select('*');
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_messages'));
  }
};

export const createContactMessage = async (msg) => {
  if (hasSupabaseConfig) {
    // No .select(): public visitors can send messages but not read them back.
    const { error } = await supabase.from('contact_messages').insert([msg]);
    if (error) throw error;
    return msg;
  } else {
    initLocalStorage();
    const messages = JSON.parse(localStorage.getItem('lc_messages'));
    const newMsg = {
      id: 'm_' + crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...msg
    };
    messages.push(newMsg);
    localStorage.setItem('lc_messages', JSON.stringify(messages));
    return newMsg;
  }
};

// --- AUTHENTICATION SERVICES ---

export const signIn = async (email, password) => {
  if (hasSupabaseConfig) {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (authError) throw authError;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      throw new Error(`Profile not found for authenticated user: ${profileError.message}`);
    }

    let fullName = profile.full_name || 'User';
    let profileRecordId = authData.user.id;

    if (profile.role === 'student') {
      // Try matching by id first (students.id = auth user id), then profile_id
      const { data: studentById } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('id', authData.user.id)
        .single();
      if (studentById) {
        fullName = studentById.full_name || fullName;
        profileRecordId = studentById.id;
      } else {
        const { data: studentByProfile } = await supabase
          .from('students')
          .select('id, full_name')
          .eq('profile_id', authData.user.id)
          .single();
        if (studentByProfile) {
          fullName = studentByProfile.full_name || fullName;
          profileRecordId = studentByProfile.id;
        }
      }
    } else if (profile.role === 'tutor') {
      // Try matching by id first (tutors.id = auth user id), then profile_id
      const { data: tutorById } = await supabase
        .from('tutors')
        .select('id, full_name')
        .eq('id', authData.user.id)
        .single();
      if (tutorById) {
        fullName = tutorById.full_name || fullName;
        profileRecordId = tutorById.id;
      } else {
        const { data: tutorByProfile } = await supabase
          .from('tutors')
          .select('id, full_name')
          .eq('profile_id', authData.user.id)
          .single();
        if (tutorByProfile) {
          fullName = tutorByProfile.full_name || fullName;
          profileRecordId = tutorByProfile.id;
        }
      }
    } else {
      fullName = profile.full_name || 'Administrator';
    }

    return {
      id: profileRecordId,
      profile_id: authData.user.id,
      email: authData.user.email,
      role: profile.role,
      full_name: fullName
    };
  } else {
    initLocalStorage();
    const users = JSON.parse(localStorage.getItem('lc_users'));
    const matched = users.find(
      u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!matched) throw new Error('Invalid email or password.');
    // Same shape as Supabase mode, and never leak the stored password into sessionStorage.
    return {
      id: matched.id,
      profile_id: matched.id,
      email: matched.email,
      role: matched.role,
      full_name: matched.full_name
    };
  }
};

export const signOut = async () => {
  if (hasSupabaseConfig) {
    // Detach this device's push subscription first (needs the still-valid session),
    // so the next person to use this browser doesn't get this user's chat alerts.
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
    } catch (err) {
      console.warn('Could not remove push subscription on sign-out:', err);
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
};

const callAdminApi = (action, payload) => callAuthedApi('/api/admin-action', { action, ...payload });

const callAuthedApi = async (path, body) => {
  const sessionResponse = await supabase.auth.getSession();
  const token = sessionResponse?.data?.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated.');
  }

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const rawText = await response.text();
  let result;
  try {
    result = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(`Server returned an invalid response (status ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(result.error || 'Request failed');
  }
  return result;
};

export const createStudentAccount = async (email, password, studentData) => {
  if (hasSupabaseConfig) {
    return await callAdminApi('createStudentAccount', { email, password, studentData });
  } else {
    initLocalStorage();
    const users = JSON.parse(localStorage.getItem('lc_users'));
    let students = JSON.parse(localStorage.getItem('lc_students'));

    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('An account with this email already exists.');
    }

    // Filter out any temporary lead student record with the same email
    students = students.filter(s => s.email.toLowerCase() !== email.toLowerCase());

    const newUserId = 's_' + crypto.randomUUID();
    users.push({
      id: newUserId,
      email,
      password,
      role: 'student',
      full_name: studentData.full_name
    });
    localStorage.setItem('lc_users', JSON.stringify(users));

    const newStudent = { id: newUserId, profile_id: newUserId, ...studentData };
    students.push(newStudent);
    localStorage.setItem('lc_students', JSON.stringify(students));

    return newStudent;
  }
};

export const activateStudentAccount = async (studentId, email, password) => {
  if (hasSupabaseConfig) {
    return await callAdminApi('activateStudentAccount', { studentId, email, password });
  } else {
    initLocalStorage();
    const users = JSON.parse(localStorage.getItem('lc_users'));
    const students = JSON.parse(localStorage.getItem('lc_students'));

    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('An account with this email already exists.');
    }

    const idx = students.findIndex(s => s.id === studentId);
    if (idx === -1) throw new Error('Student record not found.');

    const newUserId = 's_' + crypto.randomUUID();
    users.push({
      id: newUserId,
      email,
      password,
      role: 'student',
      full_name: students[idx].full_name
    });
    localStorage.setItem('lc_users', JSON.stringify(users));

    // Update existing student reference
    students[idx].id = newUserId;
    students[idx].profile_id = newUserId;
    students[idx].email = email;
    students[idx].status = 'approved';
    localStorage.setItem('lc_students', JSON.stringify(students));

    return students[idx];
  }
};

export const resetUserPassword = async (userId, newPassword) => {
  if (hasSupabaseConfig) {
    return await callAdminApi('resetUserPassword', { userId, newPassword });
  } else {
    initLocalStorage();
    const users = JSON.parse(localStorage.getItem('lc_users'));
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx].password = newPassword;
      localStorage.setItem('lc_users', JSON.stringify(users));
    }
  }
};

export const createTutorAccount = async (email, password, tutorData) => {
  if (hasSupabaseConfig) {
    return await callAdminApi('createTutorAccount', { email, password, tutorData });
  } else {
    initLocalStorage();
    const users = JSON.parse(localStorage.getItem('lc_users'));
    const tutors = JSON.parse(localStorage.getItem('lc_tutors'));

    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('An account with this email already exists.');
    }

    const newUserId = 't_' + crypto.randomUUID();

    users.push({
      id: newUserId,
      email,
      password,
      role: 'tutor',
      full_name: tutorData.full_name
    });
    localStorage.setItem('lc_users', JSON.stringify(users));

    const newTutor = { id: newUserId, profile_id: newUserId, rating: 5.0, ...tutorData };
    tutors.push(newTutor);
    localStorage.setItem('lc_tutors', JSON.stringify(tutors));

    return newTutor;
  }
};

export const uploadAvatar = async (userId, file) => {
  if (hasSupabaseConfig) {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `avatar_${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (err) {
      // Don't silently store a multi-MB base64 data URL in the row (or '' wiping the
      // existing avatar) - let the caller show the real error.
      throw new Error('Avatar upload failed: ' + (err.message || err));
    }
  } else {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  }
};

// 0. Categories CRUD
export const getCourseCategories = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('course_categories').select('*');
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_course_categories'));
  }
};

export const saveCourseCategory = async (category) => {
  if (hasSupabaseConfig) {
    if (category.id) {
      const { data, error } = await supabase.from('course_categories').update(category).eq('id', category.id).select();
      if (error) throw error;
      return data[0];
    } else {
      const catId = 'cat_' + crypto.randomUUID();
      const { data, error } = await supabase.from('course_categories').insert([{ id: catId, ...category }]).select();
      if (error) throw error;
      return data[0];
    }
  } else {
    initLocalStorage();
    const categories = JSON.parse(localStorage.getItem('lc_course_categories'));
    if (category.id) {
      const idx = categories.findIndex(c => c.id === category.id);
      if (idx !== -1) {
        categories[idx] = { ...categories[idx], ...category };
        localStorage.setItem('lc_course_categories', JSON.stringify(categories));
        return categories[idx];
      }
      throw new Error('Category not found');
    } else {
      const catId = 'cat_' + crypto.randomUUID();
      const newCategory = { id: catId, ...category };
      categories.push(newCategory);
      localStorage.setItem('lc_course_categories', JSON.stringify(categories));
      return newCategory;
    }
  }
};

export const deleteCourseCategory = async (id) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('course_categories').delete().eq('id', id);
    if (error) throw error;
  } else {
    initLocalStorage();
    let categories = JSON.parse(localStorage.getItem('lc_course_categories'));
    categories = categories.filter(c => c.id !== id);
    localStorage.setItem('lc_course_categories', JSON.stringify(categories));
  }
};

// 1. Courses CRUD
export const getCourses = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('courses').select('*');
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_courses'));
  }
};

export const saveCourse = async (course) => {
  if (hasSupabaseConfig) {
    if (course.id) {
      const { data, error } = await supabase.from('courses').update(course).eq('id', course.id).select();
      if (error) throw error;
      return data[0];
    } else {
      const courseId = 'c_' + crypto.randomUUID();
      const { data, error } = await supabase.from('courses').insert([{ id: courseId, ...course }]).select();
      if (error) throw error;
      return data[0];
    }
  } else {
    initLocalStorage();
    const courses = JSON.parse(localStorage.getItem('lc_courses'));
    if (course.id) {
      const idx = courses.findIndex(c => c.id === course.id);
      if (idx !== -1) {
        courses[idx] = { ...courses[idx], ...course };
        localStorage.setItem('lc_courses', JSON.stringify(courses));
        return courses[idx];
      }
      throw new Error('Course not found');
    } else {
      const courseId = 'c_' + crypto.randomUUID();
      const newCourse = { id: courseId, ...course };
      courses.push(newCourse);
      localStorage.setItem('lc_courses', JSON.stringify(courses));
      return newCourse;
    }
  }
};

export const deleteCourse = async (id) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) throw error;
  } else {
    initLocalStorage();
    let courses = JSON.parse(localStorage.getItem('lc_courses'));
    courses = courses.filter(c => c.id !== id);
    localStorage.setItem('lc_courses', JSON.stringify(courses));
  }
};

// 2. Topics CRUD
export const getTopics = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('topics').select('*').order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_topics')).sort((a, b) => a.sort_order - b.sort_order);
  }
};

export const saveTopic = async (topic) => {
  const topicId = 'tp_' + crypto.randomUUID();
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('topics').insert([{ id: topicId, ...topic }]).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const topics = JSON.parse(localStorage.getItem('lc_topics'));
    const newTopic = { id: topicId, ...topic };
    topics.push(newTopic);
    localStorage.setItem('lc_topics', JSON.stringify(topics));
    return newTopic;
  }
};

export const deleteTopic = async (id) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('topics').delete().eq('id', id);
    if (error) throw error;
  } else {
    initLocalStorage();
    let topics = JSON.parse(localStorage.getItem('lc_topics'));
    topics = topics.filter(t => t.id !== id);
    localStorage.setItem('lc_topics', JSON.stringify(topics));
  }
};

export const updateTopic = async (id, updates) => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('topics').update(updates).eq('id', id).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const topics = JSON.parse(localStorage.getItem('lc_topics'));
    const idx = topics.findIndex(t => t.id === id);
    if (idx !== -1) {
      topics[idx] = { ...topics[idx], ...updates };
      localStorage.setItem('lc_topics', JSON.stringify(topics));
      return topics[idx];
    }
    throw new Error('Topic not found');
  }
};

// 3. Materials Upload & CRUD
export const uploadMaterialFile = async (fileName, file) => {
  if (hasSupabaseConfig) {
    try {
      const fileExt = file.name.split('.').pop();
      const uniquePath = `mat_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('materials')
        .upload(uniquePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('materials').getPublicUrl(uniquePath);
      return data.publicUrl;
    } catch (err) {
      throw new Error('File upload failed: ' + (err.message || err));
    }
  } else {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  }
};

export const getMaterials = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('course_materials').select('*');
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_materials'));
  }
};

export const saveMaterial = async (material) => {
  const materialId = 'mat_' + crypto.randomUUID();
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('course_materials').insert([{ id: materialId, ...material }]).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const materials = JSON.parse(localStorage.getItem('lc_materials'));
    const newMaterial = { id: materialId, ...material };
    materials.push(newMaterial);
    localStorage.setItem('lc_materials', JSON.stringify(materials));
    return newMaterial;
  }
};

export const deleteMaterial = async (id) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('course_materials').delete().eq('id', id);
    if (error) throw error;
  } else {
    initLocalStorage();
    let materials = JSON.parse(localStorage.getItem('lc_materials'));
    materials = materials.filter(m => m.id !== id);
    localStorage.setItem('lc_materials', JSON.stringify(materials));
  }
};

// 4. Course Tutors Junction
export const getCourseTutors = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('course_tutors').select('*');
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_course_tutors'));
  }
};

export const assignTutorToCourse = async (courseId, tutorId) => {
  if (hasSupabaseConfig) {
    const { data: existing, error: exErr } = await supabase.from('course_tutors')
      .select('*').eq('course_id', courseId).eq('tutor_id', tutorId).limit(1);
    if (exErr) throw exErr;
    if (existing && existing.length > 0) return existing[0];
    const { data, error } = await supabase.from('course_tutors').insert([{ course_id: courseId, tutor_id: tutorId }]).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const items = JSON.parse(localStorage.getItem('lc_course_tutors'));
    if (!items.some(x => x.course_id === courseId && x.tutor_id === tutorId)) {
      items.push({ course_id: courseId, tutor_id: tutorId });
      localStorage.setItem('lc_course_tutors', JSON.stringify(items));
    }
    return { course_id: courseId, tutor_id: tutorId };
  }
};

export const removeTutorFromCourse = async (courseId, tutorId) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('course_tutors').delete().eq('course_id', courseId).eq('tutor_id', tutorId);
    if (error) throw error;
  } else {
    initLocalStorage();
    let items = JSON.parse(localStorage.getItem('lc_course_tutors'));
    items = items.filter(x => !(x.course_id === courseId && x.tutor_id === tutorId));
    localStorage.setItem('lc_course_tutors', JSON.stringify(items));
  }
};

// 5. Student Courses Enrolments
export const getStudentCourses = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('student_courses').select('*');
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_student_courses'));
  }
};

export const enrollStudentInCourse = async (studentId, courseId, tutorId) => {
  if (hasSupabaseConfig) {
    const { data: existing, error: exErr } = await supabase.from('student_courses')
      .select('*').eq('student_id', studentId).eq('course_id', courseId).limit(1);
    if (exErr) throw exErr;
    if (existing && existing.length > 0) {
      // Already enrolled: just update the assigned tutor instead of adding a duplicate.
      const { data, error } = await supabase.from('student_courses').update({ tutor_id: tutorId })
        .eq('student_id', studentId).eq('course_id', courseId).select();
      if (error) throw error;
      return data[0];
    }
    const { data, error } = await supabase.from('student_courses').insert([{ student_id: studentId, course_id: courseId, tutor_id: tutorId }]).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const enrollments = JSON.parse(localStorage.getItem('lc_student_courses'));
    const idx = enrollments.findIndex(x => x.student_id === studentId && x.course_id === courseId);
    const item = { student_id: studentId, course_id: courseId, tutor_id: tutorId, assigned_at: new Date().toISOString() };
    if (idx !== -1) {
      enrollments[idx] = item;
    } else {
      enrollments.push(item);
    }
    localStorage.setItem('lc_student_courses', JSON.stringify(enrollments));
    return item;
  }
};

export const unenrollStudentFromCourse = async (studentId, courseId) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('student_courses').delete().eq('student_id', studentId).eq('course_id', courseId);
    if (error) throw error;
  } else {
    initLocalStorage();
    let enrollments = JSON.parse(localStorage.getItem('lc_student_courses'));
    enrollments = enrollments.filter(x => !(x.student_id === studentId && x.course_id === courseId));
    localStorage.setItem('lc_student_courses', JSON.stringify(enrollments));
  }
};

export const updateStudentEnrollment = async (studentId, oldCourseId, newCourseId, newTutorId) => {
  if (hasSupabaseConfig) {
    if (oldCourseId !== newCourseId) {
      // Insert the new enrollment first so a failed insert can't leave the student
      // with no enrollment at all.
      const { data, error: insErr } = await supabase
        .from('student_courses')
        .insert([{ student_id: studentId, course_id: newCourseId, tutor_id: newTutorId }])
        .select();
      if (insErr) throw insErr;

      const { error: delErr } = await supabase
        .from('student_courses')
        .delete()
        .eq('student_id', studentId)
        .eq('course_id', oldCourseId);
      if (delErr) throw delErr;
      return data[0];
    } else {
      const { data, error } = await supabase
        .from('student_courses')
        .update({ tutor_id: newTutorId })
        .eq('student_id', studentId)
        .eq('course_id', oldCourseId)
        .select();
      if (error) throw error;
      return data[0];
    }
  } else {
    initLocalStorage();
    const enrollments = JSON.parse(localStorage.getItem('lc_student_courses'));
    const idx = enrollments.findIndex(x => x.student_id === studentId && x.course_id === oldCourseId);
    if (idx !== -1) {
      if (oldCourseId !== newCourseId) {
        enrollments.splice(idx, 1);
        const item = { student_id: studentId, course_id: newCourseId, tutor_id: newTutorId, assigned_at: new Date().toISOString() };
        enrollments.push(item);
        localStorage.setItem('lc_student_courses', JSON.stringify(enrollments));
        return item;
      } else {
        enrollments[idx].tutor_id = newTutorId;
        localStorage.setItem('lc_student_courses', JSON.stringify(enrollments));
        return enrollments[idx];
      }
    }
    throw new Error('Enrollment not found.');
  }
};

// 6. Tasks CRUD (Assignments & Quizzes)
export const getTasks = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('tasks').select('*');
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_tasks'));
  }
};

export const saveTask = async (task) => {
  if (hasSupabaseConfig) {
    if (task.id) {
      const { data, error } = await supabase.from('tasks').update(task).eq('id', task.id).select();
      if (error) throw error;
      return data[0];
    } else {
      const taskId = 'tk_' + crypto.randomUUID();
      const { data, error } = await supabase.from('tasks').insert([{ id: taskId, ...task }]).select();
      if (error) throw error;
      return data[0];
    }
  } else {
    initLocalStorage();
    const tasks = JSON.parse(localStorage.getItem('lc_tasks'));
    if (task.id) {
      const idx = tasks.findIndex(tk => tk.id === task.id);
      if (idx !== -1) {
        tasks[idx] = { ...tasks[idx], ...task };
        localStorage.setItem('lc_tasks', JSON.stringify(tasks));
        return tasks[idx];
      }
      throw new Error('Task not found');
    } else {
      const taskId = 'tk_' + crypto.randomUUID();
      const newTask = { id: taskId, ...task };
      tasks.push(newTask);
      localStorage.setItem('lc_tasks', JSON.stringify(tasks));
      return newTask;
    }
  }
};

export const deleteTask = async (id) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  } else {
    initLocalStorage();
    let tasks = JSON.parse(localStorage.getItem('lc_tasks'));
    tasks = tasks.filter(t => t.id !== id);
    localStorage.setItem('lc_tasks', JSON.stringify(tasks));
  }
};

// 7. Student Submissions & Grading
export const getStudentTasks = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('student_tasks').select('*');
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_student_tasks'));
  }
};

// Student-facing task list. In Supabase mode students can't read the tasks table
// directly (it contains the quiz answer key); /api/quiz returns their tasks with the
// correct answers removed.
export const getTasksForStudent = async () => {
  if (hasSupabaseConfig) {
    const result = await callAuthedApi('/api/quiz', { action: 'list' });
    return result.tasks || [];
  }
  return getTasks();
};

const parseQuestions = (raw) => {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch { return []; }
};

// Submit quiz answers (array of selected option indexes). Graded on the server; the
// submission row gets grade = points out of the task's max_points.
// Returns { submission, correctCount, total, percent, correctAnswers }.
export const submitQuiz = async (taskId, answers) => {
  if (hasSupabaseConfig) {
    return await callAuthedApi('/api/quiz', { action: 'submit', taskId, answers });
  }
  // Mock mode: grade locally.
  const task = (await getTasks()).find(t => t.id === taskId);
  if (!task) throw new Error('Quiz not found.');
  const questions = parseQuestions(task.quiz_questions);
  const correctAnswers = questions.map(q => q.correct);
  const correctCount = questions.filter((q, i) => answers[i] === q.correct).length;
  const percent = questions.length ? Math.round((correctCount / questions.length) * 100) : 0;
  const maxPoints = Number(task.max_points) || 100;
  const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
  const submission = await submitStudentTask({
    task_id: taskId,
    student_id: user.id,
    submission_text: `Interactive Quiz completed. Score: ${percent}% (${correctCount}/${questions.length} correct).`,
    grade: Math.round((percent / 100) * maxPoints),
    graded_at: new Date().toISOString()
  });
  return { submission, correctCount, total: questions.length, percent, correctAnswers };
};

export const submitStudentTask = async (submission) => {
  const submissionId = 'st_' + crypto.randomUUID();
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('student_tasks').insert([{ id: submissionId, ...submission }]).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const submissions = JSON.parse(localStorage.getItem('lc_student_tasks'));
    const newSub = { id: submissionId, submitted_at: new Date().toISOString(), ...submission };
    submissions.push(newSub);
    localStorage.setItem('lc_student_tasks', JSON.stringify(submissions));
    return newSub;
  }
};

export const gradeStudentTask = async (id, grade, feedback, tutorId) => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('student_tasks')
      .update({ grade, feedback, graded_at: new Date().toISOString(), graded_by: tutorId })
      .eq('id', id)
      .select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const submissions = JSON.parse(localStorage.getItem('lc_student_tasks'));
    const idx = submissions.findIndex(s => s.id === id);
    if (idx !== -1) {
      submissions[idx].grade = Number(grade);
      submissions[idx].feedback = feedback;
      submissions[idx].graded_at = new Date().toISOString();
      submissions[idx].graded_by = tutorId;
      localStorage.setItem('lc_student_tasks', JSON.stringify(submissions));
      return submissions[idx];
    }
    throw new Error('Submission not found');
  }
};

// 8. Class Schedules CRUD
export const getSchedules = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('schedules').select('*');
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_schedules'));
  }
};

export const saveSchedule = async (schedule) => {
  const scheduleId = 'sch_' + crypto.randomUUID();
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('schedules').insert([{ id: scheduleId, ...schedule }]).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const items = JSON.parse(localStorage.getItem('lc_schedules'));
    const newSch = { id: scheduleId, ...schedule };
    items.push(newSch);
    localStorage.setItem('lc_schedules', JSON.stringify(items));
    return newSch;
  }
};

export const updateSchedule = async (id, updates) => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('schedules').update(updates).eq('id', id).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const items = JSON.parse(localStorage.getItem('lc_schedules'));
    const idx = items.findIndex(s => s.id === id);
    if (idx !== -1) {
      items[idx] = { ...items[idx], ...updates };
      localStorage.setItem('lc_schedules', JSON.stringify(items));
      return items[idx];
    }
    throw new Error('Schedule not found');
  }
};

export const deleteSchedule = async (id) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('schedules').delete().eq('id', id);
    if (error) throw error;
  } else {
    initLocalStorage();
    let items = JSON.parse(localStorage.getItem('lc_schedules'));
    items = items.filter(s => s.id !== id);
    localStorage.setItem('lc_schedules', JSON.stringify(items));
  }
};

// 8b. Live Whiteboard Sessions
export const createLiveSession = async (session) => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('live_sessions').insert([session]).select();
    if (error) throw error;
    return data[0];
  }
  return session;
};

// A session row only ever disappears when the host explicitly clicks "End Session" -
// if they instead just close the tab (crash, forgot, lost connection), nothing ever
// deletes it and the join banner would otherwise show on the student's dashboard forever.
// Anything older than this is treated as abandoned rather than actually still live.
const LIVE_SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours - generous for one sitting, short enough to self-heal same day

export const getLiveSessionsForStudent = async (studentId) => {
  if (hasSupabaseConfig) {
    // .contains() sends a Postgres array literal here instead of JSON, which this
    // project's PostgREST rejects against a jsonb column - .filter('cs', ...) with an
    // explicit JSON string is the encoding that actually works (confirmed against
    // another jsonb array column, tasks.target_student_ids).
    const { data, error } = await supabase
      .from('live_sessions')
      .select('*')
      .filter('student_ids', 'cs', JSON.stringify([studentId]));
    if (error) throw error;

    const now = Date.now();
    const fresh = [];
    const expired = [];
    (data || []).forEach((session) => {
      if (now - new Date(session.created_at).getTime() > LIVE_SESSION_MAX_AGE_MS) {
        expired.push(session.id);
      } else {
        fresh.push(session);
      }
    });
    if (expired.length > 0) {
      // Best-effort tidy-up so abandoned rows don't pile up - never blocks returning the
      // still-live sessions, and a failure here just means they get caught again next poll.
      supabase.from('live_sessions').delete().in('id', expired).then(() => {}, () => {});
    }
    return fresh;
  }
  return [];
};

export const endLiveSession = async (id) => {
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('live_sessions').delete().eq('id', id);
    if (error) throw error;
  }
};

// 9. Attendance CRUD
export const getAttendance = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('attendance').select('*');
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_attendance'));
  }
};

export const markAttendance = async (attendance) => {
  const attendanceId = 'att_' + crypto.randomUUID();
  if (hasSupabaseConfig) {
    // Match mock mode: a re-mark replaces the earlier record for this class + student
    // instead of piling up rows whose order on reload is undefined.
    const { error: delErr } = await supabase
      .from('attendance')
      .delete()
      .eq('schedule_id', attendance.schedule_id)
      .eq('student_id', attendance.student_id);
    if (delErr) throw delErr;
    const { data, error } = await supabase.from('attendance').insert([{ id: attendanceId, ...attendance }]).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const items = JSON.parse(localStorage.getItem('lc_attendance'));
    const newAtt = { id: attendanceId, marked_at: new Date().toISOString(), ...attendance };
    // Remove past duplicates
    const filtered = items.filter(x => !(x.schedule_id === attendance.schedule_id && x.student_id === attendance.student_id));
    filtered.push(newAtt);
    localStorage.setItem('lc_attendance', JSON.stringify(filtered));
    return newAtt;
  }
};

// 10. Announcements CRUD
export const getAnnouncements = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('course_announcements').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_announcements')).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
};

export const createAnnouncement = async (announcement) => {
  const announcementId = 'an_' + crypto.randomUUID();
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('course_announcements').insert([{ id: announcementId, ...announcement }]).select();
    if (error) throw error;
    return data[0];
  } else {
    initLocalStorage();
    const items = JSON.parse(localStorage.getItem('lc_announcements'));
    const newAnn = { id: announcementId, created_at: new Date().toISOString(), ...announcement };
    items.push(newAnn);
    localStorage.setItem('lc_announcements', JSON.stringify(items));
    return newAnn;
  }
};

// 11. Chat Messages Messages CRUD
export const getChatMessages = async () => {
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('chat_messages').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  } else {
    initLocalStorage();
    return JSON.parse(localStorage.getItem('lc_chat_messages')).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }
};

export const sendChatMessage = async (msg) => {
  const { sender_name: _senderName, ...dbMsg } = msg; // display-only field, not a DB column
  const chatMessageId = 'ch_' + crypto.randomUUID();
  if (hasSupabaseConfig) {
    const { data, error } = await supabase.from('chat_messages').insert([{ id: chatMessageId, ...dbMsg }]).select();
    if (error) throw error;
    const saved = data[0];
    notifyNewMessage(saved);
    return saved;
  } else {
    initLocalStorage();
    const items = JSON.parse(localStorage.getItem('lc_chat_messages'));
    const newMsg = { id: chatMessageId, created_at: new Date().toISOString(), ...dbMsg };
    items.push(newMsg);
    localStorage.setItem('lc_chat_messages', JSON.stringify(items));
    return newMsg;
  }
};

export const markMessagesRead = async (ids) => {
  if (!ids || ids.length === 0) return;
  if (hasSupabaseConfig) {
    const { error } = await supabase.from('chat_messages').update({ read: true }).in('id', ids);
    if (error) throw error;
  } else {
    initLocalStorage();
    const items = JSON.parse(localStorage.getItem('lc_chat_messages'));
    const updated = items.map(m => ids.includes(m.id) ? { ...m, read: true } : m);
    localStorage.setItem('lc_chat_messages', JSON.stringify(updated));
  }
};

// Best-effort push notification for a newly-sent message. Never allowed to make
// sendChatMessage itself fail - a lost notification is fine, a lost message isn't.
const notifyNewMessage = async (message) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      // Only the message id: the server loads the message itself and checks the caller
      // actually sent it, so nobody can push arbitrary text to arbitrary users.
      body: JSON.stringify({ messageId: message.id })
    });
  } catch (_) {}
};

// Saved through the server: a browser's endpoint may already be registered to another
// account that used this device, which RLS rightly won't let this user overwrite.
export const savePushSubscription = async (userId, subscription) => {
  if (!hasSupabaseConfig) return;
  const { endpoint, keys } = subscription.toJSON ? subscription.toJSON() : subscription;
  await callAuthedApi('/api/push-subscription', { action: 'save', userId, subscription: { endpoint, keys } });
};

export const removePushSubscription = async (endpoint) => {
  if (!hasSupabaseConfig) return;
  try {
    await callAuthedApi('/api/push-subscription', { action: 'remove', endpoint });
  } catch (err) {
    console.warn('Could not remove push subscription:', err.message);
  }
};
