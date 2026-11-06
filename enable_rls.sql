-- =============================================================
-- ENABLE ROW LEVEL SECURITY ON EVERY TABLE
--
-- Until now every table had RLS disabled and "access was controlled in
-- app code". But the browser talks to Supabase directly with the public
-- anon key (it is in the JS bundle), so anyone could, without logging in:
--   * read every student's personal/parent details, chats and grades
--   * edit/delete any row, or overwrite/delete any uploaded file
--   * set their own profiles.role = 'admin' and then use /api/admin-action
--     to reset any user's password.
-- This script makes Postgres enforce who can see and change what.
--
-- Who can do what after this runs:
--   admin    -> everything (as before)
--   tutor    -> their own tutor row, schedules, live sessions; students
--               enrolled in courses they teach (and those students'
--               enrollments, submissions, attendance); tasks/materials/
--               announcements for their courses; grading
--   student  -> their own student row, enrollments, schedules,
--               submissions, attendance, bookings (by email), tasks for
--               enrolled courses, live sessions they were invited to
--   anyone   -> read courses/categories/topics/tutor profiles (landing
--               page), submit a booking, contact message or pending
--               registration
--   chat     -> only the sender and receiver (and admins) can read a message
--   profiles -> users can read only their own; only admins can change roles
--
-- The whole script runs in one transaction: if any table/column name here
-- doesn't match your database, it errors and NOTHING is applied.
--
-- AFTER RUNNING, test each role: log in as an admin, a tutor and a
-- student and click through their dashboards; submit the landing-page
-- booking/contact/register forms while logged out. If something is
-- blocked that shouldn't be, roll back with the snippet at the bottom.
--
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/wexqhlrhfostrpehknka/sql/new
-- =============================================================

BEGIN;

-- The app links some legacy students/tutors rows to their login via profile_id.
-- Make sure that column exists (no-op if it already does) so the helpers below work.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS profile_id TEXT;
ALTER TABLE public.tutors   ADD COLUMN IF NOT EXISTS profile_id TEXT;

-- -------------------------------------------------------------
-- 1. Helper functions
-- SECURITY DEFINER so they can look up roles/enrollments without being
-- subject to the very policies that call them (avoids infinite recursion).
-- Ids are compared as text because the app mixes uuid and text ids.
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id::text = auth.uid()::text AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.app_is_tutor() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id::text = auth.uid()::text AND role = 'tutor');
$$;

-- Every id that refers to "me": the auth uid plus my students/tutors row id
-- (legacy rows may have id <> auth uid and link via profile_id instead).
CREATE OR REPLACE FUNCTION public.app_my_ids() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid()::text WHERE auth.uid() IS NOT NULL
  UNION SELECT id::text FROM students WHERE auth.uid() IS NOT NULL AND (id::text = auth.uid()::text OR profile_id::text = auth.uid()::text)
  UNION SELECT id::text FROM tutors   WHERE auth.uid() IS NOT NULL AND (id::text = auth.uid()::text OR profile_id::text = auth.uid()::text);
$$;

CREATE OR REPLACE FUNCTION public.app_my_student_ids() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id::text FROM students WHERE auth.uid() IS NOT NULL AND (id::text = auth.uid()::text OR profile_id::text = auth.uid()::text);
$$;

CREATE OR REPLACE FUNCTION public.app_my_tutor_ids() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id::text FROM tutors WHERE auth.uid() IS NOT NULL AND (id::text = auth.uid()::text OR profile_id::text = auth.uid()::text);
$$;

-- Courses I'm enrolled in (student) or teach (tutor).
CREATE OR REPLACE FUNCTION public.app_my_course_ids() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT course_id::text FROM student_courses WHERE student_id::text IN (SELECT public.app_my_student_ids())
  UNION SELECT course_id::text FROM student_courses WHERE tutor_id::text IN (SELECT public.app_my_tutor_ids())
  UNION SELECT course_id::text FROM course_tutors   WHERE tutor_id::text IN (SELECT public.app_my_tutor_ids());
$$;

-- Students a tutor teaches: assigned to them, or enrolled in a course they teach,
-- or on one of their schedules.
CREATE OR REPLACE FUNCTION public.app_tutor_student_ids() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT student_id::text FROM student_courses
   WHERE tutor_id::text IN (SELECT public.app_my_tutor_ids())
      OR course_id::text IN (SELECT course_id::text FROM course_tutors WHERE tutor_id::text IN (SELECT public.app_my_tutor_ids()))
  UNION SELECT student_id::text FROM schedules WHERE tutor_id::text IN (SELECT public.app_my_tutor_ids());
$$;

-- -------------------------------------------------------------
-- 2. Turn RLS on everywhere
-- -------------------------------------------------------------
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutors               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_materials     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_tutors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_courses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions   ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------
-- 3. Policies
-- (Admins get a FOR ALL policy on each table; other policies add access.)
-- -------------------------------------------------------------

