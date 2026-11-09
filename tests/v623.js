// v6.23: คิวจัดยาที่แอดมินจัดเอง (เลื่อนขึ้น/ลง) · slip เขียน "คิวที่ N ต่อจาก X" · ใบที่ลำดับก่อนหน้าเปลี่ยน = เตือนพิมพ์ใหม่ · หน้าตรวจส่ง INVS ไม่แสดง/ไม่หักยอดค้างยืนยัน
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const NOW=new Date('2026-11-09T10:00:00');
const it=(id,name,pack,qty)=>({drugId:id,name,unit:'piece',packSize:pack,price:95,type:'2',requestQty:qty,dispenseQty:qty});
const IA={deptId:'A',dept_name:'ตึก A',kind:'dept',status:'Pending',form_no:'A',submitted_at:'2026-11-05T01:00:00Z',items:[it('292','Cotton Ball',1,100)]};
const IB={deptId:'B',dept_name:'ตึก B',kind:'dept',status:'Pending',form_no:'B',submitted_at:'2026-11-05T02:00:00Z',items:[it('292','Cotton Ball',1,100)]};
const plans={internal__IA:{source:'internal',req_id:'IA',unit_title:'ตึก A',state:'PLANNED',queue_pos:1,queue_after_id:'',first_planned_at:'2026-11-09T01:00:00Z',planned_at:'2026-11-09T01:00:00Z',items:[{drug_id:'292',qty:100}]},
  internal__IB:{source:'internal',req_id:'IB',unit_title:'ตึก B',state:'PLANNED',queue_pos:2,queue_after_id:'internal__IA',queue_after_title:'ตึก A',first_planned_at:'2026-11-09T02:00:00Z',planned_at:'2026-11-09T02:00:00Z',items:[{drug_id:'292',qty:100}]}};
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'a1'},collections:{
  master_drugs:{'292':{drug_id:'292',drug_name:'Cotton Ball',unit_id:'U1',type:'2',price:95,pack_size:1,invs_location:'E01'}},master_unit:{U1:{unit_id:'U1',unit_name:'piece'}},config:{},master_hospitals:{},
  master_depts:{A:{dept_id:'A',dept_name:'ตึก A',kind:'dept',active:true},B:{dept_id:'B',dept_name:'ตึก B',kind:'dept',active:true}},
  internal_requisitions:{IA,IB},pick_slips:plans,users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'}}}})+';');
(async()=>{
  const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage(); await p.clock.install({time:NOW}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  const calls=[]; await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); calls.push(body.action);
    const data=body.action==='stock_projection'?{ok:true,drugs:{'292':{on_hand:180,pending_qty:30,pending_docs:[{sub_po_no:'P9',qty:30}],available:150,pack_ratio:1,lots:[{lot_no:'C1',expiry:'20280101',qty:150}]}}}
      : body.action==='preflight'?{ok:true,item_count:1,total_value:9500,items:[{drug_id:'292',drug_name:'Cotton Ball',qty:100,lot_no:'C1',expiry:'20280101',lot_qty_on_hand:180,stock_before:180,stock_after:80,vmi_pack_size:1,pack_ratio:1,cost:95,value:9500}],warnings:[],errors:[],live_send_enabled:true}:{ok:true};
    await r.fulfill({contentType:'application/json',body:JSON.stringify(data)}); });
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500); await p.evaluate(()=>{ window.print=()=>{}; });
  await p.click('text=กระดานจัดสรรยา'); await p.waitForTimeout(800);
  let q=(await p.innerText('#pick-plan-queue')).replace(/\s+/g,' ');
  check('queue shows คิว 1 ตึก A, คิว 2 ตึก B', /คิว 1 ตึก A[^]*คิว 2 ตึก B/.test(q), q.slice(0,200));
  await p.click('button[aria-label="เลื่อนขึ้น ตึก B"]'); await p.waitForTimeout(800);
  const pos=await p.evaluate(()=>({a:window.__STORE.pick_slips.get('internal__IA').queue_pos,b:window.__STORE.pick_slips.get('internal__IB').queue_pos}));
  q=(await p.innerText('#pick-plan-queue')).replace(/\s+/g,' ');
  check('move up: B=1, A=2 · A flagged reprint', pos.b===1 && pos.a===2 && /คิว 1 ตึก B[^]*คิว 2 ตึก A[^]*ควรพิมพ์ slip ใหม่/.test(q), JSON.stringify(pos)+' '+q.slice(0,260));
  await p.click('text=คิวใบเบิกภายใน รพ.'); await p.waitForTimeout(500); await p.click('tr:has-text("ตึก A")'); await p.waitForTimeout(700);
  check('badge shows queue', (await p.innerText('body')).includes('คิวที่ 2'));
  await p.click('#print-pick-slip'); await p.waitForTimeout(1000);
  const html=await p.evaluate(()=>{ const f=[...document.querySelectorAll('iframe')].pop(); try{ return f?f.contentWindow.document.documentElement.outerHTML:''; }catch(e){ return ''; } });
  check('slip: "คิวที่ 2 · ต่อจาก ตึก B" · หักใบก่อนหน้า (150−100−100 = ขาด 50)', html.includes('คิวที่ 2 · ต่อจาก ตึก B') && /ขาด <b>50<\/b>/.test(html), (html.match(/<div class="qn">[^<]*/)||[''])[0]);
  const a=await p.evaluate(()=>window.__STORE.pick_slips.get('internal__IA'));
  check('re-plan keeps pos 2 + new predecessor stored', a.queue_pos===2 && a.queue_after_id==='internal__IB');
  await p.click('button:has-text("ตรวจ INVS แล้วอนุมัติ")'); await p.waitForTimeout(1200);
  const pf=(await p.innerText('body')).replace(/\s+/g,' ');
  check('preflight: no pending deduction text', !pf.includes('ค้างยืนยัน') && pf.includes('180') && pf.includes('80'));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
