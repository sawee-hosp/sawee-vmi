# Sawee Rxfill — ระบบเบิกยา รพ.สวี (v6.17.0 · Bridge v2.13.0)

ผู้ใช้เป็นเภสัชกร รพ.สวี สื่อสารภาษาไทย ตอบเป็นภาษาไทย
**ไฟล์ที่ต้องติดตั้งนอก GitHub/Vercel** (Bridge PHP, firestore.rules ฯลฯ) ให้ส่งแยกเป็นไฟล์แนบ (SendUserFile) ทุกครั้งที่แก้ พร้อมบอกตำแหน่งที่ต้องวาง
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
- ผลทดสอบ 1 (23 ต.ค. 69 ยา 02110 คลัง 13): ตัดจ่ายคลังย่อยใน INVS = สร้าง `sm_po` STOCK_ID=คลังย่อย (13), DEPT_ID='PT01', R_S_STATUS='S', CONFIRM_FLAG='N' + `sm_po_c` แยกบรรทัดตาม lot (FEFO ตาม EXP) · `inv_md_c` ยังไม่เปลี่ยนจนกว่ายืนยัน · `rs_con` (RS_DATE/RS_CON) เปลี่ยน = ตัวนับเลขเอกสารของ INVS (Bridge ปัจจุบันไม่ได้ใช้) · inv_md.COUNT_ON_HAND null→10 (รอผู้ใช้ยืนยันที่มา)
- ผลทดสอบ 2 (ยืนยันเอกสารเดิม): INVS "ย้าย" ล็อตจากคลัง 13 ไปคลังสมมติ PT01 — inv_md_c ลบแถว DEPT 13 แล้วสร้างแถว DEPT PT01 · inv_md 13 → 0, PT01 สร้างใหม่ · `card` บันทึกคู่ S (ออกจาก 13) / I (เข้า PT01) ต่อ lot พร้อม REMAIN_QTY · sm_po_c บรรทัดเดิม CANCEL_DISP 'Changed By' + บรรทัดใหม่จำนวนมาก (QTY_ORDER เพิ่มเท่าตัว)
  - ⚠ ผลผิดคาด: ตัดไป 5,600 แทน 5,590 (lot 26123035 ขอ 990 ถูกปัดเป็น 1,000 = เต็มแพ็ค PACK_RATIO 1000) → คลัง 13 เหลือ 0 แทน 10 · ต้องแก้ใน INVS
  - ช่วงเดียวกัน `dispensed` +1,873 แถว (นำเข้าจาก HIS: MED_CODE=รหัส HOSxP, DISP_QTY หน่วยย่อย, DISP_DEPT, hn/vn, PROCESS_FLAG N) และ `accr_disp` เปลี่ยน — อาจเป็นช่องทางนำเข้ายอดใช้รายหน่วยที่เหมาะกว่า (รอตรวจ)
  - ผู้ใช้ยืนยัน: ยอดเพี้ยนเกิดจากแท็บ "ป้อนข้อมูลคงเหลือเอง" (ถามให้รวมรายการ) ไม่ใช่ INVS จ่ายเศษไม่ได้ · ไม่ต้องกลับรายการทดสอบ (จะ reset คลังย่อยตามจริงอยู่แล้ว)
- **ขั้นที่ 2 (Bridge 2.11.0):** action `substock_preflight` / `substock_send` {hospital_id, targets[{drug_id,target_qty}], batch_id}
  - อ่าน inv_md_c คลังย่อย (DEPT_ID = master_hospitals.invs_dept_id) เรียง EXP → ตัด = INVS − ยอดจริง (ถ้า INVS น้อยกว่า = invs_short ไม่ตัด) · ยาที่ INVS มีแต่เว็บไม่ส่งมา = untracked (ไม่ตัด)
  - สร้าง sm_po R_S_STATUS='S' DEPT_ID=`invs.patient_dept_id` (ค่าเริ่มต้น PT01) STOCK_ID=คลังย่อย SEND_FLAG/CONFIRM_DATE ว่าง SUB_PO_UNO='' + sm_po_c รายล็อต (COST = qty×LOT_COST/QTY_ON_HAND, VALUE = qty×PACK_COST/PACK_RATIO, BUY_UNIT_COST = LOT_COST/QTY_ON_HAND — ตรงกับเอกสารที่ INVS สร้างเอง) CONFIRM_FLAG='N' · REF_NO marker กันซ้ำ · ยังอยู่ในกฎ sm_po/sm_po_c
  - เภสัชกรกดยืนยันในเมนู "จ่ายผู้ป่วย" ของ INVS → INVS ย้ายล็อตไป PT01 + ลงบัตรคลังเอง
