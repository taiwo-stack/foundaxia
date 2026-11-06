-- =============================================================
-- WHITEBOARD: REAL GUEST IDENTITY + SERVER-SIDE DRAW GRANTS
--
-- Problem: participant ids on the whiteboard were client-chosen strings
-- ('user-xxxx' in localStorage) and visible to everyone in presence, so anyone
-- could claim a granted participant's id and draw / erase as them on the
-- public Realtime channel. RLS cannot help per message: Realtime
-- Authorization is evaluated when a client JOINS a channel, not per broadcast.
--
-- Fix (this script + src/pages/Whiteboard.jsx, src/services/whiteboardAuth.js
-- and the new serverless relay api/wb-event.js):
--   * Every participant has a real Supabase auth uid. Guests without an
--     account call supabase.auth.signInAnonymously(); the presence key and
--     every participant id IS that uid.
--   * Draw grants live in public.wb_draw_grants (below). Only the room host
--     can change them, through wb_set_draw_access().
--   * Participants never broadcast committed board edits themselves. They
--     POST them to /api/wb-event with their JWT; the relay checks the caller
--     is the host or has a wb_draw_grants row (wb_relay_role() below), stamps
--     payload.senderId = caller's auth uid, and broadcasts it on the PRIVATE
--     'room-<id>-host' channel with the service role. Receivers accept board
--     edits (and WebRTC signaling) only from that private channel.
--
-- REQUIREMENTS / ORDER
--   1. enable_rls.sql            (app_is_admin / app_my_ids helpers, RLS)
--   2. enable_realtime_auth.sql  (wb_is_room_host, wb_room_exists, policies)
--   3. THIS script.
--   4. Supabase dashboard -> Authentication -> Sign In / Providers ->
--      "Allow anonymous sign-ins" must be ENABLED. Without it guests can still
--      watch the board but cannot draw or join voice/video.
--      (Optional but recommended: enable CAPTCHA / keep the default
--      anonymous sign-in rate limit, since anyone can mint anonymous users.)
--   5. The server needs SUPABASE_SERVICE_ROLE_KEY (already required by the
--      other /api functions) for api/wb-event.js.
--
-- ANONYMOUS USERS AND EXISTING POLICIES
-- Anonymous users get the Postgres role 'authenticated' (with the JWT claim
-- is_anonymous = true). Policies written "TO authenticated" or keyed on
-- auth.uid() would therefore start applying to anyone who opened a whiteboard
-- link. Section 4 adds RESTRICTIVE policies that keep anonymous users out of
-- the tables/buckets where that would widen access (course materials, the
-- full tutors table, chat, live session rows, push subscriptions, and
-- storage uploads). Public catalogue reads and the landing-page inserts
-- (bookings, contact form, registration) are untouched.
--
-- Idempotent: safe to run more than once. Runs in one transaction.
-- Run in: https://supabase.com/dashboard/project/wexqhlrhfostrpehknka/sql/new
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Helper: is the current JWT an anonymous sign-in?
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wb_is_anonymous() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;
GRANT EXECUTE ON FUNCTION public.wb_is_anonymous() TO anon, authenticated;

-- -------------------------------------------------------------
-- 2. Draw grants
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wb_draw_grants (
  room_id    text        NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
COMMENT ON TABLE public.wb_draw_grants IS
  'Whiteboard draw access: the room host (live_sessions.tutor_id) granted user_id drawing rights in room_id. Written only via wb_set_draw_access(); rows go away with the live_sessions row.';

ALTER TABLE public.wb_draw_grants ENABLE ROW LEVEL SECURITY;

-- No INSERT/UPDATE/DELETE policies: clients can only change grants through
-- the SECURITY DEFINER RPC below. Reads: your own grant, or all grants of a
-- room you host.
DROP POLICY IF EXISTS wb_grants_read ON public.wb_draw_grants;
CREATE POLICY wb_grants_read ON public.wb_draw_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.wb_is_room_host(room_id));

REVOKE ALL ON public.wb_draw_grants FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.wb_draw_grants FROM authenticated;
GRANT SELECT ON public.wb_draw_grants TO authenticated;

-- Grant (p_allowed = true) or revoke (false) drawing for p_user in p_room.
-- Only the room host (or an admin) - same rule as the private host channel.
CREATE OR REPLACE FUNCTION public.wb_set_draw_access(p_room text, p_user uuid, p_allowed boolean)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_room IS NULL OR p_user IS NULL OR p_allowed IS NULL THEN
    RAISE EXCEPTION 'room, user and allowed are required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.wb_is_room_host(p_room) THEN
    RAISE EXCEPTION 'only the session host can change drawing access' USING ERRCODE = '42501';
  END IF;

  IF p_allowed THEN
    INSERT INTO public.wb_draw_grants (room_id, user_id)
    VALUES (p_room, p_user)
    ON CONFLICT (room_id, user_id) DO NOTHING;
  ELSE
    DELETE FROM public.wb_draw_grants WHERE room_id = p_room AND user_id = p_user;
  END IF;
  RETURN p_allowed;
