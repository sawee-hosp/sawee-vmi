// v6.14: คลังห้องยาแยก lot (บันทึก initial) → สูตรใช้คงเหลือจาก lot − ยอดใช้หลังวันนับ · หน้า Trace · รับ lot เข้าห้องยาเมื่ออนุมัติใบห้องยา
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const ymd=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const NOW=new Date('2026-11-03T10:00:00');
const series={'1000003':{}}; for(let i=1;i<=180;i++){ const d=new Date(NOW); d.setDate(d.getDate()-i); series['1000003'][ymd(d)]=2; }
const base={
  master_drugs:{D003:{drug_id:'D003',drug_name:'Ibuprofen 400 mg tab',unit_id:'U1',pack_size:1,price:10,type:'1',hosxp_code:'1000003'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'เม็ด'}},config:{},master_hospitals:{},
  master_depts:{PHARM:{dept_id:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',cover_days:30,active:true}},
  internal_stock:{'PHARM__D003':{dept_id:'PHARM',drug_id:'D003',balance:500}},req_rounds:{},
  internal_requisitions:{IRX:{deptId:'PHARM',kind:'pharmacy',status:'Completed',period_from:'2026-09-01',period_to:'2026-09-30',items:[{drugId:'D003',dispenseQty:10}]}}};
const seed=(uid,extra)=>fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid},collections:Object.assign({},base,{
  users:{ph1:{name:'ภก',role:'pharmacy',dept_id:'PHARM',email:'p@x'},a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'}}},extra||{})})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  // 1) บันทึก initial → 2) สูตรใช้ lot − ยอดใช้หลังวันนับ → 3) Trace
  {
    seed('ph1');
    const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.clock.install({time:NOW});
    await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); let data={ok:true};
      if(body.action==='invs_lots') data={ok:true,lots:{D003:[{lot_no:'A',expiry:'20270101',qty:400,trade_name:'Ibucap'},{lot_no:'B',expiry:'20280101',qty:600,trade_name:'Brufen'}]}};
      if(body.action==='hosxp_usage') data={ok:true,days:30,count:1,rows:[{icode:'1000003',opd_qty:60,ipd_qty:0}]};
      if(body.action==='hosxp_usage_daily') data={ok:true,icode_count:1,series};
      if(body.action==='trace_query') data={ok:true,count:2,rows:[{rxdate:'2026-10-31',hn:'0001',vn:'v1',an:'',drug_id:'D003',qty:2,lot_no:'A',expiry:'20270101',trade_name:'Ibucap',kind:'D'},{rxdate:'2026-11-01',hn:'0002',vn:'v2',an:'',drug_id:'D003',qty:2,lot_no:'A',expiry:'20270101',trade_name:'Ibucap',kind:'D'}],last_processed:'2026-11-02'};
      await r.fulfill({contentType:'application/json',body:JSON.stringify(data)}); });
    await p.goto('file://'+path.join(DIR,'t_internal.html')); await p.waitForSelector('text=ใบเบิกของฉัน');
    await p.click('button:has-text("คลังห้องยา (lot)")'); await p.waitForSelector('#ph-lots-view');
    check('lots: drug pending', (await p.innerText('#ph-lots-view')).includes('ยังไม่บันทึก'));
    await p.click('#ph-lots-view button:has-text("บันทึก initial")'); await p.waitForSelector('#ph-lot-editor');
    await p.click('#ph-lot-invs'); await p.waitForTimeout(300);
    const qtys=p.locator('#ph-lot-editor input[aria-label=qty]');
    check('lots: prefill from INVS (2 lots + trade name)', (await qtys.count())===2 && (await p.inputValue('#ph-lot-editor input[aria-label=trade] >> nth=0'))==='Ibucap');
    await qtys.nth(0).fill('40'); await qtys.nth(1).fill('60'); await p.fill('#ph-lot-date','2026-10-30');
    await p.click('#ph-lot-save'); await p.waitForTimeout(800);
    const st=await p.evaluate(()=>({lots:[...window.__STORE.pharmacy_lots.values()].map(l=>l.lot_no+':'+l.qty+':'+l.expiry+':'+l.source+':'+l.active),
      meta:[...window.__STORE.pharmacy_lot_meta.values()].map(m=>m.initial_ymd+':'+m.initial_total), bal:window.__STORE.internal_stock.get('PHARM__D003').balance}));
    check('lots: saved initial', JSON.stringify(st.lots.sort())==='["A:40:20270101:INITIAL:true","B:60:20280101:INITIAL:true"]' && st.meta[0]==='2026-10-30:100' && st.bal===100, JSON.stringify(st));
    // สูตร: คงเหลือ = 100 − ยอดใช้ 31 ต.ค.–2 พ.ย. (3 วัน × 2) = 94
    await p.click('button:has-text("สร้างใบเบิก")'); await p.click('button:has-text("สร้างใบเบิกต่อ")'); await p.waitForSelector('text=สร้างใบเบิกห้องยา');
    await p.fill('#usage-to','2026-10-30'); // วันเริ่มล็อกต่อจากใบก่อน (1 ต.ค.)
    await p.click('button:has-text("ดึงยอดใช้จาก HOSxP")'); await p.waitForSelector('text=Ibuprofen 400 mg tab');
    await p.click('#asu-fetch'); await p.waitForTimeout(800);
    const row=(await p.locator('tr',{hasText:'Ibuprofen 400 mg tab'}).first().innerText()).replace(/\s+/g,' ');
    const credit=await p.locator('tr',{hasText:'Ibuprofen 400 mg tab'}).first().locator('input').nth(1).inputValue().catch(()=>'');
    check('formula: on-hand from room lots (100 − 6 = 94)', /lot ห้องยา 2 lot/.test(row) && (credit==='94' || row.includes(' 94 ')), 'credit='+credit+' · '+row.slice(0,220));
    // Trace
    await p.click('button:has-text("ย้อนรอย lot (Trace)")'); await p.waitForSelector('#trace-view');
    await p.fill('#trace-lot','A'); await p.click('#trace-run'); await p.waitForTimeout(400);
    const tr=await p.innerText('#trace-view');
    check('trace: rows + patient count', /พบ 2 แถว · ผู้ป่วย 2 ราย/.test(tr) && tr.includes('Ibucap') && tr.includes('0002'), tr.slice(0,300).replace(/\s+/g,' '));
    check('pharmacy: no errors', !errs.length, errs.join(' | '));
  }
  // 4) แอดมินอนุมัติใบห้องยา → lot รับเข้า (เฉพาะยาที่บันทึก initial)
  {
    seed('a1',{pharmacy_lot_meta:{'PHARM__D003':{dept_id:'PHARM',drug_id:'D003',initial_ymd:'2026-10-30',initialized:true}}});
    const p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.clock.install({time:NOW});
    await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
    const n=await p.evaluate(async()=>addPharmacyReceiptLots({currentUser:{uid:'a1',name:'แอดมิน'}},
      {id:'IR1',deptId:'PHARM',invs_sub_po_no:'PO1',invs_request_lot_snapshot:[{drug_id:'D003',lots_after:[{lot_no:'A',expiry:'20270101',qty_before:400,qty_issue:300,qty_after:100,trade_name:'Ibucap'},{lot_no:'B',expiry:'20280101',qty_before:600,qty_issue:200,qty_after:400,trade_name:'Brufen'},{lot_no:'C',expiry:'20290101',qty_before:50,qty_issue:0,qty_after:50}]}]},
      [{drugId:'D003',dispenseQty:500},{drugId:'D999',dispenseQty:10}]));
    const lots=await p.evaluate(()=>[...(window.__STORE.pharmacy_lots||new Map()).entries()].map(([k,l])=>k+'='+l.lot_no+':'+l.qty+':'+l.source+':'+l.received_ymd));
    check('receipt: lots from INVS snapshot (only initialized drug)', n===2 && JSON.stringify(lots.sort())===JSON.stringify(['PHARM__D003__R__IR1__0=A:300:RECEIPT:2026-11-03','PHARM__D003__R__IR1__1=B:200:RECEIPT:2026-11-03']), n+' '+JSON.stringify(lots));
    check('admin: no errors', !errs.length, errs.join(' | '));
  }
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
