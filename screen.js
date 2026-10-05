/* =====================================================================
   screen.js — คัดกรองเบาหวาน/ความดันโลหิตสูง (NCDs) ในชุมชน → ส่งต่อ รพ.สวี → ติดตามว่ามาเปิด visit แล้วหรือยัง
   โหลดจาก refer.html เมื่อเปิดแท็บ "คัดกรอง NCDs"

   รพ.สต. / อสม.  : กรอกผลคัดกรอง → ระบบแปลผลให้ทันที
                    ปกติ        → นับยอดอย่างเดียว ไม่เก็บชื่อ/เลขบัตร
                    เสี่ยง       → เก็บรายชื่อไว้ติดตามในชุมชน
                    สงสัยป่วย    → ส่งต่อ รพ.สวี + พิมพ์ใบส่งตัว A5
   พยาบาล รพ.สวี  : เห็นรายชื่อที่ส่งมาทุกหน่วย · ระบบเช็ค HOSxP ให้เองทุก 10 นาทีว่ามาเปิด visit แล้วหรือยัง (จับคู่เลขบัตร)
                    กด "มาแล้ว" เองได้ · บันทึกผลวินิจฉัยเพื่อปิดเคส
   ข้อมูล: ncd_screen/{id} (ไม่มีเลขบัตรเต็ม) · ncd_screen_pii/{id} (เลขบัตร) · ncd_screen_stats/{hcode}_{ปีงบ} (ยอดรวม)
   ===================================================================== */

let C = null;
let ROWS = [];
let STATS = [];
let VIEW = {hcode:'', st:'wait', q:''};

const localISO = (d=new Date()) => new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
const fiscalBE = iso => { const [y,m] = String(iso).split('-').map(Number); return (m>=10 ? y+1 : y) + 543; };
const num = v => { const x = parseFloat(String(v??'').replace(',','.')); return isFinite(x) ? x : null; };
const cidOk = c => { if(!/^\d{13}$/.test(c)) return false; let s=0; for(let i=0;i<12;i++) s += +c[i]*(13-i); return (11 - s%11)%10 === +c[12]; };
const isHosp = () => C.isAdmin() || C.isHospital();

/* ---------- เกณฑ์แปลผล (แนวทางคัดกรอง DM/HT กระทรวงสาธารณสุข) ---------- */
function judge(m){
  const r = {dm:null, ht:null, bmi:null, bmi_txt:null, waist:null, urgent:false};
  if(m.dtx!=null){
    const f = m.fasting;
    r.dm = f ? (m.dtx>=126?'suspect':m.dtx>=100?'risk':'normal') : (m.dtx>=200?'suspect':m.dtx>=140?'risk':'normal');
  }
  if(m.sbp!=null && m.dbp!=null){
    r.ht = (m.sbp>=140||m.dbp>=90)?'suspect':(m.sbp>=120||m.dbp>=80)?'risk':'normal';
    if(m.sbp>=180||m.dbp>=110) r.urgent = true;
  }
  if(m.weight && m.height){ r.bmi = Math.round(m.weight/((m.height/100)**2)*10)/10;
    r.bmi_txt = r.bmi>=30?'อ้วนระดับ 2':r.bmi>=25?'อ้วน':r.bmi>=23?'น้ำหนักเกิน':r.bmi>=18.5?'ปกติ':'ผอม'; }
  if(m.waist && m.sex) r.waist = m.waist >= (m.sex==='ชาย'?90:80);
  const lv = x => x==='suspect'?2:x==='risk'?1:0;
  r.level = Math.max(lv(r.dm), lv(r.ht));
  r.overall = r.level===2?'suspect':r.level===1?'risk':'normal';
  return r;
}
const LBL = {normal:'ปกติ', risk:'กลุ่มเสี่ยง', suspect:'สงสัยป่วย'};
const CLR = {normal:'#1F7A4D', risk:'#8A5A00', suspect:'#B3261E'};
const tag = (t, x) => x ? `<span class="tag" style="background:${CLR[x]}1a;color:${CLR[x]}">${t} ${LBL[x]}</span>` : '';

const STATUS = {
  referred:['รอมา รพ.', '#8A5A00'], visited:['มาเปิด visit แล้ว', '#1F7A4D'],
  closed:['ปิดเคส', '#3E6E8E'], risk_only:['กลุ่มเสี่ยง (ติดตามในชุมชน)', '#6B4C9A'],
};
const stTag = r => { const s = STATUS[r.status]||[r.status,'#888'];
  const late = r.status==='referred' && r.refer?.appoint_date && r.refer.appoint_date < localISO();
  return `<span class="tag" style="background:${s[1]}1a;color:${s[1]}">${s[0]}</span>${late?' <span class="tag" style="background:#B3261E1a;color:#B3261E">เลยนัด</span>':''}`; };
const OUTCOMES = ['ป่วยเบาหวาน — ขึ้นทะเบียนคลินิก','ป่วยความดันโลหิตสูง — ขึ้นทะเบียนคลินิก','ป่วยทั้งเบาหวานและความดัน',
  'ไม่ป่วย — ให้คำแนะนำ/ติดตามในชุมชน','นัดตรวจยืนยันซ้ำ','อื่น ๆ'];

