import { randomInt, randomUUID } from 'node:crypto';
import { authenticate, getUserIds, setCors, sendError, HttpError } from './_lib.js';
import {
  paystack, confirmPayment, checkDb, hashCode, checkCode, signParentToken, readParentToken
} from './_paystack.js';

// Parent Area: a code-protected section of the student dashboard where parents see and
// pay fees. Fees and codes live in tables the browser can't read (see parent_area.sql);
// everything goes through here.
//
// Parent actions (signed-in student login):
//   status                       -> { hasCode, lockedUntil }
//   unlock   { code }            -> { token, expiresAt }       (5 wrong tries = 15 min lock)
//   fees     { token }           -> { fees, payments }
//   pay      { token, feeId }    -> { accessCode, authorizationUrl, reference }
//   pay-custom { token, amount, description }  -> same; the parent chooses the amount
//   verify   { reference }       -> { status }
// Admin actions (profile role 'admin'):
//   admin-student       { studentId }                               -> { hasCode, codeSetAt, fees, payments }
//   admin-generate-code { studentId }                               -> { code }   (shown once)
//   admin-add-fee       { studentId, description, amount, dueDate } -> { fee }
//   admin-cancel-fee    { feeId }
//   admin-mark-paid     { feeId, note }                             (cash / bank transfer)

const SESSION_MS = 10 * 60 * 1000;
const MAX_TRIES = 5;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FEE_NAIRA = 10_000_000;

async function isAdmin(adminClient, userId) {
  const { data } = await adminClient.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'admin';
}

async function myStudentId(adminClient, userId) {
  const { studentIds } = await getUserIds(adminClient, userId);
  if (studentIds.length === 0) throw new HttpError(403, 'This login is not linked to a student');
  return studentIds[0];
}

async function feesFor(adminClient, studentId) {
  const { data: fees, error } = await adminClient
    .from('student_fees').select('*').eq('student_id', studentId).order('created_at', { ascending: false });
  checkDb(error);
  const { data: payments, error: payErr } = await adminClient
    .from('fee_payments').select('*').eq('student_id', studentId).eq('status', 'success').order('paid_at', { ascending: false });
  checkDb(payErr);
  // Hide parent-initiated payments that were never completed.
  const visible = (fees || []).filter(f => !(f.parent_initiated && f.status !== 'paid'));
  return { fees: visible, payments: payments || [] };
}

async function getFee(adminClient, feeId) {
  if (typeof feeId !== 'string' || !feeId) throw new HttpError(400, 'feeId is required');
  const { data, error } = await adminClient.from('student_fees').select('*').eq('id', feeId).maybeSingle();
  checkDb(error);
  if (!data) throw new HttpError(404, 'Fee not found');
  return data;
}

