import { requireAuth } from '../../../lib/auth';
import { getServiceSupabase } from '../../../lib/supabase';

export const config = { api: { bodyParser: true } };

export default requireAuth(async function handler(req, res) {
  const sb = getServiceSupabase();

  if (req.method === 'POST') {
    const { email, password, name, role, tower_ids = [] } = req.body;
    if (!email || !password || !role) return res.status(400).json({ error: 'email, password and role are required' });

    // Create auth user
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email, password,
      email_confirm: true,
      user_metadata: { role, name },
    });
    if (authErr) return res.status(400).json({ error: authErr.message });

    // Update profile (trigger creates it, we update name/role)
    await sb.from('profiles').update({ name, role }).eq('id', authData.user.id);

    // Tower access
    if (role === 'site_head' && tower_ids.length > 0) {
      await sb.from('user_tower_access').insert(tower_ids.map(tid => ({ user_id: authData.user.id, tower_id: tid })));
    }

    await sb.from('audit_log').insert({
      user_id: req.profile.id, user_email: req.profile.email,
      action: 'create', entity: 'user',
      description: `Created user ${email} with role ${role}`,
    });

    return res.json({ ok: true });
  }

  if (req.method === 'PATCH') {
    const { user_id, tower_ids } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    await sb.from('user_tower_access').delete().eq('user_id', user_id);
    if (tower_ids?.length > 0) {
      await sb.from('user_tower_access').insert(tower_ids.map(tid => ({ user_id, tower_id: tid })));
    }
    await sb.from('audit_log').insert({
      user_id: req.profile.id, user_email: req.profile.email,
      action: 'update', entity: 'user',
      description: `Updated tower access for user ${user_id}`,
    });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const { error } = await sb.auth.admin.deleteUser(user_id);
    if (error) return res.status(500).json({ error: error.message });
    await sb.from('audit_log').insert({
      user_id: req.profile.id, user_email: req.profile.email,
      action: 'delete', entity: 'user',
      description: `Deleted user ${user_id}`,
    });
    return res.json({ ok: true });
  }

  res.status(405).end();
}, { roles: ['super_admin'] });
