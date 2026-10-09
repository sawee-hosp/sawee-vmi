// ============================================================
// Sawee Rxfill — shared.js (v6.5.1)
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
const APP_VERSION = '6.6.1';
// Local INVS Bridge: รันผ่าน XAMPP บนเครื่อง Admin ที่เชื่อมฐาน INVS ได้
const INVS_BRIDGE_URL = 'http://127.0.0.1/SaweeRefill/invs_api.php';
const MAX_BATCH_WRITES = 400;

// FY2569 เป็นปีเปลี่ยนผ่านของระบบ: default เลขครั้งตามลำดับเดือนงบ (ต.ค.=1 ... ก.ย.=12)
// ตั้งแต่ FY2570 เป็นต้นไป เลขครั้ง run ตามใบเบิกที่เกิดขึ้นจริงของแต่ละ รพ.สต. และ reset เมื่อขึ้นปีงบใหม่
const RXFILL_TRANSITION_FISCAL_YEAR = 2569;

// ─── Vaccine Constants ────────────────────────────────────
const VACCINE_DISCLAIMER = 'ระบบวัคซีน เป็นแค่ฟอร์มตัวช่วยในการพิมพ์ และดูประวัติการเบิกย้อนหลังเท่านั้น สำหรับการเบิกยังใช้เอกสารปกติและติดต่อกับเจ้าหน้าที่วัคซีนประจำคลังยา คนเดิม';

// ตราครุฑ ดึงจาก PDF ต้นฉบับ ว.3/1 ฝังเป็น data URI จึงไม่ต้องพึ่งไฟล์ภายนอก
const GARUDA_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJ4AAACyAQAAAACbkEubAAAIyUlEQVR42m2Xa2wc5RWGn/lmsrtOFu8aJGrDwi4XlVQB5JC0SYTjnZAqIESpET9aldu2RaKVKDUtVQOY7BgbAmorTCVECmljUUShpU2IIi5tiicXbNNaxAGpBBHiMbawIRfP2iYeO9/O6Y+92CSZX59enfe85zvnnd05hnDGU1RMnokq/NOhbhSfng6Oo9h/OtgEEpXTnj1aSez0yDTqLNqOCs8A61xDn3d6TZP/VcXkGaHeWXJGUcGZqK38M0FfGZXjfLsCdZbWLeySUzm46lP7fKzeImhbUJJbpah6DwoAxnxJfPQXETcqIsUeEdEJkelDVgDYRiXn6DQUsEjySOynAB7QHQKu8g/L1mUtQAAQkUeIodwbGE/dWcoPa92tHEHJCTLHc4DlA99cOe4kseoto6XGAcgAEQdch0OjB94cERGZmRAR2ZqSN+qV+3t7bBQo92CFoVtR00XoB9h2B8DSw19en1H00p0EeGgXgAYvUHRCN8AlnQARi5tRaihdal5LDMASum3L2BvDBuTRjwFE+RoVe21OyrZ0AEV8datq2lKag2dPl7qZa0f58UHHAT5tDEvov32PfR8Tioi4BqaIhGHNPleF55ToiaHynYLB/Uri1tsOIJ5hAThJC0Xkyv2A2LY8CBCmN+5QdORwgZNGid7ZmBhQ7ClVcjtONxDSnUEx7OABKWW3AZrVzZbK+K0AjIbujrJrwIt21iZEdAbieREfw7cUbdnJAJQXyT1Q8qGPlWx++6l6wD7QlcyDT78XU2zLFm4HMoVkrQPjw64LfiMYIpJbu7tWRBwUKYJ6nJSI5BJBrYgYrhNLEcQxw7xI5p79bSLhRjLJFPoKw5SsSAPGWhEtjtvaZOkfSAct8EUHIXxZa7gtA4oeO+T7kLEtGyZRHXtBR+52ZUpkp8EdIn3C5kiTMp55YQeLAO8+Fw6h+jZg6OGXzpl45DJPHTcuOIndc/GrB0eU+vxIo2uOw3AQULDDmbeeBTHfctPiyJa+kTrpkCAa99oQY8BLiJvf+W7k2tAUP7tmQCNdweqouInlXrxhNir+zVc8qRWrN4wBhcHkvRM/Af/qmS4sAm/9pSQbB6diwbYoww/wLEhvtNGQQxszWT+W+pp0jAZRjYw4SeSQbvSbb2peFbLI7dPIsBsn2xVekw8Phas07cZmrViy42HfM6hxxTNSmqENT4DMpI0gcVBfdGCsVW7108N/+q620K23xKLusvtfeekdBz+TDpajiK1s0Bo+si8KwfsycXQQhbEofyzEdJYOnHAs93+Nr3aDhBvIu3Wyx0tE5VaaN23KawVfNLnAh0gjf4++fWoTIGEiAYbszMX/JUSD7JuiEblHNgfI4/CBwB7ti0ZkufRpJrQTESHhpYdFK/iZk6LeMZJXOROQ8AJQsPyGcxZHuuVvmwlpbSk+B4iMhWT3R/XDu8X1rPy+MdEK4gdDtGs6++C+Y+27xwGRwmwYqR8TnZf3Er7INtGIBHkp+FEJRXoNR3qyJTAhhQlTRMTZlv5AZ0UrsIadaDIEMHKZK6dtQETyRIyCiAhBVmpFNCLS85SOBiKiV7nUFUW0AmLL17uBDXo8w30hJXpBxE0lgqx3fZ+fHSvTg3RY34QBG6MiiTLdMkxPmz0RaOguJMt0ycqUQywHWY+8iLYAOgf9ersfol3pQm0lMliuMyG0mQUZk7KQhI0gGJqLW9NSFoKDDtIKxvsxjwo9BPJ6k+YuQ6p0vZ5kXiQovfll0J+6OpkVCRpt8lXQ/fGJWFbEv+To1nmh/u6DeMB1Sd+vCpnm9s5EIO76U0QrkZJLciI4MOi2eObi0l8khFy8dPtc/3T7E7pxaYUesOZDnISrzDdW7K6oB/Cxb4OV/kcj+XJOY8A+t8aLOlbGHaSSM+DFjSpYZF9oH4n1umVQdi2uc6ZDJ5Pt6vxGJRIn9074a8zm/CfXfVhRL9SzJuv9tjd66v4BsmUh9Zg7kjv/4X9uOSUrL63Sif9ikNl2O2iNrKuCd7Nu15wZYftov+WUwaLYwZ1mp5O7s5+tVaGUa36W/XO0OBEfMLKVubux4pIcyZPbp+2slOmLWXz3b779ZNOxI/XvX1Ft3YsZ9t3GSxe0Pca4Xc6pLUi4+aMH/IaB2ny5dXpDLhLV+fG8C5HKOFTmXHvW9Iz8uicaHq3kNP4z/RBpIpM8k6mrTtPBhqHjDjVbzps3A8DQMTBKIy7ZZsXXk4jGcMxE1SFx5jK4gcM1dzVWc4rDiNFz0txSl5t3nQTmkNETmu+RWADK42kjP2fOtIvM25u5u4BQbYD5cWBsEixZdMNXQFXEDatfYWWwcxamlRF8BYxNMtgVddsq33giTl6nDwGxbfuq6iJdOuOZGOHLF1GIARbArnEeL7r2XHeNYx0r0XU2QGppztWNBc3Z2dKNNPJUkELR4GpDCiUwsNIyEsRh0GvuC41yZHZEOnR8r3Usn5Y9e0pgmBbpEKP/wNOSkAo9TIT5gjD0mRlmRUbKXioomRPb3gP2XKT8YxWaEj6oXfhOmNcY5X6mmHpuJsh6lzijplTung6jHX3fwljVQ1beKUcOm0HxV687S360NHEdl5YjzawYhT86kcNBNDAqP4AJ0WZ0BdF70qY40TKYFZ/gs3Xm08MFkc0i2hCA45eNvvL50vTOJ1e74/UULQCOzV647KbPe7cOxBfOaPaLv7qL3n3tKp96oEQvPhZZtC452fLDnyeBYsk2h+vCht8dGJtyJxba5vy5G51g8ZLuhXP3v1ezjLkl7beUwJL65aHxQnLJ3KMTE8n5yESxt0vNrX+eHPNOljXPW3ccjbz3y5JDzJLTiqkdL9cs7p25CUBKdbL31JB1/dSFt+1gvk6RtW98su/ek9kSvRzJ2qOvM3RtrLKIlfeC8yeNlXzVyXjNGarbRgW8PIT2cVhYp0y9NbG7rFN9uUT+MNM0Vj7q6jJyI9etPl2I1CnDOwMkMr/AGNVVaDa6YIs8635UeayzgfNbD/8H1lZz8tl3e8kAAAAASUVORK5CYII=';

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

// v6.6 ตำแหน่งยา (sawee_location.LOC_CODE เช่น 7/1/2-1, 12/3/2-1) — ว่างหรือ "0" = ไม่มีตำแหน่ง
const normDrugLocation = (v) => { const s = String(v == null ? '' : v).trim(); return s === '0' ? '' : s; };
// เทียบแบบตัวเลขทีละช่วง: ชั้น 7 มาก่อน 12, 12/3 มาก่อน 12/10
const compareLocationCode = (a, b) => {
  const ta = String(a).match(/\d+|\D+/g) || [], tb = String(b).match(/\d+|\D+/g) || [];
  for (let i = 0; i < Math.min(ta.length, tb.length); i++) {
    const da = /^\d/.test(ta[i]), db = /^\d/.test(tb[i]);
    const c = da && db ? Number(ta[i]) - Number(tb[i]) : ta[i].localeCompare(tb[i], 'th');
    if (c) return c;
  }
  return ta.length - tb.length;
};
// เรียงรายการในใบเบิก: มีตำแหน่งก่อน (เรียงตามตำแหน่ง → ชื่อ) แล้วยาไม่มีตำแหน่งเรียงตามชื่อ
const compareByLocation = (locA, nameA, locB, nameB) => {
  const la = normDrugLocation(locA), lb = normDrugLocation(locB);
  if (!la !== !lb) return la ? -1 : 1;
  return (la ? compareLocationCode(la, lb) : 0) || String(nameA || '').localeCompare(String(nameB || ''), 'th');
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
  if (drug.discontinued_all === true) return true;
  if (compact.includes('ยกเลิกการใช้') || compact.includes('ยกเลิกใช้') || compact.includes('ยกเลิกรพ') || compact === 'discontinued' || compact === 'inactive' || compact === 'cancelled' || compact === 'canceled') return true;
  const activeValue = drug?.is_active ?? drug?.active;
  if (activeValue === false || String(activeValue).trim().toLowerCase() === 'false' || String(activeValue).trim() === '0') return true;
  return false;
};

const normalizeDrugMasterStatus = (value) => {
  const raw = safeText(value).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
  if (raw.includes('ยกเลิกรพ')) return DRUG_LOCK_STATUS.rpst;
  if (raw.includes('ยกเลิกการใช้') || raw.includes('ยกเลิกใช้') || raw === 'discontinued' || raw === 'inactive' || raw === 'cancelled' || raw === 'canceled' || raw === 'false' || raw === '0') return 'ยกเลิกใช้';
  return 'Active';
};

