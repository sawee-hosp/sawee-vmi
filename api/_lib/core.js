// Sawee Rxfill — โค้ดกลางของ Vercel functions (ไม่มี dependency): Google token, Firestore REST, LINE API, โควตา, ตรวจผู้ใช้
const crypto = require('crypto');

const env = (k) => String(process.env[k] || '').trim();
const SITE = () => env('SITE_URL') || 'https://sawee-vmi.vercel.app';
const FIREBASE_WEB_API_KEY = () => env('FIREBASE_WEB_API_KEY') || 'AIzaSyAnzXAEkH8Zz0Ur4lCQ00qa4UqYATTikAs'; // web key สาธารณะ (เดียวกับ shared.js)

// ---------- Google OAuth ----------
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
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v && v.__ts) return { timestampValue: v.__ts };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object') { const fields = {}; Object.entries(v).forEach(([k, x]) => { fields[k] = toFs(x); }); return { mapValue: { fields } }; }
  return { stringValue: String(v) };
}
function fromVal(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromVal);
  if ('mapValue' in v) return fromFields(v.mapValue.fields);
  return null;
}
const fromFields = (f) => { const o = {}; Object.entries(f || {}).forEach(([k, v]) => { o[k] = fromVal(v); }); return o; };
const authH = async () => ({ Authorization: 'Bearer ' + await googleToken(), 'Content-Type': 'application/json' });
async function fsGet(path) {
  const r = await fetch(`${fsBase()}/${path}`, { headers: await authH() });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Firestore GET ' + path + ' ' + r.status);
  return fromFields((await r.json()).fields);
}
async function fsSet(path, data, merge) {
  const keys = Object.keys(data);
  const mask = merge ? keys.map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&') : '';
  const fields = {}; keys.forEach(k => { fields[k] = toFs(data[k]); });
  const r = await fetch(`${fsBase()}/${path}${mask ? '?' + mask : ''}`, { method: 'PATCH', headers: await authH(), body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('Firestore PATCH ' + path + ' ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
const fsPatch = (path, data) => fsSet(path, data, true);
async function fsAdd(collection, data) {
  const fields = {}; Object.entries(data).forEach(([k, v]) => { fields[k] = toFs(v); });
  const r = await fetch(`${fsBase()}/${collection}`, { method: 'POST', headers: await authH(), body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('Firestore ADD ' + collection + ' ' + r.status);
}
async function fsDelete(path) { await fetch(`${fsBase()}/${path}`, { method: 'DELETE', headers: await authH() }); }
// where: [[field, op, value]] (op: EQUAL, GREATER_THAN, LESS_THAN_OR_EQUAL, NOT_EQUAL ...)
async function fsQuery(collection, where, opts) {
  opts = opts || {};
  const filters = (where || []).map(([f, op, v]) => ({ fieldFilter: { field: { fieldPath: f }, op, value: toFs(v) } }));
  const q = { from: [{ collectionId: collection }] };
  if (filters.length === 1) q.where = filters[0]; else if (filters.length > 1) q.where = { compositeFilter: { op: 'AND', filters } };
  if (opts.orderBy) q.orderBy = [{ field: { fieldPath: opts.orderBy }, direction: opts.desc ? 'DESCENDING' : 'ASCENDING' }];
  if (opts.limit) q.limit = opts.limit;
  const r = await fetch(`${fsBase()}:runQuery`, { method: 'POST', headers: await authH(), body: JSON.stringify({ structuredQuery: q }) });
  const rows = await r.json();
  if (!r.ok) throw new Error('Firestore QUERY ' + collection + ' ' + r.status + ' ' + JSON.stringify(rows).slice(0, 200));
  return (Array.isArray(rows) ? rows : []).filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), ...fromFields(x.document.fields) }));
}
const nowTs = () => ({ __ts: new Date().toISOString() });
const tsMs = (v) => v ? Date.parse(v) || 0 : 0;

// ---------- LINE ----------
async function lineApi(path, body, method) {
  const r = await fetch('https://api.line.me/v2/bot/' + path, {
    method: method || 'POST', headers: { Authorization: 'Bearer ' + env('LINE_CHANNEL_ACCESS_TOKEN'), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) return { __error: r.status + ' ' + (await r.text()).slice(0, 200) };
  return (r.headers.get('content-type') || '').includes('json') ? r.json() : {};
}
const reply = (token, text) => lineApi('message/reply', { replyToken: token, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] });

// ---------- โควตาข้อความ/เดือน ----------
const monthKey = () => { const d = new Date(Date.now() + 7 * 3600000); return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0'); };
async function quotaStatus() {
  const limit = Number(env('LINE_MONTHLY_LIMIT')) || 300;
  const meta = (await fsGet('line_meta/quota_' + monthKey())) || {};
  let lineUsed = null;
  try { const c = await lineApi('message/quota/consumption', null, 'GET'); if (c && typeof c.totalUsage === 'number') lineUsed = c.totalUsage; } catch (e) { /* ignore */ }
  const used = Math.max(Number(meta.sent) || 0, lineUsed || 0);
  const tier = used >= limit * 0.95 ? 'stop' : used >= limit * 0.8 ? 'admin_only' : 'normal';
  return { month: monthKey(), limit, used, sent_by_system: Number(meta.sent) || 0, line_reported: lineUsed, tier, remaining: Math.max(0, limit - used) };
}
// ส่ง push ทีละคน — audience: 'admin' | 'staff' | 'test' · คืน { ok, skipped }
async function pushText(lineUserId, text, info) {
  info = info || {};
  const q = info.quota || await quotaStatus();
  const isAdminMsg = info.audience === 'admin' || info.audience === 'test';
  if (q.used + 1 > q.limit || q.tier === 'stop' || (q.tier === 'admin_only' && !isAdminMsg)) {
    await logLine({ type: info.type, to_uid: info.uid, ok: false, skipped: 'quota_' + q.tier, preview: String(text).slice(0, 120) });
    return { ok: false, skipped: 'quota_' + q.tier };
  }
  const r = await lineApi('message/push', { to: lineUserId, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] });
  const ok = !(r && r.__error);
  if (ok) {
    q.used += 1;
    const cur = (await fsGet('line_meta/quota_' + monthKey())) || {};
    await fsSet('line_meta/quota_' + monthKey(), { month: monthKey(), sent: (Number(cur.sent) || 0) + 1, limit: q.limit, updated_at: nowTs() }, true);
  }
  await logLine({ type: info.type, to_uid: info.uid, to_name: info.name || '', ok, error: ok ? '' : r.__error, preview: String(text).slice(0, 160) });
  return { ok, error: ok ? '' : r.__error };
}
async function logLine(d) { try { await fsAdd('line_logs', { ...d, at: nowTs() }); } catch (e) { console.error('line log failed', e.message); } }

// ---------- ตรวจผู้เรียก (Firebase ID token) ----------
async function verifyUser(idToken) {
  if (!idToken) throw Object.assign(new Error('ต้อง login'), { status: 401 });
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_WEB_API_KEY(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
  const j = await r.json();
  const uid = j && j.users && j.users[0] && j.users[0].localId;
  if (!uid) throw Object.assign(new Error('token ไม่ถูกต้องหรือหมดอายุ'), { status: 401 });
  const profile = (await fsGet('users/' + uid)) || {};
  return { uid, ...profile, role: String(profile.role || '').toLowerCase() };
}
const isAdminRole = (r) => ['admin', 'administrator', 'แอดมิน'].includes(String(r || '').toLowerCase());

// ---------- ลิงก์ใบสรุปการจ่าย (เปิดได้โดยไม่ต้อง login ด้วยลายเซ็น HMAC) ----------
const sheetSecret = () => env('SHEET_SECRET') || env('LINE_CHANNEL_SECRET');
const sheetToken = (col, id) => crypto.createHmac('sha256', sheetSecret()).update(col + '/' + id).digest('hex').slice(0, 24);
const sheetUrl = (col, id) => `${SITE()}/api/dispense-sheet?c=${col === 'internal_requisitions' ? 'i' : 'r'}&id=${encodeURIComponent(id)}&t=${sheetToken(col, id)}`;

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = []; for await (const c of req) chunks.push(Buffer.from(c));
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) { return {}; }
}
const thb = (v) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

module.exports = { crypto, env, SITE, googleToken, fsGet, fsSet, fsPatch, fsAdd, fsDelete, fsQuery, nowTs, tsMs, lineApi, reply, quotaStatus, pushText, logLine,
  verifyUser, isAdminRole, sheetToken, sheetUrl, readJson, thb, monthKey };
