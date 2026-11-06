// Shared helpers for the /api functions. Files starting with "_" are not deployed as
// routes by Vercel, so this is import-only.
import { createClient } from '@supabase/supabase-js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function setCors(res, methods = 'POST,OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Verifies the caller's Supabase access token and returns
// { user, adminClient } where adminClient uses the service role (bypasses RLS).
export async function authenticate(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing or invalid authorization header');
  }
  const token = authHeader.split(' ')[1];

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    throw new HttpError(500, 'Supabase environment variables are missing on the server');
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    throw new HttpError(401, 'Invalid user token: ' + (error?.message || 'User not found'));
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return { user, adminClient };
}

// The profile_id column is added by enable_rls.sql. Until that migration has run,
// queries that mention it fail with "column ... does not exist" (42703); fall back to
// matching on id alone so the app keeps working either way.
export const isMissingColumnError = (err) =>
  Boolean(err) && (err.code === '42703' || /column .*profile_id.* does not exist/i.test(err.message || ''));

// students/tutors rows that refer to someId by id or profile_id.
export async function findPersonRows(adminClient, table, someId) {
  let { data, error } = await adminClient
    .from(table)
    .select('id, profile_id')
    .or(`id.eq.${someId},profile_id.eq.${someId}`);
  if (isMissingColumnError(error)) {
    ({ data, error } = await adminClient.from(table).select('id').eq('id', someId));
  }
  if (error) throw error;
  return data || [];
}

// One students/tutors row by its id, with profile_id when that column exists.
export async function getPersonRow(adminClient, table, id) {
  let { data, error } = await adminClient.from(table).select('id, profile_id').eq('id', id).maybeSingle();
  if (isMissingColumnError(error)) {
    ({ data, error } = await adminClient.from(table).select('id').eq('id', id).maybeSingle());
  }
  if (error) throw error;
  return data;
}

// Every id that refers to this user: the auth uid plus any students/tutors row linked
// to it by id or profile_id (legacy rows can have id <> auth uid).
export async function getUserIds(adminClient, userId) {
  const ids = new Set([String(userId)]);
  const studentIds = [];
  const tutorIds = [];
  for (const [table, bucket] of [['students', studentIds], ['tutors', tutorIds]]) {
    const rows = await findPersonRows(adminClient, table, userId);
    rows.forEach(r => { ids.add(String(r.id)); bucket.push(String(r.id)); });
  }
  return { ids, studentIds, tutorIds };
}

export function sendError(res, err) {
  const status = err instanceof HttpError ? err.status : 500;
  return res.status(status).json({ error: err.message || 'Internal server error' });
}
