/* =====================================================================
   foot.js — ระบบส่งตรวจเท้าผู้ป่วยเบาหวาน (โหลดจาก refer.html เมื่อเปิดแท็บ "ตรวจเท้าเบาหวาน")
   พยาบาล/เภสัชกร รพ.สวี : ใส่ HN → เลือก รพ.สต. + วันตรวจเท้าของหน่วยนั้น → พิมพ์ฟอร์ม A4 ให้ผู้ป่วยถือไป
   เจ้าหน้าที่ รพ.สต.    : ดูรายชื่อตามวันตรวจ → บันทึกผลตรวจในเว็บ (ตัวเลือกเดียวกับหน้าจอ HOSxP)
   admin                : แก้ตารางวันตรวจเท้าของแต่ละ รพ.สต.
   ผลตรวจเก็บใน foot_referrals/{FT_HN_ปีงบ} · การส่งผลเข้า HOSxP (คัดกรองนอกสถานบริการ) ทำโดยเครื่อง server ภายหลัง
   ===================================================================== */

let C = null;                 // บริบทจาก refer.html
let ROUNDS = null;            // [{hcode, name, dates:[], time}]
let OPTS = null;              // ตัวเลือกจาก HOSxP (config/foot_options) หรือค่าตั้งต้น
let ROWS = [];                // foot_referrals ที่โหลด
let VIEW = {hcode:'', date:null};
const FT = {hn:null, ans:null};

/* ---------- ตารางวันนัดตรวจเท้า ปีงบ 2570 (จากเอกสาร รพ.สวี) — admin แก้ได้ในหน้านี้ ---------- */
const DEFAULT_ROUNDS = [
  ['ทุ่งระยะ',        ['2027-01-14','2027-01-15'], ''],
  ['บ้านแก่งกระทั่ง',  ['2027-01-11','2027-01-12'], ''],
  ['ปากแพรก',         ['2027-01-04'], ''],
  ['นาสัก',           ['2027-01-19','2027-01-20'], ''],
  ['สวี',             ['2027-01-14','2027-01-15'], ''],
  ['ด่านสวี',          ['2027-01-14'], '08:30–12:00 น.'],
  ['เขาทะลุ',          ['2026-12-17','2026-12-18'], '08:30–12:00 น.'],
  ['วิสัยใต้',          ['2026-11-25','2026-11-26','2026-11-27'], ''],
  ['บ้านน้ำฉา',        ['2027-01-14','2027-01-15'], ''],
  ['บ้านคลองน้อย',     ['2026-12-17'], ''],
  ['บ้านไทยพัฒนา',     ['2027-01-14','2027-01-15'], ''],
  ['เขาค่าย',          ['2026-10-29','2026-10-30'], ''],
  ['บ้านควนสามัคคี',   ['2027-01-15','2027-01-22','2027-01-29'], ''],
  ['บ้านดอนทราย',     ['2026-12-16','2026-12-17','2026-12-18'], ''],
  ['ครน',             ['2026-12-17','2026-12-18'], ''],
  ['ท่าหิน',           ['2026-12-03','2026-12-04'], '09:00–12:00 น.'],
];

/* ---------- ตัวเลือก (ใช้เมื่อเครื่อง server ยังไม่ได้ส่งรายการจริงจาก HOSxP ขึ้นมา) ---------- */
const DEFAULT_OPTS = {
  result:             ['ปกติ','ความเสี่ยงต่ำ','ความเสี่ยงปานกลาง','ความเสี่ยงสูง','มีแผลที่เท้า'],
  ulcer:              ['ไม่พบแผล','พบแผล'],
  history_ulcer:      ['ไม่เคย','เคย'],
  history_amputation: ['ไม่เคย','เคยตัดนิ้วเท้า','เคยตัดขา/เท้า'],
  history_sensory:    ['ไม่เคย','เคย'],
  nail:               ['ปกติ','ผิดปกติ'],
  wart:               ['ไม่พบ','พบ'],
  footshape:          ['ปกติ','ผิดรูป'],
  hair:               ['ปกติ','ขนหลุดร่วง'],
  temperature:        ['ปกติ','อุ่นผิดปกติ','เย็นผิดปกติ'],
  tenia:              ['ไม่พบ','พบ'],
  skin_color:         ['ปกติ','ผิดปกติ'],
  sensory:            ['ปกติ','ผิดปกติ'],
  die_skin:           ['ไม่พบ','พบ'],
  posterior_tibial:   ['ปกติ','เบา','คลำไม่ได้'],
  dorsalis_pedis:     ['ปกติ','เบา','คลำไม่ได้'],
};
/* รายการตรวจ: [key, ป้าย, ตัวเลือก, ข้าง?]  ข้าง = ต้องบันทึกซ้าย/ขวา (ตรงกับคอลัมน์ HOSxP) */
const ITEMS = [
  ['result',             'ผลตรวจเท้า',                   'result',             true],
  ['ulcer',              'การตรวจพบแผลที่เท้า',            'ulcer',              false],
  ['history_ulcer',      'ประวัติการเป็นแผลที่เท้า',         'history_ulcer',      false],
  ['history_amputation', 'ประวัติการตัดนิ้ว/ขา/เท้า',        'history_amputation', false],
  ['nail',               'การตรวจปัญหาที่เล็บ',             'nail',               false],
  ['wart',               'การตรวจพบหูด ตาปลา',            'wart',               false],
  ['footshape',          'การตรวจพบเท้าผิดรูป',            'footshape',          false],
  ['hair',               'การตรวจพบเส้นขนหลุดร่วง',         'hair',               false],
  ['temperature',        'การสัมผัสไออุ่นบริเวณเท้า',        'temperature',        false],
  ['tenia',              'การตรวจพบเชื้อราที่เท้า',           'tenia',              false],
  ['skin_color',         'ผลการตรวจสีผิวหนัง',             'skin_color',         false],
  ['die_skin',           'การตรวจพบเนื้อตาย',              'die_skin',           false],
  ['sensory',            'ผลการตรวจประเมินความรู้สึก',       'sensory',            false],
  ['history_sensory',    'ประวัติการเสียความรู้สึก',          'history_sensory',    false],
  ['posterior_tibial',   'ชีพจร Posterior tibial',         'posterior_tibial',   true],
  ['dorsalis_pedis',     'ชีพจร Dorsalis pedis',           'dorsalis_pedis',     true],
];
/* จุดตรวจ monofilament 6 จุด/ข้าง (เลขตรงกับ "แบบประเมินความรู้สึกเท้า" ใน HOSxP — ตรวจตำแหน่งกับหน้าจอจริงอีกครั้ง) */
const POINTS = [
  {n:1, x:70, y:24,  t:'ปลายนิ้วหัวแม่เท้า'},
  {n:2, x:44, y:22,  t:'ปลายนิ้วกลาง'},
  {n:3, x:68, y:70,  t:'โคนนิ้วหัวแม่เท้า'},
  {n:4, x:48, y:66,  t:'โคนนิ้วกลาง'},
  {n:5, x:28, y:76,  t:'โคนนิ้วก้อย'},
  {n:6, x:50, y:190, t:'ส้นเท้า'},
];

