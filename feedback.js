/* =====================================================================
   feedback.js — ปุ่มลอย "ประเมินการใช้งาน" มุมขวาล่าง (โหลดจาก refer.html หลังเข้าสู่ระบบ)
   ผู้ใช้: ให้คะแนน 1–5 ดาวทุกโหมดที่เคยใช้ (ไม่ได้ใช้ = ข้าม) + ความคิดเห็น → ขอบคุณ
   admin : เปิด/ปิดระบบ · เลือกว่าคนที่ประเมินแล้วจะเห็นปุ่มอีกหรือไม่ · เริ่มรอบประเมินใหม่ · ดูสรุปคะแนนและความคิดเห็น
   ค่าตั้ง: config/feedback {enabled, allow_repeat, round} · คำตอบ: feedback/{round}_{uid} (คนละ 1 ชุดต่อรอบ แก้ได้ถ้าเปิดให้ซ้ำ)
   ===================================================================== */

let C = null, CFG = null, MINE = null;

const MODES = [
  ['overall',  'ภาพรวมการใช้งาน', 'ใช้ง่าย เร็ว ช่วยงานได้จริง'],
  ['send',     'เช็ค / ส่งตัวผู้ป่วย', 'พยาบาล-เภสัชกร ส่งตัวไป รพ.สต. + พิมพ์ใบนัด'],
  ['list',     'รายชื่อผู้ป่วย / รับตัว', 'รพ.สต. รับตัว ยืนยันวันนัด ดูยา-แล็บ'],
  ['visit',    'รอบนัด / ออกหน่วย', 'ปฏิทินวันคลินิก บันทึกการให้บริการ'],
  ['drug',     'สรุปยา / บัญชียา', 'ยอดยาที่ต้องเตรียม วิธีใช้ยา'],
  ['remission','ผู้ป่วย NCDs Remission', 'เปิด visit คีย์ 1I20'],
  ['foot',     'ตรวจเท้าเบาหวาน', 'ส่งตรวจ ฟอร์ม A4 บันทึกผล'],
  ['screen',   'คัดกรอง NCDs', 'คัดกรอง ส่งต่อ ติดตามการมา รพ.'],
  ['line',     'แจ้งเตือนนัดทาง LINE', 'QR ในใบนัด ข้อความถึงผู้ป่วย'],
];
const STAR_TXT = ['', 'ต้องปรับปรุงมาก', 'พอใช้', 'ดี', 'ดีมาก', 'ยอดเยี่ยม'];

export async function initFeedback(ctx){
  C = ctx;
  injectCss();
  try{ const d = await C.fs.getDoc(C.fs.doc(C.db,'config','feedback')); CFG = d.exists() ? d.data() : {enabled:false, allow_repeat:false, round:'r1'}; }
  catch(e){ CFG = {enabled:false, allow_repeat:false, round:'r1'}; }
  CFG.round = CFG.round || 'r1';
  try{ const m = await C.fs.getDoc(C.fs.doc(C.db,'feedback',`${CFG.round}_${C.ME.uid}`)); MINE = m.exists() ? m.data() : null; }
  catch(e){ MINE = null; }
  paintFab();
}
const showFab = () => C.isAdmin() || (CFG.enabled && (!MINE || CFG.allow_repeat));
function paintFab(){
  document.getElementById('fb-fab')?.remove();
  if(!showFab()) return;
  const b = document.createElement('button');
  b.id = 'fb-fab';
  b.className = CFG.enabled && !MINE ? 'pulse' : '';
  b.innerHTML = `<span class="fb-star">★</span><span class="fb-txt">${MINE?'แก้คำประเมิน':'ประเมินการใช้งาน'}</span>${!CFG.enabled&&C.isAdmin()?'<span class="fb-off">ปิดอยู่</span>':''}`;
  b.addEventListener('click', openForm);
  document.body.appendChild(b);
}

