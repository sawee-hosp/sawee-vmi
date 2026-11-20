/**
 * ข้อมูลวิจัยจากไฟล์ รบ.301 (JHCIS) — ซ่อมเดือนอัตโนมัติ + ตารางความครบถ้วน + ชุดข้อมูลวิจัย
 * อ่านอย่างเดียว ไม่แก้ไฟล์ต้นฉบับ / ไม่เขียน Firestore
 *
 * วิธีใช้: script.google.com → New project → วางโค้ดนี้ → เลือก runRb301Research → Run → Allow
 *          ผลเป็น Google Sheet ใหม่ "ข้อมูลวิจัย รบ.301 ..." ใน My Drive (ลิงก์อยู่ใน Execution log)
 *
 * การซ่อมแซม (ไม่เชื่อชื่อไฟล์ ใช้เนื้อหาในไฟล์แทน)
 *  - รพ.สต. = รหัสสถานบริการ 5 หลักในหัวไฟล์ (เช่น 14094 = h13) — ไฟล์ที่อัปโหลดผิดแห่ง/จาก h01 (ทดสอบ) ถูกย้ายไปแห่งที่ถูก
 *  - รอบเบิก = เดือนของ "วันสิ้นสุด" ในไฟล์ + 1 (รอบ M = 21 ของ M−2 ถึง 20 ของ M−1)
 *  - ไฟล์หลายไฟล์ในรอบเดียวกัน = เลือกไฟล์ที่ครอบคลุมช่วงตรงที่สุด (เท่ากันเลือกไฟล์ล่าสุด)
 *  - คงเหลือสิ้นงวด ถูกต้องเมื่อวันสิ้นสุดตรง แม้วันเริ่มผิด · ยอดจ่ายปรับเป็นต่อ 30 วัน ตามจำนวนวันจริงในไฟล์
 *  - มูลค่ามาตรฐาน = จำนวน × ราคากลางเครือข่าย (มัธยฐานราคาต่อหน่วยของชื่อยาเดียวกันจากทุกไฟล์) — แก้ปัญหาราคา JHCIS แต่ละแห่งไม่เท่ากัน
 */
const RR_FOLDER_ID = '1LgEsSla3hskQ7WFoiOETI95yuTb2TK4j';
const RR_ROUNDS = ['2026-08', '2026-09', '2026-10', '2026-11']; // รอบเบิก ส.ค.–พ.ย. 2569
const RR_EXCLUDE_GROUP = /วัคซีน/;   // ไม่นับในยอดรวม (VMI ไม่รวมวัคซีน)
const RR_HOSP = {
  '09418': ['h02', 'ท่าหิน'], '09420': ['h03', 'ด่านสวี'], '09427': ['h04', 'เขาทะลุ'], '09428': ['h05', 'เขาค่าย'],
  '09419': ['h06', 'ปากแพรก'], '09415': ['h07', 'สวี (ห้วยแร่)'], '09424': ['h08', 'นาสัก'], '09426': ['h09', 'บ้านไทยพัฒนา'],
  '09425': ['h10', 'บ้านแก่งกระทั่ง'], '09417': ['h11', 'บ้านคลองน้อย'], '09416': ['h12', 'ทุ่งระยะ'], '14094': ['h13', 'บ้านดอนทราย'],
  '09423': ['h14', 'วิสัยใต้'], '09421': ['h15', 'ครน'], '14093': ['h16', 'บ้านควนสามัคคี'], '09422': ['h17', 'บ้านน้ำฉา']
};
const RR_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const DAY = 86400000;

