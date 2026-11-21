# เครื่อง pusher — ส่งข้อมูลส่งต่อขึ้น refer.html แบบเกือบ real-time

ไฟล์ในโฟลเดอร์นี้วางที่ `C:\refer\` บนเครื่อง pusher (ที่เดียวกับ `push.php`)
`push.php` **ไม่อยู่ใน repo** เพราะมีรหัสผ่าน MySQL — ห้าม commit

| ไฟล์ | หน้าที่ |
|---|---|
| `sync_worker.php` | ทำงานค้างไว้ แทน `sync_watch.php` เดิม: สัญญาณออนไลน์ · ปุ่ม Sync · ตรวจ HOSxP ทุก 2 นาที · remission ทุก 5 นาที · รอบเต็ม 02:00 |
| `RUN_WORKER.bat` | เปิด worker และเปิดใหม่เองถ้าหลุด |
| `notify.php` | (ไม่บังคับ) ให้ ncdr_app เรียกตอนกด "ส่ง รพ.สต." → ส่ง remission ทันที |

## ติดตั้ง (ครั้งเดียว)

### 1. แก้ push.php เพิ่ม `--list-changed` (จุดที่ 5 ต่อจาก `--remission-only`)
ค้นหาบรรทัด
```php
$IN_LIST = "'" . implode("','", $HCODES) . "'";
```
แล้ววางต่อท้ายบรรทัดนั้น:
```php
// --list-changed: บอก sync_worker ว่ามี HN ไหนส่งตัว/เปลี่ยนสถานะคลินิกใน HOSxP ตั้งแต่ครั้งก่อน (query เล็ก ไม่แตะ Firestore)
if (in_array('--list-changed', $argv ?? [])) {
    $db->query("CREATE TABLE IF NOT EXISTS refer_work.change_mark (k VARCHAR(32) NOT NULL PRIMARY KEY, t DATETIME NOT NULL)");
    $m = $db->query("SELECT t FROM refer_work.change_mark WHERE k='clinicmember'")->fetch_assoc();
    $now = $db->query("SELECT NOW() AS n")->fetch_assoc()['n'];
    $since = $m['t'] ?? date('Y-m-d H:i:s', strtotime($now) - 600);
    $since_e = $db->real_escape_string($since); $now_e = $db->real_escape_string($now);
    $hns = [];
    $q = $db->query("SELECT DISTINCT hn FROM clinicmember
                     WHERE lastupdate > '$since_e' AND lastupdate <= '$now_e'
                       AND ((send_to_pcu='Y' AND send_to_pcu_hcode IN ($IN_LIST)) OR clinic_member_status_id=2)
                     LIMIT 200");
    while ($q && ($x = $q->fetch_assoc())) $hns[] = $x['hn'];
    $db->query("REPLACE INTO refer_work.change_mark (k, t) VALUES ('clinicmember', '$now_e')");
    echo "CHANGED_HNS:" . json_encode($hns) . "\n";
    exit(0);
}
```
ทดสอบ: `& "C:\xampp\php\php.exe" push.php --list-changed` → บรรทัดสุดท้ายต้องเป็น `CHANGED_HNS:[...]`
(ถ้าช้า ให้ผู้ดูแล HOSxP เพิ่ม index: `ALTER TABLE clinicmember ADD INDEX idx_lastupdate (lastupdate)`)

### 2. ปิดของเดิม
- Task Scheduler: **Disable** งาน push.php รอบ 13:00 และงานที่เปิด `sync_watch.php` (worker ทำแทนแล้ว)
- ปิดหน้าต่าง `sync_watch.php` ที่เปิดค้างไว้ (ถ้ามี)

### 3. ให้ worker เริ่มเองทุกครั้งที่เปิดเครื่อง
เปิด PowerShell **Run as administrator**:
```powershell
schtasks /Create /TN "SaweeReferWorker" /TR "C:\refer\RUN_WORKER.bat" /SC ONSTART /RU SYSTEM /RL HIGHEST /F
schtasks /Run /TN "SaweeReferWorker"
```
ตรวจ: refer.html มุมขวาบนต้องขึ้น **● เครื่อง pusher ออนไลน์** ภายใน 1 นาที · log อยู่ที่ `C:\refer\logs\worker_YYYYMM.log`
ทดสอบครั้งเดียวแบบเห็นผลบนจอ: `& "C:\xampp\php\php.exe" sync_worker.php --once`

### 4. BIOS / Windows
- ตั้ง "Restore on AC power loss = Power On" ใน BIOS → ไฟดับแล้วกลับมา เครื่องเปิดเอง
- ปิด Sleep/Hibernate ของเครื่องนี้

### 5. (ไม่บังคับ) ncdr_app แจ้งทันที
1. คัดลอก `notify.php` ไป `C:\xampp\htdocs\refer\notify.php` แก้ `NOTIFY_KEY` เป็นคีย์ยาว ๆ
2. ใน ncdr_app หลังบันทึก "ส่ง รพ.สต." สำเร็จ เพิ่ม 1 บรรทัด (ไม่ทำให้ ncdr_app ช้า: timeout 2 วิ, ผิดพลาดก็ข้าม):
```php
@file_get_contents('http://<IP เครื่อง pusher>/refer/notify.php?k=<NOTIFY_KEY>', false, stream_context_create(['http' => ['timeout' => 2]]));
```
ไม่ทำข้อนี้ก็ได้ — worker ส่ง remission ให้ทุก 5 นาทีอยู่แล้ว

### 6. แจ้งเตือน LINE เมื่อเครื่องดับ
ใน Apps Script "Sawee LINE Hub" → Project Settings → Script Properties เพิ่ม
`ADMIN_LINE_IDS` = LINE userId ของ admin (ขึ้นต้นด้วย U · หลายคนคั่นด้วย ,) แล้ววางโค้ด `line-hub/Code.gs` ใหม่ + Deploy → New version
เงียบเกิน 15 นาที = LINE เตือน 1 ครั้ง · กลับมาออนไลน์ = แจ้งอีกครั้ง

## ภาระเครื่อง
- HOSxP: query เล็ก (`clinicmember.lastupdate`) ทุก 2 นาที · ส่งทีละ HN เฉพาะเมื่อมีการเปลี่ยน · รอบหนักย้ายไป 02:00
- Firestore: เขียน/อ่านเฉพาะเคสที่เปลี่ยน · หน้าเว็บฟังแบบ real-time จ่ายเฉพาะเอกสารที่เปลี่ยน
- `push.lock` กันรันซ้อน — ชนกันเมื่อไหร่ รอบหนึ่งจะข้ามไปเอง
