// v6.25: ใบพิมพ์ห้องยา — รีเฟรชคงคลัง lot INVS ก่อนพิมพ์ (จำนวนเบิกคงเดิม) · ไม่ใส่ Lot/คงเหลือคลัง · ยาที่ไม่เบิกแสดง "-"
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const IT=(id,name,usage,disp,extra)=>Object.assign({drugId:id,name,unit:'เม็ด',packSize:1,price:10,type:'1',usage,onHand:5,targetQty:disp,requestQty:disp,dispenseQty:disp,source:'usage'},extra||{});
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'ph1'},collections:{
  master_drugs:{D003:{drug_id:'D003',drug_name:'Ibuprofen 400 mg tab',unit_id:'U1',pack_size:1,price:10,type:'1'},D001:{drug_id:'D001',drug_name:'Paracetamol 500 mg tab',unit_id:'U1',pack_size:1,price:1,type:'1'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'เม็ด'}},config:{},master_hospitals:{},
  master_depts:{PHARM:{dept_id:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',cover_days:30,active:true}},
  users:{ph1:{name:'ภก',role:'pharmacy',dept_id:'PHARM',email:'p@x'}},internal_stock:{},req_rounds:{},
  internal_requisitions:{PR1:{deptId:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',status:'Pending',doc_no:'mr-691110-01',form_no:'3/2570',period_from:'2026-10-01',period_to:'2026-10-30',created_at:'2026-11-09T01:00:00Z',submitted_at:'2026-11-09T01:00:00Z',
    items:[IT('D003','Ibuprofen 400 mg tab',37,100,{lotStockAfter:0,lotPlan:[{lot_no:'OLD',expiry:'20270101',qty:100,remain:0}]}),IT('D001','Paracetamol 500 mg tab',12,0,{targetQty:0})],total_value:1000}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1500,height:900}})).newPage(); await p.clock.install({time:new Date('2026-11-10T10:00:00')}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  const calls=[]; await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); calls.push(body);
    await r.fulfill({contentType:'application/json',body:JSON.stringify(body.action==='invs_lots'?{ok:true,lots:{D003:[{lot_no:'NEW1',expiry:'20270101',qty:60},{lot_no:'NEW2',expiry:'20280101',qty:240}]}}:{ok:true})}); });
  await p.goto('file://'+path.join(DIR,'t_internal.html')); await p.waitForSelector('text=ใบเบิกของฉัน'); await p.waitForTimeout(400);
  await p.evaluate(()=>{ window.print=()=>{}; });
  const ifr=()=>p.evaluate(()=>{ const f=[...document.querySelectorAll('iframe')].pop(); try{ return f?f.contentWindow.document.documentElement.outerHTML:''; }catch(e){ return ''; } });
  await p.click('text=mr-691110-01'); await p.waitForTimeout(400); await p.click('#req-print-main'); await p.waitForTimeout(300);
  check('pharmacy print modal has lot controls', await p.isVisible('#print-lots-box'));
  await p.click('#print-lots-refresh'); await p.waitForTimeout(600);
  const call=calls.find(c=>c.action==='invs_lots');
  check('refresh: invs_lots only for dispensed drugs', call && JSON.stringify(call.drug_ids)==='["D003"]', JSON.stringify(call&&call.drug_ids));
  await p.click('#form-print-go'); await p.waitForTimeout(1200);
  let html=await ifr();
  check('print: fresh lots (NEW1 60 + NEW2 40) · คงเหลือคลัง 200 · qty 100 unchanged', html.includes('<span class="lp">NEW1 [60]</span> <span class="lp">NEW2 [40]</span>') && html.includes('<td class="c b">200</td>') && !html.includes('OLD') && /<td class="c b">100<\/td>/.test(html), html.length+'');
  const h2=await p.evaluate(()=>buildInternalReqFormHtml({ req:{kind:'pharmacy',dept_name:'ห้องยา',items:[{drugId:'D001',name:'Paracetamol 500 mg tab',unit:'เม็ด',packSize:1,price:1,type:'1',usage:12,onHand:5,targetQty:0,requestQty:0,dispenseQty:0,source:'usage'}]}, formNo:'1', formDate:'2026-11-10', includeUsed:true }));
  check('not dispensed row: "-" for target/qty/value', /<td class="c tgt">-<\/td><td class="c b">-<\/td><td class="r">1\.00<\/td><td class="r b">-<\/td>/.test(h2));
  const saved=await p.evaluate(()=>window.__STORE.internal_requisitions.get('PR1').items[0].lotPlan[0].lot_no);
  check('refresh does not change saved req', saved==='OLD', saved);
  await p.click('text=ใบเบิกของฉัน'); await p.waitForTimeout(300); await p.click('text=mr-691110-01'); await p.waitForTimeout(400); await p.click('#req-print-main'); await p.waitForTimeout(300);
  await p.check('#print-no-lots'); await p.click('#form-print-go'); await p.waitForTimeout(1200);
  html=await ifr();
  check('no-lots: qty kept, lot/stock blank', /<td class="c b">100<\/td>/.test(html) && !html.includes('class="lp"') && html.includes('<td class="c b"></td><td class="lotcell"></td>'));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
