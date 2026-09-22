// ============================================================
// Sawee Rxfill — shared.js (v5.7.0)
// ไฟล์รวม: Firebase init, ค่าคงที่, utility functions
// ใช้ร่วมกันทุกหน้า — ห้ามมี JSX (ไม่ผ่าน Babel)
// ============================================================

// ─── Firebase Config & Init ───────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAnzXAEkH8Zz0Ur4lCQ00qa4UqYATTikAs",
  authDomain: "sawee-rxfill.firebaseapp.com",
  projectId: "sawee-rxfill",
  storageBucket: "sawee-rxfill.firebasestorage.app",
  messagingSenderId: "186506077335",
  appId: "1:186506077335:web:71c5f6f90bb26e767df5d2",
  measurementId: "G-XFL0L1L213"
};

const GAS_DRIVE_URL = "https://script.google.com/macros/s/AKfycbyEXNTj0se5egi1TrX_4Ew47HgfUNGc2fvjf00FpGtQYpi6toSZH-1QMnWLeQopJx-IPA/exec";

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
// บางเครือข่าย (พร็อกซีโรงพยาบาล / ส่วนขยายเบราว์เซอร์) ตัดการเชื่อมต่อแบบ WebChannel ของ Firestore
// ทำให้ Console ขึ้น 'Listen ... 404 / transport errored' เป็นระยะ บังคับใช้ long-polling แทนจึงเงียบและเสถียรกว่า
try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) { console.warn('firestore settings skipped', e); }
const auth = firebase.auth();

// ─── Constants ────────────────────────────────────────────
const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const DEFAULT_DRUG_TYPES = { '1': 'ยา', '3': 'สมุนไพร', '6': 'วัคซีน', '25': 'ยาสำหรับโรคเรื้อรัง (NCDs)', '32': 'เวชภัณฑ์ทางการแพทย์' };

const APP_SCHEMA_VERSION = 18;
const APP_VERSION = '5.7.0';
// Local INVS Bridge: รันผ่าน XAMPP บนเครื่อง Admin ที่เชื่อมฐาน INVS ได้
const INVS_BRIDGE_URL = 'http://127.0.0.1/SaweeRefill/invs_api.php';
const MAX_BATCH_WRITES = 400;

// FY2569 เป็นปีเปลี่ยนผ่านของระบบ: default เลขครั้งตามลำดับเดือนงบ (ต.ค.=1 ... ก.ย.=12)
// ตั้งแต่ FY2570 เป็นต้นไป เลขครั้ง run ตามใบเบิกที่เกิดขึ้นจริงของแต่ละ รพ.สต. และ reset เมื่อขึ้นปีงบใหม่
const RXFILL_TRANSITION_FISCAL_YEAR = 2569;

// ─── Vaccine Constants ────────────────────────────────────
const VACCINE_DISCLAIMER = 'ระบบวัคซีน เป็นแค่ฟอร์มตัวช่วยในการพิมพ์ และดูประวัติการเบิกย้อนหลังเท่านั้น สำหรับการเบิกยังใช้เอกสารปกติและติดต่อกับเจ้าหน้าที่วัคซีนประจำคลังยา คนเดิม';

// ตราครุฑ ดึงจาก PDF ต้นฉบับ ว.3/1 ฝังเป็น data URI จึงไม่ต้องพึ่งไฟล์ภายนอก
const GARUDA_DATA_URI = 'data:image/png;base64,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';