- app.html แอดมิน เมนู "คลังย่อย รพ.สต. → INVS" (`SubstockSyncView`): ยอดจริง = `effectiveRemainingByDrug` (สมมติฐานเดียวกับคลังยาของฉัน) แก้ได้ → ตรวจกับ INVS → เลือก → สร้างเอกสาร · ประวัติ `invs_substock_posts` (rules แอดมิน)

## v6.10 ตรวจนับ / ยอดใช้จริง / ตัดคลังย่อยตามยอดใช้
- ยอดใช้จริงผู้ป่วย = `getRb301UsageQty(item)` (importedUsageQty จาก รบ.301 ก่อนปรับแก้ ถ้าไม่มีใช้ usage) เก็บแยกจาก dispenseQty (ยอดเบิก/จ่าย)
- Bridge 2.11.1: targets รับ `cut_qty` (ตัดตามยอดใช้ ตัดได้ไม่เกินที่ INVS มี + เตือน) แทน `target_qty`
- SubstockSyncView 2 โหมด: **ตัดตามยอดใช้ (รบ.301)** เลือกใบเบิก → batch_id `USE-{reqId}` (1 ใบ = 1 เอกสาร กันซ้ำ) · **ปรับให้เท่ายอดจริง** (หลังตรวจนับ) · ประวัติเก็บ mode/req_id/req_round
- MyStockView แท็บ "ตรวจนับ": พิมพ์ใบตรวจนับ `buildStockCountFormHtml` (shared.js, A4 แนวนอน: รหัส(old_code) ยอดระบบ Lot/EXP เร็วสุด ★≤180 วัน จำนวน Lot ช่องนับได้/ส่วนต่าง/หมายเหตุ มูลค่า + ตัวอักษร ผู้ตรวจนับ/ผู้ตรวจสอบ/ผู้บันทึก) → คีย์ผล → ปรับล็อต FEFO (ขาด=หักล็อตหมดอายุก่อน, เกิน=เพิ่มล็อตใหม่สุด, ไม่มีล็อต=no_lot) event MANUAL_ADJUST source STOCK_COUNT → `vmi_stock_counts` (rules: รพ.สต.สร้างของตัวเอง) · พิมพ์ผลนับย้อนหลังได้
- รายละเอียดยา: "ประวัติการใช้จริง" 12 รอบล่าสุด (ยอดใช้ รบ.301 vs ยอดเบิก + ฉุกเฉิน)
- ใบคืนยา: หัว หน่วยบริการ/เรื่อง/เรียน หัวหน้ากลุ่มงานเภสัชกรรมฯ · intro จำนวน+มูลค่า · รหัส old_code (`withOldCodes`) · มูลค่าตัวอักษร `bahtText` · "จึงเรียนมาเพื่อโปรดพิจารณา"

## v6.11 ลดภาระ รพ.สต. / ติดตามการนับ
- ส่งใบเบิก (Pending) = `applyUsageCutToVirtualStock` ตัดยอดใช้ รบ.301 ออกจาก vmi_virtual_lots ทันที (FEFO, event MANUAL_ADJUST source RB301_USAGE + source_requisition_id ใช้กันตัดซ้ำ/ตัดเฉพาะส่วนต่างเมื่อแก้ใบ, ไม่ประทับ manual_adjusted_at) → dialog ชวน "ไปหน้าตรวจนับ" (localStorage `rxfill_stock_tab`)
- แอดมินส่ง INVS: checkbox `postUsageInvs` (ค่าเริ่มต้นเปิด) → `postUsageToSubstock` สร้างเอกสารจ่ายผู้ป่วยตามยอดใช้ อัตโนมัติ (batch `USE-{reqId}` บันทึก invs_substock_posts auto:true)
- LINE: cron วันที่ 1–7 ส่งเตือนตรวจนับครั้งเดียว/เดือน (`line_meta/state.count_reminder_month`) ถึง จนท. รพ.สต. ที่ยังไม่มี vmi_stock_counts เดือนนี้ · ข้อความจัดยาเสร็จชวนตรวจนับ
- แอดมิน: "สถานะตรวจนับ รพ.สต." (`StockCountStatusView` ส่วนต่างสูง ≥1,000 บาท หรือ ≥20% รายการ) · "จับคู่ยา NCDs" (`NcdsMappingView` icode ที่ยังไม่ match ทุก รพ.สต. → master_drugs.hosxp_code + คำแนะนำชื่อใกล้เคียง)

