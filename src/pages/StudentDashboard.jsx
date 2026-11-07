import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  getBookings, getStudents, updateStudent, updateBookingStatus, uploadAvatar,
  getStudentCourses, getCourses, getTutors, getCourseTutors,
  getTopics, getMaterials, uploadMaterialFile,
  getTasksForStudent, submitQuiz, getStudentTasks, submitStudentTask,
  getSchedules, getAttendance,
  getAnnouncements,
  getChatMessages, sendChatMessage, markMessagesRead,
  getLiveSessionsForStudent
} from '../services/dataService';
import {
  Calendar, User, BookOpen, Clock, Save,
  MessageSquare, FileText, Send, CheckSquare, Award, X, Megaphone, Play, LayoutDashboard, Menu,
  ChevronLeft, History, PanelLeftClose, PanelLeftOpen, CheckCircle2, XCircle, HelpCircle,
  Camera, Mail, Phone, GraduationCap, Copy, Check, Video, MapPin, Lock
} from 'lucide-react';
import ParentArea from '../components/ParentArea';
import MobileMenuSheet from '../components/MobileMenuSheet';
import DrawerAccount from '../components/DrawerAccount';
import useResponsiveTables from '../hooks/useResponsiveTables';
import HtmlSlideModal from '../components/HtmlSlideModal';
import BookingForm from '../components/BookingForm';
import NotificationToggle from '../components/NotificationToggle';
import '../styles/Dashboard.css';
import '../styles/StudentProfile.css';
import '../styles/DashboardMobile.css';
import { personIds, isOneOf, inThread } from '../utils/chatIds';

const formatMessageTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Course banner image helper (mirrors LandingPage logic)
const getSpecialClassImage = (title = '', index = 0) => {
  const t = title.toLowerCase();
  if (t.includes('programming') || t.includes('code') || t.includes('python') || t.includes('java')) return '/images/book4.jpg';
  if (t.includes('ai') || t.includes('intelligence') || t.includes('artificial')) return '/images/ai.jpg';
  if (t.includes('science') || t.includes('data')) return '/images/student5.jpg';
  if (t.includes('excel') || t.includes('word') || t.includes('microsoft') || t.includes('office')) return '/images/student6.jpg';
  if (t.includes('web') || t.includes('design') || t.includes('html')) return '/images/student10.jpg';
  if (t.includes('writing') || t.includes('creative') || t.includes('essay')) return '/images/student3.jpg';
  const images = ['/images/book4.jpg', '/images/ai.jpg', '/images/student5.jpg', '/images/student6.jpg', '/images/student10.jpg', '/images/student3.jpg'];
  return images[index % images.length];
};

// Safely parse quiz_questions whether it arrives as an array or a JSON string
const parseQuizQuestions = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
};

