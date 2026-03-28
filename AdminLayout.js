import { useRouter } from 'next/router';
import { getSupabase } from '../lib/supabase';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '◈' },
  { href: '/admin/towers', label: 'Towers', icon: '⬡' },
  { href: '/admin/units', label: 'Units & Pricing', icon: '⊞' },
  { href: '/admin/schedules', label: 'Payment Schedules', icon: '◷' },
  { href: '/admin/users', label: 'Users', icon: '⊙' },
  { href: '/admin/audit', label: 'Audit Log', icon: '◉' },
];

export default function AdminLayout({ children, profile, title }) {
  const router = useRouter();

  async function logout() {
    await getSupabase().auth.signOut();
    router.push('/login');
  }

  return (
    <div style={s.root}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarTop}>
          <div style={s.logo}>◈</div>
          <div style={s.logoTitle}>NPV TOOL</div>
          <div style={s.logoSub}>Admin Panel</div>
        </div>
        <nav style={s.nav}>
          {NAV.map(item => (
            <a
              key={item.href}
              href={item.href}
              style={{ ...s.navItem, ...(router.pathname === item.href ? s.navActive : {}) }}
            >
              <span style={s.navIcon}>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <div style={s.sidebarBottom}>
          <div style={s.userInfo}>
            <div style={s.userEmail}>{profile?.email}</div>
            <div style={s.userRole}>SUPER ADMIN</div>
          </div>
          <button className="btn btn-sm" onClick={logout} style={{ width: '100%', marginTop: 8 }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>
        <div style={s.header}>
          <div style={s.headerTitle}>{title}</div>
        </div>
        <div style={s.content}>{children}</div>
      </div>
    </div>
  );
}

const s = {
  root: { display: 'flex', minHeight: '100vh', background: '#08111c' },
  sidebar: {
    width: 220, background: '#0c1927', borderRight: '1px solid #1a2d42',
    display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'sticky', top: 0, height: '100vh',
  },
  sidebarTop: { padding: '28px 20px 20px', borderBottom: '1px solid #1a2d42' },
  logo: { fontSize: 24, color: '#C9A84C' },
  logoTitle: { fontFamily: "'Cormorant Garamond', serif", fontSize: 16, letterSpacing: 2, color: '#e8d5aa', marginTop: 6 },
  logoSub: { fontSize: 9, color: '#445566', letterSpacing: 1.5, marginTop: 2 },
  nav: { flex: 1, padding: '12px 0', overflowY: 'auto' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
    fontSize: 11, color: '#667788', letterSpacing: 0.5, transition: 'all 0.15s', cursor: 'pointer',
  },
  navActive: { color: '#C9A84C', background: '#C9A84C11', borderRight: '2px solid #C9A84C' },
  navIcon: { fontSize: 14, width: 18, textAlign: 'center' },
  sidebarBottom: { padding: '16px 20px', borderTop: '1px solid #1a2d42' },
  userInfo: { marginBottom: 4 },
  userEmail: { fontSize: 10, color: '#aac4dd', wordBreak: 'break-all' },
  userRole: { fontSize: 8, color: '#C9A84C', letterSpacing: 1.5, marginTop: 2 },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    padding: '20px 28px', borderBottom: '1px solid #1a2d42',
    background: '#0a1620', flexShrink: 0,
  },
  headerTitle: { fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#e8d5aa', letterSpacing: 1 },
  content: { flex: 1, padding: '28px', overflowY: 'auto' },
};