## Sync รายการยาจาก INVS (Bridge 2.10.0 action `invs_master`, อ่านอย่างเดียว)
- หน้าจัดการฐานข้อมูล ปุ่ม "Sync รายการยาจาก INVS" → `InvsMasterSyncModal` แสดงยาที่ราคา/บรรจุ/หน่วยเปลี่ยน + ยาใหม่ ให้ติ๊กเลือกก่อนบันทึก (เก็บค่าเดิมใน `*_previous`)

## ตำแหน่งยา / คำค้นหา (Bridge `invs_extras` → master_drugs.invs_location / invs_keywords)
- ตำแหน่งมาจาก `sawee_location.LOC_CODE` (DEPT_ID = default_stock_id) — ว่างหรือ `0` = ไม่มีตำแหน่ง (ล้างค่าเดิม)
- คำค้นหา: `inst_name.INST_NAME` + `REF_CODE`
- **เรียงรายการในใบเบิกทุกแบบ** (ห้องยา หน่วยงาน รพ.สต. ใบจัดยา): แบ่งตามหมวด → ตำแหน่งแบบตัวเลขทีละช่วง (7/1/2-1 ก่อน 12/3/2-1) → ชื่อ; ไม่มีตำแหน่งไว้ท้ายเรียงตามชื่อ — ใช้ `compareByLocation` ใน shared.js
- ใบพิมพ์ (ห้องยา/หน่วยงาน/รพ.สต.) แถวติดกันที่กลุ่มตำแหน่งเดียวกัน (`locationGroupKey`: อักษรนำ A01→A หรือเลขชั้นแรก 7/1/2-1→7) คั่นเส้นจุด เปลี่ยนกลุ่มเป็นเส้นทึบ

## v6.12
- ไอคอนบนเดสก์ท็อป (PWA): `manifest.webmanifest` + `sw.js` (ไม่แคชอะไร กัน shared.js ค้าง) + `icons/` (รถพยาบาล + "Rxfill") · shared.js `rxInstallApp` (ปุ่มเมนู "ติดตั้งไอคอนบนเดสก์ท็อป" app/internal) · `rxPwaRemindOnLogin(uid)` เตือน 1 ครั้งต่อการ login (uid + lastSignInTime) จนกว่าเครื่องนั้นติดตั้ง (`rxfill_pwa_installed`) · Safari/iPhone แสดงวิธีทำเอง
- ใบ ฉ: ค้นหายาจากทุกรายการใน config_par ของ รพ.สต. (ไม่บังคับ par_qty>0 — เดิมค้นไม่เจอเมื่อ par_qty ว่าง) ค้นด้วยรหัสเก่า/คำค้นได้ · Target = `emergencyTargetOf` (par_qty หรือ targetVMI จากใบเบิกล่าสุด) · ไม่มี Target = ข้อสังเกต
- เดือนของใบ รพ.สต. (ใบใหม่): เลือกรอบ → เดือนของ round_date · แอดมิน "อัปโหลดแทน" → เดือน/ปีที่เลือกในแดชบอร์ด (`ctx.targetUploadPeriod`) · อื่น ๆ → 20-31 = เดือนถัดไป (เดิมใช้วันนี้เสมอ ทำให้ใบไปตกเดือนถัดไป)
- เพิ่มยาในใบ (แอดมิน ViewReqView + รพ.สต. CreateReqView): `PackUnitQtyField` ปุ่มใหญ่ หน่วยเต็ม (Pack) / หน่วยย่อย · ค่าเริ่มต้น แตก Pack ได้ = หน่วยย่อย, ไม่ได้ = หน่วยเต็ม · แอดมินเพิ่มยาแล้วบันทึกยอดที่แก้ค้างบนหน้าจอไปพร้อมกัน (เดิมย้อนเป็นค่าใน Firestore)
- Bridge 2.11.2: snapshot `lots_after[{lot_no,expiry,qty_before,qty_issue,qty_after}]` ทุก lot ในคลังจ่าย → ใบ "พิมพ์ใบเบิกพร้อมยอดคงเหลือ" แสดงยอดเหลือทุก lot หลังหักใบนี้ (lot ที่ตัดสีแดง; ใบที่ส่งก่อน 2.11.2 แสดงเฉพาะ lot ที่ตัด)
- หน้าตรวจก่อนส่ง INVS (ใบ รพ.สต. + คิวใบภายใน) แสดง "คงคลังรวมทุก lot" (stock_before) และ "เหลือหลังเบิก" (stock_after) ของคลังใหญ่
- tests/v612.js · v69_emergency.js ล็อกวันที่ 25 ต.ค. (เดิมผลขึ้นกับวันที่รัน: รพ.สต. สร้างใบได้เฉพาะวันที่ 20-31)
- ราคาตาม INVS (ข้อ 7 แบบ ข): `handleApprove(opts)` ใบที่ส่ง INVS แล้ว → `items[].price` = cost ต่อหน่วยย่อยจาก Bridge (ผลส่ง `data.items` หรือ `invs_items_snapshot`/`invs_request_lot_snapshot`) × packSize ของ VMI · เก็บ `price_before_invs`, `price_source:'INVS'` · ไม่แก้ราคาใน master_drugs (ใช้ปุ่ม Sync รายการยาจาก INVS เหมือนเดิม)

