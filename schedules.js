import { useState, useEffect } from 'react';
import AdminLayout from '../../components/AdminLayout';
import { getServerSession } from '../../lib/auth';
import { getSupabase } from '../../lib/supabase';

let mid = 100;
const blank = () => ({ _id: mid++, label: '', milestone_date: '', is_booking_relative: false, relative_days: 0, pct: '', sort_order: 0 });

export default function SchedulesPage({ profile }) {
  const [towers, setTowers] = useState([]);
  const [selectedTower, setSelectedTower] = useState('');
  const [milestones, setMilestones] = useState([]);
  const [scheduleId, setScheduleId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [hoveredGap, setHoveredGap] = useState(null);

  useEffect(() => {
    getSupabase().from('towers').select('id,name').order('name').then(({ data }) => setTowers(data || []));
  }, []);

  useEffect(() => {
    if (!selectedTower) { setMilestones([]); setScheduleId(null); return; }
    loadSchedule(selectedTower);
  }, [selectedTower]);

  async function loadSchedule(towerId) {
    const sb = getSupabase();
    const { data: sched } = await sb.from('payment_schedules').select('id').eq('tower_id', towerId).single();
    if (sched) {
      setScheduleId(sched.id);
      const { data: ms } = await sb.from('schedule_milestones').select('*').eq('schedule_id', sched.id).order('sort_order');
      setMilestones((ms || []).map(m => ({ ...m, _id: mid++ })));
    } else {
      setScheduleId(null);
      setMilestones([]);
    }
  }

  const total = milestones.reduce((s, m) => s + (parseFloat(m.pct) || 0), 0);
  const valid = Math.abs(total - 100) < 0.01;

  function updateMs(idx, field, value) {
    setMilestones(ms => ms.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  }

  function addRow(afterIdx) {
    const row = blank();
    setMilestones(ms => {
      const next = [...ms];
      next.splice(afterIdx + 1, 0, row);
      return next;
    });
  }

  function removeRow(idx) {
    setMilestones(ms => ms.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!valid) { setMsg({ type: 'error', text: 'Total % must equal 100 before saving.' }); return; }
    setSaving(true); setMsg(null);
    const sb = getSupabase();
    let sid = scheduleId;
    if (!sid) {
      const { data } = await sb.from('payment_schedules').insert({ tower_id: selectedTower }).select('id').single();
      sid = data.id;
      setScheduleId(sid);
    } else {
      await sb.from('payment_schedules').update({ updated_at: new Date().toISOString() }).eq('id', sid);
    }
    // Replace all milestones
    await sb.from('schedule_milestones').delete().eq('schedule_id', sid);
    const rows = milestones.map((m, i) => ({
      schedule_id: sid,
      label: m.label,
      milestone_date: m.is_booking_relative ? null : (m.milestone_date || null),
      is_booking_relative: m.is_booking_relative,
      relative_days: m.is_booking_relative ? parseInt(m.relative_days) || 0 : 0,
      pct: parseFloat(m.pct),
      sort_order: i,
    }));
    const { error } = await sb.from('schedule_milestones').insert(rows);
    setSaving(false);
    setMsg(error ? { type: 'error', text: error.message } : { type: 'success', text: 'Schedule saved.' });
    if (!error) loadSchedule(selectedTower);
  }

  return (
    <AdminLayout profile={profile} title="Payment Schedules">
      <div className="card" style={{ marginBottom: 20, maxWidth: 400 }}>
        <div className="card-title">SELECT TOWER</div>
        <select className="input" value={selectedTower} onChange={e => { setSelectedTower(e.target.value); setMsg(null); }}>
          <option value="">— Pick a tower —</option>
          {towers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {selectedTower && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>MILESTONES</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ ...s.pctBadge, background: valid ? '#1a3a1a' : '#3a1a1a', color: valid ? '#6ec87a' : '#e07070', borderColor: valid ? '#6ec87a44' : '#e0707044' }}>
                {total.toFixed(1)}% {valid ? '✓' : '≠ 100%'}
              </span>
              <button className="btn btn-sm" onClick={() => addRow(milestones.length - 1)}>+ Add Row</button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Schedule'}</button>
            </div>
          </div>

          {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

          {!valid && milestones.length > 0 && (
            <div className="alert alert-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{total > 100 ? `Over by ${(total - 100).toFixed(2)}%` : `Under by ${(100 - total).toFixed(2)}%`}</span>
              <button className="btn btn-sm" onClick={() => {
                const sumRest = milestones.slice(0, -1).reduce((s, m) => s + (parseFloat(m.pct) || 0), 0);
                const newPct = parseFloat((100 - sumRest).toFixed(4));
                setMilestones(ms => ms.map((m, i) => i === ms.length - 1 ? { ...m, pct: String(newPct) } : m));
              }}>Auto-balance last row</button>
            </div>
          )}

          {/* Table header */}
          <div style={s.hdr}>
            <span style={{ flex: 2.5 }}>Milestone Label</span>
            <span style={{ flex: 0.8, textAlign: 'center' }}>Booking Relative?</span>
            <span style={{ flex: 1, textAlign: 'center' }}>Rel. Days / Date</span>
            <span style={{ flex: 0.6, textAlign: 'center' }}>% of CV</span>
            <span style={{ width: 28 }}></span>
          </div>

          {milestones.map((m, idx) => (
            <div key={m._id}>
              {idx > 0 && (
                <div
                  style={{ ...s.gap, ...(hoveredGap === idx ? s.gapHover : {}) }}
                  onMouseEnter={() => setHoveredGap(idx)}
                  onMouseLeave={() => setHoveredGap(null)}
                >
                  {hoveredGap === idx && (
                    <button style={s.insertBtn} onClick={() => addRow(idx - 1)}>+ Insert Row</button>
                  )}
                </div>
              )}
              <div style={{ ...s.row, background: idx % 2 === 0 ? '#0f1923' : '#111d2a' }}>
                <input style={{ ...s.cell, flex: 2.5 }} value={m.label} onChange={e => updateMs(idx, 'label', e.target.value)} placeholder="Milestone name" />
                <div style={{ flex: 0.8, display: 'flex', justifyContent: 'center' }}>
                  <input type="checkbox" checked={m.is_booking_relative} onChange={e => updateMs(idx, 'is_booking_relative', e.target.checked)} />
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  {m.is_booking_relative
                    ? <input style={{ ...s.cell, width: '80px', textAlign: 'center' }} type="number" value={m.relative_days} onChange={e => updateMs(idx, 'relative_days', e.target.value)} placeholder="Days" />
                    : <input style={{ ...s.cell, textAlign: 'center' }} type="date" value={m.milestone_date || ''} onChange={e => updateMs(idx, 'milestone_date', e.target.value)} />}
                </div>
                <input style={{ ...s.cell, flex: 0.6, textAlign: 'center' }} type="number" value={m.pct} onChange={e => updateMs(idx, 'pct', e.target.value)} step="0.5" min="0" max="100" />
                <button style={s.del} onClick={() => removeRow(idx)}>×</button>
              </div>
            </div>
          ))}

          {milestones.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#334455' }}>
              No milestones yet.{' '}
              <button className="btn btn-sm" onClick={() => addRow(-1)}>Add first row</button>
            </div>
          )}
        </div>
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
  pctBadge: { fontSize: 9, padding: '3px 8px', borderRadius: 4, border: '1px solid', letterSpacing: 1 },
  hdr: { display: 'flex', gap: 6, padding: '6px 10px', background: '#0a1520', fontSize: 9, color: '#556677', letterSpacing: 1.2, alignItems: 'center', borderBottom: '1px solid #1a2d42' },
  row: { display: 'flex', gap: 6, padding: '5px 8px', alignItems: 'center', borderBottom: '1px solid #151f2d' },
  cell: { background: 'transparent', border: '1px solid transparent', borderRadius: 4, color: '#aac4dd', padding: '3px 6px', fontFamily: 'var(--mono)', outline: 'none', fontSize: 11, minWidth: 0 },
  del: { width: 22, height: 22, background: 'transparent', border: '1px solid #2a3a50', borderRadius: 4, color: '#667788', cursor: 'pointer', fontSize: 14, flexShrink: 0 },
  gap: { height: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'height 0.15s' },
  gapHover: { height: 28, background: '#0d1f30', borderTop: '1px dashed #C9A84C55', borderBottom: '1px dashed #C9A84C55' },
  insertBtn: { background: '#1a3050', border: '1px solid #C9A84C66', color: '#C9A84C', borderRadius: 4, padding: '2px 14px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--mono)', letterSpacing: 1 },
};
