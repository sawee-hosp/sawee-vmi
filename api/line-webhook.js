// Sawee Rxfill — LINE OA webhook (Vercel Serverless, Node, ไม่มี dependency)
// env: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, LINE_BOT_ID, FIREBASE_SERVICE_ACCOUNT (JSON ทั้งไฟล์)
// หน้าที่: ผูกบัญชีผู้ใช้กับ LINE ด้วยรหัส 6 หลัก (line_link_codes/{code}) → users/{uid}.line_user_id
//          GET ?info=1 → { botId, addFriendUrl } ให้หน้าเว็บสร้าง QR
const crypto = require('crypto');

const env = (k) => String(process.env[k] || '').trim();
const LINK_TTL_MS = 10 * 60 * 1000;

// ---------- Google OAuth (service account → access token) ----------
let tokenCache = { token: '', exp: 0 };
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function serviceAccount() {
  const raw = env('FIREBASE_SERVICE_ACCOUNT');
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  const sa = JSON.parse(raw);
  sa.private_key = String(sa.private_key || '').replace(/\\n/g, '\n');
  return sa;
}
async function googleToken() {
  if (tokenCache.token && tokenCache.exp > Date.now() + 60000) return tokenCache.token;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig })
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('Google token failed: ' + JSON.stringify(j).slice(0, 200));
  tokenCache = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return tokenCache.token;
}

// ---------- Firestore REST ----------
const fsBase = () => `https://firestore.googleapis.com/v1/projects/${serviceAccount().project_id}/databases/(default)/documents`;
const toFs = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { doubleValue: v }
  : (v && v.__ts) ? { timestampValue: v.__ts } : { stringValue: String(v) };
const fromFs = (f) => { const o = {}; Object.entries(f || {}).forEach(([k, v]) => { o[k] = v.stringValue ?? v.timestampValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? null; }); return o; };
async function fsGet(path) {
  const r = await fetch(`${fsBase()}/${path}`, { headers: { Authorization: 'Bearer ' + await googleToken() } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Firestore GET ' + path + ' ' + r.status);
  return fromFs((await r.json()).fields);
}
async function fsPatch(path, data) {
  const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const fields = {}; Object.entries(data).forEach(([k, v]) => { fields[k] = toFs(v); });
  const r = await fetch(`${fsBase()}/${path}?${mask}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + await googleToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('Firestore PATCH ' + path + ' ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
async function fsDelete(path) {
  await fetch(`${fsBase()}/${path}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + await googleToken() } });
}
async function fsFindUsersByLine(lineUserId) {
  const r = await fetch(`${fsBase()}:runQuery`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + await googleToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'line_user_id' }, op: 'EQUAL', value: { stringValue: lineUserId } } }, limit: 10 } })
  });
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), ...fromFs(x.document.fields) }));
}
const nowTs = () => ({ __ts: new Date().toISOString() });

// ---------- LINE ----------
async function lineApi(path, body, method) {
  const r = await fetch('https://api.line.me/v2/bot/' + path, {
    method: method || 'POST', headers: { Authorization: 'Bearer ' + env('LINE_CHANNEL_ACCESS_TOKEN'), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return r.ok ? (r.headers.get('content-type') || '').includes('json') ? r.json() : {} : null;
}
const reply = (token, text) => lineApi('message/reply', { replyToken: token, messages: [{ type: 'text', text }] });
const HELP = 'สวัสดีครับ นี่คือระบบแจ้งเตือน Sawee Rxfill\nผูกบัญชี: เข้าเว็บ Sawee Rxfill → เมนู "แก้ไขข้อมูลส่วนตัว" → "เชื่อม LINE" แล้วพิมพ์รหัส 6 หลักที่ได้ส่งมาในแชตนี้';

async function handleEvent(ev) {
  const lineUserId = ev?.source?.userId || '';
  if (!lineUserId) return;
  if (ev.type === 'follow') return reply(ev.replyToken, HELP);
  if (ev.type === 'unfollow') {
    const users = await fsFindUsersByLine(lineUserId);
    for (const u of users) await fsPatch('users/' + u.id, { line_user_id: '', line_unlinked_at: nowTs(), line_unlink_reason: 'unfollow', updated_at: nowTs() });
    return;
  }
  if (ev.type !== 'message' || ev.message?.type !== 'text') return;
  const text = String(ev.message.text || '').trim();
  const m = text.match(/^\D*(\d{6})\D*$/);
  if (!m) return reply(ev.replyToken, HELP);
  const code = m[1];
  const link = await fsGet('line_link_codes/' + code);
  if (!link || !link.uid) return reply(ev.replyToken, 'ไม่พบรหัสนี้ หรือรหัสหมดอายุแล้ว กรุณากดสร้างรหัสใหม่ในหน้าเว็บ');
  if (link.expires_at && Date.parse(link.expires_at) < Date.now()) { await fsDelete('line_link_codes/' + code); return reply(ev.replyToken, 'รหัสหมดอายุแล้ว (ใช้ได้ 10 นาที) กรุณากดสร้างรหัสใหม่ในหน้าเว็บ'); }
  let displayName = '';
  try { const p = await lineApi('profile/' + encodeURIComponent(lineUserId), null, 'GET'); displayName = (p && p.displayName) || ''; } catch (e) { /* ignore */ }
  // บัญชี LINE นี้ผูกกับผู้ใช้อื่นอยู่ → ย้ายมาผูกกับผู้ใช้ใหม่ (1 LINE = 1 ผู้ใช้)
  for (const u of await fsFindUsersByLine(lineUserId)) if (u.id !== link.uid) await fsPatch('users/' + u.id, { line_user_id: '', line_unlinked_at: nowTs(), line_unlink_reason: 'relinked', updated_at: nowTs() });
  await fsPatch('users/' + link.uid, { line_user_id: lineUserId, line_display_name: displayName, line_linked_at: nowTs(), updated_at: nowTs() });
  await fsDelete('line_link_codes/' + code);
  const user = await fsGet('users/' + link.uid);
  return reply(ev.replyToken, `ผูกบัญชีสำเร็จ ✅\n${user?.name || ''}${user?.role === 'admin' ? ' (แอดมิน)' : ''}\nต่อไประบบจะแจ้งเตือนผ่าน LINE นี้ (ใบเบิก / ยาใกล้หมดอายุ)\nยกเลิกได้ที่หน้า "แก้ไขข้อมูลส่วนตัว" ในเว็บ`);
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const botId = env('LINE_BOT_ID');
      const id = botId.startsWith('@') ? botId : (botId ? '@' + botId : '');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).json({ ok: true, botId: id, addFriendUrl: id ? 'https://line.me/R/ti/p/' + encodeURIComponent(id) : '', linkTtlMinutes: LINK_TTL_MS / 60000 });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    const raw = await readRaw(req);
    const expected = crypto.createHmac('sha256', env('LINE_CHANNEL_SECRET')).update(raw).digest('base64');
    const got = String(req.headers['x-line-signature'] || '');
    if (!got || got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return res.status(401).json({ ok: false, error: 'bad signature' });
    const body = JSON.parse(raw.toString('utf8') || '{}');
    for (const ev of body.events || []) {
      try { await handleEvent(ev); } catch (e) { console.error('[line-webhook] event failed', e); }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[line-webhook]', e);
    return res.status(200).json({ ok: false }); // ตอบ 200 เพื่อไม่ให้ LINE ส่งซ้ำรัว ๆ
  }
};