## v6.13 ห้องยา: สูตร ASU 180 วัน (PharmacyReqView, เช็กบ็อกซ์ "สูตร ASU 180 วัน" ค่าเริ่มต้นเปิด จำใน localStorage `rxfill_ph_asu`)
- Bridge 2.12.0 (อ่านอย่างเดียว): `hosxp_usage_daily` {date_from,date_to} → series {icode:{YYYY-MM-DD:qty สุทธิ OPD+IPD}} (config `hosxp.daily_sql` ไม่บังคับ) · `invs_lots` {drug_ids[], stock_id?} → lot คงเหลือคลังจ่าย (ค่าเริ่มต้น invs.default_stock_id) เรียง EXP → RECORD_NUMBER
- ปุ่ม "ยอดใช้ 180 วัน + lot INVS" (yesterday−179 … yesterday) · shared.js `calcAsuStats` / `calcPharmacyPlanV2` / `allocatePharmLots`
  - d̄ = max(เฉลี่ย 180 วัน, เฉลี่ย 60 วันล่าสุด) วันปฏิทิน × ตัวคูณ HOSxP→INVS · S = d̄ × (14 + 3 + SS) · SS ตาม `master_drugs.ven` V7/E3/N1 (แอดมินเลือกในตารางห้องยา ค่าเริ่มต้น N)
  - IP = คงเหลือ (เครดิตเดิม − ยอดใช้รอบนี้ หรือที่แก้เอง) + ค้างรับ · Q = S − IP → ปัดเต็มแพ็ก → ปัดเลขสวย (<10:1, ≤50:5, ≤200:10, ≤1000:50, >1000:100 ตามจำนวนแพ็ก) → ไม่เกิน Maximum
  - เคลียร์ lot: จัดสรร FEFO ถ้า lot สุดท้ายเหลือ ≤ max(20% ของ Q, 1 แพ็ก, 7 วันของ d̄) เบิกทั้ง lot (ไม่ปัดเลขสวย) · คลังใหญ่ไม่พอ = ลดเหลือที่มี + เตือน
  - ยาใช้น้อย (ยอด 17 วัน < 1 แพ็ก หรือ < 200 บาท): ข้ามจนกว่า IP < ยอด 17 วัน แล้วเบิกให้พอ ≥ 1 แพ็ก (สูงสุด 60 วัน, มูลค่า ≤ 2,000 บาท)
  - ไม่ใช่ยาใช้น้อย แต่ IP พอถึงรอบหน้าและยอดที่ขาด < minOrderValue = รวบไปรอบหน้า
