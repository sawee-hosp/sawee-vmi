// v6.7.0: คืนยารายล็อต + รายการเพิ่มเอง + ใบคืนแบบฟอร์มทางการ (ต้องรัน build.js ก่อน)
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const ymd=(n)=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');};
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'h1'},collections:{
  master_drugs:{D1:{drug_id:'D1',drug_name:'Para',unit_id:'U1',pack_size:100,price:50,type:'1'},D2:{drug_id:'D2',drug_name:'Amox',unit_id:'U1',pack_size:1,price:2,type:'1'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'เม็ด'}},master_depts:{},config:{},
  master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ'}},
  users:{h1:{name:'จนท',role:'hospital',hospital_id:'H1',email:'h@x',position:'นักวิชาการ'}},
  vmi_virtual_lots:{L1:{hospital_id:'H1',drug_id:'D1',lot_no:'A100',expiry:ymd(20),remaining_qty:300},L2:{hospital_id:'H1',drug_id:'D1',lot_no:'A200',expiry:ymd(400),remaining_qty:500}},
  current_excess:{H1_D1:{hospital_id:'H1',drug_id:'D1',excess_balance:800}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:1500,height:900}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
  await p.evaluate(()=>{ window.__printed=null; window.print=()=>{}; });
  await p.addInitScript(()=>{});
  // navigate
  const nav=await p.$("button:has-text(\"คลังยา\")"); if(nav){await nav.click(); await p.waitForTimeout(500);}
  const rb=await p.$("button:has-text(\"ตรวจนับ\")"); await rb.click(); await p.waitForTimeout(800);
  const t=await p.innerText('body');
  check('lots listed with expiry badge', t.includes('A100') && t.includes('A200') && t.includes('อีก 20 วัน'), '');
  await p.click('#ret-exp-30'); await p.waitForTimeout(200);
  check('filter ≤30 shows Para', (await p.innerText('table')).includes('Para'));
  await p.click('#ret-exp-all');
  await p.fill('input[placeholder="ยอดมีจริง"]','600'); await p.waitForTimeout(200);
  const qtys=await p.$$eval('input[placeholder="0"]',x=>x.map(i=>i.value));
  check('actual 600 → return 200 from nearest lot', qtys[0]==='200' && (qtys[1]===''||qtys[1]==='0'), qtys.join(','));
  await p.fill('#ret-add-search','D2'); await p.click('#ret-add-btn'); await p.waitForTimeout(200);
  await p.fill('input[placeholder="เลข Lot"]','X9'); await p.locator('table').last().locator('input[type=number]').fill('30');
  await p.evaluate(()=>{ window.printHtmlDocument=async(x)=>{ window.__h=x; }; });
  await p.click('#ret-submit'); await p.waitForTimeout(1500);
  const html=await p.evaluate(()=>buildReturnFormHtml([...window.__STORE.stock_returns.values()][0]));
  await p.waitForTimeout(800);
  const st=await p.evaluate(()=>({ret:[...window.__STORE.stock_returns.values()][0], l1:window.__STORE.vmi_virtual_lots.get('L1').remaining_qty, l2:window.__STORE.vmi_virtual_lots.get('L2').remaining_qty, ex:window.__STORE.current_excess.get('H1_D1').excess_balance}));
  check('lot L1 cut 200, L2 untouched', st.l1===100 && st.l2===500, st.l1+'/'+st.l2);
  check('credit updated 600', st.ex===600, String(st.ex));
  check('return doc has lot + manual rows', st.ret && st.ret.items.length===2 && st.ret.items[1].manual===true && st.ret.items[0].lotNo==='A100', JSON.stringify(st.ret&&st.ret.items.map(i=>[i.drugId,i.lotNo,i.returnQty,i.manual])));
  check('form html official', typeof html==='string' && html.includes('ใบส่งคืนยา/เวชภัณฑ์') && html.includes('A100') && html.includes('X9') && html.includes('หัวหน้าคลังยา'));
  fs.writeFileSync(path.join(DIR,'ret.html'), html||''); const q=await b.newPage({viewport:{width:900,height:1100}}); await q.setContent(html); await q.waitForTimeout(500); await q.screenshot({path:path.join(DIR,'ret.png'),fullPage:true});
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