// โครงฟอร์ม 26 บรรทัด ตรงตาม ว.3/1 (ปี 2567)
const VACCINE_ROW_TEMPLATE = [
  { id:'v01', group_id:'g1', group_name:'เด็กแรกเกิด ถึง 5 ปี', no:'01', name:'1. BCG (10 doses)', drug_id:'17201', calc:{ factor:2, divisor:10, dose:10 } },
  { id:'v02', group_id:'g1', group_name:'เด็กแรกเกิด ถึง 5 ปี', no:'02', name:'2. HB (2 doses)', drug_id:'17301', calc:{ factor:1.11, divisor:2, dose:2 } },
  { id:'v03', group_id:'g1', group_name:'เด็กแรกเกิด ถึง 5 ปี', no:'03', name:'3.1 DTP-HB-Hib (10 doses)', drug_id:'17207', calc:{ factor:1.33, divisor:10, dose:10 } },
  { id:'v04', group_id:'g1', group_name:'เด็กแรกเกิด ถึง 5 ปี', no:'04', name:'3.2 DTP-HB-Hib (1 dose)', drug_id:'17207', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v05', group_id:'g1', group_name:'เด็กแรกเกิด ถึง 5 ปี', no:'05', name:'4. OPV (20 doses)', drug_id:'17205', calc:{ factor:1.33, divisor:20, dose:20 } },
  { id:'v06', group_id:'g1', group_name:'เด็กแรกเกิด ถึง 5 ปี', no:'06', name:'5. IPV (1 dose)', drug_id:'17208', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v07', group_id:'g1', group_name:'เด็กแรกเกิด ถึง 5 ปี', no:'07', name:'6. MMR  (1 dose)', drug_id:'17302', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v08', group_id:'g1', group_name:'เด็กแรกเกิด ถึง 5 ปี', no:'08', name:'7. DTP (10 doses)', drug_id:'17202', calc:{ factor:1.33, divisor:10, dose:10 } },
  { id:'v09', group_id:'g1', group_name:'เด็กแรกเกิด ถึง 5 ปี', no:'09', name:'8.1 LAJE (1 dose)', drug_id:'17209', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v10', group_id:'g1', group_name:'เด็กแรกเกิด ถึง 5 ปี', no:'10', name:'8.2 JE เชื้อตาย (1 dose)', drug_id:'17209', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v11', group_id:'g1', group_name:'เด็กแรกเกิด ถึง 5 ปี', no:'11', name:'9. Rota (1 dose)', drug_id:'17210', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v12', group_id:'g2', group_name:'นักเรียน ป.1 (เก็บตก ในรายที่ได้ ไม่ครบถ้วน)', no:'12', name:'10. MMR  (1 dose)', drug_id:'17302', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v13', group_id:'g2', group_name:'นักเรียน ป.1 (เก็บตก ในรายที่ได้ ไม่ครบถ้วน)', no:'13', name:'11. BCG (10 doses)', drug_id:'17201', calc:{ factor:1.11, divisor:10, dose:10 } },
  { id:'v14', group_id:'g2', group_name:'นักเรียน ป.1 (เก็บตก ในรายที่ได้ ไม่ครบถ้วน)', no:'14', name:'12. OPV (20 doses)', drug_id:'17205', calc:{ factor:1.11, divisor:20, dose:20 } },
  { id:'v15', group_id:'g2', group_name:'นักเรียน ป.1 (เก็บตก ในรายที่ได้ ไม่ครบถ้วน)', no:'15', name:'13. dT (10 doses)', drug_id:'17206', calc:{ factor:1.11, divisor:10, dose:10 } },
  { id:'v16', group_id:'g2', group_name:'นักเรียน ป.1 (เก็บตก ในรายที่ได้ ไม่ครบถ้วน)', no:'16', name:'14. HB (2 doses)', drug_id:'17301', calc:{ factor:1.11, divisor:2, dose:2 } },
  { id:'v17', group_id:'g2', group_name:'นักเรียน ป.1 (เก็บตก ในรายที่ได้ ไม่ครบถ้วน)', no:'17', name:'15. LAJE (1 dose)', drug_id:'17209', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v18', group_id:'g2', group_name:'นักเรียน ป.1 (เก็บตก ในรายที่ได้ ไม่ครบถ้วน)', no:'18', name:'16. IPV (1 dose)', drug_id:'17208', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v19', group_id:'g3', group_name:'นักเรียนหญิง ป.5', no:'19', name:'17. HPV (1 dose)', drug_id:'17212', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v20', group_id:'g4', group_name:'นักเรียน ป.6', no:'20', name:'18. dT (10 doses)', drug_id:'17206', calc:{ factor:1.11, divisor:10, dose:10 } },
  { id:'v21', group_id:'g5', group_name:'หญิงตั้งครรภ์', no:'21', name:'19. dT (10 doses)', drug_id:'17206', calc:{ factor:1.33, divisor:10, dose:10 } },
  { id:'v22', group_id:'g5', group_name:'หญิงตั้งครรภ์', no:'22', name:'20. Influenza (1 dose)', drug_id:'07407', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v23', group_id:'g5', group_name:'หญิงตั้งครรภ์', no:'23', name:'21. aP (1 dose)', drug_id:'17211', calc:{ factor:1.01, divisor:1, dose:1 } },
  { id:'v24', group_id:'g6', group_name:'คลินิก วัคซีนผู้ใหญ่', no:'24', name:'22. dT (10 doses)', drug_id:'17206', calc:{ factor:1.33, divisor:10, dose:10 } },
  { id:'v25', group_id:'g6', group_name:'คลินิก วัคซีนผู้ใหญ่', no:'25', name:'23. MR (นศ.ทางการแพทย์และสาธารณสุข) (10 doses)', drug_id:'17302', calc:{ factor:1.01, divisor:10, dose:10 } },
  { id:'v26', group_id:'g6', group_name:'คลินิก วัคซีนผู้ใหญ่', no:'26', name:'24. HB (บุคลากรทางการแพทย์และสาธารณสุข) (1 dose)', drug_id:'17301', calc:{ factor:1.01, divisor:1, dose:1 } }
];

const VACCINE_LABELS_DEFAULT = {
  formTitle: 'แบบฟอร์ม ว.3/1',
  formYear: '(ปี 2567)',
  docNoLabel: 'ที่',
  unitLabel: 'หน่วยบริการ',
  dateLabel: 'วันที่............เดือน.......................................พ.ศ........................',
  subjectLabel: 'เรื่อง',
  subjectText: 'ขอเบิกวัคซีนในงานสร้างเสริมภูมิคุ้มกันโรค',
  toLabel: 'เรียน',
  toText: 'ผู้อำนวยการโรงพยาบาลสวี',
  introText: 'ขอเบิกวัคซีนต่างๆ  ดังนี้',
  colGroup: 'กลุ่มเป้าหมาย',
  colVaccine: 'วัคซีน',
  colReqHead: 'ข้อมูลการเบิกวัคซีน เดือน',
  colPrevHead: 'ผลการให้วัคซีนเดือน',
  colPrevHeadTail: 'ที่ผ่านมา',
  colTarget: 'เป้าหมาย (คน)',
  colVialHead: 'จำนวนวัคซีน (ขวด)',
  colNeed: 'ที่ต้องการใช้',
  colCarry: 'ยอดคงเหลือยกมา',
  colRequest: 'ที่ขอเบิก',
  colServed: 'จำนวนผู้รับบริการ (คน)',
  colOpened: 'จำนวนวัคซีนที่เปิดใช้ (ขวด)',
  colWastage: 'อัตราสูญเสีย (ร้อยละ)',
  closing: 'ขอแสดงความนับถือ',
  signName: '',
  signPosition: '',
  positionLabel: 'ตำแหน่ง',
  note: 'หมายเหตุ หน่วยบริการประมาณการกลุ่มเป้าหมายในการเบิกวัคซีนตามชนิดและขนาดบรรจุของวัคซีนตามที่คลังวัคซีนโรงพยาบาลได้รับการจัดสรร'
};

// ─── Basic Helpers ────────────────────────────────────────
const toSafeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toNonNegativeNumber = (value, fallback = 0) => Math.max(0, toSafeNumber(value, fallback));
const toNonNegativeInt = (value, fallback = 0) => Math.max(0, Math.round(toSafeNumber(value, fallback)));
const safePackSize = (value) => Math.max(1, Math.round(toSafeNumber(value, 1)));
const safeText = (value, fallback = '') => String(value ?? fallback).trim();

// ─── Fiscal Year & Period ─────────────────────────────────
const getFiscalInfo = (month, year) => {
  var fiscalYear = month >= 10 ? year + 1 + 543 : year + 543;
  var term = month >= 10 ? month - 9 : month + 3;
  return { fiscalYear: fiscalYear, term: term };
};

const getYearMonthKey = (month, year) => {
  return year + '-' + String(month).padStart(2, '0');
};

// รอบเบิกที่ทำช่วงวันที่ 20-31 เป็นการเติมยาเพื่อใช้ในเดือนถัดไป
const getNextCalendarPeriod = (month, year) => {
  var m = Number(month) + 1;
  var y = Number(year);
  if (m > 12) { m = 1; y += 1; }
  return { month: m, year: y };
};

const getPreviousCalendarPeriod = (month, year) => {
  var m = Number(month) - 1;
  var y = Number(year);
  if (m < 1) { m = 12; y -= 1; }
  return { month: m, year: y };
};

// ─── Drug Sorting & Formatting ────────────────────────────
const sortDrugs = (a, b) => {
  const idA = String(a.drugId || a.drug_id || "");
  const idB = String(b.drugId || b.drug_id || "");
  const isDrugA = idA.length >= 5;
  const isDrugB = idB.length >= 5;
  if (isDrugA && !isDrugB) return -1;
  if (!isDrugA && isDrugB) return 1;
  return idA.localeCompare(idB);
};

const formatQty = (qty, packSize) => {
  const safeQty = Number(qty);
  const safePack = Math.max(1, Number(packSize) || 1);
  if (!Number.isFinite(safeQty) || safeQty <= 0) return '0';
  const p = Math.floor(safeQty / safePack);
  const r = safeQty % safePack;
  if (r === 0) return p.toString();
  if (p === 0) return '(' + r + ')';
  return p + '(' + r + ')';
};

const formatUnitPrice = (value) => toNonNegativeNumber(value).toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4
});

const formatAppDateTime = (value) => {
  if (!value) return '-';
  try {
    const d = typeof value?.toDate === 'function'
      ? value.toDate()
      : value?.seconds
        ? new Date(Number(value.seconds) * 1000)
        : new Date(value);
    if (!Number.isFinite(d.getTime())) return safeText(value, '-');
    return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch (e) { return safeText(value, '-'); }
};

// ─── Vaccine Utilities ────────────────────────────────────
// ใบที่บันทึกด้วยรุ่นก่อนเก็บชื่อฟอร์มรวมปีไว้ในช่องเดียว ต้องแยกออกไม่ให้พิมพ์ปีซ้ำสองครั้ง
const migrateVaccineLabels = (saved) => {
  const merged = Object.assign({}, VACCINE_LABELS_DEFAULT, saved || {});
  const m = String(merged.formTitle || '').match(/^(.*?)\s*(\(.*\))\s*$/);
  if (m) { merged.formTitle = m[1].trim(); merged.formYear = (saved && saved.formYear) ? saved.formYear : m[2]; }
  merged.unitLabel = String(merged.unitLabel || '').replace(/\s*\(\s*รพ\.สต\.\s*\/\s*ฝ่าย\s*\)\s*/g, '').trim() || 'หน่วยบริการ';
  return merged;
};

// 1 ใบต่อ รพ.สต. ต่อเดือน — บังคับด้วย document id ไม่ให้เกิดใบซ้ำ
const vaccineDocId = (hospitalId, month, year) =>
  'VAC-' + safeText(hospitalId) + '-' + year + '-' + String(month).padStart(2, '0');

const getVaccineTerm = (month, year) => getFiscalInfo(Number(month), Number(year)).term;

const buildVaccineRows = () => VACCINE_ROW_TEMPLATE.map(function (r) {
  return Object.assign({}, r, { calc: Object.assign({}, r.calc), target: '', carry: '', served: '', opened: '' });
});

const parseVaccineNum = (v) => {
  const cleaned = String(v ?? '').replace(/[^0-9.]/g, '');
  return cleaned === '' ? 0 : toNonNegativeNumber(cleaned);
};

const calcVaccineRow = (row) => {
  const c = row?.calc || { factor: 1, divisor: 1, dose: 1 };
  const target = parseVaccineNum(row?.target);
  const carry = parseVaccineNum(row?.carry);
  const served = parseVaccineNum(row?.served);
  const opened = parseVaccineNum(row?.opened);
  const need = target > 0 ? Math.ceil((target * c.factor) / Math.max(1, c.divisor)) : 0;
  const request = (carry - need) >= 0 ? 0 : (need - carry);
  const denom = opened * Math.max(1, c.dose);
  const hasWastage = opened > 0 && denom > 0;
  const wastage = hasWastage ? ((denom - served) / denom) * 100 : null;
  return {
    need: need, request: request, wastage: wastage,
    wastageText: wastage === null ? '' : wastage.toFixed(2)
  };
};

const computeVaccineSheet = (rows, drugs) => {
  const byId = new Map();
  (drugs || []).forEach(function (d) { byId.set(String(d.drug_id), d); });
  const totals = { target_people: 0, need_vials: 0, carry_vials: 0, requested_vials: 0, served_people: 0, opened_vials: 0, total_value: 0 };
  const out = (rows || []).map(function (r) {
    const calc = calcVaccineRow(r);
    const drug = byId.get(String(r.drug_id));
    const unit_price = drug ? toNonNegativeNumber(drug.price) : 0;
    const value = unit_price * calc.request;
    totals.target_people += parseVaccineNum(r.target);
    totals.need_vials += calc.need;
    totals.carry_vials += parseVaccineNum(r.carry);
    totals.requested_vials += calc.request;
    totals.served_people += parseVaccineNum(r.served);
    totals.opened_vials += parseVaccineNum(r.opened);
    totals.total_value += value;
    return Object.assign({}, r, calc, {
      matched: !!drug,
      drug_name: drug ? safeText(drug.drug_name) : '',
      unit_price: unit_price, value: value
    });
  });
  return { rows: out, totals: totals };
};

// ─── Role & Normalization ─────────────────────────────────
const normalizeUserRole = (value) => {
  const role = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (role === 'admin' || role === 'administrator') return 'admin';
  if (role === 'hospital' || role === 'รพ.สต.' || role === 'รพสต') return 'hospital';
  if (role === 'dept' || role === 'department' || role === 'หน่วยงาน') return 'dept';
  if (role === 'pharmacy' || role === 'ห้องยา') return 'pharmacy';
  return role;
};

// ─── Roles & page routing (v5.7) ─────────────────────────
// admin    = ห้องยา/ผู้ดูแลระบบ (อนุมัติทุกใบ)       → app.html
// hospital = รพ.สต. (เบิกตามยอดใช้จริง รบ.301)       → app.html
// dept     = หน่วยงานใน รพ. (คีย์เบิกตามต้องการ)     → internal.html
// pharmacy = ห้องยา (เบิกตามยอดใช้ HOSxP OPD+IPD)   → internal.html
const ROLE_LABELS = { admin: 'แอดมิน', hospital: 'รพ.สต.', dept: 'หน่วยงาน', pharmacy: 'ห้องยา' };
const INTERNAL_ROLES = ['dept', 'pharmacy'];
const isInternalRole = (role) => INTERNAL_ROLES.indexOf(normalizeUserRole(role)) >= 0;
const homePageForRole = (role) => isInternalRole(role) ? 'internal.html' : 'app.html';

const normalizeForMatch = (value) => String(value ?? '')
  .normalize('NFKC')
  .toLocaleLowerCase('th-TH')
  .replace(/\s+/g, '')
  .replace(/[\-_.()\/\\]+/g, '');

var fuzzyAutoCleanDone = false;

const cleanFuzzyAliases = (aliases, canonicalName) => {
  canonicalName = canonicalName || '';
  const out = [];
  const seen = new Set();
  const canonicalKey = normalizeForMatch(canonicalName);
  (Array.isArray(aliases) ? aliases : String(aliases || '').split(',')).forEach(function (raw) {
    const text = safeText(raw);
    if (!text) return;
    const key = normalizeForMatch(text);
    if (!key || key === canonicalKey || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
};

// ─── Drug Status ──────────────────────────────────────────
const getDrugStatusText = (drug) => safeText(
  drug?.status ?? drug?.Status ?? drug?.drug_status ?? drug?.drugStatus ?? drug?.use_status ?? drug?.active_status ?? drug?.['สถานะ'] ?? ''
);

const isDrugDiscontinued = (drug) => {
  if (!drug) return false;
  const raw = getDrugStatusText(drug).normalize('NFKC').trim().toLowerCase();
  const compact = raw.replace(/\s+/g, '');
  if (compact.includes('ยกเลิกการใช้') || compact.includes('ยกเลิกใช้') || compact === 'discontinued' || compact === 'inactive' || compact === 'cancelled' || compact === 'canceled') return true;
  const activeValue = drug?.is_active ?? drug?.active;
  if (activeValue === false || String(activeValue).trim().toLowerCase() === 'false' || String(activeValue).trim() === '0') return true;
  return false;
};

const normalizeDrugMasterStatus = (value) => {
  const raw = safeText(value).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
  if (raw.includes('ยกเลิกการใช้') || raw.includes('ยกเลิกใช้') || raw === 'discontinued' || raw === 'inactive' || raw === 'cancelled' || raw === 'canceled' || raw === 'false' || raw === '0') return 'ยกเลิกใช้';
  return 'Active';
};

// ─── Dispense & Pack Rules ────────────────────────────────
const getDispenseStep = (item) => {
  const pack = safePackSize(item?.packSize ?? item?.pack_size);
  const isUnpacked = !!(item?.isUnpacked ?? item?.unpacked);
  const explicit = toNonNegativeNumber(item?.dispenseStep ?? item?.dispense_step, 0);
  if (isUnpacked) return explicit > 0 ? explicit : 1;
  if (explicit > 0) return Math.max(pack, Math.ceil(explicit / pack) * pack);
  return pack;
};

const getUsageMultiplier = (drugOrItem) => {
  const explicit = toNonNegativeNumber(drugOrItem?.usageMultiplier ?? drugOrItem?.usage_multiplier, 1);
  return explicit > 0 ? explicit : 1;
};

const convertImportedUsage = (rawUsage, drugOrItem) => {
  return toNonNegativeNumber(rawUsage) * getUsageMultiplier(drugOrItem);
};

const getMaximumQty = (item) => {
  const raw = item?.maximumQty ?? item?.maximum_qty ?? item?.maximum ?? item?.max_qty;
  return toNonNegativeNumber(raw, 0);
};

const normalizeMaximumQty = (value, item) => {
  const raw = toNonNegativeNumber(value, 0);
  if (raw <= 0) return 0;
  const step = Math.max(1, getDispenseStep(item));
  const floored = Math.floor(raw / step) * step;
  return floored > 0 ? floored : step;
};

const applyMaximumQty = (qty, item) => {
  const safeQty = toNonNegativeNumber(qty);
  const maximum = getMaximumQty(item);
  return maximum > 0 ? Math.min(safeQty, maximum) : safeQty;
};

const roundDispenseQtyUncapped = (need, item) => {
  const safeNeed = toNonNegativeNumber(need);
  if (safeNeed <= 0) return 0;
  const step = Math.max(1, getDispenseStep(item));
  return Math.ceil(safeNeed / step) * step;
};

const roundDispenseQty = (need, item) => applyMaximumQty(roundDispenseQtyUncapped(need, item), item);

const isNonBillableInRequisition = (item) => item?.type === '6' || !!item?.isDiscontinued;

const normalizeDispenseQty = (qty, item) => {
  if (isNonBillableInRequisition(item)) return 0;
  const safeQty = toNonNegativeNumber(qty);
  if (safeQty <= 0) return 0;
  return roundDispenseQty(safeQty, item);
};

const isDispenseQtyLockedValid = (qty, item) => {
  const safeQty = toNonNegativeNumber(qty);
  if (safeQty === 0 || item?.isUnpacked) return true;
  const pack = safePackSize(item?.packSize ?? item?.pack_size);
  return Math.abs((safeQty / pack) - Math.round(safeQty / pack)) < 1e-9;
};

// ─── Requisition Item Lock ────────────────────────────────
const lockRequisitionItem = (rawItem) => {
  const item = Object.assign({}, rawItem);
  item.isDisabledForHospital = false;
  item.packSize = safePackSize(item.packSize ?? item.pack_size);
  item.isUnpacked = !!(item.isUnpacked ?? item.unpacked);
  item.dispenseStep = toNonNegativeNumber(item.dispenseStep ?? item.dispense_step, 0);
  item.maximumQty = getMaximumQty(item);
  item.prevExcess = toSafeNumber(item.prevExcess);
  item.usage = toNonNegativeNumber(item.usage);
  item.netNeed = toNonNegativeNumber(item.netNeed);
  item.targetVMI = toNonNegativeNumber(item.targetVMI);

  if (isNonBillableInRequisition(item)) {
    item.netNeed = 0;
    item.dispenseQty = 0;
    item.dispensePack = 0;
  } else {
    const beforeMaximum = toNonNegativeNumber(item.dispenseQty);
    item.dispenseQty = normalizeDispenseQty(beforeMaximum, item);
    if (item.maximumQty > 0 && beforeMaximum > item.dispenseQty + 0.000001) {
      item.maximumApplied = true;
      item.maximumBeforeQty = Math.max(toNonNegativeNumber(item.maximumBeforeQty), beforeMaximum);
    } else {
      item.maximumApplied = !!item.maximumApplied;
      item.maximumBeforeQty = toNonNegativeNumber(item.maximumBeforeQty);
    }
    item.dispensePack = item.dispenseQty > 0 ? Math.ceil(item.dispenseQty / item.packSize) : 0;
  }
  const reconciliationBase = item.actualStockTouched && item.actualStock !== null && item.actualStock !== undefined
    ? toNonNegativeNumber(item.actualStock)
    : (item.prevExcess - item.usage);
  item.systemStock = item.prevExcess - item.usage;
  item.newExcess = reconciliationBase + item.dispenseQty;
  return item;
};

// ─── Requisition Value Analytics ──────────────────────────
const getRequisitionItemValue = (item) => {
  if (isNonBillableInRequisition(item)) return 0;
  return (toNonNegativeNumber(item?.dispenseQty) / safePackSize(item?.packSize)) * toNonNegativeNumber(item?.price);
};

const getRb301UsageQty = (item) => {
  const stored = item?.importedUsageQty ?? item?.rb301UsageQty ?? item?.rb301_usage_qty;
  if (stored !== null && stored !== undefined && stored !== '' && Number.isFinite(Number(stored))) {
    const storedQty = toNonNegativeNumber(stored);
    if (storedQty > 0 || toNonNegativeNumber(item?.usage) <= 0) return storedQty;
  }
  return toNonNegativeNumber(item?.usage);
};

const getUsageItemValue = (item) => {
  if (isNonBillableInRequisition(item)) return 0;
  const baseValue = (getRb301UsageQty(item) / safePackSize(item?.packSize ?? item?.pack_size)) * toNonNegativeNumber(item?.price);
  const corrections = Array.isArray(item?.analyticsCorrections) ? item.analyticsCorrections : [];
  const delta = corrections.reduce(function (sum, c) { return sum + toSafeNumber(c?.deltaValue); }, 0);
  return Math.max(0, baseValue + delta);
};

const getSystemSuggestedQty = (item) => {
  if (isNonBillableInRequisition(item)) return 0;
  const stored = item?.systemSuggestedQty ?? item?.system_suggested_qty;
  if (stored !== null && stored !== undefined && stored !== '' && Number.isFinite(Number(stored))) {
    return toNonNegativeNumber(stored);
  }
  return roundDispenseQty(toNonNegativeNumber(item?.netNeed), item);
};

const getExtraDispenseQty = (item) => {
  if (isNonBillableInRequisition(item)) return 0;
  const stored = item?.approvedExtraQty ?? item?.approved_extra_qty;
  if (stored !== null && stored !== undefined && stored !== '' && Number.isFinite(Number(stored))) {
    return toNonNegativeNumber(stored);
  }
  const finalQty = toNonNegativeNumber(item?.dispenseQty ?? item?.finalRequestedQty);
  return Math.max(0, finalQty - getSystemSuggestedQty(item));
};

const getExtraDispenseValue = (item) => {
  if (isNonBillableInRequisition(item)) return 0;
  return (getExtraDispenseQty(item) / safePackSize(item?.packSize ?? item?.pack_size)) * toNonNegativeNumber(item?.price);
};

const getActualStockExtraQty = (item) => {
  if (isNonBillableInRequisition(item) || !item?.actualStockTouched) return 0;
  const baseline = getSystemSuggestedQty(item);
  const actualSuggested = toNonNegativeNumber(item?.currentSuggestedQty ?? item?.finalRequestedQty ?? item?.dispenseQty);
  const finalQty = toNonNegativeNumber(item?.dispenseQty ?? item?.finalRequestedQty);
  const attributableFinal = Math.min(finalQty, actualSuggested);
  return Math.max(0, attributableFinal - baseline);
};

const getActualStockExtraValue = (item) => {
  if (isNonBillableInRequisition(item)) return 0;
  return (getActualStockExtraQty(item) / safePackSize(item?.packSize ?? item?.pack_size)) * toNonNegativeNumber(item?.price);
};

const getAnalyticsSource = (item) => {
  if (item?.manualAdded) return 'manual_add';
  return safeText(item?.usageSource || item?.usage_source || (toNonNegativeNumber(item?.usage) > 0 ? 'legacy' : 'none'));
};

// ─── Fiscal Term Logic ────────────────────────────────────
const getStoredFiscalTerm = (req) => {
  const raw = req?.fiscal_term ?? req?.requisition_term ?? req?.term;
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const getReqFiscalYear = (req) => {
  const stored = Math.round(Number(req?.fiscal_year));
  if (Number.isFinite(stored) && stored > 0) return stored;
  if (!req) return 0;
  return getFiscalInfo(Number(req.month), Number(req.year)).fiscalYear;
};

const getEffectiveFiscalTerm = (req, requisitions) => {
  requisitions = requisitions || [];
  if (!req) return 1;
  const stored = getStoredFiscalTerm(req);
  if (stored > 0) return stored;
  const info = getFiscalInfo(Number(req.month), Number(req.year));
  if (info.fiscalYear <= RXFILL_TRANSITION_FISCAL_YEAR) return info.term;
  const sameFY = (requisitions).filter(function (r) {
    return r && !String(r.id || '').startsWith('HIST-') &&
      String(r.hospitalId) === String(req.hospitalId) &&
      getReqFiscalYear(r) === info.fiscalYear;
  }).sort(function (a, b) { return (Number(a.year) * 100 + Number(a.month)) - (Number(b.year) * 100 + Number(b.month)); });
  const idx = sameFY.findIndex(function (r) { return String(r.id) === String(req.id); });
  return idx >= 0 ? idx + 1 : info.term;
};

const getNextFiscalTerm = (hospitalId, month, year, requisitions) => {
  requisitions = requisitions || [];
  const info = getFiscalInfo(Number(month), Number(year));
  if (info.fiscalYear <= RXFILL_TRANSITION_FISCAL_YEAR) return info.term;
  const sameFY = (requisitions).filter(function (r) {
    return r && !String(r.id || '').startsWith('HIST-') &&
      String(r.hospitalId) === String(hospitalId) &&
      getReqFiscalYear(r) === info.fiscalYear;
  });
  const storedTerms = sameFY.map(getStoredFiscalTerm).filter(function (n) { return n > 0; });
  if (storedTerms.length) return Math.max.apply(null, storedTerms) + 1;
  return sameFY.length + 1;
};

const formatRequisitionNo = (term, fiscalYear) => Math.max(1, toNonNegativeInt(term, 1)) + '/' + fiscalYear;

// ─── VMI CORE (แหล่งความจริงเดียว) ──────────────────────
const calcUsageStats = (usages) => {
  const active = (Array.isArray(usages) ? usages : []).map(function (u) { return toNonNegativeNumber(u); }).filter(function (u) { return u > 0; });
  const count = active.length || 1;
  const mean = active.reduce(function (a, b) { return a + b; }, 0) / count;
  const variance = active.reduce(function (acc, val) { return acc + Math.pow(val - mean, 2); }, 0) / (count === 1 ? 1 : count - 1);
  const sd = Math.sqrt(variance || 0);
  return { activeCount: active.length, mean: mean, sd: sd, sdz: sd * 1.645, adu: mean / 30, targetVMI: Math.ceil(mean + (1.645 * sd)) };
};

const calcTargetVMI = (usages) => calcUsageStats(usages).targetVMI;

const getRecent5 = (item) => (Array.isArray(item?.pastHistory) ? item.pastHistory.slice(0, 5) : [0, 0, 0, 0, 0]);

const recalcVmiItem = (rawItem, options, masterDrug) => {
  options = options || {};
  masterDrug = masterDrug || null;
  const item = Object.assign({}, rawItem);
  item.maximumQty = getMaximumQty(masterDrug || item);
  const usage = options.usage !== undefined ? toNonNegativeNumber(options.usage) : toNonNegativeNumber(item.usage);
  const targetVMI = calcTargetVMI([].concat(getRecent5(item), [usage]));
  const systemStock = toSafeNumber(item.prevExcess) - usage;
  const actualTouched = options.actualStockTouched !== undefined ? !!options.actualStockTouched : !!item.actualStockTouched;
  const actualStock = actualTouched
    ? toNonNegativeNumber(options.actualStock !== undefined ? options.actualStock : item.actualStock)
    : null;
  const effectiveStock = actualTouched ? actualStock : systemStock;
  const systemNetNeed = Math.max(0, targetVMI - systemStock);
  const actualNetNeed = Math.max(0, targetVMI - effectiveStock);
  const nonBillable = isNonBillableInRequisition(item);
  const systemSuggestedBeforeMaximum = nonBillable ? 0 : roundDispenseQtyUncapped(systemNetNeed, item);
  const actualSuggestedBeforeMaximum = nonBillable ? 0 : roundDispenseQtyUncapped(actualNetNeed, item);
  const systemSuggestedQty = nonBillable ? 0 : applyMaximumQty(systemSuggestedBeforeMaximum, item);
  const actualSuggestedQty = nonBillable ? 0 : applyMaximumQty(actualSuggestedBeforeMaximum, item);
  const manualOverride = options.manualQtyOverride !== undefined ? !!options.manualQtyOverride : !!item.manualQtyOverride;
  const requestedRaw = options.finalRequestedQty !== undefined ? options.finalRequestedQty : (item.finalRequestedQty ?? item.dispenseQty);
  const beforeMaximum = nonBillable ? 0 : (manualOverride ? toNonNegativeNumber(requestedRaw) : actualSuggestedBeforeMaximum);
  const normalizedFinal = nonBillable ? 0 : (manualOverride ? applyMaximumQty(toNonNegativeNumber(requestedRaw), item) : actualSuggestedQty);
  const maximumApplied = item.maximumQty > 0 && beforeMaximum > normalizedFinal + 0.000001;
  const delta = normalizedFinal - systemSuggestedQty;
  return Object.assign({}, item, {
    usage: usage,
    targetVMI: targetVMI,
    systemStock: systemStock,
    actualStock: actualStock,
    actualStockTouched: actualTouched,
    effectiveStock: effectiveStock,
    netNeed: actualNetNeed,
    systemSuggestedQty: systemSuggestedQty,
    systemSuggestedBeforeMaximum: systemSuggestedBeforeMaximum,
    currentSuggestedQty: actualSuggestedQty,
    currentSuggestedBeforeMaximum: actualSuggestedBeforeMaximum,
    finalRequestedQty: normalizedFinal,
    dispenseQty: normalizedFinal,
    dispensePack: normalizedFinal > 0 ? Math.ceil(normalizedFinal / safePackSize(item.packSize)) : 0,
    newExcess: effectiveStock + normalizedFinal,
    requestMore: Math.max(0, delta),
    requestLess: Math.max(0, -delta),
    maximumApplied: maximumApplied,
    maximumBeforeQty: maximumApplied ? beforeMaximum : 0,
    isAdjusted: Math.abs(delta) > 0.000001 || actualTouched || manualOverride || maximumApplied,
    manualQtyOverride: manualOverride
  });
};

// ─── Drug Snapshot & History ──────────────────────────────
const drugSnapshot = (drug, fallback) => {
  fallback = fallback || {};
  return {
    packSize: drug ? safePackSize(drug.pack_size) : safePackSize(fallback.packSize),
    isUnpacked: drug ? !!drug.unpacked : !!fallback.isUnpacked,
    type: safeText(drug?.type ?? fallback.type, '1') || '1',
    price: toNonNegativeNumber(drug?.price ?? fallback.price),
    dispenseStep: toNonNegativeNumber(drug?.dispense_step ?? fallback.dispenseStep ?? fallback.dispense_step, 0),
    usageMultiplier: getUsageMultiplier(drug || fallback),
    maximumQty: getMaximumQty(drug || fallback),
    isDisabledForHospital: false,
    isDiscontinued: drug ? isDrugDiscontinued(drug) : !!fallback.isDiscontinued,
    drugStatus: drug ? getDrugStatusText(drug) : safeText(fallback.drugStatus)
  };
};

const buildPastHistory = (findHist, hospitalId, drugId, month, year, n) => {
  n = n || 5;
  const hist = findHist(hospitalId, drugId);
  const values = [];
  for (var i = 1; i <= n; i++) {
    var m = Number(month) - i;
    var y = Number(year);
    if (m <= 0) { m += 12; y -= 1; }
    values.push(toNonNegativeNumber(hist?.history?.[getYearMonthKey(m, y)]));
  }
  return values;
};

// ─── Requisition Permissions ──────────────────────────────
const getReqPermissions = (req, user, opts) => {
  opts = opts || {};
  const role = normalizeUserRole(user?.role);
  const isAdmin = role === 'admin';
  const isHospital = role === 'hospital';
  const status = safeText(req?.status);
  const isPending = ['Draft', 'Pending'].includes(status);
  const isApprovalFailed = status === 'ApprovalFailed';
  const ownsReq = isHospital && String(req?.hospitalId) === String(user?.hospital_id);
  const invsSent = String(req?.invs_status || '').toUpperCase() === 'SENT' || !!req?.invs_sub_po_no;
  const isPrinted = !!req?.is_printed || !!opts.printedOverride;
  const adminEditableStatus = ['Draft', 'Pending', 'Rejected', 'ApprovalFailed'].includes(status);
  return {
    isAdmin: isAdmin, isHospital: isHospital, ownsReq: ownsReq, isPending: isPending, isApprovalFailed: isApprovalFailed,
    invsSent: invsSent, isPrinted: isPrinted, adminEditableStatus: adminEditableStatus,
    isApprovingStatus: status === 'Approving',
    adminHistoricalRematchOnly: isAdmin && !adminEditableStatus && status === 'Completed',
    canAdminRematch: isAdmin && status !== 'Approving' && (!invsSent || status === 'Completed'),
    canEdit: !invsSent && (isAdmin ? adminEditableStatus : (isPending && ownsReq && !isPrinted)),
    canDeleteReq: !invsSent && (isAdmin ? adminEditableStatus : (ownsReq && ['Draft', 'Pending', 'Rejected'].includes(status))),
    canApproveReq: isAdmin && (isPending || isApprovalFailed),
    canSendInvs: isAdmin && isPending && !invsSent
  };
};

// ─── INVS Bridge ──────────────────────────────────────────
const callInvsBridge = async (action, requisitionId, extra) => {
  if (!auth.currentUser) throw new Error('กรุณา Login ใหม่ก่อนเชื่อม INVS');
  const idToken = await auth.currentUser.getIdToken(true);
  var response;
  try {
    response = await fetch(INVS_BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
      body: JSON.stringify(Object.assign({}, extra || {}, { action: action, requisition_id: requisitionId, firebase_id_token: idToken }))
    });
  } catch (networkErr) {
    var e = new Error('ติดต่อ INVS Bridge ไม่ได้ กรุณาเปิด XAMPP Apache และตรวจ http://127.0.0.1/SaweeRefill/invs_api.php?action=health');
    e.cause = networkErr;
    throw e;
  }
  var data = null;
  try { data = await response.json(); } catch (ex) { /* ignore */ }
  if (!response.ok || !data?.ok) {
    var message = data?.message || ('INVS Bridge HTTP ' + response.status);
    if (data?.auth_debug && !String(message).includes('role=')) {
      var d = data.auth_debug;
      message += ' [Bridge role=' + (d.role_normalized || '-') + ', active=' + d.active_effective + ', project=' + (d.project_id || '-') + ']';
    }
    var err = new Error(message);
    err.payload = data;
    err.httpStatus = response.status;
    throw err;
  }
  return data;
};

// ─── Batch & Audit ────────────────────────────────────────
const executeBatchChunks = async (operations) => {
  for (var i = 0; i < operations.length; i += MAX_BATCH_WRITES) {
    const batch = db.batch();
    operations.slice(i, i + MAX_BATCH_WRITES).forEach(function (op) {
      if (op.type === 'set') batch.set(op.ref, op.data, op.options || { merge: true });
      else if (op.type === 'update') batch.update(op.ref, op.data);
      else if (op.type === 'delete') batch.delete(op.ref);
      else throw new Error('Unknown batch operation: ' + op.type);
    });
    await batch.commit();
  }
};

const buildAuditPayload = (actor, action, targetType, targetId, details) => ({
  action: action,
  target_type: targetType,
  target_id: String(targetId || ''),
  actor_uid: actor?.uid || auth.currentUser?.uid || '',
  actor_name: actor?.name || auth.currentUser?.email || 'Unknown',
  actor_role: actor?.role || '',
  actor_hospital_id: actor?.hospital_id || '',
  details: JSON.parse(JSON.stringify(details || {})),
  schema_version: APP_SCHEMA_VERSION,
  created_at: firebase.firestore.FieldValue.serverTimestamp()
});

const addAuditToBatch = (batch, actor, action, targetType, targetId, details) => {
  const ref = db.collection('audit_logs').doc();
  batch.set(ref, buildAuditPayload(actor, action, targetType, targetId, details || {}));
  return ref;
};

const writeAuditLog = async (actor, action, targetType, targetId, details) => {
  try {
    await db.collection('audit_logs').add(buildAuditPayload(actor, action, targetType, targetId, details || {}));
  } catch (err) {
    console.warn('Audit log failed:', err);
  }
};

// ─── File Parsing & Misc ─────────────────────────────────
const parseTabularFile = (file, onRows, onError, options) => {
  options = options || {};
  const useHeader = !!options.header;
  const name = safeText(file?.name).toLowerCase();
  const fail = function (e) { if (onError) onError(e); else console.error(e); };
  if (!file) return fail(new Error('ไม่พบไฟล์'));
  const deliver = function (rows) { try { onRows(rows); } catch (e) { fail(e); } };
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        deliver(XLSX.utils.sheet_to_json(ws, useHeader ? { defval: '' } : { header: 1 }));
      } catch (e) { fail(e); }
    };
    reader.onerror = function () { fail(new Error('อ่านไฟล์ไม่สำเร็จ')); };
    reader.readAsBinaryString(file);
    return;
  }
  if (!name.endsWith('.csv')) return fail(new Error('รองรับเฉพาะไฟล์ .csv, .xls, .xlsx'));
  Papa.parse(file, {
    header: useHeader,
    skipEmptyLines: true,
    complete: function (results) { deliver(results.data); },
    error: fail
  });
};

const runBusy = async (setBusy, showToast, task, errPrefix) => {
  errPrefix = errPrefix || '';
  setBusy(true);
  try { return await task(); }
  catch (e) { showToast((errPrefix ? errPrefix + ': ' : '') + (e?.message || e), 'error'); return undefined; }
  finally { setBusy(false); }
};

const fileToBase64 = (file) => new Promise(function (resolve, reject) {
  const reader = new FileReader();
  reader.onerror = function () { reject(new Error('ไม่สามารถอ่านไฟล์ที่แนบได้')); };
  reader.onload = function () {
    const result = String(reader.result || '');
    const comma = result.indexOf(',');
    resolve(comma >= 0 ? result.slice(comma + 1) : result);
  };
  reader.readAsDataURL(file);
});

const fetchWithTimeout = async (url, options, timeoutMs) => {
  timeoutMs = timeoutMs || 30000;
  options = options || {};
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
};

const buildRequisitionId = (hospitalId, month, year) => {
  const hosp = String(hospitalId || 'UNKNOWN').replace(/[^A-Za-z0-9_-]/g, '_');
  return 'REQ-' + year + '-' + String(month).padStart(2, '0') + '-' + hosp;
};

const buildTrackingId = (prefix, refId) => {
  const d = new Date();
  const ymd = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return prefix + '-' + ymd + '-' + String(refId || '').slice(0, 8).toUpperCase();
};

const makeActionToken = () => {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return Date.now() + '-' + Math.random().toString(36).slice(2, 12);
};

// ─── End shared.js ────────────────────────────────────────

// ─── Internal requisitions (หน่วยงาน / ห้องยา) v5.7 ──────
const INTERNAL_KIND_LABELS = { dept: 'หน่วยงาน', pharmacy: 'ห้องยา' };
const INTERNAL_STATUS_LABELS = {
  Pending: 'รอตรวจสอบ', Approving: 'กำลังอนุมัติ', Completed: 'อนุมัติแล้ว',
  Rejected: 'ส่งกลับแก้ไข', Cancelled: 'ยกเลิก', ApprovalFailed: 'อนุมัติไม่สำเร็จ'
};
const INTERNAL_DEFAULT_COVER_DAYS = 30;
const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const INTERNAL_STOCK_CHUNK = 400;

const pad2 = (n) => String(n).padStart(2, '0');
const toYmd = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const parseYmd = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const addDaysYmd = (s, n) => { const d = parseYmd(s); if (!d) return ''; d.setDate(d.getDate() + n); return toYmd(d); };
const daysBetweenInclusive = (from, to) => {
  const a = parseYmd(from), b = parseYmd(to);
  if (!a || !b || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
};
const formatThaiDate = (ymd) => {
  const d = parseYmd(ymd); if (!d) return '-';
  return d.getDate() + ' ' + THAI_MONTHS_SHORT[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(2);
};

// ตัวคูณแปลงหน่วย HOSxP → หน่วย INVS (หน่วยย่อยที่ใช้ใน dispenseQty) ค่าเริ่มต้น 1
const getHosxpMultiplier = (drug) => {
  const v = toNonNegativeNumber(drug?.hosxp_multiplier ?? drug?.hosxpMultiplier, 1);
  return v > 0 ? v : 1;
};
// แผนที่ HOSxP icode → INVS drug (รองรับ hosxp_code หลายค่าคั่นด้วย , หรือ ;)
const buildHosxpIndex = (drugs) => {
  const m = new Map();
  (drugs || []).forEach(function (d) {
    String(d?.hosxp_code || '').split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean)
      .forEach(function (code) { if (!m.has(code)) m.set(code, d); });
  });
  return m;
};

// ปริมาณที่แนะนำให้เบิก (ห้องยา)
//   dailyAvg = usage / days,  target = dailyAvg × coverDays
//   need     = target − onHand − inTransit  → ปัดขึ้นตามรอบจ่าย/แพ็ค, ไม่เกิน Maximum
const calcPharmacySuggestion = (p) => {
  const days = Math.max(1, toNonNegativeNumber(p.days, 1));
  const usage = toNonNegativeNumber(p.usage);
  const cover = Math.max(1, toNonNegativeNumber(p.coverDays, INTERNAL_DEFAULT_COVER_DAYS));
  const dailyAvg = usage / days;
  const target = Math.ceil(dailyAvg * cover - 0.000001);
  const need = Math.max(0, target - toNonNegativeNumber(p.onHand) - toNonNegativeNumber(p.inTransit));
  const item = p.item || {};
  const suggested = need > 0 ? roundDispenseQty(need, item) : 0;
  return { dailyAvg: dailyAvg, target: target, need: need, suggested: suggested };
};

const buildInternalReqId = (deptId) => {
  const d = new Date();
  const stamp = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  const safe = String(deptId || 'X').replace(/[^A-Za-z0-9_-]/g, '_');
  return 'IR-' + safe + '-' + stamp + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
};
const internalStockDocId = (deptId, drugId) =>
  String(deptId || '').replace(/[^A-Za-z0-9_-]/g, '_') + '__' + String(drugId || '').replace(/[^A-Za-z0-9_-]/g, '_');
const tsToMillis = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};
const internalItemValue = (it) => (toNonNegativeNumber(it?.dispenseQty) / safePackSize(it?.packSize)) * toNonNegativeNumber(it?.price);

