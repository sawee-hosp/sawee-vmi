// v6.6.5: ใบหน่วยงาน หน่วย/บรรจุ/จ่ายว่าง, ชื่อไฟล์ PDF, ค้นหารหัสตรงก่อน+ชื่อพ้อง+รูป (ต้องรัน build.js ก่อน)
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const md=(id,name,extra)=>Object.assign({drug_id:id,drug_name:name,unit_id:'U1',pack_size:100,price:2,type:'1'},extra||{});
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'u1'},collections:{
  master_drugs:{'13101':md('13101','Alpha'),'01311':md('01311','Beta'),'131':md('131','Gamma',{invs_keywords:'กัมมา, GAM',fuzzy:'แกมม่า',image_url:'data:image/gif;base64,R0lGODlhAQABAAAAACw='})},
  master_unit:{U1:{unit_id:'U1',unit_name:'เม็ด'}},config:{},
  master_depts:{D1:{dept_id:'D1',dept_name:'ER',kind:'dept',active:true}},
  users:{u1:{name:'พยาบาล',role:'dept',dept_id:'D1',email:'e@x'}},
  internal_requisitions:{},req_rounds:{},master_hospitals:{}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:1400,height:900}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_internal.html')); await p.waitForTimeout(1500);
  const f=await p.evaluate(()=>{const h=buildInternalReqFormHtml({req:{kind:'dept',dept_name:'ER',items:[{drugId:'A',name:'ยา A',unit:'เม็ด',type:'1',packSize:100,price:2,requestQty:300,dispenseQty:100}]},formNo:'1/2570',formDate:'2026-10-05',deptName:'ER',locOf:()=>''});
    const d=new DOMParser().parseFromString(h,'text/html'); const r=[...d.querySelectorAll('.items tbody tr')].find(t=>t.cells.length>5);
    return {title:d.title, heads:[...d.querySelectorAll('.items th')].map(x=>x.textContent).join('|'), cells:[...r.cells].map(c=>c.textContent).join('|')};});
  check('dept form title = filename', f.title==='ER ตุลาคม 2569', f.title);
  check('dept form columns', f.heads==='ที่|รายการ|หน่วย|บรรจุ|จำนวนเบิก|จำนวนจ่าย|ราคา/หน่วย|มูลค่า(บาท)|คงเหลือ|รหัส', f.heads);
  check('dispense blank, value from request', f.cells.split('|')[5]==='' && f.cells.split('|')[7]==='6.00', f.cells);
  // search
  await p.click('button:has-text("สร้างใบเบิก") >> nth=-1').catch(()=>{}); await p.waitForTimeout(600);
  const more=await p.$('button:has-text("สร้างใบเบิกต่อ")'); if (more) { await more.click(); await p.waitForTimeout(600); }
  const inp=await p.$('input[aria-label="ค้นหายา"]');
  await inp.fill('131'); await p.waitForTimeout(300);
  const items=await p.$$eval('.absolute.z-30 button',bs=>bs.map(b=>b.innerText.replace(/\s+/g,' ')));
  check('exact code first', items[0]&&items[0].startsWith('131Gamma'), items.join(' || '));
  check('synonyms shown', (items[0]||'').includes('ชื่อพ้อง: กัมมา · GAM · แกมม่า'), items[0]);
  check('image shown', await p.$$eval('.absolute.z-30 img',x=>x.length)===1);
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
