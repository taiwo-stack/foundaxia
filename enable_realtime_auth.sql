-- =============================================================
-- WHITEBOARD: SERVER-ENFORCED HOST AUTHORITY (Supabase Realtime Authorization)
--
-- Problem: every whiteboard event used to travel on one PUBLIC Realtime
-- broadcast channel ('room-<id>'), and receivers only checked their OWN role.
-- Anyone holding the link (even an anonymous guest) could therefore send
-- "session-ended", replace everyone's deck (page-change / board-state-response),
-- wipe the board, or grant themselves draw access. The "host" flag was just
-- sessionStorage['wb-host-<room>'] = 'true', which anyone can set.
--
-- Fix (this script + the matching client code in src/pages/Whiteboard.jsx and
-- src/services/whiteboardAuth.js):
--   * Host-only events now go on a PRIVATE channel 'room-<id>-host'.
--     RLS on realtime.messages lets anyone who can open an existing session
--     READ it (anon guests included), but only the session's tutor - the
--     live_sessions.tutor_id user - or an admin can WRITE (broadcast) to it.
--     Receivers ignore host-only events that arrive on the public channel.
--   * Host status in the browser comes from the wb_claim_host() RPC below
--     (auth user == live_sessions.tutor_id), not from sessionStorage.
--     Ad-hoc rooms (a tutor clicking "Start collaboration" on /whiteboard,
--     which has no live_sessions row) are registered by the same RPC as a
--     live_sessions row with an empty student_ids list, so the same rules apply.
--
-- Room ids: the browser channel name is 'room-' || <room id>, and room ids are
-- themselves 'room-xxxxxxxxx', so the private topic looks like
-- 'room-room-abc123def-host'. wb_room_from_topic() strips the outer
-- 'room-' ... '-host' to get back the live_sessions.id.
--
-- REQUIREMENTS / DASHBOARD SETTINGS
--   1. Run enable_rls.sql first (this uses its app_my_ids / app_is_admin /
--      app_is_tutor helpers).
--   2. Run THIS script in the SQL editor BEFORE deploying the new frontend:
--      without it the private host channel cannot be joined and guests will
--      not receive the tutor's board.
--   3. Dashboard -> Project Settings -> Realtime -> "Allow public access"
--      (a.k.a. "private channels only" OFF) must stay ENABLED: the main room
--      channel (presence, WebRTC signaling, student strokes) is still public
--      so anonymous guests can use it. Only the '-host' channel is private.
--   4. No other setting is needed: Realtime Authorization is applied to any
--      channel the client opens with { config: { private: true } }
--      (supabase-js >= 2.44; this project uses 2.108).
--
-- Idempotent: safe to run more than once. Runs in one transaction.
-- Run in: https://supabase.com/dashboard/project/wexqhlrhfostrpehknka/sql/new
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Helpers
-- -------------------------------------------------------------

-- 'room-<room id>-host'  ->  '<room id>'   (NULL for any other topic)
CREATE OR REPLACE FUNCTION public.wb_room_from_topic(p_topic text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT substring(p_topic FROM '^room-(.+)-host$');
$$;

-- Does a (not yet ended) session with this id exist? SECURITY DEFINER because
-- anonymous guests cannot SELECT live_sessions themselves.
CREATE OR REPLACE FUNCTION public.wb_room_exists(p_room text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_room IS NOT NULL AND EXISTS (SELECT 1 FROM public.live_sessions WHERE id = p_room);
$$;

-- May the CURRENT user broadcast host events for this room?
-- The session's tutor (auth uid or their linked tutors-row id), or any admin.
CREATE OR REPLACE FUNCTION public.wb_is_room_host(p_room text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND p_room IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.live_sessions ls
     WHERE ls.id = p_room
       AND (ls.tutor_id::text IN (SELECT public.app_my_ids()) OR public.app_is_admin())
  );
$$;

-- Called by the whiteboard on load. Returns true when the caller is this room's
-- host. If the room has no live_sessions row yet (ad-hoc room) and the caller is
-- a tutor or admin, the row is created with them as tutor (first claim wins).
-- Students and anonymous callers always get false.
CREATE OR REPLACE FUNCTION public.wb_claim_host(p_room text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL OR p_room IS NULL OR length(p_room) = 0 OR length(p_room) > 100 THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.live_sessions WHERE id = p_room) THEN
    RETURN EXISTS (
      SELECT 1 FROM public.live_sessions
       WHERE id = p_room AND tutor_id::text IN (SELECT public.app_my_ids())
    );
  END IF;

  IF NOT (public.app_is_tutor() OR public.app_is_admin()) THEN
    RETURN false;
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id::text = v_uid::text;

  INSERT INTO public.live_sessions (id, tutor_id, tutor_name, student_ids, title)
  VALUES (p_room, v_uid, coalesce(v_name, 'Tutor'), '[]'::jsonb, 'Ad-hoc Whiteboard Session')
  ON CONFLICT (id) DO NOTHING;

  RETURN EXISTS (SELECT 1 FROM public.live_sessions WHERE id = p_room AND tutor_id = v_uid);
END $$;

REVOKE ALL ON FUNCTION public.wb_claim_host(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wb_claim_host(text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wb_room_from_topic(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wb_room_exists(text)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wb_is_room_host(text)    TO anon, authenticated;

-- -------------------------------------------------------------
-- 2. Realtime Authorization policies (only affect PRIVATE channels)
-- -------------------------------------------------------------

-- Join / receive: anyone (anon guests included) for a room that exists.
-- Knowing the room id is the invitation, exactly as before - this does not make
-- the board any more readable than the public channel already was.
DROP POLICY IF EXISTS wb_host_channel_read ON realtime.messages;
CREATE POLICY wb_host_channel_read ON realtime.messages
  FOR SELECT TO anon, authenticated
  USING (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND public.wb_room_exists(public.wb_room_from_topic(realtime.topic()))
  );

-- Send: ONLY the session's tutor (or an admin), and only broadcast messages.
-- Nobody gets presence write on the host channel (it is not used).
DROP POLICY IF EXISTS wb_host_channel_write ON realtime.messages;
CREATE POLICY wb_host_channel_write ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    realtime.messages.extension = 'broadcast'
    AND public.wb_is_room_host(public.wb_room_from_topic(realtime.topic()))
  );

COMMIT;

-- =============================================================
-- ROLLBACK (if needed):
--   DROP POLICY IF EXISTS wb_host_channel_read  ON realtime.messages;
--   DROP POLICY IF EXISTS wb_host_channel_write ON realtime.messages;
--   DROP FUNCTION IF EXISTS public.wb_claim_host(text);
--   DROP FUNCTION IF EXISTS public.wb_is_room_host(text);
--   DROP FUNCTION IF EXISTS public.wb_room_exists(text);
--   DROP FUNCTION IF EXISTS public.wb_room_from_topic(text);
-- (The whiteboard frontend then can no longer sync host events - redeploy the
--  previous build as well.)
-- =============================================================
