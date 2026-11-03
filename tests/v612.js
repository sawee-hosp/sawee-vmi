// v6.12: ใบ ฉ ค้นหายาเมื่อ par_qty ว่าง · เดือนของใบตามรอบ · แอดมินเพิ่มยา (หน่วยเต็ม/ย่อย + ไม่ทับยอดที่แก้ค้าง) · เตือนติดตั้งไอคอน (PWA)
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const drugs={D1:{drug_id:'D1',drug_name:'Paracetamol 500mg TAB',unit_id:'U1',type:'1',price:260,pack_size:1000,status:'Active'},
  D2:{drug_id:'D2',drug_name:'Amoxicillin 500mg CAP',unit_id:'U1',type:'1',price:120,pack_size:100,status:'Active',old_code:'013'},
  D3:{drug_id:'D3',drug_name:'Autoclave tape no.3/4',unit_id:'U2',type:'2',price:235.4,pack_size:10,unpacked:false,status:'Active'},
  D4:{drug_id:'D4',drug_name:'Gauze 3x3',unit_id:'U2',type:'2',price:50,pack_size:10,unpacked:false,status:'Active'},
  D5:{drug_id:'D5',drug_name:'Cetirizine 10mg TAB',unit_id:'U1',type:'1',price:15.8,pack_size:100,unpacked:true,status:'Active'}};