/* ---------- โหลด ---------- */
/* ประหยัดโควตา: ฝั่ง รพ. อ่านเฉพาะปีงบนี้และปีก่อน · เปิดแท็บซ้ำภายใน 5 นาทีใช้ข้อมูลเดิม */
let LOADED_AT = 0;
async function loadAll(force){
  if(!force && LOADED_AT && Date.now()-LOADED_AT < 300000) return;
  LOADED_AT = Date.now();
  const {db, fs} = C, fy = fiscalBE(localISO());
  const col = fs.collection(db,'ncd_screen');
  const q = C.isRpst() ? fs.query(col, fs.where('hcode','==',C.myHcode())) : fs.query(col, fs.where('fy','in',[fy-1, fy]));
  const s = await fs.getDocs(q);
  ROWS = s.docs.map(d=>({id:d.id, ...d.data()}));
  try{
    const sc = fs.collection(db,'ncd_screen_stats');
    const ss = await fs.getDocs(C.isRpst() ? fs.query(sc, fs.where('hcode','==',C.myHcode())) : sc);
    STATS = ss.docs.map(d=>({id:d.id, ...d.data()}));
  }catch(e){ STATS = []; }
}

/* ===================================================================== */
export async function renderScreen(ctx){
  C = ctx;
  const root = C.$('screen-root'); if(!root) return;
  root.innerHTML = '<div class="sub" style="padding:20px">กำลังโหลด...</div>';
  try{ await loadAll(); }
  catch(e){ LOADED_AT = 0; root.innerHTML = `<div class="msg err">โหลดไม่สำเร็จ: ${C.esc(e.code||e.message)}${e.code==='permission-denied'?' — ต้อง Publish firestore.rules ชุดใหม่':''}</div>`; return; }
  if(C.isRpst()) VIEW.hcode = C.myHcode();
  if(isHosp() && VIEW.st==='wait') VIEW.st = 'wait';
  root.innerHTML = `
    <div class="card"><h2>บันทึกผลคัดกรองเบาหวาน / ความดันโลหิตสูง</h2>
      <div class="sub" style="margin:-4px 0 10px">ปกติ = นับยอดอย่างเดียว ไม่เก็บชื่อ · เสี่ยง = เก็บไว้ติดตามในชุมชน · สงสัยป่วย = ส่งต่อ รพ.สวี (ระบบเช็คให้ว่ามาเปิด visit แล้วหรือยัง)</div>
      <div id="sc-form"></div></div>
    <div class="card"><h2>ติดตามผู้ที่ส่งต่อ / กลุ่มเสี่ยง <span class="note" id="sc-count"></span></h2>
      <div id="sc-tiles" style="margin-bottom:10px"></div>
      <div class="frm" style="align-items:flex-end">
        ${C.isRpst()?'':`<div class="fld"><label>รพ.สต.</label><select id="sc-f-h"><option value="">ทุกหน่วย</option>${
          C.RPST.map(r=>`<option value="${C.esc(r.hcode)}">${C.esc(r.name)}</option>`).join('')}</select></div>`}
        <div class="fld"><label>สถานะ</label><select id="sc-f-s">
          <option value="wait">รอมา รพ.</option><option value="late">เลยนัดยังไม่มา</option><option value="visited">มาแล้ว (รอผล)</option>
          <option value="closed">ปิดเคส</option><option value="risk_only">กลุ่มเสี่ยง</option><option value="">ทั้งหมด</option></select></div>
        <div class="fld"><label>ค้นหา</label><input type="text" id="sc-f-q" placeholder="HN / เลขบัตร 4 ตัวท้าย" style="width:170px"></div>
        <button class="btn-sm grey" id="sc-reload">โหลดใหม่</button></div>
      <div id="sc-list" style="margin-top:10px"></div></div>`;
  renderForm();
  C.$('sc-f-h')?.addEventListener('change', e=>{ VIEW.hcode=e.target.value; paintList(); });
  C.$('sc-f-s').value = VIEW.st;
  C.$('sc-f-s').addEventListener('change', e=>{ VIEW.st=e.target.value; paintList(); });
  C.$('sc-f-q').addEventListener('input', e=>{ VIEW.q=e.target.value.trim(); paintList(); });
  C.$('sc-reload').addEventListener('click', async ()=>{ await loadAll(true); paintList(); });
  paintList();
}

