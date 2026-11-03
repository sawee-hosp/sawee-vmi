-- Sawee Rxfill Traceability (v6.14) — ฐานแยกบนเครื่อง Bridge ใน LAN (ไม่ใช่ INVS / HOSxP)
-- เก็บ HN/VN/AN + วันที่จ่าย + ยา + lot (ไม่มีชื่อผู้ป่วย) · ข้อมูลสุขภาพส่วนบุคคล (PDPA) — จำกัดสิทธิ์ผู้ใช้ MySQL ให้เฉพาะ Bridge
-- รันครั้งเดียวด้วยผู้ใช้ที่สร้างฐานได้ (เช่น root ใน phpMyAdmin) แล้วให้สิทธิ์ผู้ใช้ของ Bridge:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON sawee_trace.* TO '<ผู้ใช้ Bridge>'@'localhost';
CREATE DATABASE IF NOT EXISTS sawee_trace CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sawee_trace;

-- สถานะต่อยา: initial (วันนับ) และวันที่ประมวลผลถึง
CREATE TABLE IF NOT EXISTS trace_drug_state (
  dept_id      VARCHAR(40) NOT NULL,
  drug_id      VARCHAR(40) NOT NULL,
  initial_ymd  DATE NOT NULL,
  processed_to DATE NOT NULL,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dept_id, drug_id)
) ENGINE=InnoDB;

-- lot ในห้องยา (initial + รับเข้า) พร้อมยอดคงเหลือตามการจ่ายที่ประมวลผลแล้ว
CREATE TABLE IF NOT EXISTS trace_lot (
  lot_doc_id   VARCHAR(200) NOT NULL PRIMARY KEY,   -- = Firestore pharmacy_lots/{id}
  dept_id      VARCHAR(40) NOT NULL,
  drug_id      VARCHAR(40) NOT NULL,
  lot_no       VARCHAR(60) NOT NULL DEFAULT '',
  expiry       VARCHAR(10) NOT NULL DEFAULT '',     -- YYYYMMDD
  trade_name   VARCHAR(200) NOT NULL DEFAULT '',
  received_ymd DATE NOT NULL,
  qty_initial  DECIMAL(14,3) NOT NULL DEFAULT 0,
  remain       DECIMAL(14,3) NOT NULL DEFAULT 0,
  KEY idx_drug (dept_id, drug_id)
) ENGINE=InnoDB;

-- การจ่ายรายผู้ป่วย × lot (FEFO สมมติ) · kind D=จ่าย, R=คืน, X=ไม่มี lot ให้ตัด (ยาขาด/ยังไม่บันทึกรับ)
CREATE TABLE IF NOT EXISTS trace_dispense (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dept_id     VARCHAR(40) NOT NULL,
  drug_id     VARCHAR(40) NOT NULL,
  icode       VARCHAR(20) NOT NULL DEFAULT '',
  hn          VARCHAR(20) NOT NULL DEFAULT '',
  vn          VARCHAR(30) NOT NULL DEFAULT '',
  an          VARCHAR(30) NOT NULL DEFAULT '',
  rxdate      DATE NOT NULL,
  qty_hosxp   DECIMAL(14,3) NOT NULL DEFAULT 0,
  qty         DECIMAL(14,3) NOT NULL DEFAULT 0,      -- หน่วย INVS (× ตัวคูณ)
  lot_doc_id  VARCHAR(200) NOT NULL DEFAULT '',
  lot_no      VARCHAR(60) NOT NULL DEFAULT '',
  expiry      VARCHAR(10) NOT NULL DEFAULT '',
  trade_name  VARCHAR(200) NOT NULL DEFAULT '',
  kind        CHAR(1) NOT NULL DEFAULT 'D',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lot (lot_no),
  KEY idx_hn (hn, rxdate),
  KEY idx_drug_date (drug_id, rxdate)
) ENGINE=InnoDB;
