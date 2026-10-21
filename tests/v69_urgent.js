const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'u1'},collections:{
  master_drugs:{D1:{drug_id:'D1',drug_name:'Syringe Disposable 5 ml',unit_id:'U1',type:'2',price:100,pack_size:100,old_code:'013'},D2:{drug_id:'D2',drug_name:'Tube Hematocrit',unit_id:'U1',type:'2',price:50,pack_size:1}},
  master_unit:{U1:{unit_id:'U1',unit_name:'ชิ้น'}},config:{},master_hospitals:{},
  master_depts:{IPD:{dept_id:'IPD',dept_name:'IPD ตบ.',kind:'dept'}},
  req_rounds:{R1:{id:'R1',round_no:3,round_date:'2026-11-02',fiscal_year:2570,scope:'internal'}},
  users:{u1:{name:'เสาวลักษณ์',role:'dept',dept_id:'IPD',email:'u@x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_internal.html')); await p.waitForTimeout(1500);
  await p.click('text=เบิกยาด่วน'); await p.waitForTimeout(300);
  await p.click('#urgent-new'); await p.waitForTimeout(300);
  const opts=await p.$$eval('#urgent-round option',o=>o.map(x=>x.textContent));
  check('round offered', opts.some(t=>t.includes('รอบที่ 3')), opts.join('|'));
  await p.fill('input[aria-label="ค้นหายา"]','Syringe'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  await p.fill('#uq-D1','10'); await p.waitForTimeout(100);
  await p.evaluate(()=>{window.__printed=null; window.printHtmlDocument=h=>{window.__printed=h;return Promise.resolve();}});
  await p.click('button:has-text("บันทึก")>>nth=0'); await p.waitForTimeout(800);
  const st=await p.evaluate(()=>[...(window.__STORE.internal_urgent||new Map()).values()]);
  check('urgent saved', st.length===1 && st[0].round_id==='R1' && st[0].items[0].requestQty===1000, JSON.stringify(st[0]&&st[0].items));
  check('listed', (await p.innerText('#urgent-list')).includes('รอรวมเข้าใบเบิกรอบ'));
  // create real requisition for round
  await p.click('text=สร้างใบเบิก>>nth=0'); await p.waitForTimeout(400);
  await p.click('button:has-text("เริ่มกรอกใบเบิก")'); await p.waitForTimeout(500);
  check('merge banner', await p.isVisible('#urgent-merge-banner'));
  const body=await p.innerText('body');
  check('item merged with note', body.includes('รวมเบิกด่วน 1,000')||body.includes('รวมเบิกด่วน 1000'), '');
  await p.click('button:has-text("ส่งใบเบิก")'); await p.waitForTimeout(300);
  await p.click('.fixed button:has-text("ส่งใบเบิก")'); await p.waitForTimeout(900);
  const after=await p.evaluate(()=>({u:[...window.__STORE.internal_urgent.values()][0],r:[...window.__STORE.internal_requisitions.values()][0]}));
  check('urgent merged', after.u.status==='Merged' && after.u.merged_req_id===after.r.id, after.u.status);
  check('req qty includes urgent', after.r && after.r.items.find(i=>i.drugId==='D1').requestQty===1000);
  // print box in history modal
  await p.click('text=ใบเบิกของฉัน'); await p.waitForTimeout(300);
  await p.click('tbody tr>>nth=0'); await p.waitForTimeout(300);
  check('print box', await p.isVisible('#req-print-main'));
  await p.click('#req-print-main'); await p.waitForTimeout(300);
  check('date locked for requester', await p.isDisabled('#form-date'));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
