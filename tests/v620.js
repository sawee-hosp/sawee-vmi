// v6.20: แก้ใบห้องยา → ดึง lot INVS ล่าสุดอัตโนมัติ (คลังเพิ่มหลังบันทึก ปรับเบิกจริงได้) · ยาไม่มียอดใช้ก็แสดงคงคลัง · ใบพิมพ์ห้องยา: ยอดใช้ปัดขึ้น · ราคา 2 ตำแหน่ง · คงเหลือคลัง + Lot ที่จ่าย [จำนวน] · คอลัมน์ตายตัว
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const NOW=new Date('2026-11-05T10:00:00');
const IT=(id,name,usage,disp,extra)=>Object.assign({drugId:id,name,unit:'เม็ด',packSize:1,price:10,type:'1',usage,onHand:0,targetQty:disp,requestQty:disp,dispenseQty:disp,source:'usage'},extra||{});
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'ph1'},collections:{
  master_drugs:{D003:{drug_id:'D003',drug_name:'Ibuprofen 400 mg tab',unit_id:'U1',pack_size:1,price:10,type:'1',hosxp_code:'1000003'},D001:{drug_id:'D001',drug_name:'Paracetamol 500 mg tab',unit_id:'U1',pack_size:1,price:1,type:'1',hosxp_code:'1000001'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'เม็ด'}},config:{},master_hospitals:{},
  master_depts:{PHARM:{dept_id:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',cover_days:30,active:true}},
  users:{ph1:{name:'ภก',role:'pharmacy',dept_id:'PHARM',email:'p@x'}},internal_stock:{},req_rounds:{},
  internal_requisitions:{PR1:{deptId:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',status:'Pending',doc_no:'mr-691026-0926',period_from:'2026-10-01',period_to:'2026-10-30',created_at:'2026-11-04T01:00:00Z',submitted_at:'2026-11-04T01:00:00Z',
    items:[IT('D003','Ibuprofen 400 mg tab',37.0555556,100,{lotStockAfter:0,lotPlan:[{lot_no:'A',expiry:'20270101',qty:100,remain:0}]}),IT('D001','Paracetamol 500 mg tab',0,0,{source:'history'})],total_value:1000}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1700,height:900}})).newPage(); await p.clock.install({time:NOW}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  const calls=[]; await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); calls.push(body.action);
    const data=body.action==='invs_lots'?{ok:true,lots:{D003:[{lot_no:'A',expiry:'20270101',qty:100},{lot_no:'N',expiry:'20280101',qty:150}],D001:[{lot_no:'P1',expiry:'20280101',qty:500}]}}:{ok:true};
    await r.fulfill({contentType:'application/json',body:JSON.stringify(data)}); });
  await p.goto('file://'+path.join(DIR,'t_internal.html')); await p.waitForSelector('text=ใบเบิกของฉัน'); await p.waitForTimeout(500);
  await p.click('text=mr-691026-0926'); await p.waitForTimeout(500);
  await p.click('button:has-text("แก้ไขใบเบิก")'); await p.waitForTimeout(1500);
  check('edit: auto fetch invs_lots on open', calls.includes('invs_lots'), JSON.stringify(calls));
  const inp=p.locator('input[aria-label="เบิกจริง Ibuprofen 400 mg tab"]');
  await inp.fill('150'); await inp.press('Enter'); await inp.blur(); await p.waitForTimeout(300);
  const row=(await p.locator('tr',{hasText:'Ibuprofen 400 mg tab'}).first().innerText()).replace(/\s+/g,' ');
  check('edit: new stock 250 → 150 allowed · เหลือรวม 100 · 1 lot', (await inp.inputValue())==='150' && /เหลือรวม 100 · 1 lot \/ คลัง 250/.test(row) && /A [^[]*\[100\][^]*N [^[]*\[50\]/.test(row), (await inp.inputValue())+' · '+row);
  await inp.fill('300'); await inp.press('Enter'); await inp.blur(); await p.waitForTimeout(300);
  check('edit: still capped at 250', (await inp.inputValue())==='250');
  const para=(await p.locator('tr',{hasText:'Paracetamol 500 mg tab'}).first().innerText()).replace(/\s+/g,' ');
  check('no-usage row shows stock (คลัง 500 · 1 lot)', /คลัง 500 · 1 lot/.test(para), para);
  check('refresh button shows time', /คงคลัง lot INVS ล่าสุด ?\(10:0\d\)/.test(await p.innerText('#lots-refresh')));
  // ใบพิมพ์ห้องยา
  const html=await p.evaluate(()=>buildInternalReqFormHtml({ req:{kind:'pharmacy',dept_name:'ห้องยา OPD',items:[{drugId:'D003',name:'Ibuprofen 400 mg tab',unit:'เม็ด',packSize:1,price:10.123456,type:'1',usage:37.0555556,onHand:12.4,targetQty:50,dispenseQty:50,requestQty:50,lotStockAfter:200,lotPlan:[{lot_no:'26123035',expiry:'20270101',qty:40},{lot_no:'48NVSFSD',expiry:'20280101',qty:10}]}]}, formNo:'1/2570', formDate:'2026-11-05', deptName:'ห้องยา OPD' }));
  check('print: usage ceil 38 · onHand 12 · price 10.12', html.includes('<td class="c">38</td>') && html.includes('<td class="c blue">12</td>') && html.includes('<td class="r">10.12</td>'));
  check('print: คงเหลือคลัง + Lot ที่จ่าย columns', html.includes('คงเหลือ<br>คลัง') && html.includes('Lot ที่จ่าย [จำนวน]') && html.includes('<td class="c b">200</td><td class="lotcell"><span class="lp">26123035 [40]</span> <span class="lp">48NVSFSD [10]</span></td>'));
  check('print: fixed layout widths', html.includes('class="items ph"') && html.includes('table-layout:fixed') && html.includes('Roboto+Condensed'));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
