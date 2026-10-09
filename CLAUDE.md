# Sawee Rxfill — ระบบเบิกยา รพ.สวี (v6.6.1 · Bridge v2.9.2)

ผู้ใช้เป็นเภสัชกร รพ.สวี สื่อสารภาษาไทย ตอบเป็นภาษาไทย
**แก้เฉพาะจุดที่ขอ / เฉพาะไฟล์ที่เกี่ยวข้อง** — อย่า refactor หรือเปลี่ยนสิ่งที่ไม่ได้ขอ

## โครงสร้าง
- ไฟล์เว็บอยู่ที่ราก repo (static hosting) — ไม่มีโฟลเดอร์ `web/`
  - `index.html` หน้าแรก/landing
  - `app.html` รพ.สต. + แอดมิน (ใบเบิก รพ.สต., รอบเบิก, เครดิต, KPI, NCD outreach)
  - `internal.html` หน่วยงานใน รพ. + ห้องยา (PharmacyReqView: ดึงยอดใช้ HOSxP, ประมาณการ, พิมพ์ใบเบิก, Draft "รอส่ง")
  - `shared.js` JS ล้วน (ไม่มี JSX) — utils, calcPharmacySuggestion, buildInternalReqFormHtml (ใบพิมพ์), Firestore read-saver (IndexedDB cache + delta sync, tombstones, app_meta epoch, write hooks)
  - HTML ใช้ React 18 + Babel in-page (`<script type="text/babel">`)
- `firebase/` — firestore.rules (v6.5), firestore.indexes.json
- `bridge/SaweeRefill/` — PHP Bridge/CLI (มีเฉพาะไฟล์ที่เคยแก้) ติดตั้งจริงที่ `C:\SaweeRefill\` (public/ cli/ tools/ private/ logs/ cache/)
  - `C:\xampp\htdocs\SaweeRefill\invs_api.php` เป็นไฟล์จิ๋ว `require 'C:\\SaweeRefill\\public\\invs_api.php';`
  - config อยู่ `C:\SaweeRefill\private\config.php` · Task Scheduler รัน `C:\SaweeRefill\tools\SYNC_BACKGROUND.bat`
- `tests/` — smoke tests (Playwright + fake-firebase) — build.js/depttest.js/v64.js ยังชี้ path เครื่องเดิม ต้องแก้ก่อนรัน

## กฎสำคัญ
- **Version guard:** เมื่อแก้ shared.js ให้ bump `APP_VERSION` ใน shared.js และให้ตรงกับ `shared.js?v=` และ `var need = '...'` ในทั้ง 3 HTML
- หลังแก้ HTML ตรวจ syntax JSX: `node tests/check_jsx.js app.html internal.html` (ต้องมี typescript)
- **ความปลอดภัย:** ห้ามใส่ service account / `config.php` / รหัสผ่านใน repo หรือ zip; Bridge เขียนลง INVS ได้เฉพาะ `sm_po` / `sm_po_c`
- สถานะใบเบิกภายใน: Draft (รอส่ง) / Pending / Rejected / Cancelled / Completed — "ลบใบรอส่ง" = เปลี่ยนเป็น Cancelled + `draft_deleted: true` (ไม่ delete จริง เพราะ delta sync)
- ทุกการเขียน Firestore ต้องผ่าน write hooks (ประทับ `updated_at`) เพื่อให้ cache ซิงก์ถูก

## ใบเบิกห้องยา (PDF) — ตกลงกันแล้ว
คอลัมน์: ที่ · ชื่อยา · หน่วย · บรรจุ · ยอดใช้ · **ยอดเหลือ** (ตัวน้ำเงิน, พื้นขาว) · **Target Stock** (พื้นเทาอ่อน #f1f1f1 ทั้งคอลัมน์) · จำนวนจ่าย · ราคา/หน่วย · มูลค่า · **คงเหลือ** (เว้นว่างให้เขียนในกระดาษ) · รหัส
- Target Stock และจำนวนจ่ายของห้องยา ปัดขึ้นเป็นจำนวนเต็มหน่วยบรรจุ (ไม่แตกเศษ)
- เลขหน้ามุมขวาบน + "พิมพ์เมื่อ" ท้ายกระดาษ ผ่าน @page margin boxes
- เผื่อแถวว่าง 5 แถวท้ายตาราง; รายการเพิ่มเอง (source=manual) ช่องที่เป็น 0 ให้เว้นว่าง
- ใบ รพ.สต. (app.html) ใช้หัวคอลัมน์ ยอดเหลือ (col-credit ตัวน้ำเงิน) / Target Stock (col-target เทา) / คงเหลือ (ว่าง) เช่นกัน
- **ท้ายใบห้องยา/หน่วยงาน:** ผู้ลงนาม 4 จุด ผู้เบิก · ผู้สั่งจ่าย · ผู้รับของ · ผู้จ่าย (แก้ชื่อ/ตำแหน่งได้ วันที่เว้นว่าง) จำไว้ในใบ `sign_people`
- **ห้องยา:** ซ่อนหมวด 5 (ยาโครงการฯ) และ 6 (วัคซีน) ได้ — ค่าเริ่มต้นซ่อนทั้งคู่ จำไว้ใน localStorage `rxfill_ph_hide_types`

## ใบเบิก รพ.สต. — แอดมินจัดยา + INVS
- Bridge `preflight`/`send` รับใบ Pending/Draft และ (v2.9.1) Completed ที่ยังไม่มีเลข INVS
- ใบที่ยังไม่ส่ง INVS ปุ่มจัดยาเป็น "ส่ง INVS + บันทึกจัดยา": บันทึกการแก้ไขอัตโนมัติ → ตรวจ INVS → ส่งสำเร็จแล้ว handleApprove ต่อทันที
- ใบ Completed ที่ยังไม่มีเลข INVS ส่งย้อนหลังได้ (ปุ่ม "ส่งเข้า INVS") — ไม่เปลี่ยนสถานะ/สต๊อกใน VMI
- ส่ง INVS 1 บรรทัด/ยา อ้าง lot แรก (FEFO) — ขอเกิน lot แรกแต่รวมทุก lot ในคลังพอ = ส่งได้ (เตือน) ไปตัดข้าม lot ตอนยืนยันจ่ายใน INVS; รวมทุก lot ไม่พอ = บล็อกเมื่อ `block_if_first_lot_short`
- ตารางใบ รพ.สต. (สร้าง/ดูใบ) เรียงในหมวดตามตำแหน่งยาเป็นค่าเริ่มต้น คลิกหัว "ชื่อยา/เวชภัณฑ์" หรือ "รหัส" เพื่อสลับ (`reqItemSorter`)

## ตำแหน่งยา / คำค้นหา (Bridge `invs_extras` → master_drugs.invs_location / invs_keywords)
- ตำแหน่งมาจาก `sawee_location.LOC_CODE` (DEPT_ID = default_stock_id) — ว่างหรือ `0` = ไม่มีตำแหน่ง (ล้างค่าเดิม)
- คำค้นหา: `inst_name.INST_NAME` + `REF_CODE`
- **เรียงรายการในใบเบิกทุกแบบ** (ห้องยา หน่วยงาน รพ.สต. ใบจัดยา): แบ่งตามหมวด → ตำแหน่งแบบตัวเลขทีละช่วง (7/1/2-1 ก่อน 12/3/2-1) → ชื่อ; ไม่มีตำแหน่งไว้ท้ายเรียงตามชื่อ — ใช้ `compareByLocation` ใน shared.js
