// Sawee Rxfill — LINE notify (v6.9) : POST { idToken, action, ... }
//   status     (admin) → โควตาเดือนนี้ + สถานะการสรุปล่าสุด
//   test       → ส่งข้อความทดสอบหาตัวเอง
//   dispensed  (admin, reqId) → แจ้ง จนท.รพ.สต. ว่าห้องยาจัดยาเรียบร้อย + ลิงก์ใบสรุปการจ่าย
//   unlink     (admin, uid) → ยกเลิกการผูก LINE ของผู้ใช้
const { fsGet, fsPatch, fsQuery, quotaStatus, pushText, verifyUser, isAdminRole, readJson, sheetUrl, thb, SITE } = require('./_lib/core');

// รอบบิลแบบปีงบ เช่น 01/2570 (เดียวกับ formatBillRound)
const roundText = (r) => {
  const term = Number(r.fiscal_term) || 0; const fy = Number(r.fiscal_year) || 0;
  if (term && fy) return String(term).padStart(2, '0') + '/' + fy;
  const m = Number(r.month), y = Number(r.year); if (!m || !y) return '-';
  return String(m >= 10 ? m - 9 : m + 3).padStart(2, '0') + '/' + (m >= 10 ? y + 544 : y + 543);
};

async function notifyDispensed(reqId, admin) {
  const r = await fsGet('requisitions/' + reqId);
  if (!r) throw Object.assign(new Error('ไม่พบใบเบิก'), { status: 404 });
  const hid = String(r.hospitalId || '');
  const hosp = (await fsGet('master_hospitals/' + hid)) || {};
  const staff = (await fsQuery('users', [['hospital_id', 'EQUAL', hid]])).filter(u => u.line_user_id && !isAdminRole(u.role) && u.status !== 'Inactive');
  if (!staff.length) return { sent: 0, skipped: 0, note: 'ไม่มีผู้ใช้ รพ.สต. นี้ที่ผูก LINE' };
  const snap = Array.isArray(r.invs_request_lot_snapshot) ? r.invs_request_lot_snapshot : [];
  const itemCount = new Set(snap.map(x => String(x.drug_id))).size || Number(r.invs_total_item) || 0;
  const value = Number(r.invs_total_value) || snap.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const text = [
    `✅ ห้องยาจัดยาเรียบร้อยแล้ว`,
    `${hosp.hospital_name || hid} · รอบบิล ${roundText(r)}`,
    r.invs_sub_po_no ? `เลขที่ INVS: ${r.invs_sub_po_no}` : '',
    `จำนวน ${itemCount} รายการ · มูลค่า ${thb(value)} บาท`,
    ``,
    `ใบสรุปการจ่าย (Lot / วันหมดอายุ / จำนวน):`,
    sheetUrl('requisitions', reqId)
  ].filter((x, i) => x !== '' || i === 4).join('\n');
  const quota = await quotaStatus();
  let sent = 0, skipped = 0;
  for (const u of staff) {
    const res = await pushText(u.line_user_id, text, { audience: 'staff', type: 'dispensed', uid: u.id, name: u.name, quota });
    if (res.ok) sent++; else skipped++;
  }
  await fsPatch('requisitions/' + reqId, { line_dispensed_notified_at: new Date().toISOString(), line_dispensed_by: admin.name || admin.uid });
  return { sent, skipped, text };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  try {
    const body = await readJson(req);
    const user = await verifyUser(body.idToken);
    const admin = isAdminRole(user.role);
    switch (body.action) {
      case 'status': {
        if (!admin) return res.status(403).json({ ok: false, error: 'admin only' });
        const [quota, state] = await Promise.all([quotaStatus(), fsGet('line_meta/state')]);
        return res.status(200).json({ ok: true, quota, state: state || {} });
      }
      case 'test': {
        if (!user.line_user_id) return res.status(400).json({ ok: false, error: 'บัญชีนี้ยังไม่ได้ผูก LINE' });
        const r = await pushText(user.line_user_id, `ทดสอบการแจ้งเตือนจาก Sawee Rxfill\nถึง ${user.name || ''} — ได้รับข้อความนี้แสดงว่าเชื่อมต่อเรียบร้อย\n${SITE()}`, { audience: 'test', type: 'test', uid: user.uid, name: user.name });
        return res.status(200).json({ ok: r.ok, ...r });
      }
      case 'dispensed': {
        if (!admin) return res.status(403).json({ ok: false, error: 'admin only' });
        if (!body.reqId) return res.status(400).json({ ok: false, error: 'reqId required' });
        return res.status(200).json({ ok: true, ...(await notifyDispensed(String(body.reqId), user)) });
      }
      case 'unlink': {
        if (!admin) return res.status(403).json({ ok: false, error: 'admin only' });
        if (!body.uid) return res.status(400).json({ ok: false, error: 'uid required' });
        await fsPatch('users/' + body.uid, { line_user_id: '', line_display_name: '', line_unlinked_at: new Date().toISOString(), updated_at: { __ts: new Date().toISOString() } });
        return res.status(200).json({ ok: true });
      }
      default: return res.status(400).json({ ok: false, error: 'unknown action' });
    }
  } catch (e) {
    console.error('[line-notify]', e);
    return res.status(e.status || 500).json({ ok: false, error: e.message });
  }
};
