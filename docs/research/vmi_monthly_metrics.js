/*
 * ดึงตัวชี้วัดรายเดือนต่อ รพ.สต. จาก VMI (Sawee Rxfill) ให้เทียบกับ baseline "6 Sheet เก็บข้อมูลโครงการฯ"
 * อ่านอย่างเดียว — ไม่เขียน Firestore · ไม่ส่งข้อมูลออกนอกเครื่อง (ดาวน์โหลดเป็น CSV ในเครื่องเท่านั้น)
 *
 * วิธีใช้: เปิด app.html แล้ว login เป็นแอดมิน → กด F12 → แท็บ Console → วางสคริปต์ทั้งไฟล์ → Enter
 *         ได้ตารางใน Console + ไฟล์ vmi_monthly_metrics_YYYYMMDD.csv (เปิดด้วย Excel/Google Sheets ได้)
 *
 * ตัวชี้วัด (คอลัมน์ CSV) — ดูหมายเหตุการจับคู่กับ baseline ใน docs/research/baseline_summary.md
 *  m1_usage_value        มูลค่าการใช้ยา = ยอดใช้ รบ.301 ในใบเบิกรอบนั้น × ราคา (ไม่รวมวัคซีน หมวด 6)
 *  m1_dispense_value     (อ้างอิง) มูลค่าเบิก/จ่าย = (จ่ายใหม่ + ฉุกเฉิน) × ราคา
 *  m2_stock_at_req       มูลค่าคงเหลือ ณ วันทำใบเบิก (ก่อนเติม) = ยอดตรวจนับในใบ ถ้าไม่มี = ยอดยกมา − ยอดใช้
 *  m2_stock_count        มูลค่าคงเหลือจากการตรวจนับ (vmi_stock_counts ครั้งล่าสุดของเดือน) — ว่าง = เดือนนั้นไม่ได้นับ
 *  m3_emergency_docs     ตัวแทน "ครั้งที่ยาขาด" = จำนวนใบเบิกฉุกเฉิน (ใบ ฉ) ที่ไม่ยกเลิก
 *  m4_emergency_items    ตัวแทน "รายการยาขาด" = จำนวนรายการยาในใบ ฉ
 *  m5_expired_items      รายการยาหมดอายุที่ส่งคืน (stock_returns เหตุผล หมดอายุ หรือ EXP ≤ วันคืน)
 *  m6_expired_value      มูลค่ายาหมดอายุที่ส่งคืน
 *  req_status / req_id   สถานะ/เลขใบเบิกของรอบนั้น
 */
