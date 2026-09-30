/**
 * LINE Hub — ส่งข้อความแจ้งเตือนนัดทาง LINE OA ของ รพ.สวี (Google Apps Script · ทำงานบนคลาวด์ของ Google ตลอด 24 ชม.)
 * ไม่ต้องพึ่งเครื่อง server ใน รพ.
 *
 *  • หน้าเว็บ refer.html เขียนคิว line_outbox แล้วเรียก Web App นี้ทันที → push ภายในไม่กี่วินาที
 *  • ตัวตั้งเวลา "ทุก 1 นาที" ส่งคิวที่ค้าง (กันกรณีเรียกทันทีไม่สำเร็จ)
 *  • เตือนก่อนวันนัด 1 วัน เวลา 12:00 น. (ส่งตามได้ถึง 20:00)
 *  • ปุ่ม "รับทราบ" ในข้อความ → หน้า LIFF (?a=token) บันทึก line_acks → รพ.สต. เห็นว่าผู้ป่วยตอบรับแล้ว
 *  • ดูโควตาข้อความของ OA ได้จากหน้าเว็บ (action=status)
 *
 * ความปลอดภัย: Web App รับแค่ "เลขที่คิว" — เนื้อหาข้อความ Hub สร้างเองจากข้อมูลนัดใน Firestore
 *   คิวสร้างได้เฉพาะผู้มีสิทธิ์ตาม firestore.rules จึงไม่มีใครสั่ง Hub ส่งข้อความเองได้
 *   token ของ OA และ key ของ service account อยู่ใน Script Properties เท่านั้น (ไม่อยู่ในโค้ด)
 *
 * ติดตั้ง (ครั้งเดียว):
 *   1. script.google.com → New project → วางไฟล์นี้ทั้งหมดแทนโค้ดเดิม → ตั้งชื่อ "Sawee LINE Hub"
 *   2. Project Settings (รูปเฟือง) → Script Properties → เพิ่มค่า:
 *        LINE_TOKEN  = Channel access token (long-lived) ของ OA — ออกใหม่ก่อน (Reissue) เพราะตัวเดิมหลุดในแชตแล้ว
 *      แล้วเลือกใส่ key ของ service account แบบใดแบบหนึ่ง:
 *        (แนะนำ) SA_JSON = เนื้อหาไฟล์ serviceAccount.json ทั้งไฟล์ (เปิดด้วย Notepad → Ctrl+A → วาง)
 *        หรือ     SA_EMAIL = client_email · SA_KEY = private_key จากไฟล์เดียวกัน
 *                 (ไม่ต้องใส่เครื่องหมาย " ครอบ — ถ้าเผลอใส่ โค้ดจะตัดออกให้)
 *      ไฟล์ JSON ต้องมาจากโปรเจกต์ sawee-refer: Firebase Console → Project settings → Service accounts
 *        → Generate new private key
 *   3. เลือกฟังก์ชัน setup แล้วกด Run (ครั้งแรกจะขออนุญาต → Allow) — ตั้งตัวตั้งเวลาทุก 1 นาทีให้เอง
 *   4. เลือกฟังก์ชัน selfTest แล้ว Run → ดูใน Execution log ว่าต่อ Firestore และ LINE ได้ + โควตาที่เหลือ
 *   5. Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone → คัดลอก URL
 *      ไปวางที่ LINE_HUB_URL ใน refer.html
 *      (แก้โค้ดภายหลัง: Deploy → Manage deployments → ✎ → Version: New version — URL เดิมจะใช้โค้ดใหม่)
 */

const CFG = {
  project: 'sawee-refer',
  liffUrl: 'https://liff.line.me/2011801491-uJ1WbgA9',
  remindHour: 12,
  remindUntil: 20,
  tz: 'Asia/Bangkok',
};

/* ===================== Web App ===================== */
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (x) {}
  return json_(handle_(body));
}
function doGet(e) { return json_(handle_({ action: (e.parameter || {}).action || 'status' })); }

