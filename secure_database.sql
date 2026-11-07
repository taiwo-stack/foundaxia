-- =============================================================
-- SECURE THE DATABASE (row-level security)            2026-11-07
--
-- Replaces enable_rls.sql + rls_followup.sql with one script that can be run
-- on the database as it is today (some tables already have RLS + "anyone can
-- read" rules; others have none).
--
-- Before this, anyone with the website's public key (it is in the page source)
-- could, without logging in, read every student's personal details, all chat
-- messages, grades, attendance, quiz answer keys, class links and user list.
--
-- After this:
--   logged out -> courses, categories, topics, course-tutor links, the public
--                 tutor directory (name/photo/bio/subject only); can submit a
--                 registration, booking or contact message
--   student    -> own record, enrolments, timetable, submissions, attendance,
--                 bookings (by email), announcements for their courses, their
--                 chats; tutor names; the admin account (for "FoundaXia Admin")
--   tutor      -> own record; students they teach and those students'
--                 enrolments, submissions, attendance; tasks/materials/
--                 schedules/live sessions for their courses; their chats
--   admin      -> everything
--   server     -> /api/* uses the service role and is not affected
--   Parent Area tables (parent_access, student_fees, fee_payments, parent_notes)
--   stay server-only (RLS on, no rules).
--
-- Safe to run more than once. Runs in ONE transaction: if anything doesn't
-- match, NOTHING is applied.
--
-- Run in Supabase -> SQL Editor (select ALL of this file with Ctrl+A, copy, paste, Run):
-- https://supabase.com/dashboard/project/wexqhlrhfostrpehknka/sql/new
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 0. Columns the rules and the app rely on (no-ops if present)
-- -------------------------------------------------------------
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS profile_id TEXT;
ALTER TABLE public.tutors   ADD COLUMN IF NOT EXISTS profile_id TEXT;
ALTER TABLE public.tasks    ADD COLUMN IF NOT EXISTS created_by TEXT;

-- -------------------------------------------------------------
-- 1. Helper functions (SECURITY DEFINER: they read roles/enrolments without
--    being subject to the rules that call them, which avoids recursion).
--    Ids are compared as text because the app mixes uuid and text ids.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id::text = auth.uid()::text AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.app_is_tutor() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id::text = auth.uid()::text AND role = 'tutor');
$$;

-- Every id that means "me": my login id plus my students/tutors row id.
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

-- Students a tutor teaches: assigned to them, enrolled in a course they teach, or on their schedule.
CREATE OR REPLACE FUNCTION public.app_tutor_student_ids() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT student_id::text FROM student_courses
   WHERE tutor_id::text IN (SELECT public.app_my_tutor_ids())
      OR course_id::text IN (SELECT course_id::text FROM course_tutors WHERE tutor_id::text IN (SELECT public.app_my_tutor_ids()))
  UNION SELECT student_id::text FROM schedules WHERE tutor_id::text IN (SELECT public.app_my_tutor_ids());
$$;

-- -------------------------------------------------------------
-- 2. Clean slate: remove every existing rule on the app's tables (including
--    the current "anyone can read" ones), so the set below is the whole truth.
-- -------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (
      'profiles','students','tutors','bookings','contact_messages','course_categories','courses',
      'topics','course_materials','course_tutors','student_courses','tasks','student_tasks',
      'schedules','attendance','course_announcements','chat_messages','live_sessions',
      'push_subscriptions','parent_access','student_fees','fee_payments','parent_notes')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- -------------------------------------------------------------
-- 3. Turn row-level security on everywhere
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
ALTER TABLE public.parent_access        ENABLE ROW LEVEL SECURITY;  -- server only
ALTER TABLE public.student_fees         ENABLE ROW LEVEL SECURITY;  -- server only
ALTER TABLE public.fee_payments         ENABLE ROW LEVEL SECURITY;  -- server only
ALTER TABLE public.parent_notes         ENABLE ROW LEVEL SECURITY;  -- server only

-- -------------------------------------------------------------
-- 4. Rules (admins get FOR ALL on each table; others add specific access)
-- -------------------------------------------------------------

-- profiles: your own; logged-in users can see the admin account(s) so students can
-- message "FoundaXia Admin"; only admins change anything (no self-promotion).
CREATE POLICY admin_all  ON public.profiles FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY own_read   ON public.profiles FOR SELECT USING (id::text = auth.uid()::text);
CREATE POLICY staff_read ON public.profiles FOR SELECT TO authenticated USING (role = 'admin');

-- students
CREATE POLICY admin_all       ON public.students FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY own_read        ON public.students FOR SELECT USING (id::text IN (SELECT public.app_my_student_ids()));
CREATE POLICY own_update      ON public.students FOR UPDATE USING (id::text IN (SELECT public.app_my_student_ids()))
                                                       WITH CHECK (id::text IN (SELECT public.app_my_student_ids()));
CREATE POLICY tutor_read      ON public.students FOR SELECT USING (id::text IN (SELECT public.app_tutor_student_ids()));
CREATE POLICY public_register ON public.students FOR INSERT WITH CHECK (status = 'pending');

-- A student editing their own profile can't approve themselves or re-point their record.
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

-- tutors: logged-in users read (names on timetables/chat); tutors edit their own.
-- Logged-out visitors use the public_tutors view below (no phone/email).
CREATE POLICY admin_all   ON public.tutors FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY authed_read ON public.tutors FOR SELECT TO authenticated USING (true);
CREATE POLICY own_update  ON public.tutors FOR UPDATE USING (id::text IN (SELECT public.app_my_tutor_ids()))
                                                WITH CHECK (id::text IN (SELECT public.app_my_tutor_ids()));

CREATE OR REPLACE VIEW public.public_tutors AS
  SELECT id, full_name, avatar_url, bio, experience, subject, rating FROM public.tutors;
ALTER VIEW public.public_tutors SET (security_invoker = false);  -- only these columns are ever exposed
GRANT SELECT ON public.public_tutors TO anon, authenticated;

-- bookings: anyone can book; tutors see/update theirs; students see/cancel theirs (by login email).
CREATE POLICY admin_all      ON public.bookings FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY public_insert  ON public.bookings FOR INSERT WITH CHECK (coalesce(status, 'pending') = 'pending');
CREATE POLICY tutor_read     ON public.bookings FOR SELECT USING (tutor_id::text IN (SELECT public.app_my_tutor_ids()));
CREATE POLICY tutor_update   ON public.bookings FOR UPDATE USING (tutor_id::text IN (SELECT public.app_my_tutor_ids()));
CREATE POLICY student_read   ON public.bookings FOR SELECT USING (lower(email) = lower(auth.jwt() ->> 'email'));
CREATE POLICY student_update ON public.bookings FOR UPDATE USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- contact_messages: anyone can send; only admins read.
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

-- student_courses (enrolments)
CREATE POLICY admin_all    ON public.student_courses FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY student_read ON public.student_courses FOR SELECT USING (student_id::text IN (SELECT public.app_my_student_ids()));
CREATE POLICY tutor_read   ON public.student_courses FOR SELECT USING (student_id::text IN (SELECT public.app_tutor_student_ids()));

-- tasks: tutors (courses they teach) and admins only. Students get their tasks from
-- /api/quiz, which strips the answer keys and grades on the server.
CREATE POLICY admin_all   ON public.tasks FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
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

-- chat_messages: only the two people in the conversation (and admins); send only as
-- yourself; only mark messages addressed to you as read.
CREATE POLICY admin_all          ON public.chat_messages FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY participant_read   ON public.chat_messages FOR SELECT
  USING (sender_id::text IN (SELECT public.app_my_ids()) OR receiver_id::text IN (SELECT public.app_my_ids()));
CREATE POLICY send_as_self       ON public.chat_messages FOR INSERT WITH CHECK (sender_id::text IN (SELECT public.app_my_ids()));
CREATE POLICY receiver_mark_read ON public.chat_messages FOR UPDATE
  USING (receiver_id::text IN (SELECT public.app_my_ids()))
  WITH CHECK (receiver_id::text IN (SELECT public.app_my_ids()));

-- live_sessions: the tutor who started it manages it; invited students can see it.
CREATE POLICY admin_all    ON public.live_sessions FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
CREATE POLICY host_all     ON public.live_sessions FOR ALL
  USING (tutor_id::text IN (SELECT public.app_my_ids()))
  WITH CHECK (tutor_id::text IN (SELECT public.app_my_ids()));
CREATE POLICY invitee_read ON public.live_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.app_my_student_ids() AS s(id) WHERE live_sessions.student_ids ? s.id));

-- push_subscriptions: each user manages only their own devices.
CREATE POLICY own_all ON public.push_subscriptions FOR ALL
  USING (user_id::text IN (SELECT public.app_my_ids()))
  WITH CHECK (user_id::text IN (SELECT public.app_my_ids()));

-- parent_access, student_fees, fee_payments, parent_notes: no rules on purpose
-- (only the server's /api/parent can touch them).

-- -------------------------------------------------------------
-- 5. File storage (materials + avatars buckets): public read, logged-in upload,
--    only admins overwrite/delete. Replaces "anyone can do anything".
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "Public full access to materials bucket"   ON storage.objects;
DROP POLICY IF EXISTS "Public full access to avatars bucket"     ON storage.objects;
DROP POLICY IF EXISTS "Public read materials/avatars"            ON storage.objects;
DROP POLICY IF EXISTS "Logged-in users upload materials/avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage materials/avatars"          ON storage.objects;

CREATE POLICY "Public read materials/avatars" ON storage.objects
  FOR SELECT USING (bucket_id IN ('materials', 'avatars'));
CREATE POLICY "Logged-in users upload materials/avatars" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('materials', 'avatars'));
CREATE POLICY "Admins manage materials/avatars" ON storage.objects
  FOR ALL TO authenticated USING (bucket_id IN ('materials', 'avatars') AND public.app_is_admin())
  WITH CHECK (bucket_id IN ('materials', 'avatars') AND public.app_is_admin());

COMMIT;

-- Emergency undo (only if the app breaks): see secure_database_undo.sql
