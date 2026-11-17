// v6.29: สำรวจคงคลัง คลังยาใหญ่ — เลือกประเภท · เรียง ตำแหน่ง/ชื่อ/รหัส · slip 80 มม. คงเหลือ + lot
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'a1'},collections:{
  master_drugs:{A1:{drug_id:'A1',drug_name:'Zinc tab',unit_id:'U1',type:'1',price:1,pack_size:100,invs_location:'7/1',old_code:'259'},
    B2:{drug_id:'B2',drug_name:'Amoxicillin',unit_id:'U1',type:'1',price:1,pack_size:1,invs_location:'12/1'},
    C3:{drug_id:'C3',drug_name:'Gauze',unit_id:'U1',type:'32',price:1,pack_size:10,invs_location:'A01'},
    D4:{drug_id:'D4',drug_name:'Empty drug',unit_id:'U1',type:'1',price:1,pack_size:1}},
  master_unit:{U1:{unit_id:'U1',unit_name:'ชิ้น'}},config:{},master_hospitals:{},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('http://127.0.0.1/**', r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,lots:{A1:[{lot_no:'L1',expiry:'20270101',qty:250},{lot_no:'L2',expiry:'20280101',qty:100}],B2:[{lot_no:'M1',expiry:'20270601',qty:30}],C3:[{lot_no:'G1',expiry:'20270501',qty:45}]}})}));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
  await p.evaluate(()=>{ window.print=()=>{}; });
  await p.click('button:has-text("สำรวจคงคลัง")'); await p.waitForSelector('#stock-survey');
  await p.click('#survey-fetch'); await p.waitForSelector('#survey-table');
  const ids=async()=>p.evaluate(()=>[...document.querySelectorAll('.survey-row')].map(r=>r.dataset.id).join(','));
  check('loc order (7/1, 12/1, A01) · zero hidden', await ids()==='A1,B2,C3', await ids());
  await p.click('#survey-sort-name'); check('name order', await ids()==='B2,C3,A1', await ids());
  await p.click('#survey-sort-code'); check('code order', await ids()==='A1,B2,C3', await ids());
  await p.click('#survey-zero'); check('include zero', (await ids()).includes('D4'));
  await p.click('#survey-zero');
  await p.click('.survey-type[data-type="32"]'); check('type filter hides 32', await ids()==='A1,B2', await ids());
  await p.click('#survey-sort-loc'); await p.click('#survey-print'); await p.waitForTimeout(800);
  const h=await p.evaluate(()=>{ const f=[...document.querySelectorAll('iframe')].pop(); try{ return f?f.contentWindow.document.documentElement.outerHTML:''; }catch(e){ return ''; } });
  check('slip: 80mm, total + all lots + count blanks', h.includes('@page{size:80mm') && h.includes('ใบสำรวจคงคลัง') && h.includes('คงเหลือ <b>3(50)</b>') && h.includes('<b>L1</b>') && h.includes('<b>L2</b>') && h.includes('นับได้') && !h.includes('Gauze') && h.includes('259'), h.length+'');
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