function handle_(b) {
  try {
    if (b.action === 'send' && /^[A-Za-z0-9]{10,40}$/.test(String(b.id || ''))) {
      return withLock_(() => processOutboxOne_(String(b.id)));
    }
    if (b.action === 'flush') return withLock_(() => ({ ok: true, done: processPending_() }));
    if (b.action === 'status') return status_();
    return { ok: false, error: 'unknown action' };
  } catch (x) { return { ok: false, error: String(x && x.message || x) }; }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, error: 'busy — ลองใหม่อีกครั้ง' };
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ===================== ตัวตั้งเวลา ===================== */
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(1).create();
  Logger.log('ตั้งตัวตั้งเวลา tick ทุก 1 นาทีแล้ว');
}
function tick() {
  withLock_(() => { processPending_(); remindTomorrow_(); return {}; });
}
function selfTest() {
  // 1) ตรวจค่า service account ก่อน — บอกได้ว่าผิดตรงไหนโดยไม่แสดง key
  let sa = null;
  try {
    sa = saCreds_();
    Logger.log('SA_EMAIL: ' + sa.email + ' (มาจาก ' + sa.from + ')');
    Logger.log('SA_KEY: ' + (sa.key.indexOf('-----BEGIN PRIVATE KEY-----') === 0 ? 'รูปแบบถูกต้อง' : 'รูปแบบไม่ถูกต้อง')
      + ' · ' + sa.key.split('\n').length + ' บรรทัด');
    if (sa.projectId && sa.projectId !== CFG.project)
      Logger.log('⚠ ไฟล์ JSON นี้เป็นของโปรเจกต์ "' + sa.projectId + '" ไม่ใช่ "' + CFG.project + '"');
  } catch (x) { Logger.log('✗ ' + (x.message || x)); return; }
  // 2) ขอ token Firestore
  try { CacheService.getScriptCache().remove('fs_token'); fsToken_(); Logger.log('Firestore token: OK'); }
  catch (x) {
    Logger.log('✗ ' + (x.message || x));
    if (/account not found/i.test(String(x.message || x)))
      Logger.log('→ Google ไม่รู้จัก service account "' + sa.email + '"\n'
        + '   สาเหตุที่พบบ่อย: คัดลอก client_email ผิด/ไม่ครบ, service account หรือ key ถูกลบ/ปิดใช้งานไปแล้ว,\n'
        + '   หรือใช้ไฟล์ JSON ของโปรเจกต์อื่น → ออก key ใหม่: Firebase Console → Project settings → Service accounts\n'
        + '   → Generate new private key แล้ววางทั้งไฟล์ลงใน Script Property ชื่อ SA_JSON');
    else if (/invalid jwt signature/i.test(String(x.message || x)))
      Logger.log('→ SA_KEY ไม่ตรงกับ SA_EMAIL หรือ key ถูกลบไปแล้ว — ออก key ใหม่แล้วใช้ SA_JSON');
    return;
  }
  // 3) LINE + Firestore
  Logger.log(JSON.stringify(status_(), null, 1));
}

/* ===================== คิว ===================== */
function processPending_() {
  const rows = fsQuery_('line_outbox', { status: 'pending' }, 20);
  return rows.map(r => processOutboxDoc_(r)).length;
}
function processOutboxOne_(id) {
  const d = fsGet_('line_outbox/' + id);
  if (!d) return { ok: false, error: 'ไม่พบคิว' };
  if (d.data.status !== 'pending') return { ok: d.data.status === 'sent', status: d.data.status, error: d.data.error || null, n: d.data.n_sent || 0 };
  return processOutboxDoc_(d);
}
function processOutboxDoc_(d) {
  const q = d.data, today = today_();
  // จองงาน (updateTime ต้องตรง) กันส่งซ้ำ
  if (!fsPatch_(d.name, { status: 'sending' }, null, d.updateTime)) return { ok: false, error: 'มีตัวอื่นรับไปแล้ว' };
  const ref = fsGet_('referrals/' + q.doc_id);
  const kind = ['accepted', 'rescheduled', 'resend', 'test'].indexOf(q.type) >= 0 ? q.type : 'resend';
  const ap = q.appoint_date || (ref && ref.data.workflow && ref.data.workflow.appoint_date) || null;
  let res;
  if (!ref) res = { ok: false, error: 'ไม่พบเคส', n: 0 };
  else if (!ap || ap < today) res = { ok: false, error: 'วันนัดผ่านไปแล้ว/ไม่มีวันนัด — ไม่ส่ง', n: 0 };
  else res = sendCase_(kind, ref.data, q.doc_id, ap);
  fsPatch_(d.name, { status: res.ok ? 'sent' : 'error', error: res.error || null, n_sent: res.n,
                     ack_token: res.ack || null, sent_at: nowText_(), via: 'hub' });
  if (ref && kind !== 'test') markRef_(ref.name, kind, res);
  return res;
}

