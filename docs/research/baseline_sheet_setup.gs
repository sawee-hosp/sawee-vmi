/**
 * Baseline "Before INVS" — ตั้งค่าแท็บเก็บข้อมูลการเบิกยา รพ.สต. รายเดือน รายหมวด
 *
 * วิธีใช้ (ทำครั้งเดียว)
 *  1) เปิดชีต "Before INVS" → เมนู ส่วนขยาย (Extensions) → Apps Script
 *  2) ลบโค้ดเดิม วางไฟล์นี้ทั้งหมด → บันทึก (Ctrl+S)
 *  3) เลือกฟังก์ชัน setupBaseline → กด เรียกใช้ (Run) → อนุญาตสิทธิ์ (ใช้กับชีตนี้เท่านั้น)
 *  4) ถ้าแก้รายชื่อ รพ.สต. ในแท็บ Hospitals หรือขยายช่วงเดือน ให้รัน addMissingRows
 *
 * สคริปต์ไม่แตะแท็บ "Before INVS" เดิม ไม่ลบ/ทับข้อมูลที่มีอยู่ (ถ้ามีแท็บชื่อซ้ำจะหยุดและแจ้ง)
 * ไม่มีข้อมูลผู้ป่วย ไม่ส่งข้อมูลออกนอกชีต
 */

// ====== ตั้งค่า ======
const CFG = {
  START_Y: 2568, START_M: 10,   // เดือนแรก (พ.ศ./เดือน) — "เดือนรอบเบิก" ตามระบบใหม่
  END_Y: 2569, END_M: 7,        // เดือนสุดท้าย
  SRC_SHEET: 'Before INVS',     // ชีตเดิมที่มีรายชื่อ รพ.สต. ในคอลัมน์ B
  SRC_FIRST_ROW: 4,             // แถวแรกที่มีชื่อ รพ.สต.
  MAX_HOSP: 30,                 // จำนวนแถว รพ.สต. สูงสุดในแท็บ Hospitals / Coverage / Summary
  MAX_ROWS: 1000                // แถวสูงสุดของแท็บ Data
};
const TAB = { data: 'Data', hosp: 'Hospitals', cov: 'Coverage', sum: 'Summary', readme: 'README' };
const CATS = ['ยาทั่วไป', 'สมุนไพร', 'NCDs', 'เวชภัณฑ์ที่มิใช่ยา'];   // วัคซีน (หมวด 6) ไม่นับ — ตรงกับระบบใหม่
const BASIS = ['ราคาใบเบิกเดิม', 'ราคา INVS', 'ไม่ทราบ'];

// คอลัมน์แท็บ Data (เลขคอลัมน์ 1 = A)
const C = { Y: 1, M: 2, KEY: 3, CODE: 4, NAME: 5, CAT0: 6 /* F..M */, TI: 14, TV: 15, RI: 16, RV: 17, NET: 18, CHK: 19, BASIS: 20, SRC: 21, NOTE: 22 };
const colL = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Baseline')
    .addItem('1) สร้างแท็บเก็บข้อมูล (ครั้งแรก)', 'setupBaseline')
    .addItem('2) เพิ่มแถวที่ยังขาด (เดือน × รพ.สต.)', 'addMissingRows')
    .addToUi();
}

