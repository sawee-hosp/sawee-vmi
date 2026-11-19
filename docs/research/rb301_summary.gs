/**
 * สรุปไฟล์ รบ.301 ทุกไฟล์ในโฟลเดอร์ Drive → Google Sheet (อ่านอย่างเดียว ไม่แก้ไฟล์ต้นฉบับ)
 *
 * วิธีใช้
 * 1) เปิด https://script.google.com → New project → วางโค้ดนี้ทั้งหมด
 * 2) (ไม่ต้องเพิ่ม Services ใด ๆ)
 * 3) เลือกฟังก์ชัน runRb301Summary → Run → อนุญาตสิทธิ์ Drive / Sheets
 * 4) เสร็จแล้วดูลิงก์ Sheet ผลลัพธ์ใน Execution log (สร้างไฟล์ใหม่ "สรุป รบ.301 ..." ใน My Drive)
 *
 * ชื่อไฟล์ที่ระบบตั้ง: Rxfill_<รหัส รพ.สต.>_<เดือนรอบเบิก>_<ปี ค.ศ.>.xls  เช่น Rxfill_h13_11_2026.xls
 * ถ้ามีหลายไฟล์ของ รพ.สต./รอบเดียวกัน (อัปโหลดซ้ำ) ใช้ไฟล์ล่าสุด และบอกจำนวนไฟล์ซ้ำ
 */
const RB_FOLDER_ID = '1LgEsSla3hskQ7WFoiOETI95yuTb2TK4j'; // โฟลเดอร์ที่ระบบอัปโหลด รบ.301
const RB_FROM = { y: 2026, m: 7 };   // รวมไฟล์ชื่อ _7_2026 (= รอบ ส.ค. 2569 ก่อนย้ายเดือนใบ ก.ค.→ส.ค.)
const RB_TO = { y: 2026, m: 11 };    // ถึงรอบ พ.ย. 2569