-- profiles: read your own; only admins write (blocks self-promotion to admin).
-- Accounts are created by /api/admin-action with the service role, which bypasses RLS.
CREATE POLICY admin_all ON public.profiles FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY own_read  ON public.profiles FOR SELECT USING (id::text = auth.uid()::text);

-- students
CREATE POLICY admin_all     ON public.students FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY own_read      ON public.students FOR SELECT USING (id::text IN (SELECT public.app_my_student_ids()));
CREATE POLICY own_update    ON public.students FOR UPDATE USING (id::text IN (SELECT public.app_my_student_ids()))
                                                     WITH CHECK (id::text IN (SELECT public.app_my_student_ids()));
CREATE POLICY tutor_read    ON public.students FOR SELECT USING (id::text IN (SELECT public.app_tutor_student_ids()));
-- Landing-page registration: anyone may create a PENDING student record.
CREATE POLICY public_register ON public.students FOR INSERT WITH CHECK (status = 'pending');

-- Students editing their own profile must not be able to approve themselves or
-- re-point their record at another account.
CREATE OR REPLACE FUNCTION public.app_students_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.app_is_admin() THEN
    NEW.id := OLD.id;
    NEW.status := OLD.status;
    NEW.email := OLD.email;
    NEW.profile_id := OLD.profile_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS students_guard ON public.students;
CREATE TRIGGER students_guard BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.app_students_guard();

-- tutors: public profiles (shown on the landing page); tutors may edit their own.
CREATE POLICY admin_all   ON public.tutors FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY public_read ON public.tutors FOR SELECT USING (true);
CREATE POLICY own_update  ON public.tutors FOR UPDATE USING (id::text IN (SELECT public.app_my_tutor_ids()))
                                                WITH CHECK (id::text IN (SELECT public.app_my_tutor_ids()));

-- bookings: anyone can book; tutors see/update theirs; students see/cancel theirs (by email).
CREATE POLICY admin_all      ON public.bookings FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY public_insert  ON public.bookings FOR INSERT WITH CHECK (coalesce(status, 'pending') = 'pending');
CREATE POLICY tutor_rw       ON public.bookings FOR SELECT USING (tutor_id::text IN (SELECT public.app_my_tutor_ids()));
CREATE POLICY tutor_update   ON public.bookings FOR UPDATE USING (tutor_id::text IN (SELECT public.app_my_tutor_ids()));
CREATE POLICY student_read   ON public.bookings FOR SELECT USING (lower(email) = lower(auth.jwt() ->> 'email'));
CREATE POLICY student_update ON public.bookings FOR UPDATE USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- contact_messages: anyone can send, only admins read.
CREATE POLICY admin_all     ON public.contact_messages FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY public_insert ON public.contact_messages FOR INSERT WITH CHECK (true);

-- Catalogue: public read, admin write.
CREATE POLICY admin_all   ON public.course_categories FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY public_read ON public.course_categories FOR SELECT USING (true);
CREATE POLICY admin_all   ON public.courses FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY public_read ON public.courses FOR SELECT USING (true);
CREATE POLICY admin_all   ON public.topics FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY public_read ON public.topics FOR SELECT USING (true);
CREATE POLICY admin_all   ON public.course_tutors FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY public_read ON public.course_tutors FOR SELECT USING (true);

-- course_materials: logged-in users read; tutors manage materials for their courses.
CREATE POLICY admin_all    ON public.course_materials FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY authed_read  ON public.course_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY tutor_insert ON public.course_materials FOR INSERT WITH CHECK (public.app_is_tutor() AND course_id::text IN (SELECT public.app_my_course_ids()));
CREATE POLICY tutor_delete ON public.course_materials FOR DELETE USING (public.app_is_tutor() AND course_id::text IN (SELECT public.app_my_course_ids()));

-- student_courses (enrollments)
CREATE POLICY admin_all    ON public.student_courses FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY student_read ON public.student_courses FOR SELECT USING (student_id::text IN (SELECT public.app_my_student_ids()));
CREATE POLICY tutor_read   ON public.student_courses FOR SELECT USING (student_id::text IN (SELECT public.app_tutor_student_ids()));

-- tasks: students see tasks for enrolled courses; tutors manage tasks for courses they teach.
-- NOTE: students can still read quiz_questions (incl. the correct answers) - fixing
-- that needs server-side grading; see the review notes.
CREATE POLICY admin_all ON public.tasks FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY member_read ON public.tasks FOR SELECT USING (course_id::text IN (SELECT public.app_my_course_ids()));
CREATE POLICY tutor_write ON public.tasks FOR ALL
  USING (public.app_is_tutor() AND course_id::text IN (SELECT public.app_my_course_ids()))
  WITH CHECK (public.app_is_tutor() AND course_id::text IN (SELECT public.app_my_course_ids()));

