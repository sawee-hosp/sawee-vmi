// v6.13: ห้องยา สูตร ASU 180 วัน + lot INVS (FEFO เคลียร์ lot) + ปัดเลขสวย + ใบพิมพ์แสดง Lot ที่หยิบ/เหลือหลังหยิบ
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const ymd=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const NOW=new Date('2026-11-03T10:00:00');
// ยอดใช้รายวัน 180 วันย้อนหลัง: 1000003 = 37/18 ต่อวัน (เป้า N = 18 วัน → 37), 1000001 = 100 ต่อวัน
const series={'1000003':{},'1000001':{}};
for(let i=1;i<=180;i++){ const d=new Date(NOW); d.setDate(d.getDate()-i); series['1000003'][ymd(d)]=37/18; series['1000001'][ymd(d)]=100; }
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'ph1'},collections:{
  master_drugs:{D001:{drug_id:'D001',drug_name:'Paracetamol 500 mg tab',unit_id:'U1',pack_size:1000,price:250,type:'1',hosxp_code:'1000001'},
    D003:{drug_id:'D003',drug_name:'Ibuprofen 400 mg tab',unit_id:'U1',pack_size:1,price:10,type:'1',hosxp_code:'1000003'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'เม็ด'}},config:{},master_hospitals:{},
  master_depts:{PHARM:{dept_id:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',cover_days:30,active:true}},
  users:{ph1:{name:'ภก',role:'pharmacy',dept_id:'PHARM',email:'p@x'}},internal_stock:{},internal_requisitions:{},req_rounds:{}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1600,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.clock.install({time:NOW});
  const calls=[];
  await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); calls.push(body.action);
    let data={ok:true};
    if(body.action==='hosxp_usage') data={ok:true,days:30,count:2,rows:[{icode:'1000001',opd_qty:3000,ipd_qty:0},{icode:'1000003',opd_qty:60,ipd_qty:0}]};
    if(body.action==='hosxp_usage_daily') data={ok:true,icode_count:2,series};
    if(body.action==='invs_lots') data={ok:true,lots:{D003:[{lot_no:'A',expiry:'20270101',qty:40},{lot_no:'B',expiry:'20280101',qty:60},{lot_no:'C',expiry:'20290101',qty:200}],
      D001:[{lot_no:'L1',expiry:'20270131',qty:1500},{lot_no:'L2',expiry:'20280531',qty:5000}]}};
    await r.fulfill({contentType:'application/json',body:JSON.stringify(data)}); });
  await p.goto('file://'+path.join(DIR,'t_internal.html')); await p.waitForSelector('text=ใบเบิกของฉัน');
  await p.click('button:has-text("สร้างใบเบิก")'); await p.click('button:has-text("สร้างใบเบิกต่อ")'); await p.waitForSelector('text=สร้างใบเบิกห้องยา');
  await p.fill('#usage-from','2026-10-01'); await p.fill('#usage-to','2026-10-30');
  await p.click('button:has-text("ดึงยอดใช้จาก HOSxP")'); await p.waitForSelector('text=Paracetamol 500 mg tab');
  check('asu: toggle on by default', await p.isChecked('#asu-mode'));
  await p.click('#asu-fetch'); await p.waitForTimeout(800);
  check('asu: bridge calls', calls.includes('hosxp_usage_daily') && calls.includes('invs_lots'), JSON.stringify(calls));
  const rowText=async(name)=>(await p.locator('tr',{hasText:name}).first().innerText()).replace(/\s+/g,' ');
  const ibu=await rowText('Ibuprofen 400 mg tab'), para=await rowText('Paracetamol 500 mg tab');
  check('asu: need 37 → clear lot A = 40', / 37 40 /.test(ibu) && /เคลียร์ lot A/.test(ibu) && /A .*หยิบ 40 → เหลือ 0/.test(ibu), ibu);
  check('asu: pack 1000, need 1,800 → 2,000 across 2 lots', /L1 .*หยิบ 1,500 → เหลือ 0/.test(para) && /L2 .*หยิบ 500 → เหลือ 4,500/.test(para), para);
  check('asu: VEN shown (pharmacy read-only)', ibu.includes('VEN N'));
  // ใบพิมพ์ (ประมาณการ/ใบเบิก) ต้องมี Lot ที่หยิบ + เหลือหลังหยิบ
  await p.click('#ph-estimate'); await p.waitForSelector('#ph-est-print');
  await p.evaluate(()=>{ window.print=()=>{}; });
  await p.click('#ph-est-print'); await p.waitForTimeout(800);
  const html=await p.evaluate(()=>{ const f=[...document.querySelectorAll('iframe')].pop(); try{ return f?f.contentWindow.document.documentElement.outerHTML:''; }catch(e){ return ''; } });
  check('print: lot pick lines', /หยิบ Lot <b>A<\/b> \(EXP 01\/01\/70\) 40 → เหลือ 0/.test(html) && /หยิบ Lot <b>L2<\/b>[^<]*500 → เหลือ 4,500/.test(html), html.length+' chars');
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
