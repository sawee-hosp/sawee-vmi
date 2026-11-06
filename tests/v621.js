// v6.21: ใบพิมพ์หน่วยงานแยก "(ด่วน)"/"(รับแล้ว)" + หมายเหตุใบด่วนที่รวม · ซ่อมใบเก่าที่รวมด่วนแต่ไม่ระบุยอดด่วน · ลำดับแผนจัดยา/ยกเลิก · วันที่นับสต็อกห้องยา · Sync มูลค่าจริงจาก INVS
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const NOW=new Date('2026-11-06T10:00:00');
const it=(id,name,pack,qty,extra)=>Object.assign({drugId:id,name,unit:'piece',packSize:pack,price:95,type:'2',requestQty:qty,dispenseQty:qty},extra||{});
const base={
  master_drugs:{'292':{drug_id:'292',drug_name:'Cotton Ball',unit_id:'U1',type:'2',price:95,pack_size:1,invs_location:'E01'},'360':{drug_id:'360',drug_name:'Sterile glove surgical no.6.5',unit_id:'U1',type:'2',price:650,pack_size:50,invs_location:'E02'},'400':{drug_id:'400',drug_name:'Oxygen mask',unit_id:'U1',type:'2',price:50,pack_size:1,invs_location:'E03'},
    D001:{drug_id:'D001',drug_name:'Paracetamol 500 mg tab',unit_id:'U1',pack_size:1000,price:250,type:'1',hosxp_code:'1000001'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'piece'}},config:{},master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ',invs_dept_id:'R01'}},
  master_depts:{LAU:{dept_id:'LAU',dept_name:'ซักฟอก/จ่ายกลาง',kind:'dept',active:true},PHARM:{dept_id:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',cover_days:30,active:true}},
  req_rounds:{R3:{id:'R3',fiscal_year:2570,round_no:3,round_date:'2026-11-11',scope:'internal',active:true}},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'},ph1:{name:'ภก',role:'pharmacy',dept_id:'PHARM',email:'p@x'}}};
const seed=(uid,extra)=>fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid},collections:Object.assign({},base,extra||{})})+';');
const newPage=async(b,uid,extra,file,route)=>{ seed(uid,extra); const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage(); await p.clock.install({time:NOW}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  const calls=[]; await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); calls.push(body); await r.fulfill({contentType:'application/json',body:JSON.stringify(route?route(body):{ok:true})}); });
  await p.goto('file://'+path.join(DIR,file)); await p.waitForTimeout(1500); await p.evaluate(()=>{ window.print=()=>{}; }); return {p,errs,calls}; };