const item=(id,q,t)=>({drugId:id,name:drugs[id].drug_name,unit:'TAB',type:'1',packSize:drugs[id].pack_size,price:drugs[id].price,usage:q,importedUsageQty:q,dispenseQty:q,finalRequestedQty:q,targetVMI:t,prevExcess:0});
const seed=(uid,extra)=>fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid},collections:Object.assign({
  master_drugs:drugs,master_unit:{U1:{unit_id:'U1',unit_name:'TAB'},U2:{unit_id:'U2',unit_name:'piece'}},master_depts:{},config:{},
  master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ'}},
  config_par:{p1:{hospital_id:'H1',drug_id:'D1',par_qty:0},p2:{hospital_id:'H1',drug_id:'D2',par_qty:0},p3:{hospital_id:'H1',drug_id:'D3',par_qty:0}},
  requisitions:{'REQ-2026-10-H1':{hospitalId:'H1',status:'Pending',month:10,year:2026,created_by_name:'จนท',created_by_uid:'h1',items:[item('D1',2000,3000),item('D2',300,500)],created_at:'2026-10-21T03:00:00Z',submitted_at:'2026-10-21T03:00:00Z'}},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'},h1:{name:'จนท',role:'hospital',hospital_id:'H1',email:'h@x',line_user_id:'x'}}},extra||{})})+';');
const open=async(b,uid,time,extra)=>{ seed(uid,extra); const ctx=await b.newContext({viewport:{width:1400,height:900}}); const p=await ctx.newPage();
  await p.clock.install({time:new Date(time)}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500); return {p,ctx,errs}; };
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  // 1) PWA: เตือนหลัง login เมื่อเบราว์เซอร์ติดตั้งได้ → ปุ่มเดียวติดตั้ง → จำว่าติดตั้งแล้ว
  {
    seed('h1'); const ctx=await b.newContext({viewport:{width:1400,height:900}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.addInitScript(()=>{ window.__prompted=0; setTimeout(()=>{ const e=new Event('beforeinstallprompt'); e.prompt=()=>{window.__prompted++;}; e.userChoice=Promise.resolve({outcome:'accepted'}); window.dispatchEvent(e); },300); });
    await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(4500);
    check('pwa: reminder modal after login', await p.isVisible('#rx-pwa-modal'));
    check('pwa: sidebar install button', await p.isVisible('#pwa-install-btn'));
    await p.click('#rx-pwa-install'); await p.waitForTimeout(300);
    const st=await p.evaluate(()=>({prompted:window.__prompted, inst:localStorage.getItem('rxfill_pwa_installed'), modal:!!document.getElementById('rx-pwa-modal')}));
    check('pwa: one-click install', st.prompted===1 && st.inst==='1' && !st.modal, JSON.stringify(st));
    await p.reload(); await p.waitForTimeout(4500);
    check('pwa: no reminder once installed', !(await p.isVisible('#rx-pwa-modal')));
    check('pwa: no errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  // 2) ใบ ฉ: par_qty = 0 ทุกตัว ยังค้นหาเจอ (ชื่อ / รหัสเก่า) และใช้ Target จากใบเบิกล่าสุด
  {
    const {p,ctx,errs}=await open(b,'h1','2026-11-03T10:00:00');
    await p.click('text=เบิกยาฉุกเฉิน (ใบ ฉ)'); await p.waitForTimeout(500); await p.click('#em-new'); await p.waitForTimeout(300);
    await p.fill('#em-search','amox'); await p.waitForTimeout(200);
    check('emergency: found by name with par_qty 0', (await p.innerText('#em-form')).includes('Amoxicillin'));
    await p.fill('#em-search','013'); await p.waitForTimeout(200);
    const txt=await p.innerText('#em-form'); check('emergency: found by old_code', txt.includes('Amoxicillin'));
    await p.click('#em-form button:has-text("Amoxicillin")'); await p.waitForTimeout(200);
    check('emergency: target from last requisition', (await p.innerText('#em-form')).includes('5(0)') || (await p.innerText('#em-form')).includes('500'), '');
    await p.fill('#em-search','zzzz'); await p.waitForTimeout(200);
    check('emergency: no-result hint', await p.isVisible('#em-no-result'));
    check('emergency: no errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  // 3) เดือนของใบตามรอบ: ทำวันที่ 28 ต.ค. เลือกรอบ 1/2570 (5 ต.ค.) → เดือน 10 (ชนใบเดือน 10 ที่มีอยู่) ไม่ใช่เดือน 11
  {
    const {p,ctx,errs}=await open(b,'h1','2026-10-28T10:00:00',{req_rounds:{'2570-rpst-01':{id:'2570-rpst-01',fiscal_year:2570,round_no:1,round_date:'2026-10-05',scope:'rpst',active:true},'2570-rpst-02':{id:'2570-rpst-02',fiscal_year:2570,round_no:2,round_date:'2026-11-02',scope:'rpst',active:true}}});
    await p.click('text=เบิกยา / เติมยา'); await p.waitForTimeout(500);
    await p.click('[role=radio] >> nth=0'); await p.click('#rpst-round-go'); await p.waitForTimeout(600);
    const body=await p.innerText('body');
    check('month: round 1 → month 10', body.includes('10/2026'), body.slice(0,200).replace(/\s+/g,' '));
    check('month: no errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  // 4) แอดมินแก้จำนวน D1 (ยังไม่บันทึก) แล้วเพิ่ม D3 แบบหน่วยเต็ม → D1 ไม่ย้อนกลับ, D3 = 2 Pack × 10
  {
    const {p,ctx,errs}=await open(b,'a1','2026-10-28T10:00:00');
    await p.click('tr.cursor-pointer >> nth=0'); await p.waitForTimeout(800);
    await p.click('#req-item-D1 button:has-text("แก้ไข")'); await p.fill('#req-item-D1 input[type=number]','3000'); await p.click('#req-item-D1 button:has-text("ตกลง")'); await p.waitForTimeout(200);
    const addInput=p.locator('input[placeholder="พิมพ์ชื่อหรือรหัส..."]').first(); await addInput.fill('D3');
    await addInput.locator('xpath=following-sibling::button[1]').click(); await p.waitForTimeout(300);
    const packDefault=await p.getAttribute('#admin-add-mode-pack','class');
    check('admin add: default = full pack when not unpackable', /emerald/.test(packDefault||''), packDefault);
    await p.fill('#admin-add-input','2'); await p.waitForTimeout(100);
    await p.click('button:has-text("เพิ่มลงใบเบิก")'); await p.waitForTimeout(800);
    const items=await p.evaluate(()=>window.__STORE.requisitions.get('REQ-2026-10-H1').items.map(i=>i.drugId+':'+i.dispenseQty));
    check('admin add: pack mode qty = 2 × 10', items.includes('D3:20'), JSON.stringify(items));
    check('admin add: unsaved edit kept (no revert)', items.includes('D1:3000'), JSON.stringify(items));
    check('admin: no errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  // 5) รพ.สต. เพิ่มยาเองในใบเบิก: แตก Pack ไม่ได้ → ค่าเริ่มต้นหน่วยเต็ม · แตกได้ → หน่วยย่อย
  {
    const {p,ctx,errs}=await open(b,'h1','2026-10-25T10:00:00',{requisitions:{}});
    await p.click('text=เบิกยา / เติมยา'); await p.waitForTimeout(800);
    await p.click('summary:has-text("เพิ่มรายการยาที่ไม่อยู่ในใบเบิก")'); await p.waitForTimeout(200);
    const add=async(code)=>{ const inp=p.locator('input[placeholder="พิมพ์ชื่อหรือรหัสยา..."]').first(); await inp.fill(code); await inp.locator('xpath=following-sibling::button[1]').click(); await p.waitForTimeout(300); };
    await add('D4');
    check('rpst add: no-unpack default = full pack', /emerald/.test(await p.getAttribute('#rpst-add-mode-pack','class')||''));
    await p.fill('#rpst-add-input','3'); await p.click('.fixed button:has-text("เพิ่มลงใบเบิก")'); await p.waitForTimeout(400);
    await add('D5');
    check('rpst add: unpackable default = sub-unit', /emerald/.test(await p.getAttribute('#rpst-add-mode-unit','class')||''));
    await p.fill('#rpst-add-input','30'); await p.click('.fixed button:has-text("เพิ่มลงใบเบิก")'); await p.waitForTimeout(400);
    const r4=await p.innerText('#req-row-D4').catch(()=>''), r5=await p.innerText('#req-row-D5').catch(()=>'');
    check('rpst add: D4 = 3 pack (30)', /\b3\b/.test(r4), r4.replace(/\s+/g,' ').slice(0,160));
    check('rpst add: D5 = 30 units (0(30))', r5.includes('0(30)') || r5.includes('(30)'), r5.replace(/\s+/g,' ').slice(0,160));
    check('rpst add: no errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  // 6) ข้อ 7 (ข): ส่ง INVS + บันทึกจัดยา → ราคาในใบ = ราคา INVS (cost ต่อหน่วยย่อย × บรรจุ) · ใบพิมพ์พร้อมยอดคงเหลือแสดงทุก lot
  {
    const {p,ctx,errs}=await open(b,'a1','2026-10-28T10:00:00');
    await p.evaluate(()=>{ const orig=window.fetch; window.__calls=[]; window.print=()=>{};
      window.fetch=async(url,init)=>{ const u=String(url); if(/invs_api/.test(u)){ const body=JSON.parse(init.body); window.__calls.push(body.action);
          const items=[{drug_id:'D1',drug_name:'Paracetamol',qty:3000,lot_no:'A1',expiry:'20270131',cost:0.3,value:900,stock_before:5000,stock_after:2000,stock_lots:2,
            lots_after:[{lot_no:'A1',expiry:'20270131',qty_before:1000,qty_issue:1000,qty_after:0},{lot_no:'B2',expiry:'20280531',qty_before:4000,qty_issue:2000,qty_after:2000}]},
            {drug_id:'D2',drug_name:'Amoxicillin',qty:300,lot_no:'C3',expiry:'20270301',cost:1.5,value:450,stock_before:300,stock_after:0,stock_lots:1}];
          const data=body.action==='preflight'?{ok:true,item_count:2,total_value:1350,items,warnings:[],errors:[],live_send_enabled:true,marker:'SVx'}:{ok:true,sub_po_no:'PO999',items,item_count:2,total_value:1350};
          return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}}); }
        if(/api\/line/.test(u)) return new Response('{"ok":true}',{status:200,headers:{'Content-Type':'application/json'}});
        return orig(url,init); }; });
    await p.click('tr.cursor-pointer >> nth=0'); await p.waitForTimeout(800);
    await p.click('button:has-text("ส่ง INVS + บันทึกจัดยา")'); await p.click('.fixed button:has-text("ตรวจ INVS ต่อ")'); await p.waitForTimeout(800);
    const pf=await p.innerText('body'); check('preflight shows stock all lots + after', pf.includes('คงคลังรวมทุก lot') && pf.includes('5,000') && pf.includes('2,000'));
    const sendBtn=p.locator('button:has-text("ส่ง INVS + ยืนยันจัดยา")').last(); await sendBtn.click(); await p.waitForTimeout(300);
    await p.locator('.fixed button').last().click(); await p.waitForTimeout(2500);
    const r=await p.evaluate(()=>{const d=window.__STORE.requisitions.get('REQ-2026-10-H1'); return {st:d.status, items:(d.items||[]).map(i=>i.drugId+':'+i.price+':'+(i.price_source||'')+':'+(i.price_before_invs??''))};});
    check('invs price: approved with INVS price', r.st==='Completed' && r.items.includes('D1:300:INVS:260') && r.items.includes('D2:150:INVS:120'), JSON.stringify(r)+' calls='+JSON.stringify(await p.evaluate(()=>window.__calls)));
    const sheet=await p.evaluate(()=>buildInvsStockSheetHtml({req:{invs_sub_po_no:'PO999',items:[],invs_request_lot_snapshot:[{drug_id:'D1',qty:3000,cost:0.3,value:900,stock_before:5000,stock_after:2000,stock_lots:2,
      lots_after:[{lot_no:'A1',expiry:'20270131',qty_before:1000,qty_issue:1000,qty_after:0},{lot_no:'B2',expiry:'20280531',qty_before:4000,qty_issue:2000,qty_after:2000},{lot_no:'C9',expiry:'20290101',qty_before:500,qty_issue:0,qty_after:500}]}]},ctx:{findDrug:()=>null,appDb:{units:[]}},unitTitle:'รพ.สต.ทุ่งระยะ'}));
    check('stock sheet: all lots incl. untouched', /A1[^<]*·[^<]*· เหลือ <b>0<\/b>/.test(sheet) && sheet.includes('C9') && /C9[^<]*เหลือ <b>500<\/b>/.test(sheet), '');
    check('invs price: no errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
