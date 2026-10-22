# Sawee Rxfill — ระบบเบิกยา รพ.สวี (v6.9.0 · Bridge v2.10.2)

ผู้ใช้เป็นเภสัชกร รพ.สวี สื่อสารภาษาไทย ตอบเป็นภาษาไทย
**แก้เฉพาะจุดที่ขอ / เฉพาะไฟล์ที่เกี่ยวข้อง** — อย่า refactor หรือเปลี่ยนสิ่งที่ไม่ได้ขอ

## โครงสร้าง
- ไฟล์เว็บอยู่ที่ราก repo (static hosting) — ไม่มีโฟลเดอร์ `web/`
  - `index.html` หน้าแรก/landing
  - `app.html` รพ.สต. + แอดมิน (ใบเบิก รพ.สต., รอบเบิก, เครดิต, KPI, NCD outreach)
  - `internal.html` หน่วยงานใน รพ. + ห้องยา (PharmacyReqView: ดึงยอดใช้ HOSxP, ประมาณการ, พิมพ์ใบเบิก, Draft "รอส่ง")
  - `shared.js` JS ล้วน (ไม่มี JSX) — utils, calcPharmacySuggestion, buildInternalReqFormHtml (ใบพิมพ์), Firestore read-saver (IndexedDB cache + delta sync, tombstones, app_meta epoch, write hooks)
  - HTML ใช้ React 18 + Babel in-page (`<script type="text/babel">`)
