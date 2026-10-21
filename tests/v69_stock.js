const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const lot=(id,lotno,exp,q,extra)=>Object.assign({hospital_id:'H1',drug_id:'D1',lot_no:lotno,expiry:exp,remaining_qty:q,initial_qty:q,active:true,source_type:'INVS_RECEIPT',invs_sub_po_no:'SPO'+id,created_at:'2026-0'+id+'-01T00:00:00Z'},extra||{});
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'h1'},collections:{
  master_drugs:{D1:{drug_id:'D1',drug_name:'Paracetamol',unit_id:'U1',type:'1',price:1,pack_size:1}},master_unit:{U1:{unit_id:'U1',unit_name:'TAB'}},master_depts:{},config:{},
  master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ'}},
  config_par:{p1:{hospital_id:'H1',drug_id:'D1',par_qty:100}},
  vmi_stock_meta:{H1:{hospital_id:'H1',initialized:true}},
  vmi_virtual_lots:{L1:lot(1,'OLD','20251201',80),L2:lot(2,'MID','20270101',60),L3:lot(3,'NEW','20280101',50)},
  users:{h1:{name:'จนท',role:'hospital',hospital_id:'H1',email:'h@x',line_user_id:'x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
  await p.click('text=คลังยาของฉัน'); await p.waitForTimeout(1200);
  await p.click('#stock-mode-table'); await p.waitForTimeout(400);
  const t=await p.innerText('#stock-table-view');
  check('table shows only remaining lots (trimmed to target 100)', t.includes('NEW')===false? false : true, '');
  const vals=await p.$$eval('#stock-table-view tbody input[type=number]',els=>els.map(e=>e.value));
  check('FEFO trim: MID 50 NEW 50', JSON.stringify(vals)==='["50","50"]', JSON.stringify(vals));
  check('bill shown', t.includes('INVS SPO2'), t.slice(0,400));
  await p.click('text=หมดอายุแล้ว'); await p.waitForTimeout(200);
  check('expired filter empty', (await p.innerText('#stock-table-view')).includes('ไม่มีรายการตามตัวกรอง'));
  await p.click('text=ทั้งหมด'); await p.waitForTimeout(200);
  const inp=(await p.$$('#stock-table-view tbody input[type=number]'))[1]; await inp.fill('40'); await p.waitForTimeout(100);
  await p.click('#stock-table-view button:has-text("บันทึก")'); await p.waitForTimeout(800);
  const st=await p.evaluate(()=>{const m=window.__STORE.vmi_virtual_lots;return ['L1','L2','L3'].map(k=>m.get(k).remaining_qty+':'+(m.get(k).manual_adjusted_by_uid||''))});
  check('save persisted edited + sibling assumed', JSON.stringify(st)==='["0:h1","50:h1","40:h1"]'||JSON.stringify(st)==='["0:h1","50:h1","40:h1"]', JSON.stringify(st));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
