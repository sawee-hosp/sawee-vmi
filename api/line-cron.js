// Sawee Rxfill — สรุปแจ้งเตือน LINE (เรียกโดย Vercel Cron ตาม vercel.json หรือแอดมินจาก LINE Console)
// แอดมิน: ใบเบิกใหม่ทุกประเภท + ยาใกล้หมดอายุทุกรายการ (ส่งเมื่อมีอะไรใหม่/เปลี่ยน) · รพ.สต.: ล็อตของหน่วยตัวเองที่เพิ่งเข้าเกณฑ์ ≤180 / ≤30 วัน
// auth: Authorization: Bearer <CRON_SECRET> (Vercel Cron) หรือ POST { idToken, dryRun } จากแอดมิน
const { crypto, env, SITE, fsGet, fsSet, fsQuery, nowTs, tsMs, quotaStatus, pushText, verifyUser, isAdminRole, readJson, logLine } = require('./_lib/core');

const DISCLAIMER = 'เป็นข้อความจากระบบ กรุณาเช็คยาจริง\nหากวันหมดอายุ (EXP) ไม่ถูกต้อง สามารถแก้ไขได้ในหน้า "คลังยาของฉัน"';
const daysTo = (raw) => {
  const v = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (v.length !== 8) return null;
  const exp = Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8));
  const t = new Date(Date.now() + 7 * 3600000); const today = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  return Math.round((exp - today) / 86400000);
};
const expTh = (raw) => { const v = String(raw || '').replace(/\D/g, '').slice(0, 8); return v.length === 8 ? `${+v.slice(6, 8)}/${+v.slice(4, 6)}/${+v.slice(0, 4) + 543}` : '-'; };
const levelOf = (d) => d === null ? 0 : d <= 30 ? 30 : d <= 180 ? 180 : 0;
const dayText = (d) => d < 0 ? 'หมดอายุแล้ว' : `อีก ${d} วัน`;
const fiscalRound = (r) => {
  const term = Number(r.fiscal_term) || 0; const fy = Number(r.fiscal_year) || 0;
  if (term && fy) return String(term).padStart(2, '0') + '/' + fy;
  const m = Number(r.month), y = Number(r.year); if (!m || !y) return '';
  return String(m >= 10 ? m - 9 : m + 3).padStart(2, '0') + '/' + (m >= 10 ? y + 544 : y + 543);
};

