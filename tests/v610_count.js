const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const lot=(id,lotno,exp,q)=>({hospital_id:'H1',drug_id:'D1',lot_no:lotno,expiry:exp,remaining_qty:q,initial_qty:q,active:true,source_type:'INVS_RECEIPT',created_at:'2026-0'+id+'-01T00:00:00Z'});
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'h1'},collections:{
  master_drugs:{D1:{drug_id:'D1',drug_name:'Paracetamol 500',unit_id:'U1',type:'1',price:260,pack_size:1000,old_code:'013',invs_location:'7/1'}},master_unit:{U1:{unit_id:'U1',unit_name:'TAB'}},master_depts:{},config:{},
  master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ'}},
  config_par:{p1:{hospital_id:'H1',drug_id:'D1',par_qty:3000}},
  vmi_stock_meta:{H1:{hospital_id:'H1',initialized:true}},
  vmi_virtual_lots:{L1:lot(1,'OLD','20261201',2000),L2:lot(2,'NEW','20280101',1000)},
  requisitions:{R1:{hospitalId:'H1',status:'Completed',month:10,year:2026,items:[{drugId:'D1',name:'Paracetamol 500',usage:1500,importedUsageQty:1400,dispenseQty:2000,packSize:1000}],created_at:'2026-09-25T00:00:00Z'}},
  users:{h1:{name:'จนท',role:'hospital',hospital_id:'H1',email:'h@x',line_user_id:'x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1800);
  await p.click('text=คลังยาของฉัน'); await p.waitForTimeout(1200);
  await p.click('#stock-tab-count'); await p.waitForTimeout(400);
  const t=await p.innerText('#count-table'); check('count table shows system 3000', t.includes('Paracetamol')&&t.includes('3'), t.slice(0,200));
  await p.click('#print-count-sheet'); await p.waitForTimeout(400);
  const html=await p.evaluate(()=>{const f=document.querySelector('iframe[aria-hidden]');return f?f.contentWindow.document.documentElement.outerHTML:''});
  fs.writeFileSync(path.join(DIR,'count.html'),html);
  check('sheet has columns', html.includes('ตรวจนับได้')&&html.includes('D1(013)')&&html.includes('ใบตรวจนับ'));
  await p.waitForTimeout(1600);
  await p.fill('#count-table tbody input[type=number]','2500'); await p.waitForTimeout(100);
  await p.click('#save-count'); await p.waitForTimeout(200); await p.click('.fixed button:has-text("บันทึก")'); await p.waitForTimeout(1500);
  const st=await p.evaluate(()=>({l:['L1','L2'].map(k=>window.__STORE.vmi_virtual_lots.get(k).remaining_qty),c:[...(window.__STORE.vmi_stock_counts||new Map()).values()]}));
  check('FEFO adjust OLD 1500 NEW 1000', JSON.stringify(st.l)==='[1500,1000]', JSON.stringify(st.l));
  check('count doc saved', st.c.length===1&&st.c[0].items[0].counted===2500&&st.c[0].items[0].system_qty===3000);
  check('history visible', await p.isVisible('#count-history'));
  // usage history
  await p.click('text=ยาคงเหลือ'); await p.waitForTimeout(300);
  await p.click('#stock-view-mode button >> nth=0'); await p.waitForTimeout(200);
  await p.click('text=Paracetamol 500 >> nth=0'); await p.waitForTimeout(500);
  const u=await p.innerText('#usage-history').catch(()=>''); check('usage history uses rb301 1400', u.includes('1(400)')||u.includes('1,400'), u.slice(0,300));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
