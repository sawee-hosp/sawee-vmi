// v6.30: รายการใบเบิก ค้นหา+แบ่งหน้า · ตรวจช่วง export รบ.301 · หัวหน้าหน่วยงาน (ผู้เบิก) · ชื่อ ผอ. (ผู้สั่งจ่าย)
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const NOW=new Date('2026-11-19T10:00:00');
const reqs={}; for(let i=1;i<=25;i++){ const id='REQ-2026-11-'+String(i).padStart(3,'0'); reqs[id]={hospitalId:i===7?'h02':'h01',month:11,year:2026,status:'Pending',items:[],submitted_at:new Date(Date.UTC(2026,10,1,0,i)).toISOString()}; }
const base={
  master_drugs:{D1:{drug_id:'D1',drug_name:'Syringe 5 ml',unit_id:'U1',type:'2',price:100,pack_size:100}},
  master_unit:{U1:{unit_id:'U1',unit_name:'ชิ้น'}},config:{},
  master_hospitals:{h01:{hospital_id:'h01',hospital_name:'รพ.สต.ทดสอบหนึ่ง'},h02:{hospital_id:'h02',hospital_name:'รพ.สต.ดอนทราย'}},
  master_depts:{WARD:{dept_id:'WARD',dept_name:'ตึกหญิง',kind:'dept',active:true}},
  req_rounds:{},internal_stock:{},
  users:{d1:{name:'พยาบาล',role:'dept',dept_id:'WARD',email:'d@x'},a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'}}};
const IR={deptId:'WARD',dept_name:'ตึกหญิง',kind:'dept',status:'Pending',form_no:'5/2570',form_date:'2026-11-09',doc_no:'d-691109-01',submitted_at:'2026-11-09T01:00:00Z',created_by_uid:'d1',created_by_name:'พยาบาล',
  items:[{drugId:'D1',name:'Syringe 5 ml',unit:'ชิ้น',packSize:100,price:100,type:'2',requestQty:200,dispenseQty:200}],total_value:200};
const newPage=async(b,uid,extra,file)=>{ fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid},collections:Object.assign({},base,extra||{})})+';');
  const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage(); await p.clock.install({time:NOW}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('http://127.0.0.1/**', r=>r.fulfill({contentType:'application/json',body:'{"ok":true}'}));
  await p.goto('file://'+path.join(DIR,file)); await p.waitForTimeout(1500); await p.evaluate(()=>{ window.print=()=>{}; }); return {p,errs}; };
const inputVals=(p)=>p.evaluate(()=>[...document.querySelectorAll('input')].map(i=>i.value).join('|'));
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  // 1) หน่วยงานยังไม่มีหัวหน้า → modal → บันทึก → ใบพิมพ์ ผู้เบิก = หัวหน้า, ผู้สั่งจ่าย = ผอ.
  {
    const {p,errs}=await newPage(b,'d1',{internal_requisitions:{IR1:IR},config:{signers:{director_name:'นพ.ผู้อำนวยการ ทดสอบ',director_position:'ผู้อำนวยการโรงพยาบาลสวี'}}},'t_internal.html');
    check('dept head modal shows', await p.isVisible('#dept-head-modal'));
    await p.fill('#dept-head-name','นางหัวหน้า ตึกหญิง'); await p.fill('#dept-head-position','หัวหน้าหอผู้ป่วย');
    await p.click('#dept-head-save'); await p.waitForTimeout(600);
    const d=await p.evaluate(()=>window.__STORE.master_depts.get('WARD'));
    check('head saved to master_depts', d.head_name==='นางหัวหน้า ตึกหญิง' && d.head_position==='หัวหน้าหอผู้ป่วย' && !!d.updated_at, JSON.stringify(d));
    check('modal closed', !(await p.isVisible('#dept-head-modal')));
    await p.click('text=d-691109-01'); await p.waitForTimeout(400); await p.click('#req-print-main'); await p.waitForTimeout(400);
    const v=await inputVals(p);
    check('print: ผู้เบิก = หัวหน้า, ผู้สั่งจ่าย = ผอ.', v.includes('นางหัวหน้า ตึกหญิง') && v.includes('หัวหน้าหอผู้ป่วย') && v.includes('นพ.ผู้อำนวยการ ทดสอบ'), v);
    check('dept: no errors', !errs.length, errs.join(' | '));
  }
  // 2) แอดมินไม่มีชื่อ ผอ. → modal ใน internal.html
  {
    const {p,errs}=await newPage(b,'a1',{},'t_internal.html');
    check('director modal for admin', await p.isVisible('#director-modal'));
    await p.fill('#director-name','นพ.ใหม่'); await p.click('#director-save'); await p.waitForTimeout(500);
    const c=await p.evaluate(()=>window.__STORE.config.get('signers'));
    check('config/signers saved', c && c.director_name==='นพ.ใหม่' && c.director_position==='ผู้อำนวยการโรงพยาบาลสวี', JSON.stringify(c));
    check('admin internal: no errors', !errs.length, errs.join(' | '));
  }
  // 3) แดชบอร์ดแอดมิน: แบ่งหน้า + ค้นหา · ฟังก์ชันตรวจช่วง รบ.301
  {
    const {p,errs}=await newPage(b,'a1',{requisitions:reqs},'t_app.html');
    const pager=await p.isVisible('#req-pager');
    check('pager visible for 25 reqs', pager, pager?(await p.innerText('#req-pager')):'');
    if(pager){ await p.click('#req-page-next'); await p.waitForTimeout(300); check('page 2 shows 21–25', (await p.innerText('#req-pager')).includes('21–25')); }
    await p.fill('#req-search','ดอนทราย'); await p.waitForTimeout(300);
    const t=await p.innerText('body'); check('search by hospital name', t.includes('REQ-2026-11-007') && !t.includes('REQ-2026-11-008'));
    const r=await p.evaluate(()=>[rb301PeriodCheck('2026-07-21','2026-08-20',9,2026).status, rb301PeriodCheck('2026-07-21','2026-08-20',8,2026).status]);
    check('period check: ก.ย. ok / ส.ค. wrong', r[0]==='ok' && r[1]==='wrong', r.join(','));
    check('app: no errors', !errs.length, errs.join(' | '));
  }
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
