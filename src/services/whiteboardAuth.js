import { supabase, hasSupabaseConfig } from '../supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Whiteboard session authority helpers.
//
// Who is the host of a room is decided server-side (enable_realtime_auth.sql):
//   * wb_claim_host(room) returns true only when the logged-in caller is the tutor
//     on that room's live_sessions row. For a brand-new ad-hoc room (no row yet) a
//     tutor/admin caller claims it by having a row created with them as tutor.
//   * Host-only events travel on the PRIVATE Realtime channel `room-<id>-host`,
//     which RLS on realtime.messages lets only that tutor (or an admin) write to.
//   * Participants' committed board edits and WebRTC signaling go through the
//     /api/wb-event relay, which stamps the sender's auth uid and re-broadcasts on
//     the private channel (wb_guest_identity.sql, api/wb-event.js).
// Nothing here trusts sessionStorage or ids carried in broadcast payloads.
// ─────────────────────────────────────────────────────────────────────────────

/** Topic of the public (presence / signaling / participant strokes) channel. */
export const mainChannelTopic = (roomId) => `room-${roomId}`;

/** Topic of the private host-only channel (must match the SQL regex '^room-(.+)-host$'). */
export const hostChannelTopic = (roomId) => `room-${roomId}-host`;

/**
 * Ask the database whether the current user is (or, for a brand-new ad-hoc room,
 * may become) the host of `roomId`.
 * Resolves to { isHost: boolean, error: Error|null }. `error` is set when the RPC
 * itself failed (e.g. enable_realtime_auth.sql has not been run yet).
 */
export const claimWhiteboardHost = async (roomId) => {
  if (!hasSupabaseConfig || !supabase) return { isHost: false, error: new Error('Supabase not configured') };
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    // Visitors without an account (no session, or an anonymous guest session) are never hosts.
    if (!sessionData?.session || sessionData.session.user?.is_anonymous === true) return { isHost: false, error: null };
    const { data, error } = await supabase.rpc('wb_claim_host', { p_room: roomId });
    if (error) return { isHost: false, error };
    return { isHost: data === true, error: null };
  } catch (err) {
    return { isHost: false, error: err };
  }
};

/**
 * True when the browser currently has a logged-in (non-anonymous) Supabase session.
 * Anonymous whiteboard-guest sessions don't count.
 */
