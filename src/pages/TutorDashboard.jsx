import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getBookings, getTutors, updateTutor, updateBookingStatus, uploadAvatar,
  getStudentCourses, getStudents, getCourses,
  getTasks, saveTask, deleteTask,
  getStudentTasks, gradeStudentTask,
  getTopics,
  getSchedules, getAttendance, markAttendance, saveSchedule, updateSchedule, deleteSchedule,
  getAnnouncements, createAnnouncement,
  getChatMessages, sendChatMessage, markMessagesRead,
  getCourseTutors, getMaterials, saveMaterial, deleteMaterial, uploadMaterialFile,
  createLiveSession
} from '../services/dataService';
import { 
  Calendar, User, Clock, AlertCircle, Save, Check, X,
  MessageSquare, Plus, CheckSquare, Megaphone, Trash2, Send,
  BookOpen, FileText, Upload, MonitorPlay, Edit, Paperclip
} from 'lucide-react';
import HtmlSlideModal from '../components/HtmlSlideModal';
import NotificationToggle from '../components/NotificationToggle';
import { convertPptxToSlideHtml } from '../utils/pptxConverter';
import '../styles/Dashboard.css';

const formatMessageTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

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

export default function TutorDashboard({ user }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('schedule');
  const [viewingSlide, setViewingSlide] = useState(null); // material row being viewed in the embedded HTML slide modal
  const [bookings, setBookings] = useState([]);
  const [tutorInfo, setTutorInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // LMS Data lists
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [attendanceLog, setAttendanceLog] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [courseTutors, setCourseTutors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [newMaterialTitle, setNewMaterialTitle] = useState('');
  const [materialFile, setMaterialFile] = useState(null);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  
  // Chat Inbox states
  const [chatMessages, setChatMessages] = useState([]);
  const [topics, setTopics] = useState([]); // lesson topics for task/quiz linking
  const [activeStudentChat, setActiveStudentChat] = useState(null);
  const [activeCourseChat, setActiveCourseChat] = useState(null);
  const [chatInput, setChatInput] = useState('');

  // Broadcast message states
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastSelected, setBroadcastSelected] = useState([]); // student IDs
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);

  // Tutor Task Creation state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskCourse, setNewTaskCourse] = useState('');
  const [newTaskTopic, setNewTaskTopic] = useState(''); // NEW: topic_id
  const [newTaskMax, setNewTaskMax] = useState(100);
  const [newTaskType, setNewTaskType] = useState('assignment'); // 'assignment' | 'quiz'

  // Quiz edit state (for viewing/editing published quizzes)
  const [editingQuizId, setEditingQuizId] = useState(null);
  const [editQuizQuestions, setEditQuizQuestions] = useState([]);
  const [editQuizTargets, setEditQuizTargets] = useState([]);

  // Target students selector
  const [targetStudentIds, setTargetStudentIds] = useState([]); // empty = all
  const [targetAll, setTargetAll] = useState(true);

  const toggleTargetStudent = (id) => {
    setTargetStudentIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  // Reset targeting when course changes
  const handleTaskCourseChange = (courseId) => {
    setNewTaskCourse(courseId);
    setNewTaskTopic(''); // reset topic when course changes
    setTargetStudentIds([]);
    setTargetAll(true);
  };

  // Quiz builder state
  const [quizQuestions, setQuizQuestions] = useState([
    { question: '', options: ['', '', '', ''], correct: 0 }
  ]);

  const addQuizQuestion = () =>
    setQuizQuestions(prev => [...prev, { question: '', options: ['', '', '', ''], correct: 0 }]);

  const removeQuizQuestion = (idx) =>
    setQuizQuestions(prev => prev.filter((_, i) => i !== idx));

  const updateQuizQuestion = (idx, field, value) =>
    setQuizQuestions(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q));

  const updateQuizOption = (qIdx, optIdx, value) =>
    setQuizQuestions(prev => prev.map((q, i) =>
      i === qIdx ? { ...q, options: q.options.map((o, oi) => oi === optIdx ? value : o) } : q
    ));

  // Students enrolled in the currently-selected course
  const courseStudents = students.filter(s =>
    enrollments.some(sc => sc.course_id === newTaskCourse && sc.student_id === s.id)
  );

  // Grading states
  const [activeSubmissionId, setActiveSubmissionId] = useState(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');

  // Announcement state inputs
  const [annTitle, setAnnTitle] = useState('');
  const [annDesc, setAnnDesc] = useState('');
  const [annCourseId, setAnnCourseId] = useState('');

  // Scheduling state inputs
  const [schStudentId, setSchStudentId] = useState('');
  const [schCourseId, setSchCourseId] = useState('');
  const [schTitle, setSchTitle] = useState('');
  const [schStart, setSchStart] = useState('');
  const [schEnd, setSchEnd] = useState('');
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);
  const [showStartSessionModal, setShowStartSessionModal] = useState(false);
  const [startSessionStudentIds, setStartSessionStudentIds] = useState([]);
  const [startingSession, setStartingSession] = useState(false);
  const [schLink, setSchLink] = useState('');
  const [schLink2, setSchLink2] = useState('');
  const [schType, setSchType] = useState('single'); // 'single' or 'recurring'
  const [schRecurStartDate, setSchRecurStartDate] = useState('');
  const [schRecurEndDate, setSchRecurEndDate] = useState('');
  const [schRecurStartTime, setSchRecurStartTime] = useState('');
  const [schRecurEndTime, setSchRecurEndTime] = useState('');
  const [schRecurDays, setSchRecurDays] = useState([]); // ['Monday', 'Tuesday', etc.]

  // Load dynamically based on logged-in tutor details
  const tutorId = user?.id || 't1';

  const loadTutorDashboard = async () => {
    try {
      const [allBookings, allTutors, sList, cList, scList, tkList, subList, schList, attList, annList, msgList, topicList, ctList, matList] = await Promise.all([
        getBookings(), getTutors(), getStudents(), getCourses(), getStudentCourses(),
        getTasks(), getStudentTasks(), getSchedules(), getAttendance(), getAnnouncements(), getChatMessages(), getTopics(),
        getCourseTutors(), getMaterials()
      ]);

      // Match on id first; a name match (a different tutor sharing the same name)
      // must never win over the logged-in tutor's own record.
      const currentTutor =
        allTutors.find(t => t.id === tutorId || t.profile_id === tutorId) ||
        (user?.full_name ? allTutors.find(t => t.full_name === user.full_name) : undefined);
      setTutorInfo(currentTutor);

      const actualTutorId = currentTutor?.id || tutorId;

      // Filter bookings scheduled with this tutor
      const filteredBookings = allBookings.filter(b => 
        b.tutor_id === actualTutorId || 
        b.tutor_name === currentTutor?.full_name
      );
      setBookings(filteredBookings);

      setStudents(sList);
      setCourses(cList);
      setEnrollments(scList);
      setTasks(tkList);
      setSubmissions(subList);
      setSchedules(schList.filter(s => s.tutor_id === actualTutorId));
      setAttendanceLog(attList);
      setAnnouncements(annList);
      setChatMessages(msgList);
      setTopics(topicList || []);
      setCourseTutors(ctList || []);
      setMaterials(matList || []);

      if (cList.length > 0) setNewTaskCourse(cList[0].id);
    } catch (err) {
      console.error('Error loading tutor dashboard details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTutorDashboard();
  }, [tutorId]);

  // Mark the open conversation's incoming messages read as soon as it's opened
  useEffect(() => {
    if (!activeStudentChat) return;
    const actualTutorId = tutorInfo?.id || tutorId;
    const otherId = activeStudentChat.profile_id || activeStudentChat.id;
    const unreadIds = chatMessages
      .filter(m => m.sender_id === otherId && m.receiver_id === actualTutorId && !m.read)
      .map(m => m.id);
    if (unreadIds.length === 0) return;
    markMessagesRead(unreadIds)
      .then(() => setChatMessages(prev => prev.map(m => unreadIds.includes(m.id) ? { ...m, read: true } : m)))
      .catch(err => console.error('Failed to mark messages read:', err));
  }, [activeStudentChat, chatMessages, tutorInfo, tutorId]);

  // Reflect unread count on the installed app's icon, where supported
  useEffect(() => {
    const count = chatMessages.filter(m => m.receiver_id === (tutorInfo?.id || tutorId) && !m.read).length;
    if ('setAppBadge' in navigator) {
      if (count > 0) navigator.setAppBadge(count).catch(() => {});
      else navigator.clearAppBadge().catch(() => {});
    }
  }, [chatMessages, tutorInfo, tutorId]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const publicUrl = await uploadAvatar(tutorInfo?.id || user?.id, file);
      setTutorInfo(prev => ({ ...prev, avatar_url: publicUrl }));
      alert('Picture uploaded successfully! Remember to save changes at the bottom.');
    } catch (err) {
      alert('Failed to upload picture: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateTutor(tutorInfo.id, tutorInfo);
      alert('Tutor profile updated successfully!');
    } catch (err) {
      alert('Error updating profile: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (bookingId, status) => {
    try {
      await updateBookingStatus(bookingId, status);
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b));
      alert(`Booking ${status} successfully.`);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // --- LMS TUTOR HANDLERS ---

  const handleCreateTask = async (e, status = 'published') => {
    e.preventDefault();
    if (!newTaskTitle || !newTaskCourse) return alert('Fill out task title and course.');

    if (newTaskType === 'quiz') {
      const incomplete = quizQuestions.some(q =>
        !q.question.trim() || q.options.some(o => !o.trim())
      );
      if (incomplete) return alert('Please fill in all quiz questions and options.');
      if (quizQuestions.length === 0) return alert('Add at least one quiz question.');
    }

    // Resolve final target list
    const resolvedTargets = targetAll
      ? courseStudents.map(s => s.id)
      : targetStudentIds;

    try {
      const taskPayload = {
        course_id: newTaskCourse,
        topic_id: newTaskTopic || null,
        title: newTaskTitle,
        description: newTaskDesc,
        task_type: newTaskType,
        max_points: newTaskType === 'quiz' ? quizQuestions.length * 10 : newTaskMax,
        status,
        target_student_ids: resolvedTargets,
        ...(newTaskType === 'quiz' && { quiz_questions: quizQuestions })
      };
      const saved = await saveTask(taskPayload);
      setTasks(prev => [...prev, saved]);
      // Reset form
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskMax(100);
      setNewTaskType('assignment');
      setNewTaskTopic('');
      setQuizQuestions([{ question: '', options: ['', '', '', ''], correct: 0 }]);
      setTargetStudentIds([]);
      setTargetAll(true);
      setNewTaskCourse('');
      if (status === 'draft') {
        alert('Saved as draft. Students cannot see it yet.');
      } else {
        const who = targetAll ? 'all enrolled students' : `${resolvedTargets.length} selected student(s)`;
        alert(`${newTaskType === 'quiz' ? 'Quiz' : 'Task'} published to ${who}!`);
      }
    } catch (err) {
      alert('Error creating task: ' + err.message);
    }
  };

  const handleGradeSubmission = async (e) => {
    e.preventDefault();
    if (!activeSubmissionId || !gradeInput) return alert('Enter grade details.');
    try {
      const saved = await gradeStudentTask(activeSubmissionId, Number(gradeInput), feedbackInput, tutorInfo?.id || tutorId);
      setSubmissions(prev => prev.map(s => s.id === activeSubmissionId ? saved : s));
      setActiveSubmissionId(null);
      setGradeInput('');
      setFeedbackInput('');
      alert('Student submission graded successfully!');
    } catch (err) {
      alert('Error grading: ' + err.message);
    }
  };

  const handleMarkAttendance = async (scheduleId, studentId, status) => {
    try {
      const saved = await markAttendance({
        schedule_id: scheduleId,
        student_id: studentId,
        status: status,
        marked_by: tutorInfo?.id || tutorId
      });
      setAttendanceLog(prev => {
        const filtered = prev.filter(x => !(x.schedule_id === scheduleId && x.student_id === studentId));
        return [...filtered, saved];
      });
      alert(`Attendance marked as ${status} successfully.`);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handlePostAnnouncement = async (e) => {
    e.preventDefault();
    if (!annTitle || !annDesc || !annCourseId) return alert('Fill out announcement details.');
    try {
      const saved = await createAnnouncement({
        course_id: annCourseId,
        tutor_id: tutorInfo?.id || tutorId,
        title: annTitle,
        announcement: annDesc
      });
      setAnnouncements(prev => [saved, ...prev]);
      setAnnTitle('');
      setAnnDesc('');
      alert('Announcement published!');
    } catch (err) {
      alert('Error publishing bulletin: ' + err.message);
    }
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    const actualTutorId = tutorInfo?.id || tutorId;
    if (!schStudentId || !schCourseId || !schTitle) {
      return alert('Fill out schedule title, student, and course.');
    }

    if (schType === 'single') {
      if (!schStart || !schEnd) {
        return alert('Please specify start and end dates/times for the single class.');
      }
      try {
        const saved = await saveSchedule({
          student_id: schStudentId,
          course_id: schCourseId,
          tutor_id: actualTutorId,
          title: schTitle,
          // Convert the datetime-local input's timezone-less value ("2026-09-10T14:30") to a
          // real UTC instant. Without this, Postgres stores the literal string as if it were
          // already UTC, silently shifting the effective time by the tutor's own UTC offset -
          // which can push a class that's genuinely upcoming into appearing already past.
          start_time: new Date(schStart).toISOString(),
          end_time: new Date(schEnd).toISOString(),
          meeting_link: schLink,
          meeting_link_2: schLink2
        });
        setSchedules(prev => [...prev, saved]);
        setSchTitle('');
        setSchStart('');
        setSchEnd('');
        setSchLink('');
        setSchLink2('');
        alert('Virtual class scheduled successfully!');
      } catch (err) {
        alert('Error scheduling class: ' + err.message);
      }
    } else {
      // Recurring series generator
      if (!schRecurStartDate || !schRecurEndDate || !schRecurStartTime || !schRecurEndTime) {
        return alert('Please fill in start/end dates and start/end times for recurrence.');
      }
      if (schRecurDays.length === 0) {
        return alert('Please select at least one weekday to repeat.');
      }
      
      try {
        const generated = [];
        const [yr, mo, dy] = schRecurStartDate.split('-').map(Number);
        const [endYr, endMo, endDy] = schRecurEndDate.split('-').map(Number);
        
        let curr = new Date(yr, mo - 1, dy, 0, 0, 0);
        const limit = new Date(endYr, endMo - 1, endDy, 23, 59, 59);

        while (curr <= limit) {
          const weekdayName = curr.toLocaleDateString('en-US', { weekday: 'long' });
          if (schRecurDays.includes(weekdayName)) {
            const y = curr.getFullYear();
            const m = String(curr.getMonth() + 1).padStart(2, '0');
            const d = String(curr.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;

            const startISO = new Date(`${dateStr}T${schRecurStartTime}`).toISOString();
            const endISO = new Date(`${dateStr}T${schRecurEndTime}`).toISOString();

            const saved = await saveSchedule({
              student_id: schStudentId,
              course_id: schCourseId,
              tutor_id: actualTutorId,
              title: schTitle,
              start_time: startISO,
              end_time: endISO,
              meeting_link: schLink,
              meeting_link_2: schLink2
            });
            generated.push(saved);
          }
          curr.setDate(curr.getDate() + 1);
        }

        if (generated.length === 0) {
          alert('No classes scheduled. Verify that selected weekdays fall within your start and end date range.');
        } else {
          setSchedules(prev => [...prev, ...generated]);
          setSchTitle('');
          setSchLink('');
          setSchLink2('');
          setSchRecurStartDate('');
          setSchRecurEndDate('');
          setSchRecurStartTime('');
          setSchRecurEndTime('');
          setSchRecurDays([]);
          alert(`Successfully scheduled ${generated.length} recurring class sessions!`);
        }
      } catch (err) {
        alert('Error generating recurring sessions: ' + err.message);
      }
    }
  };

  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('Delete this virtual class?')) return;
    try {
      await deleteSchedule(id);
      setSchedules(prev => prev.filter(s => s.id !== id));
      alert('Class deleted.');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // datetime-local inputs take LOCAL wall time; toISOString() gives UTC, which made
  // every save shift the class by the tutor's UTC offset.
  const toLocalInputValue = (iso) => {
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const handleEditScheduleClick = (sch) => {
    setEditingSchedule({
      ...sch,
      start_time: sch.start_time ? toLocalInputValue(sch.start_time) : '',
      end_time: sch.end_time ? toLocalInputValue(sch.end_time) : ''
    });
    setShowEditScheduleModal(true);
  };

  const handleEditScheduleSubmit = async (e) => {
    e.preventDefault();
    try {
      const updates = {
        title: editingSchedule.title,
        start_time: new Date(editingSchedule.start_time).toISOString(),
        end_time: editingSchedule.end_time ? new Date(editingSchedule.end_time).toISOString() : null,
        meeting_link: editingSchedule.meeting_link || null,
        meeting_link_2: editingSchedule.meeting_link_2 || null
      };
      const updated = await updateSchedule(editingSchedule.id, updates);
      setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));
      setShowEditScheduleModal(false);
      setEditingSchedule(null);
      alert('Class schedule updated!');
    } catch (err) {
      alert('Error updating schedule: ' + err.message);
    }
  };

  const handleStartLiveSession = async () => {
    if (startSessionStudentIds.length === 0) {
      return alert('Select at least one student to invite.');
    }
    setStartingSession(true);
    try {
      const roomId = 'room-' + Math.random().toString(36).substr(2, 9);
      const actualTutorId = tutorInfo?.id || tutorId;
      await createLiveSession({
        id: roomId,
        tutor_id: actualTutorId,
        tutor_name: tutorInfo?.full_name || user?.full_name || 'Your Tutor',
        student_ids: startSessionStudentIds,
        title: 'Live Whiteboard Session'
      });
      sessionStorage.setItem(`wb-host-${roomId}`, 'true');
      setShowStartSessionModal(false);
      setStartSessionStudentIds([]);
      window.open(`/whiteboard?room=${roomId}`, '_blank');
    } catch (err) {
      alert('Error starting session: ' + err.message);
    } finally {
      setStartingSession(false);
    }
  };

  // Chat Actions
  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeStudentChat) return;
    try {
      const saved = await sendChatMessage({
        course_id: activeCourseChat || null,
        sender_id: tutorInfo?.id || tutorId,
        sender_name: tutorInfo?.full_name || 'Your Tutor',
        receiver_id: activeStudentChat.profile_id || activeStudentChat.id,
        message_text: chatInput.trim()
      });
      setChatMessages(prev => [...prev, saved]);
      setChatInput('');
    } catch (err) {
      alert('Failed to send message: ' + err.message);
    }
  };

  // Broadcast: send same message to multiple students simultaneously
  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastText.trim()) return alert('Please type a message.');
    if (broadcastSelected.length === 0) return alert('Please select at least one student.');
    setBroadcastSending(true);
    try {
      const senderId = tutorInfo?.id || tutorId;
      const sentMessages = await Promise.all(
        broadcastSelected.map(studentId => {
          const student = tutorStudents.find(s => s.id === studentId);
          return sendChatMessage({
            course_id: null,
            sender_id: senderId,
            sender_name: tutorInfo?.full_name || 'Your Tutor',
            receiver_id: student?.profile_id || studentId,
            message_text: broadcastText.trim()
          });
        })
      );
      setChatMessages(prev => [...prev, ...sentMessages]);
      setBroadcastText('');
      setBroadcastSelected([]);
      setBroadcastSuccess(true);
      setTimeout(() => setBroadcastSuccess(false), 4000);
    } catch (err) {
      alert('Failed to send broadcast: ' + err.message);
    } finally {
      setBroadcastSending(false);
    }
  };

  // Find students mapped to this tutor
  const tutorStudents = students.filter(s =>
    enrollments.some(sc => sc.student_id === s.id && sc.tutor_id === (tutorInfo?.id || tutorId))
  );

  const unreadMessageCount = chatMessages.filter(m => m.receiver_id === (tutorInfo?.id || tutorId) && !m.read).length;

  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ padding: '3rem', color: 'white' }}>Loading Tutor Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">Tutor Portal</div>
        <ul className="sidebar-menu">
          <li className={`sidebar-item ${activeTab === 'schedule' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('schedule')}><Clock size={18} /> Lesson Schedules</button>
          </li>
          <li className={`sidebar-item ${activeTab === 'students' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('students')}><User size={18} /> Assigned Students</button>
          </li>
          <li className={`sidebar-item ${activeTab === 'courses' ? 'active' : ''}`}>
            <button onClick={() => { setActiveTab('courses'); setSelectedCourseId(null); }}><BookOpen size={18} /> My Courses</button>
          </li>
          <li className={`sidebar-item ${activeTab === 'tasks' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('tasks')}><CheckSquare size={18} /> Tasks & Grading</button>
          </li>
          <li className={`sidebar-item ${activeTab === 'messages' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('messages')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageSquare size={18} /> Messages
              {unreadMessageCount > 0 && (
                <span style={{ background: 'var(--accent-color)', color: 'white', borderRadius: '50%', fontSize: '0.65rem', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', fontWeight: 'bold' }}>
                  {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                </span>
              )}
            </button>
          </li>
          <li className={`sidebar-item ${activeTab === 'announcements' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('announcements')}><Megaphone size={18} /> Bulletins</button>
          </li>
          <li className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('settings')}><Save size={18} /> Profile Settings</button>
          </li>
          <li className="sidebar-item" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
            <button onClick={() => setShowStartSessionModal(true)} style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>
              <MonitorPlay size={18} /> Start Live Whiteboard ↗
            </button>
          </li>
        </ul>
      </aside>

      {/* Main Panel */}
      <main className="dashboard-main">
        {/* Tab 1: Lecture Schedule & Bookings */}
        {activeTab === 'schedule' && (
          <div>


            {/* Scheduled Lectures Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', alignItems: 'start', marginBottom: '2rem' }}>
              
              {/* Left Column: Create Schedule */}
              <div className="dashboard-card" style={{ marginBottom: 0 }}>
                <h3><Calendar size={18} color="var(--primary-color)" /> Schedule Virtual Class</h3>
                <form onSubmit={handleCreateSchedule} className="login-form" style={{ gap: '0.8rem' }}>
                  <div className="form-group">
                    <label>Select Assigned Student *</label>
                    <select value={schStudentId} onChange={(e) => {
                      setSchStudentId(e.target.value);
                      setSchCourseId(''); // Reset selected course
                    }} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                      <option value="">-- Choose Student --</option>
                      {(() => {
                        const actualTutorId = tutorInfo?.id || tutorId;
                        const myEnrollments = enrollments.filter(sc => sc.tutor_id === actualTutorId);
                        const myStudentIds = [...new Set(myEnrollments.map(sc => sc.student_id))];
                        return students.filter(s => myStudentIds.includes(s.id)).map(s => (
                          <option key={s.id} value={s.id}>{s.full_name}</option>
                        ));
                      })()}
                    </select>
                  </div>
                  
                   <div className="form-group">
                    <label>Select Assigned Course *</label>
                    <select value={schCourseId} onChange={(e) => setSchCourseId(e.target.value)} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                      <option value="">-- Choose Course --</option>
                      {(() => {
                        const actualTutorId = tutorInfo?.id || tutorId;
                        return enrollments
                          .filter(sc => sc.student_id === schStudentId && sc.tutor_id === actualTutorId)
                          .map(sc => courses.find(c => c.id === sc.course_id))
                          .filter(Boolean)
                          .map(c => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                          ));
                      })()}
                    </select>
                  </div>

                   {schCourseId && (
                    <div className="form-group">
                      <label>Lecture Title / Topic *</label>
                      <input 
                        type="text" 
                        list="sch-topics-datalist" 
                        value={schTitle} 
                        onChange={(e) => setSchTitle(e.target.value)} 
                        placeholder="Select from lesson topics or type custom..." 
                        required 
                        style={{ width: '100%' }} 
                      />
                      <datalist id="sch-topics-datalist">
                        {topics.filter(t => t.course_id === schCourseId).map(t => (
                          <option key={t.id} value={t.title} />
                        ))}
                      </datalist>
                    </div>
                  )}
                  <div className="form-group">
                    <label>Schedule Mode *</label>
                    <select value={schType} onChange={(e) => setSchType(e.target.value)} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                      <option value="single">Single Class Session</option>
                      <option value="recurring">Recurring Class Series</option>
                    </select>
                  </div>

                  {schType === 'single' ? (
                    <>
                      <div className="form-group">
                        <label>Start Time *</label>
                        <input type="datetime-local" value={schStart} onChange={(e) => setSchStart(e.target.value)} required style={{ width: '100%' }} />
                      </div>
                      <div className="form-group">
                        <label>End Time *</label>
                        <input type="datetime-local" value={schEnd} onChange={(e) => setSchEnd(e.target.value)} required style={{ width: '100%' }} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                        <div className="form-group">
                          <label>Start Date *</label>
                          <input type="date" value={schRecurStartDate} onChange={(e) => setSchRecurStartDate(e.target.value)} required style={{ width: '100%' }} />
                        </div>
                        <div className="form-group">
                          <label>End Date *</label>
                          <input type="date" value={schRecurEndDate} onChange={(e) => setSchRecurEndDate(e.target.value)} required style={{ width: '100%' }} />
                        </div>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                        <div className="form-group">
                          <label>Start Time (Daily) *</label>
                          <input type="time" value={schRecurStartTime} onChange={(e) => setSchRecurStartTime(e.target.value)} required style={{ width: '100%' }} />
                        </div>
                        <div className="form-group">
                          <label>End Time (Daily) *</label>
                          <input type="time" value={schRecurEndTime} onChange={(e) => setSchRecurEndTime(e.target.value)} required style={{ width: '100%' }} />
                        </div>
                      </div>

                      <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold' }}>Repeat Days *</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                            const isChecked = schRecurDays.includes(day);
                            return (
                              <label key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', background: isChecked ? 'rgba(15, 44, 89, 0.1)' : '#f7fafc', color: isChecked ? 'var(--primary-color)' : '#4a5568', padding: '0.35rem 0.6rem', borderRadius: '6px', border: isChecked ? '1px solid var(--primary-color)' : '1px solid #edf2f7', cursor: 'pointer', fontWeight: isChecked ? 'bold' : 'normal', transition: 'all 0.15s ease' }}>
                                <input 
                                  type="checkbox" 
                                  checked={isChecked} 
                                  onChange={() => {
                                    if (isChecked) {
                                      setSchRecurDays(prev => prev.filter(d => d !== day));
                                    } else {
                                      setSchRecurDays(prev => [...prev, day]);
                                    }
                                  }}
                                  style={{ margin: 0 }}
                                />
                                {day.substring(0, 3)}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                  <div className="form-group">
                    <label>Meeting Join Link (e.g. Zoom/Meet)</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div>
                        <small style={{ color: '#718096', display: 'block', marginBottom: '0.2rem' }}>First Half</small>
                        <input type="url" value={schLink} onChange={(e) => setSchLink(e.target.value)} placeholder="https://zoom.us/j/..." style={{ width: '100%' }} />
                      </div>
                      <div>
                        <small style={{ color: '#718096', display: 'block', marginBottom: '0.2rem' }}>Second Half (optional)</small>
                        <input type="url" value={schLink2} onChange={(e) => setSchLink2(e.target.value)} placeholder="https://zoom.us/j/..." style={{ width: '100%' }} />
                      </div>
                    </div>
                    <small style={{ color: '#a0aec0', display: 'block', marginTop: '0.4rem' }}>
                      Splitting one paid Zoom link across two meetings? Add both here.
                    </small>
                  </div>
                  <button type="submit" className="btn-primary" style={{ padding: '0.75rem' }}>Schedule Lecture</button>
                </form>
              </div>

              {/* Right Column: Scheduled Lectures Grid */}
              <div className="dashboard-card" style={{ marginBottom: 0 }}>
                <h3><Clock size={20} color="var(--primary-color)" /> My Lecture Timetable</h3>
                {schedules.length === 0 ? (
                  <div style={{ padding: '1.5rem', color: '#a0aec0', fontSize: '0.85rem' }}>No lectures scheduled.</div>
                ) : (
                  <div className="table-container">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th>Class Topic</th>
                          <th>Student</th>
                          <th>Start Time</th>
                          <th>End Time</th>
                          <th>Action / Link</th>
                          <th>Mark Attendance</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedules.map(sch => {
                          const sName = students.find(s => s.id === sch.student_id)?.full_name || 'Student';
                          const att = attendanceLog.find(x => x.schedule_id === sch.id && x.student_id === sch.student_id);
                          return (
                            <tr key={sch.id}>
                              <td style={{ fontWeight: 'bold' }}>{sch.title}</td>
                              <td>{sName}</td>
                              <td>{new Date(sch.start_time).toLocaleString()}</td>
                              <td>{new Date(sch.end_time).toLocaleTimeString()}</td>
                              <td>
                                {sch.meeting_link || sch.meeting_link_2 ? (
                                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                    {sch.meeting_link && <a href={sch.meeting_link} target="_blank" rel="noreferrer" className="btn-action approve" style={{ padding: '0.3rem 0.6rem' }}>{sch.meeting_link_2 ? '1st Half' : 'Launch Link'}</a>}
                                    {sch.meeting_link_2 && <a href={sch.meeting_link_2} target="_blank" rel="noreferrer" className="btn-action approve" style={{ padding: '0.3rem 0.6rem' }}>2nd Half</a>}
                                  </div>
                                ) : <span style={{ color: '#cbd5e0' }}>No Link</span>}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                  <button className={`btn-action approve ${att?.status === 'attended' ? 'active' : ''}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', opacity: att?.status === 'attended' ? 1 : 0.6 }} onClick={() => handleMarkAttendance(sch.id, sch.student_id, 'attended')}>Attended</button>
                                  <button className={`btn-action cancel ${att?.status === 'missed' ? 'active' : ''}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', opacity: att?.status === 'missed' ? 1 : 0.6 }} onClick={() => handleMarkAttendance(sch.id, sch.student_id, 'missed')}>Missed</button>
                                </div>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                  <button className="btn-action edit" style={{ padding: '0.2rem 0.4rem' }} onClick={() => handleEditScheduleClick(sch)} title="Edit Class">
                                    <Edit size={12} />
                                  </button>
                                  <button className="btn-action delete" style={{ padding: '0.2rem 0.4rem' }} onClick={() => handleDeleteSchedule(sch.id)} title="Delete Class">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
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

            {/* General Consultation Bookings */}
            <div className="dashboard-card">
              <h3><Clock size={20} color="var(--primary-color)" /> General Appointment Consultations</h3>
              {bookings.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#718096', padding: '2rem' }}>You do not have any active appointments.</div>
              ) : (
                <div className="table-container">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Parent Name</th>
                        <th>Phone</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b) => (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 'bold' }}>{b.student_name}</td>
                          <td>{b.parent_name}</td>
                          <td>{b.phone}</td>
                          <td>{b.booking_date}</td>
                          <td>{b.booking_time}</td>
                          <td style={{ textTransform: 'capitalize' }}>{b.meeting_type}</td>
                          <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                          <td>
                            <div className="btn-action-group">
                              {b.status === 'pending' && (
                                <>
                                  <button className="btn-action approve" onClick={() => handleStatusUpdate(b.id, 'approved')}>Approve</button>
                                  <button className="btn-action cancel" onClick={() => handleStatusUpdate(b.id, 'cancelled')}>Cancel</button>
                                </>
                              )}
                              {b.status === 'approved' && (
                                <button className="btn-action complete" onClick={() => handleStatusUpdate(b.id, 'completed')}>Complete</button>
                              )}
                              {(b.status === 'completed' || b.status === 'cancelled') && (
                                <span style={{ fontSize: '0.85rem', color: '#a0aec0' }}>Archived</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: My Courses */}
        {activeTab === 'courses' && (
          <div>
            {!selectedCourseId ? (
              /* State 1: Courses Cards Grid List */
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary-color)', marginBottom: '0.4rem' }}>My Assigned Courses</h2>
                <p style={{ color: '#718096', fontSize: '0.88rem', marginBottom: '1.5rem', marginTop: 0 }}>Select a course to view its curriculum, lesson topics, and manage files.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1.5rem' }}>
                  {(() => {
                    const actualTutorId = tutorInfo?.id || tutorId;
                    const myCourses = courses.filter(c =>
                      courseTutors.some(ct => ct.course_id === c.id && ct.tutor_id === actualTutorId) ||
                      enrollments.some(sc => sc.course_id === c.id && sc.tutor_id === actualTutorId)
                    );
                    if (myCourses.length === 0) {
                      return <div style={{ color: '#a0aec0', padding: '2rem', gridColumn: '1 / -1', textAlign: 'center' }}>No courses currently assigned to you.</div>;
                    }
                    return myCourses.map((c, index) => {
                      const coverImg = getSpecialClassImage(c.title, index);
                      const courseTopicsCount = topics.filter(t => t.course_id === c.id).length;
                      const courseStudentsCount = students.filter(s =>
                        enrollments.some(sc => sc.course_id === c.id && sc.student_id === s.id && sc.tutor_id === actualTutorId)
                      ).length;

                      return (
                        <div
                          key={c.id}
                          className="course-enrollment-card"
                          onClick={() => { setSelectedCourseId(c.id); setActiveTopicId(null); }}
                          style={{ cursor: 'pointer' }}
                        >
                          <div
                            className="course-card-banner-img"
                            style={{ backgroundImage: `url('${coverImg}')` }}
                          >
                            {c.category && (
                              <span className="course-card-category-badge">{c.category}</span>
                            )}
                          </div>
                          <div className="course-card-content-body">
                            <h3 className="course-card-title-heading" style={{ color: 'var(--primary-color)', margin: '0 0 0.5rem 0' }}>{c.title}</h3>
                            <p className="course-card-description-text">{c.description || 'No description available.'}</p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', borderTop: '1px solid #edf2f7', paddingTop: '0.75rem', fontSize: '0.75rem', color: '#718096', fontWeight: 600 }}>
                              <span>📚 {courseTopicsCount} Topic{courseTopicsCount !== 1 ? 's' : ''}</span>
                              <span>👥 {courseStudentsCount} Student{courseStudentsCount !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                          <div className="course-card-action-bar">
                            <button className="course-enter-classroom-btn">
                              📖 View Content
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : (
              /* State 2: Course Curriculum Details Panel */
              (() => {
                const selectedCourse = courses.find(c => c.id === selectedCourseId);
                const courseTopics = topics.filter(tp => tp.course_id === selectedCourseId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                
                // Default activeTopicId to first topic if none is selected
                let activeTopic = courseTopics.find(tp => tp.id === activeTopicId);
                if (!activeTopic && courseTopics.length > 0) {
                  activeTopic = courseTopics[0];
                }
                const activeTopicIdToUse = activeTopic?.id || null;

                const handleMaterialUpload = async (e) => {
                  e.preventDefault();
                  if (!newMaterialTitle.trim() || !materialFile || !activeTopicIdToUse) return;

                  const isPptx = /\.pptx$/i.test(materialFile.name);
                  const isHtmlSlide = isPptx || materialFile.type === 'text/html' || /\.html?$/i.test(materialFile.name);
                  if (!isPptx && isHtmlSlide && materialFile.size > 15 * 1024 * 1024) {
                    return alert('HTML slide files must be under 15MB.');
                  }

                  setUploadingMaterial(true);
                  try {
                    let fileToUpload = materialFile;
                    if (isPptx) {
                      const html = await convertPptxToSlideHtml(materialFile, newMaterialTitle.trim());
                      fileToUpload = new File([html], materialFile.name.replace(/\.pptx$/i, '.html'), { type: 'text/html' });
                    }
                    const fileUrl = await uploadMaterialFile(fileToUpload.name, fileToUpload);
                    const saved = await saveMaterial({
                      course_id: selectedCourseId,
                      topic_id: activeTopicIdToUse,
                      title: newMaterialTitle.trim(),
                      file_url: fileUrl,
                      file_type: isHtmlSlide ? 'html_slide' : (materialFile.type || 'file')
                    });
                    setMaterials(prev => [...prev, saved]);
                    setNewMaterialTitle('');
                    setMaterialFile(null);
                    alert(isPptx ? 'PowerPoint converted to a slide deck and uploaded!' : 'Material file uploaded successfully!');
                  } catch (err) {
                    alert('Failed to upload material: ' + err.message);
                  } finally {
                    setUploadingMaterial(false);
                  }
                };

                const handleMaterialDelete = async (id) => {
                  if (!window.confirm('Delete this material file?')) return;
                  try {
                    await deleteMaterial(id);
                    setMaterials(prev => prev.filter(m => m.id !== id));
                    alert('Material deleted.');
                  } catch (err) {
                    alert('Failed to delete material: ' + err.message);
                  }
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid #edf2f7', paddingBottom: '1rem' }}>
                      <button className="btn-action cancel" style={{ padding: '0.45rem 1rem' }} onClick={() => setSelectedCourseId(null)}>
                        ⬅ Back to Courses
                      </button>
                      <div>
                        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary-color)' }}>{selectedCourse?.title}</h2>
                        <span style={{ fontSize: '0.78rem', color: '#718096' }}>Syllabus &amp; Lesson Content Workspace</span>
                      </div>
                    </div>

                    {courseTopics.length === 0 ? (
                      <div className="dashboard-card" style={{ padding: '3rem', textAlign: 'center', color: '#a0aec0' }}>
                        No curriculum topics exist for this course yet.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '2rem', alignItems: 'start' }} className="classroom-grid-layout">
                        {/* Left column: lesson topics list */}
                        <div className="dashboard-card" style={{ padding: 0, overflow: 'hidden' }}>
                          <div style={{ background: '#f7fafc', padding: '0.85rem 1.25rem', borderBottom: '1px solid #edf2f7', fontWeight: 'bold', fontSize: '0.82rem', color: 'var(--primary-color)' }}>
                            📖 Lessons / Topics
                          </div>
                          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {courseTopics.map((tp, idx) => (
                              <li key={tp.id}>
                                <button
                                  onClick={() => setActiveTopicId(tp.id)}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '0.85rem 1.25rem',
                                    border: 'none',
                                    borderBottom: '1px solid #f0f4f8',
                                    background: activeTopicIdToUse === tp.id ? 'rgba(15,44,89,0.06)' : 'white',
                                    borderLeft: activeTopicIdToUse === tp.id ? '4px solid var(--primary-color)' : '4px solid transparent',
                                    color: activeTopicIdToUse === tp.id ? 'var(--primary-color)' : '#4a5568',
                                    fontWeight: activeTopicIdToUse === tp.id ? 'bold' : 'normal',
                                    cursor: 'pointer',
                                    fontSize: '0.82rem',
                                    display: 'block',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  {idx + 1}. {tp.title}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Right column: lesson content workspace */}
                        {activeTopic && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Lesson Description */}
                            <div className="dashboard-card">
                              <h3 style={{ borderBottom: '1px solid #edf2f7', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--primary-color)' }}>
                                {activeTopic.title}
                              </h3>
                              <p style={{ fontSize: '0.88rem', color: '#4a5568', lineHeight: '1.5', margin: 0 }}>
                                {activeTopic.description || 'No description provided for this lesson.'}
                              </p>
                            </div>

                            {/* Lesson Materials / Files */}
                            <div className="dashboard-card">
                              <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}><FileText size={16} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} /> Lesson Materials &amp; Resources</h4>
                              {materials.filter(m => m.topic_id === activeTopicIdToUse).length === 0 ? (
                                <p style={{ fontSize: '0.82rem', color: '#a0aec0', margin: '0 0 1rem 0' }}>No materials uploaded to this lesson yet.</p>
                              ) : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                  {materials.filter(m => m.topic_id === activeTopicIdToUse).map(m => (
                                    <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.5rem 0.85rem', borderRadius: '8px', border: '1px solid #edf2f7' }}>
                                      {m.file_type === 'html_slide' ? (
                                        <button onClick={() => setViewingSlide(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--primary-color)', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                          🖥️ {m.title}
                                        </button>
                                      ) : (
                                        <a href={m.file_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--primary-color)', fontWeight: '600', textDecoration: 'none' }}>
                                          📎 {m.title}
                                        </a>
                                      )}
                                      <button onClick={() => handleMaterialDelete(m.id)} style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '0.75rem', display: 'inline-flex', padding: '0.2rem' }} title="Delete material">✕</button>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              {/* Upload form */}
                              <form onSubmit={handleMaterialUpload} style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                <div>
                                  <div style={{ fontWeight: '600', fontSize: '0.82rem', color: '#4a5568' }}>Upload Lesson File</div>
                                  <div style={{ fontSize: '0.72rem', color: '#a0aec0' }}>PowerPoint (.pptx) files are automatically converted into an interactive slide deck.</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                  <div className="form-group" style={{ marginBottom: 0 }}>
                                    <input
                                      type="text"
                                      placeholder="File Display Name"
                                      value={newMaterialTitle}
                                      onChange={(e) => setNewMaterialTitle(e.target.value)}
                                      required
                                      style={{ padding: '0.5rem', fontSize: '0.8rem', height: '36px', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div className="form-group" style={{ marginBottom: 0 }}>
                                    <input
                                      type="file"
                                      onChange={(e) => setMaterialFile(e.target.files[0])}
                                      required
                                      style={{ border: 'none', background: 'transparent', padding: '0.2rem', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <button type="submit" className="btn-primary" style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }} disabled={uploadingMaterial}>
                                    <Upload size={14} /> {uploadingMaterial ? 'Uploading...' : 'Upload File'}
                                  </button>
                                  <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>or</span>
                                  <button
                                    type="button"
                                    className="btn-action edit"
                                    style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                    onClick={() => navigate(`/slide-editor?courseId=${selectedCourseId}&topicId=${activeTopicIdToUse}`)}
                                  >
                                    <MonitorPlay size={14} /> Create Slide Deck
                                  </button>
                                </div>
                              </form>
                            </div>

                            {/* Linked Quizzes & Tasks */}
                            <div className="dashboard-card">
                              <h4 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}><CheckSquare size={16} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} /> Lesson Assignments &amp; Quizzes</h4>
                              {tasks.filter(tk => tk.topic_id === activeTopicIdToUse).length === 0 ? (
                                <p style={{ fontSize: '0.82rem', color: '#a0aec0', margin: 0 }}>No quizzes or assignments are linked to this lesson topic.</p>
                              ) : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                  {tasks.filter(tk => tk.topic_id === activeTopicIdToUse).map(tk => (
                                    <li key={tk.id} style={{ padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid #edf2f7', background: '#fcfdfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#2d3748' }}>{tk.title}</div>
                                        <span style={{ fontSize: '0.7rem', color: tk.task_type === 'quiz' ? 'var(--accent-color)' : '#718096', textTransform: 'capitalize', fontWeight: '600' }}>
                                          {tk.task_type === 'quiz' ? '🧩 Quiz' : '📝 Homework'}
                                        </span>
                                      </div>
                                      <span style={{ fontSize: '0.72rem', color: '#718096' }}>Max: {tk.max_points} pts</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>

                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* Tab 2: Assigned Students */}
        {activeTab === 'students' && (
          <div>
            <div className="dashboard-card">
              <h3><User size={18} /> Enrolled Students</h3>
              {tutorStudents.length === 0 ? (
                <div style={{ color: '#a0aec0', padding: '2rem', textAlign: 'center' }}>No students currently assigned to your classes.</div>
              ) : (
                <div className="table-container">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Enrolled Course</th>
                        <th>Grade</th>
                        <th>Parent Contact</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tutorStudents.map(s => {
                        const courseMaps = enrollments.filter(e => e.student_id === s.id && e.tutor_id === (tutorInfo?.id || tutorId));
                        return (
                          <tr key={s.id}>
                            <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {s.avatar_url ? (
                                <img src={s.avatar_url} alt={s.full_name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem' }}>{s.full_name?.[0] || '?'}</div>
                              )}
                              <span style={{ fontWeight: 'bold' }}>{s.full_name}</span>
                            </td>
                            <td style={{ fontSize: '0.85rem' }}>
                              {courseMaps.map(m => courses.find(c => c.id === m.course_id)?.title).join(', ')}
                            </td>
                            <td>{s.grade_level}</td>
                            <td>
                              <div style={{ fontSize: '0.8rem' }}>{s.phone}</div>
                              <div style={{ fontSize: '0.75rem', color: '#718096' }}>{s.email}</div>
                            </td>
                            <td>
                              <button 
                                className="btn-action edit" 
                                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem' }}
                                onClick={() => {
                                  setActiveStudentChat(s);
                                  if (courseMaps.length > 0) setActiveCourseChat(courseMaps[0].course_id);
                                  setActiveTab('messages');
                                }}
                              >
                                <MessageSquare size={14} />
                                Message
                              </button>
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
        )}

        {/* Tab: Messages / Student Chat Inbox */}
        {activeTab === 'messages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* ── Broadcast Toolbar ── */}
            <div className="dashboard-card" style={{ padding: '1rem 1.5rem', marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>📢</span>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--primary-color)' }}>Broadcast Message</div>
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>Send one message to multiple students at once</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <NotificationToggle userId={tutorInfo?.id || tutorId} />
                  <button
                    onClick={() => { setShowBroadcast(!showBroadcast); setBroadcastSelected([]); setBroadcastText(''); setBroadcastSuccess(false); }}
                    style={{
                      padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.83rem',
                      background: showBroadcast ? '#edf2f7' : 'var(--primary-color)',
                      color: showBroadcast ? 'var(--primary-color)' : 'white',
                      display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s'
                    }}
                  >
                    {showBroadcast ? '✕ Cancel' : '+ Compose Broadcast'}
                  </button>
                </div>
              </div>

              {/* Expanded compose panel */}
              {showBroadcast && (
                <form onSubmit={handleBroadcast} style={{ marginTop: '1rem', borderTop: '1px solid #edf2f7', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

                  {/* Success banner */}
                  {broadcastSuccess && (
                    <div style={{ padding: '0.6rem 1rem', background: 'rgba(40,167,69,0.12)', border: '1px solid #28a745', borderRadius: '8px', color: '#276c3a', fontSize: '0.83rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      ✅ Broadcast sent successfully to {broadcastSelected.length || 0} student{broadcastSelected.length !== 1 ? 's' : ''}!
                    </div>
                  )}

                  {/* Student checkboxes */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <label style={{ fontWeight: '600', fontSize: '0.83rem', color: 'var(--primary-color)' }}>
                        Select Recipients ({broadcastSelected.length}/{tutorStudents.length} selected)
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          broadcastSelected.length === tutorStudents.length
                            ? setBroadcastSelected([])
                            : setBroadcastSelected(tutorStudents.map(s => s.id))
                        }
                        style={{ background: 'none', border: '1px solid #cbd5e0', borderRadius: '6px', padding: '0.25rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--primary-color)', fontWeight: '600' }}
                      >
                        {broadcastSelected.length === tutorStudents.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {tutorStudents.length === 0 ? (
                        <span style={{ fontSize: '0.82rem', color: '#a0aec0' }}>No students assigned to you yet.</span>
                      ) : (
                        tutorStudents.map(s => {
                          const checked = broadcastSelected.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.35rem 0.75rem', borderRadius: '20px', cursor: 'pointer',
                                border: `1.5px solid ${checked ? 'var(--primary-color)' : '#e2e8f0'}`,
                                background: checked ? 'var(--primary-color)' : 'white',
                                color: checked ? 'white' : 'var(--text-dark)',
                                fontSize: '0.82rem', fontWeight: checked ? '600' : '400',
                                transition: 'all 0.15s ease', userSelect: 'none'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setBroadcastSelected(prev =>
                                    checked ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                  )
                                }
                                style={{ display: 'none' }}
                              />
                              {checked ? '✓ ' : ''}{s.full_name}
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Message textarea */}
                  <div>
                    <label style={{ fontWeight: '600', fontSize: '0.83rem', color: 'var(--primary-color)', display: 'block', marginBottom: '0.4rem' }}>
                      Message
                    </label>
                    <textarea
                      value={broadcastText}
                      onChange={(e) => setBroadcastText(e.target.value)}
                      placeholder="Type your broadcast message here... It will be sent privately to each selected student."
                      rows={3}
                      style={{ width: '100%', padding: '0.75rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '0.88rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: '1.5' }}
                    />
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.78rem', color: '#718096' }}>
                      {broadcastSelected.length > 0 && broadcastText.trim()
                        ? `Ready to send to ${broadcastSelected.length} student${broadcastSelected.length !== 1 ? 's' : ''}`
                        : 'Select students and type a message'}
                    </span>
                    <button
                      type="submit"
                      disabled={broadcastSending || broadcastSelected.length === 0 || !broadcastText.trim()}
                      className="btn-primary"
                      style={{ padding: '0.6rem 1.4rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: (broadcastSending || broadcastSelected.length === 0 || !broadcastText.trim()) ? 0.55 : 1 }}
                    >
                      {broadcastSending ? (
                        <>⏳ Sending...</>
                      ) : (
                        <><Send size={15} /> Send to {broadcastSelected.length || 0} Student{broadcastSelected.length !== 1 ? 's' : ''}</>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* ── Chat split-pane ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', height: 'calc(100vh - 280px)', minHeight: '420px', maxHeight: '620px' }}>

            {/* Left: Student contact list */}
            <div className="dashboard-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #edf2f7', background: 'var(--primary-color)', color: 'white' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MessageSquare size={16} /> Student Conversations</h3>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {tutorStudents.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.85rem' }}>No students assigned yet.</div>
                ) : (
                  tutorStudents.map(s => {
                    const thread = chatMessages.filter(m =>
                      (m.sender_id === (tutorInfo?.id || tutorId) && m.receiver_id === (s.profile_id || s.id)) ||
                      (m.sender_id === (s.profile_id || s.id) && m.receiver_id === (tutorInfo?.id || tutorId))
                    );
                    const lastMsg = thread[thread.length - 1];
                    const isActive = activeStudentChat?.id === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => { setActiveStudentChat(s); }}
                        style={{
                          padding: '0.85rem 1.25rem',
                          borderBottom: '1px solid #f0f4f8',
                          cursor: 'pointer',
                          background: isActive ? 'rgba(var(--primary-rgb, 15, 44, 89), 0.07)' : 'white',
                          borderLeft: isActive ? '3px solid var(--primary-color)' : '3px solid transparent',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isActive ? 'var(--primary-color)' : '#e2e8f0', color: isActive ? 'white' : 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem', flexShrink: 0 }}>
                            {s.full_name?.[0] || '?'}
                          </div>
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontWeight: isActive ? 'bold' : '600', fontSize: '0.88rem', color: 'var(--primary-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.full_name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#718096', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {lastMsg ? lastMsg.message_text : 'No messages yet'}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Chat thread panel */}
            {activeStudentChat ? (
              <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', marginBottom: 0 }}>
                {/* Thread Header */}
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #edf2f7', background: '#f7fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                      {activeStudentChat.full_name?.[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{activeStudentChat.full_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#718096' }}>{activeStudentChat.grade_level} · {activeStudentChat.email}</div>
                    </div>
                  </div>
                  <button onClick={() => setActiveStudentChat(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a0aec0', padding: '0.25rem' }}><X size={18} /></button>
                </div>

                {/* Messages scroll area */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' }}>
                  {chatMessages.filter(m =>
                    (m.sender_id === (tutorInfo?.id || tutorId) && m.receiver_id === (activeStudentChat.profile_id || activeStudentChat.id)) ||
                    (m.sender_id === (activeStudentChat.profile_id || activeStudentChat.id) && m.receiver_id === (tutorInfo?.id || tutorId))
                  ).length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#a0aec0', padding: '3rem', fontSize: '0.9rem' }}>
                      <MessageSquare size={32} style={{ marginBottom: '0.5rem', opacity: 0.4 }} />
                      <p>No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    chatMessages.filter(m =>
                      (m.sender_id === (tutorInfo?.id || tutorId) && m.receiver_id === (activeStudentChat.profile_id || activeStudentChat.id)) ||
                      (m.sender_id === (activeStudentChat.profile_id || activeStudentChat.id) && m.receiver_id === (tutorInfo?.id || tutorId))
                    ).map(m => {
                      const isMe = m.sender_id === (tutorInfo?.id || tutorId);
                      return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                          <div style={{
                            background: isMe ? 'var(--primary-color)' : '#edf2f7',
                            color: isMe ? 'white' : 'var(--text-dark)',
                            padding: '0.7rem 1rem',
                            borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            maxWidth: '70%',
                            fontSize: '0.88rem',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
                            lineHeight: '1.45'
                          }}>
                            <div>{m.message_text}</div>
                            <div style={{ fontSize: '0.65rem', opacity: 0.65, textAlign: 'right', marginTop: '4px' }}>
                              {formatMessageTime(m.created_at)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Compose area */}
                <div style={{ borderTop: '1px solid #edf2f7', padding: '1rem 1.5rem', background: '#fafafa' }}>
                  <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={`Message ${activeStudentChat.full_name}...`}
                      style={{ flex: 1, padding: '0.7rem 1rem', border: '1.5px solid #e2e8f0', borderRadius: '24px', fontSize: '0.88rem', outline: 'none', transition: 'border-color 0.2s' }}
                    />
                    <button type="submit" className="btn-primary" style={{ padding: '0.7rem 1.2rem', borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Send size={15} /> Send
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="dashboard-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', color: '#a0aec0', marginBottom: 0 }}>
                <MessageSquare size={48} style={{ opacity: 0.25 }} />
                <p style={{ fontSize: '1rem', fontWeight: '500' }}>Select a student to view your conversation</p>
              </div>
            )}

            </div>
          </div>
        )}

        {/* Tab 3: Tasks and Grading */}
        {activeTab === 'tasks' && (
          <div>


            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
              
              {/* Task Creation Form */}
              <div className="dashboard-card">
                <h3><Plus size={18} /> Create Task or Quiz</h3>
                <form onSubmit={handleCreateTask} className="login-form" style={{ gap: '0.8rem' }}>

                  {/* Task Type Toggle */}
                  <div className="form-group">
                    <label>Task Type *</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {['assignment', 'quiz'].map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setNewTaskType(type)}
                          style={{
                            flex: 1, padding: '0.6rem', borderRadius: '10px',
                            border: `2px solid ${newTaskType === type ? 'var(--primary-color)' : '#e2e8f0'}`,
                            background: newTaskType === type ? 'var(--primary-color)' : 'white',
                            color: newTaskType === type ? 'white' : '#4a5568',
                            fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem',
                            transition: 'all 0.15s'
                          }}
                        >
                          {type === 'assignment' ? '📝 Assignment' : '🧪 Quiz'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Course */}
                  <div className="form-group">
                    <label>Select Course *</label>
                    <select
                      value={newTaskCourse}
                      onChange={(e) => handleTaskCourseChange(e.target.value)}
                      required
                      style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0' }}
                    >
                      <option value="">-- Choose Course --</option>
                      {courses.filter(c => enrollments.some(sc => sc.course_id === c.id && sc.tutor_id === (tutorInfo?.id || tutorId))).map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </div>

                  {/* Topic/Lesson — required so quiz appears under the correct lesson */}
                  {newTaskCourse && (
                    <div className="form-group">
                      <label>{newTaskType === 'quiz' ? 'Attach to Lesson (Required for Quiz) *' : 'Attach to Lesson (Optional)'}</label>
                      <select
                        value={newTaskTopic}
                        onChange={(e) => setNewTaskTopic(e.target.value)}
                        required={newTaskType === 'quiz'}
                        style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0' }}
                      >
                        <option value="">-- Choose Lesson --</option>
                        {(() => {
                          const courseTopics = topics.filter(tp => tp.course_id === newTaskCourse);
                          return courseTopics.length === 0
                            ? <option disabled value="">No lessons found for this course</option>
                            : courseTopics.map(tp => (
                                <option key={tp.id} value={tp.id}>{tp.title}</option>
                              ));
                        })()}
                      </select>
                      {newTaskType === 'quiz' && !newTaskTopic && (
                        <p style={{ fontSize: '0.75rem', color: '#e53e3e', margin: '0.25rem 0 0' }}>⚠ Select a lesson so the quiz appears under that topic for students.</p>
                      )}
                    </div>
                  )}

                  {/* Title */}
                  <div className="form-group">
                    <label>{newTaskType === 'quiz' ? 'Quiz Title *' : 'Task Title *'}</label>
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder={newTaskType === 'quiz' ? 'e.g. Chapter 3 Comprehension Quiz' : 'e.g. Read Chapter 2 and Write Abstract'}
                      required
                    />
                  </div>

                  {/* Description (only for assignments) */}
                  {newTaskType === 'assignment' && (
                    <>
                      <div className="form-group">
                        <label>Max Grading Points</label>
                        <input type="number" value={newTaskMax} onChange={(e) => setNewTaskMax(Number(e.target.value))} required />
                      </div>
                      <div className="form-group">
                        <label>Task Description / Instructions</label>
                        <textarea value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} placeholder="Describe the task and grading criteria..." rows={3}></textarea>
                      </div>
                    </>
                  )}

                  {/* Quiz Instructions (optional note) */}
                  {newTaskType === 'quiz' && (
                    <div className="form-group">
                      <label>Quiz Instructions (Optional)</label>
                      <textarea value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} placeholder="e.g. Read Chapter 3 before attempting. Each question is worth 10 points." rows={2}></textarea>
                    </div>
                  )}

                  {/* ── Quiz Question Builder ── */}
                  {newTaskType === 'quiz' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '700', color: 'var(--primary-color)', fontSize: '0.9rem' }}>
                          🧩 Questions ({quizQuestions.length})
                        </span>
                        <button
                          type="button"
                          onClick={addQuizQuestion}
                          style={{
                            padding: '0.4rem 0.9rem', background: 'var(--primary-color)',
                            color: 'white', border: 'none', borderRadius: '8px',
                            fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer'
                          }}
                        >
                          + Add Question
                        </button>
                      </div>

                      {quizQuestions.map((q, qIdx) => (
                        <div
                          key={qIdx}
                          style={{
                            background: '#f8fafc', border: '1.5px solid #e2e8f0',
                            borderRadius: '12px', padding: '1rem',
                            display: 'flex', flexDirection: 'column', gap: '0.6rem',
                            position: 'relative'
                          }}
                        >
                          {/* Question header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: '700', fontSize: '0.82rem', color: 'var(--primary-color)' }}>
                              Q{qIdx + 1}
                            </span>
                            {quizQuestions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeQuizQuestion(qIdx)}
                                style={{
                                  background: '#fed7d7', color: '#c53030', border: 'none',
                                  borderRadius: '6px', padding: '0.2rem 0.5rem',
                                  cursor: 'pointer', fontSize: '0.72rem', fontWeight: '700'
                                }}
                              >
                                Remove
                              </button>
                            )}
                          </div>

                          {/* Question text */}
                          <input
                            type="text"
                            placeholder={`Question ${qIdx + 1}...`}
                            value={q.question}
                            onChange={(e) => updateQuizQuestion(qIdx, 'question', e.target.value)}
                            required
                            style={{
                              padding: '0.55rem 0.75rem', borderRadius: '8px',
                              border: '1.5px solid #cbd5e0', fontSize: '0.85rem',
                              width: '100%', boxSizing: 'border-box'
                            }}
                          />

                          {/* Options */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {q.options.map((opt, optIdx) => (
                              <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {/* Correct answer radio */}
                                <button
                                  type="button"
                                  title="Mark as correct answer"
                                  onClick={() => updateQuizQuestion(qIdx, 'correct', optIdx)}
                                  style={{
                                    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                                    border: `2px solid ${q.correct === optIdx ? '#22c55e' : '#cbd5e0'}`,
                                    background: q.correct === optIdx ? '#22c55e' : 'white',
                                    cursor: 'pointer', fontSize: '0.7rem', color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 'bold', transition: 'all 0.12s'
                                  }}
                                >
                                  {q.correct === optIdx ? '✓' : ''}
                                </button>
                                {/* Option label */}
                                <span style={{
                                  fontWeight: '700', fontSize: '0.75rem', color: '#4a5568',
                                  width: '18px', flexShrink: 0
                                }}>
                                  {['A', 'B', 'C', 'D'][optIdx]}
                                </span>
                                <input
                                  type="text"
                                  placeholder={`Option ${['A','B','C','D'][optIdx]}`}
                                  value={opt}
                                  onChange={(e) => updateQuizOption(qIdx, optIdx, e.target.value)}
                                  required
                                  style={{
                                    flex: 1, padding: '0.45rem 0.65rem',
                                    borderRadius: '7px',
                                    border: `1.5px solid ${q.correct === optIdx ? '#22c55e' : '#e2e8f0'}`,
                                    background: q.correct === optIdx ? '#f0fdf4' : 'white',
                                    fontSize: '0.82rem', boxSizing: 'border-box',
                                    transition: 'border-color 0.12s, background 0.12s'
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                          <p style={{ margin: 0, fontSize: '0.7rem', color: '#a0aec0' }}>
                            🟢 Click the circle next to an option to mark it as the correct answer.
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Target Students Selector ── */}
                  {newTaskCourse && courseStudents.length > 0 && (
                    <div className="form-group">
                      <label>Send To *</label>
                      <div style={{
                        border: '1.5px solid #e2e8f0', borderRadius: '10px',
                        overflow: 'hidden', background: '#fafafa'
                      }}>
                        {/* Select All / None header */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem',
                          padding: '0.55rem 0.75rem',
                          background: targetAll ? 'var(--primary-color)' : '#edf2f7',
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                          onClick={() => { setTargetAll(true); setTargetStudentIds([]); }}
                        >
                          <div style={{
                            width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
                            border: `2px solid ${targetAll ? 'white' : '#a0aec0'}`,
                            background: targetAll ? 'white' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            {targetAll && <span style={{ color: 'var(--primary-color)', fontSize: '0.7rem', fontWeight: 'bold' }}>✓</span>}
                          </div>
                          <span style={{
                            fontSize: '0.82rem', fontWeight: '700',
                            color: targetAll ? 'white' : '#4a5568'
                          }}>
                            👥 All enrolled students ({courseStudents.length})
                          </span>
                        </div>

                        {/* Individual student rows */}
                        <div style={{ padding: '0.4rem 0' }}>
                          {courseStudents.map(s => {
                            const checked = !targetAll && targetStudentIds.includes(s.id);
                            return (
                              <div
                                key={s.id}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                                  padding: '0.45rem 0.75rem', cursor: 'pointer',
                                  background: checked ? 'rgba(59,130,246,0.06)' : 'transparent',
                                  transition: 'background 0.1s'
                                }}
                                onClick={() => {
                                  setTargetAll(false);
                                  toggleTargetStudent(s.id);
                                }}
                              >
                                <div style={{
                                  width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
                                  border: `2px solid ${checked ? 'var(--primary-color)' : '#cbd5e0'}`,
                                  background: checked ? 'var(--primary-color)' : 'white',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                  {checked && <span style={{ color: 'white', fontSize: '0.65rem', fontWeight: 'bold' }}>✓</span>}
                                </div>
                                <span style={{ fontSize: '0.82rem', color: '#2d3748' }}>{s.full_name}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Selection summary */}
                        {!targetAll && (
                          <div style={{
                            padding: '0.4rem 0.75rem',
                            borderTop: '1px solid #e2e8f0',
                            fontSize: '0.72rem', color: '#718096'
                          }}>
                            {targetStudentIds.length === 0
                              ? '⚠️ No students selected — pick at least one or use "All"'
                              : `✅ ${targetStudentIds.length} of ${courseStudents.length} student(s) selected`
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Draft / Publish action buttons ── */}
                  <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={(e) => handleCreateTask(e, 'draft')}
                      disabled={!newTaskTitle || !newTaskCourse || (!targetAll && targetStudentIds.length === 0)}
                      style={{
                        flex: 1, padding: '0.75rem', borderRadius: '10px',
                        border: '2px solid #cbd5e0', background: 'white',
                        color: '#4a5568', fontWeight: '700', cursor: 'pointer',
                        fontSize: '0.85rem', opacity: (!newTaskTitle || !newTaskCourse) ? 0.5 : 1
                      }}
                    >
                      💾 Save Draft
                    </button>
                    <button
                      type="submit"
                      disabled={!newTaskTitle || !newTaskCourse || (!targetAll && targetStudentIds.length === 0)}
                      className="btn-primary"
                      style={{
                        flex: 2, padding: '0.75rem',
                        opacity: (!newTaskTitle || !newTaskCourse) ? 0.5 : 1
                      }}
                    >
                      {newTaskType === 'quiz' ? '🚀 Publish Quiz' : '📤 Publish Assignment'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Grading Submission Center */}
              <div className="dashboard-card">
                <h3><CheckSquare size={18} /> Student Homework Inbox</h3>
                
                {submissions.filter(sub => 
                  tasks.some(t => t.id === sub.task_id && enrollments.some(sc => sc.course_id === t.course_id && sc.tutor_id === (tutorInfo?.id || tutorId)))
                ).length === 0 ? (
                  <div style={{ color: '#a0aec0', padding: '1rem' }}>No student homework submissions found.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {submissions.filter(sub => 
                      tasks.some(t => t.id === sub.task_id && enrollments.some(sc => sc.course_id === t.course_id && sc.tutor_id === (tutorInfo?.id || tutorId)))
                    ).map(sub => {
                      const sName = students.find(s => s.id === sub.student_id)?.full_name || 'Student';
                      const tObj = tasks.find(t => t.id === sub.task_id);
                      const isGraded = sub.grade !== null && sub.grade !== undefined;
                      
                      return (
                        <li key={sub.id} style={{ padding: '1rem', border: '1px solid #edf2f7', borderRadius: '12px', background: activeSubmissionId === sub.id ? '#edf2f7' : '#fcfdfe' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{sName}</span>
                            <span className={`badge ${isGraded ? 'badge-approved' : 'badge-pending'}`}>{isGraded ? `Score: ${sub.grade}/${tObj?.max_points || 100}` : 'Needs Grade'}</span>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#718096', marginBottom: '0.5rem' }}>Task: <strong>{tObj?.title}</strong></div>
                          <p style={{ fontSize: '0.8rem', margin: '0.2rem 0', background: 'white', padding: '0.5rem', borderRadius: '6px', border: '1px dashed #e2e8f0' }}>"{sub.submission_text}"</p>
                          
                          {sub.file_url && <div style={{ fontSize: '0.78rem', margin: '0.4rem 0' }}><Paperclip size={12} style={{ display: 'inline', marginRight: '4px' }} /> <a href={sub.file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>View Submission File</a></div>}

                          {isGraded ? (
                            <div style={{ fontSize: '0.8rem', color: '#4a5568', background: '#e0f2fe', padding: '0.5rem', borderRadius: '6px', marginTop: '0.5rem' }}>
                              📝 Feedback: "{sub.feedback || 'None'}"
                            </div>
                          ) : (
                            <button className="btn-action edit" style={{ marginTop: '0.5rem', padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} onClick={() => { setActiveSubmissionId(sub.id); setGradeInput(''); setFeedbackInput(''); }}>Grade Homework</button>
                          )}

                          {activeSubmissionId === sub.id && (
                            <form onSubmit={handleGradeSubmission} style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                              <div className="form-group" style={{ flexDirection: 'row', gap: '0.5rem', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.8rem', minWidth: '100px' }}>Score Points *</label>
                                <input type="number" value={gradeInput} onChange={(e) => setGradeInput(e.target.value)} required max={tObj?.max_points || 100} style={{ padding: '0.4rem', maxWidth: '100px' }} />
                                <span style={{ fontSize: '0.8rem', color: '#718096' }}>/ {tObj?.max_points || 100}</span>
                              </div>
                              <div className="form-group">
                                <label style={{ fontSize: '0.8rem' }}>Tutor Feedback Remarks</label>
                                <textarea value={feedbackInput} onChange={(e) => setFeedbackInput(e.target.value)} placeholder="Well done..." rows={2} style={{ padding: '0.4rem', fontSize: '0.8rem' }}></textarea>
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn-action cancel" style={{ padding: '0.3rem 0.6rem' }} onClick={() => setActiveSubmissionId(null)}>Cancel</button>
                                <button type="submit" className="btn-action approve" style={{ padding: '0.3rem 0.6rem' }}>Submit Grade</button>
                              </div>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* My Published Quizzes \u2014 view + edit */}
              <div className="dashboard-card">
                <h3>🧩 My Published Quizzes</h3>
                {tasks.filter(t => t.task_type === 'quiz' && enrollments.some(sc => sc.course_id === t.course_id && sc.tutor_id === (tutorInfo?.id || tutorId))).length === 0 ? (
                  <div style={{ color: '#a0aec0', padding: '1rem' }}>No quizzes published yet. Create one using the form above.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {tasks
                      .filter(t => t.task_type === 'quiz' && enrollments.some(sc => sc.course_id === t.course_id && sc.tutor_id === (tutorInfo?.id || tutorId)))
                      .map(quizTask => {
                        const completions = submissions.filter(s => s.task_id === quizTask.id);
                        const cName = courses.find(c => c.id === quizTask.course_id)?.title || 'Course';
                        const tName = topics.find(tp => tp.id === quizTask.topic_id)?.title || null;
                        const isEditing = editingQuizId === quizTask.id;
                        const parsedQs = (() => {
                          const raw = quizTask.quiz_questions;
                          if (!raw) return [];
                          if (Array.isArray(raw)) return raw;
                          try { return JSON.parse(raw); } catch { return []; }
                        })();

                        return (
                          <div key={quizTask.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem', background: '#fafbff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--primary-color)' }}>📝 {quizTask.title}</div>
                                <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.2rem' }}>
                                  {cName}{tName ? ` › ${tName}` : ''} &bull; {parsedQs.length} question{parsedQs.length !== 1 ? 's' : ''} &bull; {completions.length} completion{completions.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <button
                                  className="btn-action edit"
                                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                  onClick={() => {
                                    if (isEditing) {
                                      setEditingQuizId(null);
                                      setEditQuizQuestions([]);
                                      setEditQuizTargets([]);
                                    } else {
                                      setEditingQuizId(quizTask.id);
                                      setEditQuizQuestions(parsedQs.length ? [...parsedQs] : [{ question: '', options: ['', '', '', ''], correct: 0 }]);
                                      setEditQuizTargets(quizTask.target_student_ids || []);
                                    }
                                  }}
                                >
                                  {isEditing ? '✕ Cancel Edit' : '✏ Edit Quiz'}
                                </button>
                                <button
                                  className="btn-action delete"
                                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#fed7d7', color: '#c53030', border: '1px solid #feb2b2' }}
                                  onClick={async () => {
                                    if (window.confirm('Are you sure you want to permanently delete this quiz for all students? This cannot be undone.')) {
                                      try {
                                        await deleteTask(quizTask.id);
                                        setTasks(prev => prev.filter(t => t.id !== quizTask.id));
                                        alert('Quiz deleted successfully for all students.');
                                      } catch (err) {
                                        alert('Failed to delete quiz: ' + err.message);
                                      }
                                    }
                                  }}
                                >
                                  🗑 Delete Quiz
                                </button>
                              </div>
                            </div>

                            {/* Completions list */}
                            {completions.length > 0 && (
                              <div style={{ marginTop: '0.75rem' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#4a5568', marginBottom: '0.25rem' }}>🎯 Student Completions:</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                  {completions.map(c => {
                                    const sName = students.find(s => s.id === c.student_id)?.full_name || 'Student';
                                    return (
                                      <span key={c.id} style={{ background: '#d1fae5', color: '#166534', fontSize: '0.72rem', fontWeight: '600', padding: '0.2rem 0.5rem', borderRadius: '5px' }}>
                                        {sName}: {c.grade ?? '?'}%
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Assigned Students list with quick unassign */}
                            <div style={{ marginTop: '0.8rem', borderTop: '1px solid #edf2f7', paddingTop: '0.6rem' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#4a5568' }}>👥 Assigned Students:</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.3rem' }}>
                                {(() => {
                                  const assignedIds = quizTask.target_student_ids || [];
                                  if (assignedIds.length === 0) {
                                    return <span style={{ fontSize: '0.78rem', color: '#a0aec0' }}>None (visible to all course students)</span>;
                                  }
                                  return assignedIds.map(stId => {
                                    const student = students.find(s => s.id === stId);
                                    if (!student) return null;
                                    return (
                                      <span
                                        key={stId}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.35rem',
                                          background: '#edf2f7',
                                          color: '#2d3748',
                                          fontSize: '0.72rem',
                                          padding: '0.2rem 0.5rem',
                                          borderRadius: '6px',
                                          border: '1px solid #cbd5e0'
                                        }}
                                      >
                                        {student.full_name}
                                        <button
                                          type="button"
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#e53e3e',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            padding: '0 0.1rem',
                                            fontSize: '0.8rem',
                                            display: 'inline-flex',
                                            alignItems: 'center'
                                          }}
                                          onClick={async () => {
                                            if (window.confirm(`Unassign this quiz from ${student.full_name}?`)) {
                                              try {
                                                const newTargets = assignedIds.filter(id => id !== stId);
                                                const updated = await saveTask({
                                                  ...quizTask,
                                                  target_student_ids: newTargets
                                                });
                                                setTasks(prev => prev.map(t => t.id === quizTask.id ? updated : t));
                                                alert(`Quiz unassigned from ${student.full_name}.`);
                                              } catch (err) {
                                                alert('Failed to unassign student: ' + err.message);
                                              }
                                            }
                                          }}
                                          title="Remove assignment for this student"
                                        >
                                          ✕
                                        </button>
                                      </span>
                                    );
                                  });
                                })()}
                              </div>
                            </div>

                            {/* Inline Quiz Editor */}
                            {isEditing && (
                              <div style={{ marginTop: '1rem', borderTop: '1px solid #edf2f7', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                
                                {/* Student Targets List Selector */}
                                <div style={{ background: '#f7fafc', border: '1px solid #edf2f7', borderRadius: '12px', padding: '1rem' }}>
                                  <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--primary-color)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span>👥</span> Assigned Students
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {(() => {
                                      const myCourseStudents = students.filter(s =>
                                        enrollments.some(sc => sc.course_id === quizTask.course_id && sc.student_id === s.id && sc.tutor_id === (tutorInfo?.id || tutorId))
                                      );
                                      if (myCourseStudents.length === 0) {
                                        return <span style={{ fontSize: '0.78rem', color: '#a0aec0' }}>No students enrolled in this course under your tutoring.</span>;
                                      }
                                      return myCourseStudents.map(student => {
                                        const isAssigned = editQuizTargets.includes(student.id);
                                        return (
                                          <label
                                            key={student.id}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '0.4rem',
                                              fontSize: '0.78rem',
                                              background: isAssigned ? 'rgba(40,167,69,0.08)' : 'white',
                                              border: isAssigned ? '1px solid #38a169' : '1px solid #edf2f7',
                                              padding: '0.35rem 0.6rem',
                                              borderRadius: '6px',
                                              cursor: 'pointer',
                                              fontWeight: isAssigned ? '700' : 'normal',
                                              color: isAssigned ? '#276c3a' : '#4a5568',
                                              transition: 'all 0.15s'
                                            }}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isAssigned}
                                              onChange={() => {
                                                if (isAssigned) {
                                                  setEditQuizTargets(prev => prev.filter(id => id !== student.id));
                                                } else {
                                                  setEditQuizTargets(prev => [...prev, student.id]);
                                                }
                                              }}
                                            />
                                            {student.full_name}
                                          </label>
                                        );
                                      });
                                    })()}
                                  </div>
                                </div>

                                {editQuizQuestions.map((q, qIdx) => (
                                  <div key={qIdx} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                      <span style={{ fontWeight: '700', fontSize: '0.82rem', color: 'var(--primary-color)' }}>Q{qIdx + 1}</span>
                                      {editQuizQuestions.length > 1 && (
                                        <button type="button" onClick={() => setEditQuizQuestions(prev => prev.filter((_, i) => i !== qIdx))} style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '0.75rem' }}>✕ Remove</button>
                                      )}
                                    </div>
                                    <input
                                      type="text"
                                      placeholder="Question text"
                                      value={q.question}
                                      onChange={e => setEditQuizQuestions(prev => prev.map((item, i) => i === qIdx ? { ...item, question: e.target.value } : item))}
                                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
                                    />
                                    {q.options.map((opt, oIdx) => (
                                      <div key={oIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                                        <input
                                          type="radio"
                                          name={`eq-${quizTask.id}-${qIdx}`}
                                          checked={q.correct === oIdx}
                                          onChange={() => setEditQuizQuestions(prev => prev.map((item, i) => i === qIdx ? { ...item, correct: oIdx } : item))}
                                          title="Mark as correct answer"
                                        />
                                        <input
                                          type="text"
                                          placeholder={`Option ${oIdx + 1}`}
                                          value={opt}
                                          onChange={e => setEditQuizQuestions(prev => prev.map((item, i) => i === qIdx ? { ...item, options: item.options.map((o, oi) => oi === oIdx ? e.target.value : o) } : item))}
                                          style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: `1px solid ${q.correct === oIdx ? '#38a169' : '#e2e8f0'}`, fontSize: '0.82rem', background: q.correct === oIdx ? '#f0fff4' : 'white' }}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                ))}

                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => setEditQuizQuestions(prev => [...prev, { question: '', options: ['', '', '', ''], correct: 0 }])}
                                    style={{ padding: '0.4rem 0.75rem', borderRadius: '7px', border: '1px dashed var(--primary-color)', background: 'transparent', color: 'var(--primary-color)', fontSize: '0.8rem', cursor: 'pointer' }}
                                  >
                                    + Add Question
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-action approve"
                                    style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem' }}
                                    onClick={async () => {
                                      try {
                                        const updated = await saveTask({
                                          ...quizTask,
                                          quiz_questions: editQuizQuestions,
                                          target_student_ids: editQuizTargets,
                                          max_points: editQuizQuestions.length * 10
                                        });
                                        setTasks(prev => prev.map(t => t.id === quizTask.id ? updated : t));
                                        setEditingQuizId(null);
                                        setEditQuizQuestions([]);
                                        setEditQuizTargets([]);
                                        alert('Quiz updated successfully!');
                                      } catch (err) {
                                        alert('Failed to save quiz: ' + err.message);
                                      }
                                    }}
                                  >
                                    💾 Save Quiz Changes
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Tab 4: announcements */}
        {activeTab === 'announcements' && (
          <div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
              
              {/* Broadcast Announcement */}
              <div className="dashboard-card">
                <h3><Megaphone size={18} /> Publish Notice</h3>
                <form onSubmit={handlePostAnnouncement} className="login-form" style={{ gap: '0.8rem' }}>
                  <div className="form-group">
                    <label>Broadcast Course *</label>
                    <select value={annCourseId} onChange={(e) => setAnnCourseId(e.target.value)} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0' }}>
                      <option value="">-- Choose Course --</option>
                      {courses.filter(c => enrollments.some(sc => sc.course_id === c.id && sc.tutor_id === (tutorInfo?.id || tutorId))).map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Notice Subject *</label>
                    <input type="text" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="e.g. Schedule Update / Reschedule" required />
                  </div>
                  <div className="form-group">
                    <label>Notice Description *</label>
                    <textarea value={annDesc} onChange={(e) => setAnnDesc(e.target.value)} placeholder="Write details here..." rows={4} required></textarea>
                  </div>
                  <button type="submit" className="btn-primary" style={{ padding: '0.75rem' }}>Publish Bulletin</button>
                </form>
              </div>

              {/* Notice Log */}
              <div className="dashboard-card">
                <h3><Megaphone size={18} /> Published Notices Board</h3>
                {announcements.filter(a => a.tutor_id === (tutorInfo?.id || tutorId)).length === 0 ? (
                  <div style={{ color: '#a0aec0', padding: '1rem' }}>No notice bulletins published.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {announcements.filter(a => a.tutor_id === (tutorInfo?.id || tutorId)).map(a => {
                      const cName = courses.find(c => c.id === a.course_id)?.title || 'Course';
                      return (
                        <li key={a.id} style={{ padding: '1rem', border: '1px solid #edf2f7', borderRadius: '12px', background: '#fcfdfe' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                            <span style={{ fontWeight: 'bold', color: 'var(--primary-color)', fontSize: '0.9rem' }}>{a.title}</span>
                            <span style={{ fontSize: '0.75rem', color: '#718096' }}>{new Date(a.created_at).toLocaleDateString()}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: '600', marginBottom: '0.5rem' }}>Course: {cName}</div>
                          <p style={{ fontSize: '0.82rem', color: '#4a5568', margin: 0 }}>"{a.announcement}"</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Tab 5: Settings */}
        {activeTab === 'settings' && tutorInfo && (
          <div>
            <div className="dashboard-card">
              <h3><User size={20} color="var(--primary-color)" /> Edit Profile Card</h3>
              <form onSubmit={handleUpdateProfile}>
                <div className="profile-avatar-row" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
                  {tutorInfo.avatar_url ? (
                    <img src={tutorInfo.avatar_url} alt={tutorInfo.full_name} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary-color)' }} />
                  ) : (
                    <div className="profile-avatar-box" style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 'bold' }}>
                      {tutorInfo.full_name ? tutorInfo.full_name[0] : 'T'}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-start' }}>
                    <h4 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0 }}>{tutorInfo.full_name}</h4>
                    <p style={{ color: '#718096', fontSize: '0.9rem', margin: 0 }}>Subject Focus: {tutorInfo.subject}</p>
                    <p style={{ color: '#ffd700', fontSize: '0.9rem', fontWeight: 'bold', margin: 0 }}>Rating: ⭐ {tutorInfo.rating}</p>
                    <label style={{ fontSize: '0.8rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline', marginTop: '4px' }}>
                      {uploading ? 'Uploading picture...' : 'Upload Profile Picture'}
                      <input type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} disabled={uploading} />
                    </label>
                  </div>
                </div>

                <div className="profile-form-grid">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input type="text" name="full_name" value={tutorInfo.full_name} onChange={(e) => setTutorInfo(prev => ({ ...prev, full_name: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label>Teaching Subject Focus</label>
                    <input type="text" name="subject" value={tutorInfo.subject} onChange={(e) => setTutorInfo(prev => ({ ...prev, subject: e.target.value }))} required />
                  </div>
                  <div className="form-group full-width">
                    <label>Experience Credentials</label>
                    <input type="text" name="experience" value={tutorInfo.experience} onChange={(e) => setTutorInfo(prev => ({ ...prev, experience: e.target.value }))} required />
                  </div>
                  <div className="form-group full-width">
                    <label>Avatar URL (Publicly Displayed)</label>
                    <input type="text" name="avatar_url" value={tutorInfo.avatar_url || ''} readOnly />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: '2rem' }}>
                  <label>Professional Bio Description (Shown on Cards)</label>
                  <textarea name="bio" value={tutorInfo.bio || ''} onChange={(e) => setTutorInfo(prev => ({ ...prev, bio: e.target.value }))} rows={4}></textarea>
                </div>
                <button type="submit" className="btn-submit" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} disabled={saving}>
                  <Save size={16} /> {saving ? 'Saving...' : 'Update Public Card'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {showEditScheduleModal && editingSchedule && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => { setShowEditScheduleModal(false); setEditingSchedule(null); }}><X size={20} /></button>
            <h3 className="modal-title">Edit Class Schedule</h3>
            <form onSubmit={handleEditScheduleSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Class Title *</label>
                <input type="text" value={editingSchedule.title || ''} onChange={(e) => setEditingSchedule(prev => ({ ...prev, title: e.target.value }))} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Start Time *</label>
                  <input type="datetime-local" value={editingSchedule.start_time || ''} onChange={(e) => setEditingSchedule(prev => ({ ...prev, start_time: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>End Time</label>
                  <input type="datetime-local" value={editingSchedule.end_time || ''} onChange={(e) => setEditingSchedule(prev => ({ ...prev, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Meeting Join Link - First Half</label>
                <input type="url" value={editingSchedule.meeting_link || ''} onChange={(e) => setEditingSchedule(prev => ({ ...prev, meeting_link: e.target.value }))} placeholder="https://zoom.us/j/..." />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Meeting Join Link - Second Half (optional)</label>
                <input type="url" value={editingSchedule.meeting_link_2 || ''} onChange={(e) => setEditingSchedule(prev => ({ ...prev, meeting_link_2: e.target.value }))} placeholder="https://zoom.us/j/..." />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => { setShowEditScheduleModal(false); setEditingSchedule(null); }}>Cancel</button>
                <button type="submit" className="btn-submit">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showStartSessionModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => { setShowStartSessionModal(false); setStartSessionStudentIds([]); }}><X size={20} /></button>
            <h3 className="modal-title">Start Live Whiteboard Session</h3>
            <p style={{ color: '#64748b', marginBottom: '1rem', fontSize: '0.9rem' }}>
              Pick one or more students to invite. A join link will appear on their dashboard the moment you start.
            </p>
            <div style={{ maxHeight: '260px', overflowY: 'auto', border: '2px solid #e2e8f0', borderRadius: '10px', padding: '0.5rem', marginBottom: '1.5rem' }}>
              {tutorStudents.length === 0 && (
                <p style={{ padding: '0.5rem', color: '#94a3b8' }}>No assigned students yet.</p>
              )}
              {tutorStudents.map(s => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={startSessionStudentIds.includes(s.id)}
                    onChange={(e) => {
                      setStartSessionStudentIds(prev =>
                        e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                      );
                    }}
                  />
                  {s.full_name}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button type="button" className="btn-prev" onClick={() => { setShowStartSessionModal(false); setStartSessionStudentIds([]); }}>Cancel</button>
              <button type="button" className="btn-submit" disabled={startingSession} onClick={handleStartLiveSession}>
                {startingSession ? 'Starting...' : 'Start Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      <HtmlSlideModal url={viewingSlide?.file_url} title={viewingSlide?.title} onClose={() => setViewingSlide(null)} />
    </div>
  );
}
