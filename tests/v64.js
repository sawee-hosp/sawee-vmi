// v6.4: pharmacy estimate print (no send), RPST KPI view, NCD outreach adjust, column widths
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path'); const DIR = __dirname;
const res = []; const check = (n, c, x) => res.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : ''));
const seed = (uid, c) => fs.writeFileSync(path.join(DIR, 'seed.js'), 'window.__SEED=' + JSON.stringify({ user: { uid }, collections: c }) + ';');
const watch = (p) => { const e = []; p.on('pageerror', x => e.push(x.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_TUNNEL|fonts/.test(m.text())) e.push(m.text()); }); return e; };
const today = new Date(); if (today.getDate() < 20) today.setDate(20);
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
(async () => {
  const b = await chromium.launch();
  // 1) pharmacy estimate print
  {
    seed('ph1', {
      master_drugs: {
        D001: { drug_id: 'D001', drug_name: 'Paracetamol 500 mg tab', unit_id: 'U1', pack_size: 1000, price: 250, type: '1', hosxp_code: '1000123' },
        D002: { drug_id: 'D002', drug_name: 'Amoxicillin 500 mg cap', unit_id: 'U1', pack_size: 500, price: 400, type: '1', hosxp_code: '1000200' }
      },
      master_unit: { U1: { unit_id: 'U1', unit_name: 'เม็ด' } }, config: {}, master_hospitals: {},
      master_depts: { PHARM: { dept_id: 'PHARM', dept_name: 'ห้องยา OPD', kind: 'pharmacy', cover_days: 30, active: true } },
      users: { ph1: { name: 'ภก', role: 'pharmacy', dept_id: 'PHARM', email: 'p@x' } },
      internal_stock: { PHARM__D002: { dept_id: 'PHARM', drug_id: 'D002', balance: 1000 } }, internal_requisitions: {}, req_rounds: {}
    });
    const p = await b.newPage({ viewport: { width: 1500, height: 900 } }); const errs = watch(p);
    await p.route('http://127.0.0.1/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, days: 30, count: 2, rows: [{ icode: '1000123', opd_qty: 3000, ipd_qty: 0 }, { icode: '1000200', opd_qty: 500, ipd_qty: 0 }] }) }));
    await p.goto('file://' + path.join(DIR, 't_internal.html')); await p.waitForSelector('text=ใบเบิกของฉัน');
    await p.click('button:has-text("สร้างใบเบิก")'); await p.click('button:has-text("สร้างใบเบิกต่อ")'); await p.waitForSelector('text=สร้างใบเบิกห้องยา');
    await p.fill('#usage-from', '2026-09-01'); await p.fill('#usage-to', '2026-09-30');
    await p.click('button:has-text("ดึงยอดใช้จาก HOSxP")'); await p.waitForSelector('text=Paracetamol 500 mg tab');
    await p.click('#ph-estimate'); await p.waitForSelector('#ph-est-print');
    await p.evaluate(() => { window.XLSX = { utils: { aoa_to_sheet: a => ({ a }), book_new: () => ({ s: [] }), book_append_sheet: (wb, ws) => wb.s.push(ws.a) }, writeFile: (wb, fn) => { window.__x = { fn, a: wb.s[0] }; } }; });
    await p.click('#ph-est-xlsx'); await p.waitForTimeout(100);
    let x = await p.evaluate(() => window.__x);
    const row = (a, name) => a.find(r => r[1] === name);
    const para = row(x.a, 'Paracetamol 500 mg tab'), amox = row(x.a, 'Amoxicillin 500 mg cap');
    // para: usage 3000/30d → target 3000 (cover 30) → rounded 3000 ; credit 0 ; amox target 500 → round 500; credit 1000-500=500
    check('estimate: headers like RPST', JSON.stringify(x.a[3]) === JSON.stringify(['ที่', 'ชื่อยา/เวชภัณฑ์', 'หน่วย', 'บรรจุ', 'ยอดใช้', 'ยอดเหลือ', 'Target Stock', 'จำนวนจ่าย', 'ราคา/หน่วย', 'มูลค่า (บาท)', 'คงเหลือ', 'รหัส']), JSON.stringify(x.a[3]));
    check('estimate: values filled (usage, คงเหลือ, target, จ่าย)', para && para[4] === 3000 && para[5] === 0 && para[6] === 3000 && para[7] === 3000 && para[9] === 750 && para[11] === 'D001' && amox[5] === 500, JSON.stringify([para, amox]));
    await p.click('#ph-est-fill'); await p.click('#ph-est-xlsx'); await p.waitForTimeout(300);
    x = await p.evaluate(() => window.__x);
    const pb = row(x.a, 'Paracetamol 500 mg tab');
    check('estimate: blank option leaves จ่าย/มูลค่า empty', pb[7] === '' && pb[9] === '' && pb[10] === '', JSON.stringify(pb));
    const drafts = await p.evaluate(() => [...window.__STORE.internal_requisitions.values()]);
    check('draft: saved once as Draft, no stock change', drafts.length === 1 && drafts[0].status === 'Draft' && !drafts[0].submitted_at, JSON.stringify(drafts.map(d => d.status)));
    const stockAfter = await p.evaluate(() => window.__STORE.internal_stock.get('PHARM__D002').balance);
    check('draft: stock untouched', stockAfter === 1000, String(stockAfter));
    await p.fill('#ph-note', ''); // no-op
    // rounding toggle: amox target 500 already pack-aligned; change cover to 31 days to get non-aligned target
    await p.click('#ph-est-round'); await p.click('#ph-est-xlsx'); await p.waitForTimeout(100);
    x = await p.evaluate(() => window.__x);
    check('estimate: round toggle off keeps raw target', row(x.a, 'Paracetamol 500 mg tab')[6] === 3000);
    const html = await p.evaluate(() => buildInternalReqFormHtml({ req: { kind: 'pharmacy', dept_name: 'ห้องยา OPD', items: [{ drugId: 'D1', name: 'A', unit: 'เม็ด', packSize: 1000, price: 250, type: '1', targetQty: 2000, usage: 1500, onHand: 10, dispenseQty: 2000 }] }, formNo: '1/2570', formDate: '2026-10-14', blankQty: false, includeUsed: true }));
    check('print: real form header + new columns', html.includes('<h1>ใบเบิกวัสดุ/เวชภัณฑ์</h1>') && !html.includes('ประมาณการ') && /ยอดใช้<\/th><th[^>]*>ยอด<br>เหลือ<\/th><th class="tgt"[^>]*>Target<br>Stock/.test(html) && html.includes('class="c blue"') && html.includes('class="c tgt"') && /คง<br>เหลือ<\/th>/.test(html) && ['ผู้เบิก', 'ผู้สั่งจ่าย', 'ผู้รับของ', 'ผู้จ่าย'].every(x => html.includes(x)) && html.includes('500.00') && (html.match(/class="blankrow"/g)||[]).length === 5 && html.includes('counter(pages)') && !html.includes('class="stamp"'));
    await p.click('#ph-est-print'); await p.waitForTimeout(1200);
    const st = await p.evaluate(() => [...window.__STORE.internal_requisitions.values()].map(r => r.status));
    check('print: still only Draft (not sent)', st.length === 1 && st[0] === 'Draft', st.join(','));
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    if (await p.isVisible('.fixed button:has-text("ปิด")')) await p.click('[aria-label="ปิด"]');
    await p.click('main button:has-text("ส่งใบเบิก")'); await p.click('.fixed button:has-text("ส่งใบเบิก")'); await p.waitForTimeout(800);
    const fin = await p.evaluate(() => ({ r: [...window.__STORE.internal_requisitions.values()].map(r => [r.status, !!r.submitted_at]), bal: window.__STORE.internal_stock.get('PHARM__D002').balance }));
    check('draft → send: same doc becomes Pending + stock updated', fin.r.length === 1 && fin.r[0][0] === 'Pending' && fin.r[0][1] && fin.bal === 500, JSON.stringify(fin));
    check('pharmacy: no errors', !errs.length, errs.join(' | ')); await p.close();
  }
  // 2) RPST KPI + NCD outreach
  const reqItems = [
    { drugId: 'D010', name: 'Metformin', type: '25', packSize: 1000, price: 300, usage: 2000, prevExcess: 0, systemSuggestedQty: 2000, finalRequestedQty: 3000, dispenseQty: 3000 },
    { drugId: 'D011', name: 'Amlodipine', type: '25', packSize: 500, price: 100, usage: 500, prevExcess: 0, systemSuggestedQty: 1000, finalRequestedQty: 500, dispenseQty: 500 },
    { drugId: 'D012', name: 'Para', type: '1', packSize: 1000, price: 250, usage: 0, prevExcess: 100, systemSuggestedQty: 0, finalRequestedQty: 0, dispenseQty: 0 }
  ];
  const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); };
  const cols = () => ({
    master_drugs: {
      D010: { drug_id: 'D010', drug_name: 'Metformin 500 mg tab', unit_id: 'U1', pack_size: 1000, price: 300, type: '25', hosxp_code: '1520011' },
      D011: { drug_id: 'D011', drug_name: 'Amlodipine 5 mg tab', unit_id: 'U1', pack_size: 500, price: 100, type: '25' }
    },
    master_unit: { U1: { unit_id: 'U1', unit_name: 'เม็ด' } }, master_depts: {}, config: {},
    master_hospitals: { H1: { hospital_id: 'H1', hospital_name: 'รพ.สต.ทุ่งระยะ', hcode: '09415' } },
    users: { h1: { name: 'จนท', role: 'hospital', hospital_id: 'H1', email: 'h@x' }, adm: { name: 'แอดมิน', role: 'admin', email: 'a@x' } },
    config_par: { H1_D010: { hospital_id: 'H1', drug_id: 'D010', par_qty: 1000 } },
    current_excess: { H1_D010: { hospital_id: 'H1', drug_id: 'D010', excess_balance: 500 } },
    historical_usages: { H1_D010: { hospital_id: 'H1', drug_id: 'D010', history: {} } },
    requisitions: { 'REQ-H1-1': { hospitalId: 'H1', month: 9, year: 2026, status: 'Completed', fiscal_year: 2569, items: reqItems } },
    ncds_demand_inbox: { '09415_A': { hcode: '09415', hospital_id: 'H1', round_date: plus(5), days_supply: 56, patients_total: 20, consumed_by_refill: false,
      items: [{ key: '1520011', icode: '1520011', name: 'Metformin', form: 'TAB', patients: 18, doses_total_per_day: 31.5, qty_needed: 1941 }] } }
  });
  {
    seed('adm', cols()); const p = await b.newPage({ viewport: { width: 1500, height: 900 } }); const errs = watch(p);
    await p.goto('file://' + path.join(DIR, 't_app.html')); await p.waitForSelector('text=ตัวชี้วัด รพ.สต.');
    await p.click('button:has-text("ตัวชี้วัด รพ.สต.")'); await p.waitForSelector('#kpi-table');
    await p.selectOption('#kpi-fy', '2569'); await p.waitForTimeout(100);
    await p.click('#kpi-table tbody tr:has-text("รพ.สต.ทุ่งระยะ")'); await p.waitForTimeout(100);
    const t = (await p.textContent('#kpi-table')).replace(/\s+/g, ' ');
    // used 2 items (600+100=700), req 2 (900+100=1000), more 1 (300), less 1 (100), credit0 2/2
    check('kpi: aggregates', t.includes('700.00') && t.includes('1,000.00') && t.includes('300.00') && t.includes('2/2') && t.includes('เครดิต 0 ทั้งใบ') && t.includes('กันยายน 2569'), t.slice(0, 400));
    check('admin: no errors', !errs.length, errs.join(' | ')); await p.close();
  }
  {
    seed('h1', cols()); const p = await b.newPage({ viewport: { width: 1500, height: 900 } }); const errs = watch(p);
    if (new Date().getDate() < 20) await p.clock.setFixedTime(today);
    await p.goto('file://' + path.join(DIR, 't_app.html')); await p.waitForSelector('text=เบิกยา / เติมยา');
    await p.click('button:has-text("เบิกยา / เติมยา")'); await p.waitForTimeout(1200);
    const has = await p.isVisible('#ncds-outreach-apply');
    check('ncds: outreach button in NCD category', has, has ? await p.textContent('#ncds-outreach-apply') : 'not visible');
    if (has) {
      await p.click('#ncds-outreach-apply'); await p.waitForTimeout(200);
      if (!(await p.isVisible('#req-row-D010'))) { await p.click('button:has-text("แสดงยาที่ไม่เคลื่อนไหว")'); await p.waitForTimeout(200); }
      const row = (await p.textContent('#req-row-D010')).replace(/\s+/g, ' ');
      check('ncds: usage shows +ออกหน่วย & ขอเพิ่ม', row.includes('+ออกหน่วย') && row.includes('ขอเพิ่ม'), row);
      check('ncds: cancel button shown', await p.isVisible('button:has-text("ยกเลิกการปรับ")'));
    }
    const ths = await p.$$eval('table.official-table thead th', els => els.map(e => e.textContent.trim() + ':' + e.style.width));
    check('rpst: order ยอดใช้→คงเหลือ→Target, price normal', ths.join(' ').includes('ยอดใช้:7% ยอดเหลือ:7% Target Stock:7% จำนวนจ่าย:7% ราคา/หน่วย:7%'), ths.join(' '));
    check('hospital: no errors', !errs.length, errs.join(' | ')); await p.close();
  }
  await b.close(); console.log(res.join('\n'));
})().catch(e => { console.error('HARNESS', e); process.exit(1); });