const iframeHtml=(p)=>p.evaluate(()=>{ const f=[...document.querySelectorAll('iframe')].pop(); try{ return f?f.contentWindow.document.documentElement.outerHTML:''; }catch(e){ return ''; } });
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  // 1) ใบพิมพ์ + ซ่อมใบเก่า (เหมือนใบ 3/2570: รวมใบด่วนแล้วแต่รายการไม่มี urgentQty)
  {
    const U={deptId:'LAU',status:'Merged',round_id:'R3',round_no:3,form_date:'2026-11-05',merged_req_id:'IR3',merged_req_no:'3/2570',items:[{drugId:'292',name:'Cotton Ball',packSize:1,requestQty:20},{drugId:'360',name:'Sterile glove surgical no.6.5',packSize:50,requestQty:300}]};
    const IR3={deptId:'LAU',dept_name:'ซักฟอก/จ่ายกลาง',kind:'dept',status:'Pending',round_id:'R3',round_no:3,form_no:'3/2570',form_date:'2026-11-11',submitted_at:'2026-11-05T05:00:00Z',
      items:[it('400','Oxygen mask',1,40,{price:50}),it('292','Cotton Ball',1,20),it('360','Sterile glove surgical no.6.5',50,300,{price:650})],total_value:7900};
    const {p,errs}=await newPage(b,'a1',{internal_requisitions:{IR3},internal_urgent:{U1:U}},'t_app.html');
    await p.click('text=คิวใบเบิกภายใน รพ.'); await p.waitForTimeout(500); await p.click('tr:has-text("ซักฟอก")'); await p.waitForTimeout(800);
    check('repair banner for merged urgent without urgentQty', await p.isVisible('#iq-urgent-fix') && (await p.innerText('#iq-urgent-fix')).includes('Cotton Ball ด่วน 20'));
    await p.click('#iq-urgent-fix-btn'); await p.waitForTimeout(800);
    const fx=await p.evaluate(()=>window.__STORE.internal_requisitions.get('IR3').items.map(i=>i.drugId+':'+i.requestQty+':'+(i.urgentQty||0)));
    check('repair: urgentQty set, qty unchanged', JSON.stringify(fx)==='["400:40:0","292:20:20","360:300:300"]', JSON.stringify(fx));
    await p.click('button:has-text("พิมพ์ใบเบิก")'); await p.waitForTimeout(400);
    await p.locator('.fixed button:has-text("พิมพ์")').last().click(); await p.waitForTimeout(1200);
    const html=await iframeHtml(p);
    check('print: 20(ด่วน) · 6(ด่วน) · refs footnote', html.includes('20(ด่วน)') && html.includes('6(ด่วน)') && html.includes('รวมใบเบิกด่วน 1 ใบ วันที่ 5 พ.ย. 69') && html.includes('<td class="c b">40</td>'), html.length+'');
    const both=await p.evaluate(()=>qtyWithReceivedText({urgentQty:2,predispQty:1,packSize:1},6,1));
    check('label both kinds: 3+2(ด่วน)+1(รับแล้ว)', both==='3+2(ด่วน)+1(รับแล้ว)', both);
    check('print/repair: no errors', !errs.length, errs.join(' | '));
  }
  // 2) ลำดับแผนจัดยา + ยกเลิก
  {
    const IA={deptId:'LAU',dept_name:'ตึก A',kind:'dept',status:'Pending',form_no:'A',submitted_at:'2026-11-05T01:00:00Z',items:[it('292','Cotton Ball',1,100)]};
    const IB={deptId:'LAU',dept_name:'ตึก B',kind:'dept',status:'Pending',form_no:'B',submitted_at:'2026-11-05T02:00:00Z',items:[it('292','Cotton Ball',1,100)]};
    const PROJ={'292':{on_hand:150,pending_qty:0,pending_docs:[],available:150,pack_ratio:1,lots:[{lot_no:'C1',expiry:'20280101',qty:150}]}};
    const route=(b)=>b.action==='stock_projection'?{ok:true,drugs:PROJ}:{ok:true};
    const plans={internal__IA:{source:'internal',req_id:'IA',unit_title:'ตึก A',state:'PLANNED',first_planned_at:'2026-11-06T01:00:00Z',planned_at:'2026-11-06T01:00:00Z',items:[{drug_id:'292',qty:100}]},
      internal__IB:{source:'internal',req_id:'IB',unit_title:'ตึก B',state:'PLANNED',first_planned_at:'2026-11-06T02:00:00Z',planned_at:'2026-11-06T02:00:00Z',items:[{drug_id:'292',qty:100}]}};
    const {p,errs}=await newPage(b,'a1',{internal_requisitions:{IA,IB},pick_slips:plans},'t_app.html',route);
    await p.click('text=คิวใบเบิกภายใน รพ.'); await p.waitForTimeout(500); await p.click('tr:has-text("ตึก A")'); await p.waitForTimeout(700);
    await p.click('#print-pick-slip'); await p.waitForTimeout(1000);
    const a=await iframeHtml(p);
    check('re-plan A keeps order (B later not subtracted) → เหลือ 50', /เหลือ <b>50<\/b>/.test(a), (a.match(/class="rt">[^<]*<b>[^<]*<\/b>/)||[])[0]);
    const fa=await p.evaluate(()=>window.__STORE.pick_slips.get('internal__IA').first_planned_at);
    check('first_planned_at kept', fa==='2026-11-06T01:00:00Z', fa);
    await p.click('#pick-plan-cancel'); await p.waitForTimeout(200); await p.click('.fixed button:has-text("ยกเลิกแผน")'); await p.waitForTimeout(500);
    check('cancel plan from badge', (await p.evaluate(()=>window.__STORE.pick_slips.get('internal__IA').state))==='CANCELLED');
    await p.click('text=กระดานจัดสรรยา'); await p.waitForTimeout(800);
    const q=await p.innerText('#pick-plan-queue');
    check('board: plan queue lists B only', q.includes('ตึก B') && !q.includes('ตึก A'), q.replace(/\s+/g,' ').slice(0,200));
    await p.click('#pick-plan-reset'); await p.waitForTimeout(200); await p.click('.fixed button:has-text("ยืนยัน")'); await p.waitForTimeout(600);
    check('board: reset all plans', (await p.evaluate(()=>window.__STORE.pick_slips.get('internal__IB').state))==='CANCELLED' && (await p.innerText('#pick-plan-queue')).includes('ไม่มีแผนค้าง'));
    check('plans: no errors', !errs.length, errs.join(' | '));
  }
  // 3) สต็อกห้องยา: นับหลังสิ้นช่วงยอดใช้ = ไม่หักยอดใช้
  {
    const route=(b)=>b.action==='hosxp_usage'?{ok:true,days:30,count:1,rows:[{icode:'1000001',opd_qty:3000,ipd_qty:0}]}:{ok:true};
    const {p,errs}=await newPage(b,'ph1',{internal_stock:{'PHARM__D001':{dept_id:'PHARM',drug_id:'D001',balance:5000,last_source:'MANUAL_COUNT',counted_ymd:'2026-11-04'}},internal_requisitions:{},req_rounds:{}},'t_internal.html',route);
    await p.evaluate(()=>{ try{ localStorage.setItem('rxfill_ph_asu','0'); }catch(e){} });
    await p.click('button:has-text("สร้างใบเบิก")'); await p.click('button:has-text("สร้างใบเบิกต่อ")'); await p.waitForSelector('text=สร้างใบเบิกห้องยา');
    await p.fill('#usage-from','2026-10-01').catch(()=>{}); await p.fill('#usage-to','2026-10-30');
    await p.click('button:has-text("ดึงยอดใช้จาก HOSxP")'); await p.waitForSelector('text=Paracetamol 500 mg tab');
    const credit=await p.inputValue('input[aria-label="เครดิต Paracetamol 500 mg tab"]');
    const row=(await p.locator('tr',{hasText:'Paracetamol 500 mg tab'}).first().innerText()).replace(/\s+/g,' ');
    check('counted after period → credit = count 5000 (no usage subtract)', credit==='5000' && row.includes('ไม่หักยอดใช้'), credit+' · '+row.slice(0,200));
    check('stock count: no errors', !errs.length, errs.join(' | '));
  }
  // 4) Sync มูลค่าจริงจาก INVS
  {
    const R1={hospitalId:'H1',status:'Completed',month:11,year:2026,invs_sub_po_no:'A1',invs_status:'SENT',created_at:'2026-11-01T00:00:00Z',items:[{drugId:'292',name:'Cotton Ball',type:'2',packSize:1,dispenseQty:30,price:50,price_before_invs:40,price_source:'INVS'}]};
    const IRB={deptId:'LAU',dept_name:'ตึก B',kind:'dept',status:'Completed',form_no:'9/2570',invs_sub_po_no:'B1',submitted_at:'2026-11-03T00:00:00Z',items:[it('292','Cotton Ball',1,10,{price:50})],total_value:500,approved_total_value:500};
    const route=(b)=>b.action==='invs_doc_values'?{ok:true,docs:{A1:{found:true,confirmed:true,total_value:1650,drugs:{'292':{value:1650,qty_order:30}}},B1:{found:true,confirmed:false,total_value:500,drugs:{'292':{value:500}}}}}:{ok:true};
    const {p,errs}=await newPage(b,'a1',{requisitions:{R1},internal_requisitions:{IRB}},'t_app.html',route);
    await p.click('text=คิวใบเบิกภายใน รพ.'); await p.waitForTimeout(500);
    await p.click('#iq-value-sync'); await p.waitForTimeout(1500);
    const m=(await p.innerText('body')).replace(/\s+/g,' ');
    check('modal: estimate 1,200 · now 1,500 · INVS 1,650 · B1 not confirmed', m.includes('1,200.00') && m.includes('1,500.00') && m.includes('1,650.00') && m.includes('ยังไม่ยืนยันใน INVS'));
    await p.click('#invs-value-save'); await p.waitForTimeout(1000);
    const st=await p.evaluate(()=>({r:window.__STORE.requisitions.get('R1'),i:window.__STORE.internal_requisitions.get('IRB')}));
    check('saved: RPST price 55 (1650/30) · estimate 1200 · confirmed flag', st.r.items[0].price===55 && st.r.items[0].price_before_invs===40 && st.r.estimate_total_value===1200 && st.r.invs_value_confirmed===true && st.r.invs_confirmed_total_value===1650, JSON.stringify({p:st.r.items[0].price,e:st.r.estimate_total_value,c:st.r.invs_value_confirmed}));
    check('unconfirmed doc untouched', !st.i.invs_value_confirmed && st.i.items[0].price===50);
    check('value sync: no errors', !errs.length, errs.join(' | '));
  }
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