(async () => {
  // ===== ตั้งค่า =====
  const MONTHS = [[2026, 8], [2026, 9], [2026, 10], [2026, 11], [2026, 12]]; // ค.ศ., เดือน — ส.ค.–ธ.ค. 2569 (ธ.ค. เผื่อเลื่อนเดือนยอดใช้)
  const REQ_OK = ['Pending', 'Approving', 'ApprovalFailed', 'Completed'];   // สถานะใบเบิกที่นับ
  // ==================
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const pos = (v) => Math.max(0, num(v));
  const pack = (v) => (num(v) > 0 ? num(v) : 1);
  const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const ymOf = (v) => { // Timestamp | 'YYYY-MM-DD' | 'YYYYMMDD' → 'YYYY-MM'
    if (!v) return ''; if (typeof v.toDate === 'function') { const d = v.toDate(); return ym(d.getFullYear(), d.getMonth() + 1); }
    const s = String(v).replace(/\D/g, ''); return s.length >= 6 ? `${s.slice(0, 4)}-${s.slice(4, 6)}` : '';
  };
  const wanted = new Set(MONTHS.map(([y, m]) => ym(y, m)));
  const usageOf = (it) => (typeof getRb301UsageQty === 'function' ? getRb301UsageQty(it) : pos(it.importedUsageQty ?? it.usage));
  const isVaccine = (it) => String(it.type) === '6';
  let reads = 0; const get = async (q) => { const s = await q.get(); reads += Math.max(1, s.size); return s.docs.map(d => ({ id: d.id, ...d.data() })); };

  console.log('กำลังอ่านข้อมูล (อ่านอย่างเดียว)...');
  const hosps = await get(db.collection('master_hospitals'));
  const hospName = new Map(hosps.map(h => [String(h.hospital_id || h.id), h.hospital_name || h.id]));
  const years = [...new Set(MONTHS.map(([y]) => y))];
  const reqs = (await get(db.collection('requisitions').where('year', 'in', [...years, ...years.map(String)])))
    .filter(r => !String(r.id).startsWith('HIST-') && REQ_OK.includes(String(r.status)) && wanted.has(ym(num(r.year), num(r.month))));
  const counts = (await get(db.collection('vmi_stock_counts'))).filter(c => wanted.has(ymOf(c.count_date || c.created_at)));
  const emerg = (await get(db.collection('rpst_emergency'))).filter(e => e.status !== 'Cancelled' && wanted.has(ymOf(e.created_at)));
  const rets = (await get(db.collection('stock_returns'))).filter(r => r.status !== 'Cancelled' && wanted.has(ymOf(r.return_date || r.created_at)));

  const key = (h, m) => `${h}|${m}`; const rows = new Map();
  const row = (h, m) => { const k = key(h, m); if (!rows.has(k)) rows.set(k, { hospital_id: h, hospital_name: hospName.get(h) || h, month: m,
    m1_usage_value: 0, m1_dispense_value: 0, m2_stock_at_req: 0, m2_stock_count: '', m3_emergency_docs: 0, m4_emergency_items: 0, m5_expired_items: 0, m6_expired_value: 0, req_status: '', req_id: '' }); return rows.get(k); };
  hosps.forEach(h => MONTHS.forEach(([y, m]) => row(String(h.hospital_id || h.id), ym(y, m))));

  // 1–2) ใบเบิกรอบนั้น (ถ้ามีหลายใบในรอบเดียวกัน = รวม)
  reqs.forEach(r => { const o = row(String(r.hospitalId), ym(num(r.year), num(r.month)));
    o.req_status = [o.req_status, r.status].filter(Boolean).join('+'); o.req_id = [o.req_id, r.id].filter(Boolean).join('+');
    (r.items || []).filter(it => !isVaccine(it)).forEach(it => { const unit = num(it.price) / pack(it.packSize);
      o.m1_usage_value += usageOf(it) * unit;
      o.m1_dispense_value += (pos(it.dispenseQty) + pos(it.emergencyQty)) * unit;
      const stock = it.actualStock !== null && it.actualStock !== undefined && it.actualStock !== '' ? pos(it.actualStock) : pos(num(it.prevExcess) - usageOf(it));
      o.m2_stock_at_req += stock * unit; }); });
  // 2b) ตรวจนับ: ครั้งล่าสุดของเดือน
  const lastCount = new Map();
  counts.forEach(c => { const k = key(String(c.hospital_id), ymOf(c.count_date || c.created_at)); const prev = lastCount.get(k); if (!prev || String(c.count_date) >= String(prev.count_date)) lastCount.set(k, c); });
  lastCount.forEach((c, k) => { const [h, m] = k.split('|'); const o = row(h, m);
    o.m2_stock_count = (c.items || []).filter(it => !isVaccine(it)).reduce((s, it) => s + pos(it.counted) * num(it.price) / pack(it.pack_size), 0); });
  // 3–4) ใบ ฉ
  emerg.forEach(e => { const o = row(String(e.hospitalId), ymOf(e.created_at)); o.m3_emergency_docs += 1; o.m4_emergency_items += (e.items || []).filter(it => pos(it.qty) > 0).length; });
  // 5–6) คืนยาหมดอายุ
  rets.forEach(r => { const m = ymOf(r.return_date || r.created_at); const day = String(r.return_date || '').replace(/\D/g, '');
    const o = row(String(r.hospital_id), m);
    (r.items || []).forEach(it => { const exp = String(it.expiryDate || '').replace(/\D/g, '');
      const expired = it.reason === 'expired' || (exp.length === 8 && day.length === 8 && exp <= day);
      if (!expired || !(pos(it.returnQty) > 0)) return;
      o.m5_expired_items += 1; o.m6_expired_value += pos(it.returnQty) * num(it.price) / pack(it.packSize); }); });

  const out = [...rows.values()].sort((a, b) => a.hospital_name.localeCompare(b.hospital_name, 'th') || a.month.localeCompare(b.month))
    .map(o => ({ ...o, m1_usage_value: +o.m1_usage_value.toFixed(2), m1_dispense_value: +o.m1_dispense_value.toFixed(2), m2_stock_at_req: +o.m2_stock_at_req.toFixed(2),
      m2_stock_count: o.m2_stock_count === '' ? '' : +o.m2_stock_count.toFixed(2), m6_expired_value: +o.m6_expired_value.toFixed(2) }));
  console.table(out);
  console.log(`ใบเบิก ${reqs.length} · ตรวจนับ ${counts.length} · ใบ ฉ ${emerg.length} · ใบคืน ${rets.length} · อ่าน Firestore ประมาณ ${reads} reads`);
  const cols = Object.keys(out[0] || {});
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [cols.join(','), ...out.map(o => cols.map(c => esc(o[c])).join(','))].join('\n');
  const d = new Date(); const name = `vmi_monthly_metrics_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.__vmiMonthly = out;
  return `ดาวน์โหลด ${name} แล้ว (${out.length} แถว) · ผลอยู่ใน window.__vmiMonthly`;
})();
