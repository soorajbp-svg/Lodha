import { createServerSupabaseClient } from './supabase';

export async function getServerSession({ req, res }) {
  const supabase = createServerSupabaseClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { session: null, profile: null, supabase };

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  return { session, profile, supabase };
}

export function requireAuth(handler, { roles } = {}) {
  return async (req, res) => {
    const { session, profile } = await getServerSession({ req, res });
    if (!session || !profile) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (roles && !roles.includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.session = session;
    req.profile = profile;
    return handler(req, res);
  };
}
