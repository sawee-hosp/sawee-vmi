<?php
/**
 * Sawee Rxfill — INVS Diff (ตรวจว่า INVS เขียนตารางไหนเมื่อทำรายการหนึ่ง) v1.0
 *
 * อ่านอย่างเดียว: ตั้ง session READ ONLY และใช้เฉพาะ SELECT / SHOW / CHECKSUM TABLE — ไม่แก้ข้อมูล INVS
 *
 * วิธีใช้ (ที่เครื่อง Bridge):
 *   php C:\SaweeRefill\cli\invs_diff.php snap before --drug=1010010 --dept=26
 *   ... ไปทำรายการใน INVS ด้วยมือ 1 รายการ (เช่น ตัดจ่ายคลังย่อย ยา 1010010 ของหน่วย 26) ...
 *   php C:\SaweeRefill\cli\invs_diff.php snap after  --drug=1010010 --dept=26
 *   php C:\SaweeRefill\cli\invs_diff.php diff before after
 * ผลลัพธ์: C:\SaweeRefill\cache\invs_diff\report_before_after.txt (+ .json) — ส่งไฟล์ .txt ให้ผู้พัฒนา
 *
 * ตัวเลือก: --drug=รหัสยา (WORKING_CODE) --dept=DEPT_ID คลังย่อย --skip-checksum-rows=3000000 (ตารางใหญ่กว่านี้ไม่ทำ checksum)
 */
declare(strict_types=1);
date_default_timezone_set('Asia/Bangkok');
ini_set('memory_limit', '1024M');
set_time_limit(0);

$root = dirname(__DIR__);
$configFile = $root . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'config.php';
if (!file_exists($configFile)) { fwrite(STDERR, "ERROR: private/config.php not found\n"); exit(1); }
$config = require $configFile;
$outDir = $root . DIRECTORY_SEPARATOR . 'cache' . DIRECTORY_SEPARATOR . 'invs_diff';
@mkdir($outDir, 0777, true);

$args = array_slice($argv, 1);
$opts = []; $pos = [];
foreach ($args as $a) { if (preg_match('/^--([a-z-]+)=(.*)$/', $a, $m)) $opts[$m[1]] = $m[2]; else $pos[] = $a; }
$cmd = $pos[0] ?? '';
function say(string $s): void { echo $s . PHP_EOL; }
function usage(): never { say("ใช้: php invs_diff.php snap <ชื่อ> [--drug=รหัสยา] [--dept=DEPT_ID] | diff <ชื่อก่อน> <ชื่อหลัง>"); exit(1); }
function safeName(string $s): string { $x = preg_replace('/[^A-Za-z0-9_-]+/', '_', $s); return $x !== '' ? $x : 'snap'; }
function toUtf8(mixed $v): mixed {
    if (!is_string($v)) return $v;
    if (function_exists('mb_check_encoding') && mb_check_encoding($v, 'UTF-8')) return $v;
    $c = @iconv('TIS-620', 'UTF-8//IGNORE', $v); return $c !== false ? $c : $v;
}
function q(string $id): string { return '`' . str_replace('`', '``', $id) . '`'; }

