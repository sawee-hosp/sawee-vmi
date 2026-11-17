// v6.28: ส่งออกข้อมูลวิจัย (แอดมิน) — อ่านอย่างเดียว · กรองวันที่ · นับก่อนยืนยัน · ปกปิดตัวบุคคล U001… · manifest + data_dictionary
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const ts=(iso)=>({seconds:Math.floor(Date.parse(iso)/1000),nanoseconds:0});
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'a1'},collections:{
  master_drugs:{D1:{drug_id:'D1',drug_name:'Paracetamol',unit_id:'U1',type:'1',price:1,pack_size:1}},
  master_unit:{U1:{unit_id:'U1',unit_name:'เม็ด'}},config:{},
  master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ',phone:'077-000000',contact_email:'h@x.th'}},
  config_par:{'H1_D1':{hospital_id:'H1',drug_id:'D1',par_qty:100}},
  requisitions:{
    R1:{hospitalId:'H1',status:'Completed',month:9,year:2026,created_at:ts('2026-08-25T03:00:00Z'),created_by_uid:'uA',created_by_name:'สมศรี ใจดี',approved_by_uid:'a1',approved_by_name:'แอดมิน',
      sign_names:['สมศรี ใจดี','x'],sign_roles:['ผอ.'],line_dispensed_by:'แอดมิน',items:[{drugId:'D1',dispenseQty:100,price:1,adjusted_by_uid:'uA'}]},
    R2:{hospitalId:'H1',status:'Cancelled',draft_deleted:true,month:10,year:2026,created_at:ts('2026-09-25T03:00:00Z'),created_by_uid:'uB',created_by_name:'สมชาย'},
    R0:{hospitalId:'H1',status:'Completed',month:7,year:2026,created_at:ts('2026-07-10T03:00:00Z'),created_by_uid:'uA'}},
  rpst_emergency:{E1:{hospitalId:'H1',status:'Approved',reason:'ยาหมด',created_at:ts('2026-09-01T03:00:00Z'),created_by_uid:'uA',created_by_name:'สมศรี ใจดี'}},
  stock_returns:{S1:{hospital_id:'H1',created_at:ts('2026-09-02T03:00:00Z'),created_by_uid:'uB',items:[{drugId:'D1',returnQty:5}]}},
  vmi_stock_counts:{C1:{hospital_id:'H1',count_date:'2026-09-03',counted_by_name:'สมศรี ใจดี',items:[{drugId:'D1',counted:90}]},C0:{hospital_id:'H1',count_date:'2026-07-03'}},
  vmi_stock_events:{V1:{hospital_id:'H1',drug_id:'D1',event_type:'MANUAL_ADJUST',qty_delta:-5,created_at:ts('2026-09-04T03:00:00Z'),manual_adjusted_by_uid:'uA',manual_adjusted_by_name:'สมศรี ใจดี'}},
  vmi_virtual_lots:{L1:{hospital_id:'H1',drug_id:'D1',lot_no:'A1',remaining_qty:90,received_at:ts('2026-06-01T00:00:00Z')}},
  cache_tombstones:{T1:{col:'requisitions',doc_id:'RX',deleted_at:ts('2026-09-10T00:00:00Z'),by:'a1'},T2:{col:'users',doc_id:'uZ',deleted_at:ts('2026-09-10T00:00:00Z'),by:'a1'}},
  internal_requisitions:{I1:{deptId:'WARD',created_at:ts('2026-09-01T00:00:00Z')}},
  line_logs:{X:{to_name:'ใคร'}},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x'},uA:{name:'สมศรี ใจดี',role:'hospital',hospital_id:'H1',email:'s@x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1400,height:900},acceptDownloads:true})).newPage(); await p.clock.install({time:new Date('2026-11-16T10:00:00')});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
  await p.evaluate(()=>{ window.__ZIP={}; window.JSZip=class{ file(n,c){ window.__ZIP[n]=c; } async generateAsync(){ return new Blob(['zip']); } }; });
  await p.click('button:has-text("ส่งออกข้อมูลวิจัย")'); await p.waitForSelector('#research-export');
  check('default range 2026-08-01 → today', await p.inputValue('#rx-from')==='2026-08-01' && await p.inputValue('#rx-to')==='2026-11-16');
  const w0=await p.evaluate(()=>window.__WRITES||0);
  await p.click('#rx-count'); await p.waitForSelector('#rx-count-table');
  const cnt=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#rx-count-table tr[data-col]')].map(r=>[r.dataset.col,r.querySelector('.rx-count').innerText.trim()])));
  check('counts per collection (date filtered)', cnt.requisitions==='2' && cnt.vmi_stock_counts==='1' && cnt.vmi_virtual_lots==='1' && cnt.cache_tombstones==='2', JSON.stringify(cnt));
  check('no internal/users/line collections listed', !('users' in cnt) && !('internal_requisitions' in cnt) && !('line_logs' in cnt) && !('pick_slips' in cnt));
  const dl=p.waitForEvent('download').catch(()=>null);
  await p.click('#rx-export'); await p.click('.fixed button:has-text("อ่านและดาวน์โหลด")'); await p.waitForSelector('#rx-done',{timeout:10000});
  const d=await dl; check('download filename', d && /^rxfill_research_20261116_\d{4}\.zip$/.test(d.suggestedFilename()), d && d.suggestedFilename());
  const Z=await p.evaluate(()=>window.__ZIP); const J=k=>JSON.parse(Z[k]||'null');
  check('zip files', ['requisitions','rpst_emergency','stock_returns','vmi_stock_counts','vmi_stock_events','vmi_virtual_lots','config_par','master_drugs','master_hospitals','deleted_docs','manifest','data_dictionary'].every(k=>Z[k+'.json']) && !Z['users.json'] && !Z['internal_requisitions.json'], Object.keys(Z).join(','));
  const reqs=J('requisitions.json'); const r1=reqs.find(r=>r._id==='R1'), r2=reqs.find(r=>r._id==='R2');
  check('requisitions: range + cancelled/draft_deleted kept', reqs.length===2 && r2 && r2.draft_deleted===true && !reqs.some(r=>r._id==='R0'));
  const all=JSON.stringify(Object.values(Z));
  check('no real names/uids/emails/phones in zip', !/สมศรี|สมชาย|"uA"|"uB"|"a1"|a@x|h@x|077-000000|แอดมิน"/.test(all), (all.match(/สมศรี|uA|077-000000/)||[])[0]);
  const ev=J('vmi_stock_events.json')[0], em=J('rpst_emergency.json')[0], cn=J('vmi_stock_counts.json')[0];
  check('same person = same code across files (uid + name-only)', r1.created_by_uid===r1.created_by_name && r1.created_by_uid===ev.manual_adjusted_by_uid && ev.manual_adjusted_by_name===r1.created_by_uid && em.created_by_uid===r1.created_by_uid && cn.counted_by_name===r1.created_by_uid && /^U\d{3}$/.test(r1.created_by_uid) && r1.items[0].adjusted_by_uid===r1.created_by_uid, JSON.stringify([r1.created_by_uid,r1.created_by_name,ev.manual_adjusted_by_name,cn.counted_by_name]));
  check('removed: sign_*, line_*, phone/email', !('sign_names' in r1) && !('sign_roles' in r1) && !('line_dispensed_by' in r1) && !('phone' in J('master_hospitals.json')[0]) && !('contact_email' in J('master_hospitals.json')[0]));
  check('hospital id/name kept', r1.hospitalId==='H1' && J('master_hospitals.json')[0].hospital_name==='รพ.สต.ทุ่งระยะ');
  check('timestamps → ISO 8601', r1.created_at==='2026-08-25T03:00:00.000Z' && J('vmi_virtual_lots.json')[0].received_at==='2026-06-01T00:00:00.000Z', r1.created_at);
  const del=J('deleted_docs.json'); check('deleted_docs: tombstones of exported collections only, by pseudonymized', del.length===1 && del[0].doc_id==='RX' && /^U\d{3}$/.test(del[0].by), JSON.stringify(del));
  const man=J('manifest.json'); check('manifest', man.app_version && man.date_from==='2026-08-01' && man.date_to==='2026-11-16' && man.doc_counts.requisitions===2 && man.pseudonymized_user_count>=3 && man.removed_fields.includes('sign_names') && !all.includes('"uA"'), JSON.stringify(man).slice(0,300));
  const dict=J('data_dictionary.json'); const f=dict.requisitions.find(x=>x.field==='items[].dispenseQty'), c=dict.requisitions.find(x=>x.field==='created_at');
  check('data dictionary (fields incl. items[], types, docs count, example)', f && f.types.includes('number') && f.docs_with_field===1 && f.example===100 && c && c.types.includes('timestamp (ISO 8601)') && c.docs_with_field===2, JSON.stringify([f,c]));
  check('read only: no Firestore writes', (await p.evaluate(()=>window.__WRITES||0))===w0);
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