const localISO = (d=new Date()) => new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
const fiscalBE = iso => { const [y,m] = String(iso).split('-').map(Number); return (m>=10 ? y+1 : y) + 543; };
const norm = s => String(s||'').replace(/โรงพยาบาลส่งเสริมสุขภาพตำบล|รพ\.?สต\.?|\s/g,'');
const optList = k => (OPTS?.[k]?.length ? OPTS[k] : (DEFAULT_OPTS[k]||[]).map(name=>({id:null, name})));
const canSend = () => C.isAdmin() || C.isHospital();
const canResult = r => C.isAdmin() || C.isHospital() || (C.isRpst() && r.hcode===C.myHcode());

/* ---------- โหลดค่า ---------- */
async function loadRounds(){
  const {db, fs} = C;
  try{
    const d = await fs.getDoc(fs.doc(db,'config','foot_rounds'));
    if(d.exists() && Array.isArray(d.data().rounds)){ ROUNDS = d.data().rounds; return; }
  }catch(e){}
  // ยังไม่มีใน Firestore → จับคู่ชื่อในตารางกับรายชื่อ รพ.สต. ในระบบ
  ROUNDS = DEFAULT_ROUNDS.map(([nm, dates, time])=>{
    const n = norm(nm);
    let u = C.RPST.filter(r=>norm(r.name)===n);
    if(u.length!==1) u = C.RPST.filter(r=>norm(r.name).endsWith(n));
    if(u.length!==1) u = C.RPST.filter(r=>norm(r.name).includes(n));
    return {hcode: u.length===1 ? u[0].hcode : '', name:'รพ.สต.'+nm, dates, time};
  });
}
async function loadOpts(){
  try{
    const d = await C.fs.getDoc(C.fs.doc(C.db,'config','foot_options'));
    OPTS = d.exists() ? (d.data().options||null) : null;
  }catch(e){ OPTS = null; }
}
async function loadRows(){
  const {db, fs} = C;
  const col = fs.collection(db,'foot_referrals');
  const q = C.isRpst() ? fs.query(col, fs.where('hcode','==',C.myHcode())) : col;
  const s = await fs.getDocs(q);
  ROWS = s.docs.map(d=>({id:d.id, ...d.data()}));
}
const roundOf = h => ROUNDS.find(r=>r.hcode===h);