// สถานะยา 3 ระดับ (v6.1)
//  active = เบิกได้ทุกหน่วย
//  rpst   = "ยกเลิก รพ.สต." ล็อกเฉพาะใบเบิก รพ.สต. (ห้องยา/หน่วยงานใน รพ. ยังเบิกได้) — ค่าเดิม 'ยกเลิกใช้' ที่ไม่มี discontinued_all นับเป็นระดับนี้
//  all    = "ยกเลิกใช้" ไม่มียาให้ใช้จริง ล็อกทุกหน่วย (status 'ยกเลิกใช้' + discontinued_all: true)
const DRUG_LOCK_LABELS = { active: 'ใช้งาน', rpst: 'ยกเลิก รพ.สต.', all: 'ยกเลิกใช้' };
const DRUG_LOCK_STATUS = { active: 'Active', rpst: 'ยกเลิก รพ.สต.', all: 'ยกเลิกใช้' };
const isDrugDiscontinuedAll = (drug) => !!drug && drug.discontinued_all === true;
const getDrugLockLevel = (drug) => isDrugDiscontinuedAll(drug) ? 'all' : (isDrugDiscontinued(drug) ? 'rpst' : 'active');
const drugLockPatch = (level) => {
  const lv = level === 'discontinued' ? 'rpst' : (DRUG_LOCK_STATUS[level] ? level : 'active');
  return { status: DRUG_LOCK_STATUS[lv], discontinued_all: lv === 'all' };
};
// ป้ายสถานะของรายการในใบเบิก (ใช้ข้อมูล master ปัจจุบันก่อน ถ้าไม่มีใช้ค่าที่บันทึกในรายการ)
const drugLockLabelOf = (drug, item) => DRUG_LOCK_LABELS[drug ? getDrugLockLevel(drug) : (item && item.discontinuedAll ? 'all' : 'rpst')];

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
    discontinuedAll: drug ? isDrugDiscontinuedAll(drug) : !!fallback.discontinuedAll,
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
    // v6.6.1 ใบที่จัดยาแล้วแต่ยังไม่ส่ง INVS ส่งย้อนหลังได้ (Bridge v2.9.1)
    canSendInvs: isAdmin && (isPending || status === 'Completed') && !invsSent
  };
};

// ─── INVS Bridge ──────────────────────────────────────────
// Bridge หลายตำแหน่ง: เครื่องนี้ (127.0.0.1) ก่อน ถ้าไม่มีให้ใช้เครื่อง XAMPP กลางในวง LAN
const INVS_BRIDGE_LAN_URL = 'http://192.168.40.90/SaweeRefill/invs_api.php';
const INVS_BRIDGE_URLS = [INVS_BRIDGE_URL, INVS_BRIDGE_LAN_URL];
const bridgeFetch = async (url, init) => {
  const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost)/.test(url);
  // Chrome (Local Network Access) ต้องระบุ targetAddressSpace เพื่อเรียก IP ในวง LAN จากหน้า https
  try { return await fetch(url, Object.assign({}, init, { targetAddressSpace: isLoopback ? 'loopback' : 'local' })); }
  catch (e) { if (e && e.name === 'TypeError' && /targetAddressSpace|enum/i.test(String(e.message))) return await fetch(url, init); throw e; }
};
const callInvsBridge = async (action, requisitionId, extra) => {
  if (!auth.currentUser) throw new Error('กรุณา Login ใหม่ก่อนเชื่อม INVS');
  const idToken = await auth.currentUser.getIdToken(true);
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
    body: JSON.stringify(Object.assign({}, extra || {}, { action: action, requisition_id: requisitionId, firebase_id_token: idToken }))
  };
  var preferred = 0;
  try { preferred = Number(sessionStorage.getItem('rxfill_bridge_idx') || 0) || 0; } catch (e) { /* storage blocked */ }
  const order = [preferred].concat(INVS_BRIDGE_URLS.map(function (_, i) { return i; }).filter(function (i) { return i !== preferred; }));
  var response = null, usedUrl = '', lastErr = null;
  for (var k = 0; k < order.length; k++) {
    const url = INVS_BRIDGE_URLS[order[k]];
    try {
      response = await bridgeFetch(url, init);
      usedUrl = url;
      try { sessionStorage.setItem('rxfill_bridge_idx', String(order[k])); } catch (e) { /* ignore */ }
      break;
    } catch (networkErr) { lastErr = networkErr; response = null; }
  }
  if (!response) {
    var e = new Error('ติดต่อ INVS Bridge ไม่ได้ทั้งเครื่องนี้ (127.0.0.1) และเครื่องกลาง (192.168.40.90) — ตรวจว่าเปิด XAMPP Apache แล้ว และถ้าใช้เครื่องกลาง ให้อนุญาต "เนื้อหาที่ไม่ปลอดภัย (Insecure content)" สำหรับเว็บนี้ใน Chrome');
    e.cause = lastErr;
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
    err.bridgeUrl = usedUrl;
    throw err;
  }
  data._bridge_url = usedUrl;
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
  Draft: 'รอส่ง (บันทึกไว้)', Pending: 'รอตรวจสอบ', Approving: 'กำลังอนุมัติ', Completed: 'อนุมัติแล้ว',
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
// ปริมาณที่แนะนำให้เบิก (ห้องยา)
//   เครดิต = คงเหลือจากใบก่อน − ยอดใช้รอบนี้ (onHand)
//   ถ้าเครดิต + ค้างรับ พอใช้ถึงรอบหน้า (dailyAvg × roundDays) → แนะนำ "ข้ามรอบนี้"
//   ถ้าต้องเบิกแต่มูลค่าน้อยกว่า minOrderValue และยังพอใช้ ≥ ครึ่งรอบ → แนะนำ "รวบไปรอบหน้า"
//   ไม่งั้นเบิกให้ถึงเป้า (dailyAvg × coverDays) ปัดขึ้นตามแพ็ค — การปัดแพ็คทำให้ยาหมุนช้าได้ยอดควบหลายรอบเอง
const calcPharmacySuggestion = (p) => {
  const days = Math.max(1, toNonNegativeNumber(p.days, 1));
  const usage = toNonNegativeNumber(p.usage);
  const cover = Math.max(1, toNonNegativeNumber(p.coverDays, INTERNAL_DEFAULT_COVER_DAYS));
  const roundDays = Math.max(1, toNonNegativeNumber(p.roundDays, cover));
  const dailyAvg = usage / days;
  const item = p.item || {};
  const pack = safePackSize(item.packSize);
  // v6.5.2 ห้องยา: Target Stock และจำนวนจ่าย ปัดขึ้นเป็นจำนวนเต็มหน่วยบรรจุเสมอ (ไม่แตกเศษ)
  const toPacks = function (q) { return q > 0 ? Math.ceil(q / pack - 0.000001) * pack : 0; };
  const target = toPacks(dailyAvg * cover);
  const available = toNonNegativeNumber(p.onHand) + toNonNegativeNumber(p.inTransit);
  const roundNeed = dailyAvg * roundDays;
  const need = Math.max(0, target - available);
  let suggested = need > 0 ? applyMaximumQty(toPacks(need), item) : 0;
  let skipReason = '';
  if (usage > 0 && suggested > 0 && available >= roundNeed) { suggested = 0; skipReason = 'พอใช้ถึงรอบหน้า'; }
  const minValue = toNonNegativeNumber(p.minOrderValue);
  if (suggested > 0 && minValue > 0 && available >= roundNeed / 2) {
    const value = (suggested / pack) * toNonNegativeNumber(item.price);
    if (value < minValue) { suggested = 0; skipReason = 'ยอดน้อย รวบไปรอบหน้า'; }
  }
  const coverRounds = roundNeed > 0 ? (available + suggested) / roundNeed : 0;
  return { dailyAvg: dailyAvg, target: target, need: need, suggested: suggested, skip: !!skipReason, skipReason: skipReason, roundNeed: roundNeed, coverRounds: coverRounds };
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

// ─── INVS dept_id → หน่วยงานในแอป (v5.7.1) ───────────────
// จัดประเภทแถวจากตาราง dept_id ของ INVS: pharmacy | dept | rpst | skip
const normalizeInvsDeptRow = (r) => {
  const o = {};
  Object.keys(r || {}).forEach(function (k) { o[String(k).toLowerCase()] = safeText(r[k]); });
  return o;
};
const classifyInvsDept = (r) => {
  const id = safeText(r.dept_id), name = safeText(r.dept_name);
  const hide = safeText(r.hide).toUpperCase(), deptType = safeText(r.dept_type), hospType = safeText(r.hosp_type), mod = safeText(r.mod_sys).toUpperCase();
  if (!id || !name) return { kind: 'skip', reason: 'ข้อมูลไม่ครบ' };
  if (hide === 'Y' || hide === '1') return { kind: 'skip', reason: 'ซ่อนใน INVS' };
  if (/รพ\.?\s*สต/.test(name) || hospType === '2') return { kind: 'rpst', reason: 'รพ.สต.' };
  if (deptType === '1' || deptType === '2') return { kind: 'skip', reason: 'คลัง' };
  if (deptType === '4') return { kind: 'skip', reason: 'จ่ายผู้ป่วย' };
  if (mod && mod !== 'MED') return { kind: 'skip', reason: 'ไม่ใช่ระบบยา (' + mod + ')' };
  if (id === '01' || /จ่ายยา|ห้องยา/.test(name)) return { kind: 'pharmacy', reason: 'ห้องยา' };
  return { kind: 'dept', reason: 'หน่วยงาน' };
};
const normalizeRpstName = (s) => normalizeForMatch(String(s || '').replace(/รพ\.?\s*สต\.?/g, '').replace(/โรงพยาบาลส่งเสริมสุขภาพตำบล/g, ''));


// ─── ใบเบิกวัสดุ/เวชภัณฑ์ (หน่วยงาน/ห้องยา) v5.9 ──────────
// สร้าง HTML ใบเบิกทางการ (TH Sarabun) แล้วสั่งพิมพ์ผ่าน iframe — ใช้ร่วมกันทั้ง internal.html และ app.html
const INTERNAL_FORM_FONT_URL = 'https://raw.githubusercontent.com/sawee-hosp/sawee-vmi/refs/heads/main/font/THSarabunNew.ttf';
const thaiDateLong = (ymd) => {
  const d = parseYmd(ymd); if (!d) return '';
  return d.getDate() + ' ' + THAI_MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543);
};
const thaiDateParts = (ymd) => {
  const d = parseYmd(ymd); if (!d) return { day: '', month: '', year: '' };
  return { day: String(d.getDate()), month: THAI_MONTHS[d.getMonth()], year: String(d.getFullYear() + 543) };
};
const fiscalYearBEOfYmd = (ymd) => {
  const d = parseYmd(ymd) || new Date();
  return getFiscalInfo(d.getMonth() + 1, d.getFullYear()).fiscalYear;
};
const tsToYmd = (v) => { const ms = tsToMillis(v); return ms ? toYmd(new Date(ms)) : toYmd(new Date()); };
// เลขที่ใบเบิกภายใน = ลำดับของหน่วยในปีงบประมาณ / ปีงบ (พ.ศ.) เหมือนหลักการของ รพ.สต.
const nextInternalFormNo = (reqs, deptId, ymd, excludeId) => {
  const fy = fiscalYearBEOfYmd(ymd);
  const n = (reqs || []).filter(function (r) {
    return String(r.deptId) === String(deptId) && r.status !== 'Cancelled' && r.id !== excludeId && Number(r.fiscal_year) === fy;
  }).length + 1;
  return { no: n + '/' + fy, fiscalYear: fy };
};
const internalFormNoFor = (req, reqs) => {
  if (safeText(req && req.form_no)) return safeText(req.form_no);
  const ymd = safeText(req && req.form_date) || tsToYmd(req && (req.submitted_at || req.created_at));
  const fy = fiscalYearBEOfYmd(ymd);
  const same = (reqs || []).filter(function (r) { return String(r.deptId) === String(req.deptId) && r.status !== 'Cancelled' && fiscalYearBEOfYmd(safeText(r.form_date) || tsToYmd(r.submitted_at || r.created_at)) === fy; })
    .sort(function (a, b) { return tsToMillis(a.submitted_at || a.created_at) - tsToMillis(b.submitted_at || b.created_at); });
  const idx = same.findIndex(function (r) { return r.id === req.id; });
  return (idx >= 0 ? idx + 1 : same.length + 1) + '/' + fy;
};
const deptSentencePrefix = (name) => {
  const n = safeText(name);
  return /^ฝ่า[ยน]/.test(n) ? n : 'ฝ่าย' + n;
};

