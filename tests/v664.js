// v6.6.4: แดชบอร์ดเรียงใหม่→เก่า, ปุ่ม INVS เดียว, ชื่อผู้ลงนาม รพ.สต., แอดมินคีย์ใบหน่วยงานย้อนหลังปีงบ (ต้องรัน build.js ก่อน)
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const mk=(id)=>({drugId:id,name:'ยา'+id,type:'1',packSize:100,price:1,usage:100,prevExcess:0,systemSuggestedQty:100,finalRequestedQty:100,dispenseQty:100});
const ts=(iso)=>({seconds:Math.floor(new Date(iso).getTime()/1000),nanoseconds:0});
const seedA=()=>fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'adm'},collections:{
  master_drugs:{A1:{drug_id:'A1',drug_name:'ยาA1',unit_id:'U1',pack_size:100,price:1,type:'1'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'เม็ด'}},config:{},
  master_depts:{D1:{dept_id:'D1',dept_name:'ER',kind:'dept',active:true}},
  master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ'},H2:{hospital_id:'H2',hospital_name:'รพ.สต.ครน'}},
  users:{adm:{name:'แอดมิน',role:'admin',email:'a@x'}},
  internal_requisitions:{},req_rounds:{},
  requisitions:{'REQ-OLD':{hospitalId:'H1',month:10,year:2026,status:'Pending',created_by_name:'จนท.เก่า',created_at:ts('2026-09-21T09:00:00Z'),items:[mk('A1')]},
                'REQ-NEW':{hospitalId:'H2',month:10,year:2026,status:'Pending',created_by_name:'จนท.ใหม่',created_at:ts('2026-09-24T09:00:00Z'),items:[mk('A1')]}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  seedA();
  let p=await b.newPage({viewport:{width:1500,height:900}}); let errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
  const heads=await p.$$eval('th',t=>t.map(x=>x.innerText.trim()).join('|'));
  check('dashboard columns', heads.includes('วันเวลาที่ส่ง|ผู้ทำรายการ|รพ.สต.|รอบบิล'), heads.slice(0,200));
  const order=await p.$$eval('tbody tr',t=>t.map(x=>x.cells[0]?.innerText).filter(x=>/^REQ-/.test(x||'')).join(','));
  check('dashboard newest first', order.startsWith('REQ-NEW,REQ-OLD'), order);
  await (await p.$('tr:has-text("REQ-NEW")')).click(); await p.waitForTimeout(800);
  check('only combined INVS button on pending', !(await p.$('button:text-is("ส่งเข้า INVS")')) && !!(await p.$('button:has-text("ส่ง INVS + บันทึกจัดยา")')));
  await p.click('#edit-sign-roles'); await p.fill('#sign-name-1','นางสาว ผอ.'); await p.click('#sign-save'); await p.waitForTimeout(800);
  const d=await p.evaluate(()=>window.__STORE.requisitions.get('REQ-NEW'));
  check('sign names saved', Array.isArray(d.sign_names) && d.sign_names[1]==='นางสาว ผอ.', JSON.stringify(d.sign_names));
  check('sign name printed in footer', (await p.innerText('#sign-block')).includes('(นางสาว ผอ.)'));
  check('app no errors', !errs.length, errs.join(' | ')); await p.close();
  // internal admin backdate
  p=await b.newPage({viewport:{width:1500,height:900}}); errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_internal.html')); await p.waitForTimeout(2000);
  await p.click('button:has-text("สร้างใบเบิก") >> nth=-1'); await p.waitForTimeout(500);
  await p.click('button:has-text("ปีงบ 2569")'); await p.waitForTimeout(200);
  await p.fill('#manual-form-date','2026-08-15'); await p.waitForTimeout(200);
  const info=await p.innerText('body');
  check('manual pick shows 1/2569', info.includes('เลขที่ 1/2569'), (info.match(/เลขที่ [^ ]+/)||[''])[0]);
  await p.click('#manual-form-start'); await p.waitForTimeout(800);
  const t2=await p.innerText('body');
  check('opens dept form with 1/2569 banner', t2.includes('1/2569'), t2.slice(0,200).replace(/\s+/g,' '));
  check('internal no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