function months_() {
  const out = []; let y = CFG.START_Y, m = CFG.START_M;
  while (y * 100 + m <= CFG.END_Y * 100 + CFG.END_M) { out.push([y, m]); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
const monthKey_ = (y, m) => y + '-' + ('0' + m).slice(-2);

function readHospitalsFromSource_(ss) {
  const sh = ss.getSheetByName(CFG.SRC_SHEET);
  if (!sh || sh.getLastRow() < CFG.SRC_FIRST_ROW) return [];
  return sh.getRange(CFG.SRC_FIRST_ROW, 2, sh.getLastRow() - CFG.SRC_FIRST_ROW + 1, 1).getValues()
    .map(r => String(r[0]).trim()).filter(Boolean).slice(0, CFG.MAX_HOSP);
}

function dataRowFormulas_(r) {
  const L = colL, hr = '$B$2:$C$' + (CFG.MAX_HOSP + 1);
  return {
    key: '=IF(OR(A' + r + '="",B' + r + '=""),"",A' + r + '&"-"&TEXT(B' + r + ',"00"))',
    code: '=IFERROR(VLOOKUP(E' + r + ',' + TAB.hosp + '!' + hr + ',2,FALSE),"")',
    net: '=IF(O' + r + '="","",O' + r + '-SUM(Q' + r + '))',
    chk: '=IF(AND(N' + r + '="",O' + r + '=""),"",IF(AND(ABS(SUM(F' + r + ',H' + r + ',J' + r + ',L' + r + ')-SUM(N' + r + '))<0.5,ABS(SUM(G' + r + ',I' + r + ',K' + r + ',M' + r + ')-SUM(O' + r + '))<0.01),"OK","ไม่ตรง"))'
  };
}

function writeDataRows_(sh, startRow, combos) {   // combos: [[y, m, name], ...]
  if (!combos.length) return;
  const n = combos.length;
  sh.getRange(startRow, C.Y, n, 2).setValues(combos.map(x => [x[0], x[1]]));
  sh.getRange(startRow, C.NAME, n, 1).setValues(combos.map(x => [x[2]]));
  const f = combos.map((_, i) => dataRowFormulas_(startRow + i));
  sh.getRange(startRow, C.KEY, n, 1).setFormulas(f.map(x => [x.key]));
  sh.getRange(startRow, C.CODE, n, 1).setFormulas(f.map(x => [x.code]));
  sh.getRange(startRow, C.NET, n, 1).setFormulas(f.map(x => [x.net]));
  sh.getRange(startRow, C.CHK, n, 1).setFormulas(f.map(x => [x.chk]));
}

function setupBaseline() {
  const ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi();
  const clash = Object.values(TAB).filter(n => ss.getSheetByName(n));
  if (clash.length) { ui.alert('มีแท็บชื่อนี้อยู่แล้ว: ' + clash.join(', ') + '\nสคริปต์หยุดเพื่อไม่ให้ทับข้อมูล — เปลี่ยนชื่อ/ลบแท็บเหล่านั้นก่อน หรือใช้เมนู "เพิ่มแถวที่ยังขาด"'); return; }
  const hospitals = readHospitalsFromSource_(ss), months = months_();

  // ---------- Hospitals ----------
  const hs = ss.insertSheet(TAB.hosp);
  hs.getRange(1, 1, 1, 3).setValues([['ลำดับ', 'ชื่อ รพ.สต.', 'รหัส hospital_id (ให้ตรงระบบ)']]).setFontWeight('bold').setBackground('#e2e8f0');
  if (hospitals.length) hs.getRange(2, 1, hospitals.length, 2).setValues(hospitals.map((h, i) => [i + 1, h]));
  hs.setFrozenRows(1); hs.setColumnWidths(1, 1, 60); hs.setColumnWidths(2, 2, 220);
  hs.getRange(CFG.MAX_HOSP + 3, 1).setValue('รายชื่อดึงจาก ' + CFG.SRC_SHEET + '!B' + CFG.SRC_FIRST_ROW + ' ลงไป — เพิ่ม/แก้ชื่อได้ (สูงสุด ' + CFG.MAX_HOSP + ' แห่ง) แล้วรัน "เพิ่มแถวที่ยังขาด"').setFontColor('#64748b');

  // ---------- Data ----------
  const ds = ss.insertSheet(TAB.data, 0);
  const head = ['ปี พ.ศ. (รอบเบิก)', 'เดือน (รอบเบิก)', 'รหัสเดือน', 'รหัส รพ.สต.', 'ชื่อ รพ.สต.'];
  CATS.forEach(c => head.push(c + ' รายการ', c + ' มูลค่า'));
  head.push('รวม รายการ', 'รวม มูลค่า', 'คืน รายการ', 'คืน มูลค่า', 'มูลค่าสุทธิ (รวม−คืน)', 'ตรวจ (หมวดรวม = รวม)', 'ฐานมูลค่า', 'แหล่งข้อมูล', 'หมายเหตุ');
  ds.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e2e8f0').setWrap(true).setVerticalAlignment('middle');
  ds.setRowHeight(1, 48); ds.setFrozenRows(1); ds.setFrozenColumns(5);
  const combos = []; months.forEach(([y, m]) => (hospitals.length ? hospitals : ['']).forEach(h => combos.push([y, m, h])));
  writeDataRows_(ds, 2, combos);
  ds.getRange(2, C.CAT0, CFG.MAX_ROWS - 1, 12).setNumberFormat('#,##0.##');
  [C.CAT0 + 1, C.CAT0 + 3, C.CAT0 + 5, C.CAT0 + 7, C.TV, C.RV, C.NET].forEach(c => ds.getRange(2, c, CFG.MAX_ROWS - 1, 1).setNumberFormat('#,##0.00'));
  [C.CAT0, C.CAT0 + 2, C.CAT0 + 4, C.CAT0 + 6, C.TI, C.RI].forEach(c => ds.getRange(2, c, CFG.MAX_ROWS - 1, 1).setNumberFormat('#,##0'));
  [C.KEY, C.CODE, C.NET, C.CHK].forEach(c => ds.getRange(2, c, CFG.MAX_ROWS - 1, 1).setBackground('#f1f5f9'));
  ds.setColumnWidths(1, 2, 90); ds.setColumnWidths(3, 2, 90); ds.setColumnWidth(5, 150); ds.setColumnWidths(6, 17, 95); ds.setColumnWidth(C.SRC, 130); ds.setColumnWidth(C.NOTE, 260);

  // validation
  const rule = () => SpreadsheetApp.newDataValidation();
  ds.getRange(2, C.Y, CFG.MAX_ROWS - 1, 1).setDataValidation(rule().requireNumberBetween(2560, 2580).setAllowInvalid(false).setHelpText('ปี พ.ศ. เช่น 2568').build());
  ds.getRange(2, C.M, CFG.MAX_ROWS - 1, 1).setDataValidation(rule().requireNumberBetween(1, 12).setAllowInvalid(false).setHelpText('เดือน 1–12 (เดือนรอบเบิก)').build());
  ds.getRange(2, C.NAME, CFG.MAX_ROWS - 1, 1).setDataValidation(rule().requireValueInRange(hs.getRange('B2:B' + (CFG.MAX_HOSP + 1)), true).setAllowInvalid(false).build());
  ds.getRange(2, C.CAT0, CFG.MAX_ROWS - 1, 12).setDataValidation(rule().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).setHelpText('ตัวเลข ≥ 0 (เว้นว่างถ้ายังไม่ได้คีย์)').build());
  ds.getRange(2, C.BASIS, CFG.MAX_ROWS - 1, 1).setDataValidation(rule().requireValueInList(BASIS, true).setAllowInvalid(true).build());

  // conditional formatting: ซ้ำ (แดงเข้ม) > ไม่ตรง (แดง) > คีย์แล้ว (เขียว)
  const R = (a1) => ds.getRange(a1);
  const rules = [
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A2<>"",COUNTIFS($A$2:$A$' + CFG.MAX_ROWS + ',$A2,$B$2:$B$' + CFG.MAX_ROWS + ',$B2,$E$2:$E$' + CFG.MAX_ROWS + ',$E2)>1)').setBackground('#fca5a5').setRanges([R('A2:E' + CFG.MAX_ROWS)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('ไม่ตรง').setBackground('#fecaca').setFontColor('#991b1b').setRanges([R(colL(C.CHK) + '2:' + colL(C.CHK) + CFG.MAX_ROWS)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('OK').setBackground('#bbf7d0').setRanges([R(colL(C.CHK) + '2:' + colL(C.CHK) + CFG.MAX_ROWS)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$O2<>""').setBackground('#dcfce7').setRanges([R('A2:E' + CFG.MAX_ROWS)]).build()
  ];
  ds.setConditionalFormatRules(rules);

  // ---------- Coverage ----------
  const cv = ss.insertSheet(TAB.cov);
  cv.getRange(1, 1).setValue('รพ.สต. \\ เดือน (✔ = คีย์ "รวม มูลค่า" แล้ว)').setFontWeight('bold');
  cv.getRange(1, 2, 1, months.length).setValues([months.map(([y, m]) => monthKey_(y, m))]).setFontWeight('bold').setBackground('#e2e8f0').setHorizontalAlignment('center');
  const cvA = [], cvB = [];
  for (let i = 0; i < CFG.MAX_HOSP; i++) {
    const r = i + 2; cvA.push(['=IF(' + TAB.hosp + '!B' + r + '="","",' + TAB.hosp + '!B' + r + ')']);
    cvB.push(months.map((_, j) => '=IF($A' + r + '="","",IF(COUNTIFS(Data!$E$2:$E$' + CFG.MAX_ROWS + ',$A' + r + ',Data!$C$2:$C$' + CFG.MAX_ROWS + ',' + colL(j + 2) + '$1,Data!$O$2:$O$' + CFG.MAX_ROWS + ',"<>")>0,"✔",""))'));
  }
  cv.getRange(2, 1, CFG.MAX_HOSP, 1).setFormulas(cvA);
  cv.getRange(2, 2, CFG.MAX_HOSP, months.length).setFormulas(cvB).setHorizontalAlignment('center');
  const tr = CFG.MAX_HOSP + 2;
  cv.getRange(tr, 1).setValue('จำนวนที่คีย์แล้ว').setFontWeight('bold');
  cv.getRange(tr, 2, 1, months.length).setFormulas([months.map((_, j) => '=COUNTIF(' + colL(j + 2) + '2:' + colL(j + 2) + (CFG.MAX_HOSP + 1) + ',"✔")')]).setFontWeight('bold').setHorizontalAlignment('center');
  cv.setColumnWidth(1, 220); cv.setFrozenRows(1); cv.setFrozenColumns(1);
  const cvRange = cv.getRange(2, 2, CFG.MAX_HOSP, months.length);
  cv.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('✔').setBackground('#bbf7d0').setRanges([cvRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($A2<>"",B2="")').setBackground('#fef08a').setRanges([cvRange]).build()
  ]);

  // ---------- Summary ----------
  const sm = ss.insertSheet(TAB.sum);
  const sh1 = ['รหัสเดือน', 'จำนวน รพ.สต. ที่คีย์'];
  CATS.forEach(c => sh1.push(c + ' รายการ', c + ' มูลค่า'));
  sh1.push('รวม รายการ', 'รวม มูลค่า', 'คืน รายการ', 'คืน มูลค่า', 'มูลค่าสุทธิ');
  const srcCols = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];   // คอลัมน์ Data ที่รวมยอด
  const sumRow = (r, critCol, critVal, countCrit) => {
    const f = [countCrit];
    srcCols.forEach(c => f.push('=SUMIFS(Data!$' + colL(c) + '$2:$' + colL(c) + '$' + CFG.MAX_ROWS + ',Data!$' + critCol + '$2:$' + critCol + '$' + CFG.MAX_ROWS + ',' + critVal + ')'));
    return f;
  };
  sm.getRange(1, 1).setValue('สรุปตามเดือน (ทุก รพ.สต.)').setFontWeight('bold');
  sm.getRange(2, 1, 1, sh1.length).setValues([sh1]).setFontWeight('bold').setBackground('#e2e8f0').setWrap(true);
  const byMonth = months.map(([y, m], i) => { const r = i + 3; return [monthKey_(y, m)].concat(sumRow(r, 'C', '$A' + r, '=COUNTIFS(Data!$C$2:$C$' + CFG.MAX_ROWS + ',$A' + r + ',Data!$O$2:$O$' + CFG.MAX_ROWS + ',"<>")')); });
  sm.getRange(3, 1, byMonth.length, sh1.length).setFormulas(byMonth);
  const totR = months.length + 3;
  sm.getRange(totR, 1).setValue('รวมทั้งช่วง').setFontWeight('bold');
  sm.getRange(totR, 2, 1, sh1.length - 1).setFormulas([Array.from({ length: sh1.length - 1 }, (_, i) => '=SUM(' + colL(i + 2) + '3:' + colL(i + 2) + (totR - 1) + ')')]).setFontWeight('bold');
  const h2 = totR + 3;
  sm.getRange(h2 - 1, 1).setValue('สรุปตาม รพ.สต. (ทุกเดือน)').setFontWeight('bold');
  const sh2 = sh1.slice(); sh2[0] = 'รพ.สต.'; sh2[1] = 'จำนวนเดือนที่คีย์';
  sm.getRange(h2, 1, 1, sh2.length).setValues([sh2]).setFontWeight('bold').setBackground('#e2e8f0').setWrap(true);
  const byHosp = [];
  for (let i = 0; i < CFG.MAX_HOSP; i++) {
    const r = h2 + 1 + i, hr = i + 2;
    const row = sumRow(r, 'E', '$A' + r, '=IF($A' + r + '="","",COUNTIFS(Data!$E$2:$E$' + CFG.MAX_ROWS + ',$A' + r + ',Data!$O$2:$O$' + CFG.MAX_ROWS + ',"<>"))');
    byHosp.push(['=IF(' + TAB.hosp + '!B' + hr + '="","",' + TAB.hosp + '!B' + hr + ')'].concat(row));
  }
  sm.getRange(h2 + 1, 1, CFG.MAX_HOSP, sh2.length).setFormulas(byHosp);
  [4, 6, 8, 10, 12, 14, 15].forEach(c => { sm.getRange(3, c, totR - 2, 1).setNumberFormat('#,##0.00'); sm.getRange(h2 + 1, c, CFG.MAX_HOSP, 1).setNumberFormat('#,##0.00'); });
  [3, 5, 7, 9, 11, 13].forEach(c => { sm.getRange(3, c, totR - 2, 1).setNumberFormat('#,##0'); sm.getRange(h2 + 1, c, CFG.MAX_HOSP, 1).setNumberFormat('#,##0'); });
  sm.setColumnWidth(1, 160); sm.setColumnWidths(2, 14, 105); sm.setFrozenColumns(1);

  // ---------- README ----------
  const rd = ss.insertSheet(TAB.readme);
  const lines = [
    ['Baseline การเบิกยา รพ.สต. ก่อนใช้ระบบใหม่ — คำอธิบาย'],
    [''],
    ['แท็บ Data: 1 แถว = 1 เดือน × 1 รพ.สต. กรอกเฉพาะช่องที่ไม่เทา (ช่องเทาเป็นสูตร)'],
    ['เดือน = "เดือนรอบเบิก" ตามระบบใหม่ (ทำใบเบิกวันที่ 20–31 ของเดือน M = รอบเดือน M+1) ให้ใช้เกณฑ์เดียวกันทุกแถว'],
    ['หมวด: ยาทั่วไป / สมุนไพร / NCDs / เวชภัณฑ์ที่มิใช่ยา — ไม่รวมวัคซีน (หมวด 6) เหมือนระบบใหม่'],
    ['รายการ = จำนวนรายการยา (แถวยา) ที่เบิกในเดือนนั้น ไม่ใช่จำนวนชิ้น'],
    ['มูลค่า = บาท · คีย์ "รวม" ตามรายงานต้นฉบับ แล้วดูคอลัมน์ "ตรวจ" ต้องเป็น OK (ถ้า "ไม่ตรง" = หมวดรวมไม่เท่ากับรวม)'],
    ['คืน = ใบคืนยา (รายการ/มูลค่า) ของเดือนนั้น · มูลค่าสุทธิ = รวม − คืน'],
    ['ฐานมูลค่า: เลือกว่ามูลค่าคิดจากราคาใบเบิกเดิม หรือราคา INVS (ถ้าต่างกันจดในหมายเหตุ เพื่อไม่ให้ต้นทุนที่ต่างกันปนเป็นผลของโปรแกรม)'],
    ['เว้นว่าง = ยังไม่ได้คีย์ · ใส่ 0 = เบิกจริงเป็นศูนย์ (สองอย่างนี้ต่างกัน Coverage นับเฉพาะแถวที่คีย์ "รวม มูลค่า")'],
    ['แถวสีแดงเข้มที่คอลัมน์ A–E = เดือนและ รพ.สต. ซ้ำกัน'],
    [''],
    ['Hospitals: ใส่รหัส hospital_id ให้ตรงระบบ (ใช้จับคู่กับข้อมูลในระบบใหม่ตอนวิเคราะห์)'],
    ['Coverage: ตาราง รพ.สต. × เดือน ✔ = คีย์แล้ว สีเหลือง = ยังขาด'],
    ['Summary: ยอดรวมตามเดือนและตาม รพ.สต. (สูตรอัตโนมัติ)'],
    [''],
    ['ขยายช่วงเดือน: แก้ CFG.END_Y/END_M ในสคริปต์ แล้วรันเมนู Baseline → เพิ่มแถวที่ยังขาด (แท็บ Coverage/Summary ต้องเพิ่มคอลัมน์เดือนเองหรือสร้างแท็บใหม่)']
  ];
  rd.getRange(1, 1, lines.length, 1).setValues(lines); rd.setColumnWidth(1, 900); rd.getRange(1, 1, lines.length, 1).setWrap(true); rd.getRange(1, 1).setFontWeight('bold').setFontSize(14);

  ds.activate();
  ui.alert('สร้างแท็บแล้ว: Data, Hospitals, Coverage, Summary, README\n' +
    (hospitals.length ? 'พบ รพ.สต. ' + hospitals.length + ' แห่ง → สร้างแถวล่วงหน้า ' + combos.length + ' แถว' : 'ไม่พบรายชื่อใน ' + CFG.SRC_SHEET + '!B' + CFG.SRC_FIRST_ROW + ' ลงไป — กรอกชื่อในแท็บ Hospitals แล้วรัน "เพิ่มแถวที่ยังขาด"') +
    '\nอย่าลืมใส่รหัส hospital_id ในแท็บ Hospitals');
}

