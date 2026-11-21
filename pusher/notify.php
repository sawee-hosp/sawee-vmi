<?php
/**
 * notify.php — ให้ ncdr_app เรียกหลังพยาบาลกด "ส่ง รพ.สต." → sync_worker ส่ง remission ทันที (ไม่ต้องรอรอบ 5 นาที)
 * วางใน C:\xampp\htdocs\refer\notify.php บนเครื่อง pusher (ต้องเปิด Apache ของ XAMPP)
 * เรียก: http://<IP เครื่อง pusher>/refer/notify.php?k=<คีย์เดียวกับ NOTIFY_KEY>
 * ไฟล์นี้แค่สร้างไฟล์ธง ไม่อ่าน/ไม่ส่งข้อมูลผู้ป่วย
 */
const NOTIFY_KEY = 'เปลี่ยนเป็นคีย์ยาวๆ';            // ← ตั้งเอง ให้ตรงกับฝั่ง ncdr_app
const FLAG_FILE  = 'C:\\refer\\remission.flag';       // ← โฟลเดอร์เดียวกับ sync_worker.php

header('Content-Type: application/json');
if (!hash_equals(NOTIFY_KEY, (string)($_GET['k'] ?? ''))) { http_response_code(403); echo '{"ok":false}'; exit; }
$ok = @file_put_contents(FLAG_FILE, date('Y-m-d H:i:s')) !== false;
echo json_encode(['ok' => $ok]);
