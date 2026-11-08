import React, { useState, useEffect, useRef } from 'react';
import { FREE_CLASS } from '../data/freeTeenClass';
import { useSidebarCollapsed, SidebarCollapseButton } from '../components/SidebarCollapse';
import RichTextArea from '../components/RichTextArea';
import FormattedText from '../components/FormattedText';
import { useNavigate } from 'react-router-dom';
import { 
  getBookings, getStudents, getTutors, getContactMessages,
  updateBookingStatus, deleteBooking, deleteUserAccount, updateStudent, updateTutor,
  createStudentAccount, createTutorAccount, uploadAvatar, activateStudentAccount, resetUserPassword,
  getCourses, saveCourse, deleteCourse,
  getCourseCategories, saveCourseCategory, deleteCourseCategory,
  getTopics, saveTopic, deleteTopic, updateTopic,
  getMaterials, saveMaterial, deleteMaterial, uploadMaterialFile,
  getCourseTutors, assignTutorToCourse, removeTutorFromCourse,
  getStudentCourses, enrollStudentInCourse, unenrollStudentFromCourse, updateStudentEnrollment,
  getTasks, saveTask, deleteTask,
  getSchedules, saveSchedule, deleteSchedule,
  getChatMessages, createLiveSession, getAdminContacts
} from '../services/dataService';
import { 
  Users, Calendar, UserCheck, Mail, Plus, Trash2, AlertCircle, Layers, X,
  BookOpen, BookOpenCheck, Paperclip, Clock,
  ArrowUp, ArrowDown, Edit, MessageSquare, MonitorPlay,
  Eye, EyeOff, RefreshCw, Upload, Image as ImageIcon,
  Lock, User as UserIcon, Award, Star, UserPlus, Inbox
} from 'lucide-react';
import AdminInbox from '../components/AdminInbox';
import ParentFeesModal from '../components/ParentFeesModal';
import CourseImageField from '../components/CourseImageField';
import MobileMenuSheet from '../components/MobileMenuSheet';
import DrawerAccount from '../components/DrawerAccount';
import useResponsiveTables from '../hooks/useResponsiveTables';
import '../styles/DashboardMobile.css';

// Readable random password (no look-alike characters) for new accounts.
const generatePassword = (length = 12) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
};
import HtmlSlideModal from '../components/HtmlSlideModal';
import { isPowerPointName, POWERPOINT_MAX_BYTES, isSlideMaterial } from '../utils/slideMaterials';
import '../styles/Dashboard.css';
import { personIds, isOneOf, inThread } from '../utils/chatIds';

// Material file_type convention shared with the tutor and student dashboards:
// 'html_slide' | 'powerpoint' (set by caller) | 'pdf' | 'image' | 'video' | 'doc' | 'other'
const getMaterialFileType = (file) => {
  const mime = (file?.type || '').toLowerCase();
  const name = (file?.name || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|avi)$/.test(name)) return 'video';
  if (mime.includes('msword') || mime.includes('wordprocessingml') || /\.docx?$/.test(name)) return 'doc';
  return 'other';
};

