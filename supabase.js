import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Browser client (singleton)
let _browserClient = null;
export function getSupabase() {
  if (!_browserClient) {
    _browserClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _browserClient;
}

// Server-side client with service role (admin operations only)
export function getServiceSupabase() {
  return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

// Server-side client that reads cookies (for SSR auth)
export function createServerSupabaseClient({ req, res }) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        return req.cookies[name];
      },
      set(name, value, options) {
        res.setHeader('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax`);
      },
      remove(name, options) {
        res.setHeader('Set-Cookie', `${name}=; Path=/; Max-Age=0`);
      },
    },
  });
}
