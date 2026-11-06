import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './_lib.js';
import { confirmPayment } from './_paystack.js';

// Paystack webhook (set in Paystack Dashboard -> Settings -> API Keys & Webhooks):
//   https://<your-domain>/api/paystack-webhook
// Catches payments whose browser closed before the dashboard could confirm them.
// The signature proves the call came from Paystack; the payment itself is still
// re-checked with Paystack's verify API inside confirmPayment.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server is not configured' });

  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const expected = createHmac('sha512', secret).update(raw).digest('hex');
  const given = String(req.headers['x-paystack-signature'] || '');
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try { event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).end(); }

  if (event?.event === 'charge.success' && event.data?.reference) {
    const adminClient = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    try {
      await confirmPayment(adminClient, String(event.data.reference));
    } catch (err) {
      // Payments made elsewhere (e.g. the paystack.shop page) aren't ours: acknowledge them.
      if (err instanceof HttpError && err.status === 404) return res.status(200).json({ ignored: true });
      console.error('paystack webhook error:', err);
      return res.status(500).json({ error: 'Could not record payment' }); // Paystack will retry
    }
  }
  return res.status(200).json({ received: true });
}
