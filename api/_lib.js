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

// Every id that refers to this user: the auth uid plus any students/tutors row linked
// to it by id or profile_id (legacy rows can have id <> auth uid).
export async function getUserIds(adminClient, userId) {
  const ids = new Set([String(userId)]);
  const studentIds = [];
  const tutorIds = [];
  for (const [table, bucket] of [['students', studentIds], ['tutors', tutorIds]]) {
    const { data, error } = await adminClient
      .from(table)
      .select('id')
      .or(`id.eq.${userId},profile_id.eq.${userId}`);
    if (error) throw error;
    (data || []).forEach(r => { ids.add(String(r.id)); bucket.push(String(r.id)); });
  }
  return { ids, studentIds, tutorIds };
}

export function sendError(res, err) {
  const status = err instanceof HttpError ? err.status : 500;
  return res.status(status).json({ error: err.message || 'Internal server error' });
}
