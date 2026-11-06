import { authenticate, getPersonRow, isMissingColumnError, setCors, sendError, HttpError } from './_lib.js';

// Admin-only account management. Every action requires the caller's profile role to be
// 'admin'; the work itself uses the service-role client.

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

// Find an existing auth user id for an email: profiles first (case-insensitive), then
// every page of auth users (listUsers is paginated - the first page alone misses users).
async function findAuthUserIdByEmail(adminClient, email) {
  const { data: profileRow } = await adminClient
    .from('profiles')
    .select('id')
    .ilike('email', escapeLike(email))
    .maybeSingle();
  if (profileRow) return profileRow.id;

  const perPage = 1000;
  for (let page = 1; page < 100; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (users.length < perPage) break;
  }
  return null;
}

// Create a login for `email`, or reuse the existing one - but only if that existing
// account already has `targetRole` (or no role yet). Never repurpose an admin/tutor
// account: that would reset their password and demote them.
async function findOrCreateAuthUser(adminClient, email, password, targetRole) {
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (!authError && authData?.user) return { authUserId: authData.user.id, isNewUser: true };

  if (!authError || !(authError.message || '').toLowerCase().includes('already')) {
    throw authError || new Error('Could not create login');
  }

  const authUserId = await findAuthUserIdByEmail(adminClient, email);
  if (!authUserId) throw authError;

  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', authUserId)
    .maybeSingle();
  if (existingProfile?.role && existingProfile.role !== targetRole) {
    throw new HttpError(409, `An account with this email already exists as a ${existingProfile.role}. Use a different email.`);
  }

  const { error: pwError } = await adminClient.auth.admin.updateUserById(authUserId, { password });
  if (pwError) throw pwError;
  return { authUserId, isNewUser: false };
}

// students/tutors rows created through this API have id = auth uid; legacy/activated
// rows link to their login via profile_id instead.
async function resolveAuthUserId(adminClient, id) {
  for (const table of ['students', 'tutors']) {
    const data = await getPersonRow(adminClient, table, id);
    if (data) return data.profile_id || data.id;
  }
  return id;
}

export default async function handler(req, res) {
  setCors(res, 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user, adminClient } = await authenticate(req);

    const { data: callerProfile, error: callerErr } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (callerErr || callerProfile?.role !== 'admin') {
      throw new HttpError(403, 'Forbidden: Admin role required');
    }

    const { action, ...payload } = req.body || {};

    if (action === 'createStudentAccount') {
      const { email, password, studentData } = payload;
      const { authUserId } = await findOrCreateAuthUser(adminClient, email, password, 'student');

      // Clear pending lead rows for this email only now that the login exists, so a
      // failed createUser (weak password, rate limit) doesn't destroy the lead.
      const { error: tempDelError } = await adminClient
        .from('students')
        .delete()
        .eq('email', email)
        .eq('status', 'pending')
        .neq('id', authUserId);
      if (tempDelError) throw tempDelError;

      const { error: profError } = await adminClient.from('profiles').upsert([
        { id: authUserId, email, role: 'student', full_name: studentData.full_name }
      ]);
      if (profError) throw profError;

      // eslint-disable-next-line no-unused-vars
      const { profile_id, ...cleanStudentData } = studentData;
      // Missing dates stay NULL rather than pretending to be today's date.
      if (!cleanStudentData.date_of_birth) cleanStudentData.date_of_birth = null;
      if (!cleanStudentData.start_date) cleanStudentData.start_date = null;

      const { data: student, error: studentError } = await adminClient.from('students').upsert([
        { ...cleanStudentData, id: authUserId, email, status: 'approved' }
      ]).select();
      if (studentError) throw studentError;
      return res.status(200).json(student[0]);
    }

    if (action === 'activateStudentAccount') {
      const { studentId, email, password } = payload;

      const { data: studentRow, error: getError } = await adminClient
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();
      if (getError) throw getError;

      const { authUserId } = await findOrCreateAuthUser(adminClient, email, password, 'student');

      const { error: profError } = await adminClient.from('profiles').upsert([
        { id: authUserId, email, role: 'student', full_name: studentRow.full_name }
      ]);
      if (profError) throw profError;

      // Link the existing row to the login via profile_id instead of deleting it and
      // re-inserting it under a new id - that orphaned (or cascade-deleted) the student's
      // enrollments, schedules, submissions, attendance and chat history.
      const { data: student, error: updError } = await adminClient
        .from('students')
        .update({ profile_id: String(authUserId), email, status: 'approved' })
        .eq('id', studentId)
        .select();
      if (isMissingColumnError(updError)) {
        throw new HttpError(500, 'The database is missing the students.profile_id column. Run enable_rls.sql in the Supabase SQL editor, then try again.');
      }
      if (updError) throw updError;
      return res.status(200).json(student[0]);
    }

    if (action === 'resetUserPassword') {
      const { userId, newPassword } = payload;
      const authUserId = await resolveAuthUserId(adminClient, userId);
      const { data, error } = await adminClient.auth.admin.updateUserById(authUserId, { password: newPassword });
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (action === 'createTutorAccount') {
      const { email, password, tutorData } = payload;
      const { authUserId, isNewUser } = await findOrCreateAuthUser(adminClient, email, password, 'tutor');

      try {
        const { error: profError } = await adminClient.from('profiles').upsert([
          { id: authUserId, email, role: 'tutor', full_name: tutorData.full_name }
        ]);
        if (profError) throw profError;

        // eslint-disable-next-line no-unused-vars
        const { profile_id, ...cleanTutorData } = tutorData;
        const { data: tutor, error: tutorError } = await adminClient.from('tutors').upsert([
          { id: authUserId, rating: 5.0, ...cleanTutorData }
        ]).select();
        if (tutorError) throw tutorError;
        return res.status(200).json(tutor[0]);
      } catch (err) {
        if (isNewUser) await adminClient.auth.admin.deleteUser(authUserId).catch(() => {});
        throw err;
      }
    }

    if (action === 'deleteUserAccount') {
      const { kind, id } = payload;
      const table = kind === 'student' ? 'students' : kind === 'tutor' ? 'tutors' : null;
      if (!table || !id) throw new HttpError(400, 'kind (student|tutor) and id are required');

      const row = await getPersonRow(adminClient, table, id);
      if (!row) throw new HttpError(404, `${kind} not found`);

      const authUserId = row.profile_id || row.id;
      const { data: profile } = await adminClient.from('profiles').select('id, role').eq('id', authUserId).maybeSingle();
      if (profile?.role === 'admin') throw new HttpError(409, 'Refusing to delete an admin account');
      if (String(authUserId) === String(user.id)) throw new HttpError(409, 'You cannot delete your own account');

      // Enrollment / course-assignment rows are meaningless without the person.
      if (kind === 'student') {
        await adminClient.from('student_courses').delete().eq('student_id', id);
      } else {
        await adminClient.from('course_tutors').delete().eq('tutor_id', id);
      }

      const { error: delErr } = await adminClient.from(table).delete().eq('id', id);
      if (delErr) throw delErr;

      if (profile) {
        const { error: profDelErr } = await adminClient.from('profiles').delete().eq('id', authUserId);
        if (profDelErr) throw profDelErr;
        const { error: authDelErr } = await adminClient.auth.admin.deleteUser(String(authUserId));
        if (authDelErr && !/not.?found/i.test(authDelErr.message || '')) throw authDelErr;
      }
      return res.status(200).json({ deleted: true, loginRemoved: !!profile });
    }

    throw new HttpError(400, 'Unknown action: ' + action);
  } catch (err) {
    return sendError(res, err);
  }
}