/* ===================== เตือนวันก่อนนัด 12:00 ===================== */
function remindTomorrow_() {
  const h = +Utilities.formatDate(new Date(), CFG.tz, 'H');
  const today = today_(), props = PropertiesService.getScriptProperties();
  if (h < CFG.remindHour || h >= CFG.remindUntil || props.getProperty('REMIND_DONE') === today) return;
  const last = +(props.getProperty('REMIND_TRY') || 0);
  if (Date.now() - last < 5 * 60e3) return;
  props.setProperty('REMIND_TRY', String(Date.now()));
  const tmr = Utilities.formatDate(new Date(Date.now() + 864e5), CFG.tz, 'yyyy-MM-dd');
  const rows = fsQuery_('referrals', { 'workflow.appoint_date': tmr }, 300);
  let sent = 0, retry = false;
  rows.forEach(r => {
    const st = (r.data.workflow || {}).status;
    if (['scheduled', 'acknowledged'].indexOf(st) < 0 || r.data.line_reminded === tmr) return;
    const res = sendCase_('reminder', r.data, r.id, tmr);
    if (res.error === 'ผู้ป่วยยังไม่ได้ผูก LINE') return;
    if (!res.ok && /HTTP (0|5\d\d)\b/.test(res.error || '')) { retry = true; return; }
    fsPatch_(r.name, { line_reminded: tmr });
    markRef_(r.name, 'reminder', res);
    if (res.ok) sent++;
  });
  if (!retry) props.setProperty('REMIND_DONE', today);
  Logger.log('เตือนนัด ' + tmr + ' ส่งแล้ว ' + sent + ' เคส' + (retry ? ' (บางเคสจะลองใหม่)' : ''));
}

/* ===================== ส่งข้อความ ===================== */
function sendCase_(kind, ref, refId, ap) {
  const hn = String(ref.hn || '');
  const links = fsQuery_('line_links', { hn: hn }, 10).filter(x => x.data.consent && x.data.user_id);
  const users = Array.from(new Set(links.map(x => x.data.user_id)));
  if (!users.length) return { ok: false, error: 'ผู้ป่วยยังไม่ได้ผูก LINE', n: 0 };
  const hcode = String(ref.hcode || '');
  const rp = (fsGet_('rpst/' + hcode) || { data: { name: ref.hcode_name || hcode } }).data;
  const ack = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  fsPatch_('line_acks/' + ack, { doc_id: refId, hn: hn, hcode: hcode, rpst_name: rp.name || hcode, appoint_date: ap,
    type: kind, status: 'sent', sent_at: nowText_(), acked_at: null });
  const msg = flex_(kind, rp, ap, CFG.liffUrl + '?a=' + ack);
  let ok = 0; const errs = [];
  users.forEach(u => { const r = push_(u, [msg]); if (r.code === 200) ok++; else errs.push('HTTP ' + r.code + ' ' + r.error); });
  return { ok: ok > 0, error: errs.length ? Array.from(new Set(errs)).join(' | ') : null, ack: ack, n: ok };
}
function markRef_(name, kind, res) {
  fsPatch_(name, { line_last: { type: kind, ok: !!res.ok, error: res.error || null, n: res.n || 0,
    ack_token: res.ack || null, sent_at: nowText_(), via: 'hub' } });
}
function push_(to, messages) {
  const r = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + lineToken_(), 'X-Line-Retry-Key': Utilities.getUuid() },
    payload: JSON.stringify({ to: to, messages: messages }) });
  const code = r.getResponseCode();
  let err = '';
  if (code !== 200) { try { const j = JSON.parse(r.getContentText()); err = j.message + (j.details ? ' ' + JSON.stringify(j.details) : ''); } catch (x) { err = r.getContentText().slice(0, 200); } }
  return { code: code, error: err };
}
function lineToken_() {
  const t = prop_('LINE_TOKEN');
  if (!t) throw new Error('ยังไม่ได้ใส่ LINE_TOKEN ใน Script Properties');
  return t;
}

