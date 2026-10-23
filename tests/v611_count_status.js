const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const ym=new Date().toISOString().slice(0,7);
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'a1'},collections:{
  master_drugs:{D1:{drug_id:'D1',drug_name:'Paracetamol 500',unit_id:'U1',type:'1',price:260,pack_size:1000}},master_unit:{U1:{unit_id:'U1',unit_name:'TAB'}},master_depts:{},config:{},
  master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ'},H2:{hospital_id:'H2',hospital_name:'รพ.สต.ครน'}},
  vmi_stock_counts:{C1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ',count_date:ym+'-02',counted_by_name:'จนท',items:[{drug_id:'D1',name:'Paracetamol 500',unit:'TAB',pack_size:1000,price:260,system_qty:3000,counted:1000,diff:-2000}]}},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1800);
  await p.click('text=สถานะตรวจนับ รพ.สต.'); await p.waitForTimeout(700);
  const t=await p.innerText('#count-status-table'); check('status table', t.includes('ส่วนต่างสูง')&&t.includes('520.00')&&t.includes('ยังไม่เคยนับ'), t.slice(0,300));
  check('not counted = 1', (await p.innerText('#count-not-yet')).trim()==='1');
  await p.click('text=จับคู่ยา NCDs'); await p.waitForTimeout(1500);
  check('ncds view renders', await p.isVisible('#ncds-mapping-view'));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