- ตาราง: คอลัมน์ "Lot ที่หยิบ · เหลือหลังหยิบ" + หมายเหตุ เคลียร์ lot / ปัดจาก / ใช้น้อยสำรอง · ใบพิมพ์ห้องยา (`buildInternalReqFormHtml` `lotPickHtml`) แสดง "หยิบ Lot X (EXP) n → เหลือ m" ใต้ชื่อยา · Excel มีคอลัมน์ lot
- บันทึกในใบ: `formula:'asu180'`, `asu_from/asu_to`, items `asu{d180,d60,dbar,sigma,adi,cv2,activeDays}`, `ven`, `ssDays`, `asuTarget`, `asuNeed`, `slowMover`, `clearLot`, `roundUpQty`, `lotPlan[{lot_no,expiry,qty,lot_qty,remain}]`
- ส่ง INVS ยังเป็น 1 บรรทัด/ยาเหมือนเดิม (lot plan เป็นแผนหยิบ — ยืนยันตัด lot ใน INVS)
- ขั้นต่อไป (ยังไม่ทำ): Dashboard วันยาขาด/fill rate

## v6.14 VEN sync · คลังห้องยาแยก lot · Traceability
- VEN: Bridge `invs_extras` อ่าน `sawee_drug_class` (WORKING_CODE + VEN = V/E/N, มีเฉพาะยา) → หน้าต่าง "คำค้นหา/ตำแหน่ง INVS" แสดงคอลัมน์ VEN → บันทึก `master_drugs.ven` (ยาที่ไม่อยู่ในตารางคงค่าเดิม)
- ชื่อการค้า: Bridge `tradeJoinSql` = `drug_vn.TRADE_NAME` ผ่าน `inv_md_c.TRADE_CODE` → `invs_lots`, `lotsOnHand`, snapshot `lots_after[].trade_name`
- คลังห้องยาแยก lot (internal.html เมนู "คลังห้องยา (lot)" `PharmacyLotsView`): collection `pharmacy_lots` {dept_id, drug_id, lot_no, expiry YYYYMMDD, qty, trade_name, source INITIAL|RECEIPT, received_ymd, active} + `pharmacy_lot_meta/{dept}__{drug}` {initial_ymd, initialized} · บันทึก initial = ปิด lot เดิม (active:false) + lot ใหม่ + internal_stock.balance = ยอดนับ · ปุ่มเติม lot จากคลังใหญ่ INVS เป็นตัวช่วยกรอก
  - shared.js `pharmActiveLots` / `pharmLotsRemaining` / `pharmUsageSince`: คงเหลือ = lot (initial + RECEIPT ที่รับหลังวันนับ) − ยอดใช้ HOSxP หลังวันนับ (FEFO ตาม EXP)
  - PharmacyReqView: ยาที่บันทึก initial แล้ว ใช้คงเหลือจาก lot (ต้องกด "ยอดใช้ 180 วัน" ดึงย้อนครอบคลุมวันหลังนับ สูงสุด 400 วัน) · ยังไม่บันทึก = วิธีเดิม (เครดิต − ยอดใช้)
  - app.html `addPharmacyReceiptLots` (ใน completeInternalRequisition ห้องยา): lot ที่รับ = snapshot ตอนส่ง INVS (lots_after qty_issue / alloc) เฉพาะยาที่บันทึก initial · doc id `{dept}__{drug}__R__{reqId}__{i}` · ส่วนที่ไม่รู้ lot = "ไม่ทราบ lot"
  - rules v6.14: pharmacy_lots / pharmacy_lot_meta อ่าน = แอดมิน/หน่วยตัวเอง · เขียน = แอดมิน/ห้องยาของตัวเอง · ลบ = แอดมิน
- Traceability (ฐาน `sawee_trace` บนเครื่อง Bridge ใน LAN, schema `tools/sawee_trace_schema.sql`, config `trace.{enabled,database,host,user,password,port,log_file}` ไม่ระบุใช้ของ mysql.* · ฐานต้องไม่ใช่ฐาน INVS)
  - CLI `cli/trace_dispense.php` (ใน SYNC_BACKGROUND.bat ทำงานเมื่อ `trace.enabled=true`): อ่าน Firestore (meta/lots/master_drugs) + HOSxP `opitemrece` (hn, vn, an, rxdate, icode, qty) → `trace_dispense` (kind D จ่าย / R คืน → lot ล่าสุดของ HN นั้น / X ไม่มี lot) · `trace_lot` remain · `trace_drug_state` (initial เปลี่ยน = รีเซ็ต lot ของยา) · lot รับเข้าใช้ได้ตั้งแต่วันรับ · `--fixture` / `--until` สำหรับทดสอบ
  - Bridge `trace_query` {lot_no | hn, drug_id?, date_from?, date_to?} (admin/pharmacy, อ่านอย่างเดียว, 3,000 แถว) → internal.html เมนู "ย้อนรอย lot (Trace)" (`TraceView`, CSV) — ข้อมูลผู้ป่วยไม่เก็บใน Firestore
