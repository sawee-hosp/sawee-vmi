// v6.16: slip จัดยา (กระดาษต่อเนื่อง) · จ่ายล่วงหน้า "รับแล้ว" → รวมเข้าใบเบิกหน่วยงาน "3+2(รับแล้ว)" แก้/ลบไม่ได้ · แอดมินรวมอัตโนมัติ + ปิดเมื่ออนุมัติ
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const NOW=new Date('2026-10-28T10:00:00');
const base={
  master_drugs:{D1:{drug_id:'D1',drug_name:'Syringe 5 ml',unit_id:'U1',type:'2',price:100,pack_size:100,invs_location:'12/1/1'},D2:{drug_id:'D2',drug_name:'NSS 1000 ml',unit_id:'U2',type:'2',price:250,pack_size:10,invs_location:'7/1/2-1'}},
  master_unit:{U1:{unit_id:'U1',unit_name:'ชิ้น'},U2:{unit_id:'U2',unit_name:'ขวด'}},config:{},master_hospitals:{},
  master_depts:{WARD:{dept_id:'WARD',dept_name:'ตึกผู้ป่วยหญิง',kind:'dept',active:true}},
  req_rounds:{R2:{id:'R2',fiscal_year:2570,round_no:2,round_date:'2026-11-02',scope:'internal',active:true}},
  internal_requisitions:{},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'x'},d1:{name:'พยาบาล',role:'dept',dept_id:'WARD',email:'d@x'}}};