export default function StudentDashboard({ user, onLogout }) {
  // Paystack sends parents back to /student?reference=... when its pop-up couldn't open.
  const [paymentReturnRef, setPaymentReturnRef] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('reference'); } catch { return null; }
  });
  const [activeTab, setActiveTab] = useState(() => (paymentReturnRef ? 'parent' : 'overview'));
  const clearPaymentReturn = useCallback(() => {
    setPaymentReturnRef(null);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  // On phones, start each section at the top.
  useEffect(() => {
    if (window.innerWidth <= 800) window.scrollTo({ top: 0 });
  }, [activeTab]);
  const [bookings, setBookings] = useState([]);
  const [studentInfo, setStudentInfo] = useState(null);
  const [savedStudentInfo, setSavedStudentInfo] = useState(null); // last saved copy, for "unsaved changes"
  const [idCopied, setIdCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const mainRef = useRef(null);
  useResponsiveTables(mainRef, !loading);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop: sidebar can be collapsed to an icon rail; remembered per browser.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('studentSidebarCollapsed') === '1'; } catch { return false; }
  });
  const toggleSidebarCollapsed = () => setSidebarCollapsed(prev => {
    const next = !prev;
    try { localStorage.setItem('studentSidebarCollapsed', next ? '1' : '0'); } catch { /* storage unavailable */ }
    return next;
  });
  const [mobileChatView, setMobileChatView] = useState('list');
  const [viewingSlide, setViewingSlide] = useState(null); // material row being viewed in the embedded HTML slide modal

  // LMS Student state variables
  const [enrollments, setEnrollments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [courseTutors, setCourseTutors] = useState([]);
  const [topics, setTopics] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyLimit, setHistoryLimit] = useState(10);
  const [taskFilter, setTaskFilter] = useState('all'); // Tasks & Grades: all | todo | submitted | graded
  const [announcements, setAnnouncements] = useState([]);

  // Active LMS states
  const [selectedCourseId, setSelectedCourseId] = useState(null);

  // Interactive Quiz state variables
  const [activeQuizId, setActiveQuizId] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(null);
  const [quizCorrectAnswers, setQuizCorrectAnswers] = useState(null); // revealed only after submitting
  const [quizSubmitting, setQuizSubmitting] = useState(false);

  // Homework Submission inputs
  const [activeSubTaskId, setActiveSubTaskId] = useState(null);
  const [subText, setSubText] = useState('');
  const [subFile, setSubFile] = useState(null);

  // Chat states
  const [chatMessages, setChatMessages] = useState([]);
  const chatScrollRef = useRef(null);
  const [activeTutorChat, setActiveTutorChat] = useState(null);
  const [chatInput, setChatInput] = useState('');

  // Load dynamically based on logged-in student details
  const studentId = user?.id;

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const publicUrl = await uploadAvatar(studentInfo?.id || user?.id, file);
      setStudentInfo(prev => ({ ...prev, avatar_url: publicUrl }));
    } catch (err) {
      alert('Failed to upload picture: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Bookings belonging to this student. Match on email; fall back to name only for
  // bookings that have no email. (A null student_name used to throw here and blank the
  // whole dashboard, and name matching showed other same-named students' bookings.)
  const filterMyBookings = (allBookings, student) => {
    const nameToMatch = student?.full_name || user?.full_name;
    const emails = [student?.email, user?.email].filter(Boolean).map(e => e.toLowerCase());
    return allBookings.filter(b => {
      if (b.email) return emails.includes(b.email.toLowerCase());
      return !!nameToMatch && b.student_name?.toLowerCase() === nameToMatch.toLowerCase();
    });
  };

  // Re-read bookings after the student books a new consultation.
  const refreshBookings = async () => {
    try {
      setBookings(filterMyBookings(await getBookings(), studentInfo));
    } catch (err) {
      console.error('Failed to refresh bookings:', err);
    }
  };

  const loadStudentData = async () => {
    try {
      // Load each source independently: one failing request (e.g. the quiz API) must
      // not blank the whole dashboard - that used to hide the chat for some students.
      const safe = (promise, label) => promise.catch(err => {
        console.error(`Failed to load ${label}:`, err);
        return [];
      });
      const [allBookings, allStudents, scList, cList, tList, ctList, tpList, matList, tkList, subList, schList, attList, annList, msgList] = await Promise.all([
        safe(getBookings(), 'bookings'), safe(getStudents(), 'students'), safe(getStudentCourses(), 'enrollments'),
        safe(getCourses(), 'courses'), safe(getTutors(), 'tutors'), safe(getCourseTutors(), 'course tutors'),
        safe(getTopics(), 'topics'), safe(getMaterials(), 'materials'), safe(getTasksForStudent(), 'tasks'),
        safe(getStudentTasks(), 'submissions'), safe(getSchedules(), 'schedules'),
        safe(getAttendance(), 'attendance'), safe(getAnnouncements(), 'announcements'), safe(getChatMessages(), 'chat messages')
      ]);

      const myEmail = user?.email?.toLowerCase();
      const currentStudent =
        allStudents.find(s => s.id === studentId || s.profile_id === studentId) ||
        (myEmail ? allStudents.find(s => s.email?.toLowerCase() === myEmail) : undefined);
      setStudentInfo(currentStudent);
      setSavedStudentInfo(currentStudent || null);

      const actualStudentId = currentStudent?.id || studentId;
      // Records may reference the student by row id or by login id (profile_id).
      const myIds = personIds(currentStudent, studentId);
      const isMine = (x) => isOneOf(x.student_id, myIds);

      setBookings(filterMyBookings(allBookings, currentStudent));

      const studEnroll = scList.filter(isMine);
      setEnrollments(studEnroll);
      setCourses(cList);
      setTutors(tList);
      setCourseTutors(ctList);
      setTopics(tpList);
      setMaterials(matList);
      setTasks(tkList);
      setSubmissions(subList.filter(isMine));
      setSchedules(schList.filter(isMine));
      setAttendanceLogs(attList.filter(isMine));
      setAnnouncements(annList);
      setChatMessages(msgList);

      // Do NOT auto-select a course on load — let student pick from card grid
      // if (studEnroll.length > 0) setSelectedCourseId(studEnroll[0].course_id);
    } catch (err) {
      console.error('Error loading student dashboard details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentData();
  }, [studentId]);

  // Poll for live whiteboard sessions a tutor has started and invited this student to
  const [liveSessions, setLiveSessions] = useState([]);
  useEffect(() => {
    const actualStudentId = studentInfo?.id || studentId;
    if (!actualStudentId) return;
    const checkLiveSessions = async () => {
      try {
        const sessions = await getLiveSessionsForStudent(actualStudentId);
        setLiveSessions(sessions);
      } catch (err) {
        console.error('Error checking live sessions:', err);
      }
    };
    checkLiveSessions();
    const interval = setInterval(checkLiveSessions, 8000);
    return () => clearInterval(interval);
  }, [studentInfo?.id, studentId]);

  // Chat used to load only once; poll so new tutor messages and the unread badge update.
  useEffect(() => {
    if (!studentId) return;
    const refreshChat = async () => {
      try {
        const latest = await getChatMessages();
        setChatMessages(prev => {
          if (prev.length === latest.length && prev.every((m, i) => m.id === latest[i].id && m.read === latest[i].read)) return prev;
          return latest;
        });
      } catch (err) {
        console.error('Error refreshing chat:', err);
      }
    };
    const interval = setInterval(refreshChat, 10000);
    return () => clearInterval(interval);
  }, [studentId]);

  // Keep the open conversation scrolled to the newest message
  const activeThreadLength = activeTutorChat
    ? chatMessages.filter(m => inThread(m, personIds(studentInfo, studentId), personIds(activeTutorChat))).length
    : 0;
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeTutorChat, activeThreadLength, activeTab]);

  // Mark the open conversation's incoming messages read as soon as it's opened
  useEffect(() => {
    if (!activeTutorChat) return;
    const actualStudentId = personIds(studentInfo, studentId);
    const otherId = personIds(activeTutorChat);
    const unreadIds = chatMessages
      .filter(m => isOneOf(m.sender_id, otherId) && isOneOf(m.receiver_id, actualStudentId) && !m.read)
      .map(m => m.id);
    if (unreadIds.length === 0) return;
    markMessagesRead(unreadIds)
      .then(() => setChatMessages(prev => prev.map(m => unreadIds.includes(m.id) ? { ...m, read: true } : m)))
      .catch(err => console.error('Failed to mark messages read:', err));
  }, [activeTutorChat, chatMessages, studentInfo, studentId]);

  // Reflect unread count on the installed app's icon, where supported
  useEffect(() => {
    const actualStudentId = personIds(studentInfo, studentId);
    const count = chatMessages.filter(m => isOneOf(m.receiver_id, actualStudentId) && !m.read).length;
    if ('setAppBadge' in navigator) {
      if (count > 0) navigator.setAppBadge(count).catch(() => {});
      else navigator.clearAppBadge().catch(() => {});
    }
  }, [chatMessages, studentInfo, studentId]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Never allow email, password, or start_date to be updated from the student side
      const { email, password, start_date, ...safeUpdates } = studentInfo;
      await updateStudent(studentInfo.id, safeUpdates);
      setSavedStudentInfo(studentInfo);
      alert('Profile updated successfully!');
    } catch (err) {
      alert('Error updating profile: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;
    try {
      await updateBookingStatus(bookingId, 'cancelled');
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b));
      alert('Booking cancelled successfully.');
    } catch (err) {
      alert('Error cancelling booking: ' + err.message);
    }
  };

  // --- LMS STUDENT HANDLERS ---

  const handleQuizOptionSelect = (qIdx, optIdx) => {
    setQuizAnswers(prev => ({ ...prev, [qIdx]: optIdx }));
  };

  const handleQuizSubmit = async (taskObj) => {
    if (!taskObj || quizSubmitting) return;
    const questions = parseQuizQuestions(taskObj.quiz_questions);
    const unanswered = questions.filter((_, idx) => quizAnswers[idx] === undefined).length;
    if (unanswered > 0 && !window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;

    setQuizSubmitting(true);
    try {
      // Graded on the server: the answer key never reaches the browser beforehand and
      // the saved grade can't be altered client-side.
      const answers = questions.map((_, idx) => (quizAnswers[idx] === undefined ? null : quizAnswers[idx]));
      const result = await submitQuiz(taskObj.id, answers);
      setQuizScore(result.percent);
      setQuizCorrectAnswers(result.correctAnswers || null);
      setSubmissions(prev => [...prev, result.submission]);
      alert(`Quiz completed! You scored ${result.percent}% (${result.correctCount}/${result.total} correct).`);
    } catch (err) {
      alert('Failed to submit quiz: ' + err.message);
    } finally {
      setQuizSubmitting(false);
    }
  };

  const handleHomeworkSubmit = async (e) => {
    e.preventDefault();
    if (!activeSubTaskId || saving) return;
    setSaving(true);
    try {
      let fileUrl = '';
      if (subFile) {
        fileUrl = await uploadMaterialFile('sub_' + Date.now(), subFile);
      }
      const saved = await submitStudentTask({
        task_id: activeSubTaskId,
        student_id: studentInfo?.id || studentId,
        submission_text: subText,
        file_url: fileUrl
      });
      setSubmissions(prev => [...prev, saved]);
      setSubText('');
      setSubFile(null);
      setActiveSubTaskId(null);
      alert('Homework submitted successfully!');
    } catch (err) {
      alert('Error submitting homework: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeTutorChat) return;
    try {
      const saved = await sendChatMessage({
        course_id: selectedCourseId || null,
        sender_id: studentInfo?.profile_id || studentInfo?.id || studentId,
        sender_name: studentInfo?.full_name || user?.full_name || 'A student',
        receiver_id: activeTutorChat.profile_id || activeTutorChat.id,
        message_text: chatInput.trim()
      });
      setChatMessages(prev => [...prev, saved]);
      setChatInput('');
    } catch (err) {
      alert('Failed to send message: ' + err.message);
    }
  };

  // Calculations
  const attendedCount = attendanceLogs.filter(a => a.status === 'attended').length;
  const missedCount = attendanceLogs.filter(a => a.status === 'missed').length;
  const totalClasses = attendedCount + missedCount;
  const attendanceRate = totalClasses > 0 ? Math.round((attendedCount / totalClasses) * 100) : null; // null = nothing marked yet

  // Next Incoming & Today's classes
  const now = new Date();
  // A class only counts as over once it has ENDED, so late students still get the
  // join link. Classes without an end_time are assumed to last one hour.
  const classEnd = (sch) => sch.end_time
    ? new Date(sch.end_time)
    : new Date(new Date(sch.start_time).getTime() + 60 * 60 * 1000);
  const enrolledCourseIds = new Set(enrollments.map(en => en.course_id));
  // Empty string when unknown, so the UI can leave the name out instead of showing a
  // placeholder like "Course · Tutor" that looks like broken data.
  const courseTitleOf = (id) => courses.find(c => c.id === id)?.title || '';
  const tutorNameOf = (id) => tutors.find(t => t.id === id || t.profile_id === id)?.full_name || '';
  const joinMeta = (...parts) => parts.filter(Boolean).join(' · ');
  const fmtDay = (d) => d.toLocaleDateString([], {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
  });
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // Class log: every class that has ended, newest first, with its attendance mark.
  const attendanceBySchedule = new Map(attendanceLogs.map(a => [a.schedule_id, a]));
  const pastSchedules = schedules
    .filter(sch => classEnd(sch) < now)
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  const historyStatusOf = (sch) => attendanceBySchedule.get(sch.id)?.status || 'unmarked';
  const filteredHistory = historyFilter === 'all'
    ? pastSchedules
    : pastSchedules.filter(sch => historyStatusOf(sch) === historyFilter);
  const lastClass = pastSchedules[0] || null;
  // Timetable: classes that haven't ended yet, soonest first.
  const upcomingSchedules = schedules
    .filter(sch => classEnd(sch) >= now)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  // One chat contact per tutor, even if they teach this student in several courses.
  // The tutor comes from the enrollment itself or, when the enrollment has no tutor set,
  // from the tutors assigned to that course.
  const chatEnrollments = (() => {
    const seen = new Set();
    const contacts = [];
    const add = (tutorRef, courseId) => {
      const t = tutors.find(tu => tu.id === tutorRef || tu.profile_id === tutorRef);
      if (!t || seen.has(t.id)) return;
      seen.add(t.id);
      contacts.push({ tutor: t, course_id: courseId });
    };
    enrollments.forEach(en => { if (en.tutor_id) add(en.tutor_id, en.course_id); });
    enrollments.forEach(en => {
      if (en.tutor_id) return;
      courseTutors.filter(ct => ct.course_id === en.course_id).forEach(ct => add(ct.tutor_id, en.course_id));
    });
    return contacts;
  })();
  const todayStr = now.toDateString();

  // Today's classes (all scheduled classes for today)
  const todayClasses = schedules.filter(sch => {
    return new Date(sch.start_time).toDateString() === todayStr;
  });

  // Filter tasks that are actually assigned to this student (active course, not draft, student in target_student_ids if defined)
  const activeStudentTasks = tasks.filter(tk => {
    // 1. Must be enrolled in the task's course
    if (!enrollments.some(e => e.course_id === tk.course_id)) return false;
    // 2. Hide drafts
    if (tk.status === 'draft') return false;
    // 3. If target list exists, student must be in it
    if (tk.target_student_ids && tk.target_student_ids.length > 0) {
      return tk.target_student_ids.includes(studentInfo?.id || studentId);
    }
    return true; // no target list = visible to all course students
  });

  // Next incoming class (future class, sorted by start_time ascending)
  const nextClass = schedules
    .filter(sch => classEnd(sch) > now)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0] || null;

  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ padding: '3rem', color: 'white' }}>Loading Student Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Mobile Sidebar Backdrop Overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Toggle FAB Button */}
      <button
        className="sidebar-toggle-btn"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Floating Unread Messages Badge FAB */}
      {(() => {
        const unreadCount = chatMessages.filter(
          m => isOneOf(m.receiver_id, personIds(studentInfo, studentId)) && !m.read
        ).length;
        return unreadCount > 0 ? (
          <button
            className="unread-fab"
            onClick={() => { setActiveTab('chat'); setSidebarOpen(false); }}
            title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`}
            style={{
              position: 'fixed',
              bottom: '1.5rem',
              right: '1.5rem',
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 20px rgba(124, 58, 237, 0.45)',
              zIndex: 1200,
              transition: 'transform 0.18s, box-shadow 0.18s'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(124,58,237,0.55)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.45)'; }}
          >
            <MessageSquare size={22} />
            <span style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#ef4444',
              color: 'white',
              fontSize: '0.65rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid white',
              lineHeight: 1
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </button>
        ) : null;
      })()}

      {/* Sidebar */}
      <aside className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand-row">
          <div className="sidebar-brand">Student Portal</div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button type="button" className="drawer-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <ul className="sidebar-menu">
          <li className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Dashboard' : undefined} onClick={() => { setActiveTab('overview'); setSidebarOpen(false); }}><LayoutDashboard size={18} /> <span className="sidebar-label">Dashboard</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'courses' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'My Courses' : undefined} onClick={() => { setActiveTab('courses'); setSidebarOpen(false); }}><BookOpen size={18} /> <span className="sidebar-label">My Courses</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'timetable' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Timetable' : undefined} onClick={() => { setActiveTab('timetable'); setSidebarOpen(false); }}><Clock size={18} /> <span className="sidebar-label">Timetable</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'chat' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Tutor Chat' : undefined} onClick={() => { setActiveTab('chat'); setSidebarOpen(false); }}><MessageSquare size={18} /> <span className="sidebar-label">Tutor Chat</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'homework' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Tasks & Grades' : undefined} onClick={() => { setActiveTab('homework'); setSidebarOpen(false); }}><CheckSquare size={18} /> <span className="sidebar-label">Tasks & Grades</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'bookings' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Consultations' : undefined} onClick={() => { setActiveTab('bookings'); setSidebarOpen(false); }}><Calendar size={18} /> <span className="sidebar-label">Consultations</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'profile' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Personal Info' : undefined} onClick={() => { setActiveTab('profile'); setSidebarOpen(false); }}><User size={18} /> <span className="sidebar-label">Personal Info</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'parent' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Parent Area' : undefined} onClick={() => { setActiveTab('parent'); setSidebarOpen(false); }}><Lock size={18} /> <span className="sidebar-label">Parent Area</span></button>
          </li>
        </ul>
        <DrawerAccount user={user} onLogout={onLogout} />
      </aside>

      {/* Main Panel */}
      <MobileMenuSheet
        title="Student Portal"
        items={[
          { key: 'overview', label: 'Dashboard', Icon: LayoutDashboard },
          { key: 'courses', label: 'My Courses', Icon: BookOpen },
          { key: 'timetable', label: 'Timetable', Icon: Clock },
          {
            key: 'chat', label: 'Tutor Chat', Icon: MessageSquare,
            badge: chatMessages.filter(m => isOneOf(m.receiver_id, personIds(studentInfo, studentId)) && !m.read).length
          },
          { key: 'homework', label: 'Tasks & Grades', Icon: CheckSquare },
          { key: 'bookings', label: 'Consultations', Icon: Calendar },
          { key: 'profile', label: 'Personal Info', Icon: User },
          { key: 'parent', label: 'Parent Area', Icon: Lock }
        ]}
        active={activeTab}
        onSelect={(key) => { setActiveTab(key); setSidebarOpen(false); }}
        user={user}
        onLogout={onLogout}
      />

      <main className="dashboard-main" ref={mainRef}>
        {/* Page title for each section, so it's always clear where you are */}
        {(() => {
          const PAGE_INFO = {
            courses: ['My Courses', 'Open a course to see its lessons, materials and quizzes.'],
            timetable: ['Timetable', 'Your upcoming classes, join links and attendance.'],
            chat: ['Tutor Chat', 'Message your tutors directly.'],
            homework: ['Tasks & Grades', 'Homework and quizzes from your tutors, and your results.'],
            bookings: ['Consultations', 'Book a consultation and keep track of your appointments.']
          };
          const info = PAGE_INFO[activeTab];
          if (!info || (activeTab === 'courses' && selectedCourseId)) return null;
          return (
            <div className="st-page-head">
              <h1>{info[0]}</h1>
              <p>{info[1]}</p>
            </div>
          );
        })()}

        {/* Live Whiteboard Session Invite Banner - shown on every tab while active */}
        {liveSessions.length > 0 && liveSessions.map(session => (
          <div key={session.id} style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
            borderRadius: '14px',
            padding: '1rem 1.5rem',
            marginBottom: '1.5rem',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 6px 20px rgba(220, 38, 38, 0.35)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'white', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
              <div>
                <strong style={{ fontSize: '1rem' }}>{session.tutor_name || 'Your tutor'} started a live whiteboard session!</strong>
                <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Join now to collaborate in real time.</div>
              </div>
            </div>
            <button
              onClick={() => window.open(`/whiteboard?room=${session.id}`, '_blank')}
              style={{
                background: 'white',
                color: '#dc2626',
                border: 'none',
                borderRadius: '8px',
                padding: '0.6rem 1.25rem',
                fontWeight: 800,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <Play size={16} /> Join Session
            </button>
          </div>
        ))}

        {/* Tab 0: Overview Dashboard */}
        {activeTab === 'overview' && (
          <div>
            {/* Welcome Banner */}
            <div style={{
              background: 'linear-gradient(135deg, var(--primary-color) 0%, #1a3a6e 100%)',
              borderRadius: '16px',
              padding: '1.25rem 2rem',
              marginBottom: '2rem',
              color: 'white',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <p style={{ margin: '0 0 0.15rem 0', fontSize: '0.85rem', opacity: 0.85 }}>Welcome back,</p>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>
                {studentInfo?.full_name || user?.full_name || 'Student'} 👋
              </h2>
            </div>

            {/* Quick Stats Grid — 4 cards in 2x2 layout (Unread Messages moved to floating FAB) */}
            <div className="dashboard-quick-stats">
              {[
                { label: 'Courses Enrolled', value: enrollments.length, icon: '📚', color: '#4c6ef5', tab: 'courses' },
                { label: 'Upcoming Classes', value: schedules.filter(s => classEnd(s) >= now).length, icon: '📅', color: '#12b886', tab: 'timetable' },
                { label: 'Attendance Rate', value: attendanceRate === null ? '—' : `${attendanceRate}%`, icon: '📊', color: '#3b82f6', tab: 'timetable' },
                { label: 'Pending Tasks', value: activeStudentTasks.filter(t => !submissions.find(s => s.task_id === t.id)).length, icon: '✏️', color: '#f59f00', tab: 'homework' },
              ].map(stat => (
                <div
                  key={stat.label}
                  role="button"
                  tabIndex={0}
                  title={`Open ${stat.label}`}
                  onClick={() => setActiveTab(stat.tab)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab(stat.tab); } }}
                  className="dashboard-stat-card"
                  style={{ borderLeft: `4px solid ${stat.color}` }}
                >
                  <div className="dashboard-stat-icon" style={{ background: `${stat.color}12` }}>{stat.icon}</div>
                  <div className="dashboard-stat-info">
                    <div className="dashboard-stat-value" style={{ color: stat.color }}>{stat.value}</div>
                    <div className="dashboard-stat-label">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Two-Column Dashboard Content Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>

              {/* Left Column: Schedules (Today's & Next Incoming) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* Section: Next Incoming Class */}
                <div className="dashboard-card" style={{ margin: 0, borderTop: '4px solid #10b981' }}>
                  <h3 style={{ marginTop: 0, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--primary-color)' }}>
                    <Clock size={19} /> Next Incoming Class
                  </h3>
                  {nextClass ? (() => {
                    const cTitle = courseTitleOf(nextClass.course_id);
                    const tName = tutorNameOf(nextClass.tutor_id);
                    const classTime = new Date(nextClass.start_time);

                    return (
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-dark)', marginBottom: '0.25rem' }}>
                          {nextClass.title}
                        </div>
                        {(cTitle || tName) && (
                          <div style={{ fontSize: '0.88rem', color: '#4a5568', marginBottom: '0.75rem' }}>
                            {cTitle && <>Subject: <strong style={{ color: 'var(--primary-color)' }}>{cTitle}</strong></>}
                            {cTitle && tName && <> &bull; </>}
                            {tName && <>Tutor: <strong>{tName}</strong></>}
                          </div>
                        )}

                        <div style={{
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: '10px',
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '1rem'
                        }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#166534', fontWeight: 700, display: 'block' }}>Starts At</span>
                            <strong style={{ fontSize: '0.95rem', color: '#14532d' }}>
                              {classTime.toLocaleDateString([], { month: 'short', day: 'numeric' })} &bull; {classTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </strong>
                          </div>
                          {(nextClass.meeting_link || nextClass.meeting_link_2) && (
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {nextClass.meeting_link && (
                                <a
                                  href={nextClass.meeting_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-action approve"
                                  style={{
                                    textDecoration: 'none',
                                    padding: '0.5rem 1rem',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    background: '#10b981',
                                    color: 'white',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
                                  }}
                                >
                                  {nextClass.meeting_link_2 ? 'Join (1st Half)' : 'Join Now'}
                                </a>
                              )}
                              {nextClass.meeting_link_2 && (
                                <a
                                  href={nextClass.meeting_link_2}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn-action approve"
                                  style={{
                                    textDecoration: 'none',
                                    padding: '0.5rem 1rem',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    background: '#10b981',
                                    color: 'white',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
                                  }}
                                >
                                  Join (2nd Half)
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })() : (
                    <div style={{ color: '#718096', fontSize: '0.88rem', padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'flex-start' }}>
                      <span>No upcoming classes scheduled yet. Your tutor will add them here.</span>
                      {lastClass && (
                        <span style={{ fontSize: '0.82rem' }}>
                          Last class: <strong style={{ color: 'var(--text-dark)' }}>{lastClass.title}</strong> on {fmtDay(new Date(lastClass.start_time))}
                        </span>
                      )}
                      {pastSchedules.length > 0 && (
                        <button type="button" className="ch-link-btn" onClick={() => setActiveTab('timetable')}>
                          <History size={14} /> View class history
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Section: Today's Classes */}
                <div className="dashboard-card" style={{ margin: 0 }}>
                  <h3 style={{ marginTop: 0, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--primary-color)' }}>
                    <Calendar size={19} /> Today's Classes
                  </h3>
                  {todayClasses.length === 0 ? (
                    <div style={{ color: '#718096', fontSize: '0.88rem', padding: '0.5rem 0' }}>
                      No classes scheduled for today. Enjoy your day!
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {todayClasses.map(sch => {
                        const cTitle = courseTitleOf(sch.course_id);
                        const tName = tutorNameOf(sch.tutor_id);
                        const classTime = new Date(sch.start_time);
                        const isPast = classEnd(sch) < now;

                        return (
                          <div key={sch.id} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.85rem 1rem',
                            background: '#f7fafc',
                            border: '1px solid #edf2f7',
                            borderRadius: '10px',
                            opacity: isPast ? 0.75 : 1
                          }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-dark)' }}>
                                {sch.title} {isPast && <span style={{ fontSize: '0.75rem', color: '#718096', fontWeight: 'normal' }}>(Ended)</span>}
                              </div>
                              {joinMeta(cTitle, tName) && (
                                <div style={{ fontSize: '0.8rem', color: '#4a5568', marginTop: '0.15rem' }}>
                                  {joinMeta(cTitle, tName)}
                                </div>
                              )}
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary-color)', marginTop: '0.25rem' }}>
                                ⏰ {classTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                            {!isPast && (sch.meeting_link || sch.meeting_link_2) && (
                              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                {sch.meeting_link && (
                                  <a
                                    href={sch.meeting_link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-action approve"
                                    style={{
                                      textDecoration: 'none',
                                      padding: '0.4rem 0.8rem',
                                      fontSize: '0.8rem',
                                      borderRadius: '6px'
                                    }}
                                  >
                                    {sch.meeting_link_2 ? '1st Half' : 'Join'}
                                  </a>
                                )}
                                {sch.meeting_link_2 && (
                                  <a
                                    href={sch.meeting_link_2}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-action approve"
                                    style={{
                                      textDecoration: 'none',
                                      padding: '0.4rem 0.8rem',
                                      fontSize: '0.8rem',
                                      borderRadius: '6px'
                                    }}
                                  >
                                    2nd Half
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column: Announcements */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                {/* Recent Announcements */}
                {announcements.length > 0 ? (
                  <div className="dashboard-card" style={{ margin: 0 }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}>
                      <Megaphone size={18} /> Recent Announcements
                    </h3>
                    {announcements.filter(a => enrolledCourseIds.has(a.course_id)).slice(0, 3).map(ann => (
                      <div key={ann.id} style={{
                        padding: '0.85rem 1rem',
                        background: '#f7fafc',
                        borderRadius: '8px',
                        marginBottom: '0.75rem',
                        borderLeft: '3px solid var(--primary-color)'
                      }}>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.25rem' }}>{ann.title}</div>
                        <div style={{ fontSize: '0.82rem', color: '#4a5568' }}>{ann.announcement || ann.message}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="dashboard-card" style={{ margin: 0 }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}>
                      <Megaphone size={18} /> Announcements
                    </h3>
                    <div style={{ color: '#718096', fontSize: '0.88rem', padding: '0.5rem 0' }}>
                      No announcements at this time.
                    </div>
                  </div>
                )}

              </div>

            </div>
          </div>
        )}

        {/* Tab 1: Consultations */}
        {activeTab === 'bookings' && (
          <div className="consult-layout">
            <div className="dashboard-card consult-form-card">
              <h3><Calendar size={20} color="var(--primary-color)" /> Book a Consultation</h3>
              <BookingForm
                variant="light"
                prefill={{
                  studentName: studentInfo?.full_name || user?.full_name || '',
                  parentName: studentInfo?.parent_name || '',
                  phone: studentInfo?.phone || '',
                  // Login email first: students can only read back bookings under it (RLS).
                  email: user?.email || studentInfo?.email || ''
                }}
                lockedFields={['bookingEmail', 'bookingStudentName']}
                onBooked={refreshBookings}
              />
            </div>

            <div className="dashboard-card consult-log-card">
              <h3><Clock size={20} color="var(--primary-color)" /> My Appointments</h3>
              {bookings.length === 0 ? (
                <div className="consult-empty">
                  <Calendar size={28} />
                  <p>No consultations yet.</p>
                  <span>Book one with the form and it will appear here.</span>
                </div>
              ) : (
                <ul className="consult-list">
                  {[...bookings]
                    .sort((x, y) => String(y.booking_date || '').localeCompare(String(x.booking_date || '')))
                    .map((b) => {
                      const d = b.booking_date ? new Date(`${b.booking_date}T00:00:00`) : null;
                      const validDate = d && !isNaN(d.getTime());
                      const active = b.status !== 'cancelled' && b.status !== 'completed';
                      const tutorLabel = b.tutor_name && b.tutor_name !== 'Unassigned' ? b.tutor_name : 'Tutor to be assigned';
                      return (
                        <li key={b.id} className={`consult-item ${active ? '' : 'is-inactive'}`}>
                          <div className="consult-date">
                            <span className="consult-date-month">{validDate ? d.toLocaleDateString([], { month: 'short' }) : '—'}</span>
                            <span className="consult-date-day">{validDate ? d.getDate() : '?'}</span>
                          </div>
                          <div className="consult-body">
                            <div className="consult-title">{tutorLabel}</div>
                            <div className="consult-meta">
                              <span><Clock size={13} /> {b.booking_time || 'Time TBC'}{b.timezone ? ` · ${b.timezone.replace(/_/g, ' ')}` : ''}</span>
                              <span>
                                {b.meeting_type === 'physical' ? <MapPin size={13} /> : <Video size={13} />}{' '}
                                <span style={{ textTransform: 'capitalize' }}>{b.meeting_type || 'virtual'}</span>
                              </span>
                            </div>
                          </div>
                          <div className="consult-side">
                            <span className={`badge badge-${b.status || 'pending'}`}>{b.status || 'pending'}</span>
                            {active && (
                              <button className="btn-action cancel" onClick={() => handleCancelBooking(b.id)}>Cancel</button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: My Courses Curriculum Reader */}
        {activeTab === 'courses' && (
          <div>
            {enrollments.length === 0 ? (
              <div className="st-empty">
                <BookOpen size={30} />
                <strong>No courses yet</strong>
                <span>You're not enrolled in any classes yet. FoundaXia will add your courses here once they're assigned.</span>
              </div>
            ) : selectedCourseId === null ? (
              /* ── STATE 1: Course Grid List ── */
              <div>
                {!enrollments.some(en => courses.some(co => co.id === en.course_id)) && (
                  <div className="st-empty">
                    <BookOpen size={30} />
                    <strong>Your courses are being set up</strong>
                    <span>You're enrolled, but the course details aren't available yet. Please check back soon or message your tutor.</span>
                  </div>
                )}
                <div className="courses-dashboard-grid">
                  {enrollments.map(en => {
                    const c = courses.find(co => co.id === en.course_id);
                    if (!c) return null;
                    const assignedTutor = tutors.find(t => t.id === en.tutor_id);
                    const coverImg = getSpecialClassImage(c.title, courses.indexOf(c));
                    const courseTopicsCount = topics.filter(t => t.course_id === c.id).length;
                    return (
                      <div
                        key={c.id}
                        className="course-enrollment-card"
                        onClick={() => { setSelectedCourseId(c.id); setActiveQuizId(null); setQuizAnswers({}); setQuizScore(null); setQuizCorrectAnswers(null); }}
                      >
                        <div
                          className="course-card-banner-img"
                          style={{ backgroundImage: `url('${coverImg}')` }}
                        >
                          {c.grade_level && (
                            <span className="course-card-category-badge">{c.grade_level}</span>
                          )}
                        </div>
                        <div className="course-card-content-body">
                          <h3 className="course-card-title-heading">{c.title}</h3>
                          <p className="course-card-description-text">{c.description || 'No description available.'}</p>
                          {courseTopicsCount > 0 && (
                            <span style={{ fontSize: '0.75rem', color: '#a0aec0', fontWeight: 600 }}>{courseTopicsCount} lesson{courseTopicsCount !== 1 ? 's' : ''}</span>
                          )}
                          <div className="course-card-tutor-row">
                            <span className="course-tutor-label">Specialist Tutor</span>
                            <span className="course-tutor-value">{assignedTutor?.full_name || 'Not yet assigned'}</span>
                          </div>
                        </div>
                        <div className="course-card-action-bar">
                          <button className="course-enter-classroom-btn">
                            📖 Open Course
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ── STATE 2: Full Course Classroom Workspace ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                {/* Back navigation */}
                <div>
                  <button
                    className="classroom-back-btn-link"
                    onClick={() => { setSelectedCourseId(null); setActiveQuizId(null); setQuizScore(null); setQuizCorrectAnswers(null); }}
                  >
                    <ChevronLeft size={15} /> Back to My Courses
                  </button>
                </div>

                {/* Course Header Details */}
                <div className="dashboard-card">
                  <h2 style={{ fontSize: '1.5rem', color: 'var(--primary-color)', margin: '0 0 0.5rem 0' }}>{courses.find(c => c.id === selectedCourseId)?.title}</h2>
                  <p style={{ color: '#4a5568', fontSize: '0.9rem', margin: 0 }}>{courses.find(c => c.id === selectedCourseId)?.description}</p>
                </div>

                {/* Announcements Board */}
                {announcements.filter(a => a.course_id === selectedCourseId).length > 0 && (
                  <div className="dashboard-card" style={{ borderLeft: '4px solid var(--accent-color)', background: '#fffbeb' }}>
                    <h3><Megaphone size={16} /> Course Announcements</h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {announcements.filter(a => a.course_id === selectedCourseId).map(a => (
                        <li key={a.id}>
                          <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--primary-color)' }}>{a.title}</div>
                          <p style={{ fontSize: '0.85rem', color: '#4a5568', margin: '0.2rem 0' }}>"{a.announcement}"</p>
                          <span style={{ fontSize: '0.7rem', color: '#718096' }}>Posted: {new Date(a.created_at).toLocaleDateString()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Syllabus Outline */}
                <div className="dashboard-card">
                  <h3>Syllabus Lessons & Outlines</h3>
                  {topics.filter(t => t.course_id === selectedCourseId).length === 0 ? (
                    <div style={{ color: '#a0aec0', fontSize: '0.85rem' }}>No lessons posted yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {topics.filter(t => t.course_id === selectedCourseId).map((t, idx) => {
                        const topicMats = materials.filter(m => m.topic_id === t.id);
                        const topicTasks = tasks.filter(tk => {
                          if (tk.topic_id !== t.id) return false;
                          // Hide drafts
                          if (tk.status === 'draft') return false;
                          // If task has a target list, student must be in it
                          if (tk.target_student_ids && tk.target_student_ids.length > 0) {
                            return tk.target_student_ids.includes(studentInfo?.id || studentId);
                          }
                          return true; // no targeting = visible to all enrolled
                        });

                        return (
                          <div key={t.id} style={{ borderBottom: '1px solid #edf2f7', paddingBottom: '1rem' }}>
                            <h4 style={{ color: 'var(--primary-color)', fontSize: '1rem', fontWeight: 'bold', margin: '0 0 0.3rem 0' }}>Lesson {idx + 1}: {t.title}</h4>
                            <p style={{ color: '#718096', fontSize: '0.85rem', margin: '0 0 0.8rem 0' }}>{t.description}</p>

                            {/* Downloads / View Files */}
                            {topicMats.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4a5568', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  <FileText size={13} /> Attached Files
                                </div>
                                {topicMats.map(m => {
                                  const type = (m.file_type || '').toLowerCase();
                                  const isImage = type === 'image' || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(m.file_url || '');
                                  const isPdf = type === 'pdf' || /\.pdf$/i.test(m.file_url || '');
                                  const isVideo = type === 'video' || /\.(mp4|webm|mov|avi)$/i.test(m.file_url || '');
                                  const isDoc = type === 'doc' || type === 'docx' || /\.(doc|docx)$/i.test(m.file_url || '');
                                  const isHtmlSlide = type === 'html_slide';

                                  const fileIcon = isHtmlSlide ? '🖥️' : isImage ? '🖼️' : isPdf ? '📄' : isVideo ? '🎬' : isDoc ? '📝' : '📎';
                                  const typeLabel = isHtmlSlide ? 'Slide' : isImage ? 'Image' : isPdf ? 'PDF' : isVideo ? 'Video' : isDoc ? 'Document' : 'File';

                                  return (
                                    <div key={m.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem 0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                                      {/* File info */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                                        <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{fileIcon}</span>
                                        <div>
                                          <div style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--primary-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                                            {m.title}
                                          </div>
                                          <div style={{ fontSize: '0.7rem', color: '#a0aec0', textTransform: 'uppercase', fontWeight: '600' }}>{typeLabel}</div>
                                        </div>
                                      </div>

                                      {/* Action buttons */}
                                      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                        {/* View button — html slides open embedded in a modal, everything else in a new tab */}
                                        {isHtmlSlide ? (
                                          <button
                                            onClick={() => setViewingSlide(m)}
                                            style={{
                                              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                              padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem',
                                              fontWeight: '600', border: 'none', cursor: 'pointer',
                                              background: 'var(--primary-color)', color: 'white',
                                              boxShadow: '0 2px 6px rgba(0,0,0,0.12)', transition: 'opacity 0.15s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                          >
                                            👁 View
                                          </button>
                                        ) : (
                                          <a
                                            href={m.file_url}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{
                                              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                              padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem',
                                              fontWeight: '600', textDecoration: 'none',
                                              background: 'var(--primary-color)', color: 'white',
                                              boxShadow: '0 2px 6px rgba(0,0,0,0.12)', transition: 'opacity 0.15s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                                            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                          >
                                            👁 View
                                          </a>
                                        )}

                                        {/* Download button — forces download */}
                                        <a
                                          href={m.file_url}
                                          download={m.title || 'file'}
                                          target="_blank"
                                          rel="noreferrer"
                                          style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                            padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem',
                                            fontWeight: '600', textDecoration: 'none',
                                            background: '#e6f4ff', color: '#0369a1',
                                            border: '1px solid #bae0fd', transition: 'opacity 0.15s'
                                          }}
                                          onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                        >
                                          ⬇ Download
                                        </a>
                                      </div>

                                      {/* Inline image preview */}
                                      {isImage && (
                                        <div style={{ width: '100%', marginTop: '0.5rem', borderRadius: '8px', overflow: 'hidden', maxHeight: '180px' }}>
                                          <img
                                            src={m.file_url}
                                            alt={m.title}
                                            style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', background: '#f0f4f8', display: 'block' }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Interactive Quiz trigger links */}
                            {topicTasks
                              .filter(tk => tk.task_type === 'quiz' || tk.task_type === 'Quiz' || (tk.quiz_questions && tk.quiz_questions !== '[]' && tk.quiz_questions !== 'null'))
                              .map(tk => {
                                const sub = submissions.find(x => x.task_id === tk.id);
                                return (
                                  <div key={tk.id} style={{ marginTop: '0.75rem' }}>
                                    {sub ? (
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: '#166534', background: '#d1fae5', padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
                                        <Award size={12} /> {sub.grade !== null && sub.grade !== undefined
                                          ? `Score: ${Math.round((Number(sub.grade) / (Number(tk.max_points) || 100)) * 100)}% (${sub.grade}/${tk.max_points || 100})`
                                          : 'Submitted - awaiting grade'}
                                      </div>
                                    ) : (
                                      <button
                                        className="btn-action edit"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 700, borderRadius: '8px' }}
                                        onClick={() => { setActiveQuizId(tk.id); setQuizAnswers({}); setQuizScore(null); setQuizCorrectAnswers(null); }}
                                      >
                                        <Play size={13} /> Start Quiz: {tk.title}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>



              </div>
            )}
          </div>
        )}

        {/* Tab 3: Student Timetable */}
        {activeTab === 'timetable' && (
          <div>

            <div className="timetable-grid">

              {/* Left Column: Attendance rate */}
              <div className="dashboard-card" style={{ textAlign: 'center', padding: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}><Award size={20} color="var(--primary-color)" /> My Class Attendance</h3>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '1.5rem 0' }}>
                  {/* Ring fills to the real attendance rate */}
                  <div className="st-attendance-ring" style={{ '--pct': attendanceRate ?? 0 }}>
                    <span>{attendanceRate === null ? '—' : `${attendanceRate}%`}</span>
                  </div>
                </div>
                {attendanceRate === null && (
                  <p style={{ margin: '-0.5rem 0 1rem', fontSize: '0.85rem', color: '#a0aec0' }}>Your attendance will show here once your tutor marks your classes.</p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '0.9rem', color: '#718096' }}>
                  <div>🟢 Attended: <strong>{attendedCount}</strong></div>
                  <div>🔴 Missed: <strong>{missedCount}</strong></div>
                </div>
              </div>

              {/* Right Column: Schedules Timetable list */}
              <div className="dashboard-card">
                <h3>Upcoming Class Timetable</h3>
                {upcomingSchedules.length === 0 ? (
                  <div style={{ color: '#a0aec0', padding: '2rem', textAlign: 'center' }}>No upcoming classes scheduled yet.</div>
                ) : (
                  <div className="table-container">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th>Subject / Course</th>
                          <th>Tutor</th>
                          <th>Class Time</th>
                          <th>Meeting URL Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {upcomingSchedules.map(sch => {
                          const cTitle = courseTitleOf(sch.course_id);
                          const tName = tutorNameOf(sch.tutor_id) || 'To be confirmed';
                          return (
                            <tr key={sch.id}>
                              <td style={{ fontWeight: 'bold' }}>{sch.title} <div style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#718096' }}>{cTitle}</div></td>
                              <td>{tName}</td>
                              <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmtDay(new Date(sch.start_time))}<div style={{ color: '#718096' }}>{fmtTime(new Date(sch.start_time))} – {fmtTime(classEnd(sch))}</div></td>
                              <td>
                                {sch.meeting_link || sch.meeting_link_2 ? (
                                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                    {sch.meeting_link && <a href={sch.meeting_link} target="_blank" rel="noreferrer" className="btn-action approve" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>{sch.meeting_link_2 ? '1st Half' : 'Join Class'}</a>}
                                    {sch.meeting_link_2 && <a href={sch.meeting_link_2} target="_blank" rel="noreferrer" className="btn-action approve" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>2nd Half</a>}
                                  </div>
                                ) : (
                                  <span style={{ color: '#cbd5e0' }}>None</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Class History: every class that has ended, with its attendance mark */}
            <div className="dashboard-card ch-card">
              <div className="ch-head">
                <h3><History size={20} color="var(--primary-color)" /> Class History</h3>
                <div className="ch-filters" role="tablist">
                  {[
                    ['all', `All (${pastSchedules.length})`],
                    ['attended', `Attended (${pastSchedules.filter(x => historyStatusOf(x) === 'attended').length})`],
                    ['missed', `Missed (${pastSchedules.filter(x => historyStatusOf(x) === 'missed').length})`],
                    ['unmarked', `Not marked (${pastSchedules.filter(x => historyStatusOf(x) === 'unmarked').length})`]
                  ].map(([key, label]) => (
                    <button key={key} type="button" role="tab" aria-selected={historyFilter === key}
                      className={`ch-chip ${historyFilter === key ? 'is-active' : ''}`}
                      onClick={() => { setHistoryFilter(key); setHistoryLimit(10); }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="ch-empty">
                  {pastSchedules.length === 0
                    ? 'No past classes yet. Classes you have taken will appear here.'
                    : 'No classes match this filter.'}
                </div>
              ) : (
                <>
                  <ul className="ch-list">
                    {filteredHistory.slice(0, historyLimit).map(sch => {
                      const start = new Date(sch.start_time);
                      const end = classEnd(sch);
                      const mins = Math.max(0, Math.round((end - start) / 60000));
                      const status = historyStatusOf(sch);
                      return (
                        <li key={sch.id} className="ch-item">
                          <div className="ch-date">
                            <span className="ch-date-month">{start.toLocaleDateString([], { month: 'short' })}</span>
                            <span className="ch-date-day">{start.getDate()}</span>
                          </div>
                          <div className="ch-info">
                            <div className="ch-title">{sch.title || 'Class'}</div>
                            {joinMeta(courseTitleOf(sch.course_id), tutorNameOf(sch.tutor_id)) && (
                              <div className="ch-meta">{joinMeta(courseTitleOf(sch.course_id), tutorNameOf(sch.tutor_id))}</div>
                            )}
                            <div className="ch-meta">
                              {start.toLocaleDateString([], { weekday: 'long' })}, {fmtTime(start)} – {fmtTime(end)}
                              {mins > 0 && <> · {mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`}</>}
                            </div>
                          </div>
                          <span className={`ch-status ch-status-${status}`}>
                            {status === 'attended' && <><CheckCircle2 size={14} /> Attended</>}
                            {status === 'missed' && <><XCircle size={14} /> Missed</>}
                            {status === 'unmarked' && <><HelpCircle size={14} /> Not marked</>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {filteredHistory.length > historyLimit && (
                    <button type="button" className="ch-more" onClick={() => setHistoryLimit(l => l + 10)}>
                      Show more ({filteredHistory.length - historyLimit} older)
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Student-Tutor messaging (WhatsApp Style UI) */}
        {activeTab === 'chat' && (
          <div className="whatsapp-chat-container">
            {/* Contacts Sidebar Pane */}
            <div className={`whatsapp-contacts-sidebar ${activeTutorChat && mobileChatView === 'chat' ? 'mobile-hidden' : ''}`}>
              <div className="whatsapp-sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <h3>Your Tutors</h3>
                <NotificationToggle userId={studentInfo?.profile_id || studentInfo?.id || studentId} />
              </div>
              <ul className="whatsapp-contacts-list">
                {chatEnrollments.map(en => {
                  const t = en.tutor;
                  const c = courses.find(co => co.id === en.course_id);
                  const isSelected = activeTutorChat?.id === t.id;

                  // Extract last message
                  const threadMessages = chatMessages.filter(m =>
                    inThread(m, personIds(studentInfo, studentId), personIds(t))
                  );
                  const lastMsg = threadMessages[threadMessages.length - 1];
                  const lastMsgText = lastMsg ? lastMsg.message_text : `Start learning in ${c?.title || 'course'}`;
                  const lastMsgTime = lastMsg ? formatMessageTime(lastMsg.created_at) : '';

                  return (
                    <li
                      key={t.id}
                      className={`whatsapp-contact-item ${isSelected ? 'active' : ''}`}
                      onClick={() => { setActiveTutorChat(t); setMobileChatView('chat'); }}
                    >
                      <div className="whatsapp-avatar">
                        {t.full_name ? t.full_name[0] : 'T'}
                      </div>
                      <div className="whatsapp-contact-info">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="whatsapp-contact-name">{t.full_name}</div>
                          {lastMsgTime && <span style={{ fontSize: '0.7rem', color: '#8696a0' }}>{lastMsgTime}</span>}
                        </div>
                        <div className="whatsapp-contact-status">{lastMsgText}</div>
                      </div>
                    </li>
                  );
                })}
                {chatEnrollments.length === 0 && (
                  <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: '#8696a0', fontSize: '0.9rem', lineHeight: 1.5 }}>
                    <strong style={{ display: 'block', color: '#4a5568', marginBottom: '0.3rem' }}>No tutors to chat with yet</strong>
                    Your tutors will appear here once you're assigned to a class.
                  </div>
                )}
              </ul>
            </div>

            {/* Chat Thread Pane */}
            <div className={`whatsapp-chat-window ${!activeTutorChat || mobileChatView === 'list' ? 'mobile-hidden' : ''}`}>
              {activeTutorChat ? (
                <>
                  {/* Active Header details */}
                  <div className="whatsapp-chat-header">
                    <div className="whatsapp-header-user">
                      <button
                        className="whatsapp-header-back-btn"
                        onClick={() => setMobileChatView('list')}
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <div className="whatsapp-avatar" style={{ width: '40px', height: '40px', fontSize: '0.95rem' }}>
                        {activeTutorChat.full_name ? activeTutorChat.full_name[0] : 'T'}
                      </div>
                      <div className="whatsapp-header-details">
                        <div className="whatsapp-header-name">{activeTutorChat.full_name}</div>
                        <div className="whatsapp-header-status">
                          <span className="whatsapp-header-status-dot"></span> Active Specialist
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Messages Logs view container */}
                  <div className="whatsapp-messages-container" ref={chatScrollRef}>
                    {chatMessages.filter(m =>
                      inThread(m, personIds(studentInfo, studentId), personIds(activeTutorChat))
                    ).map(m => {
                      const isMe = isOneOf(m.sender_id, personIds(studentInfo, studentId));
                      return (
                        <div
                          key={m.id}
                          className={`whatsapp-bubble ${isMe ? 'sent' : 'received'}`}
                        >
                          <div style={{ fontSize: '0.88rem', color: '#111b21', whiteSpace: 'pre-wrap' }}>{m.message_text}</div>
                          <div className="whatsapp-bubble-time">
                            {formatMessageTime(m.created_at)}
                            {isMe && <span className="whatsapp-bubble-checks"> ✓✓</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Input sending bar */}
                  <form onSubmit={handleSendChat} className="whatsapp-input-bar">
                    <input
                      type="text"
                      className="whatsapp-input-field"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message"
                      required
                    />
                    <button type="submit" className="whatsapp-send-btn">
                      <Send size={16} />
                    </button>
                  </form>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8696a0', padding: '2rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '4.5rem', marginBottom: '1rem' }}>💬</div>
                  <h3 style={{ color: '#54656f', fontSize: '1.25rem', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>Academic Messaging</h3>
                  <p style={{ fontSize: '0.88rem', maxWidth: '320px', margin: '0 auto', lineHeight: '1.5' }}>Choose a tutor from the contacts list to review message logs or send text notes directly.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 5: Homework Assignments & Grading Summary */}
        {activeTab === 'homework' && (
          <div>

            <div className="dashboard-card">
              <h3><CheckSquare size={20} color="var(--primary-color)" /> Your Tasks</h3>
              {activeStudentTasks.length === 0 ? (
                <div className="st-empty st-empty-flat">
                  <CheckSquare size={28} />
                  <strong>No tasks yet</strong>
                  <span>Homework and quizzes from your tutors will appear here.</span>
                </div>
              ) : (() => {
                const statusOf = (tk) => {
                  const sub = submissions.find(s => s.task_id === tk.id);
                  if (!sub) return 'todo';
                  return sub.grade != null ? 'graded' : 'submitted';
                };
                const counts = { todo: 0, submitted: 0, graded: 0 };
                activeStudentTasks.forEach(tk => { counts[statusOf(tk)] += 1; });
                const ORDER = { todo: 0, submitted: 1, graded: 2 };
                const shown = activeStudentTasks
                  .filter(tk => taskFilter === 'all' || statusOf(tk) === taskFilter)
                  .sort((a, b) => ORDER[statusOf(a)] - ORDER[statusOf(b)]);
                return (
                <>
                <div className="st-filter-chips" role="tablist" aria-label="Filter tasks">
                  {[['all', 'All', activeStudentTasks.length], ['todo', 'To do', counts.todo], ['submitted', 'Submitted', counts.submitted], ['graded', 'Graded', counts.graded]].map(([key, label, n]) => (
                    <button key={key} type="button" role="tab" aria-selected={taskFilter === key}
                      className={`st-chip ${taskFilter === key ? 'is-active' : ''} ${key === 'todo' && n > 0 ? 'has-todo' : ''}`}
                      onClick={() => setTaskFilter(key)}>
                      {label} <b>{n}</b>
                    </button>
                  ))}
                </div>
                {shown.length === 0 ? (
                  <div className="st-empty st-empty-flat">
                    <CheckCircle2 size={26} />
                    <strong>{taskFilter === 'todo' ? "You're all caught up!" : 'Nothing here'}</strong>
                    <span>{taskFilter === 'todo' ? 'Every task has been submitted.' : 'No tasks match this filter.'}</span>
                  </div>
                ) : (
                <ul className="st-task-list">
                  {shown.map(tk => {
                    const sub = submissions.find(s => s.task_id === tk.id);
                    const cTitle = courseTitleOf(tk.course_id);
                    const isQuiz = tk.task_type === 'quiz' || tk.task_type === 'Quiz' || (tk.quiz_questions && tk.quiz_questions !== '[]' && tk.quiz_questions !== 'null');

                    return (
                      <li key={tk.id} className={`st-task is-${statusOf(tk)}`}>
                        <div className="st-task-head">
                          <div className="st-task-title">
                            <strong>{tk.title}</strong>
                            <span>{joinMeta(isQuiz ? 'Quiz' : 'Assignment', cTitle)}</span>
                          </div>
                          {sub ? (
                            <span className={`badge ${sub.grade != null ? 'badge-approved' : 'badge-completed'} st-task-badge`}>
                              {sub.grade != null ? `${sub.grade}/${tk.max_points || 100}` : 'Submitted'}
                            </span>
                          ) : (
                            <span className="badge badge-pending st-task-badge">To do</span>
                          )}
                        </div>
                        {tk.description && <p className="st-task-desc">{tk.description}</p>}

                        {sub ? (
                          <div style={{ marginTop: '0.5rem', background: '#edf2f7', padding: '0.6rem', borderRadius: '8px', fontSize: '0.8rem' }}>
                            <div>📩 Your submission: "{sub.submission_text}"</div>
                            {sub.feedback && <div style={{ color: 'var(--primary-color)', fontWeight: 'bold', marginTop: '0.3rem' }}>📝 Tutor Feedback: "{sub.feedback}"</div>}
                          </div>
                        ) : (
                          <div style={{ marginTop: '0.8rem' }}>
                            {isQuiz ? (
                              <button
                                className="btn-action edit"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 700, borderRadius: '8px' }}
                                onClick={() => { setActiveQuizId(tk.id); setQuizAnswers({}); setQuizScore(null); setQuizCorrectAnswers(null); }}
                              >
                                <Play size={13} /> Start Quiz
                              </button>
                            ) : (
                              activeSubTaskId === tk.id ? (
                                <form onSubmit={handleHomeworkSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', background: '#f7fafc', padding: '1rem', borderRadius: '10px' }}>
                                  <div className="form-group">
                                    <label style={{ fontSize: '0.8rem' }}>Write homework solution / notes *</label>
                                    <textarea value={subText} onChange={(e) => setSubText(e.target.value)} placeholder="Type answer details..." rows={3} required style={{ padding: '0.4rem', fontSize: '0.82rem' }}></textarea>
                                  </div>
                                  <div className="form-group">
                                    <label style={{ fontSize: '0.8rem' }}>Attach File (Optional)</label>
                                    <input type="file" onChange={(e) => setSubFile(e.target.files[0])} style={{ border: 'none', background: 'transparent' }} />
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn-action cancel" style={{ padding: '0.35rem 0.7rem' }} onClick={() => setActiveSubTaskId(null)}>Cancel</button>
                                    <button type="submit" className="btn-action approve" style={{ padding: '0.35rem 0.7rem' }} disabled={saving}>{saving ? 'Submitting...' : 'Submit Task'}</button>
                                  </div>
                                </form>
                              ) : (
                                <button className="btn-action edit" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 700, borderRadius: '8px' }} onClick={() => { setActiveSubTaskId(tk.id); setSubText(''); setSubFile(null); }}><Send size={13} /> Submit Homework</button>
                              )
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                )}
                </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Tab 6: Profile Personal Info */}
        {activeTab === 'profile' && studentInfo && (() => {
          const PROGRAM_LABELS = { regular: 'Regular Classes', tutoring: 'One-on-One Tutoring', group: 'Group Sessions' };
          const titleCase = (v) => (v ? String(v).replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '');
          const programLabel = PROGRAM_LABELS[studentInfo.program] || titleCase(studentInfo.program) || 'Not set';
          const startLabel = (() => {
            if (!studentInfo.start_date) return 'Not set';
            const d = new Date(`${studentInfo.start_date}T00:00:00`);
            return isNaN(d.getTime()) ? studentInfo.start_date : d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
          })();
          const EDITABLE = ['full_name', 'phone', 'date_of_birth', 'gender', 'special_needs', 'avatar_url'];
          const isDirty = EDITABLE.some(k => (studentInfo[k] || '') !== (savedStudentInfo?.[k] || ''));
          const setField = (key) => (e) => setStudentInfo(prev => ({ ...prev, [key]: e.target.value }));
          const copyId = async () => {
            try {
              await navigator.clipboard.writeText(String(studentInfo.id));
              setIdCopied(true);
              setTimeout(() => setIdCopied(false), 1500);
            } catch { /* clipboard unavailable; ignore */ }
          };
          const initials = (studentInfo.full_name || 'S').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

          return (
            <form onSubmit={handleUpdateProfile} className="student-profile">
              {/* Header */}
              <div className="sp-hero">
                <div className="sp-hero-cover" />
                <div className="sp-hero-content">
                  <div className="sp-avatar-wrap">
                    {studentInfo.avatar_url ? (
                      <img src={studentInfo.avatar_url} alt={studentInfo.full_name} className="sp-avatar" />
                    ) : (
                      <div className="sp-avatar sp-avatar-initials">{initials}</div>
                    )}
                    <label className={`sp-avatar-btn ${uploading ? 'is-busy' : ''}`} title="Change profile picture">
                      <Camera size={15} />
                      <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={uploading} />
                    </label>
                  </div>
                  <div className="sp-hero-text">
                    <h2>{studentInfo.full_name || 'Student'}</h2>
                    <div className="sp-chips">
                      {studentInfo.grade_level && <span className="sp-chip"><GraduationCap size={13} /> {studentInfo.grade_level}</span>}
                      <span className="sp-chip"><BookOpen size={13} /> {programLabel}</span>
                      {studentInfo.email && <span className="sp-chip sp-chip-muted"><Mail size={13} /> {studentInfo.email}</span>}
                    </div>
                    {uploading && <span className="sp-hint">Uploading picture...</span>}
                  </div>
                </div>
              </div>

              <div className="sp-grid">
                {/* Personal details (editable) */}
                <section className="dashboard-card sp-section">
                  <h3><User size={18} color="var(--primary-color)" /> Personal Details</h3>
                  <div className="sp-fields">
                    <label className="sp-field sp-field-full">
                      <span>Full Name</span>
                      <input type="text" value={studentInfo.full_name || ''} onChange={setField('full_name')} required />
                    </label>
                    <label className="sp-field">
                      <span>Phone Number</span>
                      <div className="sp-input-icon">
                        <Phone size={15} />
                        <input type="tel" value={studentInfo.phone || ''} onChange={setField('phone')} placeholder="080..." />
                      </div>
                    </label>
                    <label className="sp-field">
                      <span>Date of Birth</span>
                      <input type="date" value={studentInfo.date_of_birth || ''} onChange={setField('date_of_birth')} required />
                    </label>
                    <label className="sp-field">
                      <span>Gender</span>
                      <select value={studentInfo.gender || ''} onChange={(e) => setStudentInfo(prev => ({ ...prev, gender: e.target.value || null }))}>
                        <option value="">Prefer not to say</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label className="sp-field sp-field-full">
                      <span>Special Learning Needs</span>
                      <textarea rows={3} value={studentInfo.special_needs || ''} onChange={setField('special_needs')} placeholder="Anything your tutor should know about how you learn best" />
                    </label>
                  </div>
                </section>

                <div className="sp-side">
                  {/* Learning details (read-only, set by admin) */}
                  <section className="dashboard-card sp-section">
                    <h3><GraduationCap size={18} color="var(--primary-color)" /> Learning Details</h3>
                    <dl className="sp-facts">
                      <div><dt>Grade Level</dt><dd>{studentInfo.grade_level || 'Not set'}</dd></div>
                      <div><dt>Program</dt><dd>{programLabel}</dd></div>
                      <div><dt>Preferred Schedule</dt><dd>{titleCase(studentInfo.schedule) || 'Not set'}</dd></div>
                      <div><dt>Start Date</dt><dd>{startLabel}</dd></div>
                    </dl>
                    <p className="sp-note">These are managed by the FoundaXia team. Contact your tutor or admin to change them.</p>
                  </section>

                  {/* Account */}
                  <section className="dashboard-card sp-section">
                    <h3><Mail size={18} color="var(--primary-color)" /> Account</h3>
                    <dl className="sp-facts">
                      <div><dt>Email</dt><dd className="sp-break">{studentInfo.email || 'Not set'}</dd></div>
                      <div>
                        <dt>Student ID</dt>
                        <dd className="sp-id">
                          <code>{String(studentInfo.id).slice(0, 8)}…</code>
                          <button type="button" className="sp-copy" onClick={copyId} title="Copy full Student ID">
                            {idCopied ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        </dd>
                      </div>
                    </dl>
                    <p className="sp-note">Your email is your login and can't be changed here.</p>
                  </section>
                </div>
              </div>

              {/* Save bar */}
              <div className={`sp-savebar ${isDirty ? 'is-dirty' : ''}`}>
                <span>{isDirty ? 'You have unsaved changes' : 'All changes saved'}</span>
                <div className="sp-savebar-actions">
                  {isDirty && (
                    <button type="button" className="sp-btn-ghost" onClick={() => setStudentInfo(savedStudentInfo)} disabled={saving}>Discard</button>
                  )}
                  <button type="submit" className="sp-btn-save" disabled={saving || !isDirty}>
                    <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          );
        })()}

        {/* Tab 7: Parent Area (code-protected fees & payments) */}
        {activeTab === 'parent' && (
          <ParentArea
            studentName={studentInfo?.full_name || user?.full_name}
            insights={{
              schedules,
              attendanceLogs,
              tasks: activeStudentTasks,
              submissions,
              courses,
              tutorContacts: chatEnrollments
            }}
            initialReference={paymentReturnRef}
            onReferenceHandled={clearPaymentReturn}
          />
        )}

        {/* Interactive Quiz Solving Modal Overlay */}
        {activeQuizId && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(8, 23, 48, 0.7)',
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: '1.25rem',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div className="dashboard-card" style={{
              background: '#f8fafc',
              borderLeft: '4px solid var(--accent-color)',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              position: 'relative',
              margin: 0,
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              borderRadius: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', paddingBottom: '0.8rem', marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--primary-color)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📝 {tasks.find(t => t.id === activeQuizId)?.title}
                </h4>
                <button onClick={() => { setActiveQuizId(null); setQuizScore(null); setQuizCorrectAnswers(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a0aec0', padding: '0.25rem' }}><X size={20} /></button>
              </div>

              {/* Questions list */}
              {(() => {
                const activeTask = tasks.find(t => t.id === activeQuizId);
                const questions = parseQuizQuestions(activeTask?.quiz_questions);
                if (questions.length === 0) {
                  return (
                    <div style={{ color: '#a0aec0', padding: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
                      This quiz has no questions yet. Ask your tutor to add questions.
                    </div>
                  );
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {questions.map((q, qIdx) => (
                      <div key={qIdx} style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', border: '1px solid #f0f4f8' }}>
                        <p style={{ fontWeight: 'bold', fontSize: '0.92rem', marginBottom: '0.75rem', color: 'var(--text-dark)' }}>{qIdx + 1}. {q.question}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {(q.options || []).map((opt, optIdx) => (
                            <label
                              key={optIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.6rem',
                                fontSize: '0.88rem',
                                padding: '0.65rem 0.85rem',
                                borderRadius: '8px',
                                background: quizCorrectAnswers && quizCorrectAnswers[qIdx] === optIdx
                                  ? '#dcfce7'
                                  : quizCorrectAnswers && quizAnswers[qIdx] === optIdx
                                    ? '#fee2e2'
                                    : quizAnswers[qIdx] === optIdx ? '#f0f7ff' : 'transparent',
                                border: quizCorrectAnswers && quizCorrectAnswers[qIdx] === optIdx
                                  ? '1px solid #16a34a'
                                  : quizAnswers[qIdx] === optIdx ? '1px solid var(--primary-color)' : '1px solid #edf2f7',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <input
                                type="radio"
                                name={`quiz-${activeQuizId}-${qIdx}`}
                                checked={quizAnswers[qIdx] === optIdx}
                                onChange={() => handleQuizOptionSelect(qIdx, optIdx)}
                                disabled={quizScore !== null}
                                style={{ accentColor: 'var(--primary-color)' }}
                              />
                              {opt}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Submit Button */}
              <div style={{ marginTop: '1.75rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid #edf2f7', paddingTop: '1.25rem' }}>
                {quizScore === null ? (
                  <button
                    className="btn-primary"
                    style={{ padding: '0.65rem 1.5rem', fontSize: '0.9rem', borderRadius: '10px' }}
                    onClick={() => handleQuizSubmit(tasks.find(t => t.id === activeQuizId))}
                    disabled={quizSubmitting}
                  >
                    {quizSubmitting ? 'Grading...' : 'Submit Answers'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <span style={{ fontWeight: 'bold', color: '#166534', fontSize: '1rem' }}>Result Score: {quizScore}%</span>
                    <button className="btn-action edit" style={{ padding: '0.65rem 1.25rem', borderRadius: '8px' }} onClick={() => { setActiveQuizId(null); setQuizScore(null); setQuizCorrectAnswers(null); }}>Done</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      <HtmlSlideModal url={viewingSlide?.file_url} title={viewingSlide?.title} onClose={() => setViewingSlide(null)} />
    </div>
  );
}
