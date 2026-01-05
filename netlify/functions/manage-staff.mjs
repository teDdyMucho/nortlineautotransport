import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl) return { statusCode: 500, body: 'Missing SUPABASE_URL' };
    if (!supabaseAnonKey) return { statusCode: 500, body: 'Missing SUPABASE_ANON_KEY' };
    if (!supabaseServiceRoleKey) return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_ROLE_KEY' };

    const body = event.body ? JSON.parse(event.body) : {};
    const action = String(body?.action ?? '').trim();
    const accessToken = String(body?.access_token ?? '').trim();

    if (!action) return { statusCode: 400, body: 'Missing action' };
    if (!accessToken) return { statusCode: 401, body: 'Missing access_token' };

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user?.id) return { statusCode: 401, body: 'Invalid access_token' };

    const actorId = userData.user.id;

    const { data: actorProfile } = await supabaseAuth
      .from('staff_profiles')
      .select('role, active')
      .eq('user_id', actorId)
      .maybeSingle();

    if (!actorProfile || actorProfile.active !== true || actorProfile.role !== 'admin') {
      return { statusCode: 403, body: 'Forbidden' };
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const now = new Date().toISOString();

    if (action === 'list_employees') {
      const { data, error } = await admin
        .from('staff_profiles')
        .select('user_id, role, active, email, name, created_at, updated_at')
        .eq('role', 'employee')
        .order('created_at', { ascending: false });

      if (error) return { statusCode: 500, body: error.message };
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employees: Array.isArray(data) ? data : [] }),
      };
    }

    if (action === 'create_employee') {
      const email = String(body?.email ?? '').trim();
      const password = String(body?.password ?? '').trim();
      const name = String(body?.name ?? '').trim();

      if (!email) return { statusCode: 400, body: 'Missing email' };
      if (!password || password.length < 6) return { statusCode: 400, body: 'Password must be at least 6 characters' };

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createErr || !created?.user?.id) {
        return { statusCode: 500, body: createErr?.message || 'Failed to create user' };
      }

      const userId = created.user.id;

      const { error: upsertErr } = await admin.from('staff_profiles').upsert(
        {
          user_id: userId,
          role: 'employee',
          active: true,
          email,
          name: name || null,
          updated_at: now,
        },
        { onConflict: 'user_id' }
      );

      if (upsertErr) return { statusCode: 500, body: upsertErr.message };

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, user_id: userId }),
      };
    }

    if (action === 'set_employee_active') {
      const userId = String(body?.user_id ?? '').trim();
      const active = Boolean(body?.active);

      if (!userId) return { statusCode: 400, body: 'Missing user_id' };

      const { error } = await admin
        .from('staff_profiles')
        .update({ active, updated_at: now })
        .eq('user_id', userId)
        .eq('role', 'employee');

      if (error) return { statusCode: 500, body: error.message };

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      };
    }

    if (action === 'reset_employee_password') {
      const userId = String(body?.user_id ?? '').trim();
      const password = String(body?.password ?? '').trim();

      if (!userId) return { statusCode: 400, body: 'Missing user_id' };
      if (!password || password.length < 6) return { statusCode: 400, body: 'Password must be at least 6 characters' };

      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return { statusCode: 500, body: error.message };

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      };
    }

    return { statusCode: 400, body: 'Unsupported action' };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
    };
  }
};
