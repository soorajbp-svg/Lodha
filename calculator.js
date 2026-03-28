import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { getSupabase } from '../lib/supabase';
import { getServerSession } from '../lib/auth';

const DISCOUNT_RATE = 0.085;

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function xnpv(rate, cashflows) {
  if (!cashflows.length) return 0;
  const sorted = [...cashflows].sort((a, b) => new Date(a.date) - new Date(b.date));
  const d0 = new Date(sorted[0].date);
  return sorted.reduce((sum, cf) => {
    const days = (new Date(cf.date) - d0) / 86400000;
    return sum + cf.amount / Math.pow(1 + rate, days / 365);
  }, 0);
}

function fmtINR(n) {
  if (!isFinite(n) || isNaN(n)) return '—';
  const abs = Math.abs(n);
  return (n < 0 ? '-' : '') + '₹' + abs.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}

let rowId = 1000;

export default function CalculatorPage({ profile }) {
  const router = useRouter();
  const [towers, setTowers] = useState([]);
  const [selectedTower, setSelectedTower] = useState('');
  const [floors, setFloors] = useState([]);
  const [selectedFloor, setSelectedFloor] = useState('');
  const [unitOptions, setUnitOptions] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [towerData, setTowerData] = useState(null); // possession date
  const [bookingDate, setBookingDate] = useState('');
  const [offeredPrice, setOfferedPrice] = useState('');
  const [proposedRows, setProposedRows] = useState([]);
  const [hoveredGap, setHoveredGap] = useState(null);
  const [loading, setLoading] = useState(false);

  const isSiteHead = profile.role === 'site_head';
  const isBizHead = profile.role === 'business_head';

  // Load towers
  useEffect(() => {
    getSupabase().from('towers').select('id,name,possession_date').order('name')
      .then(({ data }) => setTowers(data || []));
  }, []);

  // Load floors when tower changes
  useEffect(() => {
    setSelectedFloor(''); setSelectedUnit(null); setUnitOptions([]); setFloors([]);
    if (!selectedTower) { setTowerData(null); return; }
    const t = towers.find(x => x.id === selectedTower);
    setTowerData(t || null);
    getSupabase().from('units').select('floor').eq('tower_id', selectedTower)
      .then(({ data }) => {
        const unique = [...new Set((data || []).map(u => u.floor))].sort((a, b) => a - b);
        setFloors(unique);
      });
  }, [selectedTower, towers]);

  // Load units when floor changes
  useEffect(() => {
    setSelectedUnit(null); setUnitOptions([]);
    if (!selectedTower || selectedFloor === '') return;
    getSupabase().from('units').select('*').eq('tower_id', selectedTower).eq('floor', parseInt(selectedFloor)).order('unit_no')
      .then(({ data }) => setUnitOptions(data || []));
  }, [selectedTower, selectedFloor]);

  // Load schedule when tower + booking date set
  const buildScheduleFromDB = useCallback(async (towerId, bDate) => {
    if (!towerId || !bDate) return;
    const { data: sched } = await getSupabase().from('payment_schedules').select('id').eq('tower_id', towerId).single();
    if (!sched) return;
    const { data: ms } = await getSupabase().from('schedule_milestones').select('*').eq('schedule_id', sched.id).order('sort_order');
    if (!ms) return;
    setProposedRows(ms.map(m => ({
      id: rowId++,
      label: m.label,
      date: m.is_booking_relative ? addDays(bDate, m.relative_days) : (m.milestone_date || ''),
      pct: String(m.pct),
      _original_date: m.is_booking_relative ? addDays(bDate, m.relative_days) : (m.milestone_date || ''),
      _original_pct: String(m.pct),
    })));
  }, []);

  useEffect(() => {
    if (selectedTower && bookingDate) buildScheduleFromDB(selectedTower, bookingDate);
  }, [selectedTower, bookingDate, buildScheduleFromDB]);

  const cv = selectedUnit ? (isSiteHead ? selectedUnit.cv_no_buffer : selectedUnit.cv_evo) : null;
  const offeredNum = parseFloat(String(offeredPrice).replace(/,/g, '')) || 0;
  const discount = cv && offeredNum ? ((cv - offeredNum) / cv) * 100 : null;

  const standardCashflows = useMemo(() => {
    if (!cv || !proposedRows.length) return [];
    return proposedRows.filter(r => r._original_date && parseFloat(r._original_pct) > 0).map(r => ({
      date: r._original_date,
      amount: cv * parseFloat(r._original_pct) / 100,
    }));
  }, [cv, proposedRows]);

  const proposedCashflows = useMemo(() => {
    if (!offeredNum || !proposedRows.length) return [];
    return proposedRows.filter(r => r.date && parseFloat(r.pct) > 0).map(r => ({
      date: r.date,
      amount: offeredNum * parseFloat(r.pct) / 100,
    }));
  }, [offeredNum, proposedRows]);

  const stdXNPV = useMemo(() => xnpv(DISCOUNT_RATE, standardCashflows), [standardCashflows]);
  const propXNPV = useMemo(() => xnpv(DISCOUNT_RATE, proposedCashflows), [proposedCashflows]);
  const npvLoss = stdXNPV - propXNPV;

  const timingXNPV = useMemo(() => {
    if (!cv || !offeredNum || !stdXNPV) return 0;
    return stdXNPV * (offeredNum / cv);
  }, [cv, offeredNum, stdXNPV]);

  const pricingDiscPct = cv && offeredNum ? ((cv - offeredNum) / cv) * 100 : 0;
  const timingLossPct = stdXNPV > 0 ? ((timingXNPV - propXNPV) / stdXNPV) * 100 : 0;
  const overallPct = stdXNPV > 0 ? (npvLoss / stdXNPV) * 100 : 0;

  const totalPct = proposedRows.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0);
  const pctValid = Math.abs(totalPct - 100) < 0.01;
  const canCalc = !!(cv && offeredNum && bookingDate && proposedRows.length && pctValid);

  function updateRow(id, field, val) {
    setProposedRows(rows => rows.map(r => r.id === id ? { ...r, [field]: val } : r));
  }
  function insertRowAt(idx) {
    const newRow = { id: rowId++, label: 'Custom Milestone', date: '', pct: '0', _original_date: '', _original_pct: '0' };
    setProposedRows(rows => { const n = [...rows]; n.splice(idx, 0, newRow); return n; });
    setHoveredGap(null);
  }
  function addRow() {
    setProposedRows(rows => [...rows, { id: rowId++, label: 'Custom Milestone', date: '', pct: '0', _original_date: '', _original_pct: '0' }]);
  }
  function removeRow(id) { setProposedRows(rows => rows.filter(r => r.id !== id)); }

  async function logout() {
    await getSupabase().auth.signOut();
    router.push('/login');
  }

  const s = styles;

  return (
    <div style={s.root}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=JetBrains+Mono:wght@300;400;500;600&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0a1520}::-webkit-scrollbar-thumb{background:#2a3a50;border-radius:4px}
      select option{background:#0f1e2d;color:#cdd8e8}
      input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.4)}`}
      </style>

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.logo}>◈</span>
          <div>
            <div style={s.title}>NPV LOSS CALCULATOR</div>
            <div style={s.sub}>Payment Deviation Analysis · Discount Rate 8.5%</div>
          </div>
        </div>
        <div style={s.headerRight}>
          <div style={s.userBadge}>
            <span style={s.userName}>{profile.name || profile.email}</span>
            <span style={{ ...s.roleTag, background: isSiteHead ? '#0a1a3a' : '#1a2a0a', color: isSiteHead ? '#7aaae0' : '#6ec87a', borderColor: isSiteHead ? '#7aaae044' : '#6ec87a44' }}>
              {isSiteHead ? 'SITE HEAD' : 'BUSINESS HEAD'}
            </span>
          </div>
          <button style={s.logoutBtn} onClick={logout}>Sign Out</button>
        </div>
      </div>

      <div style={s.body}>
        {/* LEFT PANEL */}
        <div style={s.left}>

          {/* Unit Selection */}
          <div style={s.section}>
            <div style={s.sectionTitle}>UNIT SELECTION</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                ['Tower', towers, 'id', 'name', selectedTower, v => { setSelectedTower(v); setSelectedFloor(''); setSelectedUnit(null); }],
                ['Floor', floors.map(f => ({ id: f, label: `Floor ${f}` })), 'id', 'label', selectedFloor, v => { setSelectedFloor(v); setSelectedUnit(null); }],
                ['Unit', unitOptions.map(u => ({ id: u.id, label: String(u.unit_no) })), 'id', 'label', selectedUnit?.id || '', v => setSelectedUnit(unitOptions.find(u => u.id === v) || null)],
              ].map(([lbl, opts, vk, lk, val, onChange]) => (
                <div key={lbl} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={s.label}>{lbl.toUpperCase()}</label>
                  <select style={s.select} value={val} onChange={e => onChange(e.target.value)} disabled={opts.length === 0 && lbl !== 'Tower'}>
                    <option value="">Select</option>
                    {opts.map(o => <option key={o[vk]} value={o[vk]}>{o[lk]}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {selectedUnit && (
              <div style={s.unitCard}>
                <div style={s.ucRow}><span style={s.ucLabel}>Typology</span><span style={s.ucVal}>{selectedUnit.typology}</span></div>
                <div style={s.ucRow}>
                  <span style={s.ucLabel}>Contract Value ({isSiteHead ? 'No Buffer' : 'EVO'})</span>
                  <span style={{ ...s.ucVal, color: '#C9A84C', fontFamily: 'monospace', fontSize: 13 }}>{fmtINR(cv)}</span>
                </div>
                {towerData?.possession_date && (
                  <div style={s.ucRow}><span style={s.ucLabel}>Possession Date</span><span style={s.ucVal}>{fmtDate(towerData.possession_date)}</span></div>
                )}
              </div>
            )}
          </div>

          {/* Deal Parameters */}
          <div style={s.section}>
            <div style={s.sectionTitle}>DEAL PARAMETERS</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={s.label}>BOOKING DATE</label>
                <input type="date" style={s.input} value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={s.label}>OFFERED PRICE (₹)</label>
                <input type="number" style={s.input} placeholder="e.g. 43000000" value={offeredPrice} onChange={e => setOfferedPrice(e.target.value)} />
              </div>
            </div>
            {discount !== null && (
              <div style={{ ...s.discBadge, color: discount > 0 ? '#e07070' : '#6ec87a' }}>
                {discount > 0 ? `▼ ${discount.toFixed(2)}% discount on CV` : `▲ ${Math.abs(discount).toFixed(2)}% premium over CV`}
              </div>
            )}
          </div>

          {/* Payment Schedule */}
          <div style={s.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={s.sectionTitle}>PROPOSED PAYMENT SCHEDULE</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...s.pctBadge, background: pctValid ? '#1a3a1a' : '#3a1a1a', color: pctValid ? '#6ec87a' : '#e07070', borderColor: pctValid ? '#6ec87a44' : '#e0707044' }}>
                  {totalPct.toFixed(1)}% {pctValid ? '✓' : '≠ 100%'}
                </span>
                <button style={s.addBtn} onClick={addRow}>+ Add Row</button>
              </div>
            </div>

            {!bookingDate && <div style={s.hint}>← Set booking date to load tower's standard schedule</div>}

            {proposedRows.length > 0 && !pctValid && (() => {
              const rem = parseFloat((100 - totalPct).toFixed(4));
              return (
                <div style={{ ...s.errBanner, borderColor: rem < 0 ? '#8b2020' : '#8b5a10', background: rem < 0 ? '#1a0808' : '#1a1008' }}>
                  <span style={{ color: rem < 0 ? '#e07070' : '#e0a050', fontSize: 11 }}>
                    {rem < 0 ? `⚠ Over by ${Math.abs(rem).toFixed(2)}%` : `⚠ Under by ${rem.toFixed(2)}%`}
                  </span>
                  <button style={s.balBtn} onClick={() => {
                    const sumRest = proposedRows.slice(0, -1).reduce((s, r) => s + (parseFloat(r.pct) || 0), 0);
                    const newPct = parseFloat((100 - sumRest).toFixed(4));
                    const last = proposedRows[proposedRows.length - 1];
                    updateRow(last.id, 'pct', String(newPct));
                  }}>Auto-balance last row</button>
                </div>
              );
            })()}

            <div style={s.schedTable}>
              <div style={s.schedHdr}>
                <span style={{ flex: 2 }}>Milestone</span>
                <span style={{ flex: 1.2, textAlign: 'center' }}>Date</span>
                <span style={{ flex: 0.7, textAlign: 'center' }}>%</span>
                <span style={{ width: 28 }}></span>
              </div>
              {proposedRows.map((row, idx) => (
                <div key={row.id}>
                  {idx > 0 && (
                    <div
                      style={{ ...s.gap, ...(hoveredGap === idx ? s.gapHover : {}) }}
                      onMouseEnter={() => setHoveredGap(idx)}
                      onMouseLeave={() => setHoveredGap(null)}
                    >
                      {hoveredGap === idx && (
                        <button style={s.insertBtn} onClick={() => insertRowAt(idx)}>+ Insert Row</button>
                      )}
                    </div>
                  )}
                  <div style={{ ...s.schedRow, background: idx % 2 === 0 ? '#0f1923' : '#111d2a' }}>
                    <input style={{ ...s.cell, flex: 2, fontSize: 11 }} value={row.label} onChange={e => updateRow(row.id, 'label', e.target.value)} placeholder="Milestone" />
                    <input type="date" style={{ ...s.cell, flex: 1.2, textAlign: 'center', fontSize: 11 }} value={row.date} onChange={e => updateRow(row.id, 'date', e.target.value)} />
                    <input type="number" style={{ ...s.cell, flex: 0.7, textAlign: 'center', fontSize: 11 }} value={row.pct} onChange={e => updateRow(row.id, 'pct', e.target.value)} step="0.5" min="0" max="100" />
                    <button style={s.delBtn} onClick={() => removeRow(row.id)}>×</button>
                  </div>
                </div>
              ))}
              {proposedRows.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#445566', fontSize: 11 }}>No milestones. Select a tower and set a booking date.</div>}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={s.right}>
          {!canCalc ? (
            <div style={s.emptyState}>
              <div style={{ fontSize: 48, color: '#1a3050' }}>◈</div>
              <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, color: '#2a4060', letterSpacing: 2 }}>Awaiting Inputs</div>
              <div style={{ fontSize: 11, color: '#334455' }}>Complete all fields on the left</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {[['Select a unit', !!selectedUnit], ['Enter booking date', !!bookingDate], ['Enter offered price', !!offeredNum], ['Schedule totals 100%', pctValid && proposedRows.length > 0]].map(([label, done]) => (
                  <div key={label} style={{ fontSize: 11, color: done ? '#6ec87a' : '#8899aa' }}>{done ? '✓' : '○'} {label}</div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Unit Summary */}
              <div style={s.card}>
                <div style={s.cardTitle}>UNIT SUMMARY</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 10 }}>
                  {[['Unit', selectedUnit.unit_no], ['Floor', selectedFloor], ['Typology', selectedUnit.typology], ['Booking Date', fmtDate(bookingDate)]].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 9, color: '#556677', letterSpacing: 1 }}>{l}</span>
                      <span style={{ fontSize: 12, color: '#cde' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#556677', letterSpacing: 1 }}>CV ({isSiteHead ? 'No Buffer' : 'EVO'})</span>
                    <span style={{ fontSize: 12, color: '#cde', fontFamily: 'monospace' }}>{fmtINR(cv)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 9, color: '#556677', letterSpacing: 1 }}>Offered Price</span>
                    <span style={{ fontSize: 12, color: '#cde', fontFamily: 'monospace' }}>{fmtINR(offeredNum)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid #1a2d42' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, color: '#556677', letterSpacing: 1 }}>Pricing {discount >= 0 ? 'Discount' : 'Premium'}</span>
                    <span style={{ fontSize: 10, color: '#445566' }}>{fmtINR(Math.abs(cv - offeredNum))} off CV</span>
                  </div>
                  <span style={{ ...s.pill, background: discount > 0 ? '#2a0d0d' : '#0d2a0d', borderColor: discount > 0 ? '#e0707055' : '#6ec87a55', color: discount > 0 ? '#e07070' : '#6ec87a' }}>
                    {discount > 0 ? '▼' : '▲'} {Math.abs(discount).toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* XNPV */}
              <div style={s.card}>
                <div style={s.cardTitle}>XNPV ANALYSIS @ 8.5%</div>
                {[['Standard Schedule XNPV (@ CV)', fmtINR(stdXNPV)], ['Proposed Schedule XNPV (@ Offered Price)', fmtINR(propXNPV)]].map(([lbl, val]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a2d42' }}>
                    <span style={{ fontSize: 11, color: '#7a8fa0' }}>{lbl}</span>
                    <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#aac4dd' }}>{val}</span>
                  </div>
                ))}
                <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
                  <div style={{ fontSize: 9, letterSpacing: 3, color: '#667788', marginBottom: 8 }}>NPV LOSS</div>
                  <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 36, fontWeight: 700, color: npvLoss > 0 ? '#e07070' : '#6ec87a' }}>
                    {fmtINR(Math.abs(npvLoss))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                    <span style={{ ...s.pill, fontSize: 12, padding: '4px 16px', background: overallPct > 0 ? '#2a0d0d' : '#0d2a0d', borderColor: overallPct > 0 ? '#e0707055' : '#6ec87a55', color: overallPct > 0 ? '#e07070' : '#6ec87a' }}>
                      {overallPct > 0 ? '▼' : '▲'} {Math.abs(overallPct).toFixed(2)}% of Standard XNPV
                    </span>
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div style={{ ...s.card, border: '1px solid #C9A84C33', background: '#0e1a10' }}>
                <div style={s.cardTitle}>OVERALL DISCOUNT BREAKDOWN</div>
                {[
                  ['Pricing Discount', 'CV → Offered Price', pricingDiscPct, Math.abs(cv - offeredNum)],
                  ['Schedule Deviation (NPV)', 'Timing impact on offered price', timingLossPct, Math.abs(timingXNPV - propXNPV)],
                ].map(([lbl, sub, pct, amt]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1a2d42' }}>
                    <div><div style={{ fontSize: 12, color: '#cde' }}>{lbl}</div><div style={{ fontSize: 9, color: '#556677', marginTop: 2 }}>{sub}</div></div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 700, color: pct > 0 ? (lbl.includes('Schedule') ? '#e0a050' : '#e07070') : '#6ec87a' }}>
                        {pct > 0 ? '▼' : '▲'} {Math.abs(pct).toFixed(2)}%
                      </div>
                      <div style={{ fontSize: 10, color: '#667788', fontFamily: 'monospace' }}>{fmtINR(amt)}</div>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
                  <div><div style={{ fontSize: 13, color: '#e8d5aa' }}>Overall Effective Discount</div><div style={{ fontSize: 9, color: '#556677', marginTop: 2 }}>Total NPV loss as % of Standard XNPV</div></div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 700, color: overallPct > 0 ? '#e07070' : '#6ec87a' }}>
                      {overallPct > 0 ? '▼' : '▲'} {Math.abs(overallPct).toFixed(2)}%
                    </div>
                    <div style={{ fontSize: 10, color: '#C9A84C', fontFamily: 'monospace' }}>{fmtINR(Math.abs(npvLoss))}</div>
                  </div>
                </div>
              </div>

              {/* Schedule Comparison */}
              <div style={s.card}>
                <div style={s.cardTitle}>SCHEDULE COMPARISON</div>
                <div style={{ display: 'flex', gap: 8, padding: '6px 10px', background: '#0a1520', fontSize: 9, color: '#445566', letterSpacing: 1, borderRadius: '4px 4px 0 0', borderBottom: '1px solid #1a2d42' }}>
                  <span style={{ flex: 2 }}>Milestone</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>Std Date</span>
                  <span style={{ flex: 0.6, textAlign: 'right' }}>Std %</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>Prop Date</span>
                  <span style={{ flex: 0.6, textAlign: 'right' }}>Prop %</span>
                </div>
                {proposedRows.map((row, i) => {
                  const dateChanged = row.date !== row._original_date;
                  const pctChanged = parseFloat(row.pct) !== parseFloat(row._original_pct);
                  return (
                    <div key={row.id} style={{ display: 'flex', gap: 8, padding: '7px 10px', background: i % 2 === 0 ? '#0f1923' : '#111d2a', borderBottom: '1px solid #0f1d2a', alignItems: 'center' }}>
                      <span style={{ flex: 2, fontSize: 11, color: '#99aabb' }}>{row.label}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontSize: 11, fontFamily: 'monospace', color: '#667788' }}>{fmtDate(row._original_date)}</span>
                      <span style={{ flex: 0.6, textAlign: 'right', fontSize: 11, fontFamily: 'monospace', color: '#667788' }}>{row._original_pct}%</span>
                      <span style={{ flex: 1, textAlign: 'right', fontSize: 11, fontFamily: 'monospace', color: dateChanged ? '#e0a070' : '#99aabb' }}>{fmtDate(row.date)}</span>
                      <span style={{ flex: 0.6, textAlign: 'right', fontSize: 11, fontFamily: 'monospace', color: pctChanged ? '#e0a070' : '#99aabb' }}>{parseFloat(row.pct || 0).toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps({ req, res }) {
  const { session, profile } = await getServerSession({ req, res });
  if (!session || !profile) return { redirect: { destination: '/login', permanent: false } };
  if (profile.role === 'super_admin') return { redirect: { destination: '/admin', permanent: false } };
  if (!profile.is_active) return { redirect: { destination: '/login', permanent: false } };
  return { props: { profile } };
}

const styles = {
  root: { fontFamily: "'JetBrains Mono',monospace", background: '#08111c', color: '#cdd8e8', minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: { background: '#0c1927', borderBottom: '1px solid #C9A84C44', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  logo: { fontSize: 22, color: '#C9A84C' },
  title: { fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 700, letterSpacing: 3, color: '#e8d5aa' },
  sub: { fontSize: 9, color: '#556677', letterSpacing: 1.5, marginTop: 2 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 14 },
  userBadge: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  userName: { fontSize: 11, color: '#aac4dd' },
  roleTag: { fontSize: 8, padding: '2px 8px', borderRadius: 10, border: '1px solid', letterSpacing: 1.5, fontWeight: 600 },
  logoutBtn: { background: 'transparent', border: '1px solid #2a3d55', color: '#667788', borderRadius: 5, padding: '5px 12px', fontSize: 10, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace" },
  body: { display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 60px)' },
  left: { width: '46%', borderRight: '1px solid #1a2d42', overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 },
  right: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column' },
  section: { background: '#0c1927', border: '1px solid #1a2d42', borderRadius: 8, padding: 16 },
  sectionTitle: { fontSize: 9, letterSpacing: 2.5, color: '#C9A84C', marginBottom: 14, fontWeight: 600 },
  label: { fontSize: 9, color: '#667788', letterSpacing: 1.5 },
  select: { background: '#0a1620', border: '1px solid #2a3d55', borderRadius: 5, color: '#cde', padding: '7px 10px', fontSize: 11, outline: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", width: '100%' },
  input: { background: '#0a1620', border: '1px solid #2a3d55', borderRadius: 5, color: '#cde', padding: '7px 10px', fontSize: 11, outline: 'none', fontFamily: "'JetBrains Mono',monospace", width: '100%' },
  unitCard: { marginTop: 12, background: '#0a1620', border: '1px solid #1a3050', borderRadius: 6, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 },
  ucRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  ucLabel: { fontSize: 9, color: '#556677', letterSpacing: 1 },
  ucVal: { fontSize: 12, color: '#cde' },
  discBadge: { marginTop: 10, fontSize: 11, fontWeight: 600, textAlign: 'center', padding: 6, background: '#0a1620', borderRadius: 5, border: '1px solid #2a3d55' },
  pctBadge: { fontSize: 9, padding: '3px 8px', borderRadius: 4, border: '1px solid', letterSpacing: 1 },
  addBtn: { background: '#1a3050', border: '1px solid #2a4060', color: '#89aacc', borderRadius: 5, padding: '4px 10px', fontSize: 10, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace" },
  hint: { fontSize: 10, color: '#445566', fontStyle: 'italic', marginBottom: 10 },
  errBanner: { border: '1px solid', borderRadius: 6, padding: '8px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  balBtn: { background: '#2a1a08', border: '1px solid #8b5a1088', color: '#e0a050', borderRadius: 4, padding: '3px 10px', fontSize: 9, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace', marginLeft: 10" },
  schedTable: { display: 'flex', flexDirection: 'column', borderRadius: 6, overflow: 'hidden', border: '1px solid #1a2d42' },
  schedHdr: { display: 'flex', gap: 6, padding: '6px 10px', background: '#0a1520', fontSize: 9, color: '#556677', letterSpacing: 1.2, alignItems: 'center', borderBottom: '1px solid #1a2d42' },
  schedRow: { display: 'flex', gap: 6, padding: '5px 8px', alignItems: 'center', borderBottom: '1px solid #151f2d' },
  cell: { background: 'transparent', border: '1px solid transparent', borderRadius: 4, color: '#aac4dd', padding: '3px 6px', fontFamily: "'JetBrains Mono',monospace", outline: 'none', minWidth: 0 },
  delBtn: { width: 22, height: 22, background: 'transparent', border: '1px solid #2a3a50', borderRadius: 4, color: '#667788', cursor: 'pointer', fontSize: 14, flexShrink: 0 },
  gap: { height: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'height 0.15s' },
  gapHover: { height: 28, background: '#0d1f30', borderTop: '1px dashed #C9A84C55', borderBottom: '1px dashed #C9A84C55' },
  insertBtn: { background: '#1a3050', border: '1px solid #C9A84C66', color: '#C9A84C', borderRadius: 4, padding: '2px 14px', fontSize: 10, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace" },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#445566' },
  card: { background: '#0c1927', border: '1px solid #1a2d42', borderRadius: 8, padding: 16 },
  cardTitle: { fontSize: 9, letterSpacing: 2.5, color: '#C9A84C', marginBottom: 14, fontWeight: 600 },
  pill: { border: '1px solid', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" },
};