function openForm(){
  const {esc} = C, prev = MINE?.scores || {};
  const box = document.createElement('div');
  box.id = 'fb-ov';
  box.innerHTML = `<div class="fb-card" role="dialog" aria-label="ประเมินการใช้งาน">
    <button class="fb-x" aria-label="ปิด">&times;</button>
    <div class="fb-hd"><div class="fb-hd-star">★</div><div><h2>ประเมินการใช้งานระบบส่งตัวผู้ป่วย</h2>
      <div class="fb-sub">ใช้เวลาไม่ถึง 1 นาที · ให้คะแนนเฉพาะส่วนที่เคยใช้ ส่วนที่ไม่ได้ใช้ข้ามได้</div></div></div>
    ${C.isAdmin()?adminBar():''}
    <div class="fb-body">
      ${MODES.map(([k,t,d])=>`<div class="fb-row" data-k="${k}">
        <div class="fb-l"><b>${esc(t)}</b><div class="fb-d">${esc(d)}</div></div>
        <div class="fb-r"><div class="fb-stars">${[1,2,3,4,5].map(n=>`<button type="button" data-n="${n}" aria-label="${n} ดาว">★</button>`).join('')}</div>
          <div class="fb-st"><span class="fb-sv"></span><button type="button" class="fb-na">ไม่ได้ใช้</button></div></div></div>`).join('')}
      <label class="fb-cl">ความคิดเห็น / สิ่งที่อยากให้ปรับปรุง</label>
      <textarea id="fb-cm" rows="3" placeholder="เช่น อยากให้... / ตรงไหนใช้ยาก / ชอบตรงไหน">${esc(MINE?.comment||'')}</textarea>
      <div id="fb-msg"></div>
      <button class="fb-send" id="fb-send">ส่งคำประเมิน</button></div></div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  box.querySelector('.fb-x').addEventListener('click', close);
  box.addEventListener('click', e=>{ if(e.target===box) close(); });
  const S = {...prev};
  const paintRow = row => { const k = row.dataset.k, v = S[k]||0;
    row.querySelectorAll('.fb-stars button').forEach(b=>b.classList.toggle('on', +b.dataset.n <= v));
    row.querySelector('.fb-sv').textContent = v ? STAR_TXT[v] : '';
    row.querySelector('.fb-na').classList.toggle('on', !v); };
  box.querySelectorAll('.fb-row').forEach(row=>{
    row.querySelectorAll('.fb-stars button').forEach(b=>b.addEventListener('click', ()=>{ S[row.dataset.k] = +b.dataset.n; paintRow(row); }));
    row.querySelector('.fb-na').addEventListener('click', ()=>{ delete S[row.dataset.k]; paintRow(row); });
    paintRow(row);
  });
  if(C.isAdmin()) bindAdmin(box);
  box.querySelector('#fb-send').addEventListener('click', async ()=>{
    const comment = box.querySelector('#fb-cm').value.trim();
    if(!Object.keys(S).length && !comment){ box.querySelector('#fb-msg').innerHTML = '<div class="fb-err">ให้คะแนนอย่างน้อย 1 ข้อ หรือเขียนความคิดเห็น</div>'; return; }
    box.querySelector('#fb-send').disabled = true;
    const data = { uid:C.ME.uid, round:CFG.round, role:C.myRole(), hcode:C.myHcode()||null,
      name:C.PROFILE.full_name||C.ME.email, scores:S, comment:comment||null,
      edits:(MINE?.edits||0) + (MINE?1:0), at:C.fs.serverTimestamp() };
    try{ await C.fs.setDoc(C.fs.doc(C.db,'feedback',`${CFG.round}_${C.ME.uid}`), data); }
    catch(e){ box.querySelector('#fb-send').disabled = false;
      box.querySelector('#fb-msg').innerHTML = `<div class="fb-err">ส่งไม่สำเร็จ: ${esc(e.code||e.message)}${e.code==='permission-denied'?' — ต้อง Publish firestore.rules ชุดใหม่':''}</div>`; return; }
    MINE = data;
    box.querySelector('.fb-card').innerHTML = `<div class="fb-thx"><div class="fb-thx-ic">💚</div><h2>ขอบคุณมากครับ/ค่ะ</h2>
      <p>คำประเมินของคุณช่วยให้ทีม รพ.สวี ปรับระบบให้ใช้งานง่ายขึ้น</p><button class="fb-send" id="fb-done">ปิด</button></div>`;
    box.querySelector('#fb-done').addEventListener('click', close);
    setTimeout(close, 4000);
    paintFab();
  });
}

/* ---------- admin ---------- */
function adminBar(){
  return `<div class="fb-admin">
    <div class="fb-adm-row"><b>ตั้งค่า (admin)</b>
      <label><input type="checkbox" id="fb-a-en"${CFG.enabled?' checked':''}> เปิดให้ผู้ใช้ทุกคนเห็นปุ่ม</label>
      <label><input type="checkbox" id="fb-a-rep"${CFG.allow_repeat?' checked':''}> คนที่ประเมินแล้วยังเห็นปุ่ม (แก้คำตอบได้)</label></div>
    <div class="fb-adm-row"><span>รอบ: <b>${C.esc(CFG.round)}</b></span>
      <button type="button" id="fb-a-new">เริ่มรอบใหม่ (ทุกคนประเมินได้อีกครั้ง)</button>
      <button type="button" id="fb-a-res">ดูผลการประเมิน</button></div>
    <div id="fb-a-msg"></div><div id="fb-a-out"></div></div>`;
}
function bindAdmin(box){
  const save = async patch => {
    try{ await C.fs.setDoc(C.fs.doc(C.db,'config','feedback'), {...CFG, ...patch, updated_by:C.PROFILE.full_name||C.ME.email, updated_at:C.fs.serverTimestamp()});
      Object.assign(CFG, patch); box.querySelector('#fb-a-msg').innerHTML = '<span class="fb-ok">✓ บันทึกแล้ว</span>'; paintFab();
      if(patch.round){ MINE = null; } }
    catch(e){ box.querySelector('#fb-a-msg').innerHTML = `<span class="fb-err">${C.esc(e.code||e.message)}</span>`; }
  };
  box.querySelector('#fb-a-en').addEventListener('change', e=>save({enabled:e.target.checked}));
  box.querySelector('#fb-a-rep').addEventListener('change', e=>save({allow_repeat:e.target.checked}));
  box.querySelector('#fb-a-new').addEventListener('click', ()=>{
    if(!confirm('เริ่มรอบประเมินใหม่? ผลรอบเดิมยังเก็บไว้ ดูย้อนหลังได้')) return;
    const n = 'r' + new Date(Date.now()+7*3600e3).toISOString().slice(0,10).replace(/-/g,'');
    save({round:n}).then(()=>{ box.remove(); openForm(); });
  });
  box.querySelector('#fb-a-res').addEventListener('click', ()=>showResults(box));
}
async function showResults(box){
  const {esc} = C, out = box.querySelector('#fb-a-out');
  out.innerHTML = 'กำลังโหลด...';
  let rows;
  try{ const s = await C.fs.getDocs(C.fs.collection(C.db,'feedback')); rows = s.docs.map(d=>d.data()); }
  catch(e){ out.innerHTML = `<span class="fb-err">${esc(e.code||e.message)}</span>`; return; }
  const rounds = [...new Set(rows.map(r=>r.round))].sort().reverse();
  const paint = rd => {
    const rs = rows.filter(r=>r.round===rd);
    const ROLE = {admin:'admin', hospital:'พยาบาล/เภสัชกร', rpst:'รพ.สต.'};
    const byRole = Object.entries(rs.reduce((a,r)=>(a[r.role]=(a[r.role]||0)+1,a),{})).map(([k,v])=>`${ROLE[k]||k} ${v}`).join(' · ');
    out.innerHTML = `<div class="fb-adm-row"><span>รอบ <select id="fb-a-rd">${rounds.map(x=>`<option${x===rd?' selected':''}>${esc(x)}</option>`).join('')}</select></span>
        <span>ตอบแล้ว <b>${rs.length}</b> คน (${esc(byRole||'-')})</span></div>
      <table class="fb-tbl"><tr><th>ส่วนของระบบ</th><th>เฉลี่ย</th><th>จำนวนคนให้คะแนน</th></tr>${MODES.map(([k,t])=>{
        const v = rs.map(r=>r.scores?.[k]).filter(x=>x>0);
        const avg = v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
        return `<tr><td>${esc(t)}</td><td>${avg!=null?`<b>${avg.toFixed(2)}</b> <span class="fb-bar"><i style="width:${avg*20}%"></i></span>`:'-'}</td><td>${v.length}</td></tr>`; }).join('')}</table>
      <div class="fb-cms"><b>ความคิดเห็น</b>${rs.filter(r=>r.comment).map(r=>`<div class="fb-cmi">"${esc(r.comment)}"<span> — ${esc(ROLE[r.role]||r.role||'')}${r.hcode?' '+esc(C.rpstName(r.hcode)):''}</span></div>`).join('')||'<div class="fb-cmi">-</div>'}</div>`;
    out.querySelector('#fb-a-rd').addEventListener('change', e=>paint(e.target.value));
  };
  if(!rounds.length){ out.innerHTML = 'ยังไม่มีคำประเมิน'; return; }
  paint(rounds.includes(CFG.round) ? CFG.round : rounds[0]);
}

function injectCss(){
  if(document.getElementById('fb-css')) return;
  const s = document.createElement('style'); s.id = 'fb-css';
  s.textContent = `
  #fb-fab{position:fixed;right:18px;bottom:18px;z-index:900;display:flex;align-items:center;gap:8px;padding:12px 18px 12px 14px;border:0;border-radius:999px;
    background:linear-gradient(135deg,#FF8A3D,#E8620C 55%,#C2410C);color:#fff;font:600 15px 'Noto Sans Thai',sans-serif;cursor:pointer;
    box-shadow:0 6px 18px #E8620C66,0 2px 4px #0003;transition:transform .15s}
  #fb-fab:hover{transform:translateY(-2px) scale(1.03)}
  #fb-fab .fb-star{font-size:20px;line-height:1;display:inline-block;animation:fbspin 3.5s ease-in-out infinite}
  #fb-fab .fb-off{font-size:11px;background:#0004;border-radius:6px;padding:1px 6px}
  #fb-fab.pulse::after{content:'';position:absolute;inset:0;border-radius:999px;box-shadow:0 0 0 0 #E8620C88;animation:fbpulse 2s infinite}
  @keyframes fbpulse{0%{box-shadow:0 0 0 0 #E8620C88}70%{box-shadow:0 0 0 16px #E8620C00}100%{box-shadow:0 0 0 0 #E8620C00}}
  @keyframes fbspin{0%,80%,100%{transform:rotate(0)}88%{transform:rotate(-18deg) scale(1.2)}94%{transform:rotate(14deg) scale(1.2)}}
  @media (prefers-reduced-motion:reduce){#fb-fab .fb-star,#fb-fab.pulse::after{animation:none}}
  @media (max-width:560px){#fb-fab .fb-txt{display:none}#fb-fab{padding:14px}}
  #fb-ov{position:fixed;inset:0;z-index:950;background:#1b120a99;display:flex;align-items:flex-end;justify-content:flex-end;padding:16px}
  .fb-card{position:relative;width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:18px;
    box-shadow:0 20px 50px #0005;font-family:'Noto Sans Thai',sans-serif;animation:fbin .25s ease-out}
  @keyframes fbin{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}
  .fb-x{position:absolute;right:10px;top:8px;border:0;background:#fff3;color:#fff;font-size:26px;width:36px;height:36px;border-radius:50%;cursor:pointer}
  .fb-hd{display:flex;gap:12px;align-items:center;padding:18px 20px;border-radius:18px 18px 0 0;background:linear-gradient(135deg,#FF8A3D,#E8620C);color:#fff}
  .fb-hd h2{margin:0;font-size:18px}.fb-sub{font-size:13px;opacity:.92}
  .fb-hd-star{font-size:34px;line-height:1}
  .fb-body{padding:8px 20px 20px}
  .fb-row{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #f0e6dc;flex-wrap:wrap}
  .fb-l b{font-size:15px}.fb-d{font-size:12px;color:#7a6a5c}
  .fb-r{text-align:right}
  .fb-stars button{border:0;background:none;font-size:26px;line-height:1;color:#ddd2c6;cursor:pointer;padding:0 1px;transition:transform .1s,color .1s}
  .fb-stars button:hover{transform:scale(1.2)}.fb-stars button.on{color:#F5A524}
  .fb-st{font-size:12px;color:#7a6a5c;display:flex;gap:8px;justify-content:flex-end;align-items:center;min-height:20px}
  .fb-na{border:1px solid #e5d8cb;background:#fff;border-radius:999px;font-size:11.5px;padding:1px 8px;color:#7a6a5c;cursor:pointer}
  .fb-na.on{background:#f3ebe3;color:#5a4a3c}
  .fb-cl{display:block;margin-top:12px;font-size:14px;font-weight:600}
  #fb-cm{width:100%;margin-top:4px;border:1px solid #e5d8cb;border-radius:10px;padding:8px 10px;font:14px 'Noto Sans Thai',sans-serif;resize:vertical}
  .fb-send{margin-top:12px;width:100%;border:0;border-radius:12px;padding:13px;font:600 16px 'Noto Sans Thai',sans-serif;color:#fff;cursor:pointer;
    background:linear-gradient(135deg,#FF8A3D,#E8620C)}
  .fb-send:disabled{opacity:.6}
  .fb-err{color:#B3261E;font-size:13px;margin-top:8px}.fb-ok{color:#1F7A4D;font-size:13px}
  .fb-thx{text-align:center;padding:36px 24px}.fb-thx-ic{font-size:56px;animation:fbin .4s}.fb-thx h2{margin:8px 0}.fb-thx p{color:#5a4a3c}
  .fb-admin{margin:12px 20px 0;padding:10px 12px;border:1px dashed #E8620C;border-radius:12px;background:#FFF7F0;font-size:13.5px}
  .fb-adm-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:4px 0}
  .fb-adm-row button{border:1px solid #E8620C;background:#fff;color:#C2410C;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:13px}
  .fb-tbl{width:100%;border-collapse:collapse;margin-top:6px}.fb-tbl td,.fb-tbl th{border-bottom:1px solid #f0e6dc;padding:4px 6px;text-align:left;font-size:13px}
  .fb-bar{display:inline-block;width:70px;height:7px;background:#f0e6dc;border-radius:4px;vertical-align:middle}.fb-bar i{display:block;height:100%;background:#F5A524;border-radius:4px}
  .fb-cms{margin-top:8px}.fb-cmi{padding:5px 0;border-bottom:1px dotted #e5d8cb}.fb-cmi span{color:#7a6a5c;font-size:12px}`;
  document.head.appendChild(s);
}