// เพิ่มแถวเดือน × รพ.สต. ที่ยังไม่มีใน Data (ต่อท้าย ไม่แก้/ลบ/เรียงของเดิม)
function addMissingRows() {
  const ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi();
  const ds = ss.getSheetByName(TAB.data), hs = ss.getSheetByName(TAB.hosp);
  if (!ds || !hs) { ui.alert('ยังไม่มีแท็บ Data/Hospitals — รัน setupBaseline ก่อน'); return; }
  const hospitals = hs.getRange(2, 2, CFG.MAX_HOSP, 1).getValues().map(r => String(r[0]).trim()).filter(Boolean);
  const last = ds.getLastRow();
  const have = new Set(last >= 2 ? ds.getRange(2, 1, last - 1, 5).getValues().map(r => r[0] + '|' + r[1] + '|' + r[4]) : []);
  const add = [];
  months_().forEach(([y, m]) => hospitals.forEach(h => { if (!have.has(y + '|' + m + '|' + h)) add.push([y, m, h]); }));
  if (!add.length) { ui.alert('ไม่มีแถวที่ขาด'); return; }
  if (last + add.length > CFG.MAX_ROWS) { ui.alert('เกิน ' + CFG.MAX_ROWS + ' แถว — เพิ่ม CFG.MAX_ROWS ก่อน'); return; }
  writeDataRows_(ds, last + 1, add);
  ui.alert('เพิ่ม ' + add.length + ' แถว (ต่อท้ายแท็บ Data)');
}