const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function runRb301Summary() {
  const files = [];
  const it = DriveApp.getFolderById(RB_FOLDER_ID).getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const m = f.getName().match(/^Rxfill_(h\d+)_(\d{1,2})_(\d{4})\.xlsx?$/i);
    if (!m) continue;
    let mm = Number(m[2]), yy = Number(m[3]);
    if (yy === 2026 && mm === 7) mm = 8; // ใบรอบแรกถูกย้ายจาก ก.ค. → ส.ค. แต่ชื่อไฟล์ยังเป็น _7_
    const k = yy * 100 + mm;
    if (k < RB_FROM.y * 100 + RB_FROM.m || k > RB_TO.y * 100 + RB_TO.m) continue;
    files.push({ file: f, hosp: m[1].toLowerCase(), month: mm, year: yy, created: f.getDateCreated() });
  }
  // เลือกไฟล์ล่าสุดต่อ รพ.สต./รอบ
  const byKey = {};
  files.forEach(x => { const key = x.hosp + '_' + x.year + '_' + x.month; (byKey[key] = byKey[key] || []).push(x); });
  const picks = Object.keys(byKey).sort().map(key => {
    const arr = byKey[key].sort((a, b) => b.created - a.created);
    return Object.assign({}, arr[0], { dupCount: arr.length });
  });

  const summary = [[
    'รพ.สต.', 'ชื่อในไฟล์', 'รอบเบิก', 'ช่วงวันที่ในไฟล์', 'ตรวจช่วง', 'จำนวนรายการ',
    'มูลค่ายกมา', 'มูลค่ารับ', 'มูลค่าจ่าย', 'มูลค่าคงเหลือ (สิ้นงวด)', 'มูลค่าจ่ายท้ายไฟล์',
    'อัตราหมุนเวียน (จ่าย ÷ คงคลังเฉลี่ย)', 'วันที่ยาพอใช้ (คงเหลือ ÷ จ่ายต่อวัน)',
    'ยาขาด (คงเหลือ ≤0 และมีจ่าย)', 'ไม่เคลื่อนไหว (มีคงเหลือ ไม่มีจ่าย)', 'คงเหลือติดลบ', 'ไม่มีหน่วย',
    'ราคาต่อหน่วยไม่คงที่', 'สมดุลจำนวนผิด', 'ไฟล์ซ้ำ', 'ไฟล์'
  ]];
  const items = [[
    'รพ.สต.', 'รอบเบิก', 'กลุ่ม', 'ลำดับ', 'ชื่อยา-เวชภัณฑ์', 'หน่วย',
    'ยอดยกมา', 'มูลค่ายกมา', 'รับ', 'มูลค่ารับ', 'จ่าย', 'มูลค่าจ่าย', 'คงเหลือ', 'มูลค่าคงเหลือ', 'ข้อสังเกต'
  ]];

  picks.forEach(p => {
    let rows;
    try { rows = readRows_(p.file); } catch (e) { summary.push([p.hosp, 'อ่านไฟล์ไม่ได้: ' + e.message]); return; }
    const r = parseRb301_(rows);
    const round = TH_MON[p.month - 1] + ' ' + (p.year + 543);
    const days = r.from && r.to ? Math.round((r.to - r.from) / 86400000) + 1 : 30;
    const t = { v0: 0, v1: 0, v2: 0, v3: 0, out: 0, dead: 0, neg: 0, nounit: 0, price: 0, bal: 0 };
    r.items.forEach(x => {
      t.v0 += x.v0; t.v1 += x.v1; t.v2 += x.v2; t.v3 += x.v3;
      const notes = [];
      if (x.q3 <= 0 && x.q2 > 0) { t.out++; notes.push('ยาขาด/หมด'); }
      if (x.q3 > 0 && x.q2 === 0) { t.dead++; notes.push('ไม่เคลื่อนไหว'); }
      if (x.q3 < 0) { t.neg++; notes.push('คงเหลือติดลบ'); }
      if (!x.unit) { t.nounit++; notes.push('ไม่มีหน่วย'); }
      const pr = [[x.v0, x.q0], [x.v1, x.q1], [x.v2, x.q2], [x.v3, x.q3]].filter(a => a[1] > 0).map(a => a[0] / a[1]);
      if (pr.length && Math.max.apply(null, pr) - Math.min.apply(null, pr) > 0.05 * Math.max.apply(null, pr)) { t.price++; notes.push('ราคาไม่คงที่'); }
      if (Math.abs(x.q0 + x.q1 - x.q2 - x.q3) > 0.01) { t.bal++; notes.push('จำนวนไม่สมดุล'); }
      items.push([p.hosp, round, x.group, x.no, x.name, x.unit, x.q0, x.v0, x.q1, x.v1, x.q2, x.v2, x.q3, x.v3, notes.join(', ')]);
    });
    const avgStock = (t.v0 + t.v3) / 2;
    summary.push([
      p.hosp, r.hospInfo, round, r.periodText, periodCheck_(r.from, r.to, p.month, p.year), r.items.length,
      round2_(t.v0), round2_(t.v1), round2_(t.v2), round2_(t.v3), r.totalValue === null ? '' : r.totalValue,
      avgStock > 0 ? round2_(t.v2 / avgStock) : '', t.v2 > 0 ? Math.round(t.v3 / (t.v2 / days)) : '',
      t.out, t.dead, t.neg, t.nounit, t.price, t.bal, p.dupCount > 1 ? p.dupCount : '', p.file.getUrl()
    ]);
  });

  const ss = SpreadsheetApp.create('สรุป รบ.301 ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm'));
  const s1 = ss.getActiveSheet(); s1.setName('สรุปรายแห่ง');
  s1.getRange(1, 1, summary.length, summary[0].length).setValues(summary.map(row => pad_(row, summary[0].length)));
  s1.setFrozenRows(1); s1.getRange(1, 1, 1, summary[0].length).setFontWeight('bold').setBackground('#e0f2f1');
  const s2 = ss.insertSheet('รายการยา');
  s2.getRange(1, 1, items.length, items[0].length).setValues(items);
  s2.setFrozenRows(1); s2.getRange(1, 1, 1, items[0].length).setFontWeight('bold').setBackground('#e0f2f1');
  const s3 = ss.insertSheet('คำอธิบาย');
  s3.getRange(1, 1, 9, 1).setValues([
    ['ที่มา: ไฟล์ รบ.301 (JHCIS) ที่ รพ.สต. อัปโหลดเข้า Sawee Rxfill · อ่านอย่างเดียว'],
    ['มูลค่าทุกช่องเป็นมูลค่าตามราคาในไฟล์ของแต่ละ รพ.สต. (ราคา JHCIS แต่ละแห่งอาจไม่เท่ากัน)'],
    ['ตรวจช่วง: รอบเบิกเดือน M ควรเป็น 21 ของเดือน M−2 ถึง 20 ของเดือน M−1'],
    ['อัตราหมุนเวียน = มูลค่าจ่าย ÷ ((มูลค่ายกมา + มูลค่าคงเหลือ) ÷ 2) ต่อ 1 งวด'],
    ['วันที่ยาพอใช้ = มูลค่าคงเหลือ ÷ (มูลค่าจ่าย ÷ จำนวนวันในงวด)'],
    ['ยาขาด = คงเหลือสิ้นงวด ≤ 0 และมีการจ่ายในงวด (ใช้แทนการนับยาขาด)'],
    ['ไม่เคลื่อนไหว = มีคงเหลือแต่ไม่มีการจ่ายในงวด'],
    ['ราคาไม่คงที่ = ราคาต่อหน่วย (ยกมา/รับ/จ่าย/คงเหลือ) ต่างกันเกิน 5%'],
    ['ไฟล์ซ้ำ = จำนวนไฟล์ของ รพ.สต./รอบเดียวกัน (ใช้ไฟล์ล่าสุด)']
  ]);
  Logger.log('เสร็จ: ' + ss.getUrl() + ' (' + picks.length + ' ไฟล์)');
}