const seed=(uid,extra)=>fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid},collections:Object.assign({},base,extra||{})})+';');
const newPage=async(b,uid,extra,file)=>{ seed(uid,extra); const p=await (await b.newContext({viewport:{width:1500,height:900}})).newPage(); await p.clock.install({time:NOW}); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); await p.goto('file://'+path.join(DIR,file)); await p.waitForTimeout(1500); return {p,errs}; };
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  // 1) slip จัดยา
  {
    const {p,errs}=await newPage(b,'a1',{},'t_app.html');
    const html=await p.evaluate(()=>buildPickSlipHtml({ widthMm: 80, unitTitle: 'ตึกผู้ป่วยหญิง', ctx: { findDrug: (id) => ({ D1: { pack_size: 100, invs_location: '12/1/1', drug_name: 'Syringe 5 ml' }, D2: { pack_size: 10, invs_location: '7/1/2-1', drug_name: 'NSS 1000 ml' } })[id], appDb: { units: [] } },
      req: { invs_sub_po_no: 'PO9', items: [], invs_request_lot_snapshot: [
        { drug_id: 'D1', qty: 350, stock_before: 1250, stock_after: 900, lots_after: [{ lot_no: 'S1', expiry: '20270101', qty_issue: 250, qty_after: 0 }, { lot_no: 'S2', expiry: '20280101', qty_issue: 100, qty_after: 900 }] },
        { drug_id: 'D2', qty: 25, stock_before: 45, stock_after: 20, lots_after: [{ lot_no: 'N1', expiry: '20270501', qty_issue: 25, qty_after: 20 }] } ] } }));
    const iD2=html.indexOf('NSS 1000 ml'), iD1=html.indexOf('Syringe 5 ml');
    check('slip: sorted by location (7/… before 12/…)', iD2>0 && iD1>iD2);
    check('slip: qty / lots / EXP / stock after in big units', /เบิก <b class="big">3\(50\)<\/b>/.test(html) && /<b>S1<\/b> <span class="sm">EXP 01\/01\/70<\/span><span class="lq">2\(50\)<\/span>/.test(html) && /เหลือคลัง <b>9<\/b>/.test(html) && /เบิก <b class="big">2\(5\)<\/b>/.test(html));
    check('slip: 80 mm page + auto height script', html.includes('@page{size:80mm') && html.includes('scrollHeight'));
    check('slip: default paper = A4', await p.evaluate(()=>getSlipPaper())==='a4');
    // 2) แอดมินบันทึกจ่ายล่วงหน้า
    await p.click('text=คิวใบเบิกภายใน รพ.'); await p.waitForTimeout(500);
    await p.click('button:has-text("จ่ายล่วงหน้า (รับแล้ว)")'); await p.waitForSelector('#predisp-admin');
    await p.fill('#pd-drug','D2'); await p.click('#predisp-admin button:has-text("เลือก")'); await p.waitForTimeout(200);
    await p.fill('#pd-add-input','2'); await p.click('#pd-add-row'); await p.click('#pd-save'); await p.waitForTimeout(600);
    const pd=await p.evaluate(()=>[...(window.__STORE.internal_predispense||new Map()).values()].map(d=>d.deptId+':'+d.status+':'+d.items.map(i=>i.drugId+'='+i.qty).join(',')));
    check('predispense: admin saved (2 packs = 20)', JSON.stringify(pd)==='["WARD:Active:D2=20"]', JSON.stringify(pd));
    check('admin page: no errors', !errs.length, errs.join(' | '));
  }
  // 3) หน่วยงานสร้างใบรอบ 2 → รวม "รับแล้ว" อัตโนมัติ · ช่องจำนวน = ยอดเบิกปกติ
  const P1={deptId:'WARD',dept_name:'ตึกผู้ป่วยหญิง',status:'Active',given_date:'2026-10-27',items:[{drugId:'D2',name:'NSS 1000 ml',unit:'ขวด',packSize:10,price:250,type:'2',qty:20}]};
  {
    const {p,errs}=await newPage(b,'d1',{internal_predispense:{P1}},'t_internal.html');
    await p.click('text=สร้างใบเบิก>>nth=0'); await p.waitForTimeout(400);
    await p.click('button:has-text("เริ่มกรอกใบเบิก")'); await p.waitForTimeout(500);
    check('dept: banner + locked received badge', await p.isVisible('#predisp-merge-banner') && (await p.innerText('body')).includes('+2 รับแล้ว'));
    check('dept: cannot delete received-only line', (await p.locator('tr',{hasText:'NSS 1000 ml'}).locator('button[aria-label^="ลบ"]').count())===0);
    await p.fill('#qty-D2','3'); await p.waitForTimeout(200);
    check('dept: shows 3+2(รับแล้ว)', (await p.innerText('body')).includes('3+2(รับแล้ว)'));
    await p.click('button:has-text("ส่งใบเบิก")'); await p.waitForTimeout(300); await p.click('.fixed button:has-text("ส่งใบเบิก")'); await p.waitForTimeout(900);
    const r=await p.evaluate(()=>{ const d=[...window.__STORE.internal_requisitions.values()][0]; return d ? { ids:d.predisp_ids, items:d.items.map(i=>i.drugId+':'+i.requestQty+':'+(i.predispQty||0)) } : null; });
    check('dept: saved total 50 = 30 + 20 received, predisp_ids', r && JSON.stringify(r.items)==='["D2:50:20"]' && JSON.stringify(r.ids)==='["P1"]', JSON.stringify(r));
    const form=await p.evaluate(()=>buildInternalReqFormHtml({ req: { kind: 'dept', dept_name: 'ตึกผู้ป่วยหญิง', items: [{ drugId: 'D2', name: 'NSS 1000 ml', unit: 'ขวด', packSize: 10, price: 250, type: '2', requestQty: 50, dispenseQty: 50, predispQty: 20 }] }, formNo: '2/2570', formDate: '2026-11-02', deptName: 'ตึกผู้ป่วยหญิง', drugTypes: null }));
    check('dept print form: 3+2(รับแล้ว)', form.includes('3+2(รับแล้ว)'));
    check('dept: no errors', !errs.length, errs.join(' | '));
  }
  // 4) แอดมิน: ใบที่ยังไม่มีรายการรับแล้ว → รวมอัตโนมัติตอนตรวจ INVS → อนุมัติแล้วปิดเป็น Merged
  {
    const IR={deptId:'WARD',dept_name:'ตึกผู้ป่วยหญิง',kind:'dept',status:'Pending',round_id:'R2',round_no:2,form_no:'2/2570',submitted_at:'2026-10-28T01:00:00Z',items:[{drugId:'D1',name:'Syringe 5 ml',unit:'ชิ้น',packSize:100,price:100,type:'2',requestQty:100,dispenseQty:100}],total_value:100};
    const {p,errs}=await newPage(b,'a1',{internal_predispense:{P1},internal_requisitions:{IR1:IR}},'t_app.html');
    await p.route('http://127.0.0.1/**', async r=>{ const body=JSON.parse(r.request().postData()||'{}'); const items=[{drug_id:'D1',qty:100,cost:1,value:100,vmi_pack_size:100,stock_before:500,stock_after:400},{drug_id:'D2',qty:20,cost:25,value:500,vmi_pack_size:10,stock_before:40,stock_after:20}];
      await r.fulfill({contentType:'application/json',body:JSON.stringify(body.action==='preflight'?{ok:true,item_count:2,total_value:600,items,warnings:[],errors:[],live_send_enabled:true}:{ok:true,sub_po_no:'PO10',items})}); });
    await p.click('text=คิวใบเบิกภายใน รพ.'); await p.waitForTimeout(500); await p.click('tr:has-text("ตึกผู้ป่วยหญิง")'); await p.waitForTimeout(700);
    check('admin: predispense banner', await p.isVisible('#iq-predisp-banner'));
    await p.click('button:has-text("ตรวจ INVS แล้วอนุมัติ")'); await p.waitForTimeout(1200);
    const it=await p.evaluate(()=>window.__STORE.internal_requisitions.get('IR1').items.map(i=>i.drugId+':'+i.dispenseQty+':'+(i.predispQty||0)));
    check('admin: auto-merged into earliest req', JSON.stringify(it)==='["D1:100:0","D2:20:20"]', JSON.stringify(it));
    await p.click('button:has-text("ส่งเข้า INVS และอนุมัติ")'); await p.waitForTimeout(1500);
    const st=await p.evaluate(()=>({r:window.__STORE.internal_requisitions.get('IR1').status, v:window.__STORE.internal_requisitions.get('IR1').approved_total_value, p:window.__STORE.internal_predispense.get('P1').status}));
    check('admin: approved (INVS value 600) + predispense Merged', st.r==='Completed' && st.v===600 && st.p==='Merged', JSON.stringify(st));
    check('admin: no errors', !errs.length, errs.join(' | '));
  }
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
