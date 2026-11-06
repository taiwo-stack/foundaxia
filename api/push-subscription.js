import { createHash } from 'node:crypto';
import { authenticate, getUserIds, setCors, sendError, HttpError } from './_lib.js';

// Saves or removes this browser's Web Push subscription for the signed-in user.
//   { action: 'save', userId, subscription: { endpoint, keys: { p256dh, auth } } }
//   { action: 'remove', endpoint }
//
// Done server-side because a browser's endpoint is unique: if another account enabled
// notifications on the same device earlier, the row belongs to that account and RLS
// (correctly) refuses to let this user overwrite it. A device should notify whoever
// is signed in on it now, so the server hands the row over after verifying the caller.
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user, adminClient } = await authenticate(req);
    const { ids } = await getUserIds(adminClient, user.id);
    const { action } = req.body || {};

    if (action === 'save') {
      const { userId, subscription } = req.body;
      const endpoint = subscription?.endpoint;
      const p256dh = subscription?.keys?.p256dh;
      const auth = subscription?.keys?.auth;
      if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 1000) {
        throw new HttpError(400, 'Invalid subscription endpoint');
      }
      if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 200 || auth.length > 100) {
        throw new HttpError(400, 'Invalid subscription keys');
      }

      // Store under the id the dashboard addresses this user by, but only if it really
      // is one of the caller's ids; otherwise fall back to the login id.
      const ownerId = userId && ids.has(String(userId)) ? String(userId) : String(user.id);

      const { error: delErr } = await adminClient.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (delErr) throw delErr;

      const id = 'push_' + createHash('sha256').update(endpoint).digest('hex');
      const { error: insErr } = await adminClient.from('push_subscriptions').insert([{
        id, user_id: ownerId, endpoint, p256dh, auth
      }]);
      if (insErr) throw insErr;
      return res.status(200).json({ ok: true });
    }

    if (action === 'remove') {
      const { endpoint } = req.body;
      if (typeof endpoint !== 'string' || !endpoint) throw new HttpError(400, 'endpoint is required');
      // Only remove this device's row if it belongs to the caller.
      const { error } = await adminClient
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint)
        .in('user_id', [...ids]);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    throw new HttpError(400, 'Unknown action');
  } catch (err) {
    return sendError(res, err);
  }
}
