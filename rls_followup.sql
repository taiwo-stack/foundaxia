-- =============================================================
-- RLS FOLLOW-UP  (run AFTER enable_rls.sql, and after deploying the
-- matching app code - this branch)
--
-- 1. Quiz answer key: students no longer read the tasks table directly
--    (it contains quiz_questions[].correct). The app now loads a
--    student's tasks through /api/quiz, which strips the answers, and
--    grades submissions on the server.
-- 2. Tutor directory: logged-out visitors read only the public_tutors
--    view (name, photo, bio, subject, experience, rating) instead of the
--    whole tutors table.
-- 3. tasks.created_by: lets the tutor dashboard restrict editing/deleting
--    a task to the tutor who created it.
-- 4. Missing dates of birth / start dates are stored as NULL instead of
--    being faked as "today".
--
-- Runs in one transaction; if anything doesn't match, nothing is applied.
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/wexqhlrhfostrpehknka/sql/new
-- =============================================================

BEGIN;

-- 1. tasks: tutors (for courses they teach) and admins only.
DROP POLICY IF EXISTS member_read ON public.tasks;
DROP POLICY IF EXISTS tutor_read ON public.tasks;
CREATE POLICY tutor_read ON public.tasks FOR SELECT
  USING (public.app_is_tutor() AND course_id::text IN (SELECT public.app_my_course_ids()));

-- 2. Public tutor directory.
CREATE OR REPLACE VIEW public.public_tutors AS
  SELECT id, full_name, avatar_url, bio, experience, subject, rating
  FROM public.tutors;
-- The view runs with its owner's rights (security_invoker = false), so it can read
-- tutors despite RLS - but it only ever exposes the columns listed above.
ALTER VIEW public.public_tutors SET (security_invoker = false);
GRANT SELECT ON public.public_tutors TO anon, authenticated;

DROP POLICY IF EXISTS public_read ON public.tutors;
DROP POLICY IF EXISTS authed_read ON public.tutors;
CREATE POLICY authed_read ON public.tutors FOR SELECT TO authenticated USING (true);

-- 3. Task ownership.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by TEXT;

-- 4. Optional dates.
ALTER TABLE public.students ALTER COLUMN date_of_birth DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN start_date DROP NOT NULL;

-- 5. Optional gender and schedule. The homepage Quick Register form doesn't ask for
--    them (registration failed with "null value in column gender ... violates not-null
--    constraint"), and "Prefer not to say" on the student profile saves gender as null.
ALTER TABLE public.students ALTER COLUMN gender   DROP NOT NULL;
ALTER TABLE public.students ALTER COLUMN schedule DROP NOT NULL;

COMMIT;