export const hasAuthSession = async () => {
  if (!hasSupabaseConfig || !supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return !!data?.session && data.session.user?.is_anonymous !== true;
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Participant identity (wb_guest_identity.sql)
//
// Every whiteboard participant id is a Supabase auth uid. Guests without an account get
// one from supabase.auth.signInAnonymously(). That anonymous session lives only in
// supabase-js' own storage: the app's role state (sessionStorage 'currentUser') is never
// touched, so App/ProtectedRoute keep treating the visitor as a guest, and the RESTRICTIVE
// policies in wb_guest_identity.sql keep anonymous JWTs out of every other table.
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Auth uids are UUIDs; anything else is an unverified (view-only) participant id. */
export const isAuthUid = (id) => typeof id === 'string' && UUID_RE.test(id);

/**
 * Make sure this browser has an auth identity to collaborate with.
 *   allowAnonymous: sign in anonymously when there is no session at all. Pass false for
 *   users the app believes are logged in (their real session expired) - they are sent
 *   back to log in rather than silently becoming someone else.
 * An existing session (real or anonymous) is always reused, never replaced.
 * Resolves to { userId, isAnonymous, reason } where reason is null on success, else
 * 'anonymous-disabled' | 'session-expired' | 'error'.
 */
export const ensureWhiteboardIdentity = async ({ allowAnonymous }) => {
  if (!hasSupabaseConfig || !supabase) return { userId: null, isAnonymous: false, reason: 'error' };
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (session?.user?.id) {
      return { userId: session.user.id, isAnonymous: session.user.is_anonymous === true, reason: null };
    }
    if (!allowAnonymous) return { userId: null, isAnonymous: false, reason: 'session-expired' };

    const { data: anon, error } = await supabase.auth.signInAnonymously();
    if (error || !anon?.user?.id) {
      const msg = String(error?.message || '');
      // GoTrue answers 422 "Anonymous sign-ins are disabled" when the dashboard toggle is off.
      const disabled = error?.status === 422 || /anonymous/i.test(msg) || error?.code === 'anonymous_provider_disabled';
      console.warn('Whiteboard: anonymous sign-in failed:', msg || error);
      return { userId: null, isAnonymous: false, reason: disabled ? 'anonymous-disabled' : 'error' };
    }
    return { userId: anon.user.id, isAnonymous: true, reason: null };
  } catch (err) {
    console.warn('Whiteboard: could not establish an identity:', err?.message || err);
    return { userId: null, isAnonymous: false, reason: 'error' };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Draw grants (public.wb_draw_grants; written only through wb_set_draw_access)
// ─────────────────────────────────────────────────────────────────────────────

/** Host: grant/revoke drawing for `userId`. Resolves to { error }. */
export const setDrawAccess = async (roomId, userId, allowed) => {
  if (!hasSupabaseConfig || !supabase) return { error: new Error('Supabase not configured') };
  try {
    const { error } = await supabase.rpc('wb_set_draw_access', { p_room: roomId, p_user: userId, p_allowed: !!allowed });
    return { error: error || null };
  } catch (err) {
    return { error: err };
  }
};

/**
 * User ids with a draw grant in `roomId` that the caller may see (RLS: all of them for
 * the host, only their own row for anyone else). Resolves to an array, or null on error.
 */
export const listDrawGrants = async (roomId) => {
  if (!hasSupabaseConfig || !supabase) return null;
  try {
    const { data, error } = await supabase.from('wb_draw_grants').select('user_id').eq('room_id', roomId).limit(500);
    if (error) {
      console.warn('Whiteboard: could not load draw grants:', error.message);
      return null;
    }
    return (data || []).map(r => String(r.user_id));
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Relay (api/wb-event.js): participants' committed board edits and call signaling.
// ─────────────────────────────────────────────────────────────────────────────

/** Keep in step with MAX_PAYLOAD_BYTES in api/wb-event.js (a little headroom for UTF-8). */
export const RELAY_MAX_CHARS = 190000;

/**
 * POST one event to the relay, which stamps senderId with our auth uid and broadcasts it
 * on the private host channel. Resolves to { ok, status, error }.
 */
export const postWhiteboardEvent = async (roomId, event, payload) => {
  if (!hasSupabaseConfig || !supabase) return { ok: false, status: 0, error: 'Supabase not configured' };
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return { ok: false, status: 401, error: 'Not signed in' };
    const response = await fetch('/api/wb-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ roomId, event, payload })
    });
    if (response.ok) return { ok: true, status: response.status, error: null };
    let error = response.statusText;
    try {
      const body = await response.json();
      error = body?.error || error;
    } catch { /* non-JSON error body */ }
    return { ok: false, status: response.status, error };
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || String(err) };
  }
};

/**
 * Upload a whiteboard image (PDF page render, dropped picture) to the public
 * 'materials' bucket so only a short URL has to be broadcast. Requires a logged-in,
 * non-anonymous user (storage policy: authenticated INSERT; anonymous uploads are blocked
 * by wb_guest_identity.sql). Resolves to the public URL, or null
 * on any failure so callers can fall back to an inline (compressed) data URL.
 */
export const uploadWhiteboardImage = async (blob, roomId, ext = 'jpg') => {
  if (!hasSupabaseConfig || !supabase || !blob) return null;
  try {
    if (!(await hasAuthSession())) return null;
    const safeRoom = String(roomId || 'solo').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'solo';
    const rand = Math.random().toString(36).slice(2, 10);
    const path = `whiteboard/${safeRoom}/${Date.now()}-${rand}.${ext}`;
    const { error } = await supabase.storage
      .from('materials')
      .upload(path, blob, { cacheControl: '31536000', upsert: false, contentType: blob.type || undefined });
    if (error) {
      console.warn('Whiteboard image upload failed, falling back to inline data:', error.message);
      return null;
    }
    const { data } = supabase.storage.from('materials').getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (err) {
    console.warn('Whiteboard image upload failed, falling back to inline data:', err?.message || err);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// URL allow-listing for content received from other participants.
// ─────────────────────────────────────────────────────────────────────────────

/** `<VITE_SUPABASE_URL>/storage/v1/object/public/` or null when not configured. */
export const getStoragePublicPrefix = () => {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base || typeof base !== 'string' || !/^https:\/\//i.test(base)) return null;
  try {
    const u = new URL(base);
    return `${u.origin}/storage/v1/object/public/`;
  } catch {
    return null;
  }
};

/**
 * True when `rawUrl` is same-origin or under this project's Supabase Storage public
 * prefix. Parsed with URL() first so `..` segments, credentials and look-alike hosts
 * (e.g. https://proj.supabase.co.evil.com/...) cannot slip through a prefix check.
 */
export const isTrustedRemoteUrl = (rawUrl) => {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 4096) return false;
  let u;
  try {
    u = new URL(rawUrl, window.location.href);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  if (u.origin === window.location.origin) return true;
  const prefix = getStoragePublicPrefix();
  return !!prefix && u.href.startsWith(prefix);
};

/** Image sources the board may load: inline raster data URLs or trusted remote URLs. */
export const isAllowedImageSrc = (src) => {
  if (typeof src !== 'string') return false;
  if (/^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(src)) return true;
  return isTrustedRemoteUrl(src);
};