function runRb301Research() {
  // 1) อ่านทุกไฟล์
  const files = [];
  const it = DriveApp.getFolderById(RR_FOLDER_ID).getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const m = f.getName().match(/^Rxfill_(h\d+)_(\d{1,2})_(\d{4})\.xlsx?$/i);
    if (!m) continue;
    let nm = Number(m[2]), ny = Number(m[3]);
    if (ny === 2026 && nm === 7) nm = 8; // ใบรอบแรกย้าย ก.ค. → ส.ค. แต่ชื่อไฟล์ยังเป็น _7_
    const rec = { file: f, name: f.getName(), nameHosp: m[1].toLowerCase(), nameRound: ny + '-' + ('0' + nm).slice(-2), created: f.getDateCreated() };
    try { Object.assign(rec, rrParse_(rrReadRows_(f))); } catch (e) { rec.error = e.message.slice(0, 150); }
    files.push(rec);
  }
  // 2) ระบุ รพ.สต. + รอบ จากเนื้อหาไฟล์
  files.forEach(r => {
    if (r.error) return;
    const code = (String(r.hospInfo).match(/\((\d{5})\)/) || [])[1];
    r.hosp = code && RR_HOSP[code] ? RR_HOSP[code][0] : (r.nameHosp === 'h01' ? '' : r.nameHosp);
    if (!r.to) { r.error = 'ไม่พบช่วงวันที่ในไฟล์'; return; }
    const rd = new Date(r.to.getFullYear(), r.to.getMonth() + 1, 1);
    r.round = rd.getFullYear() + '-' + ('0' + (rd.getMonth() + 1)).slice(-2);
    Object.assign(r, rrCoverage_(r.from, r.to, rd.getFullYear(), rd.getMonth() + 1));
  });
  // 3) เลือกไฟล์ที่ดีที่สุดต่อ รพ.สต./รอบ
  const best = {};
  files.filter(r => !r.error && r.hosp && RR_ROUNDS.indexOf(r.round) >= 0).forEach(r => {
    const k = r.hosp + '|' + r.round, cur = best[k];
    if (!cur || r.score > cur.score || (r.score === cur.score && r.created > cur.created)) best[k] = r;
  });
  Object.keys(best).forEach(k => { best[k].used = true; });

  // 4) ราคากลางเครือข่าย = มัธยฐานราคาต่อหน่วย (ทุกช่อง ยกมา/รับ/จ่าย/คงเหลือ ที่จำนวน > 0) ต่อชื่อยา
  const prices = {};
  files.filter(r => r.used).forEach(r => r.items.forEach(x => {
    [[x.v0, x.q0], [x.v1, x.q1], [x.v2, x.q2], [x.v3, x.q3]].forEach(a => { if (a[1] > 0 && a[0] > 0) (prices[x.key] = prices[x.key] || []).push(a[0] / a[1]); });
  }));
  const median = {};
  Object.keys(prices).forEach(k => { const a = prices[k].sort((p, q) => p - q); const n = a.length; median[k] = n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; });

  // 5) ตาราง
  const hospIds = Object.keys(RR_HOSP).map(c => RR_HOSP[c]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const roundLabel = r => { const p = r.split('-'); return RR_MON[Number(p[1]) - 1] + ' ' + (Number(p[0]) + 543); };
  const winText = r => { const p = r.split('-').map(Number); const w = rrWindow_(p[0], p[1]); return rrTh_(w.from) + ' – ' + rrTh_(w.to); };

  const matrix = [['รพ.สต.', 'ชื่อ'].concat(RR_ROUNDS.map(roundLabel)).concat(['ต้องขอไฟล์ใหม่'])];
  const ask = [['รพ.สต.', 'ชื่อ', 'รอบเบิก', 'ช่วงที่ต้องการ', 'สถานะปัจจุบัน', 'ความสำคัญ']];
  hospIds.forEach(h => {
    const row = [h[0], h[1]], need = [];
    RR_ROUNDS.forEach(rd => {
      const b = best[h[0] + '|' + rd];
      if (!b) { row.push('✖ ไม่มีไฟล์'); need.push(roundLabel(rd)); ask.push([h[0], h[1], roundLabel(rd), winText(rd), 'ไม่มีไฟล์ของช่วงนี้', 'ต้องขอ (ไม่มีทั้งคงเหลือและยอดจ่าย)']); return; }
      row.push((b.status === 'ครบ' ? '✔ ' : '△ ') + b.status + (b.nameHosp !== h[0] || b.nameRound !== rd ? ' [ซ่อม: ' + b.name + ']' : ''));
      if (b.status !== 'ครบ') {
        const endOk = b.endDiff === 0;
        need.push(roundLabel(rd) + (endOk ? '(ควร)' : ''));
        ask.push([h[0], h[1], roundLabel(rd), winText(rd), rrTh_(b.from) + ' – ' + rrTh_(b.to) + ' · ' + b.status,
          endOk ? 'ควรขอ (คงเหลือสิ้นงวดใช้ได้ ยอดจ่ายเป็นค่าประมาณต่อ 30 วัน)' : 'ต้องขอ (วันสิ้นสุดไม่ตรง คงเหลือสิ้นงวดผิดวัน)']);
      }
    });
    row.push(need.join(', ') || '-');
    matrix.push(row);
  });

  const filesSheet = [['ไฟล์', 'อัปโหลดเมื่อ', 'รพ.สต. ตามชื่อไฟล์', 'รพ.สต. ตามเนื้อหา', 'ชื่อในไฟล์', 'ช่วงวันที่', 'รอบเบิก (ตามวันสิ้นสุด)', 'จำนวนวัน', 'สถานะช่วง', 'ใช้ในชุดข้อมูล', 'หมายเหตุ', 'ลิงก์']];
  files.sort((a, b) => (a.hosp || 'z').localeCompare(b.hosp || 'z') || String(a.round).localeCompare(String(b.round))).forEach(r => {
    let note = r.error || '';
    if (!r.error && !r.hosp) note = 'รหัสสถานบริการไม่อยู่ในรายการ (ไฟล์ทดสอบ?)';
    else if (!r.error && !r.used) note = RR_ROUNDS.indexOf(r.round) < 0 ? 'อยู่นอกช่วงรอบที่ศึกษา' : 'มีไฟล์อื่นที่ครอบคลุมรอบนี้ดีกว่า';
    else if (r.used && r.nameHosp !== r.hosp) note = 'ย้ายจาก ' + r.nameHosp + ' → ' + r.hosp;
    filesSheet.push([r.name, r.created, r.nameHosp, r.hosp || '', r.hospInfo || '', r.from ? rrTh_(r.from) + ' – ' + rrTh_(r.to) : '',
      r.round ? roundLabel(r.round) : '', r.days || '', r.status || '', r.used ? 'ใช้' : '', note, r.file.getUrl()]);
  });

  const summary = [['รพ.สต.', 'ชื่อ', 'รอบเบิก', 'สถานะช่วง', 'จำนวนวันในไฟล์', 'จำนวนรายการ (ไม่รวมวัคซีน)',
    'คงเหลือสิ้นงวด (ราคากลาง)', 'จ่ายต่อ 30 วัน (ราคากลาง)', 'วันที่ยาพอใช้', 'คงเหลือสิ้นงวด (ราคาในไฟล์)', 'จ่ายในไฟล์ (ราคาในไฟล์)',
    'ยาขาด (คงเหลือ ≤0 มีจ่าย)', 'ยาหมด (คงเหลือ 0 ไม่ได้รับ)', 'ไม่เคลื่อนไหว', 'คงเหลือติดลบ', 'ไม่มีราคากลาง', 'ไฟล์']];
  const long = [['รพ.สต.', 'รอบเบิก', 'สถานะช่วง', 'จำนวนวัน', 'กลุ่ม', 'ชื่อยา-เวชภัณฑ์', 'ชื่อมาตรฐาน (key)', 'หน่วย',
    'ยกมา', 'รับ', 'จ่าย', 'คงเหลือ', 'จ่ายต่อ 30 วัน', 'ราคากลาง/หน่วย', 'มูลค่าคงเหลือ (ราคากลาง)', 'มูลค่าจ่ายต่อ 30 วัน (ราคากลาง)',
    'มูลค่าคงเหลือ (ในไฟล์)', 'มูลค่าจ่าย (ในไฟล์)', 'ข้อสังเกต']];
  hospIds.forEach(h => RR_ROUNDS.forEach(rd => {
    const b = best[h[0] + '|' + rd];
    if (!b) { summary.push([h[0], h[1], roundLabel(rd), 'ไม่มีไฟล์']); return; }
    const t = { n: 0, close: 0, disp30: 0, fClose: 0, fDisp: 0, out: 0, zero: 0, dead: 0, neg: 0, noPrice: 0 };
    b.items.forEach(x => {
      const p = median[x.key];
      const disp30 = x.q2 * 30 / b.days;
      const notes = [];
      if (x.q3 <= 0 && x.q2 > 0) notes.push('ยาขาด');
      if (x.q3 === 0 && x.q1 === 0 && x.q0 > 0) notes.push('ยาหมด');
      if (x.q3 > 0 && x.q2 === 0) notes.push('ไม่เคลื่อนไหว');
      if (x.q3 < 0) notes.push('คงเหลือติดลบ');
      if (p === undefined) notes.push('ไม่มีราคากลาง');
      const excluded = RR_EXCLUDE_GROUP.test(x.group);
      if (excluded) notes.push('ไม่นับรวม (วัคซีน)');
      else {
        t.n++; t.fClose += x.v3; t.fDisp += x.v2;
        if (p !== undefined) { t.close += Math.max(0, x.q3) * p; t.disp30 += disp30 * p; } else t.noPrice++;
        if (notes.indexOf('ยาขาด') >= 0) t.out++;
        if (notes.indexOf('ยาหมด') >= 0) t.zero++;
        if (notes.indexOf('ไม่เคลื่อนไหว') >= 0) t.dead++;
        if (x.q3 < 0) t.neg++;
      }
      long.push([h[0], roundLabel(rd), b.status, b.days, x.group, x.name, x.key, x.unit, x.q0, x.q1, x.q2, x.q3, rrR_(disp30),
        p === undefined ? '' : rrR_(p, 4), p === undefined ? '' : rrR_(Math.max(0, x.q3) * p), p === undefined ? '' : rrR_(disp30 * p),
        x.v3, x.v2, notes.join(', ')]);
    });
    summary.push([h[0], h[1], roundLabel(rd), b.status, b.days, t.n, rrR_(t.close), rrR_(t.disp30),
      t.disp30 > 0 ? Math.round(t.close / (t.disp30 / 30)) : '', rrR_(t.fClose), rrR_(t.fDisp), t.out, t.zero, t.dead, t.neg, t.noPrice, b.file.getUrl()]);
  }));

  const priceSheet = [['ชื่อมาตรฐาน (key)', 'ราคากลาง/หน่วย (มัธยฐาน)', 'จำนวนค่าที่ใช้', 'ต่ำสุด', 'สูงสุด']];
  Object.keys(prices).sort().forEach(k => { const a = prices[k]; priceSheet.push([k, rrR_(median[k], 4), a.length, rrR_(a[0], 4), rrR_(a[a.length - 1], 4)]); });

  const ss = SpreadsheetApp.create('ข้อมูลวิจัย รบ.301 ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm'));
  rrWrite_(ss.getActiveSheet(), 'ความครบถ้วน', matrix);
  rrWrite_(ss.insertSheet(), 'ต้องขอเพิ่ม', ask);
  rrWrite_(ss.insertSheet(), 'สรุปรายแห่งรายรอบ', summary);
  rrWrite_(ss.insertSheet(), 'รายการยา (long)', long);
  rrWrite_(ss.insertSheet(), 'ราคากลาง', priceSheet);
  rrWrite_(ss.insertSheet(), 'ไฟล์ทั้งหมด', filesSheet);
  rrWrite_(ss.insertSheet(), 'คำอธิบาย', [
    ['ที่มา: ไฟล์ รบ.301 (JHCIS) ที่ รพ.สต. อัปโหลดเข้า Sawee Rxfill · อ่านอย่างเดียว · h01 (ทดสอบ) ไม่นับเป็น รพ.สต.'],
    ['รพ.สต. ระบุจากรหัสสถานบริการในหัวไฟล์ · รอบเบิก = เดือนวันสิ้นสุดในไฟล์ + 1 (ไม่ใช้ชื่อไฟล์)'],
    ['ช่วงมาตรฐานของรอบ M: 21 ของเดือน M−2 ถึง 20 ของเดือน M−1 · "ครบ" = ต่างจากช่วงมาตรฐานไม่เกิน 2 วันทั้งต้นและท้าย'],
    ['คงเหลือสิ้นงวด ใช้ได้เมื่อวันสิ้นสุดตรง (แม้วันเริ่มผิด) · จ่ายต่อ 30 วัน = จ่าย × 30 ÷ จำนวนวันในไฟล์ (ค่าประมาณเมื่อช่วงไม่ครบ)'],
    ['ราคากลาง = มัธยฐานราคาต่อหน่วยของชื่อยาเดียวกัน (ชื่อมาตรฐาน: ตัดเลขนำหน้า/ช่องว่าง/ตัวพิมพ์) จากทุกไฟล์ที่ใช้ — ใช้เทียบข้ามแห่งแทนราคาในไฟล์'],
    ['คงเหลือติดลบไม่นำมารวมมูลค่าคงเหลือ (นับเป็น 0) และนับในคอลัมน์คงเหลือติดลบ'],
    ['ยาขาด = คงเหลือ ≤ 0 และมีการจ่าย · ยาหมด = มียกมาแต่คงเหลือ 0 และไม่ได้รับเพิ่ม · ไม่เคลื่อนไหว = มีคงเหลือแต่ไม่จ่าย'],
    ['วัคซีน (กลุ่มที่มีคำว่า วัคซีน) แสดงในรายการแต่ไม่นับยอดรวม · วันที่ยาพอใช้ = คงเหลือ ÷ (จ่ายต่อ 30 วัน ÷ 30)']
  ]);
  Logger.log('เสร็จ: ' + ss.getUrl() + ' (' + files.length + ' ไฟล์)');
}

