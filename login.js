import { useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabase } from '../lib/supabase';
import { getServerSession } from '../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = getSupabase();
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) { setError(authError.message); setLoading(false); return; }

    // fetch profile to route correctly
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
    if (profile?.role === 'super_admin') router.push('/admin');
    else router.push('/calculator');
  }

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.logo}>◈</div>
        <div style={styles.title}>NPV LOSS CALCULATOR</div>
        <div style={styles.sub}>Payment Deviation Analysis Platform</div>

        <form onSubmit={handleLogin} style={styles.form}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label className="form-label">EMAIL</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">PASSWORD</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <div style={styles.footer}>Access is restricted to authorised personnel only.</div>
      </div>
    </div>
  );
}

export async function getServerSideProps({ req, res }) {
  const { session, profile } = await getServerSession({ req, res });
  if (session && profile) {
    return { redirect: { destination: profile.role === 'super_admin' ? '/admin' : '/calculator', permanent: false } };
  }
  return { props: {} };
}

const styles = {
  root: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#08111c',
    backgroundImage: 'radial-gradient(ellipse at 20% 50%, #0d1f3088 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, #1a2d0888 0%, transparent 50%)',
  },
  card: {
    width: 380, background: '#0c1927', border: '1px solid #1a2d42',
    borderRadius: 12, padding: '40px 36px', textAlign: 'center',
  },
  logo: { fontSize: 32, color: '#C9A84C', marginBottom: 16 },
  title: { fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 700, letterSpacing: 3, color: '#e8d5aa', marginBottom: 6 },
  sub: { fontSize: 10, color: '#445566', letterSpacing: 1, marginBottom: 32 },
  form: { display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' },
  footer: { marginTop: 24, fontSize: 9, color: '#334455', letterSpacing: 0.5 },
};