/* ===================== สถานะ / โควตา ===================== */
function status_() {
  const out = { ok: true, hub: 'Sawee LINE Hub', time: nowText_() };
  const get = (u) => { const r = UrlFetchApp.fetch(u, { headers: { Authorization: 'Bearer ' + lineToken_() }, muteHttpExceptions: true });
    return { code: r.getResponseCode(), j: (() => { try { return JSON.parse(r.getContentText()); } catch (x) { return {}; } })() }; };
  const q = get('https://api.line.me/v2/bot/message/quota');
  const c = get('https://api.line.me/v2/bot/message/quota/consumption');
  const bi = get('https://api.line.me/v2/bot/info');
  out.token_ok = q.code === 200;
  out.quota_type = q.j.type || null;          // limited | none
  out.quota_limit = q.j.value != null ? q.j.value : null;
  out.used_this_month = c.j.totalUsage != null ? c.j.totalUsage : null;
  out.remaining = (out.quota_limit != null && out.used_this_month != null) ? out.quota_limit - out.used_this_month : null;
  out.oa_name = bi.j.displayName || null;
  out.oa_basic_id = bi.j.basicId || null;
  if (q.code !== 200) out.error = 'LINE ตอบ HTTP ' + q.code + ' ' + (q.j.message || '') + ' — ตรวจ LINE_TOKEN';
  try { out.pending = fsQuery_('line_outbox', { status: 'pending' }, 50).length; } catch (x) { out.firestore_error = String(x.message || x); }
  return out;
}

/* ===================== Flex Message ===================== */
const TMON = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TDAY = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
function thDate_(iso, withDay) {
  const p = String(iso).split('-').map(Number); if (!p[0]) return iso;
  const d = new Date(p[0], p[1] - 1, p[2]);
  return (withDay ? 'วัน' + TDAY[d.getDay()] + 'ที่ ' : '') + p[2] + ' ' + TMON[p[1]] + ' ' + (p[0] + 543);
}
function daysTo_(iso) {
  const t = today_().split('-').map(Number), p = String(iso).split('-').map(Number);
  return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(t[0], t[1] - 1, t[2])) / 864e5);
}
function flex_(kind, rp, ap, ackUrl) {
  const name = rp.name || 'รพ.สต.', n = daysTo_(ap);
  const badge = { accepted: 'รพ.สต. รับนัดของท่านแล้ว', rescheduled: 'มีการเปลี่ยนวันนัด', reminder: 'พรุ่งนี้มีนัดรับยา',
                  test: 'ข้อความทดสอบระบบ' }[kind] || 'รายละเอียดนัดรับยาของท่าน';
  const lead = { accepted: name + ' รับนัดของท่านแล้ว ครั้งต่อไปโปรดเดินทางไปรับยาที่',
                 rescheduled: 'วันนัดของท่านเปลี่ยนแล้ว โปรดเดินทางไปรับยาที่',
                 reminder: 'พรุ่งนี้ โปรดเดินทางไปรับยาที่' }[kind] || 'โปรดเดินทางไปรับยาที่';
  const when = n <= 0 ? 'วันนี้' : n === 1 ? 'พรุ่งนี้' : 'อีก ' + n + ' วัน';
  const body = [
    { type: 'text', text: lead, size: 'sm', color: '#5B6770', wrap: true },
    { type: 'text', text: name, size: 'xl', weight: 'bold', color: '#10231A', wrap: true, margin: 'sm' },
  ];
  if (rp.address) body.push({ type: 'text', text: String(rp.address), size: 'xs', color: '#8A949B', wrap: true, margin: 'xs' });
  body.push({ type: 'box', layout: 'vertical', margin: 'lg', paddingAll: '14px', cornerRadius: '14px',
    backgroundColor: '#EAF9F0', borderColor: '#BFEBD0', borderWidth: '1px', contents: [
      { type: 'text', text: 'วันที่นัด', size: 'xs', color: '#0B8043' },
      { type: 'text', text: thDate_(ap, true), size: 'xl', weight: 'bold', color: '#0B6E3A', wrap: true, margin: 'xs' },
      { type: 'text', text: when, size: 'sm', weight: 'bold', color: '#0B8043', margin: 'xs' } ] });
  body.push({ type: 'box', layout: 'horizontal', margin: 'lg', spacing: 'md', contents: [
    { type: 'text', text: '📘', size: 'lg', flex: 0 },
    { type: 'text', text: 'นำสมุดประจำตัวผู้ป่วยโรคเรื้อรัง บัตรประชาชน และยาเดิมที่เหลือไปด้วย', size: 'sm', color: '#39434A', wrap: true, flex: 1 } ] });
  const foot = [{ type: 'button', style: 'primary', color: '#06C755', height: 'md', action: { type: 'uri', label: 'รับทราบ', uri: ackUrl } }];
  const row = [];
  if (rp.lat && rp.lng) row.push({ type: 'button', style: 'secondary', height: 'sm',
    action: { type: 'uri', label: 'นำทาง', uri: 'https://www.google.com/maps/dir/?api=1&destination=' + (+rp.lat).toFixed(6) + ',' + (+rp.lng).toFixed(6) } });
  const tel = String(rp.phone || '').replace(/\D/g, '');
  if (tel.length >= 9) row.push({ type: 'button', style: 'secondary', height: 'sm', action: { type: 'uri', label: 'โทร รพ.สต.', uri: 'tel:' + tel } });
  if (row.length) foot.push({ type: 'box', layout: 'horizontal', spacing: 'sm', contents: row });
  foot.push({ type: 'text', text: 'ถ้าไปตามนัดไม่ได้ โปรดโทรแจ้ง รพ.สต. ล่วงหน้า', size: 'xxs', color: '#9AA3A9', align: 'center', margin: 'sm', wrap: true });
  return {
    type: 'flex', altText: 'แจ้งเตือนนัด: รับยาที่ ' + name + ' ' + thDate_(ap, false),
    contents: { type: 'bubble', size: 'mega',
      header: { type: 'box', layout: 'vertical', paddingAll: '20px', paddingBottom: '18px',
        background: { type: 'linearGradient', angle: '135deg', startColor: '#06C755', endColor: '#0A8F7A' },
        contents: [
          { type: 'text', text: 'แจ้งเตือนนัด', size: 'xxl', weight: 'bold', color: '#FFFFFF' },
          { type: 'text', text: 'จาก โรงพยาบาลสวี', size: 'sm', color: '#DDFBEA', margin: 'xs' },
          { type: 'box', layout: 'vertical', margin: 'md', paddingAll: '6px', paddingStart: '12px', paddingEnd: '12px',
            cornerRadius: '20px', backgroundColor: '#FFFFFF33',
            contents: [{ type: 'text', text: badge, size: 'sm', weight: 'bold', color: '#FFFFFF', wrap: true }] } ] },
      body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: body },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', contents: foot },
      styles: { footer: { separator: true } } } };
}

