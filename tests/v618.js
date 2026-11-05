// v6.18: วางแผนจัดยาก่อนส่ง INVS (หักเอกสาร INVS ค้างยืนยัน + ยอดจองใบอื่นที่พิมพ์ slip แล้ว) · slip กระชับ · วันที่เบิก INVS = วันที่รอบ (ใบภายใน) · กระดานจัดสรรยา
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const NOW=new Date('2026-11-05T10:00:00');
const it=(id,name,pack,qty,extra)=>Object.assign({drugId:id,name,unit:'ชิ้น',packSize:pack,price:100,type:'2',requestQty:qty,dispenseQty:qty},extra||{});
const base={
  master_drugs:{D1:{drug_id:'D1',drug_name:'Syringe 5 ml',unit_id:'U1',type:'2',price:100,pack_size:100,invs_location:'12/1/1',old_code:'051'},D2:{drug_id:'D2',drug_name:'NSS 1000 ml',unit_id:'U1',type:'2',price:250,pack_size:10,invs_location:'7/1/2-1'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'ชิ้น'}},config:{},master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ',invs_dept_id:'R01'}},
  master_depts:{WA:{dept_id:'WA',dept_name:'ตึกหญิง',kind:'dept',active:true},WB:{dept_id:'WB',dept_name:'ตึกชาย',kind:'dept',active:true}},
  req_rounds:{R2:{id:'R2',fiscal_year:2570,round_no:2,round_date:'2026-11-02',scope:'internal',active:true}},
  internal_requisitions:{
    IRA:{deptId:'WA',dept_name:'ตึกหญิง',kind:'dept',status:'Pending',round_id:'R2',round_no:2,round_date:'2026-11-02',form_no:'2/2570',submitted_at:'2026-11-03T01:00:00Z',items:[it('D1','Syringe 5 ml',100,300),it('D2','NSS 1000 ml',10,30,{predispQty:10})],total_value:1000},
    IRB:{deptId:'WB',dept_name:'ตึกชาย',kind:'dept',status:'Pending',round_id:'R2',round_no:2,round_date:'2026-11-02',form_no:'3/2570',submitted_at:'2026-11-03T02:00:00Z',items:[it('D1','Syringe 5 ml',100,400)],total_value:400},
    IRC:{deptId:'WB',dept_name:'ตึกชาย',kind:'dept',status:'Completed',form_no:'1/2570',submitted_at:'2026-10-03T02:00:00Z',items:[it('D1','Syringe 5 ml',100,500)],total_value:500}},
  requisitions:{R1:{hospitalId:'H1',status:'Pending',month:11,year:2026,created_at:'2026-11-01T00:00:00Z',submitted_at:'2026-11-01T00:00:00Z',items:[{drugId:'D1',name:'Syringe 5 ml',type:'2',packSize:100,dispenseQty:200}]}},
  pick_slips:{
    internal__IRB:{source:'internal',req_id:'IRB',unit_title:'ตึกชาย',state:'PLANNED',planned_at:'2026-11-05T01:00:00Z',items:[{drug_id:'D1',qty:400}]},
    internal__IRC:{source:'internal',req_id:'IRC',unit_title:'ตึกชาย',state:'PLANNED',planned_at:'2026-11-04T01:00:00Z',items:[{drug_id:'D1',qty:500}]}},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'}}};
const PROJ={D1:{on_hand:1000,pending_qty:200,pending_raw:200,pending_docs:[{sub_po_no:'P1',dept_id:'X',qty:200}],available:800,pack_ratio:100,lots:[{lot_no:'L1',expiry:'20270101',qty:300},{lot_no:'L2',expiry:'20280101',qty:500}]},
  D2:{on_hand:45,pending_qty:0,pending_raw:0,pending_docs:[],available:45,pack_ratio:10,lots:[{lot_no:'N1',expiry:'20270501',qty:45}]}};
const newPage=async(b,extra)=>{ fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'a1'},collections:Object.assign({},base,extra||{})})+';');
  const p=await (await b.newContext({viewport:{width:1500,height:900}})).newPage(); await p.clock.install({time:NOW}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  const calls=[]; await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); calls.push(body);
    const items=[{drug_id:'D1',qty:300,cost:1,value:300,vmi_pack_size:100,stock_before:1000,pending_qty:200,available:800,stock_after:500,lot_no:'L1',expiry:'20270101',alloc:[{lot_no:'L1',expiry:'20270101',qty:300}]},
      {drug_id:'D2',qty:30,cost:25,value:750,vmi_pack_size:10,stock_before:45,pending_qty:0,available:45,stock_after:15,lot_no:'N1',expiry:'20270501'}];
    const data=body.action==='stock_projection'?{ok:true,drugs:Object.fromEntries((body.drug_ids||[]).map(id=>[id,PROJ[id]]).filter(x=>x[1]))}
      : body.action==='preflight'?{ok:true,item_count:2,total_value:1050,request_date:body.request_date,items,warnings:[],errors:[],live_send_enabled:true}:{ok:true,sub_po_no:'PO20',items};
    await r.fulfill({contentType:'application/json',body:JSON.stringify(data)}); });
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500); await p.evaluate(()=>{ window.print=()=>{}; }); return {p,errs,calls}; };
const iframeHtml=(p)=>p.evaluate(()=>{ const f=[...document.querySelectorAll('iframe')].pop(); try{ return f?f.contentWindow.document.documentElement.outerHTML:''; }catch(e){ return ''; } });
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  // 1) วางแผน + พิมพ์ slip (ยังไม่ส่ง INVS) → ส่ง INVS ด้วยวันที่รอบ
  {
    const {p,errs,calls}=await newPage(b);
    await p.click('text=คิวใบเบิกภายใน รพ.'); await p.waitForTimeout(500); await p.click('tr:has-text("ตึกหญิง")'); await p.waitForTimeout(700);
    check('plan button label', (await p.innerText('#print-pick-slip')).includes('วางแผน'));
    await p.click('#print-pick-slip'); await p.waitForTimeout(1000);
    const html=await iframeHtml(p);
    check('plan: no INVS write (only stock_projection)', calls.every(c=>c.action==='stock_projection'), JSON.stringify(calls.map(c=>c.action)));
    check('plan: D1 lots after pending+reservation (L2 300) · เหลือ 1', /<b>L2<\/b> <span class="sm">EXP [^<]*<\/span><span class="lq">3<\/span>/.test(html) && !html.includes('<b>L1</b>') && /Syringe 5 ml<\/b><\/span><span class="rt">เหลือ <b>1<\/b>/.test(html), html.length+'');
    check('plan: D2 received 10 → pick 20 from N1 · เหลือ 1(5)', /รับแล้ว 1 → หยิบ <b>2<\/b>/.test(html) && /<b>N1<\/b> <span class="sm">EXP [^<]*<\/span><span class="lq">2<\/span>/.test(html) && /NSS 1000 ml<\/b><\/span><span class="rt">เหลือ <b>1\(5\)<\/b>/.test(html));
    check('slip compact: code on qty line, header says not sent', /<div class="ln"><span class="sm">D1\(051\)<\/span> เบิก/.test(html) && html.includes('ยังไม่ส่ง INVS'));
    const st=await p.evaluate(()=>{ const m=window.__STORE.pick_slips; return {a:m.get('internal__IRA')?.state, b:m.get('internal__IRB')?.state, c:m.get('internal__IRC')?.state}; });
    check('reservations: IRA PLANNED · IRB kept · IRC (Completed) closed', st.a==='PLANNED' && st.b==='PLANNED' && st.c==='CANCELLED', JSON.stringify(st));
    await p.click('button:has-text("กลับคิว")').catch(()=>{}); await p.waitForTimeout(300); await p.click('tr:has-text("ตึกหญิง")'); await p.waitForTimeout(700);
    check('badge กำลังจัด', await p.isVisible('text=กำลังจัด'));
    await p.click('button:has-text("ตรวจ INVS แล้วอนุมัติ")'); await p.waitForTimeout(1200);
    check('request date input = round date', (await p.inputValue('#iq-invs-req-date'))==='2026-11-02');
    await p.click('button:has-text("ส่งเข้า INVS และอนุมัติ")'); await p.waitForTimeout(1500);
    const pre=calls.find(c=>c.action==='preflight'), send=calls.find(c=>c.action==='send');
    check('preflight+send carry request_date 20261102', pre?.request_date==='20261102' && send?.request_date==='20261102', JSON.stringify([pre?.request_date,send?.request_date]));
    const after=await p.evaluate(()=>{ const d=window.__STORE.pick_slips.get('internal__IRA'); return d.state+':'+d.invs_sub_po_no+':'+d.items.length; });
    check('send: plan → SENT (one slip kept) · no print prompt', after==='SENT:PO20:2' && !(await p.isVisible('text=พิมพ์ slip จัดยา?')), after);
    check('plan/send: no errors', !errs.length, errs.join(' | '));
  }
  // 2) กระดานจัดสรร
  {
    const {p,errs}=await newPage(b);
    await p.click('text=กระดานจัดสรรยา'); await p.waitForTimeout(400);
    await p.click('#alloc-load'); await p.waitForTimeout(1500);
    const body=(await p.innerText('body')).replace(/\s+/g,' ');
    check('board: shortage D1 shown (900 vs 800) · 3 แห่ง · D2 hidden', body.includes('ขาด 1') && body.includes('3 แห่ง') && !/NSS 1000 ml/.test(body.split('กระดานจัดสรรยา').pop()), body.slice(body.indexOf('ตำแหน่ง'),body.indexOf('ตำแหน่ง')+300));
    await p.click('tr:has-text("Syringe 5 ml")'); await p.waitForTimeout(300);
    const sub=(await p.innerText('body')).replace(/\s+/g,' ');
    check('board: per-unit rows + planned badge + suggestion', sub.includes('รพ.สต.ทุ่งระยะ') && sub.includes('พิมพ์ slip แล้ว') && /ตึกชาย[^]*?4 3 /.test(sub), sub.slice(sub.indexOf('หน่วยเบิก'),sub.indexOf('หน่วยเบิก')+400));
    await p.fill('#alloc-threshold','3'); await p.waitForTimeout(200);
    check('board: threshold 3 packs shows D2 (remain 15 < 30)', (await p.innerText('body')).includes('NSS 1000 ml'));
    check('board: no errors', !errs.length, errs.join(' | '));
  }
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