function siteOrigin(req) {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\//.test(origin)) return origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `https://${host}` : '';
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user, adminClient } = await authenticate(req);
    const { action, ...p } = req.body || {};

    // ---------------- Admin ----------------
    if (typeof action === 'string' && action.startsWith('admin-')) {
      if (!(await isAdmin(adminClient, user.id))) throw new HttpError(403, 'Forbidden: Admin role required');

      if (action === 'admin-student') {
        if (!p.studentId) throw new HttpError(400, 'studentId is required');
        const { data: access, error } = await adminClient
          .from('parent_access').select('updated_at').eq('student_id', String(p.studentId)).maybeSingle();
        checkDb(error);
        const { fees, payments } = await feesFor(adminClient, String(p.studentId));
        return res.status(200).json({ hasCode: !!access, codeSetAt: access?.updated_at || null, fees, payments });
      }

      if (action === 'admin-generate-code') {
        if (!p.studentId) throw new HttpError(400, 'studentId is required');
        const { data: student } = await adminClient.from('students').select('id').eq('id', p.studentId).maybeSingle();
        if (!student) throw new HttpError(404, 'Student not found');
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        const { error } = await adminClient.from('parent_access').upsert({
          student_id: String(student.id),
          code_hash: hashCode(code),
          failed_attempts: 0,
          locked_until: null,
          updated_at: new Date().toISOString()
        });
        checkDb(error);
        return res.status(200).json({ code });
      }

      if (action === 'admin-add-fee') {
        const description = String(p.description || '').trim();
        const amount = Number(p.amount);
        if (!p.studentId) throw new HttpError(400, 'studentId is required');
        if (!description || description.length > 200) throw new HttpError(400, 'Enter what the fee is for (max 200 characters)');
        if (!Number.isFinite(amount) || amount < 100 || amount > MAX_FEE_NAIRA) {
          throw new HttpError(400, 'Amount must be between ₦100 and ₦10,000,000');
        }
        const dueDate = p.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(p.dueDate) ? p.dueDate : null;
        const { data, error } = await adminClient.from('student_fees').insert([{
          student_id: String(p.studentId),
          description,
          amount_kobo: Math.round(amount * 100),
          due_date: dueDate
        }]).select().single();
        checkDb(error);
        return res.status(200).json({ fee: data });
      }

      if (action === 'admin-cancel-fee') {
        const fee = await getFee(adminClient, p.feeId);
        if (fee.status !== 'unpaid') throw new HttpError(409, 'Only unpaid fees can be cancelled');
        const { error } = await adminClient.from('student_fees').update({ status: 'cancelled' }).eq('id', fee.id);
        checkDb(error);
        return res.status(200).json({ ok: true });
      }

      if (action === 'admin-mark-paid') {
        const fee = await getFee(adminClient, p.feeId);
        if (fee.status !== 'unpaid') throw new HttpError(409, 'This fee is not unpaid');
        const paidAt = new Date().toISOString();
        const { error: payErr } = await adminClient.from('fee_payments').insert([{
          fee_id: fee.id,
          student_id: fee.student_id,
          reference: `MANUAL-${randomUUID()}`,
          amount_kobo: fee.amount_kobo,
          status: 'success',
          channel: 'manual',
          note: String(p.note || '').slice(0, 300) || null,
          paid_at: paidAt
        }]);
        checkDb(payErr);
        const { error } = await adminClient.from('student_fees').update({ status: 'paid', paid_at: paidAt }).eq('id', fee.id);
        checkDb(error);
        return res.status(200).json({ ok: true });
      }

      throw new HttpError(400, 'Unknown action');
    }

    // ---------------- Parent ----------------
    const studentId = await myStudentId(adminClient, user.id);

    if (action === 'status') {
      const { data, error } = await adminClient
        .from('parent_access').select('locked_until').eq('student_id', studentId).maybeSingle();
      checkDb(error);
      const lockedUntil = data?.locked_until && new Date(data.locked_until) > new Date() ? data.locked_until : null;
      return res.status(200).json({ hasCode: !!data, lockedUntil });
    }

    if (action === 'unlock') {
      const code = String(p.code || '');
      if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'Enter the 6-digit parent code');
      const { data: access, error } = await adminClient
        .from('parent_access').select('*').eq('student_id', studentId).maybeSingle();
      checkDb(error);
      if (!access) throw new HttpError(404, 'No parent code has been set up yet. Ask FoundaXia for one.');
      if (access.locked_until && new Date(access.locked_until) > new Date()) {
        const mins = Math.ceil((new Date(access.locked_until) - Date.now()) / 60000);
        throw new HttpError(429, `Too many wrong attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
      }
      if (!checkCode(code, access.code_hash)) {
        const tries = (access.failed_attempts || 0) + 1;
        const locked = tries >= MAX_TRIES;
        await adminClient.from('parent_access').update({
          failed_attempts: locked ? 0 : tries,
          locked_until: locked ? new Date(Date.now() + LOCK_MS).toISOString() : null
        }).eq('student_id', studentId);
        throw new HttpError(401, locked
          ? 'Too many wrong attempts. The Parent Area is locked for 15 minutes.'
          : `Incorrect code. ${MAX_TRIES - tries} attempt${MAX_TRIES - tries === 1 ? '' : 's'} left.`);
      }
      if (access.failed_attempts) {
        await adminClient.from('parent_access').update({ failed_attempts: 0 }).eq('student_id', studentId);
      }
      return res.status(200).json(signParentToken(user.id, studentId, SESSION_MS));
    }

    if (action === 'fees') {
      const sid = readParentToken(p.token, user.id);
      return res.status(200).json(await feesFor(adminClient, sid));
    }

    if (action === 'pay' || action === 'pay-custom') {
      const sid = readParentToken(p.token, user.id);
      let fee;
      if (action === 'pay') {
        fee = await getFee(adminClient, p.feeId);
        if (fee.student_id !== sid) throw new HttpError(404, 'Fee not found');
        if (fee.status !== 'unpaid') throw new HttpError(409, 'This fee has already been paid or cancelled');
      } else {
        // Parent chooses the amount. Recorded as a fee flagged parent_initiated; until it's
        // paid it stays hidden, so an abandoned attempt never shows up as money owed.
        const amount = Number(p.amount);
        if (!Number.isFinite(amount) || amount < 100 || amount > MAX_FEE_NAIRA) {
          throw new HttpError(400, 'Enter an amount between ₦100 and ₦10,000,000');
        }
        const description = String(p.description || '').trim().slice(0, 200) || 'Tuition payment';
        const { data, error } = await adminClient.from('student_fees').insert([{
          student_id: sid, description, amount_kobo: Math.round(amount * 100), parent_initiated: true
        }]).select().single();
        checkDb(error);
        fee = data;
      }

      const { data: student } = await adminClient.from('students').select('full_name').eq('id', sid).maybeSingle();
      const reference = `FX-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const { error } = await adminClient.from('fee_payments').insert([{
        fee_id: fee.id, student_id: sid, reference, amount_kobo: fee.amount_kobo, status: 'pending'
      }]);
      checkDb(error);

      const origin = siteOrigin(req);
      const tx = await paystack('/transaction/initialize', {
        method: 'POST',
        body: {
          email: user.email,
          amount: fee.amount_kobo,
          currency: 'NGN',
          reference,
          ...(origin ? { callback_url: `${origin}/student` } : {}),
          metadata: {
            fee_id: fee.id,
            student_id: sid,
            custom_fields: [
              { display_name: 'Student', variable_name: 'student', value: student?.full_name || sid },
              { display_name: 'For', variable_name: 'fee', value: fee.description }
            ]
          }
        }
      });
      return res.status(200).json({ accessCode: tx.access_code, authorizationUrl: tx.authorization_url, reference });
    }

    if (action === 'verify') {
      const reference = String(p.reference || '');
      if (!reference) throw new HttpError(400, 'reference is required');
      const { data: payment, error } = await adminClient
        .from('fee_payments').select('student_id').eq('reference', reference).maybeSingle();
      checkDb(error);
      if (!payment || payment.student_id !== studentId) throw new HttpError(404, 'Payment not found');
      const result = await confirmPayment(adminClient, reference);
      return res.status(200).json({ status: result.status });
    }

    throw new HttpError(400, 'Unknown action');
  } catch (err) {
    if (!(err instanceof HttpError) || err.status >= 500) console.error('parent api error:', err);
    return sendError(res, err);
  }
}
