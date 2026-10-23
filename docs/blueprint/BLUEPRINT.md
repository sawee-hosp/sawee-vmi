# Sawee Rxfill — Full System Blueprint & Audit

> ระบบเบิกยา/เติมยา VMI โรงพยาบาลสวี (รพ.สต. + หน่วยงานภายใน + ห้องยา) เชื่อม INVS / HOSxP / LINE OA
>
> | รายการ | ค่า |
> |---|---|
> | Repository | `sawee-hosp/sawee-vmi` branch `claude/project-continuation-h2c3rq` |
> | Commit ที่ตรวจ | `ebb2d0c` (โค้ด v6.11) + `026e090` (ภาพหน้าจอ) |
> | เวอร์ชันในโค้ด | `APP_VERSION = '6.10.0'` (`shared.js:32`) · Bridge `2.11.1` (`invs_api.php:31`) · VSTOCK `1.2.0` |
> | วันที่ตรวจ | 22 ต.ค. 2569 (2026-10-22) |
> | ผู้จัดทำ | Claude Code (บทบาท Software Architect / System Analyst / QA / Auditor) ตามคำขอของเภสัชกร รพ.สวี |
> | ภาพหน้าจอ | `docs/blueprint/screens/*.jpg` (29 ภาพ จากระบบทดสอบ ข้อมูลจำลอง) |

## สารบัญ

