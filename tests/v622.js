// v6.22: ใบหน่วยงาน พิมพ์ = ยืนยัน + ล็อกยอด (ผู้เบิกแก้ไม่ได้ · แอดมินแก้ได้ · ตีกลับปลดล็อก) + ลายน้ำ "พิมพ์เมื่อ" · ห้องยา โหมดเบิก เบิกทั้งหมด / คลังพิเศษ
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const NOW=new Date('2026-11-09T10:00:00');
const base={
  master_drugs:{D1:{drug_id:'D1',drug_name:'Syringe 5 ml',unit_id:'U1',type:'2',price:100,pack_size:100},
    P1:{drug_id:'P1',drug_name:'Special inj (เบิกทั้งหมด)',unit_id:'U1',type:'1',price:500,pack_size:1,pharm_req_mode:'all'},
    P2:{drug_id:'P2',drug_name:'Paracetamol 500 mg tab',unit_id:'U1',type:'1',price:250,pack_size:1000,hosxp_code:'1000001'},
    P3:{drug_id:'P3',drug_name:'Methadone syrup (คลังพิเศษ)',unit_id:'U1',type:'1',price:10,pack_size:1,hosxp_code:'1000003',pharm_req_mode:'exclude'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'ชิ้น'}},config:{},master_hospitals:{},
  master_depts:{WARD:{dept_id:'WARD',dept_name:'ตึกหญิง',kind:'dept',active:true},PHARM:{dept_id:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',cover_days:30,active:true}},
  req_rounds:{},internal_stock:{},
  users:{d1:{name:'พยาบาล',role:'dept',dept_id:'WARD',email:'d@x'},a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'},ph1:{name:'ภก',role:'pharmacy',dept_id:'PHARM',email:'p@x'}}};
const IR={deptId:'WARD',dept_name:'ตึกหญิง',kind:'dept',status:'Pending',form_no:'5/2570',form_date:'2026-11-09',doc_no:'d-691109-01',submitted_at:'2026-11-09T01:00:00Z',created_by_uid:'d1',
  items:[{drugId:'D1',name:'Syringe 5 ml',unit:'ชิ้น',packSize:100,price:100,type:'2',requestQty:200,dispenseQty:200}],total_value:200};
const newPage=async(b,uid,extra,file,route)=>{ fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid},collections:Object.assign({},base,extra||{})})+';');
  const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage(); await p.clock.install({time:NOW}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); await r.fulfill({contentType:'application/json',body:JSON.stringify(route?route(body):{ok:true})}); });
  await p.goto('file://'+path.join(DIR,file)); await p.waitForTimeout(1500); await p.evaluate(()=>{ window.print=()=>{}; }); return {p,errs}; };