/* ---------- ฟอร์มคัดกรอง ---------- */
function renderForm(){
  const {esc} = C, el = C.$('sc-form');
  const fld = (id, label, attrs='', w=110) => `<div class="fld"><label>${label}</label><input id="${id}" ${attrs} style="width:${w}px"></div>`;
  el.innerHTML = `
    <div class="frm">
      ${isHosp()?`<div class="fld"><label>รพ.สต. ที่คัดกรอง</label><select id="sc-h"><option value="">-- เลือก --</option>${
        C.RPST.map(r=>`<option value="${esc(r.hcode)}">${esc(r.name)}</option>`).join('')}</select></div>`:''}
      ${fld('sc-date','วันที่คัดกรอง',`type="date" value="${localISO()}" max="${localISO()}"`,150)}
      ${fld('sc-by','ผู้คัดกรอง / อสม.',`type="text" value="${esc(C.PROFILE.full_name||'')}"`,200)}
      ${fld('sc-moo','หมู่ที่','type="number" min="1" max="30"',70)}</div>
    <div class="sec" style="background:#fff;margin-top:8px">
      <div class="st">ผู้รับการคัดกรอง</div>
      <div class="frm">
        ${fld('sc-cid','เลขบัตรประชาชน','type="text" inputmode="numeric" maxlength="17" placeholder="13 หลัก"',170)}
        ${fld('sc-name','ชื่อ-สกุล','type="text"',230)}
        <div class="fld"><label>เพศ</label><select id="sc-sex"><option value="">-</option><option>ชาย</option><option>หญิง</option></select></div>
        ${fld('sc-age','อายุ (ปี)','type="number" min="15" max="110"',80)}
        ${fld('sc-phone','โทรศัพท์','type="text" inputmode="tel"',130)}</div>
      <div id="sc-cid-msg" class="sub"></div>
      <div class="frm" style="gap:16px;margin-top:6px">
        <span>ญาติสายตรงเป็น: <label><input type="checkbox" id="sc-fdm"> เบาหวาน</label> <label><input type="checkbox" id="sc-fht"> ความดัน</label></span>
        <span>โรคประจำตัว: <label><input type="checkbox" id="sc-hdm"> เบาหวาน</label> <label><input type="checkbox" id="sc-hht"> ความดัน</label>
          <input type="text" id="sc-hoth" placeholder="อื่น ๆ" style="width:120px"></span></div>
      <div id="sc-old-msg"></div></div>
    <div class="sec" style="background:#fff">
      <div class="st">ผลตรวจ</div>
      <div class="frm">
        ${fld('sc-w','น้ำหนัก (กก.)','type="number" step="0.1"',90)}
        ${fld('sc-ht','ส่วนสูง (ซม.)','type="number" step="0.1"',90)}
        ${fld('sc-waist','รอบเอว (ซม.)','type="number" step="0.1"',90)}
        ${fld('sc-sbp','BP บน','type="number"',70)}${fld('sc-dbp','BP ล่าง','type="number"',70)}
        ${fld('sc-sbp2','BP ซ้ำ บน','type="number" title="วัดซ้ำเมื่อครั้งแรก ≥140/90 (ใช้ค่านี้แปลผล)"',80)}${fld('sc-dbp2','BP ซ้ำ ล่าง','type="number"',80)}
        ${fld('sc-dtx','น้ำตาลปลายนิ้ว (mg/dL)','type="number"',120)}
        <div class="fld"><label>งดอาหาร ≥ 8 ชม.</label><select id="sc-fast"><option value="1">งด</option><option value="0">ไม่งด</option></select></div></div>
      <div class="frm" style="gap:16px;margin-top:6px">
        <span>บุหรี่: <select id="sc-smoke"><option value="no">ไม่สูบ</option><option value="yes">สูบ</option><option value="quit">เลิกแล้ว</option></select>
          <input type="number" id="sc-smoke-y" placeholder="ปี" style="width:60px"> <input type="number" id="sc-smoke-n" placeholder="มวน/วัน" style="width:80px"></span>
        <span>สุรา: <select id="sc-alc"><option value="no">ไม่ดื่ม</option><option value="yes">ดื่ม</option><option value="quit">เลิกแล้ว</option></select>
          <input type="number" id="sc-alc-y" placeholder="ปี" style="width:60px"></span>
        <span>รสชาติอาหาร: <label><input type="checkbox" class="sc-taste" value="หวาน"> หวาน</label>
          <label><input type="checkbox" class="sc-taste" value="มัน"> มัน</label> <label><input type="checkbox" class="sc-taste" value="เค็ม"> เค็ม</label></span></div></div>
    <div id="sc-judge" style="margin-top:10px"></div>
    <div id="sc-msg" style="margin-top:8px"></div>`;
  el.querySelectorAll('input,select').forEach(x=>x.addEventListener('input', paintJudge));
  el.querySelectorAll('select,input[type=checkbox]').forEach(x=>x.addEventListener('change', paintJudge));
  C.$('sc-cid').addEventListener('input', ()=>{
    const c = C.$('sc-cid').value.replace(/\D/g,'');
    C.$('sc-cid-msg').innerHTML = c.length===13 ? (cidOk(c)?'<span style="color:var(--ok)">✓ เลขบัตรถูกต้อง</span>':'<span style="color:var(--warn)">เลขบัตรไม่ถูกต้อง (ตรวจหลักสุดท้ายไม่ผ่าน)</span>') : '';
    const dup = c.length===13 ? ROWS.find(r=>r.person?.cid_last4===c.slice(-4) && r.fy===fiscalBE(localISO()) && r.status!=='closed') : null;
    if(dup) C.$('sc-cid-msg').innerHTML += ` · <span style="color:var(--amber)">มีรายการเลขบัตรลงท้าย ${c.slice(-4)} ในปีนี้แล้ว (${C.thDate(dup.screen_date)}) — ตรวจว่าไม่ซ้ำคน</span>`;
  });
  paintJudge();
}
function readForm(){
  const v = id => C.$(id)?.value ?? '';
  const sbp2 = num(v('sc-sbp2')), dbp2 = num(v('sc-dbp2'));
  const m = { sex:v('sc-sex')||null, age:num(v('sc-age')), weight:num(v('sc-w')), height:num(v('sc-ht')), waist:num(v('sc-waist')),
    sbp1:num(v('sc-sbp')), dbp1:num(v('sc-dbp')), sbp2, dbp2,
    dtx:num(v('sc-dtx')), fasting:v('sc-fast')==='1' };
  m.sbp = sbp2!=null && dbp2!=null ? sbp2 : m.sbp1; m.dbp = sbp2!=null && dbp2!=null ? dbp2 : m.dbp1;
  return m;
}
function paintJudge(){
  const m = readForm(), r = judge(m);
  const hasOld = C.$('sc-hdm').checked || C.$('sc-hht').checked;
  C.$('sc-old-msg').innerHTML = hasOld ? '<div class="msg amber" style="margin:6px 0 0">เป็นผู้ป่วยเดิมอยู่แล้ว — ไม่ใช่กลุ่มเป้าหมายคัดกรอง (บันทึกได้ แต่ระบบจะไม่ส่งต่อ)</div>' : '';
  const ready = m.dtx!=null || (m.sbp!=null && m.dbp!=null);
  if(!ready){ C.$('sc-judge').innerHTML = '<div class="sub">ใส่ค่าความดัน และ/หรือ น้ำตาลปลายนิ้ว เพื่อแปลผล</div>'; return; }
  const appt = nextWorkday();
  C.$('sc-judge').innerHTML = `<div style="border:2px solid ${CLR[r.overall]};border-radius:12px;padding:12px 16px;background:${CLR[r.overall]}0d">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <b style="font-size:20px;color:${CLR[r.overall]}">${LBL[r.overall]}</b>
      ${tag('เบาหวาน', r.dm)} ${tag('ความดัน', r.ht)}
      ${r.bmi?`<span class="tag" style="background:#eee">BMI ${r.bmi} ${r.bmi_txt}</span>`:''}
      ${r.waist?'<span class="tag" style="background:#8A5A001a;color:#8A5A00">รอบเอวเกิน</span>':''}
      ${r.urgent?'<span class="tag" style="background:#B3261E;color:#fff">ความดันสูงมาก — ส่ง รพ. ทันที</span>':''}</div>
    ${m.sbp2!=null?`<div class="sub" style="margin-top:4px">แปลผลความดันจากค่าวัดซ้ำ ${m.sbp}/${m.dbp}</div>`:
      (m.sbp>=140||m.dbp>=90)?'<div class="sub" style="margin-top:4px">ความดัน ≥140/90 — ควรนั่งพัก 5–15 นาทีแล้ววัดซ้ำ ใส่ในช่อง "BP ซ้ำ"</div>':''}
    <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
      ${r.overall!=='normal' && !hasOld ? `<div class="fld"><label>นัดไป รพ.สวี วันที่</label><input type="date" id="sc-appt" min="${localISO()}" value="${r.urgent?localISO():appt}"></div>
        <div class="fld"><label>หมายเหตุถึง รพ.</label><input type="text" id="sc-note" style="width:220px"></div>
        <button class="btn-primary" id="sc-refer" style="font-size:16px;padding:11px 24px${r.overall==='suspect'?'':';background:#8A5A00'}">ส่งต่อ รพ.สวี + พิมพ์ใบส่งตัว</button>`:''}
      ${r.overall==='risk' || hasOld ? `<button class="btn-ghost" id="sc-risk" style="font-size:16px">บันทึกเป็นกลุ่มเสี่ยง (ติดตามในชุมชน)</button>`:''}
      ${r.overall==='normal' ? `<button class="btn-primary" id="sc-normal" style="font-size:16px;padding:11px 24px">บันทึกยอด "ปกติ" (ไม่เก็บชื่อ)</button>`:''}
    </div></div>`;
  C.$('sc-refer')?.addEventListener('click', ()=>save('referred'));
  C.$('sc-risk')?.addEventListener('click', ()=>save('risk_only'));
  C.$('sc-normal')?.addEventListener('click', ()=>save('normal'));
}
function nextWorkday(){ const d = new Date(); do{ d.setDate(d.getDate()+1); }while(d.getDay()===0||d.getDay()===6); return localISO(d); }