- tests/v614.js

## v6.15
- มูลค่าที่บันทึก = ราคา INVS ทั้ง 3 ระบบ: รพ.สต. (`handleApprove`) และใบภายใน หน่วยงาน/ห้องยา (`applyInvsPricesToItems` ใน doSendAndApprove / ปิดใบที่ส่ง INVS แล้ว) → price = cost ต่อหน่วยย่อย × บรรจุ VMI, `price_source:'INVS'`, `price_before_invs` · ก่อนส่ง INVS ยังแสดงราคาประมาณจาก master
- ใบพิมพ์พร้อมยอดคงเหลือ (คิวใบภายใน): ใช้ผลที่ Bridge ตอบกลับ (`data.items`, `data.sub_po_no`) ถ้าอ่านกลับจาก Firestore ไม่ได้ฟิลด์ INVS — เดิมใบว่าง "รวม 0 รายการ / เลขที่ INVS -" · แสดงคำเตือนถ้า Bridge บันทึกกลับ Firestore ไม่สำเร็จ
- คงคลัง/เหลือหลังเบิกแสดงหน่วยใหญ่ `formatQty` เช่น 9(50) ในใบพิมพ์พร้อมยอดคงเหลือ + หน้าตรวจก่อนส่ง INVS (รพ.สต. และคิวใบภายใน; บรรจุ = vmi_pack_size หรือ pack_ratio)
- ใบพิมพ์ห้องยา: ช่อง "คงเหลือ" = คลังใหญ่รวมทุก lot ที่เหลือหลังหยิบ (หน่วยใหญ่, `lotStockAfter`) + lot ที่ต้องหยิบ "43831 [7], 48NVSFSD [3(150)]" (ย้ายจากใต้ชื่อยา) · ไม่มีข้อมูล lot = เว้นว่างให้เขียน
- ใบเบิกด่วน: แอดมินเปิดใบหน่วยงานในคิว → แถบแดงแสดงใบด่วน Active ของหน่วยงานที่ยังไม่รวม · รอบเดียวกัน (round_id ตรง) รวมอัตโนมัติตอนกด "ตรวจ INVS แล้วอนุมัติ" · รอบอื่น/คีย์ย้อนหลังกด "รวมเข้าใบนี้" เอง (`mergeUrgents` → urgentQty, หมายเหตุ "รวมเบิกด่วน", ใบด่วน Merged + urgent_ids) — เดิมรวมเฉพาะตอนหน่วยงานสร้างใบ
- tests/v615.js

## v6.16
- Slip จัดยา (กระดาษต่อเนื่อง เครื่องพิมพ์ความร้อน เช่น Xprinter XP-420B): app.html `buildPickSlipHtml` (เรียงตามตำแหน่ง · เบิก/Lot/EXP/จำนวนหน่วยใหญ่ · เหลือคลัง · ช่องติ๊ก · ผู้จัด/ผู้ตรวจ) · `@page size: Wmm <สูงตามเนื้อหา>` วัดด้วยสคริปต์หลังฟอนต์โหลด
  - `InvsSheetPrintButton` เลือกกระดาษ A4 / Slip 80 / 58 / 100 มม. (localStorage `rxfill_slip_paper`, ค่าเริ่มต้น A4) ใช้แทนปุ่มพิมพ์ใบเบิกพร้อมยอดคงเหลือ (ใบ รพ.สต. + คิวใบภายใน) · หลังส่ง INVS ใบภายในพิมพ์ตามกระดาษที่เลือกไว้ (`printInvsSheet`)
  - ใบภายในที่อนุมัติโดยไม่มีเลข INVS: ปุ่ม slip (เฉพาะขนาด slip, `slipOnly`) ข้าง "พิมพ์ใบจัดยา" — slip ใช้รายการในใบ (dispenseQty) เว้นช่อง Lot/EXP ให้เขียน