1. [Executive Summary](#1-executive-summary)
2. [Scope, Assumptions และ Limitations](#2-scope-assumptions-และ-limitations)
3. [Project and Technology Inventory](#3-project-and-technology-inventory)
4. [Sitemap และ Route Inventory](#4-sitemap-และ-route-inventory)
5. [Screen Inventory พร้อมภาพหน้าจอ](#5-screen-inventory-พร้อมภาพหน้าจอ)
6. [Functional Inventory](#6-functional-inventory)
7. [User Journey และ Workflow Diagrams](#7-user-journey-และ-workflow-diagrams)
8. [System Architecture Diagram](#8-system-architecture-diagram)
9. [Database Schema, Data Dictionary และ ER Diagram](#9-database-schema-data-dictionary-และ-er-diagram)
10. [API และ Integration Inventory](#10-api-และ-integration-inventory)
11. [User Roles และ Permission Matrix](#11-user-roles-และ-permission-matrix)
12. [Security, Reliability และ Performance Findings](#12-security-reliability-และ-performance-findings)
13. [QA Test Cases และ Test Results](#13-qa-test-cases-และ-test-results)
14. [Known Issues, Missing Features และ Technical Debt](#14-known-issues-missing-features-และ-technical-debt)
15. [Recommendations และ Remediation Plan](#15-recommendations-และ-remediation-plan)
16. [Traceability Matrix](#16-traceability-matrix)
17. [Appendix](#17-appendix)

### นิยามสถานะที่ใช้ในเอกสาร

| สถานะ | ความหมาย |
|---|---|
| **Verified** | มีหลักฐานโดยตรง: อ่านโค้ดแล้วพบ (ระบุไฟล์:บรรทัด) และ/หรือรันในระบบทดสอบแล้วได้ผลตามคาด (ระบุชื่อเทสต์/ภาพ) |
| **Partially Verified** | ยืนยันได้บางส่วน เช่น มีโค้ดและผ่านเทสต์ในระบบจำลอง แต่ยังไม่เคยรันกับ Firestore/INVS/LINE จริง |
| **Inferred** | อนุมานจากโค้ด/คอมเมนต์/ชื่อฟิลด์ ยังไม่มีหลักฐานการทำงานจริง |
| **Not Verified** | ไม่ได้ตรวจ หรือไม่มีเครื่องมือ/สิทธิ์ตรวจ |
| **Blocked** | ตรวจไม่ได้เพราะขาดสิทธิ์ ข้อมูล หรือไฟล์ประกอบ (ระบุสาเหตุ) |
| **Not Applicable** | ไม่เกี่ยวข้องกับระบบนี้ |

เพื่อไม่ปนกัน ตารางฟังก์ชันแยก 3 มิติเสมอ: **มีโค้ด** (code exists) · **สถานะการทำงาน** (working status) · **ผลทดสอบ** (test result: Pass / Fail / Not Run)

---

## 1. Executive Summary

**Sawee Rxfill** เป็นเว็บแอป static (React 18 + Babel ในหน้า) บน Firebase (Auth + Firestore) สำหรับงานเบิก-จ่ายยาแบบ VMI ของ รพ.สวี ครอบคลุม 3 กลุ่มผู้ใช้: **รพ.สต.** (เบิกรายเดือนจากยอดใช้ รบ.301), **หน่วยงานภายใน/ห้องยา** (เบิกตามรอบ) และ **แอดมิน/เภสัชกร** (ตรวจ จัดยา ส่งเข้า INVS) มีส่วนเสริม 3 ส่วนนอกเบราว์เซอร์:

1. **PHP Bridge** บนเครื่อง XAMPP ใน LAN (`bridge/SaweeRefill/public/invs_api.php`) อ่าน INVS/HOSxP (MySQL) และ**เขียนได้เฉพาะ `sm_po` / `sm_po_c`**
2. **CLI sync** (Task Scheduler) ดึงสถานะยืนยันจ่าย ล็อตยา และคำนวณคลังเสมือน (virtual stock) กลับเข้า Firestore
3. **Vercel functions** (`api/`) สำหรับ LINE OA: ผูกบัญชี แจ้งเตือนรายวัน แจ้งจัดยาเสร็จ และใบสรุปการจ่ายผ่านลิงก์ HMAC

**ภาพรวมผลตรวจ**

| ด้าน | สรุป | ระดับความมั่นใจ |
|---|---|---|
| ความครบของฟังก์ชันหลัก | เวิร์กโฟลว์หลักครบตั้งแต่สร้างใบ → ตรวจ → ส่ง INVS → อนุมัติ → กระทบยอดคลังเสมือน → แจ้ง LINE | Verified (โค้ด) / Partially Verified (ทดสอบในระบบจำลอง) |
| การทดสอบ | มี smoke test 17 ไฟล์ (Playwright + fake-firebase) ผลรันจริงอยู่ในหัวข้อ 13 ไม่มีการทดสอบกับ Firestore Rules จริง/INVS จริง | ดูหัวข้อ 13 |
| ความปลอดภัย | พบประเด็นระดับ **High** 3 เรื่อง: (S-01) สมัครสมาชิกเองแล้วได้สิทธิ์ รพ.สต./ห้องยาทันที (S-02) Rules ไม่จำกัดฟิลด์ที่ รพ.สต. แก้ในใบเบิก (S-03) รพ.สต. แก้ `current_excess` (เครดิต) และ `config_par` (Target) ของตัวเองได้ตรง | Verified (อ่าน rules + โค้ด) ยังไม่ได้ทดสอบกับ Emulator |
| ความทนทาน | มี idempotency ดีในส่วน INVS (marker `REF_NO`, cleanup partial, 2-phase approve) แต่ `api/` ไม่มี timeout และตัวนับโควตา LINE ไม่ atomic | Verified (โค้ด) |
| ประสิทธิภาพ | มี read-saver (IndexedDB + delta sync + tombstone) ลดการอ่าน Firestore; หน้า HTML คอมไพล์ JSX ในเบราว์เซอร์ทุกครั้ง (Babel standalone) ทำให้โหลดช้าบนเครื่องสเปกต่ำ | Verified (โค้ด) / Not Verified (ไม่ได้วัดเวลาจริง) |
| หนี้ทางเทคนิค | ไฟล์ `app.html` 10,874 บรรทัดในไฟล์เดียว, ไฟล์ legacy ที่ยังชี้ Firestore จริง, เทสต์บางไฟล์ชี้ path เครื่องเดิม, ไม่มี CI | Verified |

**ข้อเสนอเร่งด่วน (ดูหัวข้อ 15):** ปิดการสมัครแล้วใช้งานได้ทันที (ตั้ง `active:false` รออนุมัติ + rules บังคับ), จำกัดฟิลด์ที่ รพ.สต. แก้ได้ใน `requisitions`, ย้ายการเขียน `current_excess` ให้แอดมิน/เซิร์ฟเวอร์เท่านั้น, ใส่ auth ให้ Bridge `GET health`, เพิ่ม timeout ใน `api/` และทดสอบ rules ด้วย Firebase Emulator

> เอกสารนี้**ไม่อ้างว่าครบ 100%** — ครอบคลุมเท่าที่หลักฐานในรีโปและการรันในระบบทดสอบยืนยันได้ ส่วนที่อยู่นอกรีโป (ฐานข้อมูลจริง, INVS, HOSxP, Vercel, LINE, Sawee Refer) ระบุเป็น Not Verified/Blocked

---

## 2. Scope, Assumptions และ Limitations

### 2.1 ขอบเขต (Scope)

| อยู่ในขอบเขต | หมายเหตุ |
|---|---|
| `index.html`, `app.html`, `internal.html`, `shared.js` | หน้าเว็บที่ใช้งานจริง |
| `firebase/firestore.rules`, `firebase/firestore.indexes.json` | สิทธิ์และดัชนี |
| `api/*.js`, `api/_lib/core.js`, `vercel.json` | Vercel functions (LINE) |
| `bridge/SaweeRefill/**` | Bridge PHP + CLI + .bat (เฉพาะไฟล์ที่มีในรีโป) |
| `tests/**` | smoke tests |
| `CLAUDE.md` | ข้อตกลงที่ผู้ใช้ยืนยัน ใช้เป็นแหล่ง requirement |

| นอกขอบเขต / ไม่มีในรีโป | สถานะ |
|---|---|
| ระบบ Sawee Refer (`refer.html`, `liff.html`, `foot.js`, `screen.js`, `feedback.js`) — อยู่ในรีโปเดียวกันแต่เป็นอีกระบบ ใช้ Firebase project `sawee-refer` | Not Applicable (กล่าวถึงเฉพาะจุดเชื่อม NCDs) |
| ไฟล์ legacy `index2.html`, `index3.html`, `landing.html` | ไม่ถูกลิงก์จากหน้าใช้งาน (Inferred) — บันทึกเป็นหนี้ทางเทคนิค |
| `bridge/.../cli/lib_ncds_sync.php` (ถูก `require` ที่ `invs_api.php:718`) | **Blocked** — ไม่มีไฟล์ในรีโป |
| `C:\SaweeRefill\private\config.php`, service account | ห้ามอยู่ในรีโป (ตามนโยบาย) — Not Verified |
| Google Apps Script ที่ `GAS_DRIVE_URL` (`shared.js:18`) | Not Verified (ไม่มีซอร์ส) |

### 2.2 สมมติฐาน (Assumptions)

- A1. โค้ดใน branch นี้คือสิ่งที่ผู้ใช้จะ deploy (ผู้ใช้ merge เข้า main แล้ว GitHub Pages/Vercel เสิร์ฟ) — *Inferred* จาก CLAUDE.md
- A2. `firebase/firestore.rules` ในรีโปตรงกับที่ publish จริง — *Not Verified* (ผู้ใช้ publish เองผ่าน Console)
- A3. Bridge ที่ติดตั้งจริงที่ `C:\SaweeRefill\` เป็นเวอร์ชันเดียวกับรีโป (2.11.1) — *Not Verified*
- A4. ความหมายทางธุรกิจ (Target Stock, เครดิต, รอบบิล) ยึดตาม CLAUDE.md และคอมเมนต์ในโค้ด

### 2.3 ข้อจำกัด (Limitations)

| ข้อจำกัด | ผลต่อเอกสาร |
|---|---|
| ไม่มีสิทธิ์เข้าถึง Firestore production | Data dictionary มาจากโค้ดที่อ่าน/เขียน ไม่ใช่จากข้อมูลจริง; ไม่รู้จำนวนเอกสาร/ข้อมูลผิดรูปแบบจริง |
| ไม่มีสิทธิ์ INVS/HOSxP (MySQL) | SQL ของ Bridge ตรวจด้วยการอ่านโค้ด + MariaDB ในเครื่องที่สร้าง schema จำลอง (ทำไว้ในรอบพัฒนา v2.11) ไม่ใช่ข้อมูลจริง |
| ไม่มีสิทธิ์ Vercel / LINE Developers | ไม่ได้ตรวจ env vars จริง, cron log, โควตาจริง |
| ไม่ได้รัน Firebase Emulator | **ไม่มีการทดสอบ rules แบบรันจริง** — ข้อค้นพบด้าน rules เป็น Verified ระดับโค้ดเท่านั้น |
| CDN ถูกบล็อกในเครื่องทดสอบ | ภาพหน้าจอใช้ Tailwind 3.4.17 / Font Awesome 6.4.0 / Sarabun / Leaflet 1.9.4 ที่ build ในเครื่อง; tile แผนที่ OSM โหลดไม่ได้; ข้อมูลในภาพเป็น**ข้อมูลจำลอง** ไม่ใช่ข้อมูลผู้ป่วย/หน่วยงานจริง |
| Fake Firebase (`tests/fake-firebase.js`) | ไม่บังคับ security rules และไม่จำลอง index ที่ขาด — ผล Pass ของ UI test ไม่ได้ยืนยันสิทธิ์ |
| ไม่มีการทดสอบภาระ (load test) / วัดเวลาโหลด | ข้อสรุปด้าน performance เป็น Inferred จากโครงสร้างโค้ด |

**นโยบายข้อมูลลับ:** เอกสารนี้ระบุเฉพาะ*ชื่อ*การตั้งค่าและตำแหน่งจัดเก็บ ไม่คัดลอกค่า secret/token/password/ข้อมูลส่วนบุคคลใด ๆ และไม่มีการแก้ไขข้อมูลในระบบจริงระหว่างการตรวจ (ทุกการรันอยู่ใน fake-firebase ในเครื่อง)

---

## 3. Project and Technology Inventory

### 3.1 โครงสร้างไฟล์หลัก (ขนาดวัดจาก commit `ebb2d0c`)

| ไฟล์ | บรรทัด | บทบาท | สถานะ |
|---|---:|---|---|
| `index.html` | 493 | Landing / Login / Register / ลืมรหัสผ่าน | Verified |
| `app.html` | 10,874 | รพ.สต. + แอดมิน (21 view) | Verified |
| `internal.html` | 2,435 | หน่วยงานภายใน + ห้องยา | Verified |
| `shared.js` | 2,086 | utils, สูตรคำนวณ, ใบพิมพ์, Bridge client, read-saver cache, write hooks | Verified |
| `firebase/firestore.rules` | 540 | Security rules v6.9 | Verified |
| `firebase/firestore.indexes.json` | — | composite index 4 ชุด | Verified |
| `api/_lib/core.js` | 164 | Firestore REST, Google OAuth (JWT), LINE API, โควตา, verifyUser, HMAC | Verified |
| `api/line-webhook.js` | 69 | LINE webhook + GET bot info | Verified |
| `api/line-cron.js` | 155 | สรุปรายวัน/แจ้งหมดอายุ/เตือนตรวจนับ | Verified |
| `api/line-notify.js` | 81 | status / test / dispensed / unlink | Verified |
| `api/dispense-sheet.js` | 98 | ใบสรุปการจ่าย (ลิงก์ HMAC) | Verified |
| `vercel.json` | 5 | cron `0 8 * * *` | Verified |
| `bridge/SaweeRefill/public/invs_api.php` | 1,373 | Bridge หลัก (Bridge 2.11.1) | Verified |
| `bridge/SaweeRefill/htdocs/invs_api.php` | 3 | stub `require` ไปยัง `C:\SaweeRefill\public\` | Verified |
| `bridge/SaweeRefill/cli/sync_requisition_status.php` | 84 | ดึงสถานะยืนยันจ่าย INVS | Verified |
| `bridge/SaweeRefill/cli/sync_stock_lots.php` | 347 | สำเนาล็อต `inv_md_c` ของคลังย่อย | Verified |
| `bridge/SaweeRefill/cli/sync_virtual_stock.php` | 399 | engine คลังเสมือน | Verified |
| `bridge/SaweeRefill/cli/sync_master.php` | 719 | ราคา/บรรจุ/หน่วยจาก INVS (TEST เป็นค่าเริ่มต้น) | Verified |
| `bridge/SaweeRefill/cli/invs_diff.php` | 172 | เครื่องมือ diff INVS (อ่านอย่างเดียว) | Verified |
| `bridge/SaweeRefill/tools/SYNC_BACKGROUND.bat`, `INVS_DIFF.bat` | — | ตัวรัน Task Scheduler / เครื่องมือ | Verified |
| `tests/*.js` | — | 17 สคริปต์ทดสอบ + harness | Verified |
| `docs/rpst_SML_2568.xlsx` | — | รายการยาตามขนาด รพ.สต. S/M/L | Verified |
| `garuda.png` | — | ครุฑในใบ ว.3/1 | **Not Verified** — ผู้ใช้ยังต้องจัดหาไฟล์ภาพที่ถูกต้อง (fallback data URI เดิมเสีย) |

### 3.2 เทคโนโลยีและเวอร์ชัน

| ชั้น | เทคโนโลยี | เวอร์ชัน / แหล่ง | หลักฐาน |
|---|---|---|---|
| UI runtime | React + ReactDOM UMD | 18.2.0 (unpkg) | `app.html` `<script>` |
| JSX | @babel/standalone (คอมไพล์ในเบราว์เซอร์) | 7.23.6 (unpkg) | `app.html`, `internal.html`, `index.html` |
| CSS | Tailwind Play CDN | ไม่ระบุเวอร์ชัน (`cdn.tailwindcss.com`) | ทั้ง 3 HTML |
| ไอคอน / ฟอนต์ | Font Awesome 6.4.0 (cdnjs), Google Fonts Sarabun | — | `app.html` |
| Firebase | compat SDK app/auth/firestore | 10.8.0 (gstatic) | ทั้ง 3 HTML |
| ไฟล์ Excel/CSV | SheetJS xlsx 0.18.5, PapaParse 5.4.1 | cdnjs | `app.html`, `internal.html` |
| แผนที่ | Leaflet 1.9.4 + OSM tiles | unpkg | `app.html:6263` |
| QR | qrcodejs 1.0.0 | cdnjs | `app.html` (LineLinkPanel) |
| Serverless | Vercel Node functions (ไม่มี dependency) | Node runtime ของ Vercel (ไม่ระบุ) | `api/` |
| Bridge | PHP + mysqli + curl บน XAMPP (Windows) | ไม่ระบุเวอร์ชัน PHP (ใช้ `str_contains` → ต้อง PHP ≥ 8.0 — *Inferred*) | `invs_api.php:597` |
| ฐานข้อมูล | Cloud Firestore (project `sawee-rxfill`), INVS MySQL/MariaDB, HOSxP MySQL | — | `shared.js:11`, Bridge config keys |
| รองรับข้อความ | LINE Messaging API | v2 | `core.js:97` |
| ทดสอบ | Playwright (global) + Chromium `/opt/pw-browsers`, TypeScript (transpile JSX), fake-firebase | — | `tests/` |

**ข้อสังเกต:** ไม่มี `package.json`, ไม่มี bundler, ไม่มี CI (`.github/workflows` ไม่มี) — Verified. ทุก dependency ฝั่งเว็บโหลดจาก CDN ตอนเปิดหน้า

### 3.3 การตั้งค่า (ชื่อเท่านั้น — ไม่มีค่า)

| ที่เก็บ | ชื่อการตั้งค่า | หมายเหตุ |
|---|---|---|
| Vercel env | `FIREBASE_SERVICE_ACCOUNT`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_BOT_ID`, `LINE_MONTHLY_LIMIT`, `CRON_SECRET`, `SHEET_SECRET`, `SITE_URL`, `FIREBASE_WEB_API_KEY` | `core.js:5-12,99,110,152`; `line-cron.js:144` |
| `C:\SaweeRefill\private\config.php` | `mysql.*`, `firebase.{project_id,service_account_json,web_api_key}`, `bridge.{allow_live_send,log_file}`, `invs.{default_stock_id,user_id,client_ip,mod_sys,patient_dept_id,block_if_first_lot_short}`, `hosxp.*`, `invs_extra.*`, `status_sync.*`, `lot_sync.*`, `virtual_stock.*`, `sync.*` | อ่านผ่าน `cfg()` ใน Bridge/CLI |
| env เครื่อง Bridge | `SAWEE_RXFILL_INVS_CONFIG` (path ไฟล์ config ทางเลือก) | `invs_api.php:49-62` |
| ฝังในโค้ด (สาธารณะโดยธรรมชาติ) | Firebase web config (`shared.js:8-16`), Sawee Refer web config (`app.html:10001`), `GAS_DRIVE_URL` (`shared.js:18`), Bridge URL `127.0.0.1` / `192.168.40.90` (`shared.js:34,740`) | Firebase web API key ไม่ใช่ secret แต่ควรจำกัด referrer; `core.js:6` ใช้ค่าเดียวกันเป็น fallback |
| localStorage ฝั่งผู้ใช้ | `rxfill_ph_hide_types`, `rxfill_stock_view`, `rxfill_stock_tab`, fuzzy cache, usage override | ค่าความสะดวกต่อเครื่อง |

---

## 4. Sitemap และ Route Inventory

ระบบเป็น multi-page static + SPA ภายในหน้า (ไม่มี URL router — สลับ view ด้วย state `currentView`) จึงไม่มี deep link ไปยังหน้าย่อย (Verified: `app.html:10548,10568`)

```mermaid
flowchart TD
  IDX["index.html<br/>Landing / Login / Register"] -->|role = hospital / admin| APP["app.html"]
  IDX -->|role = dept / pharmacy| INT["internal.html"]
  APP -->|role ภายใน| INT
  APP -.->|admin: ลิงก์ เบิกยาห้องยา/หน่วยงาน| INT
  INT -.->|ไม่มี session| IDX
  APP -.->|ไม่มี session / ไม่มีโปรไฟล์| IDX

  subgraph APPV["app.html views"]
    D[dashboard] --- CR[create_req] --- VR[view_req] --- MS[my_stock]
    MS --- RT[return_drug] --- IL[invs_lots]
    ER[emergency_req] --- VC[vaccine_req] --- KPI[rpst_kpi] --- DH[drug_history]
    PE[profile_edit]
    subgraph ADM["admin only"]
      MAP[map_dashboard] --- RS[req_summary] --- IQ[internal_queue] --- CS[count_status]
      NM[ncds_mapping] --- SS[substock_sync] --- LC[line_console] --- CFG[config]
      SR[summary_report] --- IUR[item_usage_report]
    end
  end
  APP --> APPV

  subgraph INTV["internal.html views"]
    N[new: สร้างใบเบิก] --- H[history: ใบเบิกของฉัน] --- U[urgent: เบิกยาด่วน]
    PH[ห้องยา: PharmacyReqView ประมาณการ/ดึง HOSxP] --- ST[stock / estimate]
  end
  INT --> INTV
```

### 4.1 หน้า (Pages) และการเปลี่ยนเส้นทาง

| URL | ผู้ใช้ | เงื่อนไขเข้า | Redirect | หลักฐาน |
|---|---|---|---|---|
| `/index.html` | ทุกคน | ไม่ต้อง login | login สำเร็จ → `homePageForRole` (`dept/pharmacy` → `internal.html`, อื่น ๆ → `app.html`); โปรไฟล์ไม่มี/`active===false` → sign-out | `index.html:422-458`, `shared.js:301` |
| `/app.html` | admin, hospital | `onAuthStateChanged` + `users/{uid}` ต้องมี | ไม่มี user → `index.html`; role ภายใน → `internal.html` | `app.html:10716-10746` |
| `/internal.html` | dept, pharmacy (+admin) | ต้อง login | ไม่มี session → `index.html` | `internal.html` (รายงาน agent) |
| `/api/line-webhook` | LINE / เว็บ | GET สาธารณะ, POST ลายเซ็น LINE | — | `api/line-webhook.js:49-59` |
| `/api/line-cron` | Vercel Cron / แอดมิน | `Bearer CRON_SECRET` หรือ idToken แอดมิน | — | `api/line-cron.js:143-150` |
| `/api/line-notify` | ผู้ใช้ที่ login | idToken | — | `api/line-notify.js:48` |
| `/api/dispense-sheet?c=&id=&t=` | ใครก็ได้ที่มีลิงก์ | HMAC token | — | `api/dispense-sheet.js:45-62` |
| `http://127.0.0.1/SaweeRefill/invs_api.php` (+ `192.168.40.90`) | เบราว์เซอร์ใน LAN | POST + Firebase ID token; GET health ไม่ต้อง auth | — | `shared.js:34,740-790`, `invs_api.php:591-623` |

### 4.2 Route (view) ใน `app.html`

| view key | Component (บรรทัด) | เมนู/ทางเข้า | บทบาทที่เห็นเมนู | Gate ตอน render | ภาพ |
|---|---|---|---|---|---|
| `dashboard` | DashboardView (1111) | "แดชบอร์ด" | ทุกบทบาท | — | A01, H01 |
| `create_req` | CreateReqGate (9379) → RpstRoundPick (9339) → CreateReqView (2633) | "เบิกยา / เติมยา"; แอดมินผ่าน "อัปโหลดแทน" | hospital (+admin ทางอ้อม) | **ไม่มี** | H02 |
| `view_req` | ViewReqView (4119) | คลิกแถวในแดชบอร์ด/แผนที่/คลังยา | ทุกบทบาท | — | A02 |
| `my_stock` | MyStockView (1889) | "ชั้นยาของฉัน" / "คลังยา รพ.สต." | hospital, admin | — | A03, H03-H05 |
| `return_drug` | ReturnDrugView (1367) | ปุ่ม "ตรวจนับ / คืนยา" ในคลังยา | hospital | — | H08 |
| `invs_lots` | InvsLotView (1652) | ปุ่ม "Lot รพ.สวี" | hospital, admin | — | — |
| `emergency_req` | EmergencyReqView (606) | "เบิกยาฉุกเฉิน (ใบ ฉ)" | hospital, admin | — | A14, H06, H07 |
| `vaccine_req` | VaccineReqView (6945) | "เบิกวัคซีน (ว.3/1)" | hospital, admin | — | A15, H09 |
| `rpst_kpi` | RpstKpiView (9903) | "ตัวชี้วัด รพ.สต." | hospital, admin | — | A12 |
| `drug_history` | DrugHistoryView (5935) | "ประวัติการใช้ยา" | ทุกบทบาท | — | A13 |
| `profile_edit` | ProfileEditView (1081) | "แก้ไขข้อมูลส่วนตัว" | ทุกบทบาท | — | H10 |
| `map_dashboard` | MapDashboardView (6053) | "VMI Map Dashboard" | admin | `role==='admin'` | A06 |
| `req_summary` | ReqSummaryView (9406) | "สรุปการเบิก" | admin | `role==='admin'` | A05 |
| `internal_queue` | InternalQueueView (8774) | "คิวใบเบิกภายใน รพ." | admin | `role==='admin'` | A04 |
| `count_status` | StockCountStatusView (10185) | "สถานะตรวจนับ รพ.สต." | admin | `role==='admin'` | A08 |
| `ncds_mapping` | NcdsMappingView (10244) | "จับคู่ยา NCDs" | admin | `role==='admin'` | A09 |
| `substock_sync` | SubstockSyncView (745) | "คลังย่อย รพ.สต. → INVS" | admin | `role==='admin'` | A07 |
| `line_console` | LineConsoleView (957) | "LINE Console" | admin | `role==='admin'` | A10 |
| `config` | AdminConfigView (7335) | "จัดการฐานข้อมูล" | admin | **ไม่มี** (ซ่อนแค่เมนู) | A11 |
| `summary_report` | SummaryReportView (5693) | ปุ่มในแดชบอร์ดแอดมิน | admin | ไม่มี | — |
| `item_usage_report` | ItemUsageReportView (5800) | ปุ่มในแดชบอร์ดแอดมิน | admin | ไม่มี | — |

Render switch อยู่ที่ `app.html:10831-10851`, เมนูที่ `app.html:10797-10815` — Verified

### 4.3 Route (view) ใน `internal.html`

| View | Component | บทบาท | ภาพ |
|---|---|---|---|
| สร้างใบเบิก (เลือกรอบ → กรอก) | RoundPickStep (431) → DeptReqView (619) / PharmacyReqView (942) | dept / pharmacy (+admin เลือกวันที่เอง `manual_backdate`) | I02 |
| ใบเบิกของฉัน | ประวัติ + กล่องพิมพ์ใบเบิก | dept / pharmacy | I01 |
| เบิกยาด่วน | UrgentReqView (1784) | dept | I03 |
| ประมาณการ / คลังห้องยา | PharmacyReqView + `buildUsageEstimateHtml` (internal.html:2063) | pharmacy | — (ไม่ได้ถ่าย) |

---

## 5. Screen Inventory พร้อมภาพหน้าจอ

**วิธีได้ภาพ:** Playwright + Chromium เปิดหน้า HTML ที่คอมไพล์ JSX ล่วงหน้า เชื่อม `tests/fake-firebase.js` พร้อมข้อมูลจำลอง (รพ.สต. 2 แห่ง ยา 3 รายการ ล็อต 3 ล็อต ใบเบิก 1 ใบ ใบ ฉ 1 ใบ ผลตรวจนับ 1 ครั้ง) ใช้ CSS/ฟอนต์ที่ build ในเครื่อง เพราะ CDN ถูกบล็อก ขนาดจอ 1366×820 เก็บที่ `docs/blueprint/screens/`
**สถานะภาพ:** Verified ว่าหน้าจอ render ได้ในระบบจำลอง **ไม่ใช่** ภาพจาก production และตัวเลขในภาพเป็นข้อมูลสมมติ

### 5.1 แอดมิน (`app.html`)

| รหัส | หน้าจอ | องค์ประกอบหลัก | ภาพ |
|---|---|---|---|
| A01 | แดชบอร์ดแอดมิน | การ์ด KPI รอบ, ตารางสถานะ รพ.สต. รายเดือน, ใบล่าสุดเรียงใหม่→เก่า, ปุ่มรายงาน | ![A01](screens/A01-admin-dashboard.jpg) |
| A02 | ดูใบเบิก รพ.สต. (แอดมิน) | ตรวจสอบมูลค่า, แก้เลขใบ, ซ่อน/แสดงรายการ, พิมพ์, ลบ, ไม่อนุมัติ, **ส่ง INVS + บันทึกจัดยา**, รายการส่ง INVS เพิ่ม, เพิ่มยา, ฟอร์มทางการ | ![A02](screens/A02-admin-view-requisition.jpg) |
| A03 | คลังยา รพ.สต. (แอดมินเลือก รพ.สต.) | Virtual Shelf / โหมดตาราง / ตรวจนับ | ![A03](screens/A03-admin-my-stock.jpg) |
| A04 | คิวใบเบิกภายใน รพ. | คิว FIFO ตาม `submitted_at`, ตัวกรองชนิด, แผงตรวจ/ส่ง INVS | ![A04](screens/A04-admin-internal-queue.jpg) |
| A05 | สรุปการเบิก | แท็บตามหน่วยงาน/ตามรายการยา, ตัวกรองปีงบ/รอบ/สถานะ, CSV/พิมพ์ | ![A05](screens/A05-admin-req-summary.jpg) |
| A06 | VMI Map Dashboard | ตัวกรอง, การ์ดสรุปมูลค่า, แผนที่ Leaflet (tile OSM โหลดไม่ได้ในระบบทดสอบ) | ![A06](screens/A06-admin-map.jpg) |
| A07 | คลังย่อย รพ.สต. → INVS | เลือก รพ.สต., โหมดตัดตามยอดใช้/ปรับให้เท่ายอดจริง, ตรวจกับ INVS, ประวัติ | ![A07](screens/A07-admin-substock.jpg) |
| A08 | สถานะตรวจนับ รพ.สต. | ตาราง นับแล้ว/ยังไม่นับ เดือนนี้, ส่วนต่างสูง | ![A08](screens/A08-admin-count-status.jpg) |
| A09 | จับคู่ยา NCDs | icode ที่ยังไม่จับคู่ (ทุก รพ.สต.) + คำแนะนำชื่อใกล้เคียง | ![A09](screens/A09-admin-ncds-mapping.jpg) |
| A10 | LINE Console | โควตา, ผู้ผูก/ยังไม่ผูก, ทดสอบ/ดูตัวอย่าง/ส่งสรุป, ประวัติ 50 รายการ | ![A10](screens/A10-admin-line-console.jpg) |
| A11 | จัดการฐานข้อมูล | 12 แท็บ (ยา, หมวด, หน่วย, รพ.สต., หน่วยงาน, รอบ, แบบประเมิน, โควตา, อนุมัติปรับยอด, ผู้ใช้, raw, ประวัติ) | ![A11](screens/A11-admin-config.jpg) |
| A12 | ตัวชี้วัด รพ.สต. | KPI รายใบ/ปีงบ, CSV | ![A12](screens/A12-admin-kpi.jpg) |
| A13 | ประวัติการใช้ยา | 6 เดือน ADU/AMU/SD | ![A13](screens/A13-admin-history.jpg) |
| A14 | เบิกยาฉุกเฉิน (ใบ ฉ) — มุมแอดมิน | รายการใบ ฉ ทุก รพ.สต. | ![A14](screens/A14-admin-emergency.jpg) |
| A15 | เบิกวัคซีน ว.3/1 — มุมแอดมิน | ฟอร์ม contentEditable, เลือก รพ.สต./เดือน | ![A15](screens/A15-admin-vaccine.jpg) |

### 5.2 รพ.สต. (`app.html`)

| รหัส | หน้าจอ | องค์ประกอบหลัก | ภาพ |
|---|---|---|---|
| H01 | แดชบอร์ด รพ.สต. | ปุ่มหลักตามสถานะรอบ, ทางลัดคลังยา/INVS Lot/วัคซีน | ![H01](screens/H01-rpst-dashboard.jpg) |
| H02 | เบิกยา / เติมยา | เลือกรอบ → อัปโหลด รบ.301 → ตารางคำนวณ → ส่ง | ![H02](screens/H02-rpst-create-requisition.jpg) |
| H03 | ชั้นยาของฉัน — Virtual Shelf | การ์ดสรุป, ชั้นลากวาง | ![H03](screens/H03-rpst-stock-shelf.jpg) |
| H04 | ชั้นยาของฉัน — โหมดตาราง | แก้ Lot/EXP/คงเหลือ, ตัวกรองหมดอายุ/≤180 วัน | ![H04](screens/H04-rpst-stock-table.jpg) |
| H05 | ชั้นยาของฉัน — ตรวจนับ | พิมพ์ใบตรวจนับ, คีย์ผลนับ, ประวัติ | ![H05](screens/H05-rpst-stock-count.jpg) |
| H06 | ใบ ฉ — รายการ | ใบ ฉ ของ รพ.สต. | ![H06](screens/H06-rpst-emergency.jpg) |
| H07 | ใบ ฉ — สร้างใหม่ | เหตุผล, ค้นหายาใน config_par, ผลตรวจ เขียว/เหลือง/แดง | ![H07](screens/H07-rpst-emergency-new.jpg) |
| H08 | คืนยา | รายล็อต, ยอดมีจริง → คำนวณคืน FEFO, รายการเพิ่มเอง | ![H08](screens/H08-rpst-return.jpg) |
| H09 | เบิกวัคซีน ว.3/1 | ฟอร์มพิมพ์ | ![H09](screens/H09-rpst-vaccine.jpg) |
| H10 | แก้ไขข้อมูลส่วนตัว | ชื่อ/ตำแหน่ง + LineLinkPanel (QR, รหัส 6 หลัก) | ![H10](screens/H10-rpst-profile.jpg) |

### 5.3 หน่วยงานภายใน (`internal.html`) และหน้าแรก

| รหัส | หน้าจอ | องค์ประกอบหลัก | ภาพ |
|---|---|---|---|
| I01 | ใบเบิกของฉัน | ประวัติ + กล่องพิมพ์ใบเบิก | ![I01](screens/I01-dept-history.jpg) |
| I02 | สร้างใบเบิก — เลือกรอบ | รอบถัดไป, วันส่งสมุดเบิก (ก่อนรอบ 2 วัน) | ![I02](screens/I02-dept-new-round.jpg) |
| I03 | เบิกยาด่วน | เลือกรอบที่ยังไม่ยืนยันจ่าย | ![I03](screens/I03-dept-urgent.jpg) |
| X01 | หน้าแรก / เข้าสู่ระบบ | แท็บ Refill/Refer, login, สมัคร, ลืมรหัสผ่าน | ![X01](screens/X01-index.jpg) |

### 5.4 หน้าจอที่ไม่ได้ถ่าย (Not Verified ด้วยภาพ)

| หน้าจอ | เหตุผล |
|---|---|
| PharmacyReqView (ห้องยา: ดึง HOSxP / ประมาณการ) | ต้องเรียก Bridge `hosxp_usage` (ไม่มีในระบบทดสอบ) — มีเทสต์ `v64`, `v66` ครอบคลุมบางส่วน |
| Modal ส่ง INVS (preflight) | ต้องเรียก Bridge — `v69_invs_stock` จำลองผล preflight แทน |
| InvsLotView, SummaryReportView, ItemUsageReportView | ไม่ได้อยู่ในชุดภาพ (เข้าถึงผ่านปุ่ม ไม่ใช่เมนู) |
| ใบพิมพ์ทั้งหมด (ห้องยา/หน่วยงาน/รพ.สต./คืนยา/ตรวจนับ/ใบ ฉ/ใบเบิกพร้อมยอดคงเหลือ) | ตรวจด้วยเทสต์ที่อ่าน HTML ที่สร้าง (เช่น `v64`, `v665`, `v670`, `v610_count`) ไม่ได้แนบภาพ |
| `api/dispense-sheet` | ต้องมี Firestore จริง + secret |

---

## 6. Functional Inventory

คอลัมน์: **โค้ด** = พบโค้ดจริง (Verified/Not found) · **การทำงาน** = ระดับการยืนยันว่าทำงาน · **ทดสอบ** = ผลรันเทสต์วันที่ 22 ต.ค. 69 (ดูหัวข้อ 13) — `Not Run` หมายถึงไม่มีเทสต์อัตโนมัติ

### 6.1 รพ.สต. (Requisition / Stock)

| ID | ฟังก์ชัน | หลักฐานโค้ด | โค้ด | การทำงาน | ทดสอบ |
|---|---|---|---|---|---|
| F-R01 | เลือกรอบเบิก รพ.สต. (req_rounds scope rpst) | `app.html:9339-9389` | Verified | Inferred | Not Run |
| F-R02 | อัปโหลด รบ.301 (.csv/.xls/.xlsx) + ตรวจช่วงวันที่ | `app.html:3054-3083`, `shared.js:834` | Verified | Partially Verified | Not Run (fake XLSX) |
| F-R03 | จับคู่ชื่อยา exact/fuzzy/partial + เรียนรู้ alias | `app.html:3087-3113, 2960, 2994` | Verified | Inferred | Not Run |
| F-R04 | คำนวณ Target VMI / ยอดจ่ายแนะนำ (`recalcVmiItem`) | `shared.js:616-680` | Verified | Partially Verified | Pass (v64 rpst order) |
| F-R05 | รวมยอด NCDs ออกหน่วย (Sawee Refer) | `app.html:2903-2926, 10050` | Verified | Partially Verified | Pass (v64 ncds ×3) |
| F-R06 | รวมใบ ฉ เข้าใบหลัก (`emergencyQty` แดง ล็อก) | `app.html:2789-2797, 3245, 3414-3420` | Verified | Partially Verified | Pass (v69_emergency) |
| F-R07 | ส่งใบ (Draft/Pending) + อัป Excel ไป GAS | `app.html:3208-3399` | Verified | Partially Verified (GAS ไม่ได้ทดสอบ) | Not Run |
| F-R08 | ตัดยอดใช้ รบ.301 ออกจากคลังเสมือนทันที (v6.11) | `app.html:897-940` | Verified | Inferred | Not Run |
| F-R09 | ล็อกใบหลังพิมพ์ (`is_printed`) | `app.html:5094-5131`, `shared.js:712` | Verified | Inferred | Not Run |
| F-R10 | ผู้ลงนามท้ายใบ `sign_roles/sign_names` | `app.html:4087, 5184-5190` | Verified | Partially Verified | Pass (v664) |
| F-R11 | คลังยาของฉัน Virtual Shelf / ตาราง / Excel | `app.html:1889-2484` | Verified | Partially Verified | **v69_stock: 4 Pass / 1 Fail** (ดู T-15) |
| F-R12 | สมมติยอดจริง = Target Stock (`effectiveLots`) | `app.html:1992-2011` | Verified | Partially Verified | Pass (v69_stock FEFO trim) |
| F-R13 | ตรวจนับ: พิมพ์ใบ, คีย์ผล, ปรับล็อต FEFO, `vmi_stock_counts` | `app.html:2263-2328`, `shared.js:1327` | Verified | Partially Verified | Pass (v610_count) |
| F-R14 | คืนยา รายล็อต + ใบพิมพ์ทางการ | `app.html:1367-1640`, `shared.js:1235-1301` | Verified | Partially Verified | Pass (v670) |
| F-R15 | ใบ ฉ ตรวจผ่าน/ไม่ผ่าน/ข้อสังเกต + พิมพ์ | `app.html:552-660` | Verified | Partially Verified | Pass (v69_emergency) |
| F-R16 | ใบวัคซีน ว.3/1 | `app.html:6945-7083`, `shared.js:216-281` | Verified | Inferred | Not Run |
| F-R17 | INVS Reference Lot/EXP (read-only) | `app.html:1652-1700` | Verified | Inferred | Not Run |
| F-R18 | ประวัติการใช้ยา / KPI | `app.html:5935, 9903` | Verified | Partially Verified | Pass (v64 kpi) |

### 6.2 แอดมิน — จัดยา / INVS

| ID | ฟังก์ชัน | หลักฐานโค้ด | โค้ด | การทำงาน | ทดสอบ |
|---|---|---|---|---|---|
| F-A01 | แดชบอร์ด เรียงใหม่→เก่า แยกผู้ทำรายการ/รพ.สต. | `app.html:1111-1360` | Verified | Partially Verified | Pass (v664) |
| F-A02 | แก้จำนวนจ่าย / เพิ่มยา / rematch / ไม่อนุมัติ / ลบ | `app.html:4270-4720, 4816, 5047, 5072` | Verified | Inferred | Not Run |
| F-A03 | รายการส่ง INVS เพิ่ม (`invs_extra_items`) | `app.html:4176`; `invs_api.php` (merge) | Verified | Partially Verified | Pass (v663 ×2) |
| F-A04 | ปุ่มเดียว "ส่ง INVS + บันทึกจัดยา" (บันทึก→preflight→send→approve) | `app.html:4772-4809, 5238` | Verified | Partially Verified | Pass (v664 "only combined button") |
| F-A05 | Bridge preflight/send → `sm_po`/`sm_po_c` (idempotent marker) | `invs_api.php:482-573, 1253-1367` | Verified | Partially Verified (MariaDB จำลอง schema ระหว่างพัฒนา) | Not Run (ไม่มีเทสต์อัตโนมัติ PHP) |
| F-A06 | อนุมัติ 2 เฟส (Approving token → Completed) + `current_excess`/`historical_usages` | `app.html:4859-5045` | Verified | Inferred | Not Run |
| F-A07 | ส่ง INVS ย้อนหลัง (Completed ที่ไม่มีเลข) | `app.html:5209` | Verified | Inferred | Not Run |
| F-A08 | พิมพ์ใบเบิกพร้อมยอดคงเหลือ (snapshot ล็อต) | `app.html:508, 5253, 8616` | Verified | Partially Verified | Pass (v69_invs_stock — log-only) |
| F-A09 | ส่งคลังย่อย INVS ตามยอดใช้อัตโนมัติ (`postUsageInvs`) | `app.html:942-952`; `invs_api.php:995-1114` | Verified | Inferred | Not Run |
| F-A10 | SubstockSyncView (ตัดตามยอดใช้ / ปรับให้เท่ายอดจริง) | `app.html:745-830` | Verified | Partially Verified | Pass (v610_substock) |
| F-A11 | คิวใบเบิกภายใน (FIFO, ส่ง INVS, อนุมัติ, ไม่อนุมัติ) | `app.html:8232-8786` | Verified | Partially Verified | Pass (v66, v665 บางส่วน) |
| F-A12 | สถานะตรวจนับ + ส่วนต่างสูง | `app.html:10182-10202` | Verified | Partially Verified | Pass (v611_count_status) |
| F-A13 | จับคู่ยา NCDs | `app.html:10244-10340` | Verified | Partially Verified | Pass (v611 "ncds view renders") |
| F-A14 | Sync รายการยาจาก INVS (`invs_master` modal) | `app.html:8294`; `invs_api.php:962` | Verified | Inferred | Not Run |
| F-A15 | ตำแหน่งยา/คำค้น (`invs_extras`) | `app.html:8414`; `invs_api.php:1119` | Verified | Inferred | Not Run |
| F-A16 | Sync รหัส HOSxP (`sync_hosxp_codes`) | `app.html:7347`; `invs_api.php:654` | Verified | Inferred | Not Run |
| F-A17 | จัดการ master (ยา หน่วย รพ.สต. หน่วยงาน รอบ ผู้ใช้) | `app.html:7335-9186` | Verified | Inferred | Not Run |
| F-A18 | ควบคุมแคช: bump epoch / ล้างแคช / QuotaPanel | `shared.js:1662-1673` | Verified | Inferred | Not Run |
| F-A19 | Map Dashboard | `app.html:6053-6400` | Verified | Partially Verified (render ในภาพ A06) | Not Run |
| F-A20 | แบบประเมินการใช้งาน (feedback) | `shared.js:1754-1995`; `app.html:9670-9768` | Verified | Inferred | Not Run |

### 6.3 หน่วยงานภายใน / ห้องยา

| ID | ฟังก์ชัน | หลักฐานโค้ด | โค้ด | การทำงาน | ทดสอบ |
|---|---|---|---|---|---|
| F-D01 | เลือกรอบ / แอดมินคีย์ย้อนหลัง (`manual_backdate`) | `internal.html:431-447` | Verified | Partially Verified | Pass (v69_urgent "round offered") |
| F-D02 | ใบหน่วยงาน (template จากใบล่าสุด) | `internal.html:615-732` | Verified | Partially Verified | Pass (v665) |
| F-D03 | เบิกยาด่วน + รวมเข้าใบรอบ (`urgentQty`) | `internal.html:622-649, 1740-1837` | Verified | Partially Verified | **v69_urgent: 9 Pass / 1 Fail** (ดู T-14) |
| F-D04 | ห้องยา: ดึงยอดใช้ HOSxP / นำเข้าไฟล์ / map icode | `internal.html:889-1151` | Verified | Inferred (ไม่มี Bridge ในเทสต์) | Not Run |
| F-D05 | ห้องยา: คำนวณ `calcPharmacySuggestion` + ซ่อนหมวด 5/6 | `shared.js:962-986`; `internal.html:1045-1081` | Verified | Partially Verified | Pass (v64, v66) |
| F-D06 | Draft "รอส่ง" / ลบใบรอส่ง (Cancelled + `draft_deleted`) | `internal.html:1234, 1602` | Verified | Partially Verified | Pass (v64 draft ×3) |
| F-D07 | ใบพิมพ์ห้องยา/หน่วยงาน (`buildInternalReqFormHtml`) | `shared.js:1100` | Verified | Partially Verified | Pass (v64, v663, v665) |
| F-D08 | ค้นหายา (รหัสตรงก่อน, ชื่อพ้อง, รูป) | internal.html (ช่องค้นหา) | Verified | Partially Verified | Pass (v665 ×3) |
| F-D09 | พิมพ์ใบเบิกของฉัน + ล็อกวันที่ผู้เบิก | internal.html (กล่องพิมพ์) | Verified | Partially Verified | Pass (v69_urgent print box/date locked) |

### 6.4 Auth / LINE / Background

| ID | ฟังก์ชัน | หลักฐานโค้ด | โค้ด | การทำงาน | ทดสอบ |
|---|---|---|---|---|---|
| F-X01 | Login / remember-me / redirect ตามบทบาท | `index.html:422-458` | Verified | Partially Verified (render X01) | Not Run |
| F-X02 | สมัครสมาชิกเอง (เลือกบทบาท) | `index.html:330-350` | Verified | Inferred | Not Run — มีประเด็น S-01 |
| F-X03 | ลืมรหัสผ่าน | `index.html:216` | Verified | Inferred | Not Run |
| F-X04 | Version guard | `app.html:235-249` และอีก 2 หน้า | Verified | Partially Verified | Pass (depttest เดิมตรวจแบนเนอร์ — วันนี้ Blocked) |
| F-L01 | ผูก LINE (รหัส 6 หลัก/QR) + webhook ลายเซ็น | `app.html:422-470`; `api/line-webhook.js` | Verified | Partially Verified | Pass (line_webhook_test ×6, v680 ×6) |
| F-L02 | LineLinkPrompt ครั้งเดียวต่อ session | `app.html:1058` | Verified | Partially Verified | Pass (v680) |
| F-L03 | สรุปรายวัน + หมดอายุ 180/30 ครั้งเดียว + เตือนตรวจนับ 1–7 | `api/line-cron.js` | Verified | Inferred | Not Run |
| F-L04 | แจ้งจัดยาเสร็จ + ลิงก์ใบสรุป HMAC | `api/line-notify.js:16-45`; `api/dispense-sheet.js` | Verified | Inferred | Not Run |
| F-L05 | โควตา 80%/95% + log | `api/_lib/core.js:109-139` | Verified | Inferred | Not Run |
| F-L06 | LINE Console | `app.html:957-1010` | Verified | Partially Verified | Pass (v690) |
| F-B01 | sync สถานะยืนยันจ่าย (CLI) | `cli/sync_requisition_status.php` | Verified | Not Verified | Not Run |
| F-B02 | sync ล็อตคลังย่อย (CLI) | `cli/sync_stock_lots.php` | Verified | Not Verified | Not Run |
| F-B03 | engine คลังเสมือน (baseline/reconcile/receipt) | `cli/sync_virtual_stock.php` | Verified | Not Verified | Not Run |
| F-B04 | sync master ราคา (CLI, TEST/LIVE) | `cli/sync_master.php` | Verified | Not Verified | Not Run |
| F-B05 | sync NCDs (`sync_ncds`) | `invs_api.php:716` | Verified (เรียก lib) | **Blocked** — `lib_ncds_sync.php` ไม่มีในรีโป | Not Run |
| F-B06 | invs_diff (เครื่องมือตรวจ INVS) | `cli/invs_diff.php` | Verified | Partially Verified (ผู้ใช้รันจริง 2 รอบ, รายงานบันทึกใน CLAUDE.md) | Not Run |

---

## 7. User Journey และ Workflow Diagrams

### 7.1 รพ.สต.: เบิกยารายเดือน (end-to-end)

```mermaid
sequenceDiagram
  autonumber
  actor H as จนท.รพ.สต.
  participant W as app.html
  participant FS as Firestore
  participant GAS as Google Apps Script
  actor A as แอดมิน/เภสัชกร
  participant BR as PHP Bridge (LAN)
  participant INVS as INVS MySQL
  participant CLI as CLI (Task Scheduler)
  participant LN as Vercel /api + LINE

  H->>W: เลือกรอบ + อัปโหลด รบ.301
  W->>W: parse + จับคู่ยา + recalcVmiItem
  H->>W: ตรวจ/แก้ แล้วกด ส่งใบเบิก
  W->>GAS: อัปไฟล์ Excel (base64)
  W->>FS: set requisitions/REQ-YYYY-MM-hosp (Pending) + audit
  W->>FS: ใบ ฉ merged_req_id
  W->>FS: ตัดยอดใช้ FEFO vmi_virtual_lots + vmi_stock_events (RB301_USAGE)
  A->>W: เปิดใบ แก้จำนวนจ่าย กด "ส่ง INVS + บันทึกจัดยา"
  W->>BR: preflight (ID token)
  BR->>INVS: อ่าน inv_md_c / drug_gn / NLEM
  BR-->>W: warnings/errors + alloc ล็อต
  A->>W: ยืนยัน (วันที่เบิก = จันทร์ทำการแรก)
  W->>BR: send
  BR->>INVS: INSERT sm_po (R) + sm_po_c, SEND_FLAG=Y
  BR->>FS: PATCH invs_status=SENT, snapshot, audit
  W->>LN: /api/line-notify dispensed (fire-and-forget)
  W->>BR: substock_send USE-{reqId} (ถ้าเปิด postUsageInvs)
  BR->>INVS: INSERT sm_po (S → PT01) + sm_po_c รายล็อต
  W->>FS: Approving → current_excess / historical_usages / stock_adjustments → Completed
  Note over INVS: เภสัชกรยืนยันจ่ายใน INVS
  CLI->>INVS: อ่าน sm_po/sm_po_c (confirm)
  CLI->>FS: invs_confirm_flag, invs_dispense_snapshot
  CLI->>FS: sync_virtual_stock: reconcile + เพิ่มล็อตรับเข้า
  LN-->>H: LINE: จัดยาเสร็จ + ลิงก์ใบสรุป / เตือนหมดอายุ / เตือนตรวจนับ
```

### 7.2 สถานะใบเบิก รพ.สต. (`requisitions.status`)

```mermaid
stateDiagram-v2
  [*] --> Draft: บันทึกร่าง
  [*] --> Pending: ส่งใบ
  Draft --> Pending: ส่ง
  Pending --> Pending: แก้ไข (revision+1)
  Pending --> Rejected: แอดมินไม่อนุมัติ
  Rejected --> Pending: รพ.สต. แก้แล้วส่งใหม่
  Pending --> Approving: handleApprove เฟส 1 (token)
  Approving --> Completed: เฟส 2 ตรวจ token
  Approving --> ApprovalFailed: error
  ApprovalFailed --> Approving: ลองใหม่ (เขียนซ้ำได้)
  Pending --> [*]: ลบ (ก่อนส่ง INVS)
  Completed --> Completed: ส่ง INVS ย้อนหลัง / CLI อัปเดต invs_confirm_*
```
หลักฐาน: `shared.js:712` (`getReqPermissions`), `app.html:4859-5047`, rules `firestore.rules:219-251` — Verified (โค้ด)

### 7.3 หน่วยงานภายใน / ห้องยา

```mermaid
flowchart LR
  subgraph Dept["หน่วยงาน (internal.html)"]
    R1[เลือกรอบ] --> T1[template จากใบล่าสุด]
    U1[ใบเบิกด่วน internal_urgent Active] -->|รวมยอด urgentQty| T1
    T1 --> S1[ส่ง Pending]
    S1 --> U2[ใบด่วน → Merged]
  end
  subgraph Ph["ห้องยา (PharmacyReqView)"]
    P1[ช่วงวันที่ต่อจากใบก่อน] --> P2[Bridge hosxp_usage / นำเข้าไฟล์]
    P2 --> P3[calcPharmacySuggestion]
    P3 --> P4{บันทึก}
    P4 -->|รอส่ง| PD[Draft ไม่ตัดสต๊อก]
    P4 -->|ส่ง| PP[Pending + internal_stock.balance = onHand]
    PD --> PP
  end
  S1 --> Q[คิวแอดมิน FIFO submitted_at]
  PP --> Q
  Q --> PF[preflight source=internal]
  PF --> SD[send → sm_po/sm_po_c]
  SD --> CO[completeInternalRequisition: ห้องยา balance += dispenseQty → Completed]
  Q --> RJ[Rejected พร้อมเหตุผล]
```

### 7.4 ใบเบิกฉุกเฉิน (ใบ ฉ)

```mermaid
flowchart TD
  A[จนท.เลือกยาใน config_par + เหตุผล] --> B{checkEmergencyItems}
  B -->|ไม่มีเหตุผล/ไม่มีใน par/ยกเลิกใช้| X[แดง: บันทึกไม่ได้]
  B -->|เกิน Target หรือ Maximum / วัคซีน| W[เหลือง: ข้อสังเกต บันทึกได้]
  B -->|ปกติ| G[เขียว: รับยาได้เลย]
  W --> S[rpst_emergency Approved + พิมพ์ใบ]
  G --> S
  S --> M[ใบเบิกหลักรอบถัดไป: emergencyQty สีแดง ล็อก]
  M --> V[มูลค่ารวม emergencyQty · INVS qty = dispense + emergency]
  M --> E[engine คลังเสมือนไม่บวกซ้ำ]
```

### 7.5 คลังเสมือน รพ.สต. (virtual stock)

```mermaid
flowchart TD
  B0[invs_stock_lots คลังย่อย] -->|ครั้งแรก| BL[BASELINE_INIT ล็อต __BASE__]
  RB[ส่งใบ รบ.301] -->|v6.11 FEFO| CUT[MANUAL_ADJUST RB301_USAGE]
  AP[อนุมัติ Completed] --> RC[engine: CREDIT_RECONCILE_FEFO ถ้าเสมือน > เป้า]
  CF[INVS ยืนยันจ่าย] --> RCV[INVS_RECEIPT ล็อต __REQ__ ลบ emergencyQty]
  CNT[ตรวจนับ] --> ADJ[MANUAL_ADJUST STOCK_COUNT ขาด=หัก FEFO / เกิน=เพิ่มล็อตใหม่สุด]
  RET[คืนยา] --> SR[STOCK_RETURN + current_excess = คงเหลือ − คืน]
  TB[แก้ในโหมดตาราง] --> MA[MANUAL_ADJUST + manual_adjusted_at]
  BL & CUT & RC & RCV & ADJ & SR & MA --> VL[(vmi_virtual_lots + vmi_stock_events)]
  VL --> EFF[effectiveLots: ถ้าไม่ได้นับหลังรับล็อตล่าสุด สมมติยอด = Target หัก FEFO]
  EFF --> UI[ชั้นยาของฉัน / LINE หมดอายุ / Substock target]
```

### 7.6 ผูก LINE และแจ้งเตือน

```mermaid
sequenceDiagram
  actor U as ผู้ใช้
  participant W as app.html
  participant FS as Firestore
  participant LO as LINE OA
  participant WH as /api/line-webhook
  participant CR as /api/line-cron (Vercel Cron 15:00)
  W->>FS: create line_link_codes/{6 หลัก} (10 นาที)
  U->>LO: ส่งรหัสในแชต
  LO->>WH: webhook (x-line-signature)
  WH->>FS: ตรวจรหัส/อายุ → users.line_user_id, ลบรหัส
  WH-->>LO: reply ผูกสำเร็จ
  CR->>FS: อ่านใบใหม่ ล็อตใกล้หมดอายุ ตรวจนับ
  CR->>LO: push (ตามโควตา 80/95%)
  CR->>FS: line_meta/state, expiry_levels, line_logs
```

---

## 8. System Architecture Diagram

```mermaid
flowchart LR
  subgraph Client["เบราว์เซอร์ผู้ใช้ (รพ.สต. / หน่วยงาน / แอดมิน)"]
    IDX[index.html]
    APP[app.html]
    INT[internal.html]
    SH[shared.js<br/>rxSync IndexedDB cache<br/>write hooks]
  end
  subgraph CDN["CDN สาธารณะ"]
    C1[unpkg: React 18.2 / Babel 7.23.6 / Leaflet]
    C2[cdnjs: xlsx / PapaParse / FontAwesome / qrcode]
    C3[gstatic: Firebase 10.8 compat]
    C4[cdn.tailwindcss.com]
  end
  subgraph Google["Google Cloud"]
    AUTH[Firebase Auth]
    FS[(Cloud Firestore<br/>project sawee-rxfill)]
    GAS[Apps Script → Google Drive<br/>ไฟล์ รบ.301]
    REF[(Firestore sawee-refer<br/>ncds_demand)]
  end
  subgraph Vercel["Vercel"]
    WH["/api/line-webhook"]
    CRN["/api/line-cron (cron 0 8 * * *)"]
    NTF["/api/line-notify"]
    DSH["/api/dispense-sheet"]
    CORE[_lib/core.js<br/>SA JWT → Firestore REST]
  end
  LINE[LINE Messaging API]
  subgraph LAN["LAN รพ.สวี (Windows + XAMPP)"]
    BR[invs_api.php Bridge 2.11.1]
    CLI[CLI sync_* via SYNC_BACKGROUND.bat]
    INVS[(INVS MySQL<br/>เขียนได้เฉพาะ sm_po/sm_po_c)]
    HOS[(HOSxP MySQL<br/>อ่านอย่างเดียว)]
  end

  Client --> CDN
  Client -->|Auth| AUTH
  Client -->|SDK + rules| FS
  APP -->|anonymous| REF
  APP -->|fetch base64| GAS
  APP & INT -->|POST + ID token<br/>127.0.0.1 / 192.168.40.90| BR
  APP -->|ID token| NTF
  APP -->|ID token| CRN
  APP -->|GET bot info| WH
  LINE -->|webhook| WH
  WH & CRN & NTF & DSH --> CORE --> FS
  CORE --> LINE
  BR -->|SA REST| FS
  BR --> INVS
  BR --> HOS
  CLI --> INVS
  CLI -->|SA REST| FS
```

**ข้อสังเกตสถาปัตยกรรม** (Verified จากโค้ด)

- เบราว์เซอร์คุยกับ Bridge ใน LAN โดยตรง (ต้องอยู่ในเครือข่าย รพ.) — Bridge ใช้ CORS `*` และ `Access-Control-Allow-Private-Network: true` (`invs_api.php:36-40`); `bridgeFetch` ใส่ `targetAddressSpace` สำหรับ Chrome Local Network Access (`shared.js:742`)
- เซิร์ฟเวอร์ทุกตัว (Vercel, Bridge, CLI) เข้าถึง Firestore ด้วย service account (ข้าม rules) — ความปลอดภัยฝั่งเซิร์ฟเวอร์จึงขึ้นกับการตรวจสิทธิ์ในโค้ดแต่ละ endpoint
- แหล่งความจริงของสต๊อก: **INVS** สำหรับคลังใหญ่/คลังย่อย, **Firestore `vmi_virtual_lots`** สำหรับคลังเสมือน รพ.สต. (สมมติฐาน + ตรวจนับ), **`internal_stock`** สำหรับห้องยา (โดยประมาณ)

---

## 9. Database Schema, Data Dictionary และ ER Diagram

### 9.1 ภาพรวม

- **Cloud Firestore** (NoSQL, project `sawee-rxfill`, `shared.js:11`) — 33 collection ที่ rules ระบุ (`firebase/firestore.rules`) + catch-all deny (`:536-538`)
- **INVS (MySQL)** — Bridge อ่านหลายตาราง เขียนเฉพาะ `sm_po`, `sm_po_c` (ดู 9.5)
- **HOSxP (MySQL)** — อ่านอย่างเดียว (`opitemrece`, `drugitems`, `information_schema`)
- **Firestore `sawee-refer`** (อีกโปรเจกต์) — อ่าน `ncds_demand` แบบ anonymous (`app.html:10026-10075`); rules ของโปรเจกต์นั้นไม่อยู่ในรีโป (Not Verified)
- **IndexedDB `sawee-rxfill-cache`** ในเบราว์เซอร์ (แคชอ่าน) — `shared.js:1479`

Data dictionary ด้านล่างได้มาจาก**โค้ดที่อ่าน/เขียน** ไม่ใช่การสำรวจข้อมูลจริง (Limitation) — ฟิลด์ที่ระบบเก่าเคยเขียนอาจมีเพิ่ม

### 9.2 Data Dictionary (Firestore)

| Collection | วัตถุประสงค์ | รูปแบบ Doc ID | ฟิลด์หลัก | ผู้เขียน | หลักฐาน |
|---|---|---|---|---|---|
| `users` | โปรไฟล์ + บทบาท | Auth uid | `email, name, position, role, hospital_id, dept_id, active, line_user_id, line_display_name, line_linked_at, line_unlinked_at, line_unlink_reason` | index.html (สมัคร), แอดมิน, webhook (LINE) | `index.html:339`, `api/line-webhook.js:17-32` |
| `master_hospitals` | รพ.สต. | `hospital_id` | `hospital_name, affiliation, invs_dept_id, invs_stock_id, hcode, lat, lng, rpst_size, sign_roles, sign_names` | แอดมิน (+รพ.สต. เฉพาะ sign_*) | `app.html:7488, 6379, 5190` |
| `master_depts` | หน่วยงาน/ห้องยา | `dept_id` | `dept_name, kind(dept/pharmacy), invs_dept_id, active, cover_days, invs_supply_officer, invs_inv_director` | แอดมิน | `app.html:8911-8950` |
| `master_drugs` | รายการยา (รหัส INVS) | `drug_id` | `drug_name, type, pack_size, unit_id, price, dispense_step, maximum_qty, usage_multiplier, unpacked, status, fuzzy, hosxp_code, hosxp_multiplier, old_code, rpst_sizes, invs_location, invs_keywords, image_url, needs_vmi_setup, invs_*, *_previous` | แอดมิน, CLI sync_master, รพ.สต.(fuzzy), ห้องยา(multiplier) | `app.html:7449-7504`, `sync_master.php:638-709` |
| `master_unit` | หน่วยนับ | `unit_id` | `unit_name, invs_su_id(_ex), invs_hide, source` | แอดมิน, CLI | `app.html:7479` |
| `config` | `app_meta`(cache_epoch, feedback), `drug_types`, `refer_link` | คงที่ | — | แอดมิน | `shared.js:1563-1673` |
| `config_par` | Target Stock ต่อ รพ.สต.×ยา | *Inferred* `{hosp}_{drug}` | `hospital_id, drug_id, par_qty` | **ไม่พบผู้เขียนในแอปปัจจุบัน** (TD-07) | `app.html:10627` (อ่าน) |
| `current_excess` | ยอดเหลือ/เครดิต | `{hosp}_{drug}` | `hospital_id, drug_id, excess_balance, last_updated` | อนุมัติ, คืนยา, อนุมัติปรับยอด | `app.html:4975, 1499, 7782` |
| `historical_usages` | ยอดใช้รายเดือน | `{hosp}_{drug}` | `hospital_id, drug_id, history{YYYY-MM:qty}` | อนุมัติ, HistManager | `app.html:4986, 6822` |
| `requisitions` | ใบเบิก รพ.สต. | `REQ-{YYYY}-{MM}-{hosp}` (`shared.js:894`) / `HIST-*` | `hospitalId, month, year, fiscal_year, fiscal_term, requisition_no, round_*, status, items[], skipped_items, excel_url, created_by_*, submitted_at, approved_*, approval_token, is_printed, printed_*, sign_roles, sign_names, revision, invs_extra_items, invs_status, invs_sub_po_no, invs_ref_marker, invs_*_snapshot, invs_confirm_*, invs_fulfillment_status, vmi_recon_done, vmi_stock_engine_*, line_dispensed_*` | รพ.สต., แอดมิน, Bridge, CLI, line-notify | `app.html:3296-3390, 5005`, `invs_api.php:1277,1341`, `sync_requisition_status.php:68-74` |
| `requisitions.items[]` | รายการยาในใบ | — | `drugId, name, unit, packSize, price, type, usage, importedUsageQty, rawImportedUsageQty, prevExcess, systemStock, actualStock, actualStockTouched, targetVMI, systemSuggestedQty, finalRequestedQty, dispenseQty, submittedDispenseQty, emergencyQty, newExcess, requestMore, requestLess, ncdsOutreach*, pastHistory` | — | `shared.js:429-680` |
| `rpst_emergency` | ใบ ฉ | `EM-{hosp}-{stamp}` | `hospitalId, doc_no, status(Approved/Cancelled), reason, items[], over_target, warnings, total_value, merged_req_id, merged_at, cancelled_*` | รพ.สต., แอดมิน | `app.html:642-660, 3418` |
| `vaccine_requisitions` | ใบ ว.3/1 | `VAC-{hosp}-{YYYY}-{MM}` | `hospitalId, month, year, fiscal_year, term, doc_no, rows[], form_kind, total_value` | รพ.สต., แอดมิน | `app.html:7050, 7070` |
| `stock_adjustments` | คำขอ/บันทึกปรับยอด | `{req}__RECON__{drug}` หรือ auto | `hospital_id, drug_id, old_balance, new_balance, reason, status, source, source_requisition_id, approved_*` | อนุมัติ, แอดมิน | `app.html:4944, 7781-7805` |
| `stock_returns` | ใบคืนยา | auto (`doc_no` `RET-yyyymmdd-xxxx`) | `hospital_id, items[]{lotDocId, lotNo, expiryDate, returnQty, reason, returnValue, manual}, totalValue, status, return_date, created_by_*` | รพ.สต. (transaction) | `app.html:1459-1499` |
| `vmi_virtual_lots` | ล็อตคลังเสมือน | `{hosp}__BASE__{rec}`, `{hosp}__REQ__{subpo}__{detail}` | `hospital_id, drug_id, lot_no, expiry, remaining_qty, initial_qty, active, unit_cost, source_type, source_requisition_id, invs_sub_po_no, manual_adjusted_*, lot_no_before, expiry_before, created_at` | CLI engine (สร้าง), รพ.สต./แอดมิน (แก้) | `sync_virtual_stock.php:221-352`, `app.html:923, 2221` |
| `vmi_stock_events` | สมุดเหตุการณ์คลัง (append-only) | auto / `BASELINE__`, `RECON__`, `RECEIPT__` | `hospital_id, drug_id, lot_doc_id, event_type, qty_delta, before_qty, after_qty, reason, source, source_requisition_id, count_id, actor_*` | CLI, รพ.สต., แอดมิน | `app.html:930, 2310`, `sync_virtual_stock.php:274` |
| `vmi_stock_meta` | สถานะ engine ต่อ รพ.สต. | `hospitalId` | `initialized, cutover_at, baseline_*, last_engine_sync_at, status` | CLI | `sync_virtual_stock.php:232-389` |
| `vmi_stock_counts` | ผลตรวจนับ | `{hosp}-{yyyymmdd}-{6}` | `hospital_id, count_date, items[]{drug_id, system_qty, counted, diff, earliest_lot, earliest_exp}, counted_by_*` | รพ.สต., แอดมิน | `app.html:2289-2323` |
| `invs_stock_lots` | สำเนาล็อต INVS คลังย่อย | `{hosp}__{RECORD_NUMBER}` | `hospital_id, invs_dept_id, drug_id, lot_no, expiry, days_to_expiry, qty_on_hand, pack_*, active, stale_at` | CLI | `sync_stock_lots.php:294-321` |
| `invs_stock_meta` | สรุปการ sync ล็อต | `hospitalId` | `status, last_sync_at, lot_count, drug_count, expiry_le_90_count, expiry_le_180_count` | CLI | `sync_stock_lots.php:325` |
| `invs_substock_posts` | ประวัติเอกสารจ่ายผู้ป่วยคลังย่อย | `USE-{reqId}` / `{hosp}-{ts}` | `hospital_id, stock_id, sub_po_no, items[], mode, req_id, status, total_value, auto` | แอดมิน (client) | `app.html:814, 950` |
| `internal_requisitions` | ใบเบิกภายใน | `IR-{dept}-{stamp}-{rand}` | `deptId, dept_name, kind, status, items[], form_no, form_date, fiscal_year, round_*, manual_backdate, doc_no, revision, submitted_at, urgent_ids, sign_people, print_count, printed_at, draft_deleted, stock_applied_chunks, invs_*` | หน่วยงาน, แอดมิน, Bridge | `internal.html:574-593`, `app.html:8233` |
| `internal_urgent` | ใบเบิกด่วน | `URG-IR-…` | `deptId, status(Active/Merged/Cancelled), round_*, items[]{drugId, requestQty, requestMode}, merged_req_id` | หน่วยงาน | `internal.html:1823-1837` |
| `internal_stock` | สต๊อกโดยประมาณ ห้องยา/หน่วยงาน | `{dept}__{drug}` | `dept_id, drug_id, balance, last_source, last_req_id, counted_at` | ห้องยา, แอดมิน | `internal.html:1212`, `app.html:8256` |
| `req_rounds` | รอบเบิกต่อปีงบ | `{fy}-{scope}-{NN}` | `fiscal_year, round_no, round_date, scope(rpst/internal), note, active` | แอดมิน | `app.html:9055-9186` |
| `ncds_demand_inbox` | ยอดยา NCDs ที่คัดลอกมา | *Inferred* | `hospital_id, hcode, round_date, items[]{icode, qty_needed, patients}` | `lib_ncds_sync.php` (**ไม่มีในรีโป**) | `invs_api.php:14,718` |
| `line_link_codes` | รหัสผูก LINE | 6 หลัก | `uid, name, role, expires_at, created_at` | ผู้ใช้ (สร้าง), webhook (ลบ) | `app.html:447` |
| `line_logs` / `line_meta` | log การส่ง / โควตา-state-expiry_levels | auto / คงที่ | `type, to_uid, ok, skipped, error, preview, at` / `sent, limit, last_run_at, count_reminder_month, levels{}` | Vercel เท่านั้น | `core.js:131-139`, `line-cron.js:130-135` |
| `audit_logs` | บันทึกตรวจสอบ | auto / `INVS_SEND_{sha}` | `action, target_type, target_id, actor_uid, actor_name, actor_role, details, created_at` | ทุกบทบาท (ของตัวเอง), Bridge | `shared.js:806-831` |
| `cache_tombstones` | ป้ายลบสำหรับแคช | auto | `col, doc_id, deleted_at, by` | write hooks | `shared.js:1690` |
| `feedback_rounds` / `feedback_responses` | แบบประเมิน | `FB{NN}` / `{round}__{uid}` | `round_no, title, roles, open` / `uid, ratings, overall` | แอดมิน / ผู้ใช้ | `app.html:9700`, `shared.js:1924` |

ฟิลด์ delta-sync: collection ใน `RX_DELTA_FIELDS` (`shared.js:1465-1469`) ใช้ `updated_at` ยกเว้น `current_excess` ใช้ `last_updated` — write hooks (`shared.js:1695-1746`) ประทับให้อัตโนมัติ

### 9.3 ER Diagram (ความสัมพันธ์เชิงตรรกะ — Inferred จากโค้ด, Firestore ไม่บังคับ FK)

```mermaid
erDiagram
  master_hospitals ||--o{ users : "hospital_id"
  master_depts ||--o{ users : "dept_id"
  master_hospitals ||--o{ requisitions : "hospitalId"
  master_hospitals ||--o{ config_par : "hospital_id"
  master_hospitals ||--o{ current_excess : "hospital_id"
  master_hospitals ||--o{ historical_usages : "hospital_id"
  master_hospitals ||--o{ rpst_emergency : "hospitalId"
  master_hospitals ||--o{ vaccine_requisitions : "hospitalId"
  master_hospitals ||--o{ vmi_virtual_lots : "hospital_id"
  master_hospitals ||--|| vmi_stock_meta : "doc id"
  master_hospitals ||--o{ vmi_stock_counts : "hospital_id"
  master_hospitals ||--o{ invs_stock_lots : "hospital_id"
  master_hospitals ||--o{ stock_returns : "hospital_id"
  master_hospitals ||--o{ invs_substock_posts : "hospital_id"
  master_drugs ||--o{ config_par : "drug_id"
  master_drugs ||--o{ current_excess : "drug_id"
  master_drugs ||--o{ vmi_virtual_lots : "drug_id"
  master_unit ||--o{ master_drugs : "unit_id"
  requisitions ||--o{ rpst_emergency : "merged_req_id"
  requisitions ||--o{ vmi_stock_events : "source_requisition_id"
  requisitions ||--o{ stock_adjustments : "source_requisition_id"
  requisitions ||--o| invs_substock_posts : "req_id (USE-reqId)"
  requisitions ||--o{ vmi_virtual_lots : "REQ lots จาก invs_dispense_snapshot"
  vmi_virtual_lots ||--o{ vmi_stock_events : "lot_doc_id"
  vmi_stock_counts ||--o{ vmi_stock_events : "count_id"
  req_rounds ||--o{ requisitions : "round_id"
  req_rounds ||--o{ internal_requisitions : "round_id"
  master_depts ||--o{ internal_requisitions : "deptId"
  master_depts ||--o{ internal_urgent : "deptId"
  master_depts ||--o{ internal_stock : "dept_id"
  internal_requisitions ||--o{ internal_urgent : "merged_req_id"
  users ||--o{ line_link_codes : "uid"
  users ||--o{ audit_logs : "actor_uid"
```

### 9.4 ดัชนี (Indexes)

| Collection | ฟิลด์ | ใช้โดย | หลักฐาน |
|---|---|---|---|
| `config_par` | `hospital_id` + `updated_at` | delta sync | `firestore.indexes.json` |
| `historical_usages` | `hospital_id` + `updated_at` | delta sync | เดียวกัน |
| `current_excess` | `hospital_id` + `last_updated` | delta sync | เดียวกัน |
| `internal_stock` | `dept_id` + `updated_at` | delta sync | เดียวกัน |
| **ขาด** | `vmi_stock_events` `hospital_id ==` + `orderBy created_at desc` | ประวัติคลัง | `app.html:1945` (มี fallback query ไม่เรียง `:1947`) — Verified |

ถ้า index ขาด `rxSync` จะเก็บลิงก์สร้าง index ใน `rxMissingIndexes` และโหลดเต็มแทน แอดมินเห็นแบนเนอร์ (`app.html:10858`)

### 9.5 ตาราง INVS / HOSxP ที่เกี่ยวข้อง (จากโค้ด Bridge/CLI)

| ระบบ | ตาราง | สิทธิ์ | ใช้ทำอะไร | หลักฐาน |
|---|---|---|---|---|
| INVS | `sm_po` | **R/W** | หัวเอกสารเบิก (`R_S_STATUS='R'`) และจ่ายผู้ป่วยคลังย่อย (`'S'`, DEPT `PT01`), `REF_NO` = marker กันซ้ำ | `invs_api.php:417-449, 1060-1108, 1300-1367` |
| INVS | `sm_po_c` | **R/W** | รายการ (1 บรรทัด/ยา สำหรับใบเบิก, 1 บรรทัด/ล็อต สำหรับคลังย่อย) | เดียวกัน |
| INVS | `inv_md_c` | R | ล็อตคงคลัง FEFO / snapshot ก่อน-หลัง | `invs_api.php`, `sync_stock_lots.php:224` |
| INVS | `drug_gn`, `drug_vn`, `pack_ratio`, `sale_unit`, `card` | R | ข้อมูลยา ราคา บรรจุ NLEM | `invs_api.php:962`, `sync_master.php` |
| INVS | `dept_id`, `ms_ivo` | R (ms_ivo ใช้ใน `LOCK TABLES ... READ`) | หน่วยเบิก, ตัวนับเลขเอกสาร | `invs_api.php:417` |
| INVS | `inv_has_his` | R | map รหัส INVS↔HOSxP | `invs_api.php:654` |
| INVS | `sawee_location`, `location`, `inst_name` | R | ตำแหน่ง/คำค้นหา | `invs_api.php:1119` |
| HOSxP | `opitemrece`, `drugitems` (หรือ `hosxp.usage_sql`) | R | ยอดใช้ OPD/IPD สำหรับห้องยา | `invs_api.php:733, 1205` |

กฎ "Bridge เขียน INVS ได้เฉพาะ `sm_po`/`sm_po_c`" — **Verified จากโค้ด** (ไม่พบ INSERT/UPDATE/DELETE ตารางอื่น; DELETE มีเฉพาะ `cleanupOwnPartial` ที่ลบแถวของตัวเองที่ยังไม่ยืนยัน `invs_api.php:449`) — การยืนยันกับฐานจริงเป็น Not Verified

---

## 10. API และ Integration Inventory

### 10.1 Vercel Functions

| Endpoint | Method | Auth | Input | Output / Error | Side effects | หลักฐาน |
|---|---|---|---|---|---|---|
| `/api/line-webhook` | GET | ไม่มี | — | `{ok, botId, addFriendUrl, linkTtlMinutes:10}` cache 5 นาที | — | `line-webhook.js:49-53` |
| `/api/line-webhook` | POST | `x-line-signature` HMAC-SHA256 (`LINE_CHANNEL_SECRET`) timing-safe | LINE events | 401 bad signature; error อื่นตอบ **200** `{ok:false}` (กัน LINE retry) | ผูก/ยกเลิก LINE ใน `users`, ลบรหัส, reply | `line-webhook.js:55-67` |
| `/api/line-cron` | ใด ๆ + `Bearer CRON_SECRET` / POST `{idToken, dryRun}` (แอดมิน) | Cron secret หรือ ID token แอดมิน | `dryRun` ค่าเริ่มต้น **true** | สรุปผล `{newReqCount, near30, near180, crossing, sent, skipped, quota}`; 401/403/500 | push LINE, เขียน `line_meta/*`, `line_logs` | `line-cron.js:143-155` |
| `/api/line-notify` | POST | ID token (`verifyUser`) | `{idToken, action}` | 405/400/403/404/500 | ตาม action | `line-notify.js:48-81` |
| ↳ `status` | | แอดมิน | — | `{quota, state}` | — | |
| ↳ `test` | | ผู้ใช้ที่ผูก LINE | — | ผล push | push ถึงตัวเอง | |
| ↳ `dispensed` | | แอดมิน | `{reqId}` | `{sent, skipped, text}` | push ถึง จนท. รพ.สต., ประทับ `line_dispensed_*` | `line-notify.js:16-45` |
| ↳ `unlink` | | แอดมิน | `{uid}` | `{ok}` | ล้าง LINE ของผู้ใช้ | `line-notify.js:72` |
| `/api/dispense-sheet` | GET (ไม่ตรวจ method) | HMAC 24 hex ใน `?t=` (ไม่มีวันหมดอายุ) | `c=r|i, id, t` | HTML; 403/404/500 | อ่านใบ + master | `dispense-sheet.js:45-62`, `core.js:152-154` |

### 10.2 PHP Bridge (`invs_api.php`, Bridge 2.11.1)

ทุก POST: ต้องมี Firebase ID token (header Authorization หรือ body `firebase_id_token`) → `accounts:lookup` → อ่าน `users/{uid}` → `requireAdmin`/`requireRoles` (`:218-305`); allowlist action ที่ `:623`

| Action | สิทธิ์ | อ่าน | เขียน | หลักฐาน |
|---|---|---|---|---|
| GET `health` | **ไม่ต้อง auth** | `SELECT 1`, ตรวจไฟล์ SA | — (เปิดเผย host/ชื่อ DB, path config) | `:591-610` |
| `authcheck` | ผู้ใช้ที่มีโปรไฟล์ | `users` | — | `:648` |
| `list_depts` | admin | `dept_id` | — | `:626` |
| `sync_hosxp_codes` | admin | `inv_has_his` | — (client บันทึก) | `:654` |
| `sync_ncds` | admin | ตาม lib | ตาม lib | `:716` — **Blocked (lib ไม่มี)** |
| `hosxp_diag`, `hosxp_usage` | admin / pharmacy | HOSxP | — | `:733, :1205` |
| `invs_discover` | admin | information_schema + probe | — | `:798` |
| `invs_master` | admin | drug_gn, card, inv_md_c, pack_ratio, sale_unit | — | `:962` |
| `invs_extras` | admin | inst_name, sawee_location ฯลฯ | — | `:1119` |
| `substock_preflight` / `substock_send` | admin | inv_md_c คลังย่อย | `sm_po`(S) + `sm_po_c` (send, ต้อง `allow_live_send`) | `:995-1114` |
| `preflight` / `send` | admin (`requisition_id` ตรวจก่อน `requireAdmin`) | sm_po, inv_md_c, NLEM | `sm_po`(R) + `sm_po_c`; Firestore PATCH ใบ + audit | `:1253-1373` |

### 10.3 CLI / Background

| สคริปต์ | รอบรัน | ทำอะไร | เขียน |
|---|---|---|---|
| `sync_requisition_status.php` 1.3.0 | Task Scheduler (`SYNC_BACKGROUND.bat`) | ดึงสถานะยืนยัน/ล็อตที่จ่ายจริง (**เฉพาะใบ รพ.สต.**) | Firestore `requisitions` |
| `sync_stock_lots.php` 1.1.0 | เดียวกัน | สำเนา `inv_md_c` คลังย่อย | `invs_stock_lots`, `invs_stock_meta` |
| `sync_virtual_stock.php` 1.2.0 | เดียวกัน | engine คลังเสมือน | `vmi_*`, `requisitions.vmi_*` |
| `sync_master.php` 1.6.0 | รันมือ (TEST default, `--live` + `sync.allow_live`) | ราคา/บรรจุ/หน่วย | `master_drugs`, `master_unit` |
| `invs_diff.php` 1.0 | รันมือ (`INVS_DIFF.bat`) | diff ก่อน/หลัง (READ ONLY session) | ไฟล์ใน `cache/invs_diff/` |

### 10.4 Integration ภายนอกอื่น

| ระบบ | ทิศทาง | กลไก | หลักฐาน | สถานะ |
|---|---|---|---|---|
| Google Apps Script → Drive | เว็บ → GAS | `fetch(GAS_DRIVE_URL)` ส่งไฟล์ รบ.301 base64 | `app.html:3254-3292` | Not Verified (ไม่มีซอร์ส GAS) |
| Sawee Refer Firestore | เว็บ → อ่าน | Firebase app ที่ 2 + anonymous auth | `app.html:10001-10075` | Not Verified (rules ฝั่ง Refer ไม่อยู่ในรีโป) |
| OpenStreetMap tiles | เว็บ → อ่าน | Leaflet | `app.html:6264` | Not Verified (ถูกบล็อกในระบบทดสอบ) |
| Google identitytoolkit / OAuth | Vercel/Bridge → Google | ตรวจ ID token, ขอ access token SA | `core.js:18-33,140`, `invs_api.php:133` | Verified (โค้ด) |
| LINE Messaging API | Vercel ↔ LINE | push/reply/profile/quota | `core.js:97-136` | Partially Verified (เทสต์ด้วย fetch จำลอง) |

---

## 11. User Roles และ Permission Matrix

### 11.1 บทบาท

| บทบาท | ค่า role ที่ยอมรับ (rules) | หน้าหลัก | วิธีได้บทบาท |
|---|---|---|---|
| admin | `admin`, `Admin`, `ADMIN`, `administrator` | app.html | แอดมินกำหนดใน `users` (สมัครเองไม่ได้ — rules create ไม่รับ admin) |
| hospital (รพ.สต.) | `hospital`, `Hospital`, `HOSPITAL`, `รพ.สต.`, `รพสต` | app.html | **สมัครเองได้** เลือก รพ.สต. (S-01) |
| dept (หน่วยงาน) | `dept`, `Dept`, `department`, `หน่วยงาน` | internal.html | สมัครเองได้ (ต้องมี `master_depts/{dept_id}`) |
| pharmacy (ห้องยา) | `pharmacy`, `Pharmacy`, `ห้องยา` | internal.html | สมัครเองได้ (rules ไม่ตรวจว่า dept เป็น kind pharmacy — S-01) |

หมายเหตุ: `normalizeUserRole` (`shared.js:284`) และ Bridge (`invs_api.php:198-208`) แปลงตัวพิมพ์/ช่องว่าง แต่ rules ใช้การเทียบตรงตัว — `core.js:149` รับ `แอดมิน` ซึ่ง rules ไม่รับ (ความไม่สอดคล้องเล็กน้อย)

### 11.2 Permission Matrix — Firestore Rules (Verified จาก `firebase/firestore.rules`; **ยังไม่ทดสอบด้วย Emulator**)

สัญลักษณ์: **A** แอดมิน · **H** รพ.สต. ของตนเอง · **D** หน่วยงาน/ห้องยาของตนเอง · **P** ห้องยาเท่านั้น · **All** ผู้ใช้ active ทุกคน · **Pub** ไม่ต้อง login · **SA** เฉพาะ service account · `—` ไม่อนุญาต

| Collection (บรรทัด) | Read | Create | Update | Delete | ข้อจำกัดฟิลด์สำคัญ |
|---|---|---|---|---|---|
| master_hospitals (79) | **Pub** | A | A, H(sign_*) | A | H: `sign_roles, sign_names` ≤8 |
| master_depts (425) | **Pub** | A | A | A | — |
| users (91) | A, ตนเอง | ตนเอง (hospital/dept/pharmacy, active≠false) | A; ตนเอง: `name, position` หรือยกเลิก LINE | A | email ต้องตรง token |
| line_link_codes (124) | — | All (รหัส 6 หลัก, uid ตนเอง) | — | — | SA อ่าน/ลบ |
| line_logs, line_meta (133) | A | SA | SA | SA | — |
| master_drugs (142) | All | A | A; H ทุกคน: `fuzzy`; P ทุกคน: `hosxp_multiplier*` | A | ไม่จำกัดตามหน่วย |
| master_unit, config, req_rounds | All | A | A | A | — |
| config_par (166) | A, H | A, H | A, H(`par_qty`) | A, H | `par_qty ≥ 0` |
| current_excess (187) | A, H | A, H | A, H(`excess_balance`) | A, H(ถ้า =0) | **ไม่จำกัดค่า** |
| requisitions (208) | A, H | A, H(Draft/Pending) | A; H: Draft→Draft/Pending, Pending/Rejected→Pending (**ไม่จำกัดฟิลด์อื่น**); print flags; sign_* | A, H(Draft/Pending/Rejected) | id/month/year/creator คงเดิม |
| historical_usages (253) | A, H | A | A | A | — |
| stock_adjustments (258) | A, H | A, H(Pending) | A | A | `new_balance ≥ 0` |
| stock_returns (273) | A, H | A, H(Completed) | A | A | — |
| audit_logs (285) | A, ของตนเอง | All (actor = ตนเอง) | — | — | append-only |
| invs_stock_lots, invs_stock_meta (299) | A, H | SA | SA | SA | — |
| rpst_emergency (316) | A, H | A, H(Approved, ยังไม่ merge) | A; H: status/merged_* เท่านั้น items ห้ามเปลี่ยน | A | — |
| invs_substock_posts (335) | A | A | A | A | — |
| vmi_stock_counts (340) | A, H | A, H | A | A | `counted_by_uid` = ตนเอง |
| vmi_virtual_lots (349) | A, H | SA | A; H: `remaining_qty≥0, active, lot_no, expiry, *_before, manual_adjusted_*` | SA | source_type คงเดิม |
| vmi_stock_events (374) | A, H | A; H(MANUAL_ADJUST/STOCK_RETURN) | — | — | `after_qty ≥ 0`, doc id ไม่จำกัด |
| vmi_stock_meta (392) | A, H | SA | SA | SA | — |
| vaccine_requisitions (404) | A, H | A, H | A, H (**ไม่ล็อกสถานะ**) | A, H | — |
| internal_urgent (432) | A, D | A, D(Active) | A, D(Active → Active/Cancelled/Merged) | A | — |
| internal_requisitions (448) | A, D | A, D(Pending/Draft, ไม่มี INVS no.) | A; D ก่อนส่ง INVS; D: `sign_people`/print fields | A | `invs_status` ห้ามเปลี่ยน |
| internal_stock (479) | A, D | A, P | A, P | A | `balance ≥ 0` |
| ncds_demand_inbox (495) | A, H | SA | SA | SA | — |
| cache_tombstones (508) | All | All | — | A | `deleted_at == request.time` |
| feedback_rounds / responses (521) | A / A+ตนเอง | A / All | A / All | A | — |
| `/{document=**}` (536) | — | — | — | — | catch-all deny |

### 11.3 Permission Matrix — ฟังก์ชันหน้าเว็บ (UI) vs ชั้นบังคับจริง

| ฟังก์ชัน | admin | hospital | dept | pharmacy | บังคับที่ UI | บังคับที่ Rules/Server |
|---|:-:|:-:|:-:|:-:|---|---|
| สร้าง/แก้ใบ รพ.สต. | ✔ (แทน) | ✔ ของตน | — | — | เมนู | rules `requisitions` |
| อนุมัติ/จัดยา/ส่ง INVS | ✔ | — | — | — | `getReqPermissions` | Bridge `requireAdmin` + rules (A) |
| คลังยาของฉัน / ตรวจนับ / คืนยา | ✔ | ✔ | — | — | เมนู | rules vmi_* |
| ใบ ฉ | ✔ | ✔ | — | — | เมนู | rules rpst_emergency |
| ใบเบิกหน่วยงาน / ด่วน | ✔ | — | ✔ | ✔ | redirect ตามบทบาท | rules internal_* |
| ดึงยอดใช้ HOSxP | ✔ | — | — | ✔ | หน้า PharmacyReqView | Bridge `requireRoles(admin,pharmacy)` |
| จัดการฐานข้อมูล (`config`) | ✔ | (view ไม่มี gate) | — | — | ซ่อนเมนูเท่านั้น | rules (A) |
| LINE Console / ส่งสรุป | ✔ | — | — | — | role gate | `verifyUser` + `isAdminRole` (**ไม่ตรวจ active**) |
| ทดสอบส่ง LINE ถึงตัวเอง | ✔ | ✔ | ✔ | ✔ | ปุ่มใน profile | `verifyUser` |

---

## 12. Security, Reliability และ Performance Findings

ระดับความรุนแรง: **High** = กระทบความถูกต้องของข้อมูลยา/การเงินหรือการเข้าถึงข้ามหน่วยงานได้จริง · **Medium** = มีเงื่อนไขหรือผลกระทบจำกัด · **Low** = ควรแก้เมื่อสะดวก · **Info** = ข้อสังเกต
ทุกข้อมีหลักฐานไฟล์:บรรทัด สถานะ "Verified" หมายถึงยืนยันจากโค้ด/rules — **ยังไม่ได้พิสูจน์ด้วยการโจมตีจริงหรือ Emulator**

### 12.1 Security

| ID | ระดับ | ข้อค้นพบ | หลักฐาน | สถานะ |
|---|---|---|---|---|
| S-01 | **High** | **สมัครแล้วใช้งานได้ทันที**: ใครก็ได้ที่สร้างบัญชี Firebase Auth สร้าง `users/{uid}` เองด้วย `active:true` และเลือก `hospital_id` ใดก็ได้ → ได้สิทธิ์ H ของ รพ.สต. นั้นทันที (อ่าน/แก้ใบเบิก คลัง เครดิต) ไม่มีขั้นอนุมัติ; สมัครเป็น `pharmacy` โดยเลือก dept ที่ไม่ใช่ห้องยาก็ผ่าน rules (ตรวจ kind เฉพาะฝั่ง client) | `index.html:330-350`; `firestore.rules:94-106` | Verified (โค้ด) |
| S-02 | **High** | Rules `requisitions` ฝั่ง รพ.สต. (Draft/Pending/Rejected→Pending) **ไม่จำกัดฟิลด์** → แก้ `invs_*`, `invs_dispense_snapshot`, `invs_confirm_flag`, `vmi_*`, `approved_*`, `is_printed:false` (ปลดล็อกหลังพิมพ์) ได้ผ่าน SDK โดยตรง; *Inferred:* snapshot ปลอม + confirm `Y` อาจทำให้ engine สร้างล็อตรับเข้าเกินจริง | `firestore.rules:219-233`; `sync_virtual_stock.php:325-365` | Verified (rules) / Inferred (ผลกระทบ) |
| S-03 | **High** | รพ.สต. เขียน `current_excess.excess_balance` (เครดิต ใช้คำนวณยอดจ่าย) และ `config_par.par_qty` (Target Stock) ของตนเองได้ตรง ไม่จำกัดค่า (excess ติดลบได้) | `firestore.rules:166-206`; ผู้ใช้จริงคือ ReturnDrugView `app.html:1499` | Verified |
| S-04 | Medium | `vmi_stock_events` create ฝั่ง H ไม่จำกัด doc id/ฟิลด์เพิ่ม → อาจสร้าง id ซ้ำกับ `RECON__{req}__{drug}` ล่วงหน้าทำให้ engine ข้ามการกระทบยอด | `firestore.rules:379-388`; `sync_virtual_stock.php:40, 273-277` | Inferred |
| S-05 | Medium | Bridge `GET health` ไม่ต้อง auth และคืน host/ชื่อฐานข้อมูล/path ไฟล์ config; CORS `*` + `Allow-Private-Network` ทำให้เว็บใดก็ได้ที่ผู้ใช้ใน LAN เปิดอยู่เรียกได้ | `invs_api.php:36-40, 591-608` | Verified |
| S-06 | Medium | `verifyUser` (Vercel) **ไม่ตรวจ `active`** → แอดมินที่ถูกปิดบัญชียังเรียก line-cron/line-notify ได้; `dispensed` กรองด้วย `status !== 'Inactive'` ไม่ใช่ `active`; cron push ถึงผู้ใช้ที่ผูก LINE แม้ inactive | `api/_lib/core.js:140-148`; `line-notify.js:21`; `line-cron.js:49` | Verified |
| S-07 | Medium | ลิงก์ใบสรุปการจ่าย HMAC **ไม่มีวันหมดอายุ** และ secret fallback ไปใช้ `LINE_CHANNEL_SECRET` → ลิงก์ที่หลุดเปิดได้ตลอด (ข้อมูลยา/ล็อต/มูลค่า ไม่มีข้อมูลผู้ป่วย) | `core.js:152-154`; `dispense-sheet.js:45-62` | Verified |
| S-08 | Medium | สคริปต์ CDN ไม่มี SRI ส่วนใหญ่ (`integrity=` พบ 2 จุดใน app.html, 0 ใน internal/index) และ Tailwind Play CDN ไม่ระบุเวอร์ชัน → ความเสี่ยง supply chain | `app.html`, `internal.html`, `index.html` `<script src>` | Verified |
| S-09 | Low | `master_hospitals`, `master_depts` อ่านได้โดยไม่ login (มี `sign_names` ชื่อเจ้าหน้าที่, พิกัด, `invs_dept_id`) | `firestore.rules:80, 426` | Verified |
| S-10 | Low | `cache_tombstones` ผู้ใช้ทุกคนสร้างป้ายลบของเอกสารใดก็ได้ → เครื่องอื่นลบออกจากแคช (จนกว่าเอกสารถูกแก้/โหลดเต็ม 21 วัน/bump epoch) | `firestore.rules:508-518`; `shared.js:1651-1655` | Verified |
| S-11 | Low | ฟิลด์ master ระดับทั้งระบบแก้ได้โดยผู้ใช้ทุกหน่วย: `master_drugs.fuzzy` (รพ.สต. ทุกแห่ง), `hosxp_multiplier` (ห้องยา) | `firestore.rules:147-153` | Verified |
| S-12 | Low | `vaccine_requisitions` ไม่ล็อกสถานะ เจ้าของแก้/ลบได้ทุกเวลา | `firestore.rules:414-421` | Verified |
| S-13 | Low | `audit_logs` เนื้อหาปลอมได้ (ตรวจแค่ `actor_uid`) — ใช้เป็นหลักฐานทางการไม่ได้เต็มที่ | `firestore.rules:285-294` | Verified |
| S-14 | Low | view `config`, `create_req` ไม่มี role gate ตอน render (ซ่อนเมนูเท่านั้น; ข้อมูลยังถูก rules คุม) | `app.html:10832, 10839` | Verified |
| S-15 | Info | Firebase web API key อยู่ใน `shared.js:8-16` และเป็น fallback ใน `core.js:6`; URL GAS ใน `shared.js:18` — ไม่ใช่ secret แต่ควรจำกัด HTTP referrer / ตรวจผู้เรียกฝั่ง GAS | อ้างอิงตามบรรทัด | Verified |
| S-16 | Info | ✔ จุดแข็ง: webhook ตรวจลายเซ็นแบบ timing-safe; Bridge ตรวจ ID token + `active===true` + role; marker กันส่งซ้ำ; rules มี catch-all deny; LINE link code อายุ 10 นาทีใช้ครั้งเดียว; ไม่พบ secret ในรีโป | `line-webhook.js:57-59`; `invs_api.php:248-305`; `firestore.rules:536` | Verified |

### 12.2 Reliability

| ID | ระดับ | ข้อค้นพบ | หลักฐาน | สถานะ |
|---|---|---|---|---|
| R-01 | Medium | `api/` ไม่มี timeout/retry (fetch ไป Google/LINE) — ถ้าปลายทางค้าง function ค้างจนหมดเวลา Vercel | `api/_lib/core.js` ทั้งไฟล์ | Verified |
| R-02 | Medium | ตัวนับโควตา LINE เป็น read-modify-write ไม่ atomic → นับขาดเมื่อส่งพร้อมกัน (ใช้ max กับยอด LINE จริงช่วยบรรเทา) | `core.js:131-132` | Verified |
| R-03 | Medium | `sync_requisition_status` อ่านเฉพาะ `requisitions` → ใบภายในไม่ได้สถานะยืนยันจ่าย/ล็อตจริงจาก INVS | `sync_requisition_status.php:32-41` | Verified |
| R-04 | Medium | `applyUsageCutToVirtualStock` จับ error แล้ว `console.warn` อย่างเดียว (ผู้ใช้ไม่รู้ว่าตัดไม่ครบ) และตัดเฉพาะส่วนเพิ่ม — ถ้าแก้ใบลดยอดใช้ ไม่คืนสต๊อก | `app.html:906-937` | Verified (โค้ด) |
| R-05 | Medium | `sync_ncds` เรียก `cli/lib_ncds_sync.php` ที่ไม่มีในรีโป → 500 `LIB_MISSING` ถ้าไฟล์บนเครื่องจริงไม่มี | `invs_api.php:716-718` | Blocked |
| R-06 | Low | `substock_send` ไม่ตรวจมูลค่ารวม/ไม่ตั้ง SEND_FLAG แบบที่ `send` ทำ (ตรวจเฉพาะจำนวนบรรทัด) | `invs_api.php:1100-1104` | Verified |
| R-07 | Low | ReturnDrugView เขียนทับ `current_excess` นอก flow อนุมัติ — ถ้าแอดมินอนุมัติใบพร้อมกันอาจทับค่ากัน | `app.html:1499`; `app.html:4973-4983` | Inferred |
| R-08 | Low | `line-webhook` ตอบ 200 แม้ error (ตั้งใจกัน retry) → เหตุการณ์ที่ล้มหายเงียบ มีแค่ log | `line-webhook.js:62-67` | Verified |
| R-09 | Low | คำว่า "Target Stock" ใช้ 2 ความหมาย: `targetVMI` (สถิติในใบเบิก) กับ `config_par.par_qty` (คลังยาของฉัน/ใบ ฉ/cron) | `shared.js:625`; `app.html:1992` | Verified |
| R-10 | Info | ✔ จุดแข็ง: อนุมัติ 2 เฟส + token, เขียนซ้ำได้ (deterministic ids), Bridge cleanup partial + ตรวจจำนวน/มูลค่าหลัง insert, CLI ใช้ hash กันเขียนซ้ำ, `sync_master` ค่าเริ่มต้น TEST | `app.html:4859-5045`; `invs_api.php:449, 1300-1367` | Verified |

### 12.3 Performance

| ID | ระดับ | ข้อค้นพบ | หลักฐาน | สถานะ |
|---|---|---|---|---|
| P-01 | Medium | คอมไพล์ JSX ในเบราว์เซอร์ทุกครั้ง (Babel standalone) กับ `app.html` ~10,874 บรรทัด → โหลดครั้งแรกช้าบนเครื่องสเปกต่ำ | `app.html` `<script type="text/babel">` | Verified (โครงสร้าง) / Not Verified (ไม่ได้วัดเวลา) |
| P-02 | Low | Tailwind Play CDN สร้าง CSS ตอน runtime (ผู้ผลิตไม่แนะนำสำหรับ production) | `<script src="https://cdn.tailwindcss.com">` | Verified |
| P-03 | Low | `line-cron` อ่านทั้ง collection (`users`, `master_drugs`, `config_par`, `vmi_virtual_lots` ที่เหลือ >0) ทุกวัน → ค่า read โตตามข้อมูล | `line-cron.js:49-74` | Verified |
| P-04 | Low | ขาด composite index `vmi_stock_events (hospital_id, created_at desc)` → fallback query ไม่เรียง | `app.html:1945-1947` | Verified |
| P-05 | Info | ✔ จุดแข็ง: read-saver IndexedDB + delta sync + tombstone + epoch ลดการอ่าน Firestore อย่างมีนัยสำคัญ; แอดมินโหลดข้อมูลราย รพ.สต. ตามต้องการ (`hospScopesRef`) | `shared.js:1461-1746`; `app.html:10586-10714` | Verified (โค้ด) |

---

## 13. QA Test Cases และ Test Results

### 13.1 สภาพแวดล้อมการทดสอบ

| รายการ | ค่า |
|---|---|
| วันที่รัน | 22 ต.ค. 2569 (2026-10-22) |
| Commit | `ebb2d0c` (โค้ด) |
| Runtime | Node 22.22.0, Playwright (global), Chromium `/opt/pw-browsers/chromium` (141.0.7390.37), TypeScript (transpile JSX) |
| Harness | `tests/fake-firebase.js` (Map ในหน่วยความจำ **ไม่บังคับ rules**), `tests/react-shim.js`, `build.js` แปลงหน้า HTML → `t_*.html` |
| การปรับก่อนรัน | สำเนาเทสต์ไปโฟลเดอร์ scratch แล้วแก้ path เครื่องเดิมใน `build.js`, `depttest.js`, `v64.js` (ตามที่ CLAUDE.md ระบุ) — **ไม่ได้แก้ไฟล์ในรีโป** |
| Log ฉบับเต็ม | `docs/blueprint/test-run-2026-10-22.log` |

### 13.2 ผลรวม

| ผล | จำนวนเช็ก | หมายเหตุ |
|---|---:|---|
| Pass | 107 | รวม `line_webhook_test` 6 เช็ก (รันแยกพร้อมอาร์กิวเมนต์) |
| Fail | **2** | T-14, T-15 (วิเคราะห์ด้านล่าง) |
| Blocked | 1 สคริปต์ | `depttest.js` ต้องการ `/tmp/depts.json` ที่ไม่มีในรีโป |
| Log-only | 1 สคริปต์ | `v69_invs_stock.js` พิมพ์ค่าแต่ไม่ assert (ค่า true ทั้งหมด, ไม่มี error) |
| JSX syntax | OK | `check_jsx.js app.html internal.html` → block 1 OK ทั้งสองไฟล์ |

> ผล Pass ทั้งหมดเป็น **smoke test ในระบบจำลอง** — ไม่ได้ยืนยันสิทธิ์ Firestore จริง, Bridge/INVS จริง, LINE จริง หรือ Vercel

### 13.3 รายการเทสต์และผล

| Test ID | สคริปต์ | ครอบคลุม | เช็ก | ผล |
|---|---|---|---:|---|
| T-01 | `check_jsx.js` | ไวยากรณ์ JSX `app.html`, `internal.html` | 2 | **Pass** |
| T-02 | `depttest.js` | รายชื่อหน่วยงาน INVS + version guard | — | **Blocked** (ไม่มี fixture `/tmp/depts.json`) |
| T-03 | `line_webhook_test.js` | ลายเซ็นผิด, รหัสหมดอายุ, ผูกสำเร็จ, reply, unfollow, GET info | 6 | **Pass** (รันด้วย `node tests/line_webhook_test.js $PWD/api/line-webhook.js`) |
| T-04 | `v64.js` | ประมาณการห้องยา, Draft, พิมพ์, KPI, NCDs outreach, ลำดับคอลัมน์ใบ รพ.สต. | 17 | **Pass** |
| T-05 | `v66.js` | ซ่อนหมวด 5/6, เรียงตามตำแหน่ง, ผู้ลงนาม | 6 | **Pass** |
| T-06 | `v663.js` | เส้นจุดกลุ่มตำแหน่ง, รายการส่ง INVS เพิ่ม | 5 | **Pass** |
| T-07 | `v664.js` | คอลัมน์แดชบอร์ด, เรียงใหม่→เก่า, ปุ่มรวม INVS, sign names | 9 | **Pass** |
| T-08 | `v665.js` | ชื่อไฟล์ PDF ใบหน่วยงาน, คอลัมน์, ค้นหารหัสตรงก่อน/ชื่อพ้อง/รูป | 7 | **Pass** |
| T-09 | `v670.js` | คืนยา: ตัวกรองหมดอายุ, คำนวณคืน FEFO, ตัดล็อต, เครดิต, ใบคืน | 8 | **Pass** |
| T-10 | `v680.js` | LineLinkPrompt + สร้างรหัสผูก | 6 | **Pass** |
| T-11 | `v690.js` | LINE Console | 3 | **Pass** |
| T-12 | `v69_emergency.js` | ใบ ฉ: แดง/เหลือง/เขียว, บันทึก, พิมพ์, รวมเข้าใบหลัก | 9 | **Pass** |
| T-13 | `v69_invs_stock.js` | ปุ่ม/ใบเบิกพร้อมยอดคงเหลือ | (log) | **Log-only** — ไม่มี error |
| T-14 | `v69_urgent.js` | เบิกยาด่วน → รวมเข้าใบรอบ | 10 | **9 Pass / 1 Fail** (`item merged with note`) |
| T-15 | `v69_stock.js` | โหมดตาราง, FEFO trim, บิล, ตัวกรอง, บันทึก | 6 | **5 Pass / 1 Fail** (`table shows only remaining lots`) |
| T-16 | `v610_count.js` | ใบตรวจนับ, ปรับ FEFO, บันทึกผล, ประวัติยอดใช้ | 7 | **Pass** |
| T-17 | `v610_substock.js` | SubstockSyncView preflight/send (Bridge จำลอง) | 6 | **Pass** |
| T-18 | `v611_count_status.js` | สถานะตรวจนับ, หน้า NCDs | 4 | **Pass** |

### 13.4 วิเคราะห์ Fail

| Test | Assertion ที่ล้ม | การตรวจซ้ำ (probe) | ข้อสรุป |
|---|---|---|---|
| T-14 | `body.innerText` ต้องมี "รวมเบิกด่วน 1,000" | อ่านค่า `<input>/<textarea>` แทน → พบ `"รวมเบิกด่วน 1,000 ชิ้น"` (Pass); เช็กถัดไป `req qty includes urgent` และ `urgent merged` ก็ Pass | **Inferred: assertion ล้าสมัย** — หมายเหตุอยู่ในช่อง input ซึ่ง `innerText` ไม่อ่าน ไม่ใช่ข้อบกพร่องของฟังก์ชัน |
| T-15 | `innerText('#stock-table-view')` ต้องมี "NEW" | อ่านค่า `<input>` → `["MID","2027-01-01","50","NEW","2028-01-01","50"]` (Lot OLD ถูกตัดตาม FEFO ถูกต้อง); เช็ก `FEFO trim: MID 50 NEW 50` Pass | **Inferred: assertion ล้าสมัย** — เลข Lot ในโหมดตารางเป็นช่องแก้ไขได้ (`app.html:2555`) |

ทั้งสองยังนับเป็น **Fail** ในผลทางการจนกว่าจะแก้เทสต์และรันใหม่ (ข้อเสนอ RM-12)

### 13.5 Test cases ที่แนะนำเพิ่ม (ยังไม่มี — Not Run)

| TC | เป้าหมาย | วิธี |
|---|---|---|
| TC-SEC-01 | ผู้สมัครใหม่ต้องอ่านข้อมูล รพ.สต. ไม่ได้จนกว่าแอดมินเปิดใช้ | `@firebase/rules-unit-testing` + Emulator |
| TC-SEC-02 | รพ.สต. แก้ `invs_*`, `vmi_*`, `approved_*`, `is_printed:false` ใน `requisitions` ต้องถูกปฏิเสธ | Emulator |
| TC-SEC-03 | รพ.สต. แก้ `current_excess`/`config_par` ตรง ๆ ต้องถูกปฏิเสธ (หลังแก้ rules) | Emulator |
| TC-SEC-04 | Bridge `GET health` ต้องไม่เปิดเผย host/DB | PHP built-in server + curl |
| TC-REL-01 | `applyUsageCutToVirtualStock` ส่งซ้ำ/แก้ใบ ตัดเฉพาะส่วนต่าง | Playwright + fake-firebase |
| TC-REL-02 | `handleApprove` ล้มกลางทาง → ApprovalFailed → ลองใหม่ได้ผลเดียวกัน | Playwright (บังคับ error) |
| TC-BR-01 | Bridge `send` ซ้ำด้วย marker เดิม → `already_sent` ไม่สร้างเอกสารใหม่ | MariaDB schema จำลอง |
| TC-CLI-01 | `sync_virtual_stock` baseline → reconcile → receipt (ไม่บวก emergencyQty ซ้ำ) | Firestore Emulator + PHP CLI |
| TC-LINE-01 | `line-cron` เกณฑ์ 180/30 ส่งครั้งเดียว, เตือนตรวจนับวันที่ 1–7 ครั้งเดียว | Node + fetch จำลอง (แบบ `line_webhook_test`) |

---

## 14. Known Issues, Missing Features และ Technical Debt

### 14.1 Known Issues

| ID | ประเด็น | หลักฐาน | สถานะ |
|---|---|---|---|
| KI-01 | `APP_VERSION` ยังเป็น `6.10.0` แม้ commit เป็น v6.11 (สอดคล้องกันทั้ง 3 หน้า จึงไม่เกิดแบนเนอร์ — v6.11 ไม่ได้แก้ shared.js) | `shared.js:32`; ข้อความ commit `ebb2d0c` | Verified |
| KI-02 | ครุฑในใบ ว.3/1: data URI เดิมเสีย ต้องมีไฟล์ `garuda.png` ที่ถูกต้องที่ราก repo | CLAUDE.md v6.9 | Not Verified (รอไฟล์จากผู้ใช้) |
| KI-03 | ข้อมูลทดสอบใน INVS คลัง 13 (ยา 02110) ตัดไป 5,600 แทน 5,590 จากแท็บ "ป้อนข้อมูลคงเหลือเอง" — ผู้ใช้ตัดสินใจไม่กลับรายการ | CLAUDE.md "ผลทดสอบ 2" | Verified (รายงานผู้ใช้) |
| KI-04 | เทสต์ 2 assertion ล้าสมัย (T-14, T-15) และ `depttest` ขาด fixture | หัวข้อ 13 | Verified |
| KI-05 | `firestore.rules` header ระบุ v6.9 ส่วน CLAUDE.md ระบุ v6.8 | `firestore.rules:2` | Verified |

### 14.2 Missing Features (ขาด/ยังไม่ทำ)

| ID | รายการ | หลักฐาน |
|---|---|---|
| MF-01 | `cli/lib_ncds_sync.php` ไม่อยู่ในรีโป (ผู้เขียน `ncds_demand_inbox`) | `invs_api.php:718` |
| MF-02 | ไม่มีผู้เขียน `config_par` (Target Stock) ในแอปปัจจุบัน — ไม่รู้ว่าดูแลผ่านช่องทางใด | ค้นทั้ง app/internal/shared ไม่พบการเขียน |
| MF-03 | สถานะยืนยันจ่าย INVS ของใบภายใน (CLI ไม่ครอบคลุม) | `sync_requisition_status.php` |
| MF-04 | LINE สำหรับหน่วยงานภายใน (ยังไม่มี) | CLAUDE.md LINE OA |
| MF-05 | ขั้นตอนอนุมัติผู้สมัครใหม่ (pending approval) | `index.html:339-346` |
| MF-06 | ทดสอบ rules อัตโนมัติ / CI | ไม่มี `.github/workflows`, ไม่มี emulator config |
| MF-07 | Deep link URL ต่อหน้า (route) — รีเฟรชแล้วกลับแดชบอร์ด | `app.html:10548` |
| MF-08 | README โครงการ (มีเพียงชื่อ) | `README.md` |

### 14.3 Technical Debt

| ID | รายการ | ผลกระทบ |
|---|---|---|
| TD-01 | `app.html` 10,874 บรรทัด ไฟล์เดียว (21 view + modal) | แก้ยาก, merge conflict, ตรวจทานยาก |
| TD-02 | คอมไพล์ JSX ในเบราว์เซอร์ + Tailwind Play CDN | ประสิทธิภาพ, ความเสี่ยง CDN |
| TD-03 | ไม่มี `package.json`/lockfile — dependency ทั้งหมดมาจาก CDN ตอนรัน | ควบคุมเวอร์ชันยาก |
| TD-04 | ไฟล์ legacy `index2.html`, `index3.html`, `landing.html` ยังชี้ Firestore จริง | ผิวการโจมตี/สับสน |
| TD-05 | เทสต์บางไฟล์ชี้ path เครื่องเดิม (`/home/claude/...`, `/mnt/user-data/outputs`) | รันไม่ได้ทันที |
| TD-06 | ตรรกะ "สมมติยอด = Target" ซ้ำ 3 ที่ (`effectiveLots`, `effectiveRemainingByDrug`, `assumeAtTarget`) | แก้ไม่ครบที่ → ผลต่างกัน |
| TD-07 | ฟังก์ชันไม่มีผู้เรียก: `buildPharmacyEstimateFormHtml` (`shared.js:2046`), `getExtraDispenseValue`, `fetchWithTimeout` | โค้ดตาย |
| TD-08 | `sync_virtual_stock.php` คอมเมนต์หัวไฟล์ยังเขียน v1.1 ขณะค่าเวอร์ชัน 1.2.0 | เอกสารคลาดเคลื่อน |
| TD-09 | รายการค่า role ซ้ำ 4 ที่ (rules, shared.js, Bridge, core.js) ไม่เหมือนกันทั้งหมด | สิทธิ์ไม่สอดคล้อง |
| TD-10 | ระบบ Sawee Refer อยู่ในรีโปเดียวกัน | ขอบเขต deploy/ตรวจสอบปน |

---

## 15. Recommendations และ Remediation Plan

ลำดับตามความเสี่ยง × ความง่าย แต่ละข้อต้องได้รับการอนุมัติจากผู้ใช้ก่อนแก้ (ตามกฎ "แก้เฉพาะที่ขอ") — **เอกสารนี้ไม่ได้แก้โค้ดใด ๆ**

| ID | ระยะ | ข้อเสนอ | แก้ข้อค้นพบ | ไฟล์ที่กระทบ | ความพยายาม |
|---|---|---|---|---|---|
| RM-01 | ทันที | ผู้สมัครใหม่ `active:false` + rules บังคับ `request.resource.data.active == false` ตอน create; แอดมินเปิดใช้ในแท็บผู้ใช้; ตรวจ `master_hospitals/{hospital_id}` มีอยู่ และ dept kind ตรงบทบาท | S-01, MF-05 | `index.html`, `firestore.rules` | S |
| RM-02 | ทันที | จำกัดฟิลด์ที่ H แก้ใน `requisitions` ด้วย `affectedKeys().hasOnly([...])` (items, totals, sign, notes, status, revision, updated_at…) และห้ามแตะ `invs_*`, `vmi_*`, `approved_*`, `is_printed:false` | S-02 | `firestore.rules` | M |
| RM-03 | ทันที | `current_excess` / `config_par`: ให้ H เขียนไม่ได้ (ย้ายการปรับเครดิตจากคืนยาไปเป็น `stock_adjustments` รออนุมัติ หรือให้แอดมินยืนยัน) อย่างน้อยบังคับ `excess_balance >= 0` | S-03, R-07 | `firestore.rules`, `app.html` ReturnDrugView | M |
| RM-04 | ทันที | Bridge `GET health` ตอบเฉพาะ `{ok, bridge_version}` เมื่อไม่มี token; รายละเอียด DB ให้ admin POST `authcheck` | S-05 | `invs_api.php` | S |
| RM-05 | สั้น | `verifyUser` ตรวจ `active !== false`; `dispensed`/cron กรองด้วย `active` | S-06 | `api/_lib/core.js`, `line-notify.js`, `line-cron.js` | S |
| RM-06 | สั้น | ใส่วันหมดอายุในลิงก์ใบสรุป (เช่น 30 วัน, ใส่ `exp` ใน HMAC) และบังคับ `SHEET_SECRET` แยก | S-07 | `core.js`, `dispense-sheet.js` | S |
| RM-07 | สั้น | `vmi_stock_events` create ฝั่ง H: ห้าม doc id ขึ้นต้น `RECON__`/`RECEIPT__`/`BASELINE__` | S-04 | `firestore.rules` | S |
| RM-08 | สั้น | เพิ่ม `AbortController` timeout (เช่น 10–15 วินาที) ใน `core.js`; ตัวนับโควตาใช้ Firestore `increment` (REST `fieldTransforms`) | R-01, R-02 | `api/_lib/core.js` | S |
| RM-09 | สั้น | แจ้งผู้ใช้เมื่อ `applyUsageCutToVirtualStock` ตัดไม่ครบ (toast + เก็บรายการล้ม) และพิจารณาคืนยอดเมื่อยอดใช้ลดลง | R-04 | `app.html` | S |
| RM-10 | สั้น | กู้/เพิ่ม `lib_ncds_sync.php` เข้ารีโป (ไม่มี secret) หรือถอด action `sync_ncds` | R-05, MF-01 | Bridge | S |
| RM-11 | สั้น | เพิ่ม composite index `vmi_stock_events (hospital_id ASC, created_at DESC)` | P-04 | `firestore.indexes.json` | XS |
| RM-12 | สั้น | แก้ assertion T-14/T-15 ให้อ่านค่า input, เพิ่ม fixture ของ `depttest`, แก้ path เครื่องเดิมใน tests ให้ใช้ `npm root -g`/`__dirname` | KI-04, TD-05 | `tests/` | XS |
| RM-13 | กลาง | ทดสอบ rules ด้วย Firebase Emulator + `@firebase/rules-unit-testing` (TC-SEC-01..03) และตั้ง CI (GitHub Actions) รัน `check_jsx` + smoke tests | MF-06 | ใหม่ | M |
| RM-14 | กลาง | ปักเวอร์ชัน + SRI ให้สคริปต์ CDN; เปลี่ยน Tailwind Play CDN เป็น CSS ที่ build แล้ว (ทำได้แบบที่ใช้ทำภาพหน้าจอในเอกสารนี้) | S-08, P-02 | 3 HTML | M |
| RM-15 | กลาง | ให้ CLI สถานะยืนยันจ่ายครอบคลุม `internal_requisitions` | R-03, MF-03 | `sync_requisition_status.php` | M |
| RM-16 | ยาว | Pre-compile JSX (esbuild/ts) เป็นไฟล์ .js แยกตามหน้า และแยก `app.html` เป็นโมดูลต่อ view | P-01, TD-01, TD-02 | โครงสร้างทั้งหมด | L |
| RM-17 | ยาว | รวมตรรกะ "สมมติยอด = Target" ไว้ที่ `shared.js` ฟังก์ชันเดียว (cron ใช้สำเนา Node) และรวมรายการ role ไว้ที่เดียว | TD-06, TD-09 | shared.js, api | M |
| RM-18 | ยาว | ย้ายไฟล์ legacy และระบบ Refer ออกจากรีโปหลัก/โฟลเดอร์แยก | TD-04, TD-10 | รีโป | S |

**ลำดับแนะนำ:** RM-01 → RM-02 → RM-03 → RM-04 (ปิดช่องเสี่ยงสูง ภายในรอบเดียว: rules + index.html + Bridge) → RM-12/RM-13 (ทำให้ทดสอบ rules ได้) → ที่เหลือตามรอบพัฒนา
หมายเหตุการติดตั้ง: RM-01..03, 07, 11 ต้อง publish `firestore.rules`/indexes ผ่าน Firebase Console; RM-04, 10 ต้องวางไฟล์ Bridge ที่ `C:\SaweeRefill\public\` / `cli\`

---

## 16. Traceability Matrix

Requirement มาจาก CLAUDE.md (ข้อตกลงที่ผู้ใช้ยืนยัน) และคำขอในงานพัฒนา

| Req | Requirement | Page / View | Function (ไฟล์:บรรทัด) | API / Bridge | Database | Test | สถานะ |
|---|---|---|---|---|---|---|---|
| RQ-01 | รพ.สต. เบิกยาจากยอดใช้ รบ.301 | app.html `create_req` | `handleJHCISUpload` 3054, `recalcVmiItem` shared.js:629, `executeSubmit` 3208 | GAS upload | `requisitions`, `historical_usages` | T-04 (rpst order) | Partially Verified |
| RQ-02 | เดือนรอบ = ทำ 20–31 ของเดือน M → รอบ M+1; รอบบิล `NN/FY` | create_req, dashboard | `getNextCalendarPeriod` shared.js:131, `formatBillRound` :578 | — | `requisitions.month/year` | T-07 | Partially Verified |
| RQ-03 | ปุ่มเดียว "ส่ง INVS + บันทึกจัดยา" | `view_req` | `handleInvsPreflight` 4772, `handleInvsSend` 4795, `handleApprove` 4859 | Bridge `preflight`/`send` | `sm_po`, `sm_po_c`, `requisitions`, `current_excess` | T-07 (ปุ่ม) | Partially Verified |
| RQ-04 | วันที่เบิก INVS = จันทร์ทำการแรก | view_req modal | `firstWorkingMondayOf` shared.js:601 | Bridge `request_date` | `sm_po.SUB_PO_DATE` | — | Verified (โค้ด) / Not Run |
| RQ-05 | Bridge เขียน INVS ได้เฉพาะ sm_po/sm_po_c | — | `invs_api.php` ทั้งไฟล์ | ทุก action | INVS | — | Verified (โค้ด) |
| RQ-06 | รายการส่ง INVS เพิ่ม ไม่ผ่าน VMI | view_req | `saveInvsExtras` 4176 | Bridge merge | `requisitions.invs_extra_items` | T-06 | Partially Verified |
| RQ-07 | ใบ ฉ ตรวจผ่าน/ข้อสังเกต + รวมเข้าใบหลัก | `emergency_req`, create_req | `checkEmergencyItems` 552, merge 2789-3420 | Bridge qty+emergency | `rpst_emergency`, `requisitions` | T-12 | Partially Verified |
| RQ-08 | คืนยารายล็อต + ใบทางการ | `return_drug` | ReturnDrugView 1367, `buildReturnFormHtml` shared.js:1243 | — | `stock_returns`, `vmi_*`, `current_excess` | T-09 | Partially Verified |
| RQ-09 | คลังยาของฉัน: shelf/ตาราง, สมมติ = Target FEFO | `my_stock` | `effectiveLots` 1992, `saveTableRow` 2208 | — | `vmi_virtual_lots`, `vmi_stock_events` | T-15 (1 Fail ดู 13.4) | Partially Verified |
| RQ-10 | ตรวจนับ + ใบตรวจนับ + ปรับ FEFO | `my_stock` แท็บตรวจนับ | 2263-2328, `buildStockCountFormHtml` shared.js:1327 | — | `vmi_stock_counts`, `vmi_*` | T-16 | Partially Verified |
| RQ-11 | ส่งใบแล้วตัดยอดใช้ทันที (v6.11) | create_req | `applyUsageCutToVirtualStock` 897 | — | `vmi_virtual_lots`, `vmi_stock_events` | — | Verified (โค้ด) / Not Run |
| RQ-12 | ตัดคลังย่อย INVS ตามยอดใช้/ยอดจริง | `substock_sync`, view_req | SubstockSyncView 745, `postUsageToSubstock` 942 | Bridge `substock_*` | `sm_po`(S), `sm_po_c`, `invs_substock_posts` | T-17 | Partially Verified |
| RQ-13 | หน่วยงานเบิกตามรอบ / แอดมินคีย์ย้อนหลัง | internal.html | RoundPickStep 431, `saveInternalReq` 554 | Bridge `source=internal` | `internal_requisitions` | T-08, T-14 | Partially Verified |
| RQ-14 | เบิกยาด่วนรวมเข้าใบรอบ | internal.html เบิกยาด่วน | UrgentReqView 1784, merge 622-649 | — | `internal_urgent` | T-14 (1 Fail ดู 13.4) | Partially Verified |
| RQ-15 | ห้องยา: HOSxP, ประมาณการ, Draft รอส่ง, ซ่อนหมวด 5/6 | internal.html PharmacyReqView | 942-1602, `calcPharmacySuggestion` shared.js:962 | Bridge `hosxp_usage` | `internal_requisitions`, `internal_stock` | T-04, T-05 | Partially Verified (Bridge Not Run) |
| RQ-16 | ใบพิมพ์ห้องยา: คอลัมน์ตามที่ตกลง, เส้นจุด, ผู้ลงนาม 4 จุด, ชื่อไฟล์ = title | internal/app | `buildInternalReqFormHtml` shared.js:1100 | — | `sign_people` | T-04, T-05, T-06, T-08 | Partially Verified |
| RQ-17 | เรียงตามหมวด → ตำแหน่ง → ชื่อ | ทุกใบ | `compareByLocation` shared.js:157-185 | — | `master_drugs.invs_location` | T-05 | Partially Verified |
| RQ-18 | ผูก LINE ด้วยรหัส 6 หลัก/QR | profile_edit, prompt | LineLinkPanel 422-470, LineLinkPrompt 1058 | `/api/line-webhook` | `line_link_codes`, `users` | T-03, T-10 | Partially Verified |
| RQ-19 | แจ้งเตือนหมดอายุครั้งเดียวต่อเกณฑ์ / ข้อความถึง จนท. ไม่ระบุเวลา | — | `line-cron.js:15-112` | `/api/line-cron` | `line_meta/expiry_levels` | — | Verified (โค้ด) / Not Run |
| RQ-20 | เตือนตรวจนับวันที่ 1–7 ครั้งเดียว/เดือน | — | `line-cron.js:114-131` | `/api/line-cron` | `line_meta/state`, `vmi_stock_counts` | — | Verified (โค้ด) / Not Run |
| RQ-21 | แจ้งจัดยาเสร็จ + ใบสรุปการจ่ายไม่ต้อง login | view_req | `notifyLineDispensed` 505 | `/api/line-notify`, `/api/dispense-sheet` | `requisitions.line_dispensed_*` | — | Verified (โค้ด) / Not Run |
| RQ-22 | โควตา LINE 80% / 95% | LINE Console | `core.js:109-136`, LineConsoleView 957 | `/api/line-notify status` | `line_meta/quota_*`, `line_logs` | T-11 (UI) | Partially Verified |
| RQ-23 | สถานะตรวจนับ + จับคู่ NCDs (แอดมิน) | `count_status`, `ncds_mapping` | 10185, 10244 | Sawee Refer (อ่าน) | `vmi_stock_counts`, `master_drugs.hosxp_code` | T-18 | Partially Verified |
| RQ-24 | ทุกการเขียนผ่าน write hooks (`updated_at`) | ทุกหน้า | `rxInstallWriteHooks` shared.js:1676-1746 | — | ทุก collection ใน `RX_DELTA_FIELDS` | (โดยอ้อมทุกเทสต์) | Partially Verified |
| RQ-25 | ไม่มี secret ในรีโป | — | — | — | — | ตรวจด้วยการอ่านไฟล์ | Verified (ไม่พบค่า secret; มีเพียง Firebase web config ซึ่งเป็นค่าสาธารณะ) |
| RQ-26 | Version guard | ทั้ง 3 หน้า | `app.html:235-249` | — | — | T-02 (Blocked) | Verified (โค้ด) |

---

## 17. Appendix

### 17.1 รายการภาพหน้าจอ (29 ไฟล์ — `docs/blueprint/screens/`)
A01–A15 (แอดมิน), H01–H10 (รพ.สต.), I01–I03 (หน่วยงาน), X01 (หน้าแรก) — ทุกภาพเป็นข้อมูลจำลอง

### 17.2 วิธีทำซ้ำการทดสอบ

```bash
# 1) ตรวจ JSX
node tests/check_jsx.js app.html internal.html
# 2) smoke tests (ทำในโฟลเดอร์ทำงานแยก แล้วแก้ path เครื่องเดิมใน build.js / depttest.js / v64.js ก่อน)
cp app.html internal.html index.html shared.js tests/*.js <workdir>/ && cd <workdir>
node build.js && for t in v64 v66 v663 v664 v665 v670 v680 v690 v69_urgent v69_stock v69_emergency v69_invs_stock v610_count v610_substock v611_count_status; do node build.js >/dev/null; node $t.js; done
# 3) webhook
node tests/line_webhook_test.js "$PWD/api/line-webhook.js"
```

### 17.3 วิธีทำภาพหน้าจอให้มีสไตล์ (ไม่พึ่ง CDN)
build Tailwind 3.4.17 จาก class ใน `app.html/internal.html/index.html/shared.js` (`npx tailwindcss --content ...`), ใช้ `@fortawesome/fontawesome-free@6.4.0`, `@fontsource/sarabun`, `leaflet@1.9.4` จาก npm แล้วแทรก `<link>` ในหน้า `t_*.html` — วิธีเดียวกันใช้เป็นแนวทาง RM-14 ได้

### 17.4 อภิธานศัพท์

| คำ | ความหมาย |
|---|---|
| VMI | Vendor Managed Inventory — ห้องยา รพ.สวี เติมยาให้ รพ.สต. ตามเป้า |
| รบ.301 | รายงานยอดใช้ยาของ รพ.สต. (ไฟล์ Excel/CSV จาก JHCIS/HOSxP PCU) |
| Target Stock / `targetVMI` | ยอดเป้าที่ควรมี = ceil(ค่าเฉลี่ย + 1.645·SD) ของ 6 เดือน (ในใบเบิก) |
| `par_qty` | Target Stock คงที่ต่อ รพ.สต.×ยา (config_par) ใช้ในคลังยาของฉัน/ใบ ฉ/cron |
| เครดิต / ยอดเหลือ (`excess_balance`) | ยอดยาที่ระบบคาดว่าเหลือที่ รพ.สต. หลังจ่ายรอบล่าสุด |
| FEFO | First Expired, First Out |
| ใบ ฉ | ใบเบิกยาฉุกเฉินระหว่างรอบ |
| คลังย่อย / PT01 | คลัง รพ.สต. ใน INVS / แผนกสมมติ "จ่ายผู้ป่วย" ที่ INVS ใช้รับยาที่ตัดออก |
| marker (`REF_NO`) | รหัส `SV`+sha1 ที่ Bridge ใส่ใน `sm_po` เพื่อกันส่งซ้ำ |
| Read-saver | แคช IndexedDB + delta sync ลดการอ่าน Firestore |

### 17.5 แหล่งข้อมูลที่ใช้จัดทำ
- ซอร์สโค้ดใน branch ที่ระบุ (อ่านโดยตรง + การสำรวจแบบขนาน 5 ส่วน: app.html, internal/index/อื่น, API/Bridge/CLI, rules/data dictionary, business logic)
- `CLAUDE.md` (ข้อตกลงและผลทดสอบ INVS ที่ผู้ใช้รายงาน)
- ผลรันเทสต์ 22 ต.ค. 69 (`test-run-2026-10-22.log`)
- ภาพหน้าจอจากระบบทดสอบ

### 17.6 ข้อจำกัดความครบถ้วน
เอกสารนี้ไม่อ้างว่าครอบคลุม 100% — โดยเฉพาะ: พฤติกรรมจริงของ Firestore rules ที่ publish, ข้อมูลจริงใน production, INVS/HOSxP, Google Apps Script, Vercel env/log, LINE OA และระบบ Sawee Refer ไม่ได้ตรวจด้วยการรันจริง (ดูหัวข้อ 2.3)