// v6.6 ผู้ลงนามท้ายใบเบิกห้องยา/หน่วยงาน 4 จุด — แก้ชื่อ/ตำแหน่งได้ จำไว้ในใบ (sign_people) วันที่เว้นว่างให้เขียน
const INTERNAL_SIGN_ROLES = ['ผู้เบิก', 'ผู้สั่งจ่าย', 'ผู้รับของ', 'ผู้จ่าย'];
// ลำดับค่าเริ่มต้น: ค่าที่บันทึกในใบนี้ → ค่าจากใบก่อนของหน่วยงาน (prev) → ผู้สร้าง/ผู้อนุมัติ
const internalSignersFor = (req, prev) => {
  const r = req || {};
  const pick = function (v) { return Array.isArray(v) && v.length ? v : null; };
  const saved = pick(r.sign_people), before = pick(prev);
  return INTERNAL_SIGN_ROLES.map(function (role, i) {
    const d = i === 0 ? { name: r.created_by_name, position: r.created_by_position } : i === 3 ? { name: r.approved_by_name, position: '' } : {};
    const b = before && before[i] ? before[i] : {};
    const src = saved ? (saved[i] || {}) : { name: safeText(b.name) || safeText(d.name), position: safeText(b.position) || safeText(d.position) };
    return { role: role, name: safeText(src.name).slice(0, 120), position: safeText(src.position).slice(0, 120) };
  });
};
const sameSigners = (a, b) => JSON.stringify((a || []).map(function (x) { return [safeText(x && x.name), safeText(x && x.position)]; })) ===
  JSON.stringify((b || []).map(function (x) { return [safeText(x && x.name), safeText(x && x.position)]; }));
const signersForSave = (list) => (list || []).map(function (x, i) { return { role: INTERNAL_SIGN_ROLES[i], name: safeText(x && x.name).slice(0, 120), position: safeText(x && x.position).slice(0, 120) }; });
// ช่องแก้ผู้ลงนาม (ใช้ในหน้าต่างพิมพ์ทั้ง internal.html และ app.html)
const InternalSignersEditor = (props) => {
  const h = React.createElement;
  const list = props.value || [];
  const set = function (i, key, v) { props.onChange(list.map(function (x, j) { return j === i ? Object.assign({}, x, { [key]: v }) : x; })); };
  const cls = 'w-full p-2 border border-slate-300 rounded-lg text-sm';
  return h('div', { className: 'space-y-2' },
    h('div', { className: 'text-sm font-bold text-slate-600' }, 'ผู้ลงนามท้ายใบ ', h('span', { className: 'text-xs font-normal text-slate-400' }, '(จำไว้ในใบนี้ · วันที่เว้นว่างไว้เขียน)')),
    list.map(function (x, i) {
      return h('div', { key: i, className: 'grid grid-cols-[5.5rem_1fr_1fr] gap-2 items-center' },
        h('span', { className: 'text-xs font-bold text-slate-500' }, INTERNAL_SIGN_ROLES[i]),
        h('input', { id: 'sign-name-' + i, value: x.name || '', placeholder: 'ชื่อ-สกุล (เว้นว่างได้)', 'aria-label': INTERNAL_SIGN_ROLES[i] + ' ชื่อ', onChange: function (e) { set(i, 'name', e.target.value); }, className: cls }),
        h('input', { id: 'sign-pos-' + i, value: x.position || '', placeholder: 'ตำแหน่ง', 'aria-label': INTERNAL_SIGN_ROLES[i] + ' ตำแหน่ง', onChange: function (e) { set(i, 'position', e.target.value); }, className: cls }));
    }));
};

const buildInternalReqFormHtml = (opts) => {
  const req = opts.req || {};
  const isPharmacy = req.kind === 'pharmacy';
  const types = opts.drugTypes || DEFAULT_DRUG_TYPES;
  const locOf = opts.locOf || function () { return ''; };
  const esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const money = function (v) { return toNonNegativeNumber(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const qty = function (q, pack) { const s = formatQty(q, pack); return s === '0' ? '0' : s; };
  const parts = thaiDateParts(opts.formDate);
  const items = (req.items || []).filter(function (it) { return toNonNegativeNumber(it.requestQty != null ? it.requestQty : it.dispenseQty) > 0 || toNonNegativeNumber(it.dispenseQty) > 0 || (isPharmacy && opts.includeUsed && (toNonNegativeNumber(it.usage) > 0 || it.source === 'manual')); });
  // จัดกลุ่มตามหมวด แล้วเรียงตามตำแหน่งยา (ไม่มีตำแหน่งไว้ท้าย) เพื่อให้ผู้จัดยาเดินหยิบตามลำดับ
  const groups = {};
  items.forEach(function (it) { const k = safeText(it.type, '1') || '1'; (groups[k] = groups[k] || []).push(it); });
  const byLoc = function (a, b) { return compareByLocation(locOf(a.drugId), a.name, locOf(b.drugId), b.name); };
  const typeKeys = Object.keys(groups).sort(function (a, b) { return Number(a) - Number(b); });
  // v6.5 ห้องยา: คอลัมน์แบบใบเบิก รพ.สต. — ยอดใช้ · คงเหลือ(น้ำเงิน) · Target Stock(เทา) · จำนวนจ่าย(หนา)
  // opts.blankQty = เว้นช่องจำนวนจ่าย/มูลค่า/คงเหลือหลังเบิก ไว้เขียนเอง
  const blank = !!opts.blankQty;
  const colCount = isPharmacy ? 12 : 9;
  const valueOf = function (it) {
    const req0 = toNonNegativeNumber(it.requestQty != null ? it.requestQty : it.dispenseQty);
    const disp = toNonNegativeNumber(it.dispenseQty != null ? it.dispenseQty : req0);
    return (disp / safePackSize(it.packSize)) * toNonNegativeNumber(it.price);
  };
  let n = 0, total = 0;
  const body = typeKeys.map(function (k) {
    const list = groups[k].slice().sort(byLoc);
    const subtotal = list.reduce(function (s, it) { return s + valueOf(it); }, 0);
    total += subtotal;
    const rows = list.map(function (it) {
      n++;
      const pack = safePackSize(it.packSize);
      const req0 = toNonNegativeNumber(it.requestQty != null ? it.requestQty : it.dispenseQty);
      const disp = toNonNegativeNumber(it.dispenseQty != null ? it.dispenseQty : req0);
      if (isPharmacy) {
        const onHand = Math.max(0, toNonNegativeNumber(it.onHand));
        // รายการเพิ่มเอง (เช่น เวชภัณฑ์มิใช่ยา) ไม่มียอดจาก HOSxP — ช่องที่เป็น 0 เว้นว่างไว้เขียนเอง
        const man = it.source === 'manual';
        const z = function (v, s) { return man && !(toNonNegativeNumber(v) > 0) ? '' : s; };
        const tgt = it.targetQty != null ? z(it.targetQty, qty(toNonNegativeNumber(it.targetQty), pack)) : '-';
        return '<tr>' +
          '<td class="c">' + n + '</td>' +
          '<td class="name">' + esc(it.name) + '</td>' +
          '<td class="c muted">' + esc(it.unit) + '</td>' +
          '<td class="c">' + pack + '</td>' +
          '<td class="c">' + z(it.usage, qty(it.usage, pack)) + '</td>' +
          '<td class="c blue">' + z(onHand, qty(onHand, pack)) + '</td>' +
          '<td class="c tgt">' + tgt + '</td>' +
          '<td class="c b">' + (blank ? '' : z(disp, qty(disp, pack))) + '</td>' +
          '<td class="r">' + esc(formatUnitPrice(it.price)) + '</td>' +
          '<td class="r b">' + (blank ? '' : z(disp, money(valueOf(it)))) + '</td>' +
          '<td class="c"></td>' + // คงเหลือ: เว้นให้เขียนในกระดาษ
          '<td class="c code">' + esc(it.drugId) + '</td>' +
          '</tr>';
      }
      return '<tr>' +
        '<td class="c">' + n + '</td>' +
        '<td class="name">' + esc(it.name) + '</td>' +
        '<td class="c muted">' + esc(it.unit) + (pack > 1 ? '<div class="xs">บรรจุ ' + pack + '</div>' : '') + '</td>' +
        (isPharmacy ? '<td class="c">' + qty(it.usage, pack) + '</td>' : '') +
        '<td class="c">' + qty(req0, pack) + '</td>' +
        '<td class="c b">' + qty(disp, pack) + '</td>' +
        '<td class="r">' + esc(formatUnitPrice(it.price)) + '</td>' +
        '<td class="r b">' + money(valueOf(it)) + '</td>' +
        '<td class="c">' + (isPharmacy ? qty(Math.max(0, toNonNegativeNumber(it.onHand)), pack) : '') + '</td>' +
        '<td class="c code">' + esc(it.drugId) + '</td>' +
        '</tr>';
    }).join('');
    return '<tr class="grp"><td colspan="' + colCount + '"><span>' + esc(types[k] || ('หมวด ' + k)) + '</span><span class="sub">' + (blank ? '' : money(subtotal) + ' บาท') + '</span></td></tr>' + rows;
  }).join('') +
    // v6.5.2 ห้องยา: เผื่อแถวว่าง 5 แถว ไว้เขียนรายการเพิ่มในกระดาษ
    (isPharmacy ? new Array(5).fill('<tr class="blankrow">' + new Array(colCount).fill('').map(function (_, i) { return i === 6 ? '<td class="tgt"></td>' : '<td></td>'; }).join('') + '</tr>').join('') : '');
  const now = new Date();
  const printedAt = now.getDate() + '/' + (now.getMonth() + 1) + '/' + (now.getFullYear() + 543) + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
  const sign = function (label, name, pos) {
    return '<div class="sig"><div class="nw">ลงชื่อ ................................ ' + label + '</div><div>(' + (name ? esc(name) : '................................') + ')</div>' +
      (pos ? '<div>ตำแหน่ง ' + esc(pos) + '</div>' : '<div>ตำแหน่ง ................................</div>') + '<div>วันที่ ........./........./.........</div></div>';
  };
  const signers = opts.signers || internalSignersFor(req);
  return '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเบิกวัสดุ/เวชภัณฑ์ ' + esc(opts.formNo) + '</title>' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=block" rel="stylesheet">' +
    '<style>' +
    '@page{size:A4 portrait;margin:14mm 10mm 14mm 10mm;' +
    // v6.5.2 เลขหน้ามุมขวาบน + เวลาพิมพ์ท้ายกระดาษทุกหน้า (ไม่ล้นไปหน้าใหม่)
    '@top-right{content:"หน้า " counter(page) "/" counter(pages);font-family:Sarabun,Tahoma,sans-serif;font-size:9px;color:#555}' +
    '@bottom-right{content:"พิมพ์เมื่อ: ' + printedAt + '";font-family:Sarabun,Tahoma,sans-serif;font-size:9px;color:#666}}' +
    "*{box-sizing:border-box}body{font-family:'Sarabun','Tahoma',sans-serif;font-size:12.5px;line-height:1.45;color:#111;margin:0}" +
    'h1{text-align:center;font-size:19px;font-weight:700;margin:0 0 6px}' +
    '.meta{text-align:right}.meta b{display:inline-block;min-width:3.5em;text-align:center;border-bottom:1px dotted #555;font-weight:700}' +
    '.to{margin-top:6px}.intro{text-indent:2.5em;margin:2px 0 8px}.intro b{font-weight:700}' +
    'table{width:100%;border-collapse:collapse}' +
    '.items{font-size:10.5px}.items th,.items td{border:1px solid #444;padding:3px 4px;vertical-align:middle}' +
    '.items th{background:#eee;font-weight:700;text-align:center;line-height:1.25}' +
    '.items tr{page-break-inside:avoid}.items thead{display:table-header-group}' +
    '.c{text-align:center}.r{text-align:right;white-space:nowrap}.b{font-weight:700}.name{font-weight:600}.muted{color:#333}' +
    ".code{font-family:Consolas,'Courier New',monospace;font-size:9.5px;color:#555}.xs{font-size:8.5px;color:#666;line-height:1.1}" +
    '.grp td{background:#f2f2f2;font-weight:700}.grp .sub{float:right}' +
    '.blue{color:#1d4ed8;font-weight:600}.items td.tgt,.items th.tgt{background:#f1f1f1;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.note td{font-size:10.5px}.note b{font-weight:700}' +
    '.totals{margin-top:10px;font-size:12px}.totals td{border:1px solid #444;padding:5px 8px}.totals th{border:1px solid #444;background:#eee;font-weight:700;text-align:center;width:50%;padding:5px 8px}' +
    '.totals .big{font-size:18px;font-weight:700;text-align:right}.totals .rt{text-align:right;font-weight:700}' +
    '.sigs{display:grid;grid-template-columns:1fr 1fr;gap:16px 28px;margin-top:22px;text-align:center;page-break-inside:avoid;font-size:12.5px}.nw{white-space:nowrap}' +
    '.blankrow td{height:22px}' +
    '</style></head><body>' +
    '<h1>ใบเบิกวัสดุ/เวชภัณฑ์</h1>' +
    '<div class="meta"><div>เลขที่ <b>' + esc(opts.formNo) + '</b></div><div>วันที่ <b>' + esc(parts.day) + '</b> เดือน <b>' + esc(parts.month) + '</b> ปี <b>' + esc(parts.year) + '</b></div></div>' +
    '<div class="to">เรียน ผู้อำนวยการโรงพยาบาลสวี</div>' +
    '<div class="intro">ด้วย<b>' + esc(deptSentencePrefix(opts.deptName || req.dept_name)) + '</b> มีความประสงค์จะขอเบิกวัสดุ/เวชภัณฑ์ เพื่อใช้ในราชการดังรายการต่อไปนี้</div>' +
    '<table class="items"><thead><tr>' +
    (isPharmacy
      ? '<th style="width:4%">ที่</th><th>ชื่อยา/เวชภัณฑ์</th><th style="width:7%">หน่วย</th><th style="width:5%">บรรจุ</th>' +
        '<th style="width:7.5%">ยอดใช้</th><th style="width:7.5%">ยอด<br>เหลือ</th><th class="tgt" style="width:7.5%">Target<br>Stock</th><th style="width:7.5%">จำนวน<br>จ่าย</th>' +
        '<th style="width:7.5%">ราคา/<br>หน่วย</th><th style="width:8.5%">มูลค่า<br>(บาท)</th><th style="width:7.5%">คง<br>เหลือ</th><th style="width:6%">รหัส</th>'
      : '<th style="width:4%">ที่</th><th>รายการ</th><th style="width:8%">รูปแบบยา</th>' +
        '<th style="width:8%">จำนวน<br>เบิก</th><th style="width:8%">จำนวน<br>จ่าย</th><th style="width:8%">ราคา/<br>หน่วย</th><th style="width:9%">มูลค่า<br>(บาท)</th>' +
        '<th style="width:8%">คง<br>เหลือ</th><th style="width:7%">รหัส</th>') +
    '</tr></thead><tbody>' + body +
    '<tr class="note"><td colspan="' + colCount + '"><b>หมายเหตุ:</b> ข้อมูลยา จำนวนเต็มคือจำนวนหน่วยเบิกหลัก และเลขในวงเล็บคือจำนวนที่แตกออกจากหน่วยเบิกหลักตามขนาดบรรจุ' + (req.note ? ' · ' + esc(req.note) : '') + '</td></tr>' +
    '</tbody></table>' +
    '<table class="totals"><tr><th>รวมจำนวนรายการทั้งหมด:</th><td class="rt">' + n + ' รายการ</td></tr><tr><th>รวมเป็นเงินทั้งสิ้น:</th><td class="big">' + (blank ? '' : money(total) + ' บาท') + '</td></tr></table>' +
    '<div class="sigs">' + signers.map(function (x, i) { return sign(INTERNAL_SIGN_ROLES[i], x.name, x.position); }).join('') + '</div>' +
    '</body></html>';
};

// พิมพ์ HTML ผ่าน iframe ที่ซ่อนไว้ (ไม่โดนบล็อก pop-up) รอฟอนต์โหลดก่อนสั่งพิมพ์
const printHtmlDocument = (html) => new Promise(function (resolve) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  const doc = f.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  const go = function () {
    try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { console.warn(e); }
    setTimeout(function () { f.remove(); resolve(); }, 1500);
  };
  const fontsReady = f.contentWindow.document.fonts && f.contentWindow.document.fonts.ready;
  if (fontsReady) Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 2500); })]).then(function () { setTimeout(go, 100); });
  else setTimeout(go, 800);
});

