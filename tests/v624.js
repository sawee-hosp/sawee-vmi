// v6.24: ยาคลังพิเศษ (ไม่เบิก) ไม่มียอดใช้ ก็ยังอยู่ในตาราง กลับเป็นเบิกปกติได้
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'ph1'},collections:{
  master_drugs:{P3:{drug_id:'P3',drug_name:'Methadone syrup (คลังพิเศษ)',unit_id:'U1',type:'1',price:10,pack_size:1,hosxp_code:'1000003',pharm_req_mode:'exclude'},D001:{drug_id:'D001',drug_name:'Paracetamol 500 mg tab',unit_id:'U1',type:'1',price:250,pack_size:1000,hosxp_code:'1000001'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'เม็ด'}},config:{},master_hospitals:{},
  master_depts:{PHARM:{dept_id:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',cover_days:30,active:true}},
  users:{ph1:{name:'ภก',role:'pharmacy',dept_id:'PHARM',email:'p@x'}},internal_stock:{},internal_requisitions:{},req_rounds:{}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage(); await p.clock.install({time:new Date('2026-11-10T10:00:00')}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); let data={ok:true}; if(body.action==='hosxp_usage') data={ok:true,days:30,count:1,rows:[{icode:'1000001',opd_qty:3000,ipd_qty:0}]}; await r.fulfill({contentType:'application/json',body:JSON.stringify(data)}); });
  await p.goto('file://'+path.join(DIR,'t_internal.html')); await p.waitForSelector('text=ใบเบิกของฉัน');
  await p.click('button:has-text("สร้างใบเบิก")'); await p.click('button:has-text("สร้างใบเบิกต่อ")'); await p.waitForSelector('text=สร้างใบเบิกห้องยา');
  await p.fill('#usage-from','2026-10-01').catch(()=>{}); await p.fill('#usage-to','2026-10-30'); await p.click('button:has-text("ดึงยอดใช้จาก HOSxP")'); await p.waitForSelector('text=Paracetamol 500 mg tab'); await p.waitForTimeout(600);
  check('excluded drug without usage: checkbox visible', await p.isVisible('#ph-show-excluded'));
  await p.check('#ph-show-excluded'); await p.waitForTimeout(200);
  await p.selectOption('select[aria-label="โหมดเบิก Methadone syrup (คลังพิเศษ)"]','normal'); await p.waitForTimeout(600);
  const mode=await p.evaluate(()=>window.__STORE.master_drugs.get('P3').pharm_req_mode);
  check('switch back to normal → master_drugs cleared', !mode, JSON.stringify(mode));
  const rowTxt=(await p.locator('tr',{hasText:'Methadone syrup'}).first().innerText().catch(()=>'')).replace(/\s+/g,' ');
  check('now back in table as normal', rowTxt.length>0 && !rowTxt.includes('คลังพิเศษ (ไม่เบิกห้องยา)'), rowTxt.slice(0,160));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