function rrReadRows_(file) {
  const res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + file.getId() + '/copy', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ name: 'tmp_rb301', mimeType: 'application/vnd.google-apps.spreadsheet' })
  });
  if (res.getResponseCode() !== 200) throw new Error('แปลงไฟล์ไม่ได้ ' + res.getResponseCode() + ' (ไฟล์อาจเสีย — ให้ รพ.สต. export ใหม่)');
  const id = JSON.parse(res.getContentText()).id;
  try { return SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getDisplayValues(); }
  finally { DriveApp.getFileById(id).setTrashed(true); }
}
// DriveApp.createFile — บรรทัดนี้ให้ Apps Script ขอสิทธิ์ Drive แบบเต็ม

function rrParse_(rows) {
  const out = { hospInfo: '', from: null, to: null, items: [] };
  let group = '';
  const num = s => { const v = parseFloat(String(s).replace(/,/g, '')); return isNaN(v) ? 0 : v; };
  rows.forEach(row => {
    const c = row.map(v => String(v == null ? '' : v).trim()).filter(v => v !== '');
    if (!c.length) return;
    if (!out.hospInfo && c.some(v => v.indexOf('สถานบริการ') >= 0)) out.hospInfo = c.filter(v => v.indexOf('สถานบริการ') >= 0)[0];
    if (!out.to && c.some(v => v.indexOf('ระหว่างวันที่') >= 0)) {
      const m = c.join(' ').match(/(\d{1,2})\s*([ก-๙\.]+)\s*(\d{4})\s*-\s*(\d{1,2})\s*([ก-๙\.]+)\s*(\d{4})/);
      if (m) { out.from = rrThDate_(m[1], m[2], m[3]); out.to = rrThDate_(m[4], m[5], m[6]); }
    }
    if (c.length === 1 && /^\(.*\)$/.test(c[0])) { group = c[0].replace(/[()]/g, '').trim(); return; }
    if (c.length >= 10 && /^\d+\.?$/.test(c[0]) && c[1].indexOf('รวม') < 0) {
      out.items.push({ group: group, name: c[1], key: rrKey_(c[1]), unit: c[10] || '',
        q0: num(c[2]), v0: num(c[3]), q1: num(c[4]), v1: num(c[5]), q2: num(c[6]), v2: num(c[7]), q3: num(c[8]), v3: num(c[9]) });
    }
  });
  return out;
}