// ─── รอบเบิก (แอดมินกำหนด) v6.0 ─────────────────────────
// req_rounds/{id}: { fiscal_year, round_no, round_date (YYYY-MM-DD), scope: 'all'|'rpst'|'internal', note, active }
const ROUND_SCOPE_LABELS = { all: 'ทุกหน่วย', rpst: 'รพ.สต.', internal: 'หน่วยงานใน รพ.' };
const roundAppliesTo = (r, scope) => r && r.active !== false && (safeText(r.scope, 'all') === 'all' || safeText(r.scope) === scope);
const roundsFor = (rounds, scope, fiscalYear) => (rounds || [])
  .filter(function (r) { return roundAppliesTo(r, scope) && (!fiscalYear || Number(r.fiscal_year) === Number(fiscalYear)); })
  .sort(function (a, b) { return String(a.round_date).localeCompare(String(b.round_date)) || Number(a.round_no) - Number(b.round_no); });
const roundLabel = (r) => r ? ('รอบที่ ' + r.round_no + '/' + r.fiscal_year + ' · ' + thaiDateLong(r.round_date)) : '';
const roundFormNo = (r) => r ? (r.round_no + '/' + r.fiscal_year) : '';
// รอบที่ควรเลือกเป็นค่าเริ่มต้น: รอบแรกที่วันที่ยังไม่ผ่าน (หรือรอบล่าสุดถ้าผ่านหมดแล้ว)
const pickDefaultRound = (list, todayYmd) => {
  const t = todayYmd || toYmd(new Date());
  return (list || []).find(function (r) { return String(r.round_date) >= t; }) || (list || [])[(list || []).length - 1] || null;
};
// จำนวนวันจากรอบนี้ถึงรอบถัดไป (ใช้คำนวณ "พอถึงรอบหน้า")
const daysToNextRound = (list, round, fallback) => {
  if (!round) return fallback;
  const sorted = (list || []).slice().sort(function (a, b) { return String(a.round_date).localeCompare(String(b.round_date)); });
  const i = sorted.findIndex(function (r) { return r.id === round.id; });
  const next = i >= 0 ? sorted[i + 1] : null;
  if (!next) return fallback;
  const d = daysBetweenInclusive(round.round_date, next.round_date) - 1;
  return d > 0 ? d : fallback;
};


// ════════════════════════════════════════════════════════════
// v6.2 ประหยัดโควตา Firestore (Read-saver)
//  • เก็บข้อมูลที่โหลดแล้วไว้ในเครื่อง (IndexedDB) แยกตามผู้ใช้
//  • รอบถัดไปดึงเฉพาะเอกสารที่เปลี่ยนหลังเวลาล่าสุด (where updated_at > เวลาเดิม)
//    → ถ้าไม่มีอะไรเปลี่ยน เสีย 1 read ต่อคอลเลกชัน แทนการอ่านทั้งคอลเลกชัน
//  • ทุกการเขียนเข้าคอลเลกชันที่แคชไว้ จะถูกเติม updated_at อัตโนมัติ (write hook)
//  • การลบเอกสาร จะทิ้ง "ป้ายลบ" ไว้ใน cache_tombstones ให้เครื่องอื่นลบออกจากแคชด้วย
//  • แอดมินสั่ง "ล้างแคชทุกเครื่อง" ได้ (config/app_meta.cache_epoch)
// ════════════════════════════════════════════════════════════
const RX_CACHE_SCHEMA = 1;
const RX_FULL_TTL_MS = 21 * 24 * 3600 * 1000; // กันพลาด: โหลดเต็มใหม่ทุก 3 สัปดาห์
const RX_TOMB_COL = 'cache_tombstones';
// ฟิลด์เวลาที่ใช้ดึงเฉพาะส่วนที่เปลี่ยน ของแต่ละคอลเลกชัน
const RX_DELTA_FIELDS = {
  master_drugs: 'updated_at', master_hospitals: 'updated_at', master_unit: 'updated_at', master_depts: 'updated_at',
  req_rounds: 'updated_at', config_par: 'updated_at', current_excess: 'last_updated', historical_usages: 'updated_at',
  requisitions: 'updated_at', vaccine_requisitions: 'updated_at', internal_requisitions: 'updated_at', internal_stock: 'updated_at'
};
const rxStats = { reads: 0, log: [] };
const rxMissingIndexes = new Map(); // คอลเลกชัน → ลิงก์สร้าง index ใน Firebase console
try { window.__rxStats = rxStats; window.__rxMissingIndexes = rxMissingIndexes; } catch (e) { /* no window */ }
const rxCountReads = (label, n) => {
  rxStats.reads += n; rxStats.log.push([label, n]);
  if (rxStats.log.length > 300) rxStats.log.shift();
};

