const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'h1'},collections:{
  master_drugs:{D1:{drug_id:'D1',drug_name:'Paracetamol 500',unit_id:'U1',type:'1',price:0.5,pack_size:1000,status:'Active'},D2:{drug_id:'D2',drug_name:'Amoxicillin',unit_id:'U1',type:'1',price:2,pack_size:100,status:'Active'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'TAB'}},master_depts:{},config:{},
  master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ'}},
  config_par:{p1:{hospital_id:'H1',drug_id:'D1',par_qty:3000},p2:{hospital_id:'H1',drug_id:'D2',par_qty:500}},
  current_excess:{e1:{hospital_id:'H1',drug_id:'D1',excess_balance:1000},e2:{hospital_id:'H1',drug_id:'D2',excess_balance:200}},
  users:{h1:{name:'จนท ทุ่งระยะ',role:'hospital',hospital_id:'H1',email:'h@x',line_user_id:'x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1800);
  await p.click('text=เบิกยาฉุกเฉิน (ใบ ฉ)'); await p.waitForTimeout(500);
  await p.click('#em-new'); await p.waitForTimeout(200);
  check('ng without items', await p.isVisible('#em-status-ng'));
  await p.fill('#em-search','Para'); await p.waitForTimeout(200); await p.click('#emergency-view button:has-text("Paracetamol")');
  await p.fill('#em-form tbody input[type=number]','5000'); await p.fill('#em-reason','ยาหมดก่อนรอบ'); await p.waitForTimeout(200);
  check('over target = warning but ok', await p.isVisible('#em-status-ok') && (await p.innerText('#em-warn')).includes('เกิน Target'));
  await p.fill('#em-reason',''); await p.waitForTimeout(100);
  check('no reason -> disabled', await p.isDisabled('#em-save')); await p.fill('#em-reason','ยาหมดก่อนรอบ');
  await p.fill('#em-form tbody input[type=number]','1000'); await p.waitForTimeout(200);
  check('ok green', await p.isVisible('#em-status-ok'));
  await p.click('#em-save'); await p.waitForTimeout(1200);
  const em=await p.evaluate(()=>[...window.__STORE.rpst_emergency.values()]);
  check('saved', em.length===1 && em[0].status==='Approved' && em[0].items[0].qty===1000);
  const html=await p.evaluate(()=>{const f=document.querySelector('iframe[aria-hidden]');return f?f.contentWindow.document.body.innerText:''});
  check('print form green + note', html.includes('สามารถรับยาได้เลย') && html.includes('ไม่ต้องเบิกรายการนี้ซ้ำ') && html.includes('ยาหมดก่อนรอบ'), html.slice(0,200));
  // create main requisition
  await p.click('text=เบิกยา / เติมยา'); await p.waitForTimeout(1500);
  const body=await p.innerText('body');
  fs.writeFileSync(path.join(DIR,'em_body.txt'),body);
  check('red plus shown', /\+ 1 \(0\)|\+ 1\b|\+ 1,000|\+ 1 /.test(body) || body.includes('+ 1'), '');
  check('note shown', await p.isVisible('#em-note-create'));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
