-- =============================================================
-- EMERGENCY UNDO for secure_database.sql
-- Only run this if the app breaks after securing the database.
-- Re-opens the tables the way they were; the rules stay defined but inactive,
-- so re-securing later is just running secure_database.sql again.
-- Select all (Ctrl+A), copy, paste into Supabase -> SQL Editor, Run.
-- =============================================================
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutors DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_materials DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions DISABLE ROW LEVEL SECURITY;
-- (catalogue tables and Parent Area tables can stay secured either way)
