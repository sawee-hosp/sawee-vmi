const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'a1'},collections:{
  master_drugs:{'02110':{drug_id:'02110',drug_name:'Paracetamol 500',unit_id:'U1',type:'1',price:260,pack_size:1000}},master_unit:{U1:{unit_id:'U1',unit_name:'TAB'}},master_depts:{},config:{},
  master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ',invs_dept_id:'13'}},
  config_par:{p1:{hospital_id:'H1',drug_id:'02110',par_qty:3000}},
  vmi_virtual_lots:{L1:{hospital_id:'H1',drug_id:'02110',lot_no:'A',expiry:'20290101',remaining_qty:4000,created_at:'2026-01-01T00:00:00Z'}},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  const calls=[];
  await p.route('http://127.0.0.1/**',async r=>{const body=JSON.parse(r.request().postData()||'{}');calls.push(body);
    const drugs=[{drug_id:'02110',invs_on_hand:5600,target_qty:body.targets[0].target_qty,cut_qty:5600-body.targets[0].target_qty,status:'cut',lots:[{lot_no:'25123042',expiry:'20290728',qty:1000,lot_qty:1000}]}];
    r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,action:body.action,stock_id:'13',stock_name:'รพ.สต.ทุ่งระยะ',patient_dept_id:'PT01',live_send_enabled:true,drugs,untracked:[{drug_id:'999',invs_on_hand:5}],warnings:[],errors:[],item_count:1,total_value:10,sub_po_no:body.action==='substock_send'?'6910230099':undefined})});});
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1800);
  await p.click('text=คลังย่อย รพ.สต. → INVS'); await p.waitForTimeout(300);
  await p.selectOption('#substock-hosp','H1'); await p.waitForTimeout(800); await p.click('text=ปรับให้เท่ายอดจริง'); await p.waitForTimeout(300);
  const v=await p.inputValue('#substock-table tbody input[type=number]');
  check('web target = Target Stock 3000', v==='3000', v);
  await p.click('#substock-check'); await p.waitForTimeout(500);
  check('preflight sent targets', calls[0]&&calls[0].action==='substock_preflight'&&calls[0].targets[0].target_qty===3000);
  const t=await p.innerText('#substock-table'); check('cut shown', t.includes('25123042'), t.slice(0,200));
  await p.click('#substock-send'); await p.waitForTimeout(200); await p.click('.fixed button:has-text("สร้างเอกสาร")'); await p.waitForTimeout(900);
  check('send ok', calls[1]&&calls[1].action==='substock_send'&&!!calls[1].batch_id && await p.isVisible('#substock-result'));
  const st=await p.evaluate(()=>[...(window.__STORE.invs_substock_posts||new Map()).values()]);
  check('history saved', st.length===1&&st[0].sub_po_no==='6910230099');
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
