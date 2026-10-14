// v6.6.3: เส้นจุดคั่นแถวกลุ่มตำแหน่งเดียวกัน + รายการส่ง INVS เพิ่ม (ต้องรัน build.js ก่อน)
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const mk=(id,name)=>({drugId:id,name,type:'1',packSize:100,price:1,usage:100,prevExcess:0,systemSuggestedQty:100,finalRequestedQty:100,dispenseQty:100});
const md=(id,name,loc)=>({drug_id:id,drug_name:name,unit_id:'U1',pack_size:100,price:1,type:'1',invs_location:loc});
const locs={A1:'A01',A2:'A02',B1:'B01',N1:'7/1/2-1',N2:'7/3/1',N3:'12/3/2-1'};
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'adm'},collections:{
  master_drugs:Object.fromEntries(Object.entries(locs).map(([k,v])=>[k,md(k,'ยา'+k,v)])),
  master_unit:{U1:{unit_id:'U1',unit_name:'เม็ด'}},master_depts:{},config:{},
  master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ',hcode:'09415'}},
  users:{adm:{name:'แอดมิน',role:'admin',email:'a@x'}},
  requisitions:{'REQ-H1-X':{hospitalId:'H1',month:10,year:2026,status:'Pending',items:Object.keys(locs).map(k=>mk(k,'ยา'+k))}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage({viewport:{width:1500,height:900}}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
  // shared form
  const f=await p.evaluate((locs)=>{const h=buildInternalReqFormHtml({req:{kind:'pharmacy',items:Object.keys(locs).map(k=>({drugId:k,name:'ยา'+k,type:'1',packSize:1,price:1,requestQty:1,dispenseQty:1}))},formNo:'1',formDate:'2026-10-05',locOf:id=>locs[id]});
    const d=new DOMParser().parseFromString(h,'text/html'); return [...d.querySelectorAll('.items tbody tr')].filter(t=>!t.classList.contains('grp')&&!t.classList.contains('blankrow')&&!t.classList.contains('note')).map(t=>t.cells[1].textContent+':'+(t.className||'-')).join(' ');},locs);
  check('form: dotted within same prefix', f==='ยาN1:ldb ยาN2:ldt ยาN3:- ยาA1:ldb ยาA2:ldt ยาB1:-', f);
  await (await p.$('tr:has-text("รพ.สต.ทุ่งระยะ")')).click(); await p.waitForSelector('#req-item-A1');
  await p.emulateMedia({media:'print'});
  const v=await p.$$eval('tr[id^="req-item-"]',t=>t.map(x=>x.id.slice(9)+':'+getComputedStyle(x.cells[1]).borderTopStyle+'/'+getComputedStyle(x.cells[1]).borderBottomStyle).join(' '));
  check('view: dotted borders', v.includes('N2:dotted/') && v.includes('A2:dotted/') && v.includes('N1:') && !v.includes('B1:dotted'), v);
  await p.emulateMedia({media:'screen'});
  await p.fill('#invs-extra-code','23223'); await p.fill('#invs-extra-qty','400'); await p.click('#invs-extra-add'); await p.waitForTimeout(800);
  const d=await p.evaluate(()=>window.__STORE.requisitions.get('REQ-H1-X').invs_extra_items);
  check('extra item saved', d && d.length===1 && d[0].drugId==='23223' && d[0].qty===400, JSON.stringify(d));
  check('extra item listed', (await p.innerText('body')).includes('23223'));
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); process.exit(1);});