function rrKey_(name) {
  return String(name).replace(/^\s*\d+\s*-\s*/, '').toLowerCase().replace(/[\s\.]+/g, '').replace(/[()（）]/g, '');
}
function rrWindow_(y, m) { return { from: new Date(y, m - 3, 21), to: new Date(y, m - 2, 20) }; }
function rrCoverage_(from, to, y, m) {
  const w = rrWindow_(y, m);
  const days = Math.round((to - from) / DAY) + 1;
  const startDiff = from ? Math.round((from - w.from) / DAY) : 999; // + = เริ่มช้า (ขาดต้นงวด) · − = เริ่มเร็ว (เกิน)
  const endDiff = Math.round((to - w.to) / DAY);
  const parts = [];
  if (startDiff > 2) parts.push('ขาดต้นงวด ' + startDiff + ' วัน');
  if (startDiff < -2) parts.push('เริ่มเร็ว ' + (-startDiff) + ' วัน (ทับรอบก่อน)');
  if (endDiff < -2) parts.push('สิ้นสุดก่อน ' + (-endDiff) + ' วัน');
  if (endDiff > 2) parts.push('สิ้นสุดเกิน ' + endDiff + ' วัน');
  return { days: days, startDiff: startDiff, endDiff: Math.abs(endDiff) <= 2 ? 0 : endDiff,
    status: parts.length ? parts.join(' · ') : 'ครบ', score: -(Math.abs(startDiff) + 3 * Math.abs(endDiff)) };
}
function rrThDate_(d, mon, y) {
  const i = RR_MON.indexOf(mon.replace(/\s/g, ''));
  if (i < 0) return null;
  let yy = Number(y); if (yy > 2400) yy -= 543;
  return new Date(yy, i, Number(d));
}
function rrTh_(d) { return d ? d.getDate() + ' ' + RR_MON[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(-2) : ''; }
function rrR_(v, k) { const f = Math.pow(10, k || 2); return Math.round(v * f) / f; }
function rrWrite_(sh, name, rows) {
  sh.setName(name);
  const w = Math.max.apply(null, rows.map(r => r.length));
  sh.getRange(1, 1, rows.length, w).setValues(rows.map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; }));
  sh.setFrozenRows(1); sh.getRange(1, 1, 1, w).setFontWeight('bold').setBackground('#e0f2f1');
}
