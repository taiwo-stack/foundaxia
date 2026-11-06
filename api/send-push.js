import webpush from 'web-push';
import { authenticate, getUserIds, setCors, sendError, HttpError } from './_lib.js';

// Sends a Web Push notification for one chat message.
// Body: { messageId }. The message is loaded server-side and must have been sent by the
// caller, so nobody can push arbitrary text to arbitrary users.
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  try {
    const { user, adminClient } = await authenticate(req);

    if (!vapidPublicKey || !vapidPrivateKey) {
      // Push isn't configured yet - fail quietly, this must never break chat sending.
      return res.status(200).json({ skipped: true, reason: 'VAPID keys not configured' });
    }

    const { messageId } = req.body || {};
    if (!messageId) throw new HttpError(400, 'messageId is required');

    const { data: message, error: msgErr } = await adminClient
      .from('chat_messages')
      .select('*')
      .eq('id', messageId)
      .maybeSingle();
    if (msgErr) throw msgErr;
    if (!message) throw new HttpError(404, 'Message not found');

    const { ids: callerIds } = await getUserIds(adminClient, user.id);
    if (!callerIds.has(String(message.sender_id))) {
      throw new HttpError(403, 'You can only send notifications for your own messages');
    }

    // Sender's display name comes from the database, not the request.
    let senderName = 'FoundaXia';
    for (const table of ['tutors', 'students', 'profiles']) {
      const { data } = await adminClient.from(table).select('full_name').eq('id', message.sender_id).maybeSingle();
      if (data?.full_name) { senderName = data.full_name; break; }
    }

    // The receiver id may be an auth uid or a legacy students/tutors row id; notify the
    // subscriptions saved under either.
    const receiverIds = new Set([String(message.receiver_id)]);
    for (const table of ['students', 'tutors']) {
      const { data } = await adminClient.from(table).select('id, profile_id')
        .or(`id.eq.${message.receiver_id},profile_id.eq.${message.receiver_id}`);
      (data || []).forEach(r => { receiverIds.add(String(r.id)); if (r.profile_id) receiverIds.add(String(r.profile_id)); });
    }

    const { data: subs, error: subsError } = await adminClient
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', [...receiverIds]);
    if (subsError) throw subsError;
    if (!subs || subs.length === 0) return res.status(200).json({ sent: 0 });

    webpush.setVapidDetails('mailto:support@foundaxia.com', vapidPublicKey, vapidPrivateKey);
    const text = String(message.message_text || '');
    const payload = JSON.stringify({
      title: senderName,
      body: text.length > 120 ? text.slice(0, 117) + '...' : text,
      url: '/'
    });

    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        ).catch(err => {
          // 404/410 = the push service says this subscription is dead; clean it up.
          if (err.statusCode === 404 || err.statusCode === 410) {
            return adminClient.from('push_subscriptions').delete().eq('id', sub.id);
          }
          throw err;
        })
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return res.status(200).json({ sent, total: subs.length });
  } catch (err) {
    return sendError(res, err);
  }
}
