import { requireAuth } from '../../../lib/auth';
import { getServiceSupabase } from '../../../lib/supabase';

export const config = { api: { bodyParser: true } };

export default requireAuth(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { tower_id, units } = req.body;
  if (!tower_id || !Array.isArray(units)) return res.status(400).json({ error: 'Invalid payload' });

  const sb = getServiceSupabase();

  // Replace all units for this tower
  await sb.from('units').delete().eq('tower_id', tower_id);
  const { error } = await sb.from('units').insert(units.map(u => ({ ...u, tower_id })));
  if (error) return res.status(500).json({ error: error.message });

  // Audit
  await sb.from('audit_log').insert({
    user_id: req.profile.id,
    user_email: req.profile.email,
    action: 'update',
    entity: 'unit',
    description: `Uploaded ${units.length} units for tower ${tower_id}`,
  });

  res.json({ ok: true });
}, { roles: ['super_admin'] });
