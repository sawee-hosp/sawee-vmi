const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'a1'},collections:{
  master_drugs:{D1:{drug_id:'D1',drug_name:'Paracetamol 500',unit_id:'U1',type:'1',price:1,pack_size:1,old_code:'013'}},master_unit:{U1:{unit_id:'U1',unit_name:'TAB'}},master_depts:{},config:{},
  master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ'}},
  requisitions:{R1:{hospitalId:'H1',status:'Pending',month:11,year:2026,items:[{drugId:'D1',name:'Paracetamol 500',dispenseQty:1500}],invs_status:'SENT',invs_sub_po_no:'PO123',invs_sent_at:'2026-10-21T03:00:00Z',
    invs_request_lot_snapshot:[{drug_id:'D1',qty:1500,lot_no:'A1',expiry:'20270131',cost:0.5,value:750,stock_before:5000,stock_after:3500,stock_lots:2,alloc:[{lot_no:'A1',expiry:'20270131',qty:1000},{lot_no:'B2',expiry:'20280531',qty:500}]}],created_at:'2026-10-20T00:00:00Z'}},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1800);
  await p.evaluate(()=>{window.__ctxOpen=true;});
  await p.click('tr.cursor-pointer >> nth=0');await p.waitForTimeout(1200); await p.waitForTimeout(1000);
  const has=await p.isVisible('#print-invs-stock'); console.log('button',has);
  if(has){ await p.evaluate(()=>{HTMLIFrameElement.prototype.__x=1; window.print=()=>{};}); await p.click('#print-invs-stock'); await p.waitForTimeout(500);
    const html=await p.evaluate(()=>{const f=document.querySelector('iframe[aria-hidden]');return f?f.contentWindow.document.documentElement.outerHTML:''});
    fs.writeFileSync(path.join(DIR,'stk.html'),html); console.log(/3,500/.test(html), /B2/.test(html), /D1\(013\)/.test(html)); }
  console.log('errors',errs.join('|')||'none'); await b.close();
})();
