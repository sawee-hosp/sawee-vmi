// v6.26: คิวใบภายใน — หน้าตรวจก่อนส่ง INVS แบบใบเบิก (หมวด → ตำแหน่ง, ลำดับที่) · LINE Console สวิตช์ปิดแจ้งเตือน / เฉพาะเวลาทำการ
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
// unit: settingsBlock / inWorkHours (เซิร์ฟเวอร์)
try { const core=require(fs.existsSync(path.join(DIR,'..','api','_lib','core.js'))?path.join(DIR,'..','api','_lib','core.js'):'/home/user/sawee-vmi/api/_lib/core.js');
  const st={...core.LINE_SETTINGS_DEFAULT, work_hours_only:true};
  const mon10=Date.parse('2026-11-16T03:00:00Z'), mon18=Date.parse('2026-11-16T11:00:00Z'), sat10=Date.parse('2026-11-14T03:00:00Z');
  check('server: work hours Mon 10:00 = send', core.settingsBlock(st,'staff',mon10)==='');
  check('server: Mon 18:00 / Sat = off_hours', core.settingsBlock(st,'staff',mon18)==='off_hours' && core.settingsBlock(st,'staff',sat10)==='off_hours');
  check('server: staff disabled / admin unaffected / test always', core.settingsBlock({...st,staff_enabled:false},'staff',mon10)==='disabled_staff' && core.settingsBlock({...st,staff_enabled:false},'admin',mon18)==='' && core.settingsBlock({...st,admin_enabled:false,staff_enabled:false},'test',mon18)==='');
} catch(e){ check('server unit', false, e.message); }
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'a1'},collections:{
  master_drugs:{D1:{drug_id:'D1',drug_name:'Syringe 5 ml',unit_id:'U1',type:'32',price:100,pack_size:100,invs_location:'12/1',old_code:'259'},
    D2:{drug_id:'D2',drug_name:'Gauze 3x3',unit_id:'U1',type:'32',price:50,pack_size:10,invs_location:'7/2'},
    D3:{drug_id:'D3',drug_name:'Paracetamol',unit_id:'U1',type:'1',price:1,pack_size:1,invs_location:'20/1'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'ชิ้น'}},config:{},master_hospitals:{},
  master_depts:{WARD:{dept_id:'WARD',dept_name:'ตึกผู้ป่วยหญิง',kind:'dept',active:true}},
  internal_requisitions:{IR1:{deptId:'WARD',dept_name:'ตึกผู้ป่วยหญิง',kind:'dept',status:'Pending',round_id:'R2',round_no:2,form_no:'2/2570',submitted_at:'2026-11-01T01:00:00Z',
    items:[{drugId:'D1',name:'Syringe 5 ml',unit:'ชิ้น',packSize:100,price:100,type:'32',requestQty:200,dispenseQty:200},{drugId:'D2',name:'Gauze 3x3',unit:'ชิ้น',packSize:10,price:50,type:'32',requestQty:30,dispenseQty:30},{drugId:'D3',name:'Paracetamol',unit:'ชิ้น',packSize:1,price:1,type:'1',requestQty:10,dispenseQty:10}],total_value:240}},
  line_logs:{},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1500,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('http://127.0.0.1/**', async r=>{ const items=[{drug_id:'D1',qty:200,value:240,lot_no:'S1',expiry:'20270101',vmi_pack_size:100,stock_before:1250,stock_after:1050},{drug_id:'D2',qty:30,value:120,lot_no:'G1',expiry:'20270501',stock_before:45,stock_after:15},{drug_id:'D3',qty:10,value:10,lot_no:'P1',expiry:'20280101',stock_before:5,stock_after:-5}];
    await r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,item_count:3,total_value:370,items,warnings:[],errors:[],live_send_enabled:true})}); });
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
  await p.click('text=คิวใบเบิกภายใน รพ.'); await p.waitForTimeout(600);
  await p.click('tr:has-text("ตึกผู้ป่วยหญิง")'); await p.waitForTimeout(600);
  const ft=(await p.innerText('#iq-form-table')).replace(/\s+/g,' ');
  const o2=['จำนวนเบิก','ยา','Paracetamol','เวชภัณฑ์','Gauze','Syringe','D1(259)'].map(k=>ft.indexOf(k));
  check('review table: form layout (type groups, location order, code)', o2.every((v,i)=>v>=0&&(i===0||v>o2[i-1])) && ft.includes('ราคา/หน่วย'), ft.slice(0,300));
  await p.screenshot({path:path.join(DIR,'v626_review.png')});
  await p.click('button:has-text("ตรวจ INVS แล้วอนุมัติ")'); await p.waitForTimeout(1200);
  const t=(await p.innerText('#iq-preflight-form').catch(()=>'')).replace(/\s+/g,' ');
  const order=['ยา','Paracetamol','เวชภัณฑ์','Gauze','Syringe'].map(k=>t.indexOf(k));
  check('preflight: grouped by type, sorted by location (7/2 before 12/1)', order.every((v,i)=>v>=0&&(i===0||v>order[i-1])), t.slice(0,300));
  check('preflight: form columns + numbering + old code + total', t.includes('จำนวนเบิก') && t.includes('บรรจุ') && t.includes('D1(259)') && t.includes('รวม 3 รายการ') && /\b3 Syringe/.test(t), t.slice(0,400));
  check('preflight: short stock red', await p.locator('#iq-preflight-form tr:has-text("Paracetamol") td.text-red-600').count()===1);
  // LINE Console
  const srv=require('http').createServer((q,r)=>{ const f=path.join(DIR,decodeURIComponent(q.url.split('?')[0])); fs.readFile(f,(e,d)=>{ if(e){r.statusCode=404;return r.end();} r.end(d); }); }).listen(8766);
  let set={staff_enabled:true,admin_enabled:true,work_hours_only:false,work_start:'08:30',work_end:'16:30'};
  await p.route('**/api/line-notify', async r=>{ const bd=JSON.parse(r.request().postData()||'{}'); if(bd.action==='settings') set={...bd.settings};
    await r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,quota:{used:1,limit:300,remaining:299,tier:'normal',month:'202611'},state:{},settings:set})}); });
  await p.goto('http://localhost:8766/t_app.html'); await p.waitForTimeout(1500);
  await p.click('text=LINE Console'); await p.waitForTimeout(1000);
  check('line settings panel renders', await p.isVisible('#line-settings'));
  await p.click('#line-set-staff'); await p.waitForTimeout(500);
  await p.click('#line-set-hours'); await p.waitForTimeout(500);
  const s=set; srv.close();
  check('line settings saved via API (staff off, work hours on)', s.staff_enabled===false && s.work_hours_only===true, JSON.stringify(s));
  check('staff-off warning shown', (await p.innerText('#line-settings')).includes('ปิดแจ้งเตือนถึง จนท.'));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