-- student_tasks (submissions)
CREATE POLICY admin_all      ON public.student_tasks FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY student_read   ON public.student_tasks FOR SELECT USING (student_id::text IN (SELECT public.app_my_student_ids()));
CREATE POLICY student_submit ON public.student_tasks FOR INSERT WITH CHECK (student_id::text IN (SELECT public.app_my_student_ids()) AND grade IS NULL);
CREATE POLICY tutor_read     ON public.student_tasks FOR SELECT USING (student_id::text IN (SELECT public.app_tutor_student_ids()));
CREATE POLICY tutor_grade    ON public.student_tasks FOR UPDATE USING (student_id::text IN (SELECT public.app_tutor_student_ids()))
                                                          WITH CHECK (student_id::text IN (SELECT public.app_tutor_student_ids()));

-- schedules
CREATE POLICY admin_all    ON public.schedules FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY student_read ON public.schedules FOR SELECT USING (student_id::text IN (SELECT public.app_my_student_ids()));
CREATE POLICY tutor_all    ON public.schedules FOR ALL
  USING (tutor_id::text IN (SELECT public.app_my_tutor_ids()))
  WITH CHECK (tutor_id::text IN (SELECT public.app_my_tutor_ids()));

-- attendance
CREATE POLICY admin_all    ON public.attendance FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY student_read ON public.attendance FOR SELECT USING (student_id::text IN (SELECT public.app_my_student_ids()));
CREATE POLICY tutor_all    ON public.attendance FOR ALL
  USING (student_id::text IN (SELECT public.app_tutor_student_ids()))
  WITH CHECK (student_id::text IN (SELECT public.app_tutor_student_ids()));

-- course_announcements
CREATE POLICY admin_all   ON public.course_announcements FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY member_read ON public.course_announcements FOR SELECT USING (course_id::text IN (SELECT public.app_my_course_ids()));
CREATE POLICY tutor_write ON public.course_announcements FOR INSERT WITH CHECK (public.app_is_tutor() AND course_id::text IN (SELECT public.app_my_course_ids()));

-- chat_messages: only the two participants; you can only send as yourself and
-- only mark messages addressed to you as read.
CREATE POLICY admin_all        ON public.chat_messages FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY participant_read ON public.chat_messages FOR SELECT
  USING (sender_id::text IN (SELECT public.app_my_ids()) OR receiver_id::text IN (SELECT public.app_my_ids()));
CREATE POLICY send_as_self     ON public.chat_messages FOR INSERT WITH CHECK (sender_id::text IN (SELECT public.app_my_ids()));
CREATE POLICY receiver_mark_read ON public.chat_messages FOR UPDATE
  USING (receiver_id::text IN (SELECT public.app_my_ids()))
  WITH CHECK (receiver_id::text IN (SELECT public.app_my_ids()));

-- live_sessions: the tutor who started it manages it; invited students can see it.
CREATE POLICY admin_all     ON public.live_sessions FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY host_all      ON public.live_sessions FOR ALL
  USING (tutor_id::text IN (SELECT public.app_my_ids()))
  WITH CHECK (tutor_id::text IN (SELECT public.app_my_ids()));
CREATE POLICY invitee_read  ON public.live_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.app_my_student_ids() AS s(id) WHERE live_sessions.student_ids ? s.id));

-- push_subscriptions: each user manages only their own devices.
CREATE POLICY own_all ON public.push_subscriptions FOR ALL
  USING (user_id::text IN (SELECT public.app_my_ids()))
  WITH CHECK (user_id::text IN (SELECT public.app_my_ids()));

-- -------------------------------------------------------------
-- 4. Storage: replace "anyone can do anything" with
--    public read + logged-in upload. (Delete/overwrite: admins only.)
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "Public full access to materials bucket" ON storage.objects;
DROP POLICY IF EXISTS "Public full access to avatars bucket"   ON storage.objects;

CREATE POLICY "Public read materials/avatars" ON storage.objects
  FOR SELECT USING (bucket_id IN ('materials', 'avatars'));
CREATE POLICY "Logged-in users upload materials/avatars" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('materials', 'avatars'));
CREATE POLICY "Admins manage materials/avatars" ON storage.objects
  FOR ALL TO authenticated USING (bucket_id IN ('materials', 'avatars') AND public.app_is_admin())
  WITH CHECK (bucket_id IN ('materials', 'avatars') AND public.app_is_admin());

COMMIT;

-- =============================================================
-- EMERGENCY ROLLBACK (only if the app breaks after running the above).
-- Puts tables back to the old wide-open state; the policies stay defined
-- but inactive, so re-enabling later is just the ENABLE lines again.
-- =============================================================
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tutors DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.bookings DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.contact_messages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.course_categories DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.courses DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.topics DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.course_materials DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.course_tutors DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.student_courses DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.student_tasks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.schedules DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.attendance DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.course_announcements DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.chat_messages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.live_sessions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.push_subscriptions DISABLE ROW LEVEL SECURITY;
