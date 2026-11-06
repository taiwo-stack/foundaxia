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
    if (!sessionData?.session) return { isHost: false, error: null }; // anonymous guests are never hosts
    const { data, error } = await supabase.rpc('wb_claim_host', { p_room: roomId });
    if (error) return { isHost: false, error };
    return { isHost: data === true, error: null };
  } catch (err) {
    return { isHost: false, error: err };
  }
};

/** True when the browser currently has a logged-in Supabase session. */
export const hasAuthSession = async () => {
  if (!hasSupabaseConfig || !supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return !!data?.session;
  } catch {
    return false;
  }
};

/**
 * Upload a whiteboard image (PDF page render, dropped picture) to the public
 * 'materials' bucket so only a short URL has to be broadcast. Requires a logged-in
 * user (storage policy: authenticated INSERT). Resolves to the public URL, or null
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