// แปลง xls/xlsx เป็น Google Sheet ชั่วคราว อ่านค่า แล้วลบไฟล์ชั่วคราวทิ้ง
function readRows_(file) {
  // ใช้ Drive REST API ตรง (ไม่ต้องเปิด Advanced Drive Service)
  const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + file.getId() + '/copy', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ name: 'tmp_rb301', mimeType: 'application/vnd.google-apps.spreadsheet' })
  });
  if (res.getResponseCode() !== 200) throw new Error('แปลงไฟล์ไม่ได้ ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 150));
  const id = JSON.parse(res.getContentText()).id;
  try { return SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getDisplayValues(); }
  finally { DriveApp.getFileById(id).setTrashed(true); }
}
// (บรรทัดนี้ทำให้ Apps Script ขอสิทธิ์ Drive แบบเต็ม: DriveApp.createFile)

function parseRb301_(rows) {
  const out = { hospInfo: '', periodText: '', from: null, to: null, items: [], totalValue: null };
  let group = '';
  const num = s => { const v = parseFloat(String(s).replace(/,/g, '')); return isNaN(v) ? 0 : v; };
  rows.forEach(row => {
    const c = row.map(v => String(v == null ? '' : v).trim()).filter(v => v !== '');
    if (!c.length) return;
    if (!out.hospInfo && c.some(v => v.indexOf('สถานบริการ') >= 0)) out.hospInfo = c.filter(v => v.indexOf('สถานบริการ') >= 0)[0];
    if (!out.periodText && c.some(v => v.indexOf('ระหว่างวันที่') >= 0)) {
      out.periodText = c.join(' ');
      const m = out.periodText.match(/(\d{1,2})\s*([ก-๙\.]+)\s*(\d{4})\s*-\s*(\d{1,2})\s*([ก-๙\.]+)\s*(\d{4})/);
      if (m) { out.from = thDate_(m[1], m[2], m[3]); out.to = thDate_(m[4], m[5], m[6]); }
    }
    if (c.length === 1 && /^\(.*\)$/.test(c[0])) { group = c[0].replace(/[()]/g, '').trim(); return; }
    if (c.some(v => v.indexOf('รวมมูลค่าทั้งหมด') >= 0)) { const k = c.findIndex(v => v.indexOf('มูลค่าจ่าย') === 0); if (k >= 0 && c[k + 1]) out.totalValue = num(c[k + 1]); return; }
    if (c.length >= 10 && /^\d+\.?$/.test(c[0]) && c[1].indexOf('รวม') < 0) {
      out.items.push({ group: group, no: c[0].replace('.', ''), name: c[1],
        q0: num(c[2]), v0: num(c[3]), q1: num(c[4]), v1: num(c[5]), q2: num(c[6]), v2: num(c[7]), q3: num(c[8]), v3: num(c[9]),
        unit: c[10] || '' });
    }
  });
  return out;
}

function thDate_(d, mon, y) {
  const i = TH_MON.indexOf(mon.replace(/\s/g, ''));
  if (i < 0) return null;
  let yy = Number(y); if (yy > 2400) yy -= 543;
  return new Date(yy, i, Number(d));
}

function periodCheck_(from, to, month, year) {
  if (!to) return 'ไม่พบช่วงวันที่';
  const expTo = new Date(year, month - 2, 20);
  if (to.getFullYear() === expTo.getFullYear() && to.getMonth() === expTo.getMonth()) return 'ตรงรอบ';
  const r = new Date(to.getFullYear(), to.getMonth() + 1, 1);
  return 'ผิดรอบ (ไฟล์เป็นของรอบ ' + TH_MON[r.getMonth()] + ' ' + (r.getFullYear() + 543) + ')';
}

function round2_(v) { return Math.round(v * 100) / 100; }
function pad_(row, n) { const r = row.slice(); while (r.length < n) r.push(''); return r; }
