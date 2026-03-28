import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { getServerSession } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';

export default function AuditPage({ profile }) {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState({ entity: '', user: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let q = getSupabase().from('audit_log').select('*').order('created_at', { ascending: false }).limit(200);
      if (filter.entity) q = q.eq('entity', filter.entity);
      if (filter.user) q = q.ilike('user_email', `%${filter.user}%`);
      const { data } = await q;
      setLogs(data || []);
      setLoading(false);
    }
    load();
  }, [filter]);

  function fmt(dt) {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const actionColors = { create: '#6ec87a', update: '#e0a050', delete: '#e07070', login: '#7aaae0' };

  return (
    <AdminLayout profile={profile} title="Audit Log">
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">FILTER BY ENTITY</label>
            <select className="input" value={filter.entity} onChange={e => setFilter(f => ({ ...f, entity: e.target.value }))}>
              <option value="">All entities</option>
              {['tower', 'unit', 'schedule', 'user'].map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">FILTER BY USER EMAIL</label>
            <input className="input" value={filter.user} onChange={e => setFilter(f => ({ ...f, user: e.target.value }))} placeholder="user@company.com" />
          </div>
          <button className="btn" onClick={() => setFilter({ entity: '', user: '' })}>Clear</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">ACTIVITY LOG ({logs.length} entries)</div>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#334455' }}>Loading…</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 10 }}>{fmt(log.created_at)}</td>
                  <td style={{ fontSize: 10, color: '#aac4dd' }}>{log.user_email || '—'}</td>
                  <td>
                    <span style={{ fontSize: 9, color: actionColors[log.action] || '#aac4dd', letterSpacing: 1 }}>
                      {(log.action || '').toUpperCase()}
                    </span>
                  </td>
                  <td><span style={{ fontSize: 9, color: '#556677', letterSpacing: 1 }}>{(log.entity || '').toUpperCase()}</span></td>
                  <td style={{ fontSize: 11, color: '#7a8fa0' }}>{log.description}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#334455', padding: 32 }}>No activity recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}

export async function getServerSideProps({ req, res }) {
  const { session, profile } = await getServerSession({ req, res });
  if (!session || profile?.role !== 'super_admin') return { redirect: { destination: '/login', permanent: false } };
  return { props: { profile } };
}
