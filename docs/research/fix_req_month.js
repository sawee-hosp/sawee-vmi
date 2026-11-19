/*
 * ย้ายเดือนรอบเบิกของใบเบิก รพ.สต. (requisitions.month / year) ที่บันทึกผิดเดือน
 * วิธีใช้: เปิด app.html login แอดมิน → F12 → Console → วางทั้งไฟล์ → Enter
 *   รอบแรก APPLY = false (ค่าเริ่มต้น) = ดูแผนอย่างเดียว ไม่เขียนอะไร
 *   ตรวจตารางแล้ว แก้บรรทัด APPLY เป็น true แล้ววางใหม่อีกครั้ง = เขียนจริง → กด F5 รีเฟรชหน้า
 *
 * แก้เฉพาะ month / year (+ ประวัติการย้าย) · ไม่เปลี่ยนเลขที่ใบ (doc id), เลขรอบบิล, รายการยา, สต๊อก, เอกสาร INVS
 * กันพลาด: ถ้าเดือนปลายทางมีใบของ รพ.สต. เดียวกันอยู่แล้ว (ไม่นับใบยกเลิก) จะหยุดทั้งหมด ไม่เขียนสักใบ
 */
(async () => {
  const APPLY = false;   // ← เปลี่ยนเป็น true เมื่อตรวจแผนแล้ว
  // กฎย้าย ทำตามลำดับ (ย้ายใบที่ไปชนก่อน): from/to = [ปี ค.ศ., เดือน] · hospitals = [] หมายถึงทุก รพ.สต.
  const MOVES = [
    { from: [2026, 8], to: [2026, 9], hospitals: ['h03', 'h06'] },   // ด่านสวี ปากแพรก: บันทึก ส.ค. → จริงคือ ก.ย.
    { from: [2026, 7], to: [2026, 8], hospitals: [] }                // รอบแรก: บันทึก ก.ค. → จริงคือ ส.ค.
  ];
  const TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const lab = (y, m) => `${TH[m - 1]}${String(y + 543).slice(-2)}`;
  const years = [...new Set(MOVES.flatMap(r => [r.from[0], r.to[0]]))];
  const snap = await db.collection('requisitions').where('year', 'in', [...years, ...years.map(String)]).get();
  const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => !String(r.id).startsWith('HIST-'));
  const live = (r) => r.status !== 'Cancelled';
  // จำลองผลทีละกฎ (สถานะเดือนหลังย้ายกฎก่อนหน้า)
  const cur = new Map(reqs.map(r => [r.id, { y: Number(r.year), m: Number(r.month) }]));
  const plan = [], problems = [];
  for (const rule of MOVES) {
    const hs = new Set((rule.hospitals || []).map(String));
    const pick = reqs.filter(r => { const p = cur.get(r.id); return p.y === rule.from[0] && p.m === rule.from[1] && (!hs.size || hs.has(String(r.hospitalId))); });
    for (const r of pick) {
      const clash = reqs.find(o => o.id !== r.id && live(o) && live(r) && String(o.hospitalId) === String(r.hospitalId) && cur.get(o.id).y === rule.to[0] && cur.get(o.id).m === rule.to[1]);
      if (clash) problems.push(`${r.id} (${r.hospitalId}) → ${lab(...rule.to)} ชนกับใบ ${clash.id} ที่อยู่เดือนนั้นแล้ว`);
      plan.push({ id: r.id, hospitalId: r.hospitalId, status: r.status, from: lab(cur.get(r.id).y, cur.get(r.id).m), to: lab(...rule.to), fromY: cur.get(r.id).y, fromM: cur.get(r.id).m, toY: rule.to[0], toM: rule.to[1] });
      cur.set(r.id, { y: rule.to[0], m: rule.to[1] });
    }
  }
  console.table(plan.map(({ id, hospitalId, status, from, to }) => ({ id, hospitalId, status, from, to })));
  if (problems.length) { console.error('หยุด — ไม่ได้เขียนอะไร:\n' + problems.join('\n')); return 'มีใบชนเดือน ' + problems.length + ' ใบ (ดูข้อความสีแดง)'; }
  if (!plan.length) return 'ไม่พบใบที่ต้องย้าย';
  if (!APPLY) return `แผนย้าย ${plan.length} ใบ (ยังไม่เขียน) — ตรวจตารางแล้วตั้ง APPLY = true แล้ววางใหม่`;
  const ts = firebase.firestore.FieldValue.serverTimestamp(), uid = auth.currentUser && auth.currentUser.uid;
  const batch = db.batch();
  plan.forEach(p => {
    batch.update(db.collection('requisitions').doc(p.id), { month: p.toM, year: p.toY, period_moved_from: { month: p.fromM, year: p.fromY }, period_moved_at: ts, period_moved_by_uid: uid || '', updated_at: ts });
    batch.set(db.collection('audit_logs').doc(), { action: 'REQUISITION_PERIOD_MOVE', target_type: 'requisitions', target_id: p.id, actor_uid: uid || '', details: { from: { month: p.fromM, year: p.fromY }, to: { month: p.toM, year: p.toY }, hospital_id: String(p.hospitalId) }, created_at: ts });
  });
  await batch.commit();
  return `ย้ายแล้ว ${plan.length} ใบ — กด F5 รีเฟรชหน้า แล้วเปิดรายงานสรุปตรวจอีกครั้ง`;
})();
