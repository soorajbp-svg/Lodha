import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { getServerSession } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';

export default function TowersPage({ profile }) {
  const [towers, setTowers] = useState([]);
  const [form, setForm] = useState({ name: '', possession_date: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    const { data } = await getSupabase().from('towers').select('*').order('name');
    setTowers(data || []);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setMsg(null);
    const sb = getSupabase();
    let error;
    if (editId) {
      ({ error } = await sb.from('towers').update(form).eq('id', editId));
    } else {
      ({ error } = await sb.from('towers').insert(form));
    }
    setSaving(false);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setMsg({ type: 'success', text: editId ? 'Tower updated.' : 'Tower created.' });
    setForm({ name: '', possession_date: '' }); setEditId(null);
    load();
  }

  async function deleteTower(id) {
    if (!confirm('Delete this tower and ALL its units and schedule? This cannot be undone.')) return;
    await getSupabase().from('towers').delete().eq('id', id);
    load();
  }

  function startEdit(t) {
    setEditId(t.id);
    setForm({ name: t.name, possession_date: t.possession_date || '' });
    setMsg(null);
  }

  return (
    <AdminLayout profile={profile} title="Towers">
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
        {/* Form */}
        <div className="card">
          <div className="card-title">{editId ? 'EDIT TOWER' : 'ADD TOWER'}</div>
          {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">TOWER NAME</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. TOWER C" />
            </div>
            <div className="form-group">
              <label className="form-label">POSSESSION DATE</label>
              <input className="input" type="date" value={form.possession_date} onChange={e => setForm(f => ({ ...f, possession_date: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.name}>
                {saving ? 'Saving…' : editId ? 'Update Tower' : 'Add Tower'}
              </button>
              {editId && (
                <button className="btn" onClick={() => { setEditId(null); setForm({ name: '', possession_date: '' }); }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* List */}
        <div className="card">
          <div className="card-title">ALL TOWERS ({towers.length})</div>
          <table className="table">
            <thead>
              <tr>
                <th>Tower Name</th>
                <th>Possession Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {towers.map(t => (
                <tr key={t.id}>
                  <td style={{ color: '#e8d5aa' }}>{t.name}</td>
                  <td>{t.possession_date || <span style={{ color: '#334455' }}>Not set</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm" onClick={() => startEdit(t)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteTower(t.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {towers.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#334455', padding: 28 }}>No towers yet. Add one on the left.</td></tr>
              )}
            </tbody>
          </table>
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