// --- IndexedDB key-value (ถ้าเบราว์เซอร์ไม่ให้ใช้ จะเก็บในหน่วยความจำแทน) ---
const rxKv = (function () {
  const mem = new Map();
  let dbp = null;
  const open = function () {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open('sawee-rxfill-cache', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbp;
  };
  return {
    get: async function (k) {
      if (mem.has(k)) return mem.get(k);
      const d = await open(); if (!d) return undefined;
      return new Promise(function (resolve) {
        try { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { if (q.result !== undefined) mem.set(k, q.result); resolve(q.result); }; q.onerror = function () { resolve(undefined); }; }
        catch (e) { resolve(undefined); }
      });
    },
    set: async function (k, v) {
      mem.set(k, v);
      const d = await open(); if (!d) return;
      await new Promise(function (resolve) {
        try { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = resolve; t.onerror = resolve; t.onabort = resolve; }
        catch (e) { resolve(); }
      });
    },
    clear: async function () {
      mem.clear();
      const d = await open(); if (!d) return;
      await new Promise(function (resolve) {
        try { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').clear(); t.oncomplete = resolve; t.onerror = resolve; }
        catch (e) { resolve(); }
      });
    }
  };
})();

// --- แปลง Timestamp ↔ ข้อมูลที่เก็บได้ ---
const rxIsTs = (v) => v && typeof v === 'object' && typeof v.seconds === 'number' && typeof v.toMillis === 'function';
const rxEncode = (v) => {
  if (v === null || typeof v !== 'object') return v;
  if (rxIsTs(v)) return { __ts: [v.seconds, v.nanoseconds || 0] };
  if (Array.isArray(v)) return v.map(rxEncode);
  const o = {};
  Object.keys(v).forEach(function (k) { o[k] = rxEncode(v[k]); });
  return o;
};
const rxMakeTs = (pair) => {
  const s = pair[0], n = pair[1] || 0;
  const T = firebase.firestore && firebase.firestore.Timestamp;
  if (T) return new T(s, n);
  return { seconds: s, nanoseconds: n, toMillis: function () { return s * 1000 + Math.floor(n / 1e6); }, toDate: function () { return new Date(s * 1000 + Math.floor(n / 1e6)); } };
};
const rxDecode = (v) => {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(rxDecode);
  if (v.__ts && Array.isArray(v.__ts)) return rxMakeTs(v.__ts);
  const o = {};
  Object.keys(v).forEach(function (k) { o[k] = rxDecode(v[k]); });
  return o;
};
const rxTsOf = (v) => {
  if (!v || typeof v !== 'object') return null;
  if (Array.isArray(v.__ts)) return v.__ts;
  if (typeof v.seconds === 'number') return [v.seconds, v.nanoseconds || 0];
  return null;
};
const rxCmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);
const rxIndexError = (e) => {
  const msg = String((e && e.message) || e || '');
  return (e && e.code === 'failed-precondition') || /requires an index|create_composite|create it here/i.test(msg);
};
const rxIndexLink = (e) => { const m = /https:\/\/console\.firebase\.google\.com\S+/.exec(String((e && e.message) || '')); return m ? m[0] : ''; };

// --- ค่ากลางของระบบ (1 read): cache_epoch + สถานะแบบประเมิน ---
const rxMeta = { epoch: 0, feedback: null, at: 0, loaded: false };
const rxLoadMeta = async (force) => {
  if (!force && rxMeta.loaded && Date.now() - rxMeta.at < 30000) return rxMeta;
  try {
    const sn = await db.collection('config').doc('app_meta').get();
    rxCountReads('config/app_meta', 1);
    const d = sn.exists ? (sn.data() || {}) : {};
    rxMeta.epoch = Number(d.cache_epoch) || 0;
    rxMeta.feedback = d.feedback || null;
  } catch (e) { console.warn('[rx] app_meta', e && e.message); }
  rxMeta.at = Date.now(); rxMeta.loaded = true;
  try { window.dispatchEvent(new CustomEvent('rx:meta', { detail: rxMeta })); } catch (e) { /* ignore */ }
  return rxMeta;
};

// --- ป้ายลบ (tombstones) ---
const rxSyncTombs = async (uid) => {
  const key = RX_CACHE_SCHEMA + '|' + uid + '|__tombs';
  let ent = await rxKv.get(key);
  if (!ent || ent.epoch !== rxMeta.epoch) ent = null;
  try {
    if (!ent) {
      // แคชใหม่: ไม่ต้องย้อนอ่านป้ายลบเก่า (คอลเลกชันอื่นจะโหลดเต็มอยู่แล้ว) จำแค่เวลาล่าสุด
      const s = await db.collection(RX_TOMB_COL).orderBy('deleted_at', 'desc').limit(1).get();
      rxCountReads(RX_TOMB_COL, 1);
      const top = s.docs[0];
      ent = { epoch: rxMeta.epoch, maxTs: (top && rxTsOf(top.data().deleted_at)) || [0, 0], rows: [] };
      await rxKv.set(key, ent);
    } else {
      const s = await db.collection(RX_TOMB_COL).where('deleted_at', '>', rxMakeTs(ent.maxTs)).get();
      rxCountReads(RX_TOMB_COL, Math.max(1, s.size));
      if (s.size) {
        const rows = ent.rows.slice(); let maxTs = ent.maxTs;
        s.docs.forEach(function (d) {
          const t = d.data(); const ts = rxTsOf(t.deleted_at); if (!ts) return;
          rows.push([String(t.col), String(t.doc_id), ts]);
          if (rxCmp(ts, maxTs) > 0) maxTs = ts;
        });
        const cutoff = Math.floor(Date.now() / 1000) - 60 * 86400;
        ent = { epoch: ent.epoch, maxTs: maxTs, rows: rows.filter(function (r) { return r[2][0] > cutoff; }) };
        await rxKv.set(key, ent);
      }
    }
  } catch (e) {
    console.warn('[rx] tombstones', e && e.message);
    if (!ent) ent = { rows: [] };
  }
  return ent.rows;
};

// --- ซิงก์ 1 คอลเลกชัน (หรือ 1 ขอบเขต เช่น ราย รพ.สต.) ---
// query: CollectionReference หรือ Query ที่กรองขอบเขตไว้แล้ว · scope: ชื่อขอบเขตในแคช
const rxSync = async (opt) => {
  const col = opt.col, uid = opt.uid || 'anon', scope = opt.scope || 'all';
  const field = opt.deltaField === undefined ? RX_DELTA_FIELDS[col] : opt.deltaField;
  const key = RX_CACHE_SCHEMA + '|' + uid + '|' + col + '|' + scope;
  const label = col + (scope !== 'all' ? '[' + scope + ']' : '');
  const ent = field ? await rxKv.get(key) : null;
  const usable = ent && ent.epoch === rxMeta.epoch && Array.isArray(ent.maxTs) && (Date.now() - ent.fullAt) < (opt.ttlMs || RX_FULL_TTL_MS) && !opt.forceFull;
  let rows = null, maxTs = null, fullAt = 0, changed = false;
  const tsOf = function (d) { return rxTsOf(d && d[field]); };
  if (usable) {
    try {
      const snap = await opt.query.where(field, '>', rxMakeTs(ent.maxTs)).get();
      rxCountReads(label + ' Δ', Math.max(1, snap.size));
      rows = new Map(ent.rows); maxTs = ent.maxTs; fullAt = ent.fullAt;
      snap.docs.forEach(function (d) {
        const data = rxEncode(d.data()); rows.set(d.id, data);
        const t = tsOf(data); if (t && rxCmp(t, maxTs) > 0) maxTs = t;
      });
      changed = snap.size > 0;
      rxMissingIndexes.delete(label);
    } catch (e) {
      if (!rxIndexError(e)) throw e;
      rxMissingIndexes.set(col, rxIndexLink(e));
      console.warn('[rx] ยังไม่มี index สำหรับดึงเฉพาะส่วนที่เปลี่ยนของ ' + label + ' — โหลดเต็มแทน', rxIndexLink(e));
      rows = null;
    }
  }
  if (!rows) {
    const snap = await opt.query.get();
    rxCountReads(label + ' full', Math.max(1, snap.size));
    rows = new Map(); maxTs = [0, 0]; fullAt = Date.now(); changed = true;
    snap.docs.forEach(function (d) {
      const data = rxEncode(d.data()); rows.set(d.id, data);
      const t = field ? tsOf(data) : null; if (t && rxCmp(t, maxTs) > 0) maxTs = t;
    });
  }
  // เอาเอกสารที่ถูกลบออก (ป้ายลบใหม่กว่าเวลาแก้ไขล่าสุดของเอกสาร)
  (opt.tombs || []).forEach(function (t) {
    if (t[0] !== col || !rows.has(t[1])) return;
    const ct = tsOf(rows.get(t[1]));
    if (!ct || rxCmp(t[2], ct) > 0) { rows.delete(t[1]); changed = true; }
  });
  if (field && changed) await rxKv.set(key, { epoch: rxMeta.epoch, fullAt: fullAt, maxTs: maxTs, rows: Array.from(rows.entries()) });
  const out = [];
  rows.forEach(function (d, id) { out.push(Object.assign({ id: id }, rxDecode(d))); });
  return out;
};

const rxClearLocalCache = () => rxKv.clear();
// แอดมิน: ให้ทุกเครื่องโหลดข้อมูลเต็มใหม่ในการเปิดครั้งถัดไป
const rxBumpEpoch = async () => {
  await db.collection('config').doc('app_meta').set({ cache_epoch: firebase.firestore.FieldValue.increment(1), cache_epoch_at: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await rxLoadMeta(true);
};
// เอกสารที่ถูกแก้จากนอกเว็บ (เช่น Bridge) แตะ updated_at ให้เครื่องอื่นเห็นการเปลี่ยน
const rxTouch = async (col, id) => {
  const f = RX_DELTA_FIELDS[col]; if (!f || !id) return;
  try { await db.collection(col).doc(String(id)).update({ [f]: firebase.firestore.FieldValue.serverTimestamp() }); }
  catch (e) { console.warn('[rx] touch ' + col + '/' + id, e && e.message); }
};

// --- Write hooks: เติมฟิลด์เวลา + เขียนป้ายลบ ---
const rxStampData = (col, data) => {
  const f = RX_DELTA_FIELDS[col];
  if (!f || !data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (Object.prototype.hasOwnProperty.call(data, f)) return data;
  const o = Object.assign({}, data); o[f] = firebase.firestore.FieldValue.serverTimestamp();
  return o;
};
const rxColOf = (ref) => { try { return (ref && ref.parent && ref.parent.id) || ''; } catch (e) { return ''; } };
const rxWriteTombs = (list) => {
  const items = (list || []).filter(function (x) { return x && RX_DELTA_FIELDS[x[0]]; });
  if (!items.length || !auth.currentUser) return Promise.resolve();
  try {
    const b = db.batch();
    items.forEach(function (x) {
      b.set(db.collection(RX_TOMB_COL).doc(), { col: x[0], doc_id: String(x[1]), deleted_at: firebase.firestore.FieldValue.serverTimestamp(), by: auth.currentUser.uid });
    });
    return b.commit().catch(function (e) { console.warn('[rx] tombstone write failed (deploy rules v6.2?)', e && e.message); });
  } catch (e) { return Promise.resolve(); }
};
const rxInstallWriteHooks = () => {
  if (rxInstallWriteHooks.done) return;
  rxInstallWriteHooks.done = true;
  const patchWriter = function (proto, kind) {
    if (!proto || proto.__rxHooked) return;
    proto.__rxHooked = true;
    const oSet = proto.set, oUpd = proto.update, oDel = proto['delete'];
    if (kind === 'ref') {
      proto.set = function (data, options) { return oSet.call(this, rxStampData(rxColOf(this), data), options); };
      proto.update = function (data) {
        if (arguments.length === 1) return oUpd.call(this, rxStampData(rxColOf(this), data));
        return oUpd.apply(this, arguments);
      };
      proto['delete'] = function () {
        const col = rxColOf(this), id = this.id;
        return oDel.call(this).then(function (r) { rxWriteTombs([[col, id]]); return r; });
      };
    } else {
      proto.set = function (ref, data, options) { return oSet.call(this, ref, rxStampData(rxColOf(ref), data), options); };
      proto.update = function (ref, data) {
        if (arguments.length === 2) return oUpd.call(this, ref, rxStampData(rxColOf(ref), data));
        return oUpd.apply(this, arguments);
      };
      proto['delete'] = function (ref) {
        if (!this.__rxTombs) this.__rxTombs = [];
        this.__rxTombs.push([rxColOf(ref), ref.id]);
        return oDel.call(this, ref);
      };
      if (kind === 'batch' && proto.commit) {
        const oCommit = proto.commit;
        proto.commit = function () {
          const tombs = this.__rxTombs || [];
          return oCommit.call(this).then(function (r) { rxWriteTombs(tombs); return r; });
        };
      }
    }
  };
  try {
    patchWriter(Object.getPrototypeOf(db.collection('_rx').doc('_rx')), 'ref');
    patchWriter(Object.getPrototypeOf(db.batch()), 'batch');
    const oRun = db.runTransaction.bind(db);
    db.runTransaction = function (fn, options) {
      let lastTx = null;
      return oRun(function (tx) {
        patchWriter(Object.getPrototypeOf(tx), 'tx');
        tx.__rxTombs = []; lastTx = tx;
        return fn(tx);
      }, options).then(function (res) { if (lastTx) rxWriteTombs(lastTx.__rxTombs); return res; });
    };
  } catch (e) { console.warn('[rx] write hooks not installed', e); }
};
rxInstallWriteHooks();

// ════════════════════════════════════════════════════════════
// v6.2 แบบประเมินการใช้งาน (ปุ่มลอยมุมขวาล่าง + ชวนประเมินหลังทำงานเสร็จ)
//  config/app_meta.feedback = { round_id, round_no, title, open, roles[] }  ← อ่านพร้อม cache_epoch (ไม่เสีย read เพิ่ม)
//  feedback_rounds/{id}                       ← แอดมินสร้าง/เปิด/ปิดรอบ
//  feedback_responses/{round_id}__{uid}       ← 1 คน 1 คำตอบต่อรอบ (แก้ไขได้)
// ════════════════════════════════════════════════════════════
const FEEDBACK_FUNCTIONS = {
  hospital: [
    ['rpst_round', 'เลือกรอบเบิก'], ['rpst_upload', 'อัปโหลด รบ.301 / ดึงยอดใช้'], ['rpst_calc', 'ระบบคำนวณจำนวนเบิก'],
    ['rpst_print', 'พิมพ์ใบเบิก / แก้ตำแหน่งผู้ลงนาม'], ['rpst_stock', 'ชั้นยาของฉัน / คลังยา'], ['rpst_ncds', 'ยา NCDs ตามนัด'],
    ['rpst_vaccine', 'เบิกวัคซีน ว.3/1'], ['rpst_history', 'ประวัติการใช้ยา']
  ],
  dept: [
    ['int_round', 'เลือกรอบเบิก'], ['int_search', 'ค้นหายา / ใส่จำนวน (แพ็ค-หน่วยย่อย)'], ['int_template', 'ดึงรายการจากใบล่าสุด / ยาที่เบิกบ่อย'],
    ['int_print', 'พิมพ์ใบเบิก'], ['int_track', 'ติดตามสถานะใบเบิก']
  ],
  pharmacy: [
    ['int_round', 'เลือกรอบเบิก'], ['ph_hosxp', 'ดึงยอดใช้จาก HOSxP'], ['ph_suggest', 'ระบบแนะนำจำนวน / ข้ามรอบ'],
    ['ph_credit', 'เครดิต / สต็อกห้องยา'], ['int_print', 'พิมพ์ใบเบิก'], ['int_track', 'ติดตามสถานะใบเบิก']
  ],
  admin: [
    ['adm_review', 'ตรวจ / อนุมัติใบเบิก รพ.สต.'], ['adm_internal', 'คิวใบเบิกภายใน รพ.'], ['adm_invs', 'ส่งเข้า INVS'],
    ['adm_master', 'จัดการฐานข้อมูลยา / หน่วยงาน'], ['adm_rounds', 'รอบเบิก'], ['adm_reports', 'สรุปการเบิก / รายงาน'], ['adm_map', 'VMI Map']
  ]
};
const FEEDBACK_ROLES = { hospital: 'รพ.สต.', dept: 'หน่วยงาน', pharmacy: 'ห้องยา', admin: 'แอดมิน' };
const FEEDBACK_SCALE = [[1, 'ต้องปรับ'], [2, 'พอใช้'], [3, 'ปานกลาง'], [4, 'ดี'], [5, 'ดีมาก']];
const FEEDBACK_TIME = [['much_faster', 'เร็วขึ้นมาก'], ['faster', 'เร็วขึ้น'], ['same', 'เท่าเดิม'], ['slower', 'ช้าลง']];
const rxTaskDone = (fn) => { try { window.dispatchEvent(new CustomEvent('rx:task-done', { detail: { fn: fn } })); } catch (e) { /* ignore */ } };
const rxFbStore = {
  get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
};

// props: { user, unitId, unitName, page }
const RxFeedbackWidget = (props) => {
  const h = React.createElement;
  const user = props.user || {};
  const role = normalizeUserRole(user.role);
  const [meta, setMeta] = React.useState(rxMeta.loaded ? rxMeta.feedback : null);
  const [done, setDone] = React.useState(null); // null=ยังไม่รู้, true/false
  const [open, setOpen] = React.useState(false);
  const [prompt, setPrompt] = React.useState(null); // fnKey ที่ทำเสร็จ
  const [hidden, setHidden] = React.useState(false);
  const [focusFn, setFocusFn] = React.useState('');
  const fb = meta && meta.open && meta.round_id && (!Array.isArray(meta.roles) || !meta.roles.length || meta.roles.indexOf(role) >= 0) ? meta : null;
  const docId = fb ? (fb.round_id + '__' + user.uid) : '';
  const doneKey = 'rx_fb_done_' + docId;

  React.useEffect(function () {
    const onMeta = function (e) { setMeta(e.detail && e.detail.feedback ? Object.assign({}, e.detail.feedback) : null); };
    window.addEventListener('rx:meta', onMeta);
    if (!rxMeta.loaded) rxLoadMeta().then(function () { setMeta(rxMeta.feedback ? Object.assign({}, rxMeta.feedback) : null); });
    return function () { window.removeEventListener('rx:meta', onMeta); };
  }, []);
  React.useEffect(function () {
    if (!fb || !user.uid) return;
    setHidden(rxFbStore.sget('rx_fb_hide_' + fb.round_id) === '1');
    if (rxFbStore.get(doneKey) === '1') { setDone(true); return; }
    let alive = true;
    db.collection('feedback_responses').doc(docId).get()
      .then(function (sn) { rxCountReads('feedback_responses[own]', 1); if (!alive) return; setDone(sn.exists); if (sn.exists) rxFbStore.set(doneKey, '1'); })
      .catch(function () { if (alive) setDone(false); });
    return function () { alive = false; };
  }, [docId]);
  React.useEffect(function () {
    if (!fb) return;
    const onDone = function (e) {
      const fn = (e.detail && e.detail.fn) || '';
      if (done !== false) return;                                   // ตอบแล้ว/ยังไม่รู้ → ไม่รบกวน
      const promptedKey = 'rx_fb_prompted_' + fb.round_id;
      if (rxFbStore.sget(promptedKey) === '1') return;               // ชวนแล้วใน session นี้
      const day = new Date().toISOString().slice(0, 10);
      if (rxFbStore.get('rx_fb_prompt_day_' + fb.round_id) === day) return; // ชวนวันละครั้ง
      rxFbStore.sset(promptedKey, '1'); rxFbStore.set('rx_fb_prompt_day_' + fb.round_id, day);
      setTimeout(function () { setPrompt(fn || 'general'); }, 1200);
    };
    window.addEventListener('rx:task-done', onDone);
    return function () { window.removeEventListener('rx:task-done', onDone); };
  }, [fb && fb.round_id, done]);

  if (!fb || !user.uid) return null;
  const openForm = function (fn) { setFocusFn(fn || ''); setPrompt(null); setOpen(true); };
  const pending = done === false;

  const fab = hidden ? h('button', {
    type: 'button', onClick: function () { setHidden(false); rxFbStore.sset('rx_fb_hide_' + fb.round_id, '0'); },
    title: 'แสดงปุ่มประเมินการใช้งาน', 'aria-label': 'แสดงปุ่มประเมินการใช้งาน',
    className: 'no-print fixed bottom-6 right-0 z-[115] w-3 h-12 rounded-l-lg bg-indigo-500/70 hover:bg-indigo-600 transition'
  }) : h('div', { className: 'no-print fixed bottom-6 right-6 z-[115] group flex items-center' },
    h('button', {
      type: 'button', onClick: function () { setHidden(true); rxFbStore.sset('rx_fb_hide_' + fb.round_id, '1'); },
      'aria-label': 'ซ่อนปุ่มประเมิน', title: 'ซ่อน (กลับมาได้ที่แถบเล็กขอบขวา)',
      className: 'mr-1 w-6 h-6 rounded-full bg-white border text-slate-400 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100 transition shadow'
    }, '×'),
    h('button', {
      type: 'button', id: 'rx-feedback-fab', onClick: function () { openForm(''); },
      'aria-label': 'ประเมินการใช้งาน รอบที่ ' + fb.round_no,
      className: 'relative flex items-center gap-2 h-12 pl-3.5 pr-3.5 group-hover:pr-4 rounded-full shadow-xl font-bold transition-all ' + (pending ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-white text-indigo-700 border border-indigo-200')
    },
      h('i', { className: 'fa-solid ' + (pending ? 'fa-star-half-stroke' : 'fa-circle-check') }),
      h('span', { className: 'max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-[16rem] transition-all duration-300 text-sm' }, pending ? 'ประเมินการใช้งาน · รอบที่ ' + fb.round_no : 'ประเมินแล้ว · แก้ไขคำตอบ'),
      pending ? h('span', { className: 'absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-white' }) : null
    )
  );

  const promptCard = prompt ? h('div', { role: 'dialog', 'aria-label': 'ชวนประเมินการใช้งาน', className: 'no-print fixed bottom-24 right-6 z-[116] w-[min(22rem,calc(100vw-3rem))] bg-white rounded-2xl shadow-2xl border border-indigo-100 p-4 animate-fade-in' },
    h('div', { className: 'flex items-start gap-3' },
      h('div', { className: 'w-9 h-9 shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center' }, h('i', { className: 'fa-solid fa-check' })),
      h('div', { className: 'text-sm' },
        h('div', { className: 'font-extrabold text-slate-800' }, 'ทำรายการเสร็จเรียบร้อย'),
        h('div', { className: 'text-slate-500 mt-0.5' }, 'ช่วยประเมินการใช้งานรอบที่ ' + fb.round_no + ' (ประมาณ 1 นาที) เพื่อปรับปรุงระบบให้ใช้ง่ายขึ้น')
      )
    ),
    h('div', { className: 'flex justify-end gap-2 mt-3' },
      h('button', { type: 'button', onClick: function () { setPrompt(null); }, className: 'px-3 py-1.5 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-100' }, 'ไว้ทีหลัง'),
      h('button', { type: 'button', id: 'rx-feedback-prompt-go', onClick: function () { openForm(prompt); }, className: 'px-4 py-1.5 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700' }, 'ประเมินเลย')
    )
  ) : null;

  return h(React.Fragment, null, fab, promptCard,
    open ? h(RxFeedbackForm, {
      fb: fb, user: user, role: role, docId: docId, focusFn: focusFn, unitId: props.unitId, unitName: props.unitName, page: props.page,
      onClose: function () { setOpen(false); },
      onSaved: function () { rxFbStore.set(doneKey, '1'); setDone(true); }
    }) : null);
};

const RxFeedbackForm = (p) => {
  const h = React.createElement;
  const fns = FEEDBACK_FUNCTIONS[p.role] || FEEDBACK_FUNCTIONS.hospital;
  const [ans, setAns] = React.useState({ ratings: {}, overall: 0, ease: 0, speed: 0, time_saving: '', liked: '', improve: '', problems: '' });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [err, setErr] = React.useState('');
  React.useEffect(function () {
    let alive = true;
    db.collection('feedback_responses').doc(p.docId).get().then(function (sn) {
      rxCountReads('feedback_responses[own]', 1);
      if (alive && sn.exists) { const d = sn.data() || {}; setAns(function (a) { return Object.assign({}, a, { ratings: d.ratings || {}, overall: d.overall || 0, ease: d.ease || 0, speed: d.speed || 0, time_saving: d.time_saving || '', liked: d.liked || '', improve: d.improve || '', problems: d.problems || '' }); }); }
    }).catch(function () { /* ยังไม่มีคำตอบ */ }).finally(function () { if (alive) setLoading(false); });
    const onKey = function (e) { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return function () { alive = false; window.removeEventListener('keydown', onKey); };
  }, []);
  React.useEffect(function () {
    if (loading || !p.focusFn) return;
    const el = document.getElementById('rx-fb-row-' + p.focusFn);
    if (el) el.scrollIntoView({ block: 'center' });
  }, [loading]);
  const setRating = function (k, v) { setAns(function (a) { const r = Object.assign({}, a.ratings); r[k] = v; return Object.assign({}, a, { ratings: r }); }); };
  const scaleRow = function (id, label, value, onPick, opts) {
    opts = opts || {};
    return h('div', { key: id, id: 'rx-fb-row-' + id, className: 'flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 border-b border-slate-100 ' + (p.focusFn === id ? 'bg-indigo-50/70 -mx-3 px-3 rounded-lg' : '') },
      h('div', { className: 'flex-1 min-w-[11rem] text-sm font-semibold text-slate-700' }, label),
      h('div', { className: 'flex gap-1', role: 'radiogroup', 'aria-label': label },
        FEEDBACK_SCALE.map(function (sc) {
          const on = value === sc[0];
          return h('button', { key: sc[0], type: 'button', role: 'radio', 'aria-checked': on, title: sc[1], onClick: function () { onPick(sc[0]); },
            className: 'w-10 h-9 rounded-lg text-sm font-extrabold border transition ' + (on ? 'bg-indigo-600 border-indigo-600 text-white shadow' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300') }, String(sc[0]));
        }),
        opts.na ? h('button', { type: 'button', role: 'radio', 'aria-checked': value === 0, onClick: function () { onPick(0); },
          className: 'h-9 px-2.5 rounded-lg text-xs font-bold border transition ' + (value === 0 ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400') }, 'ไม่ได้ใช้') : null
      )
    );
  };
  const rated = fns.filter(function (f) { return ans.ratings[f[0]] !== undefined; }).length;
  const canSave = ans.overall > 0;
  const submit = async function () {
    if (!canSave) { setErr('กรุณาให้คะแนน "ความพึงพอใจโดยรวม" อย่างน้อย 1 ข้อ'); return; }
    setSaving(true); setErr('');
    try {
      const fv = firebase.firestore.FieldValue;
      await db.collection('feedback_responses').doc(p.docId).set({
        round_id: p.fb.round_id, round_no: Number(p.fb.round_no) || 0, uid: p.user.uid, name: safeText(p.user.name), role: p.role,
        unit_id: safeText(p.unitId), unit_name: safeText(p.unitName), page: safeText(p.page),
        ratings: ans.ratings, overall: ans.overall, ease: ans.ease || 0, speed: ans.speed || 0, time_saving: ans.time_saving,
        liked: safeText(ans.liked).slice(0, 2000), improve: safeText(ans.improve).slice(0, 2000), problems: safeText(ans.problems).slice(0, 2000),
        app_version: APP_VERSION, updated_at: fv.serverTimestamp()
      }, { merge: true });
      setSaved(true); p.onSaved();
    } catch (e) { setErr('ส่งไม่สำเร็จ: ' + ((e && e.message) || e)); }
    finally { setSaving(false); }
  };
  const textArea = function (key, label, ph) {
    return h('label', { className: 'block' },
      h('span', { className: 'text-sm font-bold text-slate-600' }, label),
      h('textarea', { id: 'rx-fb-' + key, rows: 2, value: ans[key], placeholder: ph, onChange: function (e) { const v = e.target.value; setAns(function (a) { const o = Object.assign({}, a); o[key] = v; return o; }); },
        className: 'mt-1 w-full p-2.5 border border-slate-200 rounded-xl text-sm resize-y focus:ring-2 focus:ring-indigo-300 outline-none' }));
  };
  const body = saved ? h('div', { className: 'py-10 text-center space-y-3' },
    h('div', { className: 'w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl' }, h('i', { className: 'fa-solid fa-heart' })),
    h('div', { className: 'text-xl font-extrabold text-slate-800' }, 'ขอบคุณสำหรับการประเมิน'),
    h('div', { className: 'text-sm text-slate-500' }, 'คำตอบถูกบันทึกแล้ว แก้ไขได้ตลอดช่วงที่เปิดรับรอบนี้ ที่ปุ่มมุมขวาล่าง'),
    h('button', { type: 'button', onClick: p.onClose, className: 'mt-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold' }, 'ปิด')
  ) : loading ? h('div', { className: 'py-16 flex justify-center' }, h('div', { className: 'loader' })) : h('div', { className: 'space-y-5' },
    h('section', null,
      h('div', { className: 'flex items-baseline justify-between gap-2' },
        h('h4', { className: 'font-extrabold text-slate-800' }, '1. ฟังก์ชันที่ใช้งาน'),
        h('span', { className: 'text-xs text-slate-400' }, '1 = ต้องปรับ · 5 = ดีมาก · ให้คะแนนแล้ว ' + rated + '/' + fns.length)),
      h('div', null, fns.map(function (f) { return scaleRow(f[0], f[1], ans.ratings[f[0]], function (v) { setRating(f[0], v); }, { na: true }); }))
    ),
    h('section', null,
      h('h4', { className: 'font-extrabold text-slate-800' }, '2. ภาพรวม'),
      scaleRow('overall', 'ความพึงพอใจโดยรวม *', ans.overall, function (v) { setAns(function (a) { return Object.assign({}, a, { overall: v }); }); }),
      scaleRow('ease', 'ใช้งานง่าย / เข้าใจง่าย', ans.ease, function (v) { setAns(function (a) { return Object.assign({}, a, { ease: v }); }); }),
      scaleRow('speed', 'ความเร็วในการเปิด / บันทึก', ans.speed, function (v) { setAns(function (a) { return Object.assign({}, a, { speed: v }); }); }),
      h('div', { className: 'py-2.5' },
        h('div', { className: 'text-sm font-semibold text-slate-700 mb-1.5' }, 'เทียบกับวิธีเดิม ระบบนี้ทำให้งานเบิก'),
        h('div', { className: 'flex flex-wrap gap-1.5', role: 'radiogroup' }, FEEDBACK_TIME.map(function (t) {
          const on = ans.time_saving === t[0];
          return h('button', { key: t[0], type: 'button', role: 'radio', 'aria-checked': on, onClick: function () { setAns(function (a) { return Object.assign({}, a, { time_saving: t[0] }); }); },
            className: 'px-3.5 h-9 rounded-full text-sm font-bold border transition ' + (on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300') }, t[1]);
        }))
      )
    ),
    h('section', { className: 'space-y-3' },
      h('h4', { className: 'font-extrabold text-slate-800' }, '3. ข้อเสนอแนะ'),
      textArea('liked', 'สิ่งที่ชอบ / ช่วยงานได้จริง', 'เช่น ไม่ต้องคีย์ยอดใช้เอง'),
      textArea('improve', 'อยากให้ปรับปรุง / ฟังก์ชันที่อยากได้', 'เช่น อยากให้แจ้งเตือนเมื่อใบเบิกได้รับยาแล้ว'),
      textArea('problems', 'ปัญหาที่พบ (ถ้ามี)', 'บอกหน้าที่ใช้และสิ่งที่เกิดขึ้น')
    ),
    err ? h('div', { className: 'text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3' }, err) : null,
    h('div', { className: 'flex flex-wrap justify-between items-center gap-2 pt-3 border-t' },
      h('span', { className: 'text-xs text-slate-400' }, 'ผู้ดูแลระบบเห็นชื่อและหน่วยของผู้ตอบ เพื่อติดต่อกลับเมื่อมีปัญหา'),
      h('div', { className: 'flex gap-2' },
        h('button', { type: 'button', onClick: p.onClose, className: 'px-4 py-2.5 rounded-xl bg-slate-100 font-bold text-slate-600' }, 'ไว้ทีหลัง'),
        h('button', { type: 'button', id: 'rx-fb-submit', onClick: submit, disabled: saving, className: 'px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50' }, saving ? 'กำลังส่ง...' : 'ส่งแบบประเมิน')
      )
    )
  );
  return h('div', { className: 'fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4', onMouseDown: function (e) { if (e.target === e.currentTarget && !saving) p.onClose(); } },
    h('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'แบบประเมินการใช้งาน', className: 'bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl' },
      h('div', { className: 'sticky top-0 bg-white/95 backdrop-blur border-b px-5 py-4 flex items-start justify-between gap-3 z-10' },
        h('div', null,
          h('div', { className: 'text-xs font-bold text-indigo-600 tracking-wide' }, 'รอบที่ ' + p.fb.round_no + ' · ' + (FEEDBACK_ROLES[p.role] || '')),
          h('h3', { className: 'text-lg font-extrabold text-slate-800' }, p.fb.title || 'แบบประเมินการใช้งาน Sawee Rxfill')),
        h('button', { type: 'button', onClick: p.onClose, 'aria-label': 'ปิด', className: 'w-8 h-8 rounded-full border text-slate-400 hover:text-red-500' }, h('i', { className: 'fa-solid fa-xmark' }))
      ),
      h('div', { className: 'px-5 py-4' }, body)
    )
  );
};

// ─── v6.3 ปฏิทินเบิก / ประมาณการใช้ยา ───────────────────
const THAI_WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const THAI_WEEKDAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const thaiWeekday = (ymd, short) => { const d = parseYmd(ymd); return d ? (short ? THAI_WEEKDAYS_SHORT : THAI_WEEKDAYS)[d.getDay()] : ''; };
const thaiDateShort = (ymd) => { const d = parseYmd(ymd); return d ? (d.getDate() + ' ' + THAI_MONTHS_SHORT[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(2)) : ''; };
// วันส่งสมุดเบิก (ล่วงหน้า N วันก่อนวันเบิก)
const ROUND_SUBMIT_LEAD_DAYS = 2;
const roundSubmitBy = (r) => r && r.round_date ? addDaysYmd(r.round_date, -ROUND_SUBMIT_LEAD_DAYS) : '';

// ใบพิมพ์ "ประมาณการใช้ยา" (ไม่ใช่ใบเบิก) — rows: [{ drugId, name, unit, packSize, price, type, location, usage, dailyAvg, projected, packs }]
const buildUsageEstimateHtml = (opts) => {
  const esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const num = function (v, d) { return toNonNegativeNumber(v).toLocaleString('th-TH', { maximumFractionDigits: d == null ? 0 : d }); };
  const money = function (v) { return toNonNegativeNumber(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const types = opts.drugTypes || DEFAULT_DRUG_TYPES;
  const groups = new Map();
  (opts.rows || []).forEach(function (r) { const k = String(r.type || '1'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const order = Array.from(groups.keys()).sort(function (a, b) { return Number(a) - Number(b); });
  let i = 0, grand = 0;
  const body = order.map(function (k) {
    const list = groups.get(k).slice().sort(function (a, b) { return compareByLocation(a.location, a.name, b.location, b.name); });
    const sub = list.reduce(function (s, r) { return s + toNonNegativeNumber(r.packs) * toNonNegativeNumber(r.price); }, 0); grand += sub;
    return '<tr class="grp"><td colspan="9"><span>' + esc(types[k] || ('หมวด ' + k)) + ' (' + list.length + ' รายการ)</span><span class="sub">' + money(sub) + ' บาท</span></td></tr>' +
      list.map(function (r) {
        i += 1; const pack = safePackSize(r.packSize);
        return '<tr><td class="c">' + i + '</td><td>' + esc(r.name) + '<div class="code">' + esc(r.drugId) + (r.location ? ' · ' + esc(r.location) : '') + '</div></td>' +
          '<td>' + esc(r.unit) + (pack > 1 ? ' บรรจุ ' + num(pack) : '') + '</td>' +
          '<td class="r">' + num(r.usage) + '</td><td class="r">' + num(r.usage / pack, 2) + '</td><td class="r">' + num(r.dailyAvg, 1) + '</td>' +
          '<td class="r">' + num(r.projected) + '</td><td class="r b">' + num(r.packs) + '</td><td class="r">' + money(toNonNegativeNumber(r.packs) * toNonNegativeNumber(r.price)) + '</td></tr>';
      }).join('');
  }).join('');
  const now = new Date();
  const stamp = now.getDate() + '/' + (now.getMonth() + 1) + '/' + (now.getFullYear() + 543) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  return '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ประมาณการใช้ยา ' + esc(opts.deptName) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<style>@page{size:A4;margin:12mm 10mm}body{font-family:Sarabun,"TH Sarabun New",sans-serif;font-size:12.5px;color:#000;margin:0}h1{font-size:17px;text-align:center;margin:0 0 2px}.meta{text-align:center;margin-bottom:8px}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:3px 5px;vertical-align:top}th{background:#eee;font-size:11.5px}td{font-size:11.5px}.r{text-align:right;white-space:nowrap}.c{text-align:center}.b{font-weight:700}' +
    '.code{font-family:Consolas,monospace;font-size:9.5px;color:#444}.grp td{background:#f4f4f4;font-weight:700}.grp .sub{float:right}.tot td{font-weight:700;font-size:13px}.note{margin-top:6px;font-size:11px;color:#333}.stamp{position:fixed;bottom:0;right:0;font-size:9px;color:#666}' +
    'thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body>' +
    '<h1>ประมาณการใช้ยา — ' + esc(opts.deptName) + '</h1>' +
    '<div class="meta">ยอดใช้จริงจาก HOSxP ' + esc(thaiDateLong(opts.from)) + ' ถึง ' + esc(thaiDateLong(opts.to)) + ' (' + num(opts.days) + ' วัน) · ประมาณการสำหรับ <b>' + num(opts.projectDays) + ' วัน</b>' + (opts.bufferPct ? ' + เผื่อ ' + num(opts.bufferPct) + '%' : '') + '</div>' +
    '<table><thead><tr><th style="width:4%">ที่</th><th>รายการ</th><th style="width:12%">หน่วย / บรรจุ</th><th style="width:9%">ใช้จริง<br>(หน่วยย่อย)</th><th style="width:8%">ใช้จริง<br>(หน่วยใหญ่)</th><th style="width:7%">เฉลี่ย/วัน</th><th style="width:9%">ประมาณการ<br>(หน่วยย่อย)</th><th style="width:8%">ต้องเบิก<br>(หน่วยใหญ่)</th><th style="width:10%">มูลค่า (บาท)</th></tr></thead>' +
    '<tbody>' + (body || '<tr><td colspan="9" class="c">ไม่มีรายการ</td></tr>') + '</tbody>' +
    '<tfoot><tr class="tot"><td colspan="8" class="r">รวม ' + i + ' รายการ · มูลค่าประมาณ</td><td class="r">' + money(grand) + '</td></tr></tfoot></table>' +
    '<div class="note">หมายเหตุ: เอกสารประมาณการเพื่อวางแผน ไม่ใช่ใบเบิก · หน่วยใหญ่ = จำนวนหน่วยย่อย ÷ ขนาดบรรจุ (ปัดขึ้นเป็นจำนวนเต็มในช่องต้องเบิก)' + (opts.unmatched ? ' · ยา HOSxP ที่ยังจับคู่รหัส INVS ไม่ได้ ' + opts.unmatched + ' รายการ ไม่รวมในตาราง' : '') + '</div>' +
    '<div class="stamp">พิมพ์เมื่อ: ' + stamp + '</div></body></html>';
};

// ใบ "ประมาณการใช้ยา" ของห้องยา จากหน้าสร้างใบเบิก (สำหรับพิมพ์มาตรวจ — ไม่ใช่การส่งใบเบิก)
// หัวตารางแบบใบเบิก รพ.สต. · เว้นช่องจำนวนจ่าย/มูลค่า/คงเหลือ ให้กรอกด้วยมือ
// rows: [{ drugId, name, unit, packSize, price, type, target, usage, credit }]
const buildPharmacyEstimateFormHtml = (opts) => {
  const esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  const q = function (v, pack) { return formatQty(toNonNegativeNumber(v), safePackSize(pack)); };
  const types = opts.drugTypes || DEFAULT_DRUG_TYPES;
  const groups = new Map();
  (opts.rows || []).forEach(function (r) { const k = String(r.type || '1'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const order = Array.from(groups.keys()).sort(function (a, b) { return Number(a) - Number(b); });
  let i = 0;
  const body = order.map(function (k) {
    return '<tr class="grp"><td colspan="12">' + esc(types[k] || ('หมวด ' + k)) + '</td></tr>' + groups.get(k).map(function (r) {
      i += 1;
      return '<tr><td class="c">' + i + '</td><td>' + esc(r.name) + '</td><td class="c">' + esc(r.unit) + '</td><td class="c">' + esc(safePackSize(r.packSize)) + '</td>' +
        '<td class="c">' + q(r.target, r.packSize) + '</td><td class="c">' + q(r.usage, r.packSize) + '</td><td class="c">' + q(r.credit, r.packSize) + '</td>' +
        '<td class="fill"></td><td class="r">' + toNonNegativeNumber(r.price).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td><td class="fill"></td><td class="fill"></td>' +
        '<td class="c code">' + esc(r.drugId) + '</td></tr>';
    }).join('');
  }).join('');
  const now = new Date();
  const stamp = now.getDate() + '/' + (now.getMonth() + 1) + '/' + (now.getFullYear() + 543) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  return '<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ประมาณการใช้ยา ' + esc(opts.deptName) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">' +
    '<style>@page{size:A4;margin:10mm 8mm}body{font-family:Sarabun,"TH Sarabun New",sans-serif;font-size:12.5px;color:#000;margin:0}' +
    'h1{font-size:16px;text-align:center;margin:0}.sub{text-align:center;margin:2px 0 4px}.meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px 16px;margin-bottom:6px}' +
    '.badge{display:inline-block;border:1px solid #000;padding:0 6px;font-weight:700;font-size:11px}' +
    'table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #000;padding:2px 3px;font-size:10.5px;vertical-align:middle;word-wrap:break-word}' +
    'th{background:#e5e5e5;font-weight:700;text-align:center;line-height:1.2}.c{text-align:center}.r{text-align:right}.code{font-family:Consolas,monospace;font-size:9.5px}' +
    '.grp td{background:#f2f2f2;font-weight:700}.fill{background:#fff}thead{display:table-header-group}tr{page-break-inside:avoid}' +
    '.note{font-size:10px;margin-top:4px}.sigs{display:flex;justify-content:space-around;margin-top:22px;font-size:12px}.sigs div{text-align:center}.stamp{position:fixed;bottom:0;right:0;font-size:9px;color:#555}</style></head><body>' +
    '<h1>ใบประมาณการใช้ยา — ' + esc(opts.deptName) + '</h1>' +
    '<div class="sub"><span class="badge">สำหรับตรวจสอบ · ยังไม่ใช่ใบเบิก (ยังไม่ส่ง VMI)</span></div>' +
    '<div class="meta"><span>ยอดใช้ HOSxP ' + esc(thaiDateLong(opts.from)) + ' ถึง ' + esc(thaiDateLong(opts.to)) + ' (' + esc(opts.days) + ' วัน)</span>' +
    '<span>สำรอง (Target) ' + esc(opts.coverDays) + ' วัน' + (opts.roundTarget ? ' · ปัด Target เป็นจำนวนเต็มหน่วยบรรจุ' : '') + '</span>' +
    (opts.roundLabel ? '<span>' + esc(opts.roundLabel) + '</span>' : '') + '</div>' +
    '<table><colgroup><col style="width:4%"><col style="width:25%"><col style="width:6%"><col style="width:5%"><col style="width:7%"><col style="width:7%"><col style="width:7%">' +
    '<col style="width:12%"><col style="width:5%"><col style="width:8%"><col style="width:8%"><col style="width:6%"></colgroup>' +
    '<thead><tr><th>ที่</th><th>ชื่อยา/เวชภัณฑ์</th><th>หน่วย</th><th>บรรจุ</th><th>Target Stock</th><th>ยอดใช้</th><th>เครดิต</th><th>จำนวนจ่าย</th><th>ราคา/<br>หน่วย</th><th>มูลค่า<br>(บาท)</th><th>คงเหลือ</th><th>รหัส</th></tr></thead>' +
    '<tbody>' + (body || '<tr><td colspan="12" class="c">ไม่มีรายการ</td></tr>') + '</tbody></table>' +
    '<div class="note">หมายเหตุ: จำนวนเต็มคือจำนวนหน่วยเบิกหลัก ตัวเลขในวงเล็บคือจำนวนที่แตกจากหน่วยเบิกหลัก · เครดิต = คงเหลือในระบบหลังหักยอดใช้ช่วงนี้ · ช่องจำนวนจ่าย/มูลค่า/คงเหลือ เว้นไว้ให้กรอกเมื่อตรวจ</div>' +
    '<div class="sigs"><div>ลงชื่อ ..................................... ผู้ประมาณการ</div><div>ลงชื่อ ..................................... ผู้ตรวจสอบ</div></div>' +
    '<div class="stamp">พิมพ์เมื่อ: ' + stamp + '</div></body></html>';
};
