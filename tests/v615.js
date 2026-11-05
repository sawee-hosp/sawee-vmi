// v6.15: ใบภายใน — รวมใบเบิกด่วนตอนแอดมินตรวจ INVS · มูลค่า = ราคา INVS · ใบพิมพ์พร้อมยอดคงเหลือใช้ผลจาก Bridge (ไม่ว่าง) · คงคลังแสดงหน่วยใหญ่
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'a1'},collections:{
  master_drugs:{D1:{drug_id:'D1',drug_name:'Syringe 5 ml',unit_id:'U1',type:'2',price:100,pack_size:100},D2:{drug_id:'D2',drug_name:'Gauze 3x3',unit_id:'U1',type:'2',price:50,pack_size:10}},
  master_unit:{U1:{unit_id:'U1',unit_name:'ชิ้น'}},config:{},master_hospitals:{},
  master_depts:{WARD:{dept_id:'WARD',dept_name:'ตึกผู้ป่วยหญิง',kind:'dept',active:true}},
  internal_requisitions:{IR1:{deptId:'WARD',dept_name:'ตึกผู้ป่วยหญิง',kind:'dept',status:'Pending',round_id:'R2',round_no:2,form_no:'2/2570',submitted_at:'2026-11-01T01:00:00Z',
    items:[{drugId:'D1',name:'Syringe 5 ml',unit:'ชิ้น',packSize:100,price:100,type:'2',requestQty:200,dispenseQty:200}],total_value:200}},
  internal_urgent:{U1:{deptId:'WARD',status:'Active',round_id:'R2',round_no:2,round_date:'2026-11-02',form_date:'2026-10-28',
    items:[{drugId:'D1',name:'Syringe 5 ml',unit:'ชิ้น',packSize:100,price:100,type:'2',requestQty:100},{drugId:'D2',name:'Gauze 3x3',unit:'ชิ้น',packSize:10,price:50,type:'2',requestQty:30}]}},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1500,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  const calls=[];
  await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); calls.push(body.action);
    // Bridge ตอบกลับแต่ "ไม่ได้" เขียน Firestore (จำลองกรณีอ่านกลับไม่ได้ฟิลด์ INVS)
    const items=[{drug_id:'D1',drug_name:'Syringe 5 ml',qty:300,cost:1.2,value:360,vmi_pack_size:100,pack_ratio:100,stock_before:1250,stock_after:950,stock_lots:2,
      lots_after:[{lot_no:'S1',expiry:'20270101',qty_before:250,qty_issue:250,qty_after:0},{lot_no:'S2',expiry:'20280101',qty_before:1000,qty_issue:50,qty_after:950}]},
      {drug_id:'D2',drug_name:'Gauze 3x3',qty:30,cost:4,value:120,vmi_pack_size:10,pack_ratio:10,stock_before:45,stock_after:15,stock_lots:1,lots_after:[{lot_no:'G1',expiry:'20270501',qty_before:45,qty_issue:30,qty_after:15}]}];
    const data=body.action==='preflight'?{ok:true,item_count:2,total_value:480,items,warnings:[],errors:[],live_send_enabled:true}:{ok:true,sub_po_no:'PO777',items,item_count:2,total_value:480};
    await r.fulfill({contentType:'application/json',body:JSON.stringify(data)}); });
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
  await p.click('text=คิวใบเบิกภายใน รพ.'); await p.waitForTimeout(600);
  await p.click('tr:has-text("ตึกผู้ป่วยหญิง")'); await p.waitForTimeout(600);
  check('urgent: banner shows unmerged urgent (same round)', await p.isVisible('#iq-urgent-banner'));
  await p.click('button:has-text("ตรวจ INVS แล้วอนุมัติ")'); await p.waitForTimeout(1200);
  const st=await p.evaluate(()=>({items:(window.__STORE.internal_requisitions.get('IR1').items||[]).map(i=>i.drugId+':'+i.dispenseQty+':'+(i.urgentQty||0)), u:window.__STORE.internal_urgent.get('U1').status}));
  check('urgent: auto-merged before INVS check', JSON.stringify(st.items)==='["D1:300:100","D2:30:30"]' && st.u==='Merged', JSON.stringify(st));
  const pf=(await p.innerText('body')).replace(/\s+/g,' ');
  check('preflight: stock in big units', / 12\(50\) /.test(pf) && / 9\(50\) /.test(pf) && / 4\(5\) /.test(pf), pf.match(/คงคลังรวมทุก lot.{0,200}/)?.[0]);
  await p.evaluate(()=>{ window.print=()=>{}; });
  await p.click('button:has-text("ส่งเข้า INVS และอนุมัติ")'); await p.waitForTimeout(1500);
  const done=await p.evaluate(()=>{ const d=window.__STORE.internal_requisitions.get('IR1'); return {st:d.status, v:d.approved_total_value, items:(d.items||[]).map(i=>i.drugId+':'+i.price+':'+(i.price_source||''))}; });
  check('value: approved with INVS prices (300×1.2 + 30×4 = 480)', done.st==='Completed' && done.v===480 && done.items.includes('D1:120:INVS') && done.items.includes('D2:40:INVS'), JSON.stringify(done));
  check('no print prompt after send (slip = one sheet)', !(await p.isVisible('text=พิมพ์ slip จัดยา?')));
  // พิมพ์ย้อนหลังจาก pick_slips (สร้างจากผล Bridge)
  await p.click('button:has-text("ดำเนินการแล้ว")'); await p.waitForTimeout(300); await p.click('tr:has-text("ตึกผู้ป่วยหญิง")'); await p.waitForTimeout(700);
  await p.click('#print-pick-slip'); await p.waitForTimeout(800);
  const html=await p.evaluate(()=>{ const f=[...document.querySelectorAll('iframe')].pop(); try{ return f?f.contentWindow.document.documentElement.outerHTML:''; }catch(e){ return ''; } });
  check('slip: not empty (from Bridge result) + big units', html.includes('PO777') && html.includes('Syringe 5 ml') && /<b>S2<\/b> <span class="sm">EXP [^<]*<\/span><span class="lq">\(50\)<\/span>/.test(html) && html.includes('เหลือ <b>9(50)</b>') && html.includes('2 รายการ'), html.length+' chars');
  const ps=await p.evaluate(()=>{ const d=(window.__STORE.pick_slips||new Map()).get('internal__IR1'); return d ? d.invs_sub_po_no+':'+d.items.map(i=>i.drug_id+'='+i.lots.map(l=>l.lot_no+'/'+l.qty).join('+')+'>'+i.stock_after).join(',') : null; });
  check('pick_slips saved from Bridge result', ps==='PO777:D2=G1/30>15,D1=S1/250+S2/50>950' || ps==='PO777:D1=S1/250+S2/50>950,D2=G1/30>15', ps);
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