/* ===================================================================== */
export async function renderFoot(ctx){
  C = ctx;
  const root = C.$('foot-root'); if(!root) return;
  root.innerHTML = '<div class="sub" style="padding:20px">กำลังโหลด...</div>';
  try{ await Promise.all([loadRounds(), loadOpts(), loadRows()]); }
  catch(e){ root.innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${C.esc(e.code||e.message)}${e.code==='permission-denied'?' — ต้อง Publish firestore.rules ชุดใหม่':''}</div>`; return; }
  if(C.isRpst()) VIEW.hcode = C.myHcode();
  root.innerHTML = `
    ${canSend()?`<div class="card"><h2>ส่งตรวจเท้าผู้ป่วยเบาหวาน <span class="note">ใส่ HN → เลือก รพ.สต. และวันตรวจ → พิมพ์ฟอร์ม A4 ให้ผู้ป่วยถือไป</span></h2>
      <div class="frm"><div class="fld"><label>HN</label>
        <input type="text" id="ft-hn" inputmode="numeric" style="font-size:20px;width:200px;padding:8px 10px" placeholder="เช่น 640008392"></div>
        <button class="btn-primary" id="ft-go" style="font-size:17px;padding:10px 26px">ค้นหา</button></div>
      <div id="ft-res" style="margin-top:12px"></div></div>`:''}
    <div class="card"><h2>รายชื่อนัดตรวจเท้า <span class="note" id="ft-count"></span></h2>
      <div class="frm" style="align-items:flex-end">
        ${C.isRpst()?'':`<div class="fld"><label>รพ.สต.</label><select id="ft-f-h"><option value="">ทุกหน่วย</option>${
          C.RPST.map(r=>`<option value="${C.esc(r.hcode)}">${C.esc(r.name)}</option>`).join('')}</select></div>`}
        <div class="fld"><label>วันตรวจ</label><select id="ft-f-d"></select></div>
        <div class="fld"><label>สถานะ</label><select id="ft-f-s"><option value="">ทั้งหมด</option>
          <option value="sent">ยังไม่บันทึกผล</option><option value="done">ตรวจแล้ว</option><option value="absent">ไม่มาตรวจ</option></select></div>
        <button class="btn-sm grey" id="ft-reload">โหลดใหม่</button></div>
      <div id="ft-sum" style="margin:10px 0"></div>
      <div id="ft-list"></div></div>
    ${C.isAdmin()?`<div class="card"><h2>ตารางวันตรวจเท้า <span class="note">ของแต่ละ รพ.สต. (ใส่วันที่แบบ ค.ศ. คั่นด้วยจุลภาค เช่น 2027-01-14, 2027-01-15)</span></h2>
      <div id="ft-rounds"></div></div>`:''}`;
  if(canSend()){
    C.$('ft-go').addEventListener('click', ()=>lookup());
    C.$('ft-hn').addEventListener('keydown', e=>{ if(e.key==='Enter') lookup(); });
    setTimeout(()=>C.$('ft-hn')?.focus(), 50);
  }
  C.$('ft-f-h')?.addEventListener('change', e=>{ VIEW.hcode=e.target.value; VIEW.date=null; paintList(); });
  C.$('ft-f-d').addEventListener('change', e=>{ VIEW.date=e.target.value; paintList(); });
  C.$('ft-f-s').addEventListener('change', paintList);
  C.$('ft-reload').addEventListener('click', async ()=>{ await loadRows(); paintList(); });
  paintList();
  if(C.isAdmin()) paintRounds();
}

/* ---------- ค้นหา HN (ถามเครื่อง server ผ่าน hn_lookup เหมือนหน้าส่งตัว) ---------- */
async function lookup(){
  const {db, fs, esc} = C;
  const hn = C.$('ft-hn').value.replace(/\D/g,'');
  if(!hn) return;
  const H = C.hn9(hn), el = C.$('ft-res');
  const ex = ROWS.find(r=>r.hn===H && r.fy===fiscalBE(localISO()));
  if(ex){ el.innerHTML = existingBox(ex); bindExisting(ex); return; }
  const ws = await C.watcherState();
  if(ws==='off'){ renderSendForm(H, null); return; }
  el.innerHTML = `<div class="msg info" style="font-size:16px"><b>⏳ กำลังดึงข้อมูลผู้ป่วย HN ${esc(H)}...</b></div>`;
  let ref;
  try{ ref = await fs.addDoc(fs.collection(db,'hn_lookup'), {hn:H, status:'pending', requested_uid:C.ME.uid,
         requested_by:C.PROFILE.full_name||C.ME.email, requested_at:fs.serverTimestamp()}); }
  catch(e){ renderSendForm(H, null); return; }
  let done=false;
  const t = setTimeout(()=>{ if(done) return; done=true; un(); renderSendForm(H, null); }, ws==='fast'?15000:30000);
  const un = fs.onSnapshot(ref, d=>{
    const x=d.data(); if(!x || x.status==='pending' || done) return;
    done=true; clearTimeout(t); un();
    if(x.verdict==='not_found'){ el.innerHTML=`<div class="msg err" style="font-size:16px"><b>ไม่พบ HN ${esc(H)} ใน HOSxP</b></div>`; return; }
    renderSendForm(C.hn9(x.hn_hosxp||H), x.status==='done'?x:null);
  }, ()=>{});
}
function existingBox(r){
  const {esc, thDate} = C;
  return `<div class="msg info" style="font-size:16px"><div style="width:100%"><b>ส่งตรวจเท้าปีงบ ${r.fy} แล้ว</b>
    — ${esc(r.hcode_name||C.rpstName(r.hcode))} วันที่ <b>${thDate(r.exam_date)}</b> ${statusTag(r)}
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-primary" id="ft-ex-print">🖨 พิมพ์ฟอร์ม A4 อีกครั้ง</button>
      ${r.status==='sent'?'<button class="btn-ghost" id="ft-ex-edit">เปลี่ยนวัน/หน่วย</button>':''}</div></div></div>`;
}
function bindExisting(r){
  C.$('ft-ex-print')?.addEventListener('click', ()=>printFootForm(r));
  C.$('ft-ex-edit')?.addEventListener('click', ()=>renderSendForm(r.hn, {patient:r.patient, hn_hosxp:r.hn, clinics_in_scope:r.clinics||[]}, r));
}

/* ---------- ฟอร์มส่ง: เลือก รพ.สต. + วันตรวจของหน่วยนั้น ---------- */
function renderSendForm(H, ans, edit=null){
  const {esc, thDate} = C, el = C.$('ft-res');
  const p = ans?.patient||{}, known = !!p.full_name;
  const pre = edit?.hcode || (C.RPST.some(r=>r.hcode===ans?.hcode_guess) ? ans.hcode_guess : '');
  const cl = ans?.clinics_in_scope||[];
  const dm = cl.some(c=>/เบาหวาน|dm/i.test(c));
  el.innerHTML = `
    ${known?`<div class="sec" style="background:#fff"><b style="font-size:20px">${esc(p.full_name)}</b>
      <span class="sub" style="font-size:14px">HN ${esc(H)} · ${esc(p.sex||'')} ${p.age!=null?esc(p.age)+' ปี':''}</span>
      <div style="margin-top:6px">${cl.map(c=>`<span class="pill pill-rem" style="font-size:13px;margin-right:4px">${esc(c)}</span>`).join('')}
      ${ans && !dm?'<span class="pill pill-warn">ไม่พบคลินิกเบาหวานใน HOSxP</span>':''}</div></div>`:''}
    <div class="sec" style="border:2px solid var(--accent);background:#fff">
      <div class="st" style="font-size:17px;color:var(--accent-deep)">${edit?'แก้นัดตรวจเท้า':'ส่งตรวจเท้า'} HN ${esc(H)}</div>
      ${known?'':`<div class="fld" style="margin-top:8px"><label>ชื่อ-สกุลผู้ป่วย</label><input type="text" id="ft-name" style="min-width:280px" value="${esc(edit?.patient?.full_name||'')}"></div>`}
      <div class="fld" style="margin-top:8px"><label style="font-size:14px">1. รพ.สต. ที่ไปตรวจ</label>
        <select id="ft-h" style="min-width:280px;font-size:17px;padding:8px 10px"><option value="">-- เลือก รพ.สต. --</option>${
          C.RPST.map(r=>`<option value="${esc(r.hcode)}"${r.hcode===pre?' selected':''}>${esc(r.name)}</option>`).join('')}</select>
        ${pre&&!edit&&ans?.hcode_guess===pre?'<span class="sub" style="margin-left:8px">เลือกให้ตามที่อยู่/สิทธิ</span>':''}</div>
      <div class="fld" style="margin-top:12px"><label style="font-size:14px">2. วันตรวจเท้า</label>
        <div id="ft-days" style="display:flex;flex-wrap:wrap;gap:8px"></div>
        <div class="sub" style="margin-top:6px">หรือวันอื่น <input type="date" id="ft-d" min="${localISO()}" value="${esc(edit?.exam_date||'')}"></div></div>
      <div class="frm" style="margin-top:14px"><button class="btn-primary" id="ft-save" style="font-size:18px;padding:13px 34px">${edit?'บันทึก':'ส่งตรวจเท้า + พิมพ์ฟอร์ม'}</button></div>
      <div id="ft-msg" style="margin-top:8px"></div></div>`;
  const paint = () => {
    const h = C.$('ft-h').value, sel = C.$('ft-d').value, rd = roundOf(h);
    const up = (rd?.dates||[]).filter(d=>d>=localISO()).sort();
    C.$('ft-days').innerHTML = !h ? '<span class="sub">เลือก รพ.สต. ก่อน</span>'
      : up.length ? up.map(d=>{ const on=d===sel, n=C.daysFrom(d), k=ROWS.filter(r=>r.hcode===h&&r.exam_date===d).length;
          return `<button type="button" class="ft-day" data-d="${d}" style="padding:10px 14px;border-radius:10px;cursor:pointer;text-align:left;
            border:2px solid ${on?'var(--ok)':'var(--line)'};background:${on?'var(--ok)':'#fff'};color:${on?'#fff':'inherit'}">
            <div style="font-size:16px;font-weight:600">${thDate(d)}</div>
            <div style="font-size:13px">${n===0?'วันนี้':'อีก '+n+' วัน'} · นัดแล้ว ${k} คน</div></button>`; }).join('')
          + (rd?.time?`<span class="sub" style="align-self:center">เวลา ${esc(rd.time)}</span>`:'')
      : '<span class="sub">ยังไม่มีวันตรวจเท้าของหน่วยนี้ในตาราง — เลือก "วันอื่น"</span>';
    C.$('ft-days').querySelectorAll('.ft-day').forEach(b=>b.addEventListener('click', ()=>{ C.$('ft-d').value=b.dataset.d; paint(); }));
  };
  C.$('ft-h').addEventListener('change', ()=>{ const up=(roundOf(C.$('ft-h').value)?.dates||[]).filter(d=>d>=localISO()).sort();
    C.$('ft-d').value = up[0]||''; paint(); });
  C.$('ft-d').addEventListener('change', paint);
  if(pre && !edit){ const up=(roundOf(pre)?.dates||[]).filter(d=>d>=localISO()).sort(); if(up[0]) C.$('ft-d').value=up[0]; }
  paint();
  C.$('ft-save').addEventListener('click', ()=>saveSend(H, ans, edit));
}
async function saveSend(H, ans, edit){
  const {db, fs, esc, thDate} = C;
  const err = m => { C.$('ft-msg').innerHTML = `<div class="msg err">${esc(m)}</div>`; };
  const h = C.$('ft-h').value, d = C.$('ft-d').value;
  if(!h) return err('เลือก รพ.สต.');
  if(!d) return err('เลือกวันตรวจเท้า');
  if(d < localISO()) return err('วันตรวจต้องไม่ใช่วันที่ผ่านมาแล้ว');
  const rd = roundOf(h);
  if(!(rd?.dates||[]).includes(d) && !confirm(`${thDate(d)} ไม่ใช่วันตรวจเท้าของ ${C.rpstName(h)} ในตาราง\nยืนยันหรือไม่?`)) return;
  const by = C.PROFILE.full_name||C.ME.email;
  C.$('ft-save').disabled = true;
  try{
    let r;
    if(edit){
      const upd = {hcode:h, hcode_name:C.rpstName(h), exam_date:d, exam_time:rd?.time||null, updated_by:by, updated_at:fs.serverTimestamp()};
      const nm = (C.$('ft-name')?.value||'').trim(); if(nm) upd['patient.full_name'] = nm;
      await fs.updateDoc(fs.doc(db,'foot_referrals',edit.id), upd);
      r = {...edit, ...upd, patient:{...edit.patient, ...(nm?{full_name:nm}:{})}};
      ROWS = ROWS.map(x=>x.id===r.id?r:x);
    } else {
      const fy = fiscalBE(d), id = `FT_${H}_${fy}`;
      const ex = await fs.getDoc(fs.doc(db,'foot_referrals',id));
      if(ex.exists()){ C.$('ft-save').disabled=false; const e={id, ...ex.data()}; C.$('ft-res').innerHTML=existingBox(e); bindExisting(e); return; }
      const p = ans?.patient||{};
      const c4 = /^\d{4}$/.test(String(p.cid_last4||'')) ? p.cid_last4 : null;
      const data = { hn:H, fy, hcode:h, hcode_name:C.rpstName(h), exam_date:d, exam_time:rd?.time||null,
        patient:{ full_name:p.full_name||(C.$('ft-name')?.value||'').trim()||null, sex:p.sex||null, age:p.age??null, cid_last4:c4 },
        clinics:ans?.clinics_in_scope||[], status:'sent',
        created_uid:C.ME.uid, created_by:C.ME.email, created_by_name:by, created_at:fs.serverTimestamp() };
      await fs.setDoc(fs.doc(db,'foot_referrals',id), data);
      r = {id, ...data}; ROWS.push(r);
    }
    await C.audit(edit?'foot_edit':'foot_send', r.id, {hn:H, hcode:h, exam_date:d});
    const n = C.daysFrom(d);
    C.$('ft-res').innerHTML = `<div class="msg ok" style="font-size:17px"><div style="width:100%"><b>✓ ${edit?'บันทึกแล้ว':'ส่งตรวจเท้าแล้ว'}</b> — ${esc(r.patient?.full_name||'HN '+H)}
      <div style="font-size:15px;margin-top:6px">ตรวจเท้าที่ <b>${esc(C.rpstName(h))}</b></div>
      <div style="font-size:26px;margin:4px 0;color:var(--ok);font-weight:700">${thDate(d)} · อีก ${n} วัน</div>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn-primary" id="ft-print" style="font-size:16px">🖨 พิมพ์ฟอร์ม A4</button>
        <button class="btn-ghost" id="ft-next" style="font-size:16px">ส่งคนต่อไป</button></div></div></div>`;
    C.$('ft-print').addEventListener('click', ()=>printFootForm(r));
    C.$('ft-next').addEventListener('click', ()=>{ C.$('ft-res').innerHTML=''; C.$('ft-hn').value=''; C.$('ft-hn').focus(); });
    paintList();
  }catch(e){
    C.$('ft-save').disabled = false;
    err('บันทึกไม่สำเร็จ: '+(e.code||e.message)+(e.code==='permission-denied'?' — ต้อง Publish firestore.rules ชุดใหม่':''));
  }
}

/* ---------- รายชื่อ ---------- */
function statusTag(r){
  if(r.status==='done')   return '<span class="tag" style="background:#1F7A4D1a;color:#1F7A4D">✓ ตรวจแล้ว</span>';
  if(r.status==='absent') return '<span class="tag" style="background:#8B20201a;color:#8B2020">ไม่มาตรวจ</span>';
  return '<span class="tag" style="background:#B8860B1a;color:#B8860B">รอตรวจ</span>';
}
const riskOf = r => { const x=r.result||{}; return [x.result_left?.name, x.result_right?.name].filter(Boolean).join(' / '); };
function paintList(){
  const {esc, thDate} = C;
  const h = VIEW.hcode, st = C.$('ft-f-s')?.value||'';
  let rows = ROWS.filter(r=>!h || r.hcode===h);
  const dates = [...new Set(rows.map(r=>r.exam_date))].sort();
  // ครั้งแรก (หรือเปลี่ยนหน่วย) เลือกวันตรวจที่ใกล้ที่สุดให้ ถ้าเลือกหน่วยแล้ว
  if(VIEW.date===null) VIEW.date = (h && dates.find(d=>d>=localISO())) || '';
  if(VIEW.date && !dates.includes(VIEW.date)) VIEW.date='';
  C.$('ft-f-d').innerHTML = `<option value="">ทุกวัน</option>` + dates.map(d=>{
    const n = rows.filter(r=>r.exam_date===d).length;
    return `<option value="${d}"${d===VIEW.date?' selected':''}>${thDate(d)} (${n})</option>`; }).join('');
  if(VIEW.date) rows = rows.filter(r=>r.exam_date===VIEW.date);
  const all = rows.length, nd = rows.filter(r=>r.status==='done').length, na = rows.filter(r=>r.status==='absent').length;
  const hi = rows.filter(r=>/สูง|แผล/.test(riskOf(r))).length;
  C.$('ft-sum').innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap">
    ${[['นัดทั้งหมด',all,'#333'],['ตรวจแล้ว',nd,'#1F7A4D'],['รอตรวจ',all-nd-na,'#B8860B'],['ไม่มา',na,'#8B2020'],['เสี่ยงสูง/มีแผล',hi,'#8B2020']]
      .map(([l,v,c])=>`<div style="border:1px solid var(--line);border-radius:10px;padding:8px 14px;background:#fff">
        <div class="sub">${l}</div><div style="font-size:22px;font-weight:700;color:${c}">${v}</div></div>`).join('')}</div>`;
  if(st) rows = rows.filter(r=>(r.status||'sent')===st);
  rows.sort((a,b)=>String(a.exam_date).localeCompare(String(b.exam_date)) || String(a.hcode).localeCompare(String(b.hcode)));
  C.$('ft-count').textContent = `${rows.length} คน`;
  C.$('ft-list').innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>วันตรวจ</th><th>ผู้ป่วย</th>${C.isRpst()?'':'<th>รพ.สต.</th>'}<th>สถานะ</th><th>ผล</th><th></th></tr></thead><tbody>${
    rows.map(r=>`<tr>
      <td>${thDate(r.exam_date)}${r.exam_time?`<div class="sub">${esc(r.exam_time)}</div>`:''}</td>
      <td><span class="masked">${C.maskName(r.patient?.full_name)}</span> <button class="btn-eye" data-fe="${esc(r.id)}" title="เปิดดูชื่อ (มีบันทึก log)">👁</button>
        <div class="sub">HN ${esc(r.hn)}${r.patient?.cid_last4?' · บัตร ••••'+esc(r.patient.cid_last4):''}${r.patient?.age!=null?' · '+esc(r.patient.age)+' ปี':''}</div></td>
      ${C.isRpst()?'':`<td>${esc(r.hcode_name||C.rpstName(r.hcode))}</td>`}
      <td>${statusTag(r)}${r.result_by?`<div class="sub">${esc(r.result_by)}</div>`:''}</td>
      <td>${esc(riskOf(r))||'<span class="sub">-</span>'}${r.hosxp?.state==='written'?'<div class="sub" style="color:var(--ok)">✓ เข้า HOSxP แล้ว</div>':''}</td>
      <td class="right" style="white-space:nowrap">
        ${canResult(r)?`<button class="btn-sm" data-fr="${esc(r.id)}">${r.status==='done'?'แก้ผล':'บันทึกผล'}</button>`:''}
        <button class="btn-sm grey" data-fp="${esc(r.id)}">ฟอร์ม A4</button>
        ${canSend()&&r.status!=='done'?`<button class="btn-sm red" data-fx="${esc(r.id)}">ยกเลิก</button>`:''}</td></tr>`).join('')
  }</tbody></table></div>` : '<div class="empty">ไม่มีรายชื่อ</div>';
  const L = C.$('ft-list');
  L.querySelectorAll('[data-fe]').forEach(b=>b.addEventListener('click', async ()=>{
    const r = ROWS.find(x=>x.id===b.dataset.fe); await C.audit('reveal_sensitive', r.id, {field:'full_name', hn:r.hn, kind:'foot'});
    b.previousElementSibling.textContent = r.patient?.full_name||'-'; b.style.display='none'; }));
  L.querySelectorAll('[data-fr]').forEach(b=>b.addEventListener('click', ()=>openResult(ROWS.find(x=>x.id===b.dataset.fr))));
  L.querySelectorAll('[data-fp]').forEach(b=>b.addEventListener('click', ()=>printFootForm(ROWS.find(x=>x.id===b.dataset.fp))));
  L.querySelectorAll('[data-fx]').forEach(b=>b.addEventListener('click', async ()=>{
    const r = ROWS.find(x=>x.id===b.dataset.fx);
    if(!confirm(`ยกเลิกนัดตรวจเท้า HN ${r.hn} (${C.thDate(r.exam_date)}) ?`)) return;
    try{ await C.fs.deleteDoc(C.fs.doc(C.db,'foot_referrals',r.id)); await C.audit('foot_cancel', r.id, {hn:r.hn});
         ROWS = ROWS.filter(x=>x.id!==r.id); paintList(); }
    catch(e){ alert('ยกเลิกไม่สำเร็จ: '+(e.code||e.message)); } }));
}

/* ---------- บันทึกผลตรวจ (รพ.สต.) ---------- */
function selHtml(id, key, cur){
  const o = optList(key);
  return `<select id="${id}" style="min-width:150px"><option value="">-</option>${o.map((x,i)=>
    `<option value="${i}"${cur && cur.name===x.name?' selected':''}>${C.esc(x.name)}</option>`).join('')}</select>`;
}
function footSvg(side, pts, interactive){
  // รูปเท้ามองจากด้านบน (เหมือนรอยเท้า) · ซ้ายนิ้วโป้งอยู่ขวา / ขวานิ้วโป้งอยู่ซ้าย
  const flip = side==='R';
  const st = n => pts?.[n];  // 'Y' รู้สึก / 'N' ไม่รู้สึก / undefined ยังไม่ตรวจ
  const dot = p => { const s=st(p.n); const fill = s==='Y'?'#1F7A4D':s==='N'?'#B3261E':'#fff';
    return `<g class="${interactive?'fpt':''}" data-side="${side}" data-n="${p.n}" style="${interactive?'cursor:pointer':''}">
      <circle cx="${p.x}" cy="${p.y}" r="8" fill="${fill}" stroke="#222" stroke-width="1.3"/>
      <text x="${p.x}" y="${p.y+3.6}" text-anchor="middle" font-size="10" font-weight="700" fill="${s?'#fff':'#222'}"
        ${flip?`transform="scale(-1,1) translate(${-2*p.x},0)"`:''}>${s==='N'?'−':p.n}</text></g>`; };
  return `<svg viewBox="0 0 100 222" style="width:100%;max-width:140px;height:auto;display:block;margin:auto">
    <g ${flip?'transform="translate(100,0) scale(-1,1)"':''}>
      <path d="M52,218 C30,218 22,198 24,172 C26,146 18,122 16,98 C14,74 18,52 30,44 C42,36 72,36 82,48 C92,60 88,84 84,104 C80,128 82,152 80,176 C78,202 72,218 52,218 Z" fill="#fafafa" stroke="#222" stroke-width="1.6"/>
      <ellipse cx="72" cy="22" rx="11" ry="14" fill="#fafafa" stroke="#222" stroke-width="1.4"/>
      <ellipse cx="54" cy="18" rx="6.5" ry="8.5" fill="#fafafa" stroke="#222" stroke-width="1.3"/>
      <ellipse cx="42" cy="21" rx="6" ry="7.5" fill="#fafafa" stroke="#222" stroke-width="1.3"/>
      <ellipse cx="31" cy="27" rx="5.5" ry="6.5" fill="#fafafa" stroke="#222" stroke-width="1.3"/>
      <ellipse cx="22" cy="36" rx="4.8" ry="5.6" fill="#fafafa" stroke="#222" stroke-width="1.3"/>
      ${POINTS.map(dot).join('')}
    </g></svg>`;
}
function openResult(r){
  if(!r) return;
  const {esc, thDate} = C, x = r.result||{};
  const pts = {L:{...(x.mono_left||{})}, R:{...(x.mono_right||{})}};
  C.audit('foot_open', r.id, {hn:r.hn});
  const row = ([k, label, ok, sided]) => sided
    ? `<tr><td>${esc(label)}</td><td>${selHtml('fr-'+k+'_left', ok, x[k+'_left'])}</td><td>${selHtml('fr-'+k+'_right', ok, x[k+'_right'])}</td></tr>`
    : `<tr><td>${esc(label)}</td><td colspan="2">${selHtml('fr-'+k, ok, x[k])}</td></tr>`;
  C.$('ov-body').innerHTML = `
    <h2>บันทึกผลตรวจเท้า</h2>
    <div class="sec"><b style="font-size:18px">${esc(r.patient?.full_name||'-')}</b>
      <span class="sub">HN ${esc(r.hn)}${r.patient?.age!=null?' · '+esc(r.patient.age)+' ปี':''} · นัด ${thDate(r.exam_date)} ${esc(r.hcode_name||'')}</span></div>
    <div class="frm">
      <div class="fld"><label>วันที่ตรวจจริง</label><input type="date" id="fr-date" value="${esc(r.exam_date_actual||(r.exam_date<=localISO()?r.exam_date:localISO()))}" max="${localISO()}"></div>
      <div class="fld grow"><label>ผู้ตรวจ</label><input type="text" id="fr-by" value="${esc(r.result_by||C.PROFILE.full_name||'')}"></div></div>
    <div class="frm" style="gap:18px;margin:8px 0">
      <label><input type="checkbox" id="fr-has"${x.has_foot_cormobidity?' checked':''}> พบภาวะแทรกซ้อนทางเท้า</label>
      <label><input type="checkbox" id="fr-adv"${x.do_foot_advice!==false?' checked':''}> ให้คำแนะนำการดูแลเท้า</label></div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <div style="flex:1 1 360px"><div class="tbl-wrap"><table><thead><tr><th>รายการ</th><th>ซ้าย</th><th>ขวา</th></tr></thead><tbody>
        ${ITEMS.map(row).join('')}
        <tr><td>วันที่ตัด (ถ้ามี)</td><td colspan="2"><input type="date" id="fr-amp-date" value="${esc(x.amputation_date||'')}"></td></tr>
        <tr><td>ลักษณะรองเท้าที่ใช้ประจำ</td><td colspan="2"><input type="text" id="fr-shoe" style="width:100%" value="${esc(x.shoe||'')}"></td></tr>
      </tbody></table></div></div>
      <div style="flex:0 1 300px">
        <div class="sub" style="margin-bottom:4px">Monofilament — แตะจุดเพื่อเปลี่ยน: ว่าง → <b style="color:#1F7A4D">รู้สึก</b> → <b style="color:#B3261E">ไม่รู้สึก</b></div>
        <div style="display:flex;gap:8px">
          <div style="flex:1;text-align:center"><b>ซ้าย</b><div id="fr-svg-L">${footSvg('L', pts.L, true)}</div></div>
          <div style="flex:1;text-align:center"><b>ขวา</b><div id="fr-svg-R">${footSvg('R', pts.R, true)}</div></div></div>
        <div class="sub" id="fr-mono-sum" style="margin-top:4px"></div>
        <div style="margin-top:10px"><b>ขนาดเท้า (ซม.)</b>
          <table style="margin-top:4px"><tr><th></th><th>ยาว</th><th>กว้าง</th></tr>
            ${['left','right'].map(s=>`<tr><td>${s==='left'?'ซ้าย':'ขวา'}</td>
              <td><input type="number" step="0.1" min="10" max="40" id="fr-len-${s}" style="width:70px" value="${esc(x.size?.[s]?.length??'')}"></td>
              <td><input type="number" step="0.1" min="4" max="15" id="fr-wid-${s}" style="width:70px" value="${esc(x.size?.[s]?.width??'')}"></td></tr>`).join('')}
          </table></div></div></div>
    <div class="fld" style="margin-top:8px"><label>หมายเหตุ / สิ่งที่พบ</label><input type="text" id="fr-note" style="width:100%" value="${esc(x.note||'')}"></div>
    <div class="frm" style="margin-top:12px;gap:10px">
      <button class="btn-primary" id="fr-save" style="font-size:17px;padding:11px 28px">บันทึกผล</button>
      ${r.status!=='done'?'<button class="btn-ghost" id="fr-absent">ผู้ป่วยไม่มาตรวจ</button>':''}</div>
    ${OPTS?'':'<div class="sub" style="margin-top:6px">ตัวเลือกชุดมาตรฐาน — จะเปลี่ยนเป็นรายการเดียวกับ HOSxP อัตโนมัติเมื่อเครื่อง server ส่งขึ้นมา</div>'}
    <div id="fr-msg" style="margin-top:8px"></div>`;
  C.$('ov').classList.remove('hidden');
  const monoSum = () => { const f = s => { const v=Object.values(pts[s]); return v.length ? `${v.filter(y=>y==='N').length} จุดไม่รู้สึก จากที่ตรวจ ${v.length}` : 'ยังไม่ตรวจ'; };
    C.$('fr-mono-sum').textContent = `ซ้าย: ${f('L')} · ขวา: ${f('R')}`; };
  const bindPts = side => C.$('fr-svg-'+side).querySelectorAll('.fpt').forEach(g=>g.addEventListener('click', ()=>{
    const n = g.dataset.n, cur = pts[side][n];
    if(!cur) pts[side][n]='Y'; else if(cur==='Y') pts[side][n]='N'; else delete pts[side][n];
    C.$('fr-svg-'+side).innerHTML = footSvg(side, pts[side], true); bindPts(side); monoSum(); }));
  bindPts('L'); bindPts('R'); monoSum();
  const pick = (id, ok) => { const v = C.$(id)?.value; if(v==='') return null; const o = optList(ok)[+v]; return o ? {id:o.id??null, name:o.name} : null; };
  const num = id => { const v = parseFloat(C.$(id).value); return isFinite(v) ? v : null; };
  C.$('fr-save').addEventListener('click', async ()=>{
    const d = C.$('fr-date').value;
    if(!d || d > localISO()) return C.$('fr-msg').innerHTML = '<div class="msg err">ใส่วันที่ตรวจจริง (ไม่เกินวันนี้)</div>';
    const res = {};
    ITEMS.forEach(([k,,ok,sided])=>{ if(sided){ res[k+'_left']=pick('fr-'+k+'_left',ok); res[k+'_right']=pick('fr-'+k+'_right',ok); } else res[k]=pick('fr-'+k,ok); });
    Object.assign(res, { has_foot_cormobidity:C.$('fr-has').checked, do_foot_advice:C.$('fr-adv').checked,
      amputation_date:C.$('fr-amp-date').value||null, shoe:C.$('fr-shoe').value.trim()||null,
      mono_left:pts.L, mono_right:pts.R, note:C.$('fr-note').value.trim()||null,
      size:{left:{length:num('fr-len-left'), width:num('fr-wid-left')}, right:{length:num('fr-len-right'), width:num('fr-wid-right')}},
      options_source: OPTS ? 'hosxp' : 'default' });
    if(!res.result_left && !res.result_right) return C.$('fr-msg').innerHTML = '<div class="msg err">เลือก "ผลตรวจเท้า" อย่างน้อย 1 ข้าง</div>';
    await saveResult(r, {status:'done', result:res, exam_date_actual:d, result_by:C.$('fr-by').value.trim()||C.PROFILE.full_name||C.ME.email});
  });
  C.$('fr-absent')?.addEventListener('click', async ()=>{
    if(confirm('บันทึกว่าผู้ป่วยไม่มาตรวจตามนัด?')) await saveResult(r, {status:'absent', result_by:C.PROFILE.full_name||C.ME.email});
  });
}
async function saveResult(r, upd){
  const {fs, db} = C;
  try{
    const data = {...upd, result_uid:C.ME.uid, result_at:fs.serverTimestamp(),
      hosxp:{state: upd.status==='done' ? 'pending' : 'skip'}};
    await fs.updateDoc(fs.doc(db,'foot_referrals',r.id), data);
    await C.audit('foot_result', r.id, {hn:r.hn, status:upd.status});
    Object.assign(r, data, {hosxp:data.hosxp});
    C.$('ov').classList.add('hidden'); paintList();
  }catch(e){ C.$('fr-msg').innerHTML = `<div class="msg err">บันทึกไม่สำเร็จ: ${C.esc(e.code||e.message)}${e.code==='permission-denied'?' — ต้อง Publish firestore.rules ชุดใหม่':''}</div>`; }
}

/* ---------- ฟอร์ม A4 (ผู้ป่วยถือไป รพ.สต. · เจ้าหน้าที่กรอกผลบนกระดาษได้ถ้าไม่สะดวกคีย์ทันที) ---------- */
async function printFootForm(r){
  if(!r) return;
  const {esc, thDate} = C;
  const w = window.open('', '_blank', 'width=820,height=1000');
  if(!w){ alert('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up ก่อน'); return; }
  w.document.write('<p style="font-family:sans-serif;padding:20px">กำลังเตรียมฟอร์ม...</p>');
  const u = C.RPST.find(x=>x.hcode===r.hcode)||{};
  const mapUrl = (u.lat&&u.lng) ? `https://www.google.com/maps/dir/?api=1&destination=${u.lat},${u.lng}` : '';
  const qMap = mapUrl ? await C.qrDataUrl(mapUrl) : '';
  const n = C.daysFrom(r.exam_date);
  const box = '<span class="bx"></span>';
  const opts = ok => optList(ok).map(o=>`${box}${esc(o.name)}`).join(' &nbsp;');
  const rowsSingle = ITEMS.filter(i=>!i[3]).map(([k,l,ok])=>`<tr><td class="lb">${esc(l)}</td><td colspan="2">${opts(ok)}</td></tr>`).join('');
  const rowsSided = ITEMS.filter(i=>i[3]).map(([k,l,ok])=>`<tr><td class="lb">${esc(l)}</td><td>${opts(ok)}</td><td>${opts(ok)}</td></tr>`).join('');
  w.document.open();
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ฟอร์มตรวจเท้า ${esc(r.hn)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
  <style>@page{size:A4 portrait;margin:8mm}
  *{box-sizing:border-box}body{font-family:'Sarabun','Tahoma',sans-serif;margin:0;color:#111;font-size:13.5px}
  .pg{width:194mm;height:280mm;margin:0 auto;display:flex;flex-direction:column;overflow:hidden}
  .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:1.5mm}
  .hd h1{font-size:19px;margin:0}.hd .s{font-size:11.5px;color:#333;text-align:right}
  .top{display:flex;gap:3mm;margin-top:2.5mm}
  .ap{flex:1;border:2.5px solid #111;border-radius:3mm;padding:2.5mm 3.5mm}
  .ap .pt{font-size:14px}.ap .pt b{font-size:17px}
  .ap .d{font-size:24px;font-weight:700;line-height:1.25;margin-top:1mm}.ap .w{font-size:15px;font-weight:600}
  .ap .a{font-size:12px;color:#333}
  .tv{width:62mm;border:1.5px solid #111;border-radius:3mm;padding:2mm 3mm;font-size:11.5px;display:flex;flex-direction:column}
  .tv h3{margin:0 0 1mm;font-size:13px}.tv ul{margin:0;padding-left:4mm}.tv li{margin:.3mm 0}
  .tv .q{display:flex;gap:2mm;align-items:center;margin-top:auto}.tv .q img{width:22mm;height:22mm}
  h2{font-size:14px;margin:2.5mm 0 1mm;border-left:4px solid #111;padding-left:2mm}
  .chk{display:flex;gap:6mm;font-size:14px;margin:1.5mm 0}
  table{border-collapse:collapse;width:100%}td,th{border:1px solid #777;padding:1mm 1.6mm;vertical-align:top;font-size:12px;line-height:1.35}
  th{background:#eee;font-size:12px}.lb{width:50mm;font-weight:600}
  .bx{display:inline-block;width:3mm;height:3mm;border:1px solid #111;margin-right:1mm;vertical-align:-0.3mm}
  .ex{display:flex;gap:3mm}.ft2{flex:0 0 70mm;border:1px solid #777;padding:1.5mm}
  .feet{display:flex;gap:2mm}.feet>div{flex:1;text-align:center;font-weight:700}
  .feet svg{max-width:33mm!important}
  .sz td{text-align:center}
  .sign{margin-top:3mm;display:flex;gap:6mm;border-top:1px solid #999;padding-top:2mm;font-size:12.5px}
  .sign div{flex:1}.ln{display:inline-block;border-bottom:1px dotted #333;min-width:40mm}
  .bar{position:sticky;top:0;background:#333;color:#fff;padding:10px;text-align:center;font-family:sans-serif;z-index:9}
  .bar button{font-size:17px;padding:9px 30px;border:0;border-radius:8px;background:#1F7A4D;color:#fff;cursor:pointer;margin:0 6px}.bar button.g{background:#666}
  @media print{.bar{display:none}}
  @media screen{body{background:#eee}.pg{background:#fff;margin:8px auto;box-shadow:0 1px 6px #0003;padding:8mm;height:auto;min-height:280mm}}</style></head>
  <body><div class="bar"><button onclick="window.print()">🖨 พิมพ์ฟอร์ม</button><button class="g" onclick="window.close()">ปิด</button></div><div class="pg">
  <div class="hd"><h1>ใบนัดและแบบบันทึกการตรวจเท้าผู้ป่วยเบาหวาน ปีงบ ${esc(r.fy||fiscalBE(r.exam_date))}</h1>
    <div class="s">ส่งจากโรงพยาบาลสวี จ.ชุมพร<br>HN ${esc(r.hn)}</div></div>
  <div class="top">
    <div class="ap"><div class="pt">ชื่อ ${r.patient?.full_name?`<b>${esc(r.patient.full_name)}</b>`:'<span class="ln" style="min-width:70mm">&nbsp;</span>'}
        &nbsp; HN <b>${esc(r.hn)}</b> ${r.patient?.age!=null?`&nbsp; อายุ ${esc(r.patient.age)} ปี`:''}</div>
      <div style="margin-top:1.5mm">นัดตรวจเท้าที่</div>
      <div class="w">${esc(u.name||r.hcode_name||r.hcode)}</div>
      ${u.address||u.phone?`<div class="a">${esc(u.address||'')}${u.address&&u.phone?' · ':''}${u.phone?'โทร '+esc(u.phone):''}</div>`:''}
      <div class="d">วันที่ ${thDate(r.exam_date)}${r.exam_time?` <span style="font-size:16px">เวลา ${esc(r.exam_time)}</span>`:''}</div>
      ${n!=null&&n>=0?`<div class="a">อีก ${n} วัน (นับจาก ${thDate(localISO())})</div>`:''}</div>
    <div class="tv"><h3>การเตรียมตัว / การเดินทาง</h3><ul>
      <li><b>นำใบนี้และสมุดประจำตัว</b>ไปด้วย</li><li>สวมรองเท้าคู่ที่ใช้ประจำ</li>
      <li>ล้างเท้าให้สะอาด ไม่ทาสีเล็บ/โลชั่น</li><li>ไม่ต้องงดน้ำงดอาหาร กินยาตามปกติ</li>
      <li>ไปไม่ได้ โทรแจ้ง รพ.สต. ล่วงหน้า</li></ul>
      ${qMap?`<div class="q"><img src="${qMap}" alt="แผนที่"><div>สแกนเพื่อ<br><b>นำทางไป รพ.สต.</b><br>(Google Maps)</div></div>`:''}</div>
  </div>

  <h2>ส่วนของเจ้าหน้าที่ รพ.สต. — ผลการตรวจเท้า &nbsp;<span style="font-weight:400;font-size:12px">วันที่ตรวจ <span class="ln" style="min-width:28mm">&nbsp;</span> (คัดกรองนอกสถานบริการ)</span></h2>
  <div class="chk"><span>${box}ได้ทำการคัดกรองภาวะแทรกซ้อนทางเท้า</span><span>${box}พบภาวะแทรกซ้อนทางเท้า</span><span>${box}ให้คำแนะนำการดูแลเท้า</span></div>
  <div class="ex">
    <div style="flex:1">
      <table><tr><th>รายการ</th><th>ซ้าย</th><th>ขวา</th></tr>${rowsSided}</table>
      <table style="margin-top:1.5mm">${rowsSingle}
        <tr><td class="lb">วันที่ตัด (ถ้ามี)</td><td colspan="2"><span class="ln">&nbsp;</span></td></tr>
        <tr><td class="lb">ลักษณะรองเท้าที่ใช้ประจำ</td><td colspan="2"><span class="ln" style="min-width:80mm">&nbsp;</span></td></tr></table>
    </div>
    <div class="ft2">
      <div style="font-weight:700;font-size:12.5px">Monofilament 10 g</div>
      <div style="font-size:10.5px;margin-bottom:1mm">รู้สึก ✓ · ไม่รู้สึก ✗ ในวงกลม · วาดตำแหน่งแผล/หนังด้าน/ผิดรูปลงบนรูป</div>
      <div class="feet"><div>ซ้าย${footSvg('L', {}, false)}</div><div>ขวา${footSvg('R', {}, false)}</div></div>
      <div style="font-size:10px;line-height:1.3;margin-top:1mm">${POINTS.map(p=>`${p.n} ${esc(p.t)}`).join(' · ')}</div>
      <table class="sz" style="margin-top:1.5mm"><tr><th>ขนาดเท้า (ซม.)</th><th>ซ้าย</th><th>ขวา</th></tr>
        <tr><td>ความยาว</td><td></td><td></td></tr><tr><td>ความกว้าง</td><td></td><td></td></tr></table>
    </div>
  </div>
  <div style="margin-top:2mm;border:1px solid #777;padding:1.5mm 2mm;flex:1;min-height:15mm;max-height:45mm">หมายเหตุ / สิ่งที่พบ / การส่งต่อ:</div>
  <div class="sign"><div>ผู้ตรวจ <span class="ln">&nbsp;</span></div><div>ตำแหน่ง <span class="ln">&nbsp;</span></div>
    <div style="font-size:11px;color:#444">บันทึกผลในเว็บ Sawee-refer เมนู "ตรวจเท้าเบาหวาน" — ระบบส่งเข้า HOSxP ให้</div></div>
  </div></body></html>`);
  w.document.close();
  C.audit('foot_print', r.id, {hn:r.hn});
}

/* ---------- admin: ตารางวันตรวจเท้า ---------- */
function paintRounds(){
  const {esc} = C, el = C.$('ft-rounds');
  const byH = Object.fromEntries(ROUNDS.filter(r=>r.hcode).map(r=>[r.hcode, r]));
  const unmatched = ROUNDS.filter(r=>!r.hcode);
  el.innerHTML = `${unmatched.length?`<div class="msg warn">จับคู่ชื่อกับ รพ.สต. ในระบบไม่ได้: ${unmatched.map(r=>esc(r.name)).join(', ')} — ใส่วันให้หน่วยที่ถูกต้องด้านล่าง</div>`:''}
    <div class="tbl-wrap"><table><thead><tr><th>รพ.สต.</th><th>วันตรวจ (ค.ศ.)</th><th>เวลา</th></tr></thead><tbody>${
    C.RPST.map(u=>{ const r = byH[u.hcode]||{dates:[], time:''};
      return `<tr><td>${esc(u.name)}</td>
        <td><input type="text" data-rd="${esc(u.hcode)}" style="width:100%;min-width:260px" value="${esc((r.dates||[]).join(', '))}"></td>
        <td><input type="text" data-rt="${esc(u.hcode)}" style="width:130px" value="${esc(r.time||'')}" placeholder="08:30–12:00 น."></td></tr>`; }).join('')
    }</tbody></table></div>
    <div class="frm" style="margin-top:10px"><button class="btn-primary" id="ft-rounds-save">บันทึกตาราง</button><span id="ft-rounds-msg"></span></div>`;
  C.$('ft-rounds-save').addEventListener('click', async ()=>{
    const out = []; let bad = [];
    C.RPST.forEach(u=>{
      const raw = el.querySelector(`[data-rd="${u.hcode}"]`).value;
      const dates = raw.split(/[,\s]+/).filter(Boolean);
      dates.forEach(d=>{ if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) bad.push(`${u.name}: ${d}`); });
      const time = el.querySelector(`[data-rt="${u.hcode}"]`).value.trim();
      if(dates.length || time) out.push({hcode:u.hcode, name:u.name, dates:dates.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort(), time});
    });
    if(bad.length) return C.$('ft-rounds-msg').innerHTML = `<span style="color:var(--red,#B3261E);margin-left:8px">รูปแบบวันที่ผิด: ${esc(bad.join(', '))}</span>`;
    try{
      await C.fs.setDoc(C.fs.doc(C.db,'config','foot_rounds'), {rounds:out, updated_by:C.PROFILE.full_name||C.ME.email, updated_at:C.fs.serverTimestamp()});
      await C.audit('foot_rounds_save', 'config/foot_rounds', {n:out.length});
      ROUNDS = out; C.$('ft-rounds-msg').innerHTML = '<span style="color:var(--ok);margin-left:8px">✓ บันทึกแล้ว</span>'; paintRounds();
    }catch(e){ C.$('ft-rounds-msg').innerHTML = `<span style="color:#B3261E;margin-left:8px">${esc(e.code||e.message)}</span>`; }
  });
}