export default function AdminDashboard({ user, onLogout }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [viewingSlide, setViewingSlide] = useState(null); // material row being viewed in the embedded HTML slide modal
  const [showStartSessionModal, setShowStartSessionModal] = useState(false);
  const [startSessionStudentIds, setStartSessionStudentIds] = useState([]);
  const [startingSession, setStartingSession] = useState(false);

  // Data lists
  const [bookings, setBookings] = useState([]);
  const [students, setStudents] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const mainRef = useRef(null);
  useResponsiveTables(mainRef, !loading);
  // On phones, start each section at the top.
  useEffect(() => {
    if (window.innerWidth <= 800) window.scrollTo({ top: 0 });
  }, [activeTab]);

  // LMS Data lists
  const [courses, setCourses] = useState([]);
  const [topics, setTopics] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [courseTutors, setCourseTutors] = useState([]);
  const [studentCourses, setStudentCourses] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', description: '' });
  const [editingCategory, setEditingCategory] = useState(null);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);

  // Chat Monitor State
  const [allChatMessages, setAllChatMessages] = useState([]);
  const [adminIds, setAdminIds] = useState([]); // all admin accounts share the student inbox
  const [chatMonitorTutor, setChatMonitorTutor] = useState('');
  const [chatMonitorStudent, setChatMonitorStudent] = useState('');

  // Add Tutor Modal state
  const [showTutorModal, setShowTutorModal] = useState(false);
  const [newTutor, setNewTutor] = useState({
    email: '', password: '', full_name: '', subject: '', experience: '', bio: '', avatar_url: '', rating: '5.0'
  });

  // Edit Tutor State
  const [showEditTutorModal, setShowEditTutorModal] = useState(false);
  const [editingTutor, setEditingTutor] = useState(null);
  const [tutorEditPassword, setTutorEditPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Add Student Modal state
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [feesStudent, setFeesStudent] = useState(null); // student whose Parent & Fees window is open
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile menu drawer
  const [sidebarCollapsed, toggleSidebarCollapsed] = useSidebarCollapsed('adminSidebarCollapsed'); // desktop icon rail
  
  // Activation Modal State
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [studentToActivate, setStudentToActivate] = useState(null);
  const [activationPassword, setActivationPassword] = useState('');
  const [activating, setActivating] = useState(false);

  // Edit Student State
  const [showEditStudentModal, setShowEditStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [studentEditPassword, setStudentEditPassword] = useState('');
  const [newStudent, setNewStudent] = useState({
    email: '', password: '', full_name: '', phone: '', date_of_birth: '',
    gender: 'male', grade_level: 'Grade 1', special_needs: '', program: 'regular',
    schedule: 'morning', start_date: '', additional_comments: '', avatar_url: ''
  });

  // Course, Topic, Task Edit states
  const [showEditCourseModal, setShowEditCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);

  const [showEditTopicModal, setShowEditTopicModal] = useState(false);
  const [editingTopic, setEditingTopic] = useState(null);

  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  
  // Compiler state for editing a quiz
  const [editQText, setEditQText] = useState('');
  const [editQType, setEditQType] = useState('multiple');
  const [editQOptions, setEditQOptions] = useState(['', '', '']);
  const [editQCorrect, setEditQCorrect] = useState(0);
  // Enrollment Edit State
  const [showEditEnrollmentModal, setShowEditEnrollmentModal] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState(null);
  const [editEnrollmentCourseId, setEditEnrollmentCourseId] = useState('');
  const [editEnrollmentTutorId, setEditEnrollmentTutorId] = useState('');

  // Course Creation Modal State
  const [showCreateCourseModal, setShowCreateCourseModal] = useState(false);

  // Enrollments Modal States
  const [showAssignTutorModal, setShowAssignTutorModal] = useState(false);
  const [showEnrollStudentModal, setShowEnrollStudentModal] = useState(false);

  // LMS State Inputs
  const [newCourse, setNewCourse] = useState({ title: '', description: '', course_type: 'regular', category: '', image_url: '' });
  const [courseImgUploading, setCourseImgUploading] = useState(false); // blocks saving until the cover image has uploaded
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [newTopic, setNewTopic] = useState({ title: '', description: '', sort_order: 1 });
  const [activeTopicMaterialId, setActiveTopicMaterialId] = useState('');
  const [activeTopicTaskId, setActiveTopicTaskId] = useState('');
  
  // Materials Upload State
  const [materialTitle, setMaterialTitle] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [materialFile, setMaterialFile] = useState(null);

  // Task creation state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskType, setTaskType] = useState('assignment'); // 'quiz', 'assignment', 'instruction'
  const [maxPoints, setMaxPoints] = useState(100);
  
  // Quiz Question builder state
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [newQText, setNewQText] = useState('');
  const [newQType, setNewQType] = useState('multiple');
  const [newQOptions, setNewQOptions] = useState(['', '', '']);
  const [newQCorrect, setNewQCorrect] = useState(0);

  // Enrolment state inputs
  const [enrollStudentId, setEnrollStudentId] = useState('');
  const [enrollCourseId, setEnrollCourseId] = useState('');
  const [enrollTutorId, setEnrollTutorId] = useState('');

  // Course-Tutor mapping state inputs
  const [mapCourseId, setMapCourseId] = useState('');
  const [mapTutorId, setMapTutorId] = useState('');

  // Class scheduling state inputs
  const [schStudentId, setSchStudentId] = useState('');
  const [schCourseId, setSchCourseId] = useState('');
  const [schTutorId, setSchTutorId] = useState('');
  const [schTitle, setSchTitle] = useState('');
  const [schStart, setSchStart] = useState('');
  const [schEnd, setSchEnd] = useState('');
  const [schLink, setSchLink] = useState('');
  const [schLink2, setSchLink2] = useState('');

  const [uploading, setUploading] = useState(false);
  const [addingTutor, setAddingTutor] = useState(false);
  const [showTutorPassword, setShowTutorPassword] = useState(false);

  const loadAllData = async () => {
    const safeLoad = async (promise, fallback = []) => {
      try {
        return await promise;
      } catch (e) {
        console.warn('Dashboard table loading error caught gracefully:', e.message);
        return fallback;
      }
    };

    try {
      const [bData, sData, tData, mData, cData, tpData, matData, ctData, scData, tkData, schData, chatData, catData] = await Promise.all([
        safeLoad(getBookings()),
        safeLoad(getStudents()),
        safeLoad(getTutors()),
        safeLoad(getContactMessages()),
        safeLoad(getCourses()),
        safeLoad(getTopics()),
        safeLoad(getMaterials()),
        safeLoad(getCourseTutors()),
        safeLoad(getStudentCourses()),
        safeLoad(getTasks()),
        safeLoad(getSchedules()),
        safeLoad(getChatMessages()),
        safeLoad(getCourseCategories())
      ]);

      setBookings(bData);
      setStudents(sData);
      setTutors(tData);
      setMessages(mData);
      setCourses(cData);
      setTopics(tpData);
      setMaterials(matData);
      setCourseTutors(ctData);
      setStudentCourses(scData);
      setTasks(tkData);
      setSchedules(schData);
      setAllChatMessages(chatData);
      getAdminContacts().then(list => setAdminIds(list.map(a => String(a.id)))).catch(err => console.error('Failed to load admin accounts:', err));
      setCategories(catData);

      if (cData.length > 0) setSelectedCourseId(cData[0].id);
    } catch (err) {
      console.error('Error loading admin details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // While Chat Monitor or Student Messages is open, poll for new messages every 10s and merge them in
  useEffect(() => {
    if (activeTab !== 'chatmonitor' && activeTab !== 'messages') return undefined;
    let cancelled = false;
    const poll = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const fresh = await getChatMessages();
        if (cancelled || !Array.isArray(fresh)) return;
        setAllChatMessages(prev => {
          const byId = new Map(prev.map(m => [m.id, m]));
          let changed = false;
          for (const m of fresh) {
            const old = byId.get(m.id);
            if (!old || old.read !== m.read || old.message_text !== m.message_text) changed = true;
            byId.set(m.id, old ? { ...old, ...m } : m);
          }
          if (!changed) return prev;
          return [...byId.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        });
      } catch (err) {
        console.error('Failed to refresh chat monitor:', err);
      }
    };
    poll();
    const timer = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeTab]);

  const handleModalTutorAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const publicUrl = await uploadAvatar('new_tutor_' + Date.now(), file);
      setNewTutor(prev => ({ ...prev, avatar_url: publicUrl }));
    } catch (err) {
      alert('Failed to upload tutor picture: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleModalStudentAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const publicUrl = await uploadAvatar('new_student_' + Date.now(), file);
      setNewStudent(prev => ({ ...prev, avatar_url: publicUrl }));
    } catch (err) {
      alert('Failed to upload student picture: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Booking Actions
  const handleStartLiveSession = async () => {
    if (startSessionStudentIds.length === 0) {
      return alert('Select at least one student to invite.');
    }
    setStartingSession(true);
    try {
      const roomId = 'room-' + Math.random().toString(36).substr(2, 9);
      await createLiveSession({
        id: roomId,
        tutor_id: user?.id,
        tutor_name: user?.full_name || 'Admin',
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

  const handleBookingStatus = async (id, status) => {
    try {
      await updateBookingStatus(id, status);
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    } catch (err) {
      alert('Error updating booking: ' + err.message);
    }
  };

  const handleDeleteBooking = async (id) => {
    if (!window.confirm('Delete this booking permanently?')) return;
    try {
      await deleteBooking(id);
      setBookings(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      alert('Error deleting booking: ' + err.message);
    }
  };

  // Student Actions
  const handleDeleteStudent = async (id) => {
    if (!window.confirm('Remove this student permanently? Their registration AND their login account will be deleted, so they will no longer be able to sign in. This cannot be undone.')) return;
    try {
      await deleteUserAccount('student', id);
      setStudents(prev => prev.filter(s => s.id !== id));
      setStudentCourses(prev => prev.filter(sc => sc.student_id !== id));
    } catch (err) {
      alert('Error deleting student: ' + err.message);
    }
  };

  // Tutor Actions
  const handleDeleteTutor = async (id) => {
    if (!window.confirm('Remove this tutor permanently? Their tutor profile AND their login account will be deleted, so they will no longer be able to sign in. This cannot be undone.')) return;
    try {
      await deleteUserAccount('tutor', id);
      setTutors(prev => prev.filter(t => t.id !== id));
      setCourseTutors(prev => prev.filter(ct => ct.tutor_id !== id));
    } catch (err) {
      alert('Error removing tutor: ' + err.message);
    }
  };

  const handleAddTutorSubmit = async (e) => {
    e.preventDefault();
    if (addingTutor) return;
    setAddingTutor(true);
    try {
      const tutorData = {
        full_name: newTutor.full_name,
        subject: newTutor.subject,
        experience: newTutor.experience,
        bio: newTutor.bio,
        avatar_url: newTutor.avatar_url || '/images/logo.png',
        rating: parseFloat(newTutor.rating) || 5.0
      };
      const saved = await createTutorAccount(newTutor.email, newTutor.password, tutorData);
      setTutors(prev => {
        const exists = prev.some(t => t.id === saved.id);
        if (exists) {
          return prev.map(t => t.id === saved.id ? saved : t);
        }
        return [...prev, saved];
      });
      setShowTutorModal(false);
      setNewTutor({ email: '', password: '', full_name: '', subject: '', experience: '', bio: '', avatar_url: '', rating: '5.0' });
      alert('Tutor added successfully with login credentials!');
    } catch (err) {
      alert('Error adding tutor: ' + err.message);
    } finally {
      setAddingTutor(false);
    }
  };

  const handleEditTutorClick = (tutor) => {
    setEditingTutor({
      ...tutor,
      password: ''
    });
    setTutorEditPassword('');
    setShowEditTutorModal(true);
  };

  const handleEditTutorSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const id = editingTutor.id;
      const updates = {
        full_name: editingTutor.full_name,
        subject: editingTutor.subject,
        experience: editingTutor.experience,
        bio: editingTutor.bio,
        avatar_url: editingTutor.avatar_url,
        rating: parseFloat(editingTutor.rating) || 5.0
      };

      if (tutorEditPassword.trim() !== '') {
        try {
          await resetUserPassword(id, tutorEditPassword.trim());
        } catch (pwErr) {
          throw new Error('Failed to reset password: ' + pwErr.message);
        }
      }

      const updated = await updateTutor(id, updates);
      setTutors(prev => prev.map(t => t.id === id ? { ...t, ...updated } : t));
      setShowEditTutorModal(false);
      setEditingTutor(null);
      alert('Tutor profile updated successfully!');
    } catch (err) {
      alert('Error updating tutor: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddStudentSubmit = async (e) => {
    e.preventDefault();
    try {
      const studentData = {
        full_name: newStudent.full_name,
        phone: newStudent.phone,
        date_of_birth: newStudent.date_of_birth,
        gender: newStudent.gender,
        grade_level: newStudent.grade_level,
        special_needs: newStudent.special_needs,
        program: newStudent.program,
        schedule: newStudent.schedule,
        start_date: newStudent.start_date || new Date().toISOString().split('T')[0],
        additional_comments: newStudent.additional_comments,
        avatar_url: newStudent.avatar_url || ''
      };
      const saved = await createStudentAccount(newStudent.email, newStudent.password, studentData);
      setStudents(prev => {
        const exists = prev.some(s => s.id === saved.id);
        if (exists) {
          return prev.map(s => s.id === saved.id ? saved : s);
        }
        return [...prev, saved];
      });
      setShowStudentModal(false);
      setNewStudent({
        email: '', password: '', full_name: '', phone: '', date_of_birth: '',
        gender: 'male', grade_level: 'Grade 1',
        special_needs: '', program: 'regular', schedule: 'morning',
        start_date: '', additional_comments: '', avatar_url: ''
      });
      alert('Student registered successfully with login credentials!');
    } catch (err) {
      alert('Error adding student: ' + err.message);
    }
  };

  const handleActivateStudentSubmit = async (e) => {
    e.preventDefault();
    if (!studentToActivate) return;
    setActivating(true);
    try {
      await activateStudentAccount(
        studentToActivate.id,
        studentToActivate.email,
        activationPassword
      );
      alert('Student account activated successfully! Login profile created.');
      setShowActivationModal(false);
      setActivationPassword('');
      setStudentToActivate(null);
      // Reload students list to update UI status
      const sList = await getStudents();
      setStudents(sList);
    } catch (err) {
      alert('Error activating student: ' + err.message);
    } finally {
      setActivating(false);
    }
  };

  const handleEditStudentSubmit = async (e) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      let activeStudent = { ...editingStudent };
      
      // If the student has no auth account yet and a password was filled, activate them now!
      if (!editingStudent.is_active && studentEditPassword.trim()) {
        if (studentEditPassword.length < 6) {
          alert('Password must be at least 6 characters.');
          return;
        }
        
        const activated = await activateStudentAccount(
          editingStudent.id,
          editingStudent.email,
          studentEditPassword
        );
        
        // Update current reference with the new authenticated user ID
        activeStudent.id = activated.id || activated;
      }
      
      // If the student is already active and a new password was filled, reset/update their password!
      if (editingStudent.is_active && studentEditPassword.trim()) {
        if (studentEditPassword.length < 6) {
          alert('Password must be at least 6 characters.');
          return;
        }
        await resetUserPassword(editingStudent.id, studentEditPassword);
      }

      // Strip fields that shouldn't go to students table directly. Status is only sent when the
      // admin actually changed it, so activation's 'approved' is never overwritten by a stale value.
      const { id, email: _email, is_active: _isActive, profiles: _profiles, created_at: _createdAt, status, ...updates } = activeStudent;
      const original = students.find(s => s.id === editingStudent.id);
      if (original && status !== original.status) updates.status = status;
      // Email is only editable (and only sent) for students without a login account
      if (!editingStudent.is_active && original && (editingStudent.email || '') !== (original.email || '')) {
        updates.email = editingStudent.email;
      }
      await updateStudent(id, updates);
      
      alert('Student profile updated successfully!');
      setShowEditStudentModal(false);
      setEditingStudent(null);
      setStudentEditPassword('');
      // Reload data
      const sList = await getStudents();
      setStudents(sList);
    } catch (err) {
      alert('Error updating student: ' + err.message);
    }
  };

  const handleEditModalStudentAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !editingStudent) return;
    setUploading(true);
    try {
      const publicUrl = await uploadAvatar('student_' + editingStudent.id, file);
      setEditingStudent(prev => ({ ...prev, avatar_url: publicUrl }));
    } catch (err) {
      alert('Failed to upload student picture: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // --- LMS HANDLERS ---

  // Courses reference their category by NAME, so a rename/delete must be propagated to them.
  const handleSaveEditedCategory = async (e) => {
    e.preventDefault();
    const oldName = categories.find(c => c.id === editingCategory.id)?.name;
    const newName = (editingCategory.name || '').trim();
    if (!newName) return alert('Category name is required.');
    if (categories.some(c => c.id !== editingCategory.id && (c.name || '').trim().toLowerCase() === newName.toLowerCase())) {
      return alert('Another category already has that name.');
    }
    try {
      const saved = await saveCourseCategory({ ...editingCategory, name: newName });
      setCategories(prev => prev.map(c => c.id === saved.id ? saved : c));
      let failed = 0;
      if (oldName && oldName !== newName) {
        const affected = courses.filter(c => c.category === oldName);
        const results = await Promise.allSettled(affected.map(c => saveCourse({ id: c.id, category: newName })));
        const okIds = new Set(affected.filter((_, i) => results[i].status === 'fulfilled').map(c => c.id));
        failed = affected.length - okIds.size;
        setCourses(prev => prev.map(c => okIds.has(c.id) ? { ...c, category: newName } : c));
      }
      setShowEditCategoryModal(false);
      setEditingCategory(null);
      alert(failed > 0
        ? `Category renamed, but ${failed} course(s) could not be moved to the new name. They will show as uncategorized; edit them to reassign.`
        : 'Category updated successfully!');
    } catch (err) {
      alert('Error updating category: ' + err.message);
    }
  };

  const handleDeleteCategory = async (cat) => {
    const affected = courses.filter(c => c.category === cat.name);
    const msg = `Are you sure you want to delete category "${cat.name}"?` +
      (affected.length ? ` ${affected.length} course(s) inside will become uncategorized.` : '');
    if (!window.confirm(msg)) return;
    try {
      await deleteCourseCategory(cat.id);
      setCategories(prev => prev.filter(c => c.id !== cat.id));
      const results = await Promise.allSettled(affected.map(c => saveCourse({ id: c.id, category: null })));
      const okIds = new Set(affected.filter((_, i) => results[i].status === 'fulfilled').map(c => c.id));
      setCourses(prev => prev.map(c => okIds.has(c.id) ? { ...c, category: null } : c));
      if (okIds.size < affected.length) {
        alert(`Category deleted, but ${affected.length - okIds.size} course(s) could not be cleared. They will still show as uncategorized.`);
      }
    } catch (err) {
      alert('Error deleting category: ' + err.message);
    }
  };

  // A course is uncategorized when its category matches no existing category
  const isUncategorized = (c) =>
    !categories.some(cat => (c.category && c.category === cat.name) || (c.category_id && c.category_id === cat.id));

  const handleDeleteCourse = async (id) => {
    if (!window.confirm('Delete this course, all its topics, and uploads?')) return;
    try {
      await deleteCourse(id);
      setCourses(prev => prev.filter(c => c.id !== id));
      if (selectedCourseId === id) setSelectedCourseId('');
      alert('Course deleted.');
    } catch (err) {
      alert('Error deleting course: ' + err.message);
    }
  };

  const handleCreateTopic = async (e) => {
    e.preventDefault();
    if (!selectedCourseId) return alert('Please select a course first.');
    try {
      const saved = await saveTopic({ ...newTopic, course_id: selectedCourseId });
      setTopics(prev => [...prev, saved]);
      setNewTopic({ title: '', description: '', sort_order: newTopic.sort_order + 1 });
      alert('Topic added to course!');
    } catch (err) {
      alert('Error creating topic: ' + err.message);
    }
  };

  const handleDeleteTopic = async (id) => {
    if (!window.confirm('Remove this topic?')) return;
    try {
      await deleteTopic(id);
      setTopics(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      alert('Error removing topic: ' + err.message);
    }
  };

  const handleMoveTopic = async (topicId, direction) => {
    const topic = topics.find(t => t.id === topicId);
    if (!topic) return;
    // Swap positions with the neighbouring lesson in the same course; just +/-1 on
    // one lesson produced duplicate sort_order values and an undefined order.
    const siblings = topics
      .filter(t => t.course_id === topic.course_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = siblings.findIndex(t => t.id === topicId);
    const neighbour = siblings[direction === 'up' ? idx - 1 : idx + 1];
    if (!neighbour) return;
    // Renumber the course's lessons 1..n so ties/gaps from earlier edits don't matter.
    const reordered = siblings.slice();
    reordered[idx] = neighbour;
    reordered[direction === 'up' ? idx - 1 : idx + 1] = topic;
    const newOrders = new Map(reordered.map((t, i) => [t.id, i + 1]));
    try {
      await Promise.all(
        reordered
          .filter(t => t.sort_order !== newOrders.get(t.id))
          .map(t => updateTopic(t.id, { sort_order: newOrders.get(t.id) }))
      );
      setTopics(prev => prev
        .map(t => newOrders.has(t.id) ? { ...t, sort_order: newOrders.get(t.id) } : t)
        .sort((a, b) => a.sort_order - b.sort_order));
    } catch (err) {
      alert('Error updating order: ' + err.message);
    }
  };

  const handleUploadMaterial = async (e) => {
    e.preventDefault();
    if (!selectedCourseId || !selectedTopicId || !materialFile) {
      return alert('Please select a topic and file first.');
    }
    const isPptx = isPowerPointName(materialFile.name);
    const isHtmlSlide = materialFile.type === 'text/html' || /\.html?$/i.test(materialFile.name);
    if (isHtmlSlide && materialFile.size > 15 * 1024 * 1024) {
      return alert('HTML slide files must be under 15MB.');
    }
    if (isPptx && materialFile.size > POWERPOINT_MAX_BYTES) {
      return alert('PowerPoint files must be under 10MB to be shown online. In PowerPoint, use File > Compress Pictures, then upload again.');
    }
    setUploading(true);
    try {
      const fileUrl = await uploadMaterialFile(materialFile.name, materialFile);
      const fileType = isPptx ? 'powerpoint' : isHtmlSlide ? 'html_slide' : getMaterialFileType(materialFile);
      const saved = await saveMaterial({
        course_id: selectedCourseId,
        topic_id: selectedTopicId,
        title: materialTitle || materialFile.name,
        file_url: fileUrl,
        file_type: fileType
      });
      setMaterials(prev => [...prev, saved]);
      setMaterialTitle('');
      setMaterialFile(null);
      alert(isPptx ? 'PowerPoint uploaded! It opens just like in PowerPoint.' : 'Course material uploaded successfully!');
    } catch (err) {
      alert('Failed to upload material: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMaterial = async (id) => {
    if (!window.confirm('Delete this material file?')) return;
    try {
      await deleteMaterial(id);
      setMaterials(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      alert('Error deleting file: ' + err.message);
    }
  };

  const hasUnaddedQuestion = () =>
    newQText.trim() !== '' || (newQType === 'multiple' && newQOptions.some(o => o.trim() !== ''));

  const handleAddQuizQuestion = () => {
    if (!newQText.trim()) return alert('Enter question text.');
    let options = [];
    if (newQType === 'boolean') {
      options = ['True', 'False'];
    } else {
      if (newQOptions.some(opt => opt.trim() === '')) {
        return alert('Please fill in all multiple choice options.');
      }
      options = [...newQOptions];
    }
    const qObj = { question: newQText, options, correct: Number(newQCorrect) };
    setQuizQuestions(prev => [...prev, qObj]);
    setNewQText('');
    setNewQOptions(['', '', '']);
    setNewQCorrect(0);
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!selectedCourseId) return alert('Select a course.');
    if (!Number.isFinite(Number(maxPoints)) || Number(maxPoints) <= 0) return alert('Max points must be greater than 0.');
    if (taskType === 'quiz') {
      if (hasUnaddedQuestion() && !window.confirm('You have a question that has not been added yet (click "+ Add Q" to keep it). Discard it and save the quiz?')) return;
      if (quizQuestions.length === 0) return alert('Add at least one question before saving the quiz.');
    }
    try {
      const actualType = taskType === 'true_false' ? 'quiz' : taskType;
      const actualQuestions = taskType === 'true_false' 
        ? [{ question: taskTitle, options: ['True', 'False'], correct: Number(newQCorrect) }]
        : (taskType === 'quiz' ? quizQuestions : null);

      const saved = await saveTask({
        course_id: selectedCourseId,
        topic_id: selectedTopicId || null,
        title: taskTitle,
        description: taskDesc,
        task_type: actualType,
        max_points: Number(maxPoints),
        quiz_questions: actualQuestions,
        created_by: user?.id || null
      });
      setTasks(prev => [...prev, saved]);
      setTaskTitle('');
      setTaskDesc('');
      setQuizQuestions([]);
      setNewQText('');
      setNewQOptions(['', '', '']);
      setNewQCorrect(0);
      alert('Task created successfully!');
    } catch (err) {
      alert('Error saving task: ' + err.message);
    }
  };

  const handleDeleteTask = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleEditCourseClick = (course) => {
    setEditingCourse({ ...course });
    setShowEditCourseModal(true);
  };

  const handleEditCourseSubmit = async (e) => {
    e.preventDefault();
    try {
      const updated = await saveCourse(editingCourse);
      setCourses(prev => prev.map(c => c.id === editingCourse.id ? updated : c));
      setShowEditCourseModal(false);
      setEditingCourse(null);
      alert('Course updated successfully!');
    } catch (err) {
      alert('Error updating course: ' + err.message);
    }
  };

  const handleEditTopicClick = (topic) => {
    setEditingTopic({ ...topic });
    setShowEditTopicModal(true);
  };

  const handleEditTopicSubmit = async (e) => {
    e.preventDefault();
    try {
      const updated = await updateTopic(editingTopic.id, {
        title: editingTopic.title,
        description: editingTopic.description,
        sort_order: Number(editingTopic.sort_order)
      });
      setTopics(prev => prev.map(t => t.id === editingTopic.id ? updated : t));
      setShowEditTopicModal(false);
      setEditingTopic(null);
      alert('Lesson updated successfully!');
    } catch (err) {
      alert('Error updating lesson: ' + err.message);
    }
  };

  const handleEditTaskClick = (task) => {
    const isTrueFalse = task.task_type === 'quiz' && 
                        task.quiz_questions && 
                        task.quiz_questions.length === 1 && 
                        JSON.stringify(task.quiz_questions[0].options) === JSON.stringify(['True', 'False']);
                        
    setEditingTask({ 
      ...task,
      task_type: isTrueFalse ? 'true_false' : task.task_type
    });
    setEditQText('');
    setEditQOptions(['', '', '']);
    setEditQCorrect(isTrueFalse ? task.quiz_questions[0].correct : 0);
    setEditQType(isTrueFalse ? 'boolean' : 'multiple');
    setShowEditTaskModal(true);
  };

  const handleEditTaskTypeChange = (newType) => {
    const qs = editingTask.quiz_questions || [];
    if (editingTask.task_type === 'quiz' && newType !== 'quiz' && qs.length > 0) {
      const ok = window.confirm(`This quiz has ${qs.length} question(s). Switching the type will discard them when you save. Continue?`);
      if (!ok) return;
    }
    setEditingTask(prev => ({ ...prev, task_type: newType }));
  };

  const handleEditTaskSubmit = async (e) => {
    e.preventDefault();
    if (!Number.isFinite(Number(editingTask.max_points)) || Number(editingTask.max_points) <= 0) {
      return alert('Max points must be greater than 0.');
    }
    if (editingTask.task_type === 'quiz') {
      const editInProgress = editQText.trim() !== '' || (editQType === 'multiple' && editQOptions.some(o => o.trim() !== ''));
      if (editInProgress && !window.confirm('You have a question that has not been added yet. Discard it and save?')) return;
      if (!editingTask.quiz_questions || editingTask.quiz_questions.length === 0) {
        return alert('Add at least one question before saving the quiz.');
      }
    }
    try {
      const actualType = editingTask.task_type === 'true_false' ? 'quiz' : editingTask.task_type;
      const actualQuestions = editingTask.task_type === 'true_false'
        ? [{ question: editingTask.title, options: ['True', 'False'], correct: Number(editQCorrect) }]
        : (editingTask.task_type === 'quiz' ? editingTask.quiz_questions : null);

      const updated = await saveTask({
        ...editingTask,
        task_type: actualType,
        quiz_questions: actualQuestions
      });
      setTasks(prev => prev.map(tk => tk.id === editingTask.id ? updated : tk));
      setShowEditTaskModal(false);
      setEditingTask(null);
      alert('Task updated successfully!');
    } catch (err) {
      alert('Error updating task: ' + err.message);
    }
  };

  const handleAddEditQuizQuestion = () => {
    if (!editQText.trim()) return alert('Enter question text.');
    let options = [];
    if (editQType === 'boolean') {
      options = ['True', 'False'];
    } else {
      if (editQOptions.some(opt => opt.trim() === '')) {
        return alert('Please fill in all multiple choice options.');
      }
      options = [...editQOptions];
    }
    const qObj = { question: editQText, options, correct: Number(editQCorrect) };
    setEditingTask(prev => ({
      ...prev,
      quiz_questions: [...(prev.quiz_questions || []), qObj]
    }));
    setEditQText('');
    setEditQOptions(['', '', '']);
    setEditQCorrect(0);
  };

  const handleMapTutor = async (e) => {
    e.preventDefault();
    if (!mapCourseId || !mapTutorId) return alert('Select course and tutor.');
    try {
      await assignTutorToCourse(mapCourseId, mapTutorId);
      setCourseTutors(prev => [...prev, { course_id: mapCourseId, tutor_id: mapTutorId }]);
      setMapCourseId('');
      setMapTutorId('');
      setShowAssignTutorModal(false);
      alert('Tutor assigned to teach this course!');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleUnmapTutor = async (courseId, tutorId) => {
    if (!window.confirm('Remove instructor from course?')) return;
    try {
      await removeTutorFromCourse(courseId, tutorId);
      setCourseTutors(prev => prev.filter(x => !(x.course_id === courseId && x.tutor_id === tutorId)));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const tutorNameOf = (id) => tutors.find(t => t.id === id)?.full_name || 'Tutor';
  const courseTitleOf = (id) => courses.find(c => c.id === id)?.title || 'Course';

  // Switch ONE student's tutor for ONE course (the rest of the class is untouched).
  const handleSwitchEnrollmentTutor = async (sc, newTutorId) => {
    if (!newTutorId || newTutorId === sc.tutor_id) return;
    const sName = students.find(s => s.id === sc.student_id)?.full_name || 'this student';
    if (!window.confirm(`Switch ${sName}'s tutor for ${courseTitleOf(sc.course_id)} from ${tutorNameOf(sc.tutor_id)} to ${tutorNameOf(newTutorId)}?`)) return;
    try {
      // The new tutor must also be on the course's teaching staff to see it in their dashboard.
      if (!courseTutors.some(ct => ct.course_id === sc.course_id && ct.tutor_id === newTutorId)) {
        await assignTutorToCourse(sc.course_id, newTutorId);
        setCourseTutors(prev => [...prev, { course_id: sc.course_id, tutor_id: newTutorId }]);
      }
      const updated = await updateStudentEnrollment(sc.student_id, sc.course_id, sc.course_id, newTutorId);
      setStudentCourses(prev => prev.map(x => (x.student_id === sc.student_id && x.course_id === sc.course_id) ? { ...x, ...(updated || {}), tutor_id: newTutorId } : x));
    } catch (err) {
      alert('Could not switch tutor: ' + err.message);
    }
  };

  // Replace the tutor on ONE course. Students can move with them, or stay put so they
  // can be switched one at a time from the Student Registry.
  const handleSwitchCourseTutor = async (ct, newTutorId) => {
    if (!newTutorId || newTutorId === ct.tutor_id) return;
    const cTitle = courseTitleOf(ct.course_id);
    const oldName = tutorNameOf(ct.tutor_id);
    const newName = tutorNameOf(newTutorId);
    if (!window.confirm(`Make ${newName} the tutor for ${cTitle} instead of ${oldName}?`)) return;
    const affected = studentCourses.filter(sc => sc.course_id === ct.course_id && sc.tutor_id === ct.tutor_id);
    const moveAll = affected.length === 0 || window.confirm(
      `${affected.length} student(s) in ${cTitle} are taught by ${oldName}.\n\n` +
      `OK = move all of them to ${newName} now.\n` +
      `Cancel = keep them with ${oldName} for now; switch them one at a time in Student Registry (${oldName} stays on the course until then).`
    );
    try {
      if (!courseTutors.some(x => x.course_id === ct.course_id && x.tutor_id === newTutorId)) {
        await assignTutorToCourse(ct.course_id, newTutorId);
        setCourseTutors(prev => [...prev, { course_id: ct.course_id, tutor_id: newTutorId }]);
      }
      if (moveAll) {
        for (const sc of affected) {
          await updateStudentEnrollment(sc.student_id, sc.course_id, sc.course_id, newTutorId);
        }
        if (affected.length) {
          setStudentCourses(prev => prev.map(x => (x.course_id === ct.course_id && x.tutor_id === ct.tutor_id) ? { ...x, tutor_id: newTutorId } : x));
        }
        await removeTutorFromCourse(ct.course_id, ct.tutor_id);
        setCourseTutors(prev => prev.filter(x => !(x.course_id === ct.course_id && x.tutor_id === ct.tutor_id)));
      }
    } catch (err) {
      alert('Could not switch tutor: ' + err.message);
    }
  };

  // Tutor picker used in the Enrollments tables (sorted by name).
  const tutorOptions = [...tutors].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  const handleEnrollStudent = async (e) => {
    e.preventDefault();
    if (!enrollStudentId || !enrollCourseId || !enrollTutorId) return alert('Select Student, Course and Tutor.');
    try {
      const saved = await enrollStudentInCourse(enrollStudentId, enrollCourseId, enrollTutorId);
      setStudentCourses(prev => [...prev, saved]);
      setEnrollStudentId('');
      setEnrollCourseId('');
      setEnrollTutorId('');
      setShowEnrollStudentModal(false);
      alert('Student enrolled successfully!');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleUnenrollStudent = async (studentId, courseId) => {
    if (!window.confirm('Unenroll student from this course?')) return;
    try {
      await unenrollStudentFromCourse(studentId, courseId);
      setStudentCourses(prev => prev.filter(x => !(x.student_id === studentId && x.course_id === courseId)));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleEditEnrollmentClick = (enrollment) => {
    setEditingEnrollment({ ...enrollment });
    setEditEnrollmentCourseId(enrollment.course_id);
    setEditEnrollmentTutorId(enrollment.tutor_id);
    setShowEditEnrollmentModal(true);
  };

  const handleEditEnrollmentSubmit = async (e) => {
    e.preventDefault();
    if (!editEnrollmentCourseId || !editEnrollmentTutorId) return alert('Select course and tutor.');
    try {
      const updated = await updateStudentEnrollment(
        editingEnrollment.student_id,
        editingEnrollment.course_id,
        editEnrollmentCourseId,
        editEnrollmentTutorId
      );
      
      setStudentCourses(prev => {
        if (editingEnrollment.course_id !== editEnrollmentCourseId) {
          return [...prev.filter(x => !(x.student_id === editingEnrollment.student_id && x.course_id === editingEnrollment.course_id)), updated];
        } else {
          return prev.map(x => (x.student_id === editingEnrollment.student_id && x.course_id === editingEnrollment.course_id) ? updated : x);
        }
      });
      
      setShowEditEnrollmentModal(false);
      setEditingEnrollment(null);
      alert('Student enrollment updated successfully!');
    } catch (err) {
      alert('Error updating enrollment: ' + err.message);
    }
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    if (!schStudentId || !schCourseId || !schTutorId || !schTitle || !schStart || !schEnd) {
      return alert('Fill out all required class schedule details.');
    }
    if (new Date(schEnd) <= new Date(schStart)) {
      return alert('End time must be after the start time.');
    }
    try {
      const saved = await saveSchedule({
        student_id: schStudentId,
        course_id: schCourseId,
        tutor_id: schTutorId,
        title: schTitle,
        start_time: new Date(schStart).toISOString(),
        end_time: new Date(schEnd).toISOString(),
        meeting_link: schLink || null,
        meeting_link_2: schLink2 || null
      });
      setSchedules(prev => [...prev, saved]);
      setSchTitle('');
      setSchStart('');
      setSchEnd('');
      setSchLink('');
      setSchLink2('');
      alert('Class scheduled successfully!');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('Delete this class schedule?')) return;
    try {
      await deleteSchedule(id);
      setSchedules(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Metrics
  const pendingApprovals = bookings.filter(b => b.status === 'pending').length;
  const totalBookings = bookings.length;
  const totalStudents = students.length;
  const totalTutors = tutors.length;

  // Unread messages students sent to any admin account (Student Messages badge)
  const adminIdSet = new Set([String(user?.id || ''), ...adminIds]);
  const adminUnread = allChatMessages.filter(m => adminIdSet.has(String(m.receiver_id)) && !adminIdSet.has(String(m.sender_id)) && !m.read).length;

  if (loading) {
    return (
      <div className="dashboard-container">
        <div style={{ padding: '3rem', color: 'white' }}>Loading Admin Panel...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar (a slide-in drawer on phones); picking any item closes it */}
      <aside
        className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}
        onClick={(e) => { if (e.target.closest('button')) setSidebarOpen(false); }}
      >
        <div className="sidebar-brand-row">
          <div className="sidebar-brand">Admin Console</div>
          <SidebarCollapseButton collapsed={sidebarCollapsed} onToggle={toggleSidebarCollapsed} />
          {/* phones only; any button in the drawer closes it */}
          <button type="button" className="drawer-close" aria-label="Close menu"><X size={20} /></button>
        </div>
        <ul className="sidebar-menu">
          <li className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Overview' : undefined} onClick={() => setActiveTab('overview')}><Layers size={18} /> <span className="sidebar-label">Overview</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'bookings' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Bookings' : undefined} onClick={() => setActiveTab('bookings')}><Calendar size={18} /> <span className="sidebar-label">Bookings</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'students' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Students' : undefined} onClick={() => setActiveTab('students')}><Users size={18} /> <span className="sidebar-label">Students</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'tutors' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Tutors' : undefined} onClick={() => setActiveTab('tutors')}><UserCheck size={18} /> <span className="sidebar-label">Tutors</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'courses' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Course Builder' : undefined} onClick={() => setActiveTab('courses')}><BookOpen size={18} /> <span className="sidebar-label">Course Builder</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'enrollments' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Enrollments' : undefined} onClick={() => setActiveTab('enrollments')}><BookOpenCheck size={18} /> <span className="sidebar-label">Enrollments</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'schedules' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Schedules' : undefined} onClick={() => setActiveTab('schedules')}><Clock size={18} /> <span className="sidebar-label">Schedules</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'inquiries' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Inquiries' : undefined} onClick={() => setActiveTab('inquiries')}><Mail size={18} /> <span className="sidebar-label">Inquiries</span></button>
          </li>
          <li className={`sidebar-item ${activeTab === 'messages' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Student Messages' : undefined} onClick={() => setActiveTab('messages')} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <Inbox size={18} /> <span className="sidebar-label">Student Messages</span>
              {adminUnread > 0 && <span className="st-unread-dot sidebar-badge" style={{ marginLeft: 'auto' }}>{adminUnread}</span>}
            </button>
          </li>
          <li className={`sidebar-item ${activeTab === 'chatmonitor' ? 'active' : ''}`}>
            <button title={sidebarCollapsed ? 'Chat Monitor' : undefined} onClick={() => setActiveTab('chatmonitor')}><MessageSquare size={18} /> <span className="sidebar-label">Chat Monitor</span></button>
          </li>
          <li className="sidebar-item" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
            <button title={sidebarCollapsed ? 'Start Live Whiteboard' : undefined} onClick={() => setShowStartSessionModal(true)} style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>
              <MonitorPlay size={18} /> <span className="sidebar-label">Start Live Whiteboard ↗</span>
            </button>
          </li>
        </ul>
        <DrawerAccount user={user} onLogout={onLogout} />
      </aside>

      <MobileMenuSheet
        title="Admin Console"
        items={[
          { key: 'overview', label: 'Overview', Icon: Layers },
          { key: 'students', label: 'Students', Icon: Users },
          { key: 'tutors', label: 'Tutors', Icon: UserCheck },
          { key: 'bookings', label: 'Bookings', Icon: Calendar },
          { key: 'courses', label: 'Course Builder', Icon: BookOpen },
          { key: 'enrollments', label: 'Enrollments', Icon: BookOpenCheck },
          { key: 'schedules', label: 'Schedules', Icon: Clock },
          { key: 'inquiries', label: 'Inquiries', Icon: Mail },
          { key: 'messages', label: 'Messages', Icon: Inbox, badge: adminUnread },
          { key: 'chatmonitor', label: 'Chat Monitor', Icon: MessageSquare },
          { key: 'whiteboard', label: 'Live Whiteboard', Icon: MonitorPlay, accent: true, onClick: () => setShowStartSessionModal(true) }
        ]}
        active={activeTab}
        onSelect={(key) => { setActiveTab(key); setSidebarOpen(false); }}
        user={user}
        onLogout={onLogout}
      />

      {/* Main Content Workspace */}
      <main className="dashboard-main" ref={mainRef}>
        
        {/* Tab 0: Overview Dashboard */}
        {activeTab === 'overview' && (
          <div>
            
            {/* Top metrics stats grid */}
            <div className="stats-grid" style={{ marginBottom: '2rem' }}>
              <div className="stat-card">
                <div className="stat-icon"><Calendar size={24} /></div>
                <div className="stat-info">
                  <span className="stat-value">{totalBookings}</span>
                  <span className="stat-label">Total Bookings</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><Users size={24} /></div>
                <div className="stat-info">
                  <span className="stat-value">{totalStudents}</span>
                  <span className="stat-label">Students</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><UserCheck size={24} /></div>
                <div className="stat-info">
                  <span className="stat-value">{totalTutors}</span>
                  <span className="stat-label">Active Tutors</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><AlertCircle size={24} /></div>
                <div className="stat-info">
                  <span className="stat-value">{pendingApprovals}</span>
                  <span className="stat-label">Pending Reviews</span>
                </div>
              </div>
            </div>

            {/* Welcome Summary & Activity grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '2rem' }}>
              {/* Quick Admin Actions */}
              <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <h3 style={{ borderBottom: '1px solid #edf2f7', paddingBottom: '0.5rem', margin: 0 }}>Console Actions</h3>
                <p style={{ fontSize: '0.88rem', color: '#718096', margin: 0 }}>Use shortcuts below to manage resources quickly:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
                  <button className="btn-primary" onClick={() => setShowStudentModal(true)} style={{ flex: '1 1 45%', padding: '0.8rem', fontSize: '0.85rem' }}>+ Register Student</button>
                  <button className="btn-primary" onClick={() => setShowTutorModal(true)} style={{ flex: '1 1 45%', padding: '0.8rem', fontSize: '0.85rem' }}>+ Add Instructor</button>
                  <button className="btn-action approve" onClick={() => setActiveTab('courses')} style={{ flex: '1 1 45%', padding: '0.8rem', fontSize: '0.85rem' }}>Course Builder</button>
                  <button className="btn-action edit" onClick={() => setActiveTab('enrollments')} style={{ flex: '1 1 45%', padding: '0.8rem', fontSize: '0.85rem' }}>Enroll Students</button>
                </div>
              </div>

              {/* Consultation appointments activity list */}
              <div className="dashboard-card">
                <h3 style={{ borderBottom: '1px solid #edf2f7', paddingBottom: '0.5rem', margin: '0 0 1rem 0' }}>Consultations Overview</h3>
                {bookings.length === 0 ? (
                  <div style={{ padding: '1rem', color: '#a0aec0', fontSize: '0.85rem', textAlign: 'center' }}>No active bookings.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {bookings.slice(0, 3).map(b => (
                      <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f7fafc', padding: '0.75rem', borderRadius: '10px', fontSize: '0.85rem' }}>
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{b.student_name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#718096' }}>Type: {b.meeting_type} | Time: {b.booking_date} @ {b.booking_time}</div>
                        </div>
                        <span className={`badge badge-${b.status}`} style={{ fontSize: '0.7rem' }}>{b.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Bookings Management */}
        {activeTab === 'bookings' && (
          <div>
            <div className="dashboard-card">
              <h3><Layers size={18} color="var(--primary-color)" /> Active Appointment Log</h3>
              {bookings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>No bookings found.</div>
              ) : (
                <div className="table-container">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Parent</th>
                        <th>Phone</th>
                        <th>Tutor</th>
                        <th>Date / Time</th>
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
                          <td>{b.tutor_name}</td>
                          <td>{b.booking_date} @ {b.booking_time}</td>
                          <td style={{ textTransform: 'capitalize' }}>{b.meeting_type}</td>
                          <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                          <td>
                            <div className="btn-action-group">
                              {b.status === 'pending' && (
                                <button className="btn-action approve" onClick={() => handleBookingStatus(b.id, 'approved')}>Approve</button>
                              )}
                              {b.status === 'approved' && (
                                <button className="btn-action complete" onClick={() => handleBookingStatus(b.id, 'completed')}>Complete</button>
                              )}
                              {b.status !== 'cancelled' && (
                                <button className="btn-action cancel" onClick={() => handleBookingStatus(b.id, 'cancelled')}>Cancel</button>
                              )}
                              <button className="btn-action delete" onClick={() => handleDeleteBooking(b.id)} title="Delete Record"><Trash2 size={14} /></button>
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

        {/* Tab 2: Students List */}
        {activeTab === 'students' && (
          <div>
            <div className="dashboard-card">
              <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={18} color="var(--primary-color)" /> Active Registrations</span>
                <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.8rem' }} onClick={() => setShowStudentModal(true)}>
                  <Plus size={14} /> Register Student
                </button>
              </h3>
              {students.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>No registered students.</div>
              ) : (
                <div className="table-container">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Student Name</th>
                        <th>Grade</th>
                        <th>Program</th>
                        <th>Schedule</th>
                        <th>Parent Contact</th>
                        <th>Start Date</th>
                        <th>Special Needs</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.id}>
                          <td style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {s.avatar_url ? (
                              <img src={s.avatar_url} alt={s.full_name} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--primary-color)' }} />
                            ) : (
                              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 'bold' }}>{s.full_name ? s.full_name[0] : 'S'}</div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 'bold' }}>{s.full_name}</span>
                              {(s.additional_comments || '').includes(FREE_CLASS.tag) && (
                                <span title={s.additional_comments} style={{ width: 'fit-content', background: 'rgba(15, 44, 89, 0.08)', color: 'var(--primary-color)', padding: '0.15rem 0.45rem', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 'bold', marginTop: '0.2rem' }}>
                                Free Teen Class
                                </span>
                              )}
                              {s.status === 'pending' ? (
                                <span style={{ 
                                  width: 'fit-content',
                                  background: 'rgba(242, 122, 36, 0.1)', 
                                  color: 'var(--accent-color)', 
                                  padding: '0.15rem 0.45rem', 
                                  borderRadius: '6px', 
                                  fontSize: '0.65rem', 
                                  fontWeight: 'bold',
                                  marginTop: '0.2rem'
                                }}>
                                  Pending Review
                                </span>
                              ) : (
                                <span style={{ 
                                  width: 'fit-content',
                                  background: 'rgba(40, 167, 69, 0.1)', 
                                  color: '#28a745', 
                                  padding: '0.15rem 0.45rem', 
                                  borderRadius: '6px', 
                                  fontSize: '0.65rem', 
                                  fontWeight: 'bold',
                                  marginTop: '0.2rem'
                                }}>
                                  Approved
                                </span>
                              )}
                              {/* Enrolled classes list */}
                              {(() => {
                                const enrolls = studentCourses.filter(sc => sc.student_id === s.id);
                                if (enrolls.length > 0) {
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.4rem', borderTop: '1px solid #edf2f7', paddingTop: '0.4rem' }}>
                                      <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>Classes & Instructors:</span>
                                      {enrolls.map((sc, scIdx) => {
                                        const cTitle = courses.find(c => c.id === sc.course_id)?.title || 'Course';
                                        const tName = tutors.find(t => t.id === sc.tutor_id)?.full_name || 'Tutor';
                                        return (
                                          <div key={scIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.68rem', background: '#f7fafc', padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid #e2e8f0', width: 'fit-content' }}>
                                            <span style={{ fontWeight: '500' }}>{cTitle}</span>
                                            <span style={{ color: '#718096' }}>({tName})</span>
                                            <button 
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); handleEditEnrollmentClick(sc); }}
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-color)', padding: 0 }}
                                              title="Edit Class/Tutor"
                                            >
                                              <Edit size={10} />
                                            </button>
                                            <button 
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); handleUnenrollStudent(sc.student_id, sc.course_id); }}
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', padding: 0 }}
                                              title="Unenroll Student"
                                            >
                                              <Trash2 size={10} />
                                            </button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </td>
                          <td>{s.grade_level}</td>
                          <td style={{ textTransform: 'capitalize' }}>{s.program}</td>
                          <td style={{ textTransform: 'capitalize' }}>{s.schedule}</td>
                          <td>
                            <div style={{ fontSize: '0.85rem' }}>{s.parentName || 'N/A'}</div>
                            <div style={{ fontSize: '0.75rem', color: '#718096' }}>{s.phone} | {s.email}</div>
                          </td>
                          <td>{s.start_date}</td>
                          <td style={{ fontSize: '0.8rem', maxWidth: '200px' }}>{s.special_needs || <span style={{ color: '#cbd5e0' }}>None</span>}</td>
                          <td>
                            <div className="btn-action-group" style={{ display: 'flex', gap: '0.4rem' }}>
                              {!s.is_active && (
                                <button 
                                  className="btn-action approve" 
                                  onClick={() => {
                                    setStudentToActivate(s);
                                    setShowActivationModal(true);
                                    setActivationPassword('');
                                  }}
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                >
                                  Activate
                                </button>
                              )}
                              <button 
                                className="btn-action edit" 
                                onClick={() => {
                                  setEditingStudent(s);
                                  setShowEditStudentModal(true);
                                }}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              >
                                Edit
                              </button>
                              <button
                                className="btn-action complete"
                                onClick={() => setFeesStudent(s)}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                title="Parent code and fees"
                              >
                                Parent &amp; Fees
                              </button>
                              <button className="btn-action delete" onClick={() => handleDeleteStudent(s.id)}>Remove</button>
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

        {/* Tab 3: Tutors Registry */}
        {activeTab === 'tutors' && (
          <div>
            <div className="dashboard-card">
              <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><UserCheck size={18} color="var(--primary-color)" /> Active Tutors</span>
                <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem', fontSize: '0.8rem' }} onClick={() => setShowTutorModal(true)}>
                  <Plus size={14} /> Add New Tutor
                </button>
              </h3>
              {tutors.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>No active tutors.</div>
              ) : (
                <div className="table-container">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Tutor Name</th>
                        <th>Subject</th>
                        <th>Rating</th>
                        <th>Experience</th>
                        <th>Bio Description</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tutors.map((t) => (
                        <tr key={t.id}>
                          <td style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: `url(${t.avatar_url}) center center`, backgroundSize: 'cover' }}></div>
                            <span style={{ fontWeight: 'bold' }}>{t.full_name}</span>
                          </td>
                          <td>{t.subject}</td>
                          <td>⭐ {t.rating}</td>
                          <td style={{ fontSize: '0.85rem' }}>{t.experience}</td>
                          <td style={{ fontSize: '0.8rem', maxWidth: '250px' }}>{t.bio || 'No bio provided'}</td>
                          <td>
                            <button className="btn-action edit" onClick={() => handleEditTutorClick(t)} style={{ marginRight: '0.5rem' }}>Edit</button>
                            <button className="btn-action delete" onClick={() => handleDeleteTutor(t.id)}>Remove</button>
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

        {/* Tab 4: Course Builder */}
        {activeTab === 'courses' && (
          <div style={{ height: 'calc(100vh - 10rem)', display: 'flex', flexDirection: 'column' }}>

            {/* Course Builder layout grid */}
            <div className="course-builder-layout">
              
              {/* Left Column: Create Course & Selection */}
              <div className="course-builder-left">
                               <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <button 
                    className="btn-primary" 
                    style={{ flex: 1, padding: '0.8rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.82rem' }} 
                    onClick={() => setShowCreateCourseModal(true)}
                  >
                    <Plus size={14} /> Course
                  </button>
                  <button 
                    className="btn-prev" 
                    style={{ flex: 1, padding: '0.8rem 0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.82rem', background: '#edf2f7', border: '1px solid #cbd5e0', color: 'var(--primary-color)' }} 
                    onClick={() => setShowCreateCategoryModal(true)}
                  >
                    <Plus size={14} /> Category
                  </button>
                </div>

                {/* Course Registry List grouped by Category */}
                <div className="dashboard-card course-builder-left-list" style={{ padding: '1.25rem', marginBottom: 0, display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
                  <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BookOpen size={16} /> Category Builder</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', overflowY: 'auto', flex: 1 }}>
                    {/* Render Grouped Categories */}
                    {categories.map(cat => {
                      const catCourses = courses.filter(c => c.category === cat.name || c.category_id === cat.id);
                      return (
                        <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #edf2f7', paddingBottom: '0.3rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#4a5568' }}>{cat.name}</span>
                              <span style={{ background: '#edf2f7', color: '#718096', padding: '0.1rem 0.35rem', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold' }}>
                                {catCourses.length}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button 
                                className="btn-action edit" 
                                style={{ padding: '0.15rem 0.3rem', background: '#edf2f7', color: '#4a5568', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                                onClick={() => { setEditingCategory(cat); setShowEditCategoryModal(true); }}
                                title="Edit Category"
                              >
                                <Edit size={10} />
                              </button>
                              <button 
                                className="btn-action delete" 
                                style={{ padding: '0.15rem 0.3rem', background: '#edf2f7', color: '#e53e3e', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                                onClick={() => handleDeleteCategory(cat)}
                                title="Delete Category"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </div>
                          
                          {catCourses.length === 0 ? (
                            <div style={{ padding: '0.5rem 0.8rem', color: '#cbd5e0', fontSize: '0.75rem', fontStyle: 'italic' }}>
                              No courses in this category.
                            </div>
                          ) : (
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              {catCourses.map(c => {
                                const isSelected = selectedCourseId === c.id;
                                return (
                                  <li 
                                    key={c.id} 
                                    style={{ 
                                      padding: '0.6rem 0.8rem', 
                                      borderRadius: '8px', 
                                      background: isSelected ? 'var(--primary-color)' : '#f7fafc',
                                      color: isSelected ? 'white' : 'var(--primary-color)',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      boxShadow: isSelected ? '0 4px 10px rgba(15, 44, 89, 0.12)' : 'none',
                                      border: isSelected ? '1px solid var(--primary-color)' : '1px solid #edf2f7',
                                      transform: isSelected ? 'translateY(-1px)' : 'none',
                                      transition: 'all 0.15s ease-in-out'
                                    }}
                                    onClick={() => setSelectedCourseId(c.id)}
                                  >
                                    <span style={{ fontWeight: '600', fontSize: '0.82rem', color: isSelected ? 'white' : '#2d3748' }}>{c.title}</span>
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                      <button 
                                        className="btn-action edit" 
                                        style={{ padding: '0.15rem 0.3rem', background: isSelected ? 'rgba(255, 255, 255, 0.15)' : '#edf2f7', color: isSelected ? 'white' : 'var(--primary-color)', display: 'flex', alignItems: 'center' }}
                                        onClick={(e) => { e.stopPropagation(); handleEditCourseClick(c); }}
                                        title="Edit Course"
                                      >
                                        <Edit size={10} />
                                      </button>
                                      <button 
                                        className="btn-action delete" 
                                        style={{ padding: '0.15rem 0.3rem', background: isSelected ? 'rgba(255, 255, 255, 0.15)' : '#edf2f7', color: isSelected ? 'white' : '#e53e3e', display: 'flex', alignItems: 'center' }}
                                        onClick={(e) => { e.stopPropagation(); handleDeleteCourse(c.id); }}
                                        title="Delete Course"
                                      >
                                        <Trash2 size={10} />
                                      </button>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}

                    {/* Render Uncategorized Courses */}
                    {courses.filter(isUncategorized).length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #edf2f7', paddingBottom: '0.3rem' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#718096', fontStyle: 'italic' }}>Uncategorized</span>
                          <span style={{ background: '#edf2f7', color: '#718096', padding: '0.1rem 0.35rem', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold' }}>
                            {courses.filter(isUncategorized).length}
                          </span>
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {courses.filter(isUncategorized).map(c => {
                            const isSelected = selectedCourseId === c.id;
                            return (
                              <li 
                                key={c.id} 
                                style={{ 
                                  padding: '0.6rem 0.8rem', 
                                  borderRadius: '8px', 
                                  background: isSelected ? 'var(--primary-color)' : '#f7fafc',
                                  color: isSelected ? 'white' : 'var(--primary-color)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  boxShadow: isSelected ? '0 4px 10px rgba(15, 44, 89, 0.12)' : 'none',
                                  border: isSelected ? '1px solid var(--primary-color)' : '1px solid #edf2f7',
                                  transform: isSelected ? 'translateY(-1px)' : 'none',
                                  transition: 'all 0.15s ease-in-out'
                                }}
                                onClick={() => setSelectedCourseId(c.id)}
                              >
                                <span style={{ fontWeight: '600', fontSize: '0.82rem', color: isSelected ? 'white' : '#2d3748' }}>{c.title}</span>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                  <button 
                                    className="btn-action edit" 
                                    style={{ padding: '0.15rem 0.3rem', background: isSelected ? 'rgba(255, 255, 255, 0.15)' : '#edf2f7', color: isSelected ? 'white' : 'var(--primary-color)', display: 'flex', alignItems: 'center' }}
                                    onClick={(e) => { e.stopPropagation(); handleEditCourseClick(c); }}
                                    title="Edit Course"
                                  >
                                    <Edit size={10} />
                                  </button>
                                  <button 
                                    className="btn-action delete" 
                                    style={{ padding: '0.15rem 0.3rem', background: isSelected ? 'rgba(255, 255, 255, 0.15)' : '#edf2f7', color: isSelected ? 'white' : '#e53e3e', display: 'flex', alignItems: 'center' }}
                                    onClick={(e) => { e.stopPropagation(); handleDeleteCourse(c.id); }}
                                    title="Delete Course"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Topics, Materials, Tasks */}
              <div className="course-builder-right">
                {selectedCourseId ? (
                  <>
                    
                    {/* Top: Add Syllabus Topic */}
                    <div className="dashboard-card" style={{ background: '#fcfdfe', padding: '1.25rem', marginBottom: 0 }}>
                      <h3><Plus size={16} /> Add Syllabus Topic</h3>
                      <form onSubmit={handleCreateTopic} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1rem', alignItems: 'end' }}>
                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem' }}>Topic Title *</label>
                        <input type="text" value={newTopic.title} onChange={(e) => setNewTopic(prev => ({ ...prev, title: e.target.value }))} placeholder="e.g. Intro to Loops" required />
                      </div>
                      <div className="form-group">
                        <label style={{ fontSize: '0.8rem' }}>Sort Order</label>
                        <input type="number" value={newTopic.sort_order} onChange={(e) => setNewTopic(prev => ({ ...prev, sort_order: Number(e.target.value) }))} required />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: '0.8rem' }}>Description Summary</label>
                        <RichTextArea value={newTopic.description} onChange={(v) => setNewTopic(prev => ({ ...prev, description: v }))} placeholder="Briefly describe what students will learn... Use the toolbar for bold text and bullet points." rows={5} />
                      </div>
                      <button type="submit" className="btn-primary" style={{ padding: '0.75rem 1.5rem', gridColumn: '1 / -1', justifySelf: 'end' }}>Add Lesson</button>
                    </form>
                  </div>

                  {/* Syllabus Outline Tree */}
                  <div className="dashboard-card course-builder-syllabus-scroll" style={{ padding: '1.5rem', marginBottom: 0 }}>
                    <h3 style={{ borderBottom: '1px solid rgba(0, 0, 0, 0.05)', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}>
                      <Layers size={18} /> Course Outline Syllabus ({courses.find(c => c.id === selectedCourseId)?.title})
                    </h3>

                    {topics.filter(t => t.course_id === selectedCourseId).length === 0 ? (
                      <div style={{ padding: '3rem', background: '#f7fafc', border: '2px dashed #edf2f7', borderRadius: '15px', textAlign: 'center', color: '#a0aec0' }}>
                        No topics added to this syllabus yet. Use the form above to add lessons.
                      </div>
                    ) : (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'white' }}>
                        {topics.filter(t => t.course_id === selectedCourseId).map((t, idx) => {
                          const topicMats = materials.filter(m => m.topic_id === t.id);
                          const topicTasks = tasks.filter(tk => tk.topic_id === t.id);
                          const showMaterialForm = activeTopicMaterialId === t.id;
                          const showTaskForm = activeTopicTaskId === t.id;
                          const isLast = idx === topics.filter(x => x.course_id === selectedCourseId).length - 1;

                          return (
                            <div key={t.id} style={{ padding: '1.5rem', borderBottom: isLast ? 'none' : '1px solid #e2e8f0', position: 'relative', background: idx % 2 === 0 ? 'white' : '#fcfdfe' }}>
                              
                              {/* Topic Header */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f7fafc', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                                <div>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent-color)', textTransform: 'uppercase', tracking: 'wide' }}>
                                    Lesson {t.sort_order}
                                  </span>
                                  <h4 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--primary-color)', margin: '0.2rem 0 0.3rem 0' }}>
                                    {t.title}
                                  </h4>
                                  {t.description
                                    ? <FormattedText style={{ fontSize: '0.85rem', color: '#718096' }} text={t.description} />
                                    : <p style={{ fontSize: '0.85rem', color: '#718096', margin: 0 }}>No description summary.</p>}
                                </div>
                                
                                {/* Topic actions */}
                                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                  <button className="btn-action edit" style={{ padding: '0.3rem' }} onClick={() => handleMoveTopic(t.id, 'up')} title="Move Lesson Up">
                                    <ArrowUp size={14} />
                                  </button>
                                  <button className="btn-action edit" style={{ padding: '0.3rem' }} onClick={() => handleMoveTopic(t.id, 'down')} title="Move Lesson Down">
                                    <ArrowDown size={14} />
                                  </button>
                                  <button className="btn-action edit" style={{ padding: '0.3rem' }} onClick={() => handleEditTopicClick(t)} title="Edit Lesson Details">
                                    <Edit size={14} />
                                  </button>
                                  <button className="btn-action delete" style={{ padding: '0.3rem', color: 'red' }} onClick={() => handleDeleteTopic(t.id)} title="Delete Lesson">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>

                              {/* Topic Body: Materials and Tasks */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                
                                {/* Left Section: Materials */}
                                <div style={{ borderRight: '1px solid #edf2f7', paddingRight: '1rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                    <h5 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary-color)', margin: 0 }}>Lesson Attachments</h5>
                                    <button 
                                      className="btn-action approve" 
                                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                                      onClick={() => {
                                        if (showMaterialForm) {
                                          setActiveTopicMaterialId('');
                                        } else {
                                          setActiveTopicMaterialId(t.id);
                                          setSelectedTopicId(t.id);
                                          setMaterialTitle('');
                                          setMaterialFile(null);
                                        }
                                      }}
                                    >
                                      {showMaterialForm ? 'Cancel' : '+ Add File'}
                                    </button>
                                  </div>

                                  {/* Upload Material Inline Form */}
                                  {showMaterialForm && (
                                    <form onSubmit={handleUploadMaterial} style={{ background: '#f7fafc', padding: '0.8rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.8rem' }}>
                                      <div style={{ fontSize: '0.7rem', color: '#a0aec0' }}>PowerPoint files (.pptx, under 10MB) open exactly like PowerPoint and can be attached to the whiteboard.</div>
                                      <div className="form-group" style={{ margin: 0 }}>
                                        <input type="text" value={materialTitle} onChange={(e) => setMaterialTitle(e.target.value)} placeholder="File Title (e.g. PDF Guide)" required style={{ padding: '0.4rem', fontSize: '0.8rem' }} />
                                      </div>
                                      <div className="form-group" style={{ margin: 0 }}>
                                        <input type="file" onChange={(e) => setMaterialFile(e.target.files[0])} required style={{ fontSize: '0.75rem' }} />
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        <button type="submit" className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} disabled={uploading}>
                                          {uploading ? 'Uploading...' : 'Upload Attachment'}
                                        </button>
                                        <span style={{ fontSize: '0.72rem', color: '#a0aec0' }}>or</span>
                                        <button
                                          type="button"
                                          className="btn-action edit"
                                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                          onClick={() => navigate(`/slide-editor?courseId=${selectedCourseId}&topicId=${selectedTopicId}`)}
                                        >
                                          Create Slide Deck
                                        </button>
                                      </div>
                                    </form>
                                  )}

                                  {/* Materials List */}
                                  {topicMats.length === 0 ? (
                                    <span style={{ fontSize: '0.8rem', color: '#cbd5e0', fontStyle: 'italic' }}>No files attached.</span>
                                  ) : (
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                      {topicMats.map(m => (
                                        <li key={m.id} style={{ display: 'flex', justify: 'space-between', items: 'center', background: '#f7fafc', padding: '0.4rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Paperclip size={12} color="#4a5568" />
                                            {isSlideMaterial(m) ? (
                                              <button onClick={() => setViewingSlide(m)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-color)', fontWeight: '500', textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit' }}>{m.title}</button>
                                            ) : (
                                              <a href={m.file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)', fontWeight: '500', textDecoration: 'underline' }}>{m.title}</a>
                                            )}
                                            <span style={{ fontSize: '0.65rem', color: '#a0aec0', textTransform: 'uppercase' }}>({m.file_type})</span>
                                          </div>
                                          <button style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer' }} onClick={() => handleDeleteMaterial(m.id)}><Trash2 size={12} /></button>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>

                                {/* Right Section: Tasks & Quizzes */}
                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                    <h5 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary-color)', margin: 0 }}>Homework & Quizzes</h5>
                                    <button 
                                      className="btn-action approve" 
                                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                                      onClick={() => {
                                        if (showTaskForm) {
                                          setActiveTopicTaskId('');
                                        } else {
                                          setActiveTopicTaskId(t.id);
                                          setSelectedTopicId(t.id);
                                          setTaskTitle('');
                                          setTaskDesc('');
                                          setTaskType('assignment');
                                          setMaxPoints(100);
                                          setQuizQuestions([]);
                                        }
                                      }}
                                    >
                                      {showTaskForm ? 'Cancel' : '+ Add Task'}
                                    </button>
                                  </div>

                                  {/* Add Task Inline Form */}
                                  {showTaskForm && (
                                    <form onSubmit={handleAddTask} style={{ background: '#f7fafc', padding: '0.8rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.8rem' }}>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '0.5rem' }}>
                                        <select value={taskType} onChange={(e) => {
                                          setTaskType(e.target.value);
                                          if (e.target.value === 'true_false') {
                                            setNewQCorrect(0);
                                          }
                                        }} required style={{ padding: '0.35rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                                          <option value="assignment">Assignment</option>
                                          <option value="quiz">Interactive Quiz</option>
                                          <option value="true_false">True / False Question</option>
                                          <option value="instruction">Instructional Text</option>
                                        </select>
                                        <input type="number" min={1} value={maxPoints} onChange={(e) => setMaxPoints(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Max Pts" required style={{ padding: '0.35rem', fontSize: '0.8rem' }} />
                                      </div>
                                      
                                      <input type="text" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task Title" required style={{ padding: '0.35rem', fontSize: '0.8rem' }} />
                                      <textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Instructions..." rows={2} style={{ padding: '0.35rem', fontSize: '0.8rem' }}></textarea>

                                      {taskType === 'true_false' && (
                                        <div style={{ background: 'white', padding: '0.6rem', borderRadius: '8px', borderLeft: '3px solid var(--accent-color)', fontSize: '0.8rem' }}>
                                          <div className="form-group" style={{ margin: 0 }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '600', display: 'block', marginBottom: '0.2rem' }}>Correct Answer *</label>
                                            <select value={newQCorrect} onChange={(e) => setNewQCorrect(Number(e.target.value))} style={{ padding: '0.25rem', fontSize: '0.75rem', width: '100%', borderRadius: '4px', border: '1px solid #cbd5e0' }}>
                                              <option value={0}>True</option>
                                              <option value={1}>False</option>
                                            </select>
                                          </div>
                                        </div>
                                      )}

                                      {/* Inline Quiz Question Compiler */}
                                      {taskType === 'quiz' && (
                                        <div style={{ background: 'white', padding: '0.6rem', borderRadius: '8px', borderLeft: '3px solid var(--accent-color)', fontSize: '0.8rem' }}>
                                          <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.4rem', color: 'var(--primary-color)' }}>Questions Config</span>
                                          
                                          <div className="form-group" style={{ marginBottom: '0.4rem', margin: 0 }}>
                                            <select value={newQType} onChange={(e) => { setNewQType(e.target.value); setNewQCorrect(0); }} style={{ padding: '0.25rem', fontSize: '0.75rem', width: '100%', borderRadius: '4px', border: '1px solid #cbd5e0' }}>
                                              <option value="multiple">Multiple Choice (3 options)</option>
                                              <option value="boolean">True / False</option>
                                            </select>
                                          </div>

                                          <input type="text" value={newQText} onChange={(e) => setNewQText(e.target.value)} placeholder="Question Prompt" style={{ padding: '0.3rem', fontSize: '0.75rem', width: '100%', marginBottom: '0.4rem', marginTop: '0.4rem' }} />
                                          
                                          {newQType === 'multiple' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.4rem' }}>
                                              {newQOptions.map((opt, oIdx) => (
                                                <input 
                                                  key={oIdx}
                                                  type="text" 
                                                  value={opt} 
                                                  onChange={(e) => {
                                                    const cpy = [...newQOptions];
                                                    cpy[oIdx] = e.target.value;
                                                    setNewQOptions(cpy);
                                                  }}
                                                  placeholder={`Choice ${oIdx + 1}`}
                                                  style={{ padding: '0.25rem', fontSize: '0.7rem' }}
                                                />
                                              ))}
                                            </div>
                                          ) : (
                                            <div style={{ padding: '0.3rem 0.5rem', background: '#f7fafc', borderRadius: '6px', fontSize: '0.72rem', color: '#4a5568', marginBottom: '0.4rem', display: 'flex', gap: '1rem' }}>
                                              <span>1. True</span>
                                              <span>2. False</span>
                                            </div>
                                          )}

                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <select value={newQCorrect} onChange={(e) => setNewQCorrect(Number(e.target.value))} style={{ padding: '0.2rem', fontSize: '0.7rem' }}>
                                              {newQType === 'multiple' ? (
                                                <>
                                                  <option value={0}>Ans: Opt 1</option>
                                                  <option value={1}>Ans: Opt 2</option>
                                                  <option value={2}>Ans: Opt 3</option>
                                                </>
                                              ) : (
                                                <>
                                                  <option value={0}>Ans: True</option>
                                                  <option value={1}>Ans: False</option>
                                                </>
                                              )}
                                            </select>
                                            <button type="button" className="btn-action approve" style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }} onClick={handleAddQuizQuestion}>+ Add Q</button>
                                          </div>

                                          {/* Quiz Compiled List */}
                                          {quizQuestions.length > 0 && (
                                            <div style={{ marginTop: '0.4rem', borderTop: '1px solid #edf2f7', paddingTop: '0.3rem' }}>
                                              <span style={{ fontSize: '0.7rem', fontWeight: 'bold' }}>Added questions: {quizQuestions.length}</span>
                                              <ul style={{ paddingLeft: '1rem', margin: '0.2rem 0', fontSize: '0.68rem' }}>
                                                {quizQuestions.map((q, idx) => (
                                                  <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '80%' }}>{idx + 1}. {q.question}</span>
                                                    <button type="button" onClick={() => setQuizQuestions(prev => prev.filter((_, i) => i !== idx))} style={{ border: 'none', background: 'none', color: 'red', cursor: 'pointer', fontSize: '0.7rem' }}>X</button>
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      <button type="submit" className="btn-primary" style={{ padding: '0.4rem', fontSize: '0.8rem' }}>Create Task</button>
                                    </form>
                                  )}

                                  {/* Tasks List */}
                                  {topicTasks.length === 0 ? (
                                    <span style={{ fontSize: '0.8rem', color: '#cbd5e0', fontStyle: 'italic' }}>No tasks assigned.</span>
                                  ) : (
                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                      {topicTasks.map(tk => (
                                        <li key={tk.id} style={{ display: 'flex', justify: 'space-between', items: 'center', background: '#f7fafc', padding: '0.4rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <span className={`badge`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', textTransform: 'capitalize' }}>{tk.task_type}</span>
                                            <span style={{ fontWeight: 'bold' }}>{tk.title}</span>
                                            <span style={{ fontSize: '0.7rem', color: '#718096' }}>({tk.max_points} pts)</span>
                                          </div>
                                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                                            <button style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer' }} onClick={() => handleEditTaskClick(tk)} title="Edit Task"><Edit size={12} /></button>
                                            <button style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer' }} onClick={() => handleDeleteTask(tk.id)} title="Delete Task"><Trash2 size={12} /></button>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>

                              </div>

                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ padding: '2rem', background: '#f7fafc', borderRadius: '15px', textAlign: 'center', color: '#a0aec0', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', marginBottom: 0 }}>
                  Please create or select a Course to configure syllabus topics, files, and quizzes.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

        {/* Tab 5: Enrollments mapping */}
        {activeTab === 'enrollments' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
              
              {/* Left Column: Assigned Teaching Staff */}
              <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', paddingBottom: '0.75rem', marginBottom: '0.25rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}><UserCheck size={18} /> Assigned Teaching Staff</h3>
                  <button 
                    className="btn-primary" 
                    style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: '8px', fontWeight: 'bold' }}
                    onClick={() => setShowAssignTutorModal(true)}
                  >
                    <Plus size={14} /> Assign Tutor
                  </button>
                </div>

                {courseTutors.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: '#a0aec0', padding: '2rem', textAlign: 'center' }}>No mapping assignments.</div>
                ) : (
                  <div className="table-container">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th>Course</th>
                          <th>Tutor</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courseTutors.map((ct, i) => {
                          const cTitle = courses.find(c => c.id === ct.course_id)?.title || 'Course';
                          const tName = tutors.find(t => t.id === ct.tutor_id)?.full_name || 'Tutor';
                          return (
                            <tr key={i}>
                              <td style={{ fontWeight: 'bold' }}>{cTitle}</td>
                              <td>
                                <select className="switch-tutor-select" value={ct.tutor_id} onChange={(e) => handleSwitchCourseTutor(ct, e.target.value)} title={`Switch tutor (now: ${tName})`} aria-label={`Tutor for ${cTitle}`}>
                                  {!tutors.some(t => t.id === ct.tutor_id) && <option value={ct.tutor_id}>{tName}</option>}
                                  {tutorOptions.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                                </select>
                              </td>
                              <td><button className="btn-action delete" style={{ padding: '0.2rem 0.4rem' }} onClick={() => handleUnmapTutor(ct.course_id, ct.tutor_id)} title="Remove Tutor"><Trash2 size={12} /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Right Column: Student Enrollment Registry */}
              <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', paddingBottom: '0.75rem', marginBottom: '0.25rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}><BookOpenCheck size={18} /> Student Registry</h3>
                  <button 
                    className="btn-primary" 
                    style={{ padding: '0.5rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: '8px', fontWeight: 'bold' }}
                    onClick={() => setShowEnrollStudentModal(true)}
                  >
                    <Plus size={14} /> Enroll Student
                  </button>
                </div>

                {studentCourses.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: '#a0aec0', padding: '2rem', textAlign: 'center' }}>No student enrolments.</div>
                ) : (
                  <div className="table-container">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Course</th>
                          <th>Tutor</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentCourses.map((sc, i) => {
                          const sName = students.find(s => s.id === sc.student_id)?.full_name || 'Student';
                          const cTitle = courses.find(c => c.id === sc.course_id)?.title || 'Course';
                          const tName = tutors.find(t => t.id === sc.tutor_id)?.full_name || 'Tutor';
                          return (
                            <tr key={i}>
                              <td style={{ fontWeight: 'bold' }}>{sName}</td>
                              <td>{cTitle}</td>
                              <td>
                                <select className="switch-tutor-select" value={sc.tutor_id || ''} onChange={(e) => handleSwitchEnrollmentTutor(sc, e.target.value)} title={`Switch tutor (now: ${tName})`} aria-label={`Tutor for ${sName} in ${cTitle}`}>
                                  {!tutors.some(t => t.id === sc.tutor_id) && <option value={sc.tutor_id || ''}>{tName}</option>}
                                  {tutorOptions.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                                </select>
                              </td>
                              <td><button className="btn-action delete" style={{ padding: '0.2rem 0.4rem' }} onClick={() => handleUnenrollStudent(sc.student_id, sc.course_id)} title="Unenroll Student"><Trash2 size={12} /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Tab 6: Class Schedules */}
        {activeTab === 'schedules' && (
          <div>

            
            {/* Create Class form */}
            <div className="dashboard-card">
              <h3><Calendar size={18} /> Schedule a Class</h3>
              <form onSubmit={handleCreateSchedule} className="login-form" style={{ gap: '0.8rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
                  <div className="form-group">
                    <label>Student *</label>
                    <select
                      value={schStudentId}
                      onChange={(e) => { setSchStudentId(e.target.value); setSchCourseId(''); setSchTutorId(''); }}
                      required
                      style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}
                    >
                      <option value="">-- Choose Student --</option>
                      {students.map(st => <option key={st.id} value={st.id}>{st.full_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Course *</label>
                    <select
                      value={schCourseId}
                      onChange={(e) => {
                        const courseId = e.target.value;
                        setSchCourseId(courseId);
                        // Default the tutor to whoever teaches this student in that course
                        const enr = studentCourses.find(sc => sc.student_id === schStudentId && sc.course_id === courseId);
                        if (enr?.tutor_id) setSchTutorId(enr.tutor_id);
                      }}
                      required
                      style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}
                    >
                      <option value="">-- Choose Course --</option>
                      {(() => {
                        const enrolledIds = new Set(studentCourses.filter(sc => sc.student_id === schStudentId).map(sc => sc.course_id));
                        const list = enrolledIds.size > 0 ? courses.filter(c => enrolledIds.has(c.id)) : courses;
                        return list.map(c => <option key={c.id} value={c.id}>{c.title}</option>);
                      })()}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Tutor *</label>
                    <select
                      value={schTutorId}
                      onChange={(e) => setSchTutorId(e.target.value)}
                      required
                      style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}
                    >
                      <option value="">-- Choose Tutor --</option>
                      {tutors.map(tu => <option key={tu.id} value={tu.id}>{tu.full_name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Class Title *</label>
                  <input type="text" value={schTitle} onChange={(e) => setSchTitle(e.target.value)} placeholder="e.g. Algebra Revision" required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
                  <div className="form-group">
                    <label>Start Time *</label>
                    <input type="datetime-local" value={schStart} onChange={(e) => setSchStart(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>End Time *</label>
                    <input type="datetime-local" value={schEnd} min={schStart || undefined} onChange={(e) => setSchEnd(e.target.value)} required />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
                  <div className="form-group">
                    <label>Meeting Link (First Half)</label>
                    <input type="url" value={schLink} onChange={(e) => setSchLink(e.target.value)} placeholder="https://zoom.us/j/..." />
                  </div>
                  <div className="form-group">
                    <label>Meeting Link (Second Half, optional)</label>
                    <input type="url" value={schLink2} onChange={(e) => setSchLink2(e.target.value)} placeholder="https://zoom.us/j/..." />
                  </div>
                </div>
                <button type="submit" className="btn-primary" style={{ padding: '0.75rem', alignSelf: 'flex-start' }}>Schedule Class</button>
              </form>
            </div>

            {/* Scheduled Lectures Registry Audit panel */}
            <div className="dashboard-card" style={{ marginBottom: 0 }}>
              <h3><Clock size={18} /> Scheduled Lectures Registry</h3>
              {schedules.length === 0 ? (
                <div style={{ color: '#a0aec0', padding: '2rem', textAlign: 'center' }}>No scheduled classes.</div>
              ) : (
                <div className="table-container">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Lecture</th>
                        <th>Student</th>
                        <th>Tutor</th>
                        <th>Date / Time</th>
                        <th>Link</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedules.map(s => {
                        const sName = students.find(st => st.id === s.student_id)?.full_name || 'Student';
                        const tName = tutors.find(tu => tu.id === s.tutor_id)?.full_name || 'Tutor';
                        return (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 'bold' }}>{s.title}</td>
                            <td>{sName}</td>
                            <td>{tName}</td>
                            <td style={{ fontSize: '0.8rem' }}>
                              {new Date(s.start_time).toLocaleString()} - {new Date(s.end_time).toLocaleTimeString()}
                            </td>
                            <td>
                              {s.meeting_link || s.meeting_link_2 ? (
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  {s.meeting_link && <a href={s.meeting_link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'underline', fontSize: '0.8rem' }}>{s.meeting_link_2 ? '1st Half' : 'Join Class'}</a>}
                                  {s.meeting_link_2 && <a href={s.meeting_link_2} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color)', textDecoration: 'underline', fontSize: '0.8rem' }}>2nd Half</a>}
                                </div>
                              ) : <span style={{ color: '#cbd5e0' }}>None</span>}
                            </td>
                            <td><button className="btn-action delete" style={{ padding: '0.2rem 0.4rem' }} onClick={() => handleDeleteSchedule(s.id)}><Trash2 size={12} /></button></td>
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

        {/* Tab 7: Contact Messages */}
        {activeTab === 'inquiries' && (
          <div>

            <div className="dashboard-card">
              <h3><Mail size={18} color="var(--primary-color)" /> Contact Inquiries</h3>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>No customer messages.</div>
              ) : (
                <div className="table-container">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Sender</th>
                        <th>Subject</th>
                        <th>Contact Details</th>
                        <th>Message Body</th>
                        <th>Received At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {messages.map((m) => (
                        <tr key={m.id}>
                          <td style={{ fontWeight: 'bold' }}>{m.name}</td>
                          <td style={{ fontWeight: '600' }}>{m.subject || 'No Subject'}</td>
                          <td style={{ fontSize: '0.8rem' }}>
                            <div>{m.email}</div>
                            <div>{m.phone || 'No Phone'}</div>
                          </td>
                          <td style={{ fontSize: '0.85rem', maxWidth: '350px' }}>{m.message}</td>
                          <td style={{ fontSize: '0.8rem' }}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chat Monitor Tab */}
        {activeTab === 'messages' && (
          <AdminInbox
            user={user}
            adminIds={adminIds}
            students={students}
            messages={allChatMessages}
            setMessages={setAllChatMessages}
          />
        )}

        {activeTab === 'chatmonitor' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', height: '720px' }}>

              {/* Left: Filters + Conversation List */}
              <div className="dashboard-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', marginBottom: 0 }}>
                {/* Header */}
                <div style={{ padding: '1rem 1.25rem', background: 'var(--primary-color)', color: 'white' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MessageSquare size={16} /> All Conversations</h3>
                  <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.2rem' }}>{allChatMessages.length} total messages</div>
                </div>

                {/* Filters */}
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #edf2f7', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <select
                    value={chatMonitorTutor}
                    onChange={(e) => { setChatMonitorTutor(e.target.value); setChatMonitorStudent(''); }}
                    style={{ padding: '0.5rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.82rem', width: '100%' }}
                  >
                    <option value="">All Tutors</option>
                    {tutors.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                  <select
                    value={chatMonitorStudent}
                    onChange={(e) => setChatMonitorStudent(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.82rem', width: '100%' }}
                  >
                    <option value="">All Students</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>

                {/* Unique pairs list */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {(() => {
                    // Build unique sender-receiver pairs
                    const pairs = [];
                    const seen = new Set();
                    allChatMessages.forEach(m => {
                      const tutorParticipant = tutors.find(t => isOneOf(m.sender_id, personIds(t)) || isOneOf(m.receiver_id, personIds(t)));
                      const studentParticipant = students.find(s => isOneOf(m.sender_id, personIds(s)) || isOneOf(m.receiver_id, personIds(s)));
                      if (!tutorParticipant || !studentParticipant) return;
                      const key = [tutorParticipant.id, studentParticipant.id].sort().join('-');
                      if (!seen.has(key)) {
                        seen.add(key);
                        pairs.push({ tutor: tutorParticipant, student: studentParticipant, key });
                      }
                    });

                    const filtered = pairs.filter(p =>
                      (!chatMonitorTutor || p.tutor.id === chatMonitorTutor) &&
                      (!chatMonitorStudent || (p.student.id === chatMonitorStudent || p.student.profile_id === chatMonitorStudent))
                    );

                    if (filtered.length === 0) {
                      return <div style={{ padding: '2rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.85rem' }}>No conversations found.</div>;
                    }

                    return filtered.map(pair => {
                      const thread = allChatMessages.filter(m =>
                        inThread(m, personIds(pair.tutor), personIds(pair.student))
                      );
                      const lastMsg = thread[thread.length - 1];
                      const isSelected = chatMonitorTutor === pair.tutor.id && chatMonitorStudent === (pair.student.profile_id || pair.student.id);
                      return (
                        <div
                          key={pair.key}
                          onClick={() => { setChatMonitorTutor(pair.tutor.id); setChatMonitorStudent(pair.student.profile_id || pair.student.id); }}
                          style={{
                            padding: '0.85rem 1.1rem',
                            borderBottom: '1px solid #f0f4f8',
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(15,44,89,0.06)' : 'white',
                            borderLeft: isSelected ? '3px solid var(--primary-color)' : '3px solid transparent',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--primary-color)' }}>{pair.student.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#718096' }}>↔ {pair.tutor.full_name}</div>
                          {lastMsg && <div style={{ fontSize: '0.73rem', color: '#a0aec0', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastMsg.message_text}</div>}
                          <div style={{ fontSize: '0.68rem', color: '#cbd5e0', marginTop: '2px' }}>{thread.length} message{thread.length !== 1 ? 's' : ''}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Right: Read-only thread viewer */}
              {(chatMonitorTutor && chatMonitorStudent) ? (() => {
                const activeTutor = tutors.find(t => t.id === chatMonitorTutor);
                const tutorIdSet = personIds(activeTutor, chatMonitorTutor);
                const studentIdSet = personIds(students.find(s => (s.profile_id || s.id) === chatMonitorStudent || s.id === chatMonitorStudent), chatMonitorStudent);
                const activeStudent = students.find(s => (s.profile_id || s.id) === chatMonitorStudent || s.id === chatMonitorStudent);
                const thread = allChatMessages.filter(m =>
                  inThread(m, tutorIdSet, studentIdSet)
                );
                return (
                  <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', marginBottom: 0 }}>
                    {/* Thread header */}
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #edf2f7', background: '#f7fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', color: 'var(--primary-color)', fontSize: '0.95rem' }}>
                          {activeStudent?.full_name} ↔ {activeTutor?.full_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                          {thread.length} message{thread.length !== 1 ? 's' : ''} · Read-only monitor view
                        </div>
                      </div>
                      <div style={{ padding: '0.3rem 0.7rem', background: 'rgba(255, 165, 0, 0.12)', border: '1px solid rgba(255,165,0,0.3)', borderRadius: '6px', fontSize: '0.72rem', color: '#b7791f', fontWeight: '600' }}>
                        👁 Admin Monitor
                      </div>
                    </div>

                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' }}>
                      {thread.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#a0aec0', padding: '3rem', fontSize: '0.9rem' }}>
                          <MessageSquare size={32} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                          <p>No messages in this conversation yet.</p>
                        </div>
                      ) : (
                        thread.map(m => {
                          const isTutor = isOneOf(m.sender_id, tutorIdSet);
                          const senderLabel = isTutor ? `Tutor: ${activeTutor?.full_name}` : `Student: ${activeStudent?.full_name}`;
                          return (
                            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isTutor ? 'flex-end' : 'flex-start' }}>
                              <div style={{ fontSize: '0.7rem', color: '#a0aec0', marginBottom: '2px' }}>{senderLabel}</div>
                              <div style={{
                                background: isTutor ? 'var(--primary-color)' : '#edf2f7',
                                color: isTutor ? 'white' : 'var(--text-dark)',
                                padding: '0.7rem 1rem',
                                borderRadius: isTutor ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                maxWidth: '70%',
                                fontSize: '0.88rem',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                                lineHeight: '1.45'
                              }}>
                                <div>{m.message_text}</div>
                                <div style={{ fontSize: '0.65rem', opacity: 0.65, textAlign: 'right', marginTop: '4px' }}>
                                  {new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Admin notice footer */}
                    <div style={{ borderTop: '1px solid #edf2f7', padding: '0.75rem 1.5rem', background: '#fffbeb', fontSize: '0.78rem', color: '#b7791f', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      🔒 Admins can view all conversations in read-only mode. Only tutors and students can send messages.
                    </div>
                  </div>
                );
              })() : (
                <div className="dashboard-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', color: '#a0aec0', marginBottom: 0 }}>
                  <MessageSquare size={48} style={{ opacity: 0.2 }} />
                  <p style={{ fontSize: '1rem', fontWeight: '500' }}>Select a conversation to monitor</p>
                  <p style={{ fontSize: '0.85rem', textAlign: 'center', maxWidth: '280px' }}>Use filters above to narrow by tutor or student, then click a conversation to view it.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Add Tutor Modal Overlay */}
      {showTutorModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !addingTutor) setShowTutorModal(false); }}>
          <div className="modal-content tf-modal" role="dialog" aria-modal="true" aria-labelledby="tf-title">
            <div className="tf-header">
              <div className="tf-header-icon"><UserPlus size={22} /></div>
              <div className="tf-header-text">
                <h3 id="tf-title">Add a new tutor</h3>
                <p>Set up their login and the profile students will see.</p>
              </div>
              <button type="button" className="tf-close" onClick={() => setShowTutorModal(false)} disabled={addingTutor} aria-label="Close"><X size={18} /></button>
            </div>

            {/* autoComplete="off" + new-password stop the browser autofilling the admin's own login here */}
            <form onSubmit={handleAddTutorSubmit} autoComplete="off" className="tf-form">
              <div className="tf-body">
                <div className="tf-section">
                  <div className="tf-section-head">
                    <span className="tf-step">1</span>
                    <div>
                      <h4>Login details</h4>
                      <p>Share these with the tutor so they can sign in.</p>
                    </div>
                  </div>
                  <div className="tf-grid">
                    <div className="tf-field">
                      <label htmlFor="nt-email">Email address <span className="tf-req">*</span></label>
                      <div className="tf-control">
                        <Mail size={16} className="tf-icon" />
                        <input id="nt-email" name="new-tutor-email" type="email" autoComplete="off" value={newTutor.email} onChange={(e) => setNewTutor(prev => ({ ...prev, email: e.target.value }))} placeholder="tutor@example.com" required />
                      </div>
                    </div>
                    <div className="tf-field">
                      <div className="tf-label-row">
                        <label htmlFor="nt-password">Temporary password <span className="tf-req">*</span></label>
                        <button type="button" className="tf-text-btn" onClick={() => { setNewTutor(prev => ({ ...prev, password: generatePassword() })); setShowTutorPassword(true); }}>
                          <RefreshCw size={12} /> Generate
                        </button>
                      </div>
                      <div className="tf-control">
                        <Lock size={16} className="tf-icon" />
                        <input id="nt-password" name="new-tutor-password" type={showTutorPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={newTutor.password} onChange={(e) => setNewTutor(prev => ({ ...prev, password: e.target.value }))} placeholder="Min. 8 characters" required />
                        <button type="button" className="tf-eye" onClick={() => setShowTutorPassword(v => !v)} aria-label={showTutorPassword ? 'Hide password' : 'Show password'}>
                          {showTutorPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="tf-section">
                  <div className="tf-section-head">
                    <span className="tf-step">2</span>
                    <div>
                      <h4>Public profile</h4>
                      <p>Shown to students and on the website.</p>
                    </div>
                  </div>

                  <div className="tf-photo">
                    <div className="tf-avatar">
                      {newTutor.avatar_url
                        ? <img src={newTutor.avatar_url} alt="Tutor photo preview" />
                        : newTutor.full_name?.trim()
                          ? <span>{newTutor.full_name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('')}</span>
                          : <ImageIcon size={22} />}
                    </div>
                    <div className="tf-photo-text">
                      <strong>Profile photo</strong>
                      <span>Optional · JPG or PNG, square works best</span>
                      <div className="tf-photo-actions">
                        <label className={`tf-upload ${uploading ? 'is-busy' : ''}`}>
                          <Upload size={14} /> {uploading ? 'Uploading…' : newTutor.avatar_url ? 'Change' : 'Upload'}
                          <input type="file" accept="image/*" onChange={handleModalTutorAvatarChange} disabled={uploading} hidden />
                        </label>
                        {newTutor.avatar_url && (
                          <button type="button" className="tf-text-btn tf-danger" onClick={() => setNewTutor(prev => ({ ...prev, avatar_url: '' }))}>Remove</button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="tf-field">
                    <label htmlFor="nt-name">Full name <span className="tf-req">*</span></label>
                    <div className="tf-control">
                      <UserIcon size={16} className="tf-icon" />
                      <input id="nt-name" type="text" autoComplete="off" value={newTutor.full_name} onChange={(e) => setNewTutor(prev => ({ ...prev, full_name: e.target.value }))} placeholder="e.g. Chioma Okafor" required />
                    </div>
                  </div>

                  <div className="tf-grid">
                    <div className="tf-field">
                      <label htmlFor="nt-subject">Subjects <span className="tf-req">*</span></label>
                      <div className="tf-control">
                        <BookOpen size={16} className="tf-icon" />
                        <input id="nt-subject" type="text" value={newTutor.subject} onChange={(e) => setNewTutor(prev => ({ ...prev, subject: e.target.value }))} placeholder="e.g. Maths, English" required />
                      </div>
                    </div>
                    <div className="tf-field">
                      <label htmlFor="nt-exp">Experience <span className="tf-req">*</span></label>
                      <div className="tf-control">
                        <Award size={16} className="tf-icon" />
                        <input id="nt-exp" type="text" value={newTutor.experience} onChange={(e) => setNewTutor(prev => ({ ...prev, experience: e.target.value }))} placeholder="e.g. B.Sc Chemistry, 5 yrs" required />
                      </div>
                    </div>
                  </div>

                  <div className="tf-field">
                    <label>Rating</label>
                    <div className="tf-stars" role="radiogroup" aria-label="Rating">
                      {[1, 2, 3, 4, 5].map(n => {
                        const filled = n <= Math.round(parseFloat(newTutor.rating) || 0);
                        return (
                          <button key={n} type="button" role="radio" aria-checked={Math.round(parseFloat(newTutor.rating) || 0) === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                            className={`tf-star ${filled ? 'is-on' : ''}`}
                            onClick={() => setNewTutor(prev => ({ ...prev, rating: n.toFixed(1) }))}>
                            <Star size={22} fill={filled ? 'currentColor' : 'none'} />
                          </button>
                        );
                      })}
                      <span className="tf-star-value">{(parseFloat(newTutor.rating) || 0).toFixed(1)}</span>
                    </div>
                  </div>

                  <div className="tf-field">
                    <div className="tf-label-row">
                      <label htmlFor="nt-bio">Short bio</label>
                      <span className="tf-count">{(newTutor.bio || '').length}/500</span>
                    </div>
                    <textarea id="nt-bio" className="tf-textarea" value={newTutor.bio} onChange={(e) => setNewTutor(prev => ({ ...prev, bio: e.target.value }))} placeholder="Teaching style, background and what they help students with." rows={4} maxLength={500}></textarea>
                  </div>
                </div>
              </div>

              <div className="tf-footer">
                <button type="button" className="tf-btn tf-btn-ghost" onClick={() => setShowTutorModal(false)} disabled={addingTutor}>Cancel</button>
                <button type="submit" className="tf-btn tf-btn-primary" disabled={addingTutor || uploading}>
                  <UserPlus size={16} /> {addingTutor ? 'Creating account…' : 'Add tutor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Student Modal Overlay */}
      {showStudentModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <button className="modal-close" onClick={() => setShowStudentModal(false)}><X size={20} /></button>
            <h3 className="modal-title">Register New Student Account</h3>
            <form onSubmit={handleAddStudentSubmit} autoComplete="off">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Login Email *</label>
                  <input type="email" value={newStudent.email} onChange={(e) => setNewStudent(prev => ({ ...prev, email: e.target.value }))} placeholder="student@example.com" autoComplete="off" name="new-student-email" required />
                </div>
                <div className="form-group">
                  <label>Login Password *</label>
                  <input type="password" value={newStudent.password} onChange={(e) => setNewStudent(prev => ({ ...prev, password: e.target.value }))} placeholder="Create secure password" autoComplete="new-password" name="new-student-password" required />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Student Full Name *</label>
                  <input type="text" value={newStudent.full_name} onChange={(e) => setNewStudent(prev => ({ ...prev, full_name: e.target.value }))} placeholder="e.g. Tobi Coker" required />
                </div>
                <div className="form-group">
                  <label>Contact Phone *</label>
                  <input type="text" value={newStudent.phone} onChange={(e) => setNewStudent(prev => ({ ...prev, phone: e.target.value }))} placeholder="e.g. 08012345678" required />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Date of Birth *</label>
                  <input type="date" value={newStudent.date_of_birth} onChange={(e) => setNewStudent(prev => ({ ...prev, date_of_birth: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Gender *</label>
                  <select value={newStudent.gender} onChange={(e) => setNewStudent(prev => ({ ...prev, gender: e.target.value }))} style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0' }}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Grade Level *</label>
                <input type="text" value={newStudent.grade_level} onChange={(e) => setNewStudent(prev => ({ ...prev, grade_level: e.target.value }))} placeholder="e.g. Grade 5" required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Program Focus *</label>
                  <select value={newStudent.program} onChange={(e) => setNewStudent(prev => ({ ...prev, program: e.target.value }))} style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0' }}>
                    <option value="regular">Regular Academy</option>
                    <option value="tutoring">One-on-One Tutoring</option>
                    <option value="remedial">Remedial Classes</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Preferred Schedule *</label>
                  <select value={newStudent.schedule} onChange={(e) => setNewStudent(prev => ({ ...prev, schedule: e.target.value }))} style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0' }}>
                    <option value="morning">Morning Shift (9am - 12pm)</option>
                    <option value="afternoon">Afternoon Shift (1pm - 4pm)</option>
                    <option value="weekend">Weekend Shift (10am - 2pm)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={newStudent.start_date} onChange={(e) => setNewStudent(prev => ({ ...prev, start_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Special Needs / Health Notes</label>
                  <input type="text" value={newStudent.special_needs} onChange={(e) => setNewStudent(prev => ({ ...prev, special_needs: e.target.value }))} placeholder="e.g. dyslexic, asthma notes" />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Student Avatar Photo (Optional)</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <input type="file" accept="image/*" onChange={handleModalStudentAvatarChange} disabled={uploading} style={{ flex: '1', border: 'none', background: 'transparent', padding: '0.5rem 0' }} />
                  <input type="text" value={newStudent.avatar_url || ''} onChange={(e) => setNewStudent(prev => ({ ...prev, avatar_url: e.target.value }))} placeholder="Avatar image URL (Auto-filled on upload)" style={{ flex: '2' }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => setShowStudentModal(false)}>Cancel</button>
                <button type="submit" className="btn-submit">Register Student</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {feesStudent && <ParentFeesModal student={feesStudent} onClose={() => setFeesStudent(null)} />}

      {/* Student Account Activation Modal */}
      {showActivationModal && studentToActivate && (
        <div className="modal-overlay">
          <div className="modal-content animate-slide-in" style={{ maxWidth: '420px', padding: '2rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #edf2f7', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '1.25rem' }}>Activate Student Login</h3>
              <button onClick={() => { setShowActivationModal(false); setStudentToActivate(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a0aec0' }} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleActivateStudentSubmit}>
              <div style={{ background: '#f7fafc', padding: '1rem', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#4a5568' }}>
                <p style={{ margin: '0 0 0.4rem 0' }}><strong>Student Name:</strong> {studentToActivate.full_name}</p>
                <p style={{ margin: 0 }}><strong>Email/Login Username:</strong> {studentToActivate.email}</p>
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Set Login Password *</label>
                <input 
                  type="password" 
                  value={activationPassword} 
                  onChange={(e) => setActivationPassword(e.target.value)} 
                  placeholder="Min 6 characters..." 
                  required 
                  minLength={6}
                  style={{ padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => { setShowActivationModal(false); setStudentToActivate(null); }}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={activating}>
                  {activating ? 'Activating...' : 'Activate Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Student Profile Modal */}
      {showEditStudentModal && editingStudent && (
        <div className="modal-overlay">
          <div className="modal-content animate-slide-in" style={{ maxWidth: '600px', padding: '2rem', borderRadius: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #edf2f7', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '1.25rem' }}>Edit Student Profile</h3>
              <button onClick={() => { setShowEditStudentModal(false); setEditingStudent(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a0aec0' }} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEditStudentSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Student Email Address *</label>
                  <input 
                    type="email" 
                    value={editingStudent.email || ''} 
                    onChange={(e) => setEditingStudent(prev => ({ ...prev, email: e.target.value }))} 
                    required 
                    readOnly={editingStudent.is_active}
                    style={{ 
                      padding: '0.75rem', 
                      borderRadius: '10px', 
                      border: '2px solid #e2e8f0', 
                      width: '100%',
                      background: editingStudent.is_active ? '#f7fafc' : 'white',
                      cursor: editingStudent.is_active ? 'not-allowed' : 'text'
                    }} 
                  />
                  {editingStudent.is_active ? (
                    <span style={{ fontSize: '0.7rem', color: '#a0aec0' }}>This is the student's login email and can't be changed here.</span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: '#a0aec0' }}>No login yet. Changes are saved, and this email is used if you activate the account.</span>
                  )}
                </div>
                
                {!editingStudent.is_active ? (
                  <div className="form-group">
                    <label>Set Login Password (Activate Account)</label>
                    <input 
                      type="password" 
                      value={studentEditPassword} 
                      onChange={(e) => setStudentEditPassword(e.target.value)} 
                      placeholder="Min 6 characters to activate..." 
                      style={{ padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }} 
                    />
                  </div>
                ) : (
                  <div className="form-group">
                    <label>Update Login Password (Leave blank to keep current)</label>
                    <input 
                      type="password" 
                      value={studentEditPassword} 
                      onChange={(e) => setStudentEditPassword(e.target.value)} 
                      placeholder="Enter new password to reset..." 
                      style={{ padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }} 
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Student's Full Name *</label>
                  <input type="text" value={editingStudent.full_name || ''} onChange={(e) => setEditingStudent(prev => ({ ...prev, full_name: e.target.value }))} required style={{ padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }} />
                </div>
                <div className="form-group">
                  <label>Contact Phone *</label>
                  <input type="text" value={editingStudent.phone || ''} onChange={(e) => setEditingStudent(prev => ({ ...prev, phone: e.target.value }))} required style={{ padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }} />
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Date of Birth (Admin Only) *</label>
                  <input type="date" value={editingStudent.date_of_birth || ''} onChange={(e) => setEditingStudent(prev => ({ ...prev, date_of_birth: e.target.value }))} required style={{ padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }} />
                </div>
                <div className="form-group">
                  <label>Gender *</label>
                  <select value={editingStudent.gender || 'male'} onChange={(e) => setEditingStudent(prev => ({ ...prev, gender: e.target.value }))} style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Registration Status *</label>
                <select value={editingStudent.status || 'pending'} onChange={(e) => setEditingStudent(prev => ({ ...prev, status: e.target.value }))} style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                  <option value="pending">Pending Review (Public Lead)</option>
                  <option value="approved">Approved / Enrolled Student</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Grade Level *</label>
                <input type="text" value={editingStudent.grade_level || ''} onChange={(e) => setEditingStudent(prev => ({ ...prev, grade_level: e.target.value }))} required style={{ padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Program Focus *</label>
                  <select value={editingStudent.program || 'regular'} onChange={(e) => setEditingStudent(prev => ({ ...prev, program: e.target.value }))} style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }}>
                    <option value="regular">Regular Academy</option>
                    <option value="tutoring">One-on-One Tutoring</option>
                    <option value="remedial">Remedial Classes</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Preferred Schedule *</label>
                  <select value={editingStudent.schedule || 'morning'} onChange={(e) => setEditingStudent(prev => ({ ...prev, schedule: e.target.value }))} style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }}>
                    <option value="morning">Morning Shift (9am - 12pm)</option>
                    <option value="afternoon">Afternoon Shift (1pm - 4pm)</option>
                    <option value="weekend">Weekend Shift (10am - 2pm)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={editingStudent.start_date || ''} onChange={(e) => setEditingStudent(prev => ({ ...prev, start_date: e.target.value }))} style={{ padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }} />
                </div>
                <div className="form-group">
                  <label>Special Needs / Health Notes</label>
                  <input type="text" value={editingStudent.special_needs || ''} onChange={(e) => setEditingStudent(prev => ({ ...prev, special_needs: e.target.value }))} style={{ padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%' }} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Student Avatar Photo</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <input type="file" accept="image/*" onChange={handleEditModalStudentAvatarChange} disabled={uploading} style={{ flex: '1', border: 'none', background: 'transparent', padding: '0.5rem 0' }} />
                  <input type="text" value={editingStudent.avatar_url || ''} onChange={(e) => setEditingStudent(prev => ({ ...prev, avatar_url: e.target.value }))} placeholder="Avatar image URL" style={{ flex: '2', padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0' }} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Additional Comments / Public Form Details</label>
                <textarea 
                  value={editingStudent.additional_comments || ''} 
                  onChange={(e) => setEditingStudent(prev => ({ ...prev, additional_comments: e.target.value }))} 
                  rows={4}
                  placeholder="Enter comments or notes..."
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '2px solid #e2e8f0', fontFamily: 'inherit', fontSize: '0.9rem' }}
                ></textarea>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => { setShowEditStudentModal(false); setEditingStudent(null); }}>Cancel</button>
                <button type="submit" className="btn-submit">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Tutor Modal Overlay */}
      {showEditTutorModal && editingTutor && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => { setShowEditTutorModal(false); setEditingTutor(null); }}><X size={20} /></button>
            <h3 className="modal-title">Edit Instructor Profile</h3>
            <form onSubmit={handleEditTutorSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Login Email (Read-Only)</label>
                  {(() => {
                    const loginEmail = editingTutor.email || editingTutor.profiles?.email || editingTutor.profile?.email || '';
                    return (
                      <>
                        <input
                          type="email"
                          value={loginEmail}
                          readOnly
                          placeholder="Not stored on the tutor record"
                          style={{ background: '#f7fafc', cursor: 'not-allowed' }}
                        />
                        {!loginEmail && (
                          <span style={{ fontSize: '0.7rem', color: '#a0aec0' }}>
                            The login email isn't stored on the tutor record and can't be changed here.
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="form-group">
                  <label>Update Password (Optional)</label>
                  <input type="password" value={tutorEditPassword} onChange={(e) => setTutorEditPassword(e.target.value)} placeholder="Leave blank to keep current" />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Instructor Name *</label>
                <input type="text" value={editingTutor.full_name} onChange={(e) => setEditingTutor(prev => ({ ...prev, full_name: e.target.value }))} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Subject Focus *</label>
                  <input type="text" value={editingTutor.subject} onChange={(e) => setEditingTutor(prev => ({ ...prev, subject: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Experience / Credentials *</label>
                  <input type="text" value={editingTutor.experience} onChange={(e) => setEditingTutor(prev => ({ ...prev, experience: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Rating (1.0 - 5.0) *</label>
                  <input type="number" step="0.1" min="1.0" max="5.0" value={editingTutor.rating} onChange={(e) => setEditingTutor(prev => ({ ...prev, rating: e.target.value }))} required />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Instructor Avatar Photo</label>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <input type="file" accept="image/*" onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      const publicUrl = await uploadAvatar('edit_tutor_' + Date.now(), file);
                      setEditingTutor(prev => ({ ...prev, avatar_url: publicUrl }));
                    } catch (err) {
                      alert('Failed to upload picture: ' + err.message);
                    } finally {
                      setUploading(false);
                    }
                  }} disabled={uploading} style={{ flex: '1', border: 'none', background: 'transparent', padding: '0.5rem 0' }} />
                  <input type="text" value={editingTutor.avatar_url || ''} onChange={(e) => setEditingTutor(prev => ({ ...prev, avatar_url: e.target.value }))} placeholder="Avatar URL" style={{ flex: '2' }} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Instructor Short Bio Details</label>
                <textarea value={editingTutor.bio || ''} onChange={(e) => setEditingTutor(prev => ({ ...prev, bio: e.target.value }))} rows={3}></textarea>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => { setShowEditTutorModal(false); setEditingTutor(null); }}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Course Modal Overlay */}
      {showEditCourseModal && editingCourse && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => { setShowEditCourseModal(false); setEditingCourse(null); }}><X size={20} /></button>
            <h3 className="modal-title">Edit Course Settings</h3>
            <form onSubmit={handleEditCourseSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Course Title *</label>
                <input type="text" value={editingCourse.title} onChange={(e) => setEditingCourse(prev => ({ ...prev, title: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Course Description</label>
                <RichTextArea value={editingCourse.description || ''} onChange={(v) => setEditingCourse(prev => ({ ...prev, description: v }))} rows={6} />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Course Image</label>
                <CourseImageField
                  value={editingCourse.image_url || ''}
                  onChange={(url) => setEditingCourse(prev => ({ ...prev, image_url: url }))}
                  onBusyChange={setCourseImgUploading}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Course Type *</label>
                <select value={editingCourse.course_type || 'regular'} onChange={(e) => setEditingCourse(prev => ({ ...prev, course_type: e.target.value }))} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                  <option value="regular">Regular Course (e.g. Class I-VI)</option>
                  <option value="special">Special Class (e.g. Programming, AI)</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Subject Category *</label>
                <select value={editingCourse.category || ''} onChange={(e) => setEditingCourse(prev => ({ ...prev, category: e.target.value }))} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                  <option value="">-- Choose Category --</option>
                  {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => { setShowEditCourseModal(false); setEditingCourse(null); }}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={courseImgUploading}>{courseImgUploading ? 'Uploading image…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Topic (Lesson) Modal Overlay */}
      {showEditTopicModal && editingTopic && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => { setShowEditTopicModal(false); setEditingTopic(null); }}><X size={20} /></button>
            <h3 className="modal-title">Edit Lesson Settings</h3>
            <form onSubmit={handleEditTopicSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Lesson Title *</label>
                <input type="text" value={editingTopic.title} onChange={(e) => setEditingTopic(prev => ({ ...prev, title: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Lesson Description Summary</label>
                <RichTextArea value={editingTopic.description || ''} onChange={(v) => setEditingTopic(prev => ({ ...prev, description: v }))} rows={6} />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Sort Order / Lesson Position *</label>
                <input type="number" value={editingTopic.sort_order} onChange={(e) => setEditingTopic(prev => ({ ...prev, sort_order: Number(e.target.value) }))} required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => { setShowEditTopicModal(false); setEditingTopic(null); }}>Cancel</button>
                <button type="submit" className="btn-submit">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Task Modal Overlay */}
      {showEditTaskModal && editingTask && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <button className="modal-close" onClick={() => { setShowEditTaskModal(false); setEditingTask(null); }}><X size={20} /></button>
            <h3 className="modal-title">Edit Homework / Quiz Settings</h3>
            <form onSubmit={handleEditTaskSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label>Task Type *</label>
                  <select value={editingTask.task_type} onChange={(e) => handleEditTaskTypeChange(e.target.value)} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                    <option value="assignment">Assignment</option>
                    <option value="quiz">Interactive Quiz</option>
                    <option value="true_false">True / False Question</option>
                    <option value="instruction">Instructional Text</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Max Points *</label>
                  <input type="number" min={1} value={editingTask.max_points ?? 100} onChange={(e) => setEditingTask(prev => ({ ...prev, max_points: e.target.value === '' ? '' : Number(e.target.value) }))} required />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Task Title *</label>
                <input type="text" value={editingTask.title} onChange={(e) => setEditingTask(prev => ({ ...prev, title: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Instructions Details</label>
                <textarea value={editingTask.description || ''} onChange={(e) => setEditingTask(prev => ({ ...prev, description: e.target.value }))} rows={3}></textarea>
              </div>

              {editingTask.task_type === 'true_false' && (
                <div style={{ background: '#f7fafc', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', borderLeft: '4px solid var(--accent-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>True / False Config</span>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Correct Answer *</label>
                    <select value={editQCorrect} onChange={(e) => setEditQCorrect(Number(e.target.value))} style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                      <option value={0}>True</option>
                      <option value={1}>False</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Inline Quiz Question Editor inside Task Modal */}
              {editingTask.task_type === 'quiz' && (
                <div style={{ background: '#f7fafc', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', borderLeft: '4px solid var(--accent-color)' }}>
                  <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '0.5rem', color: 'var(--primary-color)' }}>Interactive Questions List</span>
                  
                  {/* Add New Question Config */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.8rem', background: 'white', padding: '0.6rem', borderRadius: '8px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: '600' }}>Question Type</label>
                      <select value={editQType} onChange={(e) => { setEditQType(e.target.value); setEditQCorrect(0); }} style={{ padding: '0.25rem', fontSize: '0.75rem', width: '100%', borderRadius: '4px', border: '1px solid #cbd5e0' }}>
                        <option value="multiple">Multiple Choice (3 options)</option>
                        <option value="boolean">True / False</option>
                      </select>
                    </div>

                    <input type="text" value={editQText} onChange={(e) => setEditQText(e.target.value)} placeholder="New Question prompt..." style={{ padding: '0.4rem', fontSize: '0.8rem', marginTop: '0.3rem' }} />
                    
                    {editQType === 'multiple' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {editQOptions.map((opt, oIdx) => (
                          <input 
                            key={oIdx}
                            type="text" 
                            value={opt} 
                            onChange={(e) => {
                              const cpy = [...editQOptions];
                              cpy[oIdx] = e.target.value;
                              setEditQOptions(cpy);
                            }}
                            placeholder={`Choice option ${oIdx + 1}`}
                            style={{ padding: '0.3rem', fontSize: '0.75rem' }}
                          />
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: '0.3rem 0.5rem', background: '#f7fafc', borderRadius: '6px', fontSize: '0.72rem', color: '#4a5568', display: 'flex', gap: '1rem' }}>
                        <span>1. True</span>
                        <span>2. False</span>
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                      <select value={editQCorrect} onChange={(e) => setEditQCorrect(Number(e.target.value))} style={{ padding: '0.3rem', fontSize: '0.75rem' }}>
                        {editQType === 'multiple' ? (
                          <>
                            <option value={0}>Ans: Option 1</option>
                            <option value={1}>Ans: Option 2</option>
                            <option value={2}>Ans: Option 3</option>
                          </>
                        ) : (
                          <>
                            <option value={0}>Ans: True</option>
                            <option value={1}>Ans: False</option>
                          </>
                        )}
                      </select>
                      <button type="button" className="btn-action approve" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={handleAddEditQuizQuestion}>+ Add Q</button>
                    </div>
                  </div>

                  {/* List of current questions */}
                  {(!editingTask.quiz_questions || editingTask.quiz_questions.length === 0) ? (
                    <span style={{ fontSize: '0.8rem', color: '#a0aec0', fontStyle: 'italic' }}>No questions configured.</span>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '150px', overflowY: 'auto' }}>
                      {editingTask.quiz_questions.map((q, idx) => (
                        <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', items: 'center', background: 'white', padding: '0.4rem 0.6rem', borderRadius: '8px', fontSize: '0.75rem' }}>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '80%' }}>{idx + 1}. {q.question}</span>
                          <button type="button" onClick={() => setEditingTask(prev => ({ ...prev, quiz_questions: prev.quiz_questions.filter((_, i) => i !== idx) }))} style={{ border: 'none', background: 'none', color: '#e53e3e', cursor: 'pointer', fontWeight: 'bold' }}>Remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => { setShowEditTaskModal(false); setEditingTask(null); }}>Cancel</button>
                <button type="submit" className="btn-submit">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Enrollment Modal Overlay */}
      {showEditEnrollmentModal && editingEnrollment && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <button className="modal-close" onClick={() => { setShowEditEnrollmentModal(false); setEditingEnrollment(null); }}><X size={20} /></button>
            <h3 className="modal-title">Edit Class Enrollment</h3>
            <form onSubmit={handleEditEnrollmentSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Student Profile</label>
                <input type="text" value={students.find(s => s.id === editingEnrollment.student_id)?.full_name || 'Student'} disabled style={{ background: '#f7fafc', cursor: 'not-allowed' }} />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Assigned Course *</label>
                <select value={editEnrollmentCourseId} onChange={(e) => setEditEnrollmentCourseId(e.target.value)} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Assigned Instructor *</label>
                <select value={editEnrollmentTutorId} onChange={(e) => setEditEnrollmentTutorId(e.target.value)} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                  {tutors.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => { setShowEditEnrollmentModal(false); setEditingEnrollment(null); }}>Cancel</button>
                <button type="submit" className="btn-submit">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Course Modal Overlay */}
      {showCreateCourseModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <button className="modal-close" onClick={() => setShowCreateCourseModal(false)}><X size={20} /></button>
            <h3 className="modal-title"><BookOpen size={18} /> Create New Course</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (courseImgUploading) return alert('Please wait for the image to finish uploading.');
              try {
                const saved = await saveCourse(newCourse);
                setCourses(prev => [...prev, saved]);
                setNewCourse({ title: '', description: '', course_type: 'regular', category: '', image_url: '' });
                setSelectedCourseId(saved.id);
                setShowCreateCourseModal(false);
                alert('Course created successfully!');
              } catch (err) {
                alert('Error creating course: ' + err.message);
              }
            }}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Course Title *</label>
                <input 
                  type="text" 
                  value={newCourse.title} 
                  onChange={(e) => setNewCourse(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Physics (Year 10)"
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Course Description</label>
                <RichTextArea
                  value={newCourse.description}
                  onChange={(v) => setNewCourse(prev => ({ ...prev, description: v }))}
                  placeholder="Short overview of the syllabus... Use the toolbar for bold text and bullet points."
                  rows={6}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Course Image</label>
                <CourseImageField
                  value={newCourse.image_url || ''}
                  onChange={(url) => setNewCourse(prev => ({ ...prev, image_url: url }))}
                  onBusyChange={setCourseImgUploading}
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Course Type *</label>
                <select
                  value={newCourse.course_type || 'regular'}
                  onChange={(e) => setNewCourse(prev => ({ ...prev, course_type: e.target.value }))}
                  required
                  style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}
                >
                  <option value="regular">Regular Course (e.g. Class I-VI)</option>
                  <option value="special">Special Class (e.g. Programming, AI)</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Subject Category *</label>
                <select
                  value={newCourse.category || ''}
                  onChange={(e) => setNewCourse(prev => ({ ...prev, category: e.target.value }))}
                  required
                  style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}
                >
                  <option value="">-- Choose Category --</option>
                  {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => setShowCreateCourseModal(false)}>Cancel</button>
                <button type="submit" className="btn-submit" disabled={courseImgUploading}>{courseImgUploading ? 'Uploading image…' : 'Create Course'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Tutor to Course Modal Overlay */}
      {showAssignTutorModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <button className="modal-close" onClick={() => setShowAssignTutorModal(false)}><X size={20} /></button>
            <h3 className="modal-title"><UserCheck size={18} /> Assign Tutor to Course</h3>
            <form onSubmit={handleMapTutor}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Select Course *</label>
                <select value={mapCourseId} onChange={(e) => setMapCourseId(e.target.value)} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                  <option value="">-- Choose Course --</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Select Instructor *</label>
                <select value={mapTutorId} onChange={(e) => setMapTutorId(e.target.value)} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                  <option value="">-- Choose Tutor --</option>
                  {tutors.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => setShowAssignTutorModal(false)}>Cancel</button>
                <button type="submit" className="btn-submit">Assign Tutor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enroll Student Modal Overlay */}
      {showEnrollStudentModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <button className="modal-close" onClick={() => setShowEnrollStudentModal(false)}><X size={20} /></button>
            <h3 className="modal-title"><BookOpenCheck size={18} /> Enroll Student in Course</h3>
            <form onSubmit={handleEnrollStudent}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Select Student *</label>
                <select value={enrollStudentId} onChange={(e) => setEnrollStudentId(e.target.value)} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                  <option value="">-- Choose Student --</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Select Course *</label>
                <select value={enrollCourseId} onChange={(e) => {
                  setEnrollCourseId(e.target.value);
                  setEnrollTutorId(''); // Reset selected tutor
                }} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                  <option value="">-- Choose Course --</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Select Assigned Tutor *</label>
                <select value={enrollTutorId} onChange={(e) => setEnrollTutorId(e.target.value)} required style={{ padding: '0.8rem', borderRadius: '10px', border: '2px solid #e2e8f0', width: '100%', fontFamily: 'inherit' }}>
                  <option value="">-- Choose Instructor --</option>
                  {courseTutors.filter(ct => ct.course_id === enrollCourseId).map(ct => {
                    const t = tutors.find(tu => tu.id === ct.tutor_id);
                    return t ? <option key={t.id} value={t.id}>{t.full_name}</option> : null;
                  })}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => setShowEnrollStudentModal(false)}>Cancel</button>
                <button type="submit" className="btn-submit">Enroll Student</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Category Modal Overlay */}
      {showCreateCategoryModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <button className="modal-close" onClick={() => setShowCreateCategoryModal(false)}><X size={20} /></button>
            <h3 className="modal-title"><Layers size={18} /> Create New Category</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const saved = await saveCourseCategory(newCategory);
                setCategories(prev => [...prev, saved]);
                setNewCategory({ name: '', description: '' });
                setShowCreateCategoryModal(false);
                alert('Category created successfully!');
              } catch (err) {
                alert('Error creating category: ' + err.message);
              }
            }}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Category Name *</label>
                <input 
                  type="text" 
                  value={newCategory.name} 
                  onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Math, Coding & Tech"
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Description</label>
                <textarea 
                  value={newCategory.description} 
                  onChange={(e) => setNewCategory(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Short overview of the category subject..."
                  rows={3}
                ></textarea>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => setShowCreateCategoryModal(false)}>Cancel</button>
                <button type="submit" className="btn-submit">Create Category</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Modal Overlay */}
      {showEditCategoryModal && editingCategory && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <button className="modal-close" onClick={() => { setShowEditCategoryModal(false); setEditingCategory(null); }}><X size={20} /></button>
            <h3 className="modal-title"><Layers size={18} /> Edit Category</h3>
            <form onSubmit={handleSaveEditedCategory}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Category Name *</label>
                <input 
                  type="text" 
                  value={editingCategory.name} 
                  onChange={(e) => setEditingCategory(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Math, Coding & Tech"
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label>Description</label>
                <textarea 
                  value={editingCategory.description || ''} 
                  onChange={(e) => setEditingCategory(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Short overview of the category subject..."
                  rows={3}
                ></textarea>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button type="button" className="btn-prev" onClick={() => { setShowEditCategoryModal(false); setEditingCategory(null); }}>Cancel</button>
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
              {students.length === 0 && (
                <p style={{ padding: '0.5rem', color: '#94a3b8' }}>No students yet.</p>
              )}
              {students.map(s => (
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
