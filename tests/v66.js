// v6.6: ซ่อนหมวด 5/6 ในใบเบิกห้องยา, เรียงตามตำแหน่งยา, ผู้ลงนาม 4 จุด (ต้องรัน build.js ก่อน)
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const seed=(uid,c)=>fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid},collections:c})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  seed('ph1',{
    master_drugs:{
      D001:{drug_id:'D001',drug_name:'Zinc tab',unit_id:'U1',pack_size:100,price:1,type:'1',hosxp_code:'1',invs_location:'12/3/2-1'},
      D002:{drug_id:'D002',drug_name:'Amox cap',unit_id:'U1',pack_size:100,price:1,type:'1',hosxp_code:'2',invs_location:'7/1/2-1'},
      D003:{drug_id:'D003',drug_name:'Aspirin',unit_id:'U1',pack_size:100,price:1,type:'1',hosxp_code:'3',invs_location:''},
      D005:{drug_id:'D005',drug_name:'ProjectDrug',unit_id:'U1',pack_size:100,price:1,type:'5',hosxp_code:'5'},
      D006:{drug_id:'D006',drug_name:'VaccineX',unit_id:'U1',pack_size:1,price:1,type:'6',hosxp_code:'6'}},
    master_unit:{U1:{unit_id:'U1',unit_name:'เม็ด'}},config:{},master_hospitals:{},
    master_depts:{PHARM:{dept_id:'PHARM',dept_name:'ห้องยา OPD',kind:'pharmacy',cover_days:30,active:true}},
    users:{ph1:{name:'ภก',role:'pharmacy',dept_id:'PHARM',email:'p@x',position:'เภสัชกร'}},
    internal_stock:{},internal_requisitions:{},req_rounds:{}});
  const p=await b.newPage({viewport:{width:1500,height:900}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('http://127.0.0.1/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,days:30,count:5,rows:['1','2','3','5','6'].map(i=>({icode:i,opd_qty:300,ipd_qty:0}))})}));
  await p.goto('file://'+path.join(DIR,'t_internal.html')); await p.waitForSelector('text=ใบเบิกของฉัน');
  await p.click('button:has-text("สร้างใบเบิก")'); await p.click('button:has-text("สร้างใบเบิกต่อ")'); await p.waitForSelector('text=สร้างใบเบิกห้องยา');
  await p.fill('#usage-from','2026-09-01'); await p.fill('#usage-to','2026-09-30');
  await p.click('button:has-text("ดึงยอดใช้จาก HOSxP")'); await p.waitForSelector('text=Zinc tab');
  const body=await p.innerText('body');
  check('hide: type 5/6 hidden by default', !body.includes('ProjectDrug') && !body.includes('VaccineX'));
  await p.click('#ph-hide-type-5'); await p.waitForTimeout(100);
  check('hide: untick shows type 5', (await p.innerText('body')).includes('ProjectDrug'));
  await p.click('#ph-hide-type-5');
  await p.selectOption('select[aria-label="เรียงตาม"]','loc'); await p.waitForTimeout(100);
  const order=await p.$$eval('table.sticky-head tbody tr',trs=>trs.map(t=>t.innerText).map(t=>(t.match(/Zinc tab|Amox cap|Aspirin/)||[''])[0]).filter(Boolean));
  check('sort loc: 7 → 12 → none', JSON.stringify(order)===JSON.stringify(['Amox cap','Zinc tab','Aspirin']), JSON.stringify(order));
  await p.click('#ph-estimate'); await p.waitForSelector('#ph-est-print');
  await p.fill('#sign-name-1','นพ. ผอ'); await p.fill('#sign-pos-1','ผู้อำนวยการ');
  await p.click('#ph-est-save'); await p.waitForTimeout(300);
  const d=await p.evaluate(()=>[...window.__STORE.internal_requisitions.values()][0]);
  check('signers: saved with draft', d && d.sign_people && d.sign_people[1].name==='นพ. ผอ' && d.sign_people[0].name==='ภก', JSON.stringify(d && d.sign_people));
  check('hide: draft has no type 5/6', d && !(d.items||[]).some(i=>['5','6'].includes(String(i.type))), JSON.stringify((d.items||[]).map(i=>i.drugId)));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})();