async function runDigest({ dryRun }) {
  const state = (await fsGet('line_meta/state')) || {};
  const since = state.last_run_at || new Date(Date.now() - 24 * 3600000).toISOString();
  const [linked, drugs, hospitals, depts] = await Promise.all([
    fsQuery('users', [['line_user_id', 'NOT_EQUAL', '']]),
    fsQuery('master_drugs', []), fsQuery('master_hospitals', []), fsQuery('master_depts', [])
  ]);
  const drugName = new Map(drugs.map(d => [String(d.drug_id || d.id), d.drug_name || d.id]));
  const hospName = new Map(hospitals.map(h => [String(h.hospital_id || h.id), h.hospital_name || h.id]));
  const deptName = new Map(depts.map(d => [String(d.dept_id || d.id), d.dept_name || d.id]));

  // ใบเบิกใหม่ตั้งแต่รอบก่อน
  const [rpst, internal] = await Promise.all([
    fsQuery('requisitions', [['created_at', 'GREATER_THAN', { __ts: since }]]),
    fsQuery('internal_requisitions', [['submitted_at', 'GREATER_THAN', { __ts: since }]])
  ]);
  const newReqs = [
    ...rpst.filter(r => !String(r.id).startsWith('HIST-') && !['Draft', 'Cancelled'].includes(r.status))
      .map(r => `• ${hospName.get(String(r.hospitalId)) || r.hospitalId} รอบ ${fiscalRound(r)} (${(r.items || []).filter(i => Number(i.dispenseQty) > 0 && String(i.type) !== '6').length} รายการ)`),
    ...internal.filter(r => !['Draft', 'Cancelled'].includes(r.status))
      .map(r => `• ${r.dept_name || deptName.get(String(r.deptId)) || r.deptId} ${r.form_no || ''} (${(r.items || []).length} รายการ)`)
  ];

  // ล็อตใกล้หมดอายุ (VMI ของ รพ.สต.)
  const lots = (await fsQuery('vmi_virtual_lots', [['remaining_qty', 'GREATER_THAN', 0]]))
    .map(l => ({ ...l, days: daysTo(l.expiry) })).filter(l => l.days !== null && l.days <= 180)
    .sort((a, b) => a.days - b.days);
  const near30 = lots.filter(l => l.days <= 30), near180 = lots.filter(l => l.days > 30);
  const lotLine = (l, withHosp) => `• ${drugName.get(String(l.drug_id)) || l.drug_id} · Lot ${l.lot_no || '-'} · EXP ${expTh(l.expiry)} (${dayText(l.days)})${withHosp ? ' · ' + (hospName.get(String(l.hospital_id)) || l.hospital_id) : ''} · เหลือ ${Number(l.remaining_qty).toLocaleString('th-TH')}`;

  const out = { since, newReqCount: newReqs.length, near30: near30.length, near180: near180.length, admin: null, staff: [], sent: 0, skipped: 0 };
  const quota = dryRun ? await quotaStatus() : null;

  // ----- ล็อตที่เพิ่งข้ามเกณฑ์ 180 / 30 วัน — แจ้งครั้งเดียวต่อเกณฑ์ ไม่ส่งซ้ำวันถัดไป -----
  const levelsDoc = (await fsGet('line_meta/expiry_levels')) || {};
  const prev = levelsDoc.levels || {};
  const next = { ...prev };
  const crossing = lots.filter(l => { const lv = levelOf(l.days); return lv && (!prev[l.id] || lv < prev[l.id]); });
  crossing.forEach(l => { next[l.id] = levelOf(l.days); });
  const c30 = crossing.filter(l => l.days <= 30), c180 = crossing.filter(l => l.days > 30);
  out.crossing = crossing.length;

  // ----- แอดมิน -----
  const admins = linked.filter(u => isAdminRole(u.role));
  if (newReqs.length || crossing.length) {
    const parts = ['สรุป Sawee Rxfill'];
    parts.push(newReqs.length ? `📥 ใบเบิกใหม่ ${newReqs.length} ใบ\n${newReqs.slice(0, 15).join('\n')}${newReqs.length > 15 ? `\n… และอีก ${newReqs.length - 15} ใบ` : ''}` : '📥 ไม่มีใบเบิกใหม่');
    if (crossing.length) {
      const hospCount = new Set(crossing.map(l => l.hospital_id)).size;
      parts.push(`⏰ ยาเพิ่งเข้าเกณฑ์ใกล้หมดอายุ ${hospCount} รพ.สต.\n• หมดอายุแล้ว/≤30 วัน: ${c30.length} ล็อต\n• ≤180 วัน: ${c180.length} ล็อต\n${crossing.slice(0, 15).map(l => lotLine(l, true)).join('\n')}${crossing.length > 15 ? `\n… และอีก ${crossing.length - 15} ล็อต` : ''}\n\n${DISCLAIMER}`);
    }
    parts.push(SITE() + '/app.html');
    out.admin = { text: parts.join('\n\n'), to: admins.map(u => u.name || u.id) };
    if (!dryRun) for (const u of admins) { const r = await pushText(u.line_user_id, out.admin.text, { audience: 'admin', type: 'admin_digest', uid: u.id, name: u.name }); r.ok ? out.sent++ : out.skipped++; }
  }

  // ----- เจ้าหน้าที่ รพ.สต.: เฉพาะล็อตที่เพิ่งเข้าเกณฑ์ -----
  const byHosp = new Map();
  crossing.forEach(l => { const g = byHosp.get(l.hospital_id) || []; g.push(l); byHosp.set(l.hospital_id, g); });
  for (const [hid, list] of byHosp) {
    const staff = linked.filter(u => String(u.hospital_id) === String(hid) && !isAdminRole(u.role));
    const text = `แจ้งเตือนยาใกล้หมดอายุ — ${hospName.get(String(hid)) || hid}\n${list.slice(0, 20).map(l => lotLine(l, false)).join('\n')}${list.length > 20 ? `\n… และอีก ${list.length - 20} ล็อต` : ''}\n\n${DISCLAIMER}\n${SITE()}/app.html`;
    out.staff.push({ hospital: hospName.get(String(hid)) || hid, lots: list.length, to: staff.map(u => u.name || u.id), text });
    if (dryRun) continue;
    for (const u of staff) { const r = await pushText(u.line_user_id, text, { audience: 'staff', type: 'staff_expiry', uid: u.id, name: u.name }); r.ok ? out.sent++ : out.skipped++; }
  }

  if (!dryRun) {
    await fsSet('line_meta/expiry_levels', { levels: next, updated_at: nowTs() }, false);
    await fsSet('line_meta/state', { last_run_at: new Date().toISOString(), last_result: { sent: out.sent, skipped: out.skipped, newReqs: newReqs.length, near30: near30.length, near180: near180.length }, updated_at: nowTs() }, true);
    await logLine({ type: 'digest_run', ok: true, preview: `ส่ง ${out.sent} ข้าม ${out.skipped} · ใบใหม่ ${newReqs.length} · ≤30 วัน ${near30.length} · ≤180 วัน ${near180.length}` });
  } else out.quota = quota;
  return out;
}

module.exports = async (req, res) => {
  try {
    const authz = String(req.headers.authorization || '');
    const cronOk = env('CRON_SECRET') && authz === 'Bearer ' + env('CRON_SECRET');
    if (cronOk) return res.status(200).json({ ok: true, ...(await runDigest({ dryRun: false })) });
    if (req.method !== 'POST') return res.status(401).json({ ok: false, error: 'unauthorized' });
    const body = await readJson(req);
    const user = await verifyUser(body.idToken);
    if (!isAdminRole(user.role)) return res.status(403).json({ ok: false, error: 'admin only' });
    return res.status(200).json({ ok: true, ...(await runDigest({ dryRun: body.dryRun !== false })) });
  } catch (e) {
    console.error('[line-cron]', e);
    return res.status(e.status || 500).json({ ok: false, error: e.message });
  }
};