- จ่ายล่วงหน้า "รับแล้ว" (เช่น น้ำเกลือ): collection `internal_predispense` {deptId, given_date, items[{drugId,qty หน่วยย่อย,...}], status Active|Merged|Cancelled} · rules: อ่าน = แอดมิน/หน่วยงานตัวเอง เขียน = แอดมินเท่านั้น
  - แอดมิน: คิวใบเบิกภายใน แท็บ "จ่ายล่วงหน้า (รับแล้ว)" (`PredispenseAdminView`) บันทึก/ยกเลิก (ยกเลิกได้เฉพาะที่ยังไม่อยู่ในใบใด) สถานะ รอรวม / อยู่ในใบ X / รวมแล้ว
  - รวมเข้าใบเบิกหน่วยงานรอบเร็วที่สุดที่เห็น: DeptReqView (ตอนสร้าง/แก้ใบ) หรือแอดมินตรวจ INVS (`mergePredisps` อัตโนมัติ + ปุ่มรวมตอนนี้) · ใบเก็บ `predisp_ids`, item `predispQty` · อนุมัติแล้วรายการเป็น Merged
  - ยอดรับแล้ว = `urgentQty` (ใบเบิกด่วน) + `predispQty` (shared.js `receivedQtyOf` / `regularQtyOf` / `qtyWithReceivedText`) · requestQty/dispenseQty = รวมทั้งหมด (ส่ง INVS/คิดเงิน) · DeptReqView ช่องจำนวน = ยอดเบิกปกติ ส่วนรับแล้วล็อก (ลบแถวไม่ได้) · แสดง "3+2(รับแล้ว)" ในตารางหน่วยงาน, แผงแอดมิน, ใบพิมพ์หน่วยงาน (ช่องจำนวนเบิก)
- tests/v616.js · ตัวอย่าง slip `docs/blueprint/screens/S01-pick-slip-80mm.png`

## v6.17 Slip จัดยา 80 มม. ฟอร์มเดียว (แทน v6.16 ตัวเลือกกระดาษ)
- ยกเลิก "ใบเบิกพร้อมยอดคงเหลือ A4" (`buildInvsStockSheetHtml`), ตัวเลือกกระดาษ (`SLIP_PAPERS`) และ "พิมพ์ใบจัดยา (เรียงตามตำแหน่ง)" (`printPickingList`) → เหลือ `PickSlipButton` "พิมพ์ slip จัดยา (80 มม.)" ปุ่มเดียว (ใบ รพ.สต. กล่อง INVS + คิวใบภายใน ทุกสถานะ)
- slip: ตำแหน่ง · ชื่อยา · รหัส (old_code) · เบิก หน่วยใหญ่ (×บรรจุ หน่วยย่อย) · รับแล้ว → หยิบ (predisp/urgent/emergency) · ทุก Lot ที่ตัด + EXP + จำนวนต่อ lot · เหลือคงคลัง หน่วยใหญ่(เศษ)
- ข้อมูล slip เก็บแยก `pick_slips/{rpst|internal}__{reqId}` (`buildPickSlipData`/`savePickSlip`) ตอนส่ง INVS จากผลที่ Bridge ตอบกลับ (`data.items`) → หลังส่งถาม "พิมพ์ slip จัดยา?" (`saveAndPromptPickSlip`, ใบ รพ.สต. ด้วย) · พิมพ์ย้อนหลัง `loadPickSlip`: pick_slips → snapshot INVS ในใบ (บันทึกเก็บด้วย) → ยังไม่ส่ง INVS = รายการในใบ เว้น Lot/คงคลังให้เขียน
- เหตุ: ใบที่อ่านฟิลด์ INVS กลับจาก Firestore/แคชไม่ได้ slip ขึ้น "ไม่มีข้อมูล INVS" ทั้งที่เพิ่งส่ง
- rules v6.17: `pick_slips` แอดมินเท่านั้น · tests v616 (ข้อ 6 พิมพ์ย้อนหลัง) / v615 / v612 · ตัวอย่าง `docs/blueprint/screens/S02-pick-slip-80mm-v617.png`