const iframeHtml=(p)=>p.evaluate(()=>{ const f=[...document.querySelectorAll('iframe')].pop(); try{ return f?f.contentWindow.document.documentElement.outerHTML:''; }catch(e){ return ''; } });
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  // 1) หน่วยงานพิมพ์ = ยืนยันล็อก
  {
    const {p,errs}=await newPage(b,'d1',{internal_requisitions:{IR1:IR}},'t_internal.html');
    await p.click('text=d-691109-01'); await p.waitForTimeout(400);
    check('before print: edit allowed', await p.isVisible('button:has-text("แก้ไขใบเบิก")'));
    await p.click('#req-print-main'); await p.waitForTimeout(300);
    check('print button says lock', (await p.innerText('#form-print-go')).includes('ล็อกยอด'));
    await p.click('#form-print-go'); await p.waitForTimeout(300);
    check('confirm dialog before print', (await p.innerText('body')).includes('พิมพ์แล้วยอดจะถูกล็อก'));
    await p.click('.fixed button:has-text("ยืนยัน ล็อกและพิมพ์")'); await p.waitForTimeout(1200);
    const d=await p.evaluate(()=>window.__STORE.internal_requisitions.get('IR1'));
    check('locked: is_printed + printed_locked_at', d.is_printed===true && !!d.printed_locked_at && d.printed_locked_by_name==='พยาบาล');
    const html=await iframeHtml(p);
    check('watermark: diagonal "พิมพ์เมื่อ" with date', /<div class="wm">พิมพ์เมื่อ 9\/11\/2569 10:0\d:\d\d<small>ตึกหญิง · 5\/2570<\/small><\/div>/.test(html) && html.includes('rotate(-35deg)'), (html.match(/<div class="wm">.{0,80}/)||[''])[0]);
    await p.click('text=ใบเบิกของฉัน'); await p.waitForTimeout(400); await p.click('text=d-691109-01'); await p.waitForTimeout(400);
    check('after print: dept cannot edit/cancel + lock notice', !(await p.isVisible('button:has-text("แก้ไขใบเบิก")')) && !(await p.isVisible('button:has-text("ยกเลิกใบ")')) && await p.isVisible('#req-print-locked'));
    check('dept lock: no errors', !errs.length, errs.join(' | '));
  }
  // 2) แอดมินยังแก้ได้ · ตีกลับ = ปลดล็อก
  {
    const {p,errs}=await newPage(b,'a1',{internal_requisitions:{IR1:Object.assign({},IR,{is_printed:true})}},'t_app.html');
    await p.click('text=คิวใบเบิกภายใน รพ.'); await p.waitForTimeout(500); await p.click('tr:has-text("ตึกหญิง")'); await p.waitForTimeout(700);
    check('admin: quantity still editable after print', await p.isEditable('input[aria-label="อนุมัติจ่าย Syringe 5 ml"]'));
    await p.click('button:has-text("ส่งกลับ")'); await p.waitForTimeout(300);
    await p.fill('#iq-reject','แก้จำนวน'); await p.locator('.fixed button:has-text("ส่งกลับ")').last().click(); await p.waitForTimeout(800);
    const d=await p.evaluate(()=>window.__STORE.internal_requisitions.get('IR1'));
    check('reject clears lock (dept can fix)', d.status==='Rejected' && d.is_printed===false, d.status+':'+d.is_printed);
    check('admin: no errors', !errs.length, errs.join(' | '));
  }
  // 3) ห้องยา: เบิกทั้งหมด / คลังพิเศษ
  {
    const route=(b)=>b.action==='hosxp_usage'?{ok:true,days:30,count:2,rows:[{icode:'1000001',opd_qty:3000,ipd_qty:0},{icode:'1000003',opd_qty:500,ipd_qty:0}]}
      : b.action==='invs_lots'?{ok:true,lots:{P1:[{lot_no:'S1',expiry:'20270101',qty:7},{lot_no:'S2',expiry:'20280101',qty:5}],P2:[{lot_no:'L1',expiry:'20280101',qty:9000}],P3:[{lot_no:'M1',expiry:'20280101',qty:999}]}}:{ok:true};
    const {p,errs}=await newPage(b,'ph1',{internal_requisitions:{}},'t_internal.html',route);
    await p.evaluate(()=>{ try{ localStorage.setItem('rxfill_ph_asu','0'); }catch(e){} });
    await p.click('button:has-text("สร้างใบเบิก")'); await p.click('button:has-text("สร้างใบเบิกต่อ")'); await p.waitForSelector('text=สร้างใบเบิกห้องยา');
    await p.fill('#usage-from','2026-10-01').catch(()=>{}); await p.fill('#usage-to','2026-10-30');
    await p.click('button:has-text("ดึงยอดใช้จาก HOSxP")'); await p.waitForSelector('text=Paracetamol 500 mg tab'); await p.waitForTimeout(800);
    const all=(await p.locator('tr',{hasText:'Special inj'}).first().innerText()).replace(/\s+/g,' ');
    check('mode all: in form without usage · dispense = all lots 12', (await p.inputValue('input[aria-label="เบิกจริง Special inj (เบิกทั้งหมด)"]'))==='12' && all.includes('เบิกทั้งหมด') && /S1 [^[]*\[7\][^]*S2 [^[]*\[5\]/.test(all), all.slice(0,260));
    check('mode exclude: hidden from table', !(await p.isVisible('text=Methadone syrup (คลังพิเศษ)')));
    await p.check('#ph-show-excluded'); await p.waitForTimeout(200);
    const ex=(await p.locator('tr',{hasText:'Methadone syrup'}).first().innerText()).replace(/\s+/g,' ');
    check('show excluded: label + no dispense', ex.includes('คลังพิเศษ (ไม่เบิกห้องยา)') && (await p.inputValue('input[aria-label="เบิกจริง Methadone syrup (คลังพิเศษ)"]'))==='0', ex.slice(0,200));
    await p.selectOption('select[aria-label="โหมดเบิก Paracetamol 500 mg tab"]','exclude'); await p.waitForTimeout(600);
    check('pharmacy can set mode → master_drugs', (await p.evaluate(()=>window.__STORE.master_drugs.get('P2').pharm_req_mode))==='exclude');
    check('pharmacy modes: no errors', !errs.length, errs.join(' | '));
  }
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