function connectReadOnly(array $config): mysqli {
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $c = $config['mysql'] ?? [];
    $db = mysqli_init();
    $db->options(MYSQLI_OPT_CONNECT_TIMEOUT, (int)($c['connect_timeout'] ?? 15));
    $db->real_connect((string)$c['host'], (string)$c['user'], (string)$c['password'], (string)$c['database'], (int)($c['port'] ?? 3306));
    $db->set_charset((string)($c['charset'] ?? 'utf8'));
    // กันพลาด: session นี้อ่านได้อย่างเดียว (MySQL 5.6.5+/MariaDB 10.0+)
    try { $db->query('SET SESSION TRANSACTION READ ONLY'); } catch (Throwable $e) { say('หมายเหตุ: ตั้ง READ ONLY ไม่ได้ (' . $e->getMessage() . ') — เครื่องมือนี้ใช้เฉพาะคำสั่งอ่านอยู่แล้ว'); }
    return $db;
}
function tableMeta(mysqli $db): array {
    $tables = [];
    $r = $db->query("SELECT TABLE_NAME, UPDATE_TIME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
    while ($x = $r->fetch_assoc()) $tables[$x['TABLE_NAME']] = ['update_time' => $x['UPDATE_TIME'], 'cols' => [], 'pk' => []];
    $r = $db->query("SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION");
    while ($x = $r->fetch_assoc()) if (isset($tables[$x['TABLE_NAME']])) $tables[$x['TABLE_NAME']]['cols'][$x['COLUMN_NAME']] = strtolower($x['DATA_TYPE']);
    $r = $db->query("SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_NAME='PRIMARY' ORDER BY TABLE_NAME, ORDINAL_POSITION");
    while ($x = $r->fetch_assoc()) if (isset($tables[$x['TABLE_NAME']])) $tables[$x['TABLE_NAME']]['pk'][] = $x['COLUMN_NAME'];
    return $tables;
}
function findCol(array $cols, string $name): ?string { foreach (array_keys($cols) as $c) if (strcasecmp($c, $name) === 0) return $c; return null; }
// คอลัมน์เลขลำดับสำหรับหาแถวใหม่: PK ตัวเลขคอลัมน์เดียว หรือ RECORD_NUMBER
function seqCol(array $t): ?string {
    $num = ['int', 'bigint', 'mediumint', 'smallint', 'tinyint', 'decimal', 'double', 'float'];
    if (count($t['pk']) === 1 && in_array($t['cols'][$t['pk'][0]] ?? '', $num, true)) return $t['pk'][0];
    $rn = findCol($t['cols'], 'RECORD_NUMBER');
    return ($rn && in_array($t['cols'][$rn], $num, true)) ? $rn : null;
}
function rowKey(array $t, array $row): string {
    $k = $t['pk'] ?: (seqCol($t) ? [seqCol($t)] : []);
    if (!$k) return md5(json_encode($row, JSON_UNESCAPED_UNICODE));
    return implode('|', array_map(fn($c) => (string)($row[$c] ?? ''), $k));
}
function fetchRows(mysqli $db, string $sql, array $params = []): array {
    $st = $db->prepare($sql);
    if ($params) { $types = str_repeat('s', count($params)); $st->bind_param($types, ...$params); }
    $st->execute(); $res = $st->get_result(); $out = [];
    while ($x = $res->fetch_assoc()) $out[] = array_map('toUtf8', $x);
    $st->close(); return $out;
}

if ($cmd === 'snap') {
    $name = safeName($pos[1] ?? ''); if (!isset($pos[1])) usage();
    $drug = trim((string)($opts['drug'] ?? '')); $dept = trim((string)($opts['dept'] ?? ''));
    $maxChecksumRows = (int)($opts['skip-checksum-rows'] ?? 3000000);
    $db = connectReadOnly($config);
    $meta = tableMeta($db);
    say('พบ ' . count($meta) . ' ตาราง — กำลังถ่ายภาพ (อาจใช้เวลาหลายนาทีถ้าฐานใหญ่)...');
    $snap = ['name' => $name, 'at' => date('Y-m-d H:i:s'), 'drug' => $drug, 'dept' => $dept, 'tables' => []];
    $i = 0;
    foreach ($meta as $tn => $t) {
        $i++;
        $e = ['rows' => null, 'max_seq' => null, 'seq_col' => seqCol($t), 'checksum' => null, 'update_time' => $t['update_time'], 'focus' => null, 'error' => ''];
        try {
            $e['rows'] = (int)$db->query('SELECT COUNT(*) c FROM ' . q($tn))->fetch_assoc()['c'];
            if ($e['seq_col']) $e['max_seq'] = $db->query('SELECT MAX(' . q($e['seq_col']) . ') m FROM ' . q($tn))->fetch_assoc()['m'];
            if ($e['rows'] <= $maxChecksumRows) $e['checksum'] = (string)($db->query('CHECKSUM TABLE ' . q($tn))->fetch_assoc()['Checksum'] ?? '');
            // แถวของยาที่ทดสอบ (ถ้าระบุ) — เก็บไว้เทียบค่าก่อน/หลัง
            $wc = findCol($t['cols'], 'WORKING_CODE');
            if ($drug !== '' && $wc) {
                $sql = 'SELECT * FROM ' . q($tn) . ' WHERE TRIM(' . q($wc) . ')=?'; $p = [$drug];
                $dc = findCol($t['cols'], 'DEPT_ID');
                if ($dept !== '' && $dc) { $sql .= ' AND (' . q($dc) . '=? OR ' . q($dc) . ' IS NULL)'; $p[] = $dept; }
                $sql .= $e['seq_col'] ? ' ORDER BY ' . q($e['seq_col']) . ' DESC' : '';
                $sql .= ' LIMIT 300';
                $rows = fetchRows($db, $sql, $p); $e['focus'] = [];
                foreach ($rows as $row) $e['focus'][rowKey($t, $row)] = $row;
            }
        } catch (Throwable $ex) { $e['error'] = $ex->getMessage(); }
        $snap['tables'][$tn] = $e;
        if ($i % 25 === 0) say("  ... {$i}/" . count($meta));
    }
    $file = $outDir . DIRECTORY_SEPARATOR . "snap_{$name}.json";
    file_put_contents($file, json_encode($snap, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    say("บันทึกแล้ว: {$file}");
    exit(0);
}

if ($cmd === 'diff') {
    $a = safeName($pos[1] ?? ''); $b = safeName($pos[2] ?? ''); if (!isset($pos[1], $pos[2])) usage();
    $A = json_decode((string)@file_get_contents($outDir . "/snap_{$a}.json"), true);
    $B = json_decode((string)@file_get_contents($outDir . "/snap_{$b}.json"), true);
    if (!$A || !$B) { say('ไม่พบไฟล์ snap — ตรวจชื่อที่ใช้ตอน snap'); exit(1); }
    $db = connectReadOnly($config);
    $meta = tableMeta($db);
    $lines = []; $json = ['before' => $A['at'], 'after' => $B['at'], 'drug' => $B['drug'], 'dept' => $B['dept'], 'changed' => []];
    $lines[] = "INVS Diff — ก่อน {$A['at']} / หลัง {$B['at']} · ยาที่ทดสอบ {$B['drug']} · หน่วย {$B['dept']}";
    $lines[] = str_repeat('=', 80);
    foreach ($B['tables'] as $tn => $e2) {
        $e1 = $A['tables'][$tn] ?? null;
        if (!$e1) { $lines[] = "[ตารางใหม่] {$tn}"; continue; }
        $changed = $e1['rows'] !== $e2['rows'] || (string)$e1['max_seq'] !== (string)$e2['max_seq'] || ($e1['checksum'] !== null && $e2['checksum'] !== null && $e1['checksum'] !== $e2['checksum']);
        $focusChanged = is_array($e1['focus']) && is_array($e2['focus']) && json_encode($e1['focus']) !== json_encode($e2['focus']);
        if (!$changed && !$focusChanged) continue;
        $info = ['table' => $tn, 'rows_before' => $e1['rows'], 'rows_after' => $e2['rows'], 'seq_col' => $e2['seq_col'], 'new_rows' => [], 'focus_added' => [], 'focus_removed' => [], 'focus_changed' => []];
        $lines[] = '';
        $lines[] = "### {$tn}  แถว {$e1['rows']} → {$e2['rows']}" . ($e2['seq_col'] ? "  · {$e2['seq_col']} {$e1['max_seq']} → {$e2['max_seq']}" : '') . (($e1['checksum'] ?? '') !== ($e2['checksum'] ?? '') ? '  · ข้อมูลเปลี่ยน (checksum)' : '');
        // แถวใหม่ (เลขลำดับมากกว่าเดิม)
        if ($e2['seq_col'] && $e2['max_seq'] !== null && (string)$e1['max_seq'] !== (string)$e2['max_seq'] && isset($meta[$tn])) {
            try {
                $from = $e1['max_seq'] !== null ? (string)$e1['max_seq'] : '-999999999'; // ตารางว่างก่อนทดสอบ
                $rows = fetchRows($db, 'SELECT * FROM ' . q($tn) . ' WHERE ' . q($e2['seq_col']) . '>? ORDER BY ' . q($e2['seq_col']) . ' LIMIT 30', [$from]);
                $info['new_rows'] = $rows;
                foreach ($rows as $r) $lines[] = '  + ใหม่: ' . json_encode($r, JSON_UNESCAPED_UNICODE);
            } catch (Throwable $ex) { $lines[] = '  (อ่านแถวใหม่ไม่ได้: ' . $ex->getMessage() . ')'; }
        }
        // แถวของยาที่ทดสอบ: เพิ่ม / หาย / ค่าที่เปลี่ยน
        if (is_array($e1['focus']) && is_array($e2['focus'])) {
            foreach ($e2['focus'] as $k => $r) {
                if (!isset($e1['focus'][$k])) { $info['focus_added'][] = $r; $lines[] = '  + แถวยาทดสอบ: ' . json_encode($r, JSON_UNESCAPED_UNICODE); continue; }
                $diff = [];
                foreach ($r as $c => $v) if ((string)($e1['focus'][$k][$c] ?? '') !== (string)$v) $diff[$c] = [$e1['focus'][$k][$c] ?? null, $v];
                if ($diff) { $info['focus_changed'][] = ['key' => $k, 'diff' => $diff]; $lines[] = "  ~ แก้ไข [{$k}]: " . implode(', ', array_map(fn($c, $d) => "{$c}: " . json_encode($d[0], JSON_UNESCAPED_UNICODE) . ' → ' . json_encode($d[1], JSON_UNESCAPED_UNICODE), array_keys($diff), $diff)); }
            }
            foreach ($e1['focus'] as $k => $r) if (!isset($e2['focus'][$k])) { $info['focus_removed'][] = $r; $lines[] = '  - แถวยาทดสอบหายไป: ' . json_encode($r, JSON_UNESCAPED_UNICODE); }
        }
        // โครงสร้างตาราง (ชื่อคอลัมน์ + ชนิด) ไว้ออกแบบการเขียน
        if (isset($meta[$tn])) $lines[] = '  คอลัมน์: ' . implode(', ', array_map(fn($c, $t) => "{$c}({$t})", array_keys($meta[$tn]['cols']), $meta[$tn]['cols'])) . ($meta[$tn]['pk'] ? ' · PK: ' . implode('+', $meta[$tn]['pk']) : '');
        $json['changed'][] = $info;
    }
    if (!$json['changed']) $lines[] = 'ไม่พบตารางที่เปลี่ยน — ตรวจว่าทำรายการใน INVS ระหว่าง snap ก่อน/หลัง และบันทึก/ยืนยันในโปรแกรมแล้ว';
    $base = $outDir . DIRECTORY_SEPARATOR . "report_{$a}_{$b}";
    file_put_contents($base . '.txt', implode(PHP_EOL, $lines) . PHP_EOL);
    file_put_contents($base . '.json', json_encode($json, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    say(implode(PHP_EOL, array_slice($lines, 0, 60)));
    say('');
    say("รายงานเต็ม: {$base}.txt");
    exit(0);
}
usage();
