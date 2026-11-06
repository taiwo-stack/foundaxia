import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 1. Get access token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = authHeader.split(' ')[1];

  // 2. Resolve database credentials
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase environment variables are missing on the server' });
  }

  // 3. Initialize user-context Supabase client to authenticate the caller
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  // Fetch the caller's identity
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return res.status(401).json({ error: 'Invalid user token: ' + (userError?.message || 'User not found') });
  }

  // Verify caller's role is 'admin' inside profiles table
  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin role required' });
  }

  // 4. Initialize administrative client with Service Role Key
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { action, ...payload } = req.body;
  const targetRole = action === 'createTutorAccount' ? 'tutor' : 'student';

  try {
    if (action === 'createStudentAccount') {
      const { email, password, studentData } = payload;

      let authUserId = null;
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (authError) {
        if (authError.message && authError.message.toLowerCase().includes('already')) {
          const { data: profileRow } = await adminClient
            .from('profiles')
            .select('id')
            .eq('email', email.toLowerCase())
            .maybeSingle();

          if (profileRow) {
            authUserId = profileRow.id;
          } else {
            const { data: userList, error: listError } = await adminClient.auth.admin.listUsers();
            if (!listError && userList && userList.users) {
              const existingUser = userList.users.find(u => u.email.toLowerCase() === email.toLowerCase());
              if (existingUser) {
                authUserId = existingUser.id;
              }
            }
          }

          if (authUserId) {
            // Never repurpose an existing admin/tutor account (that would reset their
            // password and demote them) just because the same email was typed here.
            const { data: existingProfile } = await adminClient
              .from('profiles')
              .select('role')
              .eq('id', authUserId)
              .maybeSingle();
            if (existingProfile && existingProfile.role && existingProfile.role !== targetRole) {
              return res.status(409).json({
                error: `An account with this email already exists as a ${existingProfile.role}. Use a different email.`
              });
            }
            await adminClient.auth.admin.updateUserById(authUserId, { password });
          }
        }
        if (!authUserId) throw authError;
      } else if (authData?.user) {
        authUserId = authData.user.id;
      }

      // Only clear out pending lead rows for this email once the auth account exists,
      // so a failed createUser (weak password, rate limit) doesn't destroy the lead.
      const { error: tempDelError } = await adminClient
        .from('students')
        .delete()
        .eq('email', email)
        .neq('id', authUserId);
      if (tempDelError) throw tempDelError;

      const { error: profError } = await adminClient.from('profiles').upsert([
        {
          id: authUserId,
          email,
          role: 'student',
          full_name: studentData.full_name
        }
      ]);
      if (profError) throw profError;

      const { profile_id, ...cleanStudentData } = studentData;
      if (cleanStudentData.date_of_birth === '' || cleanStudentData.date_of_birth === null) {
        cleanStudentData.date_of_birth = new Date().toISOString().split('T')[0];
      }
      if (cleanStudentData.start_date === '' || cleanStudentData.start_date === null) {
        cleanStudentData.start_date = new Date().toISOString().split('T')[0];
      }

      const { data: student, error: studentError } = await adminClient.from('students').insert([
        {
          id: authUserId,
          email,
          status: 'approved',
          ...cleanStudentData
        }
      ]).select();
      if (studentError) throw studentError;

      return res.status(200).json(student[0]);

    } else if (action === 'activateStudentAccount') {
      const { studentId, email, password } = payload;
      let authUserId = null;

      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      let authUser = authData?.user;
      if (authError) {
        if (authError.message && authError.message.toLowerCase().includes('already')) {
          const { data: profileRow } = await adminClient
            .from('profiles')
            .select('id')
            .eq('email', email.toLowerCase())
            .maybeSingle();

          if (profileRow) {
            authUserId = profileRow.id;
          } else {
            const { data: userList, error: listError } = await adminClient.auth.admin.listUsers();
            if (!listError && userList && userList.users) {
              const existingUser = userList.users.find(u => u.email.toLowerCase() === email.toLowerCase());
              if (existingUser) {
                authUserId = existingUser.id;
              }
            }
          }

          if (authUserId) {
            // Never repurpose an existing admin/tutor account (that would reset their
            // password and demote them) just because the same email was typed here.
            const { data: existingProfile } = await adminClient
              .from('profiles')
              .select('role')
              .eq('id', authUserId)
              .maybeSingle();
            if (existingProfile && existingProfile.role && existingProfile.role !== targetRole) {
              return res.status(409).json({
                error: `An account with this email already exists as a ${existingProfile.role}. Use a different email.`
              });
            }
            await adminClient.auth.admin.updateUserById(authUserId, { password });
          }
        }
        if (!authUserId) throw authError;
      } else if (authUser) {
        authUserId = authUser.id;
      }

      const { data: studentRow, error: getError } = await adminClient
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();
      if (getError) throw getError;

      const { error: profError } = await adminClient.from('profiles').upsert([
        {
          id: authUserId,
          email,
          role: 'student',
          full_name: studentRow.full_name
        }
      ]);
      if (profError) throw profError;

      const { error: deleteError } = await adminClient
        .from('students')
        .delete()
        .eq('id', studentId);
      if (deleteError) throw deleteError;

      const { profiles, ...studentWithoutRelations } = studentRow;
      const { data: student, error: studentInsertError } = await adminClient.from('students').upsert([
        {
          ...studentWithoutRelations,
          id: authUserId,
          email,
          status: 'approved'
        }
      ]).select();
      if (studentInsertError) throw studentInsertError;

      return res.status(200).json(student[0]);

    } else if (action === 'resetUserPassword') {
      const { userId, newPassword } = payload;
      const { data, error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) throw error;
      return res.status(200).json(data);

    } else if (action === 'createTutorAccount') {
      const { email, password, tutorData } = payload;
      let authUserId = null;
      let isNewUser = false;

      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      let authUser = authData?.user;
      if (authError) {
        if (authError.message && authError.message.toLowerCase().includes('already')) {
          const { data: profileRow } = await adminClient
            .from('profiles')
            .select('id')
            .eq('email', email.toLowerCase())
            .maybeSingle();

          if (profileRow) {
            authUserId = profileRow.id;
          } else {
            const { data: userList, error: listError } = await adminClient.auth.admin.listUsers();
            if (!listError && userList && userList.users) {
              const existingUser = userList.users.find(u => u.email.toLowerCase() === email.toLowerCase());
              if (existingUser) {
                authUserId = existingUser.id;
              }
            }
          }

          if (authUserId) {
            // Never repurpose an existing admin/tutor account (that would reset their
            // password and demote them) just because the same email was typed here.
            const { data: existingProfile } = await adminClient
              .from('profiles')
              .select('role')
              .eq('id', authUserId)
              .maybeSingle();
            if (existingProfile && existingProfile.role && existingProfile.role !== targetRole) {
              return res.status(409).json({
                error: `An account with this email already exists as a ${existingProfile.role}. Use a different email.`
              });
            }
            await adminClient.auth.admin.updateUserById(authUserId, { password });
          }
        }
        if (!authUserId) throw authError;
      } else if (authUser) {
        authUserId = authUser.id;
        isNewUser = true;
      }

      try {
        const { error: profError } = await adminClient.from('profiles').upsert([
          {
            id: authUserId,
            email,
            role: 'tutor',
            full_name: tutorData.full_name
          }
        ]);
        if (profError) throw profError;

        const { profile_id, ...cleanTutorData } = tutorData;
        const { data: tutor, error: tutorError } = await adminClient.from('tutors').upsert([
          {
            id: authUserId,
            rating: 5.0,
            ...cleanTutorData
          }
        ]).select();
        if (tutorError) throw tutorError;

        return res.status(200).json(tutor[0]);
      } catch (err) {
        if (authUserId && isNewUser) {
          await adminClient.auth.admin.deleteUser(authUserId).catch(() => {});
        }
        throw err;
      }

    } else {
      return res.status(400).json({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || JSON.stringify(err) });
  }
}
