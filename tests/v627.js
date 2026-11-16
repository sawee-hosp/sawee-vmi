// v6.27: ของไม่พอ = ล็อกส่ง INVS · ดึงจากกองMR · กองMR นับ/ตัด MR · แอดมินเพิ่มยาในใบหน่วยงาน · ดักสับสนหน่วย · หน่วยสะดวกห้องยา · Sync ชื่อ/ประเภทจาก INVS
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const NOW=new Date('2026-10-28T10:00:00');
const base={
  master_drugs:{D1:{drug_id:'D1',drug_name:'Syringe 5 ml',unit_id:'U1',type:'32',price:100,pack_size:100,invs_location:'12/1'},D2:{drug_id:'D2',drug_name:'Gauze 3x3',unit_id:'U1',type:'32',price:50,pack_size:10,invs_location:'7/2'},
    D3:{drug_id:'D3',drug_name:'Paracetamol',unit_id:'U1',type:'1',price:1,pack_size:1}},
  master_unit:{U1:{unit_id:'U1',unit_name:'ชิ้น'}},config:{},master_hospitals:{},
  master_depts:{WARD:{dept_id:'WARD',dept_name:'ตึกผู้ป่วยหญิง',kind:'dept',active:true},PHARM:{dept_id:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',active:true}},
  req_rounds:{R2:{id:'R2',fiscal_year:2570,round_no:2,round_date:'2026-11-02',scope:'internal',active:true}},
  internal_requisitions:{},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'},d1:{name:'พยาบาล',role:'dept',dept_id:'WARD',email:'d@x'}}};
const seed=(uid,extra)=>fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid},collections:Object.assign({},base,extra||{})})+';');
const newPage=async(b,uid,extra,file,route)=>{ seed(uid,extra); const p=await (await b.newContext({viewport:{width:1500,height:900}})).newPage(); await p.clock.install({time:NOW}); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); if(route) await p.route('http://127.0.0.1/**',route); await p.goto('file://'+path.join(DIR,file)); await p.waitForTimeout(1500); return {p,errs}; };
const json=(r,d)=>r.fulfill({contentType:'application/json',body:JSON.stringify(d)});
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  // 1) คิวใบภายใน: ของไม่พอ → ล็อกส่ง · แก้จ่ายเป็นเท่าที่มี · ดึงกองMR · แอดมินเพิ่มยา
  {
    const IR1={deptId:'WARD',dept_name:'ตึกผู้ป่วยหญิง',kind:'dept',status:'Pending',round_id:'R2',form_no:'2/2570',submitted_at:'2026-10-27T01:00:00Z',
      items:[{drugId:'D1',name:'Syringe 5 ml',unit:'ชิ้น',packSize:100,price:100,type:'32',requestQty:300,dispenseQty:300},{drugId:'D2',name:'Gauze 3x3',unit:'ชิ้น',packSize:10,price:50,type:'32',requestQty:30,dispenseQty:30}],total_value:450};
    let calls=[];
    const {p,errs}=await newPage(b,'a1',{internal_requisitions:{IR1},mr_pool:{D1:{drug_id:'D1',drug_name:'Syringe 5 ml',qty:150,lots:[{lot_no:'S0',expiry:'20270101',qty:150}]}}},'t_app.html',async r=>{
      const body=JSON.parse(r.request().postData()||'{}'); calls.push(body.action);
      const st=await r.request().frame().page().evaluate(()=>window.__STORE.internal_requisitions.get('IR1').items.map(i=>[i.drugId,i.dispenseQty]));
      const q=Object.fromEntries(st);
      const items=[{drug_id:'D1',qty:q.D1,value:q.D1,lot_no:'S1',expiry:'20270101',vmi_pack_size:100,stock_before:250,stock_after:Math.max(0,250-q.D1)},{drug_id:'D2',qty:q.D2,value:q.D2*5,lot_no:'G1',expiry:'20270501',stock_before:45,stock_after:45-q.D2}];
      await json(r,{ok:true,item_count:items.length,total_value:1,items,warnings:[],errors:[],live_send_enabled:true}); });
    await p.click('text=คิวใบเบิกภายใน รพ.'); await p.waitForTimeout(600);
    await p.click('tr:has-text("ตึกผู้ป่วยหญิง")'); await p.waitForTimeout(600);
    // แอดมินเพิ่มยา
    await p.fill('#iq-add-drug','D3'); await p.click('#iq-add-pick'); await p.fill('#iq-add-input','5'); await p.click('#iq-add-confirm'); await p.waitForTimeout(600);
    const added=await p.evaluate(()=>window.__STORE.internal_requisitions.get('IR1').items.filter(i=>i.admin_added).map(i=>i.drugId+':'+i.dispenseQty));
    check('admin add drug in review panel (saved, flagged)', JSON.stringify(added)==='["D3:5"]', JSON.stringify(added));
    check('admin-added badge shown', (await p.innerText('#iq-form-table')).includes('แอดมินเพิ่ม'));
    await p.click('button:has-text("ตรวจ INVS แล้วอนุมัติ")'); await p.waitForTimeout(1200);
    check('short stock box shown + send disabled', await p.isVisible('#invs-short-box') && await p.isDisabled('button:has-text("ส่งเข้า INVS และอนุมัติ")'));
    check('MR pull button shown (pool has 150)', await p.locator('.invs-short-mr').count()===1);
    await p.click('.invs-short-mr'); await p.waitForSelector('#mr-pull-modal');
    check('MR pull plan shows lot S0 + qty 50', (await p.innerText('#mr-pull-modal')).includes('S0') && await p.inputValue('#mr-pull-qty')==='50');
    await p.click('#mr-pull-confirm'); await p.waitForTimeout(800);
    const pool=await p.evaluate(()=>({q:window.__STORE.mr_pool.get('D1').qty, ev:[...(window.__STORE.mr_pool_events||new Map()).values()].map(e=>e.type+':'+e.qty)}));
    check('MR pull: pool 150 → 100 + PULL event', pool.q===100 && JSON.stringify(pool.ev)==='["PULL:50"]', JSON.stringify(pool));
    await p.click('.invs-short-fix'); await p.waitForTimeout(1500);
    const d1=await p.evaluate(()=>window.__STORE.internal_requisitions.get('IR1').items.find(i=>i.drugId==='D1').dispenseQty);
    check('fix: dispense set to available 250, box gone, send enabled', d1===250 && !(await p.isVisible('#invs-short-box')) && !(await p.isDisabled('button:has-text("ส่งเข้า INVS และอนุมัติ")')), String(d1));
    check('queue: no errors', !errs.length, errs.join(' | '));
  }
  // 2) หน้า กองMR: นับ → เกิน INVS เข้ากอง · ขาด = ใบตัดเข้าห้องยา
  {
    const {p,errs}=await newPage(b,'a1',{},'t_app.html',async r=>{ await json(r,{ok:true,lots:{D1:[{lot_no:'S1',expiry:'20270101',qty:200}],D2:[{lot_no:'G1',expiry:'20270501',qty:40}]}}); });
    await p.click('button:has-text("กองMR")'); await p.waitForSelector('#mr-pool-view');
    check('MR view lists type 32 only', (await p.locator('.mr-row').count())===2);
    await p.click('#mr-fetch-lots'); await p.waitForTimeout(600);
    await p.fill('[aria-label="นับคลังใหญ่ Syringe 5 ml"]','230'); await p.fill('[aria-label="นับกองMR Syringe 5 ml"]','20');
    await p.fill('[aria-label="นับคลังใหญ่ Gauze 3x3"]','35');
    const rs=(await p.innerText('#mr-table')).replace(/\s+/g,' ');
    check('MR result: D1 over → pool, D2 short → cut', rs.includes('เกิน INVS') && rs.includes('ขาด'), rs.slice(0,300));
    await p.click('#mr-save-count'); await p.waitForTimeout(900);
    const st=await p.evaluate(()=>({pool:window.__STORE.mr_pool.get('D1')?.qty, pool2:window.__STORE.mr_pool.get('D2')?.qty, cut:[...window.__STORE.internal_requisitions.values()].filter(r=>r.mr_adjust).map(r=>r.deptId+':'+r.status+':'+r.items.map(i=>i.drugId+'='+i.dispenseQty).join(','))}));
    check('MR count: D1 pool = 20 + 30, D2 pool 0, cut req PHARM D2=5', st.pool===50 && st.pool2===0 && JSON.stringify(st.cut)==='["PHARM:Pending:D2=5"]', JSON.stringify(st));
    check('MR view: no errors', !errs.length, errs.join(' | '));
  }
  // 3) หน่วยงาน: ขอหน่วยย่อย 2 ชิ้น (ปกติ 200) → modal → เปลี่ยนเป็นแพ็ก
  {
    const hist={};
    [['H1','2026-08-01'],['H2','2026-09-01'],['H3','2026-10-01']].forEach(([id,dt])=>hist[id]={deptId:'WARD',dept_name:'ตึกผู้ป่วยหญิง',kind:'dept',status:'Completed',form_date:dt,round_date:dt,items:[{drugId:'D1',name:'Syringe 5 ml',unit:'ชิ้น',packSize:100,price:100,type:'32',requestQty:200,dispenseQty:200}]});
    const {p,errs}=await newPage(b,'d1',{internal_requisitions:hist},'t_internal.html');
    await p.click('text=สร้างใบเบิก>>nth=0'); await p.waitForTimeout(400);
    await p.click('button:has-text("เริ่มกรอกใบเบิก")'); await p.waitForTimeout(500);
    await p.locator('tr',{hasText:'Syringe 5 ml'}).locator('button:has-text("ขอหน่วยย่อย")').click(); await p.waitForTimeout(150);
    await p.fill('#qty-D1','2'); await p.waitForTimeout(200);
    check('dept: inline hint "ไม่ถึง 1 แพ็ค"', (await p.innerText('body')).includes('ไม่ถึง 1 แพ็ค'));
    await p.click('button:has-text("ส่งใบเบิก")'); await p.waitForTimeout(400);
    check('dept: qty-check modal shown', await p.isVisible('#qty-check-modal'));
    await p.click('.qty-check-pack'); await p.click('#qty-check-go'); await p.waitForTimeout(300);
    await p.click('.fixed button:has-text("ส่งใบเบิก")'); await p.waitForTimeout(900);
    const r=await p.evaluate(()=>[...window.__STORE.internal_requisitions.values()].filter(x=>x.status==='Pending').map(x=>x.items.map(i=>i.drugId+':'+i.requestQty).join(',')));
    check('dept: saved as 2 packs = 200', JSON.stringify(r)==='["D1:200"]', JSON.stringify(r));
    const f=await p.evaluate(()=>{ const h=new Map([['X',[1,1,1]]]); return [qtyCheckFlags([{drugId:'X',qty:1,packSize:1}],h,'t').length, qtyCheckFlags([{drugId:'Y',qty:1,packSize:1}],new Map([['Y',[50,60,40]]]),'t').length]; });
    check('flags: usual 1 = no flag · usual 50 then 1 = flag', JSON.stringify(f)==='[0,1]', JSON.stringify(f));
    check('dept: no errors', !errs.length, errs.join(' | '));
  }
  // 4) Sync จาก INVS: ชื่อ/ประเภท/หน่วย
  {
    const {p,errs}=await newPage(b,'a1',{},'t_app.html',async r=>{ await json(r,{ok:true,rows:[{drug_id:'D3',invs_drug_name:'Paracetamol 500 mg',unit_id:'U1',unit_name:'ชิ้น',pack_size:1,price:1,type_code:'25'}],units:[{unit_id:'U1',unit_name:'เม็ด'}],types:[{type_code:'25',type_name:'ยาโรคเรื้อรัง'}],type_column:'DRUG_TYPE'}); });
    await p.evaluate(()=>{ window.__openSync=true; });
    const ok=await p.evaluate(async()=>{ return typeof InvsMasterSyncModal; }).catch(()=> 'x');
    await p.click('text=จัดการฐานข้อมูล').catch(()=>{}); await p.waitForTimeout(500);
    await p.click('button:has-text("Sync รายการยาจาก INVS")').catch(()=>{}); await p.waitForTimeout(1200);
    const t=(await p.innerText('body')).replace(/\s+/g,' ');
    check('sync modal: name + type change listed', t.includes('Paracetamol 500 mg') && t.includes('ซิงก์ชื่อยาตาม INVS'), t.slice(t.indexOf('Sync รายการยา'),t.indexOf('Sync รายการยา')+200));
    await p.click('.fixed button:has-text("บันทึก")').catch(()=>{}); await p.waitForTimeout(1200);
    const d=await p.evaluate(()=>({d:window.__STORE.master_drugs.get('D3'), u:window.__STORE.master_unit.get('U1')?.unit_name, t:window.__STORE.config?.get('drug_types')}));
    check('sync saved: name, type, unit name, type table', d.d.drug_name==='Paracetamol 500 mg' && d.d.drug_name_previous==='Paracetamol' && d.d.type==='25' && d.u==='เม็ด' && d.t && d.t['25']==='ยาโรคเรื้อรัง', JSON.stringify({n:d.d.drug_name,t:d.d.type,u:d.u,tt:d.t}));
    check('sync: no errors', !errs.length, errs.join(' | '));
  }
  // 5) ห้องยา: หน่วยสะดวก 12
  {
    fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'ph1'},collections:{
      master_drugs:{L1:{drug_id:'L1',drug_name:'Calamine lotion',unit_id:'U1',type:'1',price:10,pack_size:1,hosxp_code:'2000001'}},
      master_unit:{U1:{unit_id:'U1',unit_name:'ขวด'}},config:{},master_hospitals:{},
      master_depts:{PHARM:{dept_id:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',cover_days:30,active:true}},
      users:{ph1:{name:'ภก',role:'pharmacy',dept_id:'PHARM',email:'p@x'}},internal_stock:{},internal_requisitions:{},req_rounds:{}}})+';');
    const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage(); await p.clock.install({time:new Date('2026-11-10T10:00:00')}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); let data={ok:true}; if(body.action==='hosxp_usage') data={ok:true,days:30,count:1,rows:[{icode:'2000001',opd_qty:15,ipd_qty:0}]}; await json(r,data); });
    await p.goto('file://'+path.join(DIR,'t_internal.html')); await p.waitForSelector('text=ใบเบิกของฉัน');
    await p.click('button:has-text("สร้างใบเบิก")'); await p.click('button:has-text("สร้างใบเบิกต่อ")'); await p.waitForSelector('text=สร้างใบเบิกห้องยา');
    await p.fill('#usage-from','2026-10-01').catch(()=>{}); await p.fill('#usage-to','2026-10-30'); await p.click('button:has-text("ดึงยอดใช้จาก HOSxP")'); await p.waitForSelector('text=Calamine lotion'); await p.waitForTimeout(600);
    await p.fill('[aria-label="หน่วยสะดวก Calamine lotion"]','12'); await p.press('[aria-label="หน่วยสะดวก Calamine lotion"]','Enter'); await p.waitForTimeout(800);
    const saved=await p.evaluate(()=>window.__STORE.master_drugs.get('L1').pharm_round_unit);
    const row=(await p.locator('tr',{hasText:'Calamine lotion'}).first().innerText()).replace(/\s+/g,' ');
    const m=row.match(/ปัดจาก (\d+) → (\d+)/);
    check('pharmacy: round unit saved + suggestion rounded to multiple of 12', saved===12 && (m ? Number(m[2])%12===0 : /\b(12|24|36)\b/.test(row)), row.slice(0,260));
    check('pharmacy: no errors', !errs.length, errs.join(' | '));
  }
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
