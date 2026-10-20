// Sawee Rxfill — ใบสรุปการจ่ายยา (v6.9) GET ?c=r&id=<reqId>&t=<hmac>
// ลิงก์ที่ส่งทาง LINE เปิดได้โดยไม่ต้อง login (ตรวจลายเซ็น HMAC) · แสดง Lot / วันหมดอายุ / จำนวนที่จ่าย
const { crypto, fsGet, sheetToken, thb } = require('./_lib/core');

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const thDate = (raw) => {
  const d = raw ? new Date(raw) : null; if (!d || isNaN(d)) return '-';
  const t = new Date(d.getTime() + 7 * 3600000);
  return `${t.getUTCDate()} ${TH_MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear() + 543}`;
};
const expTh = (raw) => {
  const v = String(raw || '').replace(/\D/g, '').slice(0, 8);
  return v.length === 8 ? `${v.slice(6, 8)}/${v.slice(4, 6)}/${+v.slice(0, 4) + (+v.slice(0, 4) < 2400 ? 543 : 0)}` : esc(raw || '-');
};
const roundText = (r) => {
  const term = num(r.fiscal_term), fy = num(r.fiscal_year);
  if (term && fy) return String(term).padStart(2, '0') + '/' + fy;
  const m = num(r.month), y = num(r.year); if (!m || !y) return '-';
  return String(m >= 10 ? m - 9 : m + 3).padStart(2, '0') + '/' + (m >= 10 ? y + 544 : y + 543);
};
const codeLabel = (id, old) => esc(id) + (old && String(old) !== String(id) ? '(' + esc(old) + ')' : '');

function page(title, body) {
  return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(title) + '</title><meta name="robots" content="noindex">' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=block" rel="stylesheet"><style>' +
    '@page{size:A4 portrait;margin:14mm 10mm 14mm 10mm;@top-right{content:"หน้า " counter(page) "/" counter(pages);font-family:Sarabun,Tahoma,sans-serif;font-size:9px;color:#555}}' +
    "*{box-sizing:border-box}body{font-family:'Sarabun','Tahoma',sans-serif;font-size:12.5px;line-height:1.45;color:#111;margin:0;background:#fff}" +
    '.wrap{max-width:200mm;margin:0 auto;padding:12px}' +
    'h1{text-align:center;font-size:19px;font-weight:700;margin:0 0 6px}.meta{text-align:right}.meta b{display:inline-block;min-width:3.5em;text-align:center;border-bottom:1px dotted #555;font-weight:700}' +
    '.intro{text-indent:2.5em;margin:6px 0 8px}.intro b{font-weight:700}table{width:100%;border-collapse:collapse}' +
    '.items{font-size:10.5px}.items th,.items td{border:1px solid #444;padding:3px 4px;vertical-align:middle}.items th{background:#eee;font-weight:700;text-align:center;line-height:1.25}' +
    '.items tr{page-break-inside:avoid}.items thead{display:table-header-group}.c{text-align:center}.r{text-align:right;white-space:nowrap}.name{font-weight:600}' +
    ".code{font-family:Consolas,'Courier New',monospace;font-size:9.5px;color:#555}.tot td{font-weight:700;background:#f6f6f6}" +
    '.note{margin-top:10px;font-size:11px;color:#333}.sigs{display:grid;grid-template-columns:1fr 1fr;gap:16px 28px;margin-top:26px;text-align:center;page-break-inside:avoid}' +
    '.bar{position:sticky;top:0;background:#0f766e;color:#fff;padding:8px 12px;display:flex;gap:8px;justify-content:space-between;align-items:center;font-size:13px}' +
    '.bar button{background:#fff;color:#0f766e;border:0;border-radius:8px;padding:6px 14px;font-weight:700;font-family:inherit;font-size:13px}' +
    '@media screen and (max-width:640px){.items{font-size:9.5px}.wrap{padding:6px}}@media print{.bar{display:none}.wrap{padding:0;max-width:none}}' +
    '</style></head><body>' + body + '</body></html>';
}

