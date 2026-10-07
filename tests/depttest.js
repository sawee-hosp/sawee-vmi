const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs=require('fs'),path=require('path');const DIR=__dirname;
const rows=JSON.parse(fs.readFileSync('/tmp/depts.json','utf8'));
const cols={master_drugs:{},master_unit:{},master_depts:{},config:{},users:{adm:{name:'แอดมิน',role:'admin',email:'a@x'}},
 master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ',invs_dept_id:''},H2:{hospital_id:'H2',hospital_name:'รพ.สต. บ้านควนสามัคคี',invs_dept_id:'26'}}};
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'adm'},collections:cols})+';');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];
p.on('pageerror',e=>errs.push(e.message));
await p.route('http://127.0.0.1/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,rows,count:rows.length})}));
await p.goto('file://'+path.join(DIR,'t_app.html'));
await p.waitForSelector('text=จัดการฐานข้อมูล');
await p.click('button:has-text("จัดการฐานข้อมูล")');await p.click('button:has-text("หน่วยงาน/ห้องยา")');
await p.click('button:has-text("ดึงหน่วยงานจาก INVS")');
await p.waitForSelector('text=ซิงก์หน่วยงานจากตาราง dept_id');
const sel=await p.textContent('.fixed span:has-text("เลือก")');
await p.click('button:has-text("บันทึกที่เลือก")');await p.waitForTimeout(500);
const st=await p.evaluate(()=>({d:Object.fromEntries(window.__STORE.master_depts),h:Object.fromEntries(window.__STORE.master_hospitals)}));
const ds=Object.values(st.d);
console.log('selected:',sel);
console.log('depts:',ds.length,'pharmacy:',ds.filter(x=>x.kind==='pharmacy').map(x=>x.dept_id+' '+x.dept_name).join(','));
console.log('H1 invs:',st.h.H1.invs_dept_id,' H2 invs:',st.h.H2.invs_dept_id);
console.log('errors:',errs.join('|')||'none');
// version guard: serve an old shared.js
const p2=await b.newPage();
await p2.route('**/shared.js*',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(DIR,'shared.js'),'utf8').replace("APP_VERSION = '6.5.2'","APP_VERSION = '5.7.0'")}));
await p2.goto('file://'+path.join(DIR,'t_app.html'));await p2.waitForTimeout(500);
console.log('guard banner:',await p2.isVisible('text=ไฟล์ shared.js ไม่ตรงเวอร์ชัน'));
await b.close();})();