async function save(kind){
  const {db, fs, esc} = C;
  const err = t => C.$('sc-msg').innerHTML = `<div class="msg err">${esc(t)}</div>`;
  const h = isHosp() ? C.$('sc-h').value : C.myHcode();
  const d = C.$('sc-date').value;
  if(!h) return err('เลือก รพ.สต. ที่คัดกรอง');
  if(!d || d > localISO()) return err('วันที่คัดกรองไม่ถูกต้อง');
  const m = readForm(), r = judge(m), fy = fiscalBE(d);
  const statId = `${h}_${fy}`;
  const bump = async (key) => {
    await fs.setDoc(fs.doc(db,'ncd_screen_stats',statId), {hcode:h, fy, [key]:fs.increment(1), total:fs.increment(1),
      updated_at:fs.serverTimestamp()}, {merge:true});
  };
  if(kind==='normal'){
    if(r.overall!=='normal') return err('ผลไม่ใช่ปกติ');
    try{ await bump('normal'); await C.audit('ncd_screen_normal', statId, {}); }
    catch(e){ return err('บันทึกไม่สำเร็จ: '+(e.code||e.message)); }
    C.$('sc-msg').innerHTML = '<div class="msg ok">✓ นับเป็น "ปกติ" แล้ว (ไม่เก็บชื่อ) — คัดกรองคนต่อไปได้เลย</div>';
    clearPerson(); loadStatsOnly(); return;
  }
  const cid = C.$('sc-cid').value.replace(/\D/g,'');
  const name = C.$('sc-name').value.trim();
  if(!cidOk(cid)) return err('ใส่เลขบัตรประชาชน 13 หลักให้ถูกต้อง (ใช้จับคู่ตอนมา รพ.)');
  if(!name) return err('ใส่ชื่อ-สกุล');
  if(kind==='referred' && !C.$('sc-appt')?.value) return err('เลือกวันนัดไป รพ.');
  const id = `NS_${h}_${Date.now().toString(36)}`;
  const taste = [...document.querySelectorAll('.sc-taste:checked')].map(x=>x.value);
  const by = C.PROFILE.full_name||C.ME.email;
  const data = {
    hcode:h, hcode_name:C.rpstName(h), fy, screen_date:d, screener:C.$('sc-by').value.trim()||by, moo:num(C.$('sc-moo').value),
    person:{ full_name:name, sex:m.sex, age:m.age, phone:C.$('sc-phone').value.replace(/\D/g,'')||null, cid_last4:cid.slice(-4) },
    history:{ family_dm:C.$('sc-fdm').checked, family_ht:C.$('sc-fht').checked, has_dm:C.$('sc-hdm').checked, has_ht:C.$('sc-hht').checked,
      other:C.$('sc-hoth').value.trim()||null },
    measure:{ weight:m.weight, height:m.height, waist:m.waist, sbp1:m.sbp1, dbp1:m.dbp1, sbp2:m.sbp2, dbp2:m.dbp2, dtx:m.dtx, fasting:m.fasting,
      smoke:C.$('sc-smoke').value, smoke_years:num(C.$('sc-smoke-y').value), smoke_per_day:num(C.$('sc-smoke-n').value),
      alcohol:C.$('sc-alc').value, alcohol_years:num(C.$('sc-alc-y').value), taste },
    result:{ dm:r.dm, ht:r.ht, bmi:r.bmi, bmi_txt:r.bmi_txt, waist_over:r.waist, overall:r.overall, urgent:r.urgent },
    status:kind,
    refer: kind==='referred' ? { appoint_date:C.$('sc-appt').value, note:C.$('sc-note').value.trim()||null, at:localISO() } : null,
    followups:[], created_uid:C.ME.uid, created_by:by, created_at:fs.serverTimestamp() };
  try{
    await fs.setDoc(fs.doc(db,'ncd_screen_pii',id), {cid, hcode:h});
    await fs.setDoc(fs.doc(db,'ncd_screen',id), data);
    await bump(r.overall==='suspect'?'suspect':'risk');
    if(kind==='referred') await fs.setDoc(fs.doc(db,'ncd_screen_stats',statId), {referred:fs.increment(1)}, {merge:true});
    await C.audit('ncd_screen_'+kind, id, {hcode:h});
  }catch(e){ return err('บันทึกไม่สำเร็จ: '+(e.code||e.message)+(e.code==='permission-denied'?' — ต้อง Publish firestore.rules ชุดใหม่':'')); }
  const row = {id, ...data}; ROWS.push(row);
  C.$('sc-msg').innerHTML = `<div class="msg ok" style="font-size:16px"><div style="width:100%"><b>✓ บันทึกแล้ว</b> — ${esc(name)} · ${kind==='referred'?`ส่งต่อ รพ.สวี นัด ${C.thDate(data.refer.appoint_date)}`:'กลุ่มเสี่ยง ติดตามในชุมชน'}
    ${kind==='referred'?'<div style="margin-top:8px"><button class="btn-primary" id="sc-print">🖨 พิมพ์ใบส่งตัว (A5)</button></div>':''}</div></div>`;
  C.$('sc-print')?.addEventListener('click', ()=>printSlip(row));
  clearPerson(); paintList(); loadStatsOnly();
}
function clearPerson(){
  ['sc-cid','sc-name','sc-age','sc-phone','sc-hoth','sc-w','sc-ht','sc-waist','sc-sbp','sc-dbp','sc-sbp2','sc-dbp2','sc-dtx','sc-smoke-y','sc-smoke-n','sc-alc-y']
    .forEach(i=>{ const x=C.$(i); if(x) x.value=''; });
  ['sc-fdm','sc-fht','sc-hdm','sc-hht'].forEach(i=>{ const x=C.$(i); if(x) x.checked=false; });
  document.querySelectorAll('.sc-taste').forEach(x=>x.checked=false);
  C.$('sc-sex').value=''; C.$('sc-smoke').value='no'; C.$('sc-alc').value='no'; C.$('sc-cid-msg').innerHTML='';
  paintJudge();
}
async function loadStatsOnly(){
  try{ const sc = C.fs.collection(C.db,'ncd_screen_stats');
    const ss = await C.fs.getDocs(C.isRpst() ? C.fs.query(sc, C.fs.where('hcode','==',C.myHcode())) : sc);
    STATS = ss.docs.map(d=>({id:d.id, ...d.data()})); paintTiles(); }catch(e){}
}