END $$;

REVOKE ALL ON FUNCTION public.wb_set_draw_access(text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wb_set_draw_access(text, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.wb_set_draw_access(text, uuid, boolean) TO authenticated;

-- -------------------------------------------------------------
-- 3. Relay authorization (api/wb-event.js, service role only)
-- Returns 'host' | 'granted' | 'member' (room exists, no grant) | 'none'
-- (no such room) for user p_user in room p_room. The relay runs with the
-- service role, where auth.uid() is NULL, so this mirrors wb_is_room_host()
-- / app_my_ids() for an explicit user id instead of the JWT.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wb_relay_role(p_room text, p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH my_ids AS (
    SELECT p_user::text AS id
    UNION SELECT id::text FROM public.students WHERE id::text = p_user::text OR profile_id::text = p_user::text
    UNION SELECT id::text FROM public.tutors   WHERE id::text = p_user::text OR profile_id::text = p_user::text
  )
  SELECT CASE
    WHEN p_room IS NULL OR p_user IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.live_sessions WHERE id = p_room) THEN 'none'
    WHEN EXISTS (SELECT 1 FROM public.live_sessions ls
                  WHERE ls.id = p_room AND ls.tutor_id::text IN (SELECT id FROM my_ids))
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id::text = p_user::text AND role = 'admin') THEN 'host'
    WHEN EXISTS (SELECT 1 FROM public.wb_draw_grants WHERE room_id = p_room AND user_id = p_user) THEN 'granted'
    ELSE 'member'
  END;
$$;

REVOKE ALL ON FUNCTION public.wb_relay_role(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wb_relay_role(text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wb_relay_role(text, uuid) TO service_role;

-- -------------------------------------------------------------
-- 4. Keep anonymous (whiteboard guest) sessions out of everything else.
-- RESTRICTIVE policies are AND-ed with the existing permissive ones, so they
-- only ever take access away - and only from anonymous JWTs.
-- -------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['course_materials', 'tutors', 'chat_messages', 'live_sessions', 'push_subscriptions',
                           'students', 'profiles', 'tasks', 'student_tasks', 'student_courses',
                           'schedules', 'attendance', 'course_announcements']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS wb_no_anonymous ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY wb_no_anonymous ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
        'USING (NOT public.wb_is_anonymous()) WITH CHECK (NOT public.wb_is_anonymous())', t);
    END IF;
  END LOOP;
END $$;

-- 'students' above also blocks the landing-page registration INSERT for a
-- visitor who still carries an anonymous whiteboard session; re-allow exactly
-- that (pending registrations are open to the anon role anyway).
DROP POLICY IF EXISTS wb_no_anonymous ON public.students;
CREATE POLICY wb_no_anonymous ON public.students AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.wb_is_anonymous())
  WITH CHECK (NOT public.wb_is_anonymous() OR status = 'pending');

-- Storage: anonymous sessions may read public files but not upload.
DROP POLICY IF EXISTS "wb no anonymous uploads" ON storage.objects;
CREATE POLICY "wb no anonymous uploads" ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.wb_is_anonymous());
DROP POLICY IF EXISTS "wb no anonymous changes" ON storage.objects;
CREATE POLICY "wb no anonymous changes" ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (NOT public.wb_is_anonymous());
DROP POLICY IF EXISTS "wb no anonymous deletes" ON storage.objects;
CREATE POLICY "wb no anonymous deletes" ON storage.objects AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (NOT public.wb_is_anonymous());

COMMIT;

-- =============================================================
-- ROLLBACK (if needed):
--   DROP FUNCTION IF EXISTS public.wb_set_draw_access(text, uuid, boolean);
--   DROP FUNCTION IF EXISTS public.wb_relay_role(text, uuid);
--   DROP TABLE IF EXISTS public.wb_draw_grants;
--   -- for each table listed in section 4:
--   --   DROP POLICY IF EXISTS wb_no_anonymous ON public.<table>;
--   DROP POLICY IF EXISTS "wb no anonymous uploads" ON storage.objects;
--   DROP POLICY IF EXISTS "wb no anonymous changes" ON storage.objects;
--   DROP POLICY IF EXISTS "wb no anonymous deletes" ON storage.objects;
--   DROP FUNCTION IF EXISTS public.wb_is_anonymous();
-- (Guests then cannot draw: the relay and the host's grant toggle need these.)
-- =============================================================
