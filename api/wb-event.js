// Whiteboard relay: the only way a participant's committed board edits and WebRTC
// signaling reach the rest of the room.
//
//   POST { roomId, event, payload }      Authorization: Bearer <Supabase JWT>
//
// Why: Realtime Authorization (RLS on realtime.messages) is checked when a client JOINS
// a channel, not per message, so nothing on the public 'room-<id>' channel can be tied to
// a sender. This function authenticates the caller, checks they may send `event` in this
// room (wb_relay_role() in wb_guest_identity.sql), overwrites payload.senderId with the
// caller's auth uid, and broadcasts on the PRIVATE 'room-<id>-host' channel with the
// service role. Clients only write to that channel through here (or as the host, whom
// RLS lets write directly), and receivers accept board edits / signaling only from it.
//
// Every participant has an auth uid: guests use supabase.auth.signInAnonymously().
import { authenticate, setCors, sendError, HttpError } from './_lib.js';

const MAX_PAYLOAD_BYTES = 200 * 1024;   // Realtime rejects messages above 256KB (free plan)
const MAX_ELEMENTS = 5000;

// Board edits change persistent board state: host, or a participant with a grant.
const BOARD_EVENTS = new Set(['drawing-end', 'element-patch']);
// Call signaling: any authenticated member of an existing room (the room link is the
// invitation, exactly like joining the channel). Stamping senderId is what matters here.
const SIGNAL_EVENTS = new Set(['webrtc-offer', 'webrtc-answer', 'webrtc-ice', 'peer-reconnect']);

const ELEMENT_TYPES = new Set(['stroke', 'shape', 'text', 'image']);

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isShortId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 100;
const isElementId = (v) => isShortId(v) || (typeof v === 'number' && Number.isFinite(v));
const isElement = (el) => isPlainObject(el) && ELEMENT_TYPES.has(el.type) && isElementId(el.id);

const isSessionDescription = (d, type) =>
  isPlainObject(d) && d.type === type && typeof d.sdp === 'string' && d.sdp.length > 0 && d.sdp.length <= 100000;

const isIceCandidate = (c) =>
  isPlainObject(c) &&
  typeof c.candidate === 'string' && c.candidate.length <= 2000 &&
  (c.sdpMid === undefined || c.sdpMid === null || (typeof c.sdpMid === 'string' && c.sdpMid.length <= 64)) &&
  (c.sdpMLineIndex === undefined || c.sdpMLineIndex === null ||
    (Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0 && c.sdpMLineIndex < 64)) &&
  (c.usernameFragment === undefined || c.usernameFragment === null ||
    (typeof c.usernameFragment === 'string' && c.usernameFragment.length <= 256));

// Shape checks. Receivers sanitize every element again before using it; this just keeps
// obviously malformed traffic off the channel.
const validatePayload = (event, p) => {
  switch (event) {
    case 'drawing-end':
      return isElement(p.element);
    case 'element-patch': {
      const remove = p.remove === undefined ? [] : p.remove;
      const upsert = p.upsert === undefined ? [] : p.upsert;
      return Array.isArray(remove) && Array.isArray(upsert) &&
        remove.length + upsert.length > 0 &&
        remove.length <= MAX_ELEMENTS && upsert.length <= MAX_ELEMENTS &&
        remove.every(isElementId) && upsert.every(isElement);
    }
    case 'webrtc-offer':
      return isShortId(p.targetUserId) && isSessionDescription(p.offer, 'offer');
    case 'webrtc-answer':
      return isShortId(p.targetUserId) && isSessionDescription(p.answer, 'answer');
    case 'webrtc-ice':
      return isShortId(p.targetUserId) && Array.isArray(p.candidates) &&
        p.candidates.length > 0 && p.candidates.length <= 50 && p.candidates.every(isIceCandidate);
    case 'peer-reconnect':
      return true;
    default:
      return false;
  }
};

// Same REST endpoint realtime-js uses when channel.send() is called on a channel that is
// not joined (RealtimeChannel.send -> POST <url>/realtime/v1/api/broadcast with
// { messages: [{ topic, event, payload, private }] }). Called directly so the service-role
// key is sent as both apikey and bearer token and the HTTP status can be checked.
async function broadcastPrivate(topic, event, payload) {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages: [{ topic, event, payload, private: true }] })
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.error || body.message || detail;
    } catch { /* non-JSON error body */ }
    throw new HttpError(502, `Realtime broadcast failed (${response.status}): ${detail}`);
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { roomId, event, payload } = req.body || {};
    if (!isShortId(roomId)) throw new HttpError(400, 'roomId is required');
    if (!BOARD_EVENTS.has(event) && !SIGNAL_EVENTS.has(event)) throw new HttpError(400, 'Unsupported event');
    if (!isPlainObject(payload)) throw new HttpError(400, 'payload must be an object');

    let size;
    try {
      size = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    } catch {
      throw new HttpError(400, 'payload is not serializable');
    }
    if (size > MAX_PAYLOAD_BYTES) throw new HttpError(413, 'payload too large');
    if (!validatePayload(event, payload)) throw new HttpError(400, `Malformed ${event} payload`);

    const { user, adminClient } = await authenticate(req);

    const { data: role, error: roleErr } = await adminClient.rpc('wb_relay_role', { p_room: roomId, p_user: user.id });
    if (roleErr) throw roleErr;
    if (role === 'none' || !role) throw new HttpError(404, 'Session not found');
    if (BOARD_EVENTS.has(event) && role !== 'host' && role !== 'granted') {
      throw new HttpError(403, 'You do not have drawing access in this session');
    }

    // Server-stamped sender: anything the client put in sender fields is discarded.
    // eslint-disable-next-line no-unused-vars
    const { senderId, senderUserId, userId, ...rest } = payload;
    const stamped = { ...rest, senderId: user.id };

    await broadcastPrivate(`room-${roomId}-host`, event, stamped);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendError(res, err);
  }
}
