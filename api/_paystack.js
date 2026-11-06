// Parent Area helpers: Paystack calls, payment confirmation, parent-code hashing and
// short-lived parent session tokens. Import-only (files starting with "_" aren't routes).
import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual
} from 'node:crypto';
import { HttpError } from './_lib.js';
import { CODE_WORDS } from './_codewords.js';

const PAYSTACK_API = 'https://api.paystack.co';

function paystackSecret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new HttpError(500, 'PAYSTACK_SECRET_KEY is not set on the server');
  return key;
}

export async function paystack(path, { method = 'GET', body } = {}) {
  const response = await fetch(PAYSTACK_API + path, {
    method,
    headers: { Authorization: `Bearer ${paystackSecret()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.status) {
    throw new HttpError(502, 'Paystack: ' + (json.message || `HTTP ${response.status}`));
  }
  return json.data;
}

// The Parent Area tables come from parent_area.sql; say so plainly if it hasn't run.
export function checkDb(error) {
  if (!error) return;
  if (error.code === '42P01' || error.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(error.message || '')) {
    throw new HttpError(500, 'The Parent Area tables are missing. Run parent_area.sql in the Supabase SQL editor.');
  }
  if ((error.code === '42703' || error.code === 'PGRST204') && /code_encrypted|daily_failed|hard_locked/.test(error.message || '')) {
    throw new HttpError(500, 'The database needs the latest Parent Area update. Run parent_area.sql in the Supabase SQL editor again.');
  }
  throw error;
}

// Ask Paystack whether a payment went through and record the result. Never trusts the
// browser or the webhook body: the amount and status come from Paystack's verify API.
// Idempotent, so the browser callback and the webhook can both call it.
export async function confirmPayment(adminClient, reference) {
  const { data: payment, error } = await adminClient
    .from('fee_payments').select('*').eq('reference', reference).maybeSingle();
  checkDb(error);
  if (!payment) throw new HttpError(404, 'Unknown payment reference');
  if (payment.status === 'success') return payment;

  const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);

  if (tx.status !== 'success') {
    // "abandoned" just means not completed (yet) - only a real failure is final.
    if (tx.status === 'failed' || tx.status === 'reversed') {
      await adminClient.from('fee_payments').update({ status: 'failed' }).eq('id', payment.id).eq('status', 'pending');
      return { ...payment, status: 'failed' };
    }
    return payment;
  }

  if (Number(tx.amount) !== Number(payment.amount_kobo) || tx.currency !== 'NGN') {
    throw new HttpError(409, 'The amount paid does not match this fee. Please contact FoundaXia.');
  }

  const paidAt = tx.paid_at || tx.paidAt || new Date().toISOString();
  const { data: updated, error: payErr } = await adminClient
    .from('fee_payments')
    .update({ status: 'success', channel: tx.channel || null, paid_at: paidAt })
    .eq('id', payment.id)
    .select()
    .maybeSingle();
  checkDb(payErr);

  const { error: feeErr } = await adminClient
    .from('student_fees')
    .update({ status: 'paid', paid_at: paidAt })
    .eq('id', payment.fee_id)
    .eq('status', 'unpaid');
  checkDb(feeErr);

  return updated || { ...payment, status: 'success', paid_at: paidAt };
}

// ---- Parent codes: foundaxia-{object}-{2 digits} ----
// Stored twice: a salted scrypt hash (used to check what the parent types) and an
// AES-256-GCM encrypted copy (so an admin can show it again). The encryption key exists
// only on the server (PARENT_CODE_KEY, falling back to the service role key).

// "Foundaxia-Mango-42", "mango 42", "MANGO42" -> "mango42"
export function normalizeCode(input) {
  return String(input || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^foundaxia/, '');
}

export const isCodeShaped = (normalized) => /^[a-z]{2,20}\d{2}$/.test(normalized);

export function newParentCode() {
  const word = CODE_WORDS[randomInt(0, CODE_WORDS.length)];
  const digits = String(randomInt(0, 100)).padStart(2, '0');
  return { display: `foundaxia-${word}-${digits}`, normalized: `${word}${digits}` };
}

function codeKey() {
  const secret = process.env.PARENT_CODE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new HttpError(500, 'No secret available to protect parent codes');
  return createHash('sha256').update('parent-code:' + secret).digest();
}

export function encryptCode(display) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', codeKey(), iv);
  const data = Buffer.concat([cipher.update(display, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}

// null if it can't be decrypted (e.g. the key changed) - the admin can reset the code.
export function decryptCode(stored) {
  try {
    const [iv, tag, data] = String(stored || '').split('.').map(s => Buffer.from(s, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', codeKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function hashCode(code) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(code), salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function checkCode(code, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(code), Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// ---- Parent session tokens: HMAC-signed, tied to the login, short-lived ----

function sessionKey() {
  const secret = process.env.PARENT_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new HttpError(500, 'No secret available to sign parent sessions');
  return 'parent-session:' + secret;
}

export function signParentToken(userId, studentId, ttlMs) {
  const expiresAt = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ u: String(userId), s: String(studentId), e: expiresAt })).toString('base64url');
  const sig = createHmac('sha256', sessionKey()).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt };
}

// Returns the student id the token unlocks, or throws 401 if it's invalid/expired.
export function readParentToken(token, userId) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) throw new HttpError(401, 'Parent Area is locked');
  const expected = createHmac('sha256', sessionKey()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Parent Area is locked');
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new HttpError(401, 'Parent Area is locked'); }
  if (data.u !== String(userId) || !data.s || Date.now() > data.e) {
    throw new HttpError(401, 'Parent Area session expired. Enter the parent code again.');
  }
  return data.s;
}