/* ---------- รายชื่อติดตาม ---------- */
function scoped(){ return ROWS.filter(r=>!VIEW.hcode || r.hcode===VIEW.hcode); }
function paintTiles(){
  const fy = fiscalBE(localISO()), rows = scoped().filter(r=>r.fy===fy);
  const st = STATS.filter(s=>s.fy===fy && (!VIEW.hcode || s.hcode===VIEW.hcode));
  const sum = k => st.reduce((a,s)=>a+(s[k]||0),0);
  const ref = rows.filter(r=>r.refer), wait = ref.filter(r=>r.status==='referred');
  const late = wait.filter(r=>r.refer.appoint_date < localISO());
  const came = ref.filter(r=>['visited','closed'].includes(r.status));
  const tiles = [['คัดกรองทั้งหมด', sum('total'), '#333'], ['ปกติ', sum('normal'), '#1F7A4D'], ['กลุ่มเสี่ยง', sum('risk'), '#8A5A00'],
    ['สงสัยป่วย', sum('suspect'), '#B3261E'], ['ส่งต่อ รพ.', ref.length, '#333'], ['มาแล้ว', came.length + (ref.length?` (${Math.round(came.length*100/ref.length)}%)`:''), '#1F7A4D'],
    ['รอมา', wait.length, '#8A5A00'], ['เลยนัด', late.length, '#B3261E']];
  C.$('sc-tiles').innerHTML = `<div class="sub" style="margin-bottom:4px">ปีงบ ${fy}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${tiles.map(([l,v,c])=>
    `<div style="border:1px solid var(--line);border-radius:10px;padding:7px 12px;background:#fff;min-width:88px">
      <div class="sub">${l}</div><div style="font-size:20px;font-weight:700;color:${c}">${v}</div></div>`).join('')}</div>`;
}
function paintList(){
  const {esc, thDate} = C;
  paintTiles();
  let rows = scoped();
  const s = VIEW.st;
  if(s==='wait') rows = rows.filter(r=>r.status==='referred');
  else if(s==='late') rows = rows.filter(r=>r.status==='referred' && r.refer?.appoint_date < localISO());
  else if(s) rows = rows.filter(r=>r.status===s);
  if(VIEW.q){ const q = VIEW.q.replace(/\D/g,''); rows = rows.filter(r=>(q && (String(r.hn||'').includes(q) || r.person?.cid_last4===q.slice(-4)))); }
  rows.sort((a,b)=>String(a.refer?.appoint_date||a.screen_date).localeCompare(String(b.refer?.appoint_date||b.screen_date)));
  C.$('sc-count').textContent = `${rows.length} คน`;
  C.$('sc-list').innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>คัดกรอง</th><th>ผู้รับการคัดกรอง</th>${C.isRpst()?'':'<th>รพ.สต.</th>'}
    <th>ผล</th><th>นัด รพ.</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.map(r=>{
      const ms = r.measure||{}, rs = r.result||{};
      return `<tr>
      <td>${thDate(r.screen_date)}<div class="sub">${esc(r.screener||'')}${r.moo?' · ม.'+esc(r.moo):''}</div></td>
      <td><span class="masked">${C.maskName(r.person?.full_name)}</span> <button class="btn-eye" data-se="${esc(r.id)}" title="เปิดดูชื่อ (มีบันทึก log)">👁</button>
        <div class="sub">บัตร ••••${esc(r.person?.cid_last4||'')}${r.person?.age!=null?' · '+esc(r.person.age)+' ปี':''}${r.hn?' · HN '+esc(r.hn):''}</div></td>
      ${C.isRpst()?'':`<td>${esc(r.hcode_name||C.rpstName(r.hcode))}</td>`}
      <td>${tag('DM',rs.dm)} ${tag('HT',rs.ht)}<div class="sub">${ms.dtx!=null?`DTX ${esc(ms.dtx)}${ms.fasting?' (งดอาหาร)':''}`:''}
        ${(ms.sbp2??ms.sbp1)!=null?` · BP ${esc(ms.sbp2??ms.sbp1)}/${esc(ms.dbp2??ms.dbp1)}`:''}${rs.bmi?` · BMI ${esc(rs.bmi)}`:''}</div></td>
      <td>${r.refer?.appoint_date?thDate(r.refer.appoint_date):'<span class="sub">-</span>'}</td>
      <td>${stTag(r)}${r.visit?`<div class="sub">${thDate(r.visit.date)}${r.visit.dep?' · '+esc(r.visit.dep):''}<br>${esc(r.visit.by||'')}</div>`:''}
        ${r.outcome?`<div class="sub"><b>${esc(r.outcome.text)}</b></div>`:''}
        ${(r.followups||[]).length?`<div class="sub">ติดตาม ${r.followups.length} ครั้ง · ล่าสุด: ${esc(r.followups.at(-1).text)}</div>`:''}</td>
      <td class="right" style="white-space:nowrap">
        ${isHosp() && r.status==='referred'?`<button class="btn-sm" data-sv="${esc(r.id)}">มาแล้ว</button> `:''}
        ${isHosp() && ['referred','visited'].includes(r.status) && r.refer?`<button class="btn-sm" data-so="${esc(r.id)}">ผลวินิจฉัย</button> `:''}
        ${isHosp()?`<button class="btn-sm grey" data-sc="${esc(r.id)}">เลขบัตร</button> `:''}
        ${['referred','risk_only'].includes(r.status)?`<button class="btn-sm grey" data-sf="${esc(r.id)}">ติดตาม</button> `:''}
        ${r.status==='risk_only'?`<button class="btn-sm" data-sr="${esc(r.id)}">ส่งต่อ รพ.</button> `:''}
        ${r.refer?`<button class="btn-sm grey" data-sp="${esc(r.id)}">ใบส่งตัว</button>`:''}</td></tr>`; }).join('')}</tbody></table></div>`
    : '<div class="empty">ไม่มีรายชื่อ</div>';
  const L = C.$('sc-list'), get = id => ROWS.find(x=>x.id===id);
  L.querySelectorAll('[data-se]').forEach(b=>b.addEventListener('click', async ()=>{ const r=get(b.dataset.se);
    await C.audit('reveal_sensitive', r.id, {field:'full_name', kind:'ncd_screen'}); b.previousElementSibling.textContent=r.person?.full_name||'-'; b.style.display='none'; }));
  L.querySelectorAll('[data-sc]').forEach(b=>b.addEventListener('click', async ()=>{
    try{ const d = await C.fs.getDoc(C.fs.doc(C.db,'ncd_screen_pii',b.dataset.sc)); await C.audit('reveal_sensitive', b.dataset.sc, {field:'cid', kind:'ncd_screen'});
      const c = String(d.data()?.cid||''); b.textContent = c.replace(/^(\d)(\d{4})(\d{5})(\d{2})(\d)$/,'$1-$2-$3-$4-$5'); b.disabled = true; }
    catch(e){ alert('เปิดเลขบัตรไม่ได้: '+(e.code||e.message)); } }));
  L.querySelectorAll('[data-sv]').forEach(b=>b.addEventListener('click', ()=>markVisited(get(b.dataset.sv))));
  L.querySelectorAll('[data-so]').forEach(b=>b.addEventListener('click', ()=>openOutcome(get(b.dataset.so))));
  L.querySelectorAll('[data-sf]').forEach(b=>b.addEventListener('click', ()=>addFollow(get(b.dataset.sf))));
  L.querySelectorAll('[data-sr]').forEach(b=>b.addEventListener('click', ()=>referLater(get(b.dataset.sr))));
  L.querySelectorAll('[data-sp]').forEach(b=>b.addEventListener('click', ()=>printSlip(get(b.dataset.sp))));
}
async function upd(r, patch, act){
  try{ await C.fs.updateDoc(C.fs.doc(C.db,'ncd_screen',r.id), patch); await C.audit(act, r.id, {});
       Object.assign(r, patch); paintList(); return true; }
  catch(e){ alert('บันทึกไม่สำเร็จ: '+(e.code||e.message)+(e.code==='permission-denied'?' — ต้อง Publish firestore.rules ชุดใหม่':'')); return false; }
}
function markVisited(r){
  const d = prompt('วันที่มาเปิด visit ที่ รพ.สวี (ค.ศ. ปปปป-ดด-วว)', localISO()); if(!d) return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return alert('รูปแบบวันที่ไม่ถูกต้อง');
  upd(r, {status:'visited', visit:{date:d, by:'บันทึกโดย '+(C.PROFILE.full_name||C.ME.email)}}, 'ncd_screen_visited');
}
function openOutcome(r){
  const {esc} = C;
  C.$('ov-body').innerHTML = `<h2>ผลวินิจฉัย — ปิดเคส</h2>
    <div class="sec"><b>${esc(r.person?.full_name||'-')}</b> <span class="sub">บัตร ••••${esc(r.person?.cid_last4||'')} · ${esc(r.hcode_name||'')}</span></div>
    <div class="fld"><label>ผล</label><select id="so-t" style="min-width:320px">${OUTCOMES.map(o=>`<option>${esc(o)}</option>`).join('')}</select></div>
    <div class="fld" style="margin-top:8px"><label>HN (ถ้ามี)</label><input type="text" id="so-hn" value="${esc(r.hn||'')}" style="width:140px"></div>
    <div class="fld" style="margin-top:8px"><label>หมายเหตุ</label><input type="text" id="so-n" style="width:100%"></div>
    <div class="frm" style="margin-top:12px"><button class="btn-primary" id="so-ok">บันทึกและปิดเคส</button></div>`;
  C.$('ov').classList.remove('hidden');
  C.$('so-ok').addEventListener('click', async ()=>{
    const hn = C.$('so-hn').value.replace(/\D/g,'');
    const p = {status:'closed', outcome:{text:C.$('so-t').value, note:C.$('so-n').value.trim()||null, by:C.PROFILE.full_name||C.ME.email, at:localISO()}};
    if(hn) p.hn = hn;
    if(!r.visit) p.visit = {date:localISO(), by:'บันทึกพร้อมผลวินิจฉัย'};
    if(await upd(r, p, 'ncd_screen_outcome')) C.$('ov').classList.add('hidden');
  });
}
function addFollow(r){
  const t = prompt('บันทึกการติดตาม (เช่น โทรแล้ว นัดมาวันที่..., อสม. ไปเยี่ยมบ้าน)'); if(!t) return;
  upd(r, {followups:[...(r.followups||[]), {at:localISO(), by:C.PROFILE.full_name||C.ME.email, text:t.trim()}]}, 'ncd_screen_follow');
}
function referLater(r){
  const d = prompt('ส่งต่อ รพ.สวี — วันนัด (ค.ศ. ปปปป-ดด-วว)', nextWorkday()); if(!d) return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < localISO()) return alert('วันนัดไม่ถูกต้อง');
  upd(r, {status:'referred', refer:{appoint_date:d, note:null, at:localISO()}}, 'ncd_screen_refer').then(ok=>{ if(ok) printSlip(r); });
}

/* ---------- ใบส่งตัว A5 (ผู้ป่วยถือมา รพ.) ---------- */
function printSlip(r){
  if(!r) return;
  const {esc, thDate} = C, ms = r.measure||{}, rs = r.result||{}, u = C.RPST.find(x=>x.hcode===r.hcode)||{};
  const w = window.open('', '_blank', 'width=600,height=860');
  if(!w){ alert('เบราว์เซอร์บล็อกหน้าต่างพิมพ์ — อนุญาต pop-up ก่อน'); return; }
  const fastNeed = rs.dm && rs.dm!=='normal';
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบส่งตัวคัดกรอง</title>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
  <style>@page{size:A5 portrait;margin:9mm}*{box-sizing:border-box}body{font-family:'Sarabun','Tahoma',sans-serif;margin:0;color:#111;font-size:14.5px}
  .pg{width:130mm;height:190mm;margin:0 auto;display:flex;flex-direction:column;overflow:hidden}
  .hd{border-bottom:2px solid #111;padding-bottom:2mm}.hd h1{font-size:19px;margin:0}.hd .s{font-size:12.5px;color:#333}
  .pt{margin-top:3mm;font-size:15px}.pt b{font-size:17px}
  .ap{margin-top:3mm;border:2.5px solid #111;border-radius:4mm;padding:3mm 4mm}.ap .d{font-size:26px;font-weight:700}
  table{border-collapse:collapse;width:100%;margin-top:3mm}td,th{border:1px solid #777;padding:1.3mm 2mm;font-size:13.5px;text-align:left}th{background:#eee}
  .r{font-weight:700}.prep{margin-top:3mm;border:1.5px solid #111;border-radius:3mm;padding:2.5mm 4mm}.prep li{margin:.6mm 0}
  .ft{margin-top:auto;font-size:11.5px;color:#444;border-top:1px solid #999;padding-top:1.5mm}
  .bar{position:sticky;top:0;background:#333;color:#fff;padding:10px;text-align:center;font-family:sans-serif}
  .bar button{font-size:17px;padding:9px 30px;border:0;border-radius:8px;background:#1F7A4D;color:#fff;cursor:pointer;margin:0 6px}.bar button.g{background:#666}
  @media print{.bar{display:none}}@media screen{body{background:#eee}.pg{background:#fff;margin:8px auto;box-shadow:0 1px 6px #0003;padding:8mm;height:auto;min-height:190mm}}</style></head>
  <body><div class="bar"><button onclick="window.print()">🖨 พิมพ์</button><button class="g" onclick="window.close()">ปิด</button></div><div class="pg">
  <div class="hd"><h1>ใบส่งต่อผู้ได้รับการคัดกรองเบาหวาน / ความดันโลหิตสูง</h1>
    <div class="s">จาก ${esc(u.name||r.hcode_name||r.hcode)} ${u.phone?'โทร '+esc(u.phone):''} → โรงพยาบาลสวี</div></div>
  <div class="pt">ชื่อ <b>${esc(r.person?.full_name||'')}</b> &nbsp; ${r.person?.sex?esc(r.person.sex):''} ${r.person?.age!=null?'อายุ '+esc(r.person.age)+' ปี':''}<br>
    เลขบัตรประชาชน •-••••-•••••-${esc(String(r.person?.cid_last4||'').slice(0,2))}-${esc(String(r.person?.cid_last4||'').slice(2))}${r.person?.phone?' &nbsp; โทร '+esc(r.person.phone):''}</div>
  <div class="ap">ให้ไปพบแพทย์ที่ <b>โรงพยาบาลสวี</b><div class="d">วันที่ ${thDate(r.refer?.appoint_date)}</div>
    <div>ยื่นใบนี้ที่จุดคัดกรอง/เวชระเบียน ${r.result?.urgent?'<b style="color:#B3261E">— ความดันสูงมาก ควรไปทันที</b>':''}</div></div>
  <table><tr><th>ผลคัดกรอง ${thDate(r.screen_date)}</th><th>ค่า</th><th>แปลผล</th></tr>
    <tr><td>ความดันโลหิต</td><td>${(ms.sbp2??ms.sbp1)!=null?`${esc(ms.sbp2??ms.sbp1)}/${esc(ms.dbp2??ms.dbp1)} mmHg`:'-'}</td><td class="r">${rs.ht?LBL[rs.ht]:'-'}</td></tr>
    <tr><td>น้ำตาลปลายนิ้ว</td><td>${ms.dtx!=null?`${esc(ms.dtx)} mg/dL ${ms.fasting?'(งดอาหาร)':'(ไม่งด)'}`:'-'}</td><td class="r">${rs.dm?LBL[rs.dm]:'-'}</td></tr>
    <tr><td>BMI / รอบเอว</td><td>${rs.bmi?esc(rs.bmi):'-'} / ${ms.waist?esc(ms.waist)+' ซม.':'-'}</td><td>${esc(rs.bmi_txt||'')}${rs.waist_over?' · รอบเอวเกิน':''}</td></tr></table>
  <div class="prep"><b>การเตรียมตัว</b><ul style="margin:1mm 0 0;padding-left:5mm">
    ${fastNeed?'<li><b>งดน้ำและอาหารหลังเที่ยงคืน</b> (ดื่มน้ำเปล่าได้) เพื่อเจาะเลือดตรวจน้ำตาล</li>':''}
    <li>นำบัตรประชาชนและใบนี้ไปด้วย</li><li>ไปถึงก่อนเวลา 08.00 น.</li>
    <li>ถ้าไปตามนัดไม่ได้ โทรแจ้ง รพ.สต. ${u.phone?esc(u.phone):''}</li></ul></div>
  ${r.refer?.note?`<div style="margin-top:2mm">หมายเหตุ: ${esc(r.refer.note)}</div>`:''}
  <div class="ft">ผู้คัดกรอง ${esc(r.screener||'')} · ระบบ Sawee-refer (รพ.สวี จะเห็นรายชื่อนี้และติดตามว่ามาแล้วหรือยัง)</div>
  </div></body></html>`);
  w.document.close();
  C.audit('ncd_screen_print', r.id, {});
}