/* ===================== Firestore REST (service account) ===================== */
const FS_BASE = () => 'https://firestore.googleapis.com/v1/projects/' + CFG.project + '/databases/(default)/documents';
/** อ่าน Script Property แล้วตัดช่องว่าง/ขึ้นบรรทัด/เครื่องหมาย " ' , ที่ติดมาตอนคัดลอกจากไฟล์ JSON */
function prop_(k) {
  let v = String(PropertiesService.getScriptProperties().getProperty(k) || '').trim();
  v = v.replace(/,$/, '').trim();
  if (/^(".*"|'.*')$/s.test(v)) v = v.slice(1, -1).trim();
  return v;
}
/** service account: ใช้ SA_JSON (ทั้งไฟล์) ถ้ามี ไม่งั้นใช้ SA_EMAIL + SA_KEY */
function saCreds_() {
  const raw = String(PropertiesService.getScriptProperties().getProperty('SA_JSON') || '').trim();
  let email, key, projectId = null, from;
  if (raw) {
    let j;
    try { j = JSON.parse(raw); } catch (x) { throw new Error('SA_JSON ไม่ใช่ JSON ที่ถูกต้อง — วางเนื้อหาไฟล์ serviceAccount.json ทั้งไฟล์'); }
    if (j.type && j.type !== 'service_account') throw new Error('SA_JSON ไม่ใช่ไฟล์ service account (type=' + j.type + ')');
    email = String(j.client_email || '').trim(); key = String(j.private_key || ''); projectId = j.project_id || null; from = 'SA_JSON';
  } else {
    email = prop_('SA_EMAIL'); key = prop_('SA_KEY'); from = 'SA_EMAIL/SA_KEY';
  }
  key = key.replace(/\\n/g, '\n').replace(/\r/g, '').trim();
  if (!email || !key) throw new Error('ยังไม่ได้ใส่ SA_JSON หรือ SA_EMAIL / SA_KEY ใน Script Properties');
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(email))
    throw new Error('SA_EMAIL ไม่ใช่อีเมล service account (ต้องลงท้าย .iam.gserviceaccount.com): "' + email + '"');
  if (key.indexOf('-----BEGIN PRIVATE KEY-----') !== 0) throw new Error('SA_KEY ต้องขึ้นต้นด้วย -----BEGIN PRIVATE KEY-----');
  return { email: email, key: key, projectId: projectId, from: from };
}
function fsToken_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('fs_token');
  if (hit) return hit;
  const sa = saCreds_(), email = sa.email, key = sa.key;
  const now = Math.floor(Date.now() / 1000);
  const enc = o => Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, '');
  const head = enc({ alg: 'RS256', typ: 'JWT' });
  const claim = enc({ iss: email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(head + '.' + claim, key)).replace(/=+$/, '');
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig } });
  const t = JSON.parse(r.getContentText()).access_token;
  if (!t) throw new Error('ขอ token Firestore ไม่ได้ (' + email + '): ' + r.getContentText().slice(0, 200));
  cache.put('fs_token', t, 3000);
  return t;
}
function fsReq_(method, url, body) {
  const o = { method: method, muteHttpExceptions: true, contentType: 'application/json',
              headers: { Authorization: 'Bearer ' + fsToken_() } };
  if (body) o.payload = JSON.stringify(body);
  const r = UrlFetchApp.fetch(url, o);
  let j = null; try { j = JSON.parse(r.getContentText()); } catch (x) {}
  return { code: r.getResponseCode(), j: j };
}
function toFs_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs_) } };
  if (typeof v === 'object') { const f = {}; Object.keys(v).forEach(k => f[k] = toFs_(v[k])); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
function fromFs_(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) { const o = {}; Object.keys(v.mapValue.fields || {}).forEach(k => o[k] = fromFs_(v.mapValue.fields[k])); return o; }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs_);
  return null;
}
function docOf_(d) {
  const f = {}; Object.keys(d.fields || {}).forEach(k => f[k] = fromFs_(d.fields[k]));
  return { name: d.name, id: d.name.split('/').pop(), updateTime: d.updateTime, data: f };
}
function fsGet_(path) {
  const r = fsReq_('get', FS_BASE() + '/' + path.split('/').map(encodeURIComponent).join('/'));
  return r.code === 200 ? docOf_(r.j) : null;
}
function fsQuery_(coll, eq, limit) {
  const f = Object.keys(eq).map(k => ({ fieldFilter: { field: { fieldPath: k }, op: 'EQUAL', value: toFs_(eq[k]) } }));
  const where = f.length === 1 ? f[0] : { compositeFilter: { op: 'AND', filters: f } };
  const r = fsReq_('post', FS_BASE() + ':runQuery', { structuredQuery: { from: [{ collectionId: coll }], where: where, limit: limit || 50 } });
  if (r.code !== 200) throw new Error('Firestore query ' + coll + ' HTTP ' + r.code);
  return (r.j || []).filter(x => x.document).map(x => docOf_(x.document));
}
/** เขียนเฉพาะฟิลด์ที่ส่ง (updateMask) · name = path สั้น หรือชื่อเต็ม projects/... · precond = updateTime ที่ต้องตรง */
function fsPatch_(name, data, mask, precond) {
  const fields = {}; Object.keys(data).forEach(k => fields[k] = toFs_(data[k]));
  const q = (mask || Object.keys(data)).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k));
  if (precond) q.push('currentDocument.updateTime=' + encodeURIComponent(precond));
  const url = (name.indexOf('projects/') === 0 ? 'https://firestore.googleapis.com/v1/' + name : FS_BASE() + '/' + name) + '?' + q.join('&');
  return fsReq_('patch', url, { fields: fields }).code === 200;
}
function today_() { return Utilities.formatDate(new Date(), CFG.tz, 'yyyy-MM-dd'); }
function nowText_() { return Utilities.formatDate(new Date(), CFG.tz, 'yyyy-MM-dd HH:mm:ss'); }