- `firebase/` — firestore.rules (v6.8), firestore.indexes.json
- `api/line-webhook.js` — Vercel function (Node, ไม่มี dependency) env: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, LINE_BOT_ID, FIREBASE_SERVICE_ACCOUNT, LINE_MONTHLY_LIMIT
- `bridge/SaweeRefill/` — PHP Bridge/CLI (มีเฉพาะไฟล์ที่เคยแก้) ติดตั้งจริงที่ `C:\SaweeRefill\` (public/ cli/ tools/ private/ logs/ cache/)
  - `C:\xampp\htdocs\SaweeRefill\invs_api.php` เป็นไฟล์จิ๋ว `require 'C:\\SaweeRefill\\public\\invs_api.php';`
  - config อยู่ `C:\SaweeRefill\private\config.php` · Task Scheduler รัน `C:\SaweeRefill\tools\SYNC_BACKGROUND.bat`
- `tests/` — smoke tests (Playwright + fake-firebase) — build.js/depttest.js/v64.js ยังชี้ path เครื่องเดิม ต้องแก้ก่อนรัน

## กฎสำคัญ
- **Version guard:** เมื่อแก้ shared.js ให้ bump `APP_VERSION` ใน shared.js และให้ตรงกับ `shared.js?v=` และ `var need = '...'` ในทั้ง 3 HTML
- หลังแก้ HTML ตรวจ syntax JSX: `node tests/check_jsx.js app.html internal.html` (ต้องมี typescript)
- **ความปลอดภัย:** ห้ามใส่ service account / `config.php` / รหัสผ่านใน repo หรือ zip; Bridge เขียนลง INVS ได้เฉพาะ `sm_po` / `sm_po_c`
- หน่วยงานภายใน: แอดมินเลือกปีงบ (ปีที่แล้ว/ปีนี้/ปีหน้า) และคีย์ใบโดยระบุวันที่เอง (ไม่ใช้รอบ) → `round.manual` เลขที่ = ลำดับใบในปีงบนั้น, เก็บ `manual_backdate: true` ไม่เก็บ round_id
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
- **ใบหน่วยงาน (ไม่ใช่ห้องยา):** ที่ · รายการ · หน่วย · บรรจุ · จำนวนเบิก · จำนวนจ่าย (เว้นว่าง) · ราคา/หน่วย · มูลค่า (= จำนวนเบิก × ราคา) · คงเหลือ · รหัส
- เส้นคั่นกลุ่มตำแหน่งเดียวกันในใบห้องยา/หน่วยงาน = จุดไข่ปลา 0.1pt · ชื่อไฟล์ PDF = `<title>` "ชื่อหน่วยงาน เดือน ปี" (printHtmlDocument ยืม title ระหว่างพิมพ์)
- `master_drugs.old_code` (รหัสเก่าใช้หยิบของ) แสดงในช่องรหัสของใบเบิกทุกแบบเป็น `259(013)` ผ่าน `drugCodeLabel` — แสดงผลอย่างเดียว ไม่มีผลต่อการตัดจ่าย/INVS
- ช่องค้นหายาหน่วยงาน/ห้องยา: รหัสตรง 100% (INVS/HOSxP) ขึ้นก่อน → รหัสขึ้นต้น → ชื่อขึ้นต้น; แสดงชื่อพ้อง (invs_keywords + fuzzy) และรูป `image_url` ถ้ามี

## ใบเบิก รพ.สต. — แอดมินจัดยา + INVS
- Bridge `preflight`/`send` รับใบ Pending/Draft และ (v2.9.1) Completed ที่ยังไม่มีเลข INVS
- ใบรอจัดยาที่ยังไม่ส่ง INVS มีปุ่มเดียว "ส่ง INVS + บันทึกจัดยา" (ไม่มีปุ่มส่ง INVS อย่างเดียว): บันทึกการแก้ไขอัตโนมัติ → ตรวจ INVS → ส่งสำเร็จแล้ว handleApprove ต่อทันที
- ใบ Completed ที่ยังไม่มีเลข INVS ส่งย้อนหลังได้ (ปุ่ม "ส่งเข้า INVS (ย้อนหลัง)") — ไม่เปลี่ยนสถานะ/สต๊อกใน VMI
- ส่ง INVS 1 บรรทัด/ยา อ้าง lot แรก (FEFO) — ขอเกิน lot แรกแต่รวมทุก lot ในคลังพอ = ส่งได้ (เตือน) ไปตัดข้าม lot ตอนยืนยันจ่ายใน INVS; รวมทุก lot ไม่พอ = บล็อกเมื่อ `block_if_first_lot_short`
- ตารางใบ รพ.สต. (สร้าง/ดูใบ) เรียงในหมวดตามตำแหน่งยาเป็นค่าเริ่มต้น คลิกหัว "ชื่อยา/เวชภัณฑ์" หรือ "รหัส" เพื่อสลับ (`reqItemSorter`)
- ใบ รพ.สต. `month/year` = เดือนรอบเบิก (ทำ 20-31 ของเดือน M = รอบ M+1) · คอลัมน์ "รอบบิล" แสดง `formatBillRound` เช่น 01/2570
- วันที่เบิกที่ส่ง INVS (SUB_PO_DATE/REQ_DATE) = `firstWorkingMondayOf(month, year)` = จันทร์แรกของเดือน ถ้าตรงวันหยุด → วันทำการถัดไปในสัปดาห์เดียวกัน (วันหยุดตายตัว+ชดเชย, เพิ่มวันหยุดจันทรคติใน `RX_EXTRA_HOLIDAYS`) แก้ได้ในหน้าตรวจก่อนส่ง → Bridge `request_date`
- sm_po.TOTAL_COST = ผลรวมมูลค่า (v2.9.3) เท่ากับ TOTAL_VALUE
- sm_po.CONFIRM_DATE = วันที่เบิก (request_date) · CONFIRM_TIME = เวลาที่ส่ง — รูปแบบตามชนิดคอลัมน์จริง (information_schema) · CONFIRM_FLAG ยังเป็น N
- invs_stock_id ว่าง ("") = ใช้ `invs.default_stock_id` (v2.9.5)
- แดชบอร์ดแอดมิน: รายการใบเรียงใหม่→เก่าตาม `submitted_at || created_at` แสดงวันเวลา แยกคอลัมน์ผู้ทำรายการ / รพ.สต.
- ใบ รพ.สต. ไม่แสดงหมวดวัคซีน (type 6) ทุกบทบาท และไม่นับรวมรายการ
- ท้ายใบ รพ.สต.: ตำแหน่ง `sign_roles` + ชื่อ `sign_names` (6 แถว) จำในใบและเป็นค่าประจำ รพ.สต. ได้
- INVS ไม่ให้เพิ่มรายการในใบที่มาจากเว็บ → แอดมินใส่ "รายการส่ง INVS เพิ่ม" (`invs_extra_items` [{drugId, qty หน่วยย่อย}]) ในหน้าดูใบก่อนส่ง — ไม่ผ่าน VMI/เครดิต; Bridge รวมเข้า sm_po_c (ยาซ้ำ = รวมจำนวน)

## คืนยา รพ.สต. (v6.7 ReturnDrugView)
- เลือกจำนวนคืนรายล็อต (vmi_virtual_lots) · "ยอดมีจริง" คำนวณคืนจากล็อตใกล้หมดอายุก่อน · ตัวกรอง ≤180 / ≤30 วัน
- รายการเพิ่มเอง (ไม่มีในระบบ/Lot ไม่ตรง) = `manual: true` บันทึกในใบ ไม่ตัดสต๊อก แอดมินตรวจ
- ใบพิมพ์ `buildReturnFormHtml` (shared.js) แบบฟอร์มทางการ ผู้ส่งคืน/ผู้ตรวจสอบ/ผู้รับคืน/หัวหน้าคลังยา · เหตุผล `RETURN_REASONS`

## LINE OA (v6.8 เฟส 1)
- ผูกบัญชี: หน้าเว็บสร้าง `line_link_codes/{6 หลัก}` {uid, expires_at 10 นาที} → ผู้ใช้ส่งรหัสในแชต OA → webhook ตรวจลายเซ็น แล้วเขียน `users.line_user_id/line_display_name/line_linked_at` (ผู้ใช้เขียนเองไม่ได้ ยกเลิกเองได้)
- GET `/api/line-webhook` คืน { botId, addFriendUrl } ให้ทำ QR (qrcodejs จาก cdnjs) · unfollow = ล้างการผูก · 1 LINE ผูกได้ 1 ผู้ใช้
- app.html: `LineLinkPanel` (หน้าแก้ไขข้อมูลส่วนตัว) + `LineLinkPrompt` modal ตอนเข้าใช้ เฉพาะ รพ.สต./แอดมินที่ยังไม่ผูก ปิดแล้วไม่ขึ้นซ้ำใน session นั้น (หน่วยงานภายในยังไม่มี)

## LINE แจ้งเตือน (v6.9) — `api/_lib/core.js` (Firestore REST + LINE + โควตา) ใช้ร่วมทุก function
- `api/line-cron.js` Vercel Cron (`vercel.json` 08:00 UTC = 15:00) auth `Bearer CRON_SECRET` · แอดมิน POST {idToken, dryRun} ดูตัวอย่าง/ส่งทันที
  - แอดมิน: ใบเบิกใหม่ (รพ.สต.+หน่วยงาน) + ยาใกล้หมดอายุทุกรายการ ≤30/≤180 วัน (ส่งเมื่อมีใบใหม่หรือรายการเปลี่ยน)
  - จนท.รพ.สต.: เฉพาะล็อตที่เพิ่งข้ามระดับ (`line_meta/expiry_levels`) + ข้อความ "ข้อมูลมาจากระบบ...คืนยา" — **ข้อความถึงเจ้าหน้าที่ไม่ระบุเวลา/วันละครั้ง**
- โควตา `line_meta/quota_YYYYMM` เทียบ LINE consumption · ≥80% ส่งเฉพาะแอดมิน · ≥95% หยุด · log ทุกครั้ง `line_logs`
- `api/line-notify.js` (ID token): status / test / dispensed / unlink — ส่ง INVS สำเร็จ (ใบใหม่) → app.html `notifyLineDispensed` แจ้ง จนท.รพ.สต. "ห้องยาจัดยาเรียบร้อยแล้ว" + ลิงก์ใบสรุปการจ่าย
- `api/dispense-sheet.js?c=r&id=&t=` ใบสรุปการจ่าย (Lot/วันหมดอายุ/จำนวน จาก invs_*_snapshot) เปิดได้ไม่ต้อง login ด้วย HMAC (`SHEET_SECRET` หรือ LINE_CHANNEL_SECRET)
- app.html แอดมิน: เมนู "LINE Console" (`LineConsoleView`) โควตา · ผู้ผูก/ยังไม่ผูก · ประวัติ 50 รายการ · ทดสอบ/ดูตัวอย่าง/ส่งสรุปตอนนี้
- env เพิ่ม: CRON_SECRET (จำเป็น), SHEET_SECRET, SITE_URL (ไม่บังคับ) · rules: line_logs/line_meta แอดมินอ่าน เขียนได้เฉพาะเซิร์ฟเวอร์

## v6.9 เพิ่มเติม
- แจ้งเตือนหมดอายุ: ส่งครั้งเดียวต่อเกณฑ์ (180 / 30 วัน) ทั้งแอดมินและ จนท. · ข้อความ "เป็นข้อความจากระบบ กรุณาเช็คยาจริง หาก EXP ไม่ถูกต้อง แก้ไขได้ในหน้า คลังยาของฉัน"
- คลังยาของฉัน (app.html MyStockView): `effectiveLots` สมมติยาจริง = Target Stock (config_par.par_qty) หักล็อต EXP ใกล้สุดก่อน (FEFO) — ไม่หักถ้าตรวจนับ/แก้ยอดหลังรับล็อตล่าสุด · cron ใช้สมมติฐานเดียวกัน (`assumeAtTarget`)
  - สลับ Virtual Shelf / โหมดตาราง (localStorage `rxfill_stock_view`) ตารางแก้ Lot/EXP/คงเหลือ (เก็บ lot_no_before/expiry_before, event MANUAL_ADJUST) กรองหมดอายุ/≤180 วัน เรียงตาม EXP
  - ล็อตแสดง รับเมื่อ + เลข INVS/รอบบิล · Excel แสดงเฉพาะยอดที่ควรเหลือ
- ว.3/1: ครุฑโหลดจาก `garuda.png` ที่ราก repo (fallback data URI เดิมซึ่งไฟล์เสีย) · CSS print บีบให้จบ 1 หน้า
- internal ใบเบิกของฉัน: กล่อง "พิมพ์ใบเบิก" ท้ายตาราง · วันที่ในใบล็อกสำหรับผู้เบิก แอดมินแก้ได้จนส่ง INVS · บันทึก printed_at
- เบิกยาด่วน (internal.html `UrgentReqView`, collection `internal_urgent`): เลือกรอบที่ยังไม่ยืนยันจ่าย → รายการแบบตารางหน่วยงาน → พิมพ์ "ขอเบิกยา/เวชภัณฑ์ล่วงหน้า" · DeptReqView ของรอบนั้นรวมยอด (`urgentQty`, หมายเหตุ "รวมเบิกด่วน") แล้วปิดใบด่วนเป็น Merged

- ใบเบิกพร้อมยอดคงเหลือคลัง (Bridge 2.10.1): ตอนส่ง INVS เก็บใน snapshot `stock_before/stock_after/stock_lots/alloc[{lot_no,expiry,qty}]` จาก `inv_md_c` คลังจ่าย (lot เรียง RECORD_NUMBER เหมือน lot ตั้งต้น) · app.html `buildInvsStockSheetHtml` ปุ่ม "พิมพ์ใบเบิกพร้อมยอดคงเหลือ" ในกล่อง INVS ของใบ รพ.สต. และคิวใบภายใน (ถามพิมพ์ทันทีหลังส่ง)

## ใบเบิกยาฉุกเฉิน รพ.สต. (ใบ ฉ) v6.9.0
- app.html `EmergencyReqView` (เมนู "เบิกยาฉุกเฉิน (ใบ ฉ)") collection `rpst_emergency` {hospitalId, items[{drugId,qty หน่วยย่อย,...}], reason, status Approved/Cancelled, merged_req_id}
- ตรวจผ่านระบบ (`checkEmergencyItems`): ไม่ผ่าน (แดง บันทึกไม่ได้) = ไม่มีเหตุผล / ยาไม่อยู่ใน config_par ของ รพ.สต. / ยกเลิกใช้ · เกิน Target/Maximum = ข้อสังเกตสีเหลือง ยังผ่าน (`over_target`, `warnings` แสดงในใบพิมพ์) · วัคซีนเบิกได้แต่ไม่รวมเข้าใบเบิกหลัก (ห้องยาจัดการเอง)
- ใบพิมพ์ `buildEmergencyFormHtml` + หมายเหตุขั้นตอน (ส่งกระดาษ/PDF ทาง LINE ไม่ต้องเบิกซ้ำ ระบบรวมยอดเอง)
- CreateReqView โหลดใบ ฉ ที่ยังไม่รวม (หรือรวมเข้าใบนี้) → `item.emergencyQty` แสดง "จ่ายใหม่ + ฉุกเฉิน(แดง)" แก้ไม่ได้ · หมายเหตุท้ายตาราง · บันทึกแล้วตั้ง merged_req_id
- `getRequisitionItemValue` รวม emergencyQty (คิดเงิน) · Bridge 2.10.2 ส่ง INVS qty = dispenseQty + emergencyQty · sync_virtual_stock 1.2 ไม่บวก emergencyQty เข้า Lot ซ้ำ · dispenseQty (จ่ายจริง) ไม่รวมฉุกเฉิน

## Phase คลังย่อย รพ.สต. → INVS (เริ่ม)
- ขั้นที่ 1: `cli/invs_diff.php` + `tools/INVS_DIFF.bat` (อ่านอย่างเดียว · SET SESSION TRANSACTION READ ONLY) snap ก่อน/หลังทำรายการด้วยมือใน INVS → รายงานตารางที่เปลี่ยน แถวใหม่ และค่าที่เปลี่ยนของยาที่ทดสอบ → `cache/invs_diff/report_before_after.txt`
- ยังไม่เขียนคลังย่อย INVS จนกว่าจะรู้รูปแบบจากรายงานและผู้ใช้อนุมัติขยายกฎ (ปัจจุบันเขียนได้เฉพาะ sm_po/sm_po_c)

## Sync รายการยาจาก INVS (Bridge 2.10.0 action `invs_master`, อ่านอย่างเดียว)
- หน้าจัดการฐานข้อมูล ปุ่ม "Sync รายการยาจาก INVS" → `InvsMasterSyncModal` แสดงยาที่ราคา/บรรจุ/หน่วยเปลี่ยน + ยาใหม่ ให้ติ๊กเลือกก่อนบันทึก (เก็บค่าเดิมใน `*_previous`)

## ตำแหน่งยา / คำค้นหา (Bridge `invs_extras` → master_drugs.invs_location / invs_keywords)
- ตำแหน่งมาจาก `sawee_location.LOC_CODE` (DEPT_ID = default_stock_id) — ว่างหรือ `0` = ไม่มีตำแหน่ง (ล้างค่าเดิม)
- คำค้นหา: `inst_name.INST_NAME` + `REF_CODE`
- **เรียงรายการในใบเบิกทุกแบบ** (ห้องยา หน่วยงาน รพ.สต. ใบจัดยา): แบ่งตามหมวด → ตำแหน่งแบบตัวเลขทีละช่วง (7/1/2-1 ก่อน 12/3/2-1) → ชื่อ; ไม่มีตำแหน่งไว้ท้ายเรียงตามชื่อ — ใช้ `compareByLocation` ใน shared.js
- ใบพิมพ์ (ห้องยา/หน่วยงาน/รพ.สต.) แถวติดกันที่กลุ่มตำแหน่งเดียวกัน (`locationGroupKey`: อักษรนำ A01→A หรือเลขชั้นแรก 7/1/2-1→7) คั่นเส้นจุด เปลี่ยนกลุ่มเป็นเส้นทึบ