module.exports = async (req, res) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const col = q.c === 'i' ? 'internal_requisitions' : 'requisitions';
  const id = String(q.id || '');
  const sendErr = (code, msg) => { res.statusCode = code; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page('Sawee Rxfill', '<div class="wrap"><h1>' + esc(msg) + '</h1></div>')); };
  try {
    const expect = id ? sheetToken(col, id) : '';
    const got = String(q.t || '');
    if (!id || got.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expect))) return sendErr(403, 'ลิงก์ไม่ถูกต้องหรือหมดสิทธิ์');
    const r = await fsGet(col + '/' + id);
    if (!r) return sendErr(404, 'ไม่พบใบเบิก');
    const snap = [r.invs_dispense_snapshot, r.invs_request_lot_snapshot, r.invs_items_snapshot].find(a => Array.isArray(a) && a.length) || [];
    if (!snap.length) return sendErr(404, 'ใบเบิกนี้ยังไม่มีข้อมูลการจ่าย');
    const hid = String(r.hospitalId || r.dept_id || '');
    const hosp = (await fsGet((col === 'requisitions' ? 'master_hospitals/' : 'master_depts/') + hid)) || {};
    const unitName = name => name || '';
    const itemByDrug = new Map((r.items || []).map(it => [String(it.drugId || it.drug_id || ''), it]));
    const drugIds = [...new Set(snap.map(x => String(x.drug_id || x.WORKING_CODE || '')))];
    const masters = new Map(await Promise.all(drugIds.map(async d => [d, itemByDrug.has(d) && itemByDrug.get(d).name ? null : await fsGet('master_drugs/' + d).catch(() => null)])));
    let total = 0;
    const rows = snap.map((x, i) => {
      const did = String(x.drug_id || x.WORKING_CODE || '');
      const it = itemByDrug.get(did) || {}; const m = masters.get(did) || {};
      const qty = num(x.qty_rcv ?? x.QTY_RCV ?? x.qty ?? x.QTY_ORDER);
      const cost = num(x.pack_cost || x.cost);
      const value = num(x.value) || qty * cost;
      total += value;
      return '<tr><td class="c">' + (i + 1) + '</td><td class="name">' + esc(x.drug_name || it.name || it.drug_name || m.drug_name || did) + '</td>' +
        '<td class="c">' + esc(unitName(it.unit || it.unit_name || m.unit_name)) + '</td><td class="c code">' + esc(x.lot_no || x.LOT_NO || '-') + '</td>' +
        '<td class="c">' + expTh(x.expiry || x.EXPIRED_DATE) + '</td><td class="r">' + qty.toLocaleString('th-TH') + '</td>' +
        '<td class="r">' + thb(cost) + '</td><td class="r">' + thb(value) + '</td><td class="c code">' + codeLabel(did, it.old_code || m.old_code) + '</td></tr>';
    }).join('');
    const place = hosp.hospital_name || hosp.dept_name || r.hospital_name || r.dept_name || hid;
    const title = `ใบสรุปการจ่าย ${place} ${roundText(r).replace('/', '-')}`;
    const body = '<div class="bar"><span>ใบสรุปการจ่ายยา · Sawee Rxfill</span><button onclick="window.print()">พิมพ์ / บันทึก PDF</button></div><div class="wrap">' +
      '<h1>ใบสรุปการจ่ายยาและเวชภัณฑ์</h1>' +
      '<div class="meta"><div>เลขที่ INVS <b>' + esc(r.invs_sub_po_no || '-') + '</b> รอบบิล <b>' + esc(roundText(r)) + '</b></div>' +
      '<div>วันที่ส่งจ่าย <b>' + esc(thDate(r.invs_sent_at || r.approved_at || r.updated_at)) + '</b></div></div>' +
      '<div class="intro">กลุ่มงานเภสัชกรรมและคุ้มครองผู้บริโภค โรงพยาบาลสวี ได้จัดยาและเวชภัณฑ์ให้แก่ <b>' + esc(place) + '</b> เรียบร้อยแล้ว ตามรายการต่อไปนี้</div>' +
      '<table class="items"><thead><tr><th style="width:4%">ที่</th><th>ชื่อยา/เวชภัณฑ์</th><th style="width:8%">หน่วย</th><th style="width:12%">Lot</th><th style="width:10%">วันหมดอายุ</th>' +
      '<th style="width:8%">จำนวนจ่าย</th><th style="width:9%">ราคา/หน่วย</th><th style="width:10%">มูลค่า</th><th style="width:10%">รหัส</th></tr></thead><tbody>' + rows +
      '<tr class="tot"><td colspan="7" class="r">รวม ' + snap.length + ' บรรทัด · มูลค่ารวม (บาท)</td><td class="r">' + thb(num(r.invs_total_value) || total) + '</td><td></td></tr></tbody></table>' +
      '<div class="note">หมายเหตุ: ข้อมูล Lot / วันหมดอายุ ตามที่ส่งเข้าระบบ INVS หากของที่ได้รับไม่ตรงกับใบนี้ กรุณาแจ้งห้องยา</div>' +
      '<div class="sigs"><div>ลงชื่อ ..................................... ผู้จ่าย<br>(.....................................)</div><div>ลงชื่อ ..................................... ผู้รับของ<br>(.....................................)</div></div>' +
      '</div>';
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end(page(title, body));
  } catch (e) {
    console.error('[dispense-sheet]', e);
    sendErr(500, 'เกิดข้อผิดพลาด กรุณาลองใหม่');
  }
};
