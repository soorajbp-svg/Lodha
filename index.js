import { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { getServerSession } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';

export default function AdminDashboard({ profile }) {
  const [stats, setStats] = useState({ towers: 0, units: 0, users: 0, schedules: 0 });

  useEffect(() => {
    async function load() {
      const sb = getSupabase();
      const [t, u, us, sc] = await Promise.all([
        sb.from('towers').select('id', { count: 'exact', head: true }),
        sb.from('units').select('id', { count: 'exact', head: true }),
        sb.from('profiles').select('id', { count: 'exact', head: true }),
        sb.from('payment_schedules').select('id', { count: 'exact', head: true }),
      ]);
      setStats({ towers: t.count || 0, units: u.count || 0, users: us.count || 0, schedules: sc.count || 0 });
    }
    load();
  }, []);

  const cards = [
    { label: 'Towers', value: stats.towers, icon: '⬡', href: '/admin/towers' },
    { label: 'Units', value: stats.units, icon: '⊞', href: '/admin/units' },
    { label: 'Users', value: stats.users, icon: '⊙', href: '/admin/users' },
    { label: 'Schedules', value: stats.schedules, icon: '◷', href: '/admin/schedules' },
  ];

  return (
    <AdminLayout profile={profile} title="Dashboard">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {cards.map(c => (
          <a key={c.label} href={c.href} style={s.statCard}>
            <div style={s.statIcon}>{c.icon}</div>
            <div style={s.statValue}>{c.value}</div>
            <div style={s.statLabel}>{c.label}</div>
          </a>
        ))}
      </div>

      <div className="card">
        <div className="card-title">QUICK LINKS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { href: '/admin/towers', label: 'Add a new tower', desc: 'Set possession date and tower name' },
            { href: '/admin/units', label: 'Upload pricing', desc: 'Import Excel file or edit manually' },
            { href: '/admin/schedules', label: 'Set payment schedule', desc: 'Configure milestones per tower' },
            { href: '/admin/users', label: 'Manage users', desc: 'Add users, assign roles and towers' },
          ].map(l => (
            <a key={l.href} href={l.href} style={s.quickLink}>
              <div style={s.quickLinkLabel}>{l.label}</div>
              <div style={s.quickLinkDesc}>{l.desc}</div>
            </a>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}

export async function getServerSideProps({ req, res }) {
  const { session, profile } = await getServerSession({ req, res });
  if (!session || profile?.role !== 'super_admin') return { redirect: { destination: '/login', permanent: false } };
  return { props: { profile } };
}

const s = {
  statCard: {
    background: '#0c1927', border: '1px solid #1a2d42', borderRadius: 8,
    padding: '20px', cursor: 'pointer', transition: 'border-color 0.15s',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  statIcon: { fontSize: 20, color: '#C9A84C' },
  statValue: { fontFamily: "'Cormorant Garamond', serif", fontSize: 36, color: '#e8d5aa', fontWeight: 700 },
  statLabel: { fontSize: 9, color: '#556677', letterSpacing: 2 },
  quickLink: {
    background: '#0a1620', border: '1px solid #1a2d42', borderRadius: 6,
    padding: '14px 16px', cursor: 'pointer', display: 'block',
  },
  quickLinkLabel: { fontSize: 12, color: '#aac4dd', marginBottom: 4 },
  quickLinkDesc: { fontSize: 10, color: '#445566' },
};
