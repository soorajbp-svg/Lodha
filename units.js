import { useState, useEffect, useRef } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { getServerSession } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';

export default function UnitsPage({ profile }) {
  const [towers, setTowers] = useState([]);
  const [selectedTower, setSelectedTower] = useState('');
  const [units, setUnits] = useState([]);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [editUnit, setEditUnit] = useState(null);
  const [tab, setTab] = useState('upload'); // 'upload' | 'manual'
  const fileRef = useRef();

  useEffect(() => {
    getSupabase().from('towers').select('id,name').order('name').then(({ data }) => setTowers(data || []));
  }, []);

  useEffect(() => {
    if (!selectedTower) { setUnits([]); return; }
    getSupabase().from('units').select('*').eq('tower_id', selectedTower).order('floor').order('unit_no')
      .then(({ data }) => setUnits(data || []));
  }, [selectedTower]);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file || !selectedTower) return;
    const XLSX = (await import('xlsx')).default;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    // Auto-map columns (case-insensitive)
    const mapped = rows.map(row => {
      const k = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), v]));
      return {
        tower_id: selectedTower,
        unit_no: String(k.unit_no || k.unit || k['unit no'] || ''),
        floor: parseInt(k.floor) || 0,
        typology: String(k.typology || ''),
        carpet: parseFloat(k.carpet) || null,
        ebvt: parseFloat(k.ebvt) || null,
        net_area: parseFloat(k.net_area || k.netarea) || null,
        car_parking: parseInt(k.car_parking || k.carparking || k['car parking']) || 0,
        cv_evo: parseFloat(k['cv_-_evo'] || k.cv_evo || k['cv-evo'] || k.cv) || null,
        cv_no_buffer: parseFloat(k['cv_w/o_notional_buffers'] || k.cv_no_buffer || k['cv w/o notional buffers'] || k['cv_without_buffer']) || null,
      };
    }).filter(r => r.unit_no);

    setPreview(mapped);
  }

  async function confirmUpload() {
    if (!preview || !selectedTower) return;
    setUploading(true); setMsg(null);
    const res = await fetch('/api/admin/units/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tower_id: selectedTower, units: preview }),
    });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) { setMsg({ type: 'error', text: data.error }); return; }
    setMsg({ type: 'success', text: `${preview.length} units imported successfully.` });
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
    getSupabase().from('units').select('*').eq('tower_id', selectedTower).order('floor').order('unit_no')
      .then(({ data }) => setUnits(data || []));
  }

  async function saveUnit() {
    const { id, created_at, ...fields } = editUnit;
    const sb = getSupabase();
    let error;
    if (id) {
      ({ error } = await sb.from('units').update(fields).eq('id', id));
    } else {
      ({ error } = await sb.from('units').insert({ ...fields, tower_id: selectedTower }));
    }
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setEditUnit(null);
    setMsg({ type: 'success', text: 'Unit saved.' });
    const { data } = await sb.from('units').select('*').eq('tower_id', selectedTower).order('floor').order('unit_no');
    setUnits(data || []);
  }

  async function deleteUnit(id) {
    if (!confirm('Delete this unit?')) return;
    await getSupabase().from('units').delete().eq('id', id);
    setUnits(u => u.filter(x => x.id !== id));
  }

  const blankUnit = { unit_no: '', floor: '', typology: '', carpet: '', ebvt: '', net_area: '', car_parking: '', cv_evo: '', cv_no_buffer: '' };

  return (
    <AdminLayout profile={profile} title="Units & Pricing">
      {/* Tower picker */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">SELECT TOWER</div>
        <select className="input" style={{ maxWidth: 300 }} value={selectedTower} onChange={e => { setSelectedTower(e.target.value); setPreview(null); setMsg(null); }}>
          <option value="">— Pick a tower —</option>
          {towers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {selectedTower && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #1a2d42' }}>
            {[['upload', 'Upload Excel'], ['manual', 'Manual Edit']].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{ ...s.tab, ...(tab === key ? s.tabActive : {}) }}>{label}</button>
            ))}
          </div>

          {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

          {tab === 'upload' && (
            <div className="card">
              <div className="card-title">EXCEL UPLOAD — REPLACES ALL UNITS FOR THIS TOWER</div>
              <div style={s.uploadHint}>
                Expected columns (case-insensitive): Unit No, Floor, Typology, Carpet, EBVT, Net Area, Car Parking, CV - evo, CV w/o Notional Buffers
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ marginBottom: 16 }} />

              {preview && (
                <>
                  <div style={s.previewHeader}>
                    Preview — {preview.length} units detected. Confirm to replace all existing units.
                  </div>
                  <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          {['Unit No', 'Floor', 'Typology', 'Carpet', 'Net Area', 'CV-EVO', 'CV No Buffer'].map(h => <th key={h}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.slice(0, 10).map((r, i) => (
                          <tr key={i}>
                            <td>{r.unit_no}</td><td>{r.floor}</td><td>{r.typology}</td>
                            <td>{r.carpet}</td><td>{r.net_area}</td>
                            <td style={{ fontFamily: 'monospace' }}>{r.cv_evo?.toLocaleString('en-IN')}</td>
                            <td style={{ fontFamily: 'monospace' }}>{r.cv_no_buffer?.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                        {preview.length > 10 && <tr><td colSpan={7} style={{ color: '#556677', textAlign: 'center' }}>…and {preview.length - 10} more rows</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-primary" onClick={confirmUpload} disabled={uploading}>
                      {uploading ? 'Importing…' : `Confirm Import (${preview.length} units)`}
                    </button>
                    <button className="btn" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'manual' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className="card-title" style={{ margin: 0 }}>UNITS ({units.length})</div>
                <button className="btn btn-primary btn-sm" onClick={() => setEditUnit({ ...blankUnit })}>+ Add Unit</button>
              </div>

              {editUnit && (
                <div style={s.editForm}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                    {[
                      ['unit_no', 'Unit No'], ['floor', 'Floor'], ['typology', 'Typology'],
                      ['carpet', 'Carpet (sqft)'], ['ebvt', 'EBVT (sqft)'], ['net_area', 'Net Area'],
                      ['car_parking', 'Car Parking'], ['cv_evo', 'CV - EVO (₹)'], ['cv_no_buffer', 'CV No Buffer (₹)'],
                    ].map(([field, label]) => (
                      <div className="form-group" key={field}>
                        <label className="form-label">{label}</label>
                        <input className="input" value={editUnit[field] || ''} onChange={e => setEditUnit(u => ({ ...u, [field]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary" onClick={saveUnit}>Save Unit</button>
                    <button className="btn" onClick={() => setEditUnit(null)}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      {['Unit', 'Floor', 'Typology', 'Carpet', 'Net Area', 'CV-EVO', 'CV No Buffer', ''].map(h => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {units.map(u => (
                      <tr key={u.id}>
                        <td style={{ color: '#e8d5aa' }}>{u.unit_no}</td>
                        <td>{u.floor}</td>
                        <td>{u.typology}</td>
                        <td>{u.carpet}</td>
                        <td>{u.net_area}</td>
                        <td style={{ fontFamily: 'monospace', color: '#C9A84C' }}>{u.cv_evo?.toLocaleString('en-IN')}</td>
                        <td style={{ fontFamily: 'monospace', color: '#aac4dd' }}>{u.cv_no_buffer?.toLocaleString('en-IN')}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-sm" onClick={() => setEditUnit(u)}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={() => deleteUnit(u.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {units.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#334455', padding: 28 }}>No units yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

export async function getServerSideProps({ req, res }) {
  const { session, profile } = await getServerSession({ req, res });
  if (!session || profile?.role !== 'super_admin') return { redirect: { destination: '/login', permanent: false } };
  return { props: { profile } };
}

const s = {
  tab: {
    padding: '10px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: 11, color: '#556677', letterSpacing: 0.5, borderBottom: '2px solid transparent', transition: 'all 0.15s',
  },
  tabActive: { color: '#C9A84C', borderBottomColor: '#C9A84C' },
  uploadHint: { fontSize: 10, color: '#445566', background: '#0a1620', border: '1px solid #1a2d42', borderRadius: 5, padding: '8px 12px', marginBottom: 14 },
  previewHeader: { fontSize: 11, color: '#e0a050', marginBottom: 10, padding: '8px 12px', background: '#1a1008', border: '1px solid #8b5a1088', borderRadius: 5 },
  editForm: { background: '#0a1620', border: '1px solid #1a3050', borderRadius: 6, padding: 16, marginBottom: 16 },
};
