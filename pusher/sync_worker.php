<?php
/**
 * sync_worker.php — ตัวทำงานค้างบนเครื่อง pusher (ใช้แทน sync_watch.php เดิม)
 *
 *  ทุก 20 วินาที  : ส่งสัญญาณออนไลน์ (sync_control/watcher ทุก 1 นาที) + รับคำขอปุ่ม ⟳ Sync ในหน้าเว็บ
 *  ทุก 2 นาที    : push.php --list-changed → มีผู้ป่วยส่งตัว/เปลี่ยนสถานะใน HOSxP → ส่งเฉพาะคนนั้น (--hn)
 *                  เปลี่ยนเกิน 3 คน → ส่งรอบ refill แบบ diff ครั้งเดียว (--refill-only)
 *  ทุก 5 นาที    : push.php --remission-only (ช่วง 07:00–19:00) · ncdr_app แจ้งผ่าน notify.php = ทำทันที
 *  02:00 ทุกคืน  : push.php รอบเต็ม (ตรวจทาน ลบเคสนอกขอบเขต เก็บตก)
 *
 *  ไม่มีรหัสผ่านในไฟล์นี้ — ใช้ service account ไฟล์เดียวกับ push.php และให้ push.php ต่อ HOSxP เอง
 *  รัน:  C:\xampp\php\php.exe sync_worker.php          (ปกติรันผ่าน RUN_WORKER.bat ที่ Task Scheduler เปิดตอนเปิดเครื่อง)
 *        C:\xampp\php\php.exe sync_worker.php --once   (ทำ 1 รอบแล้วจบ ไว้ทดสอบ)
 */

$W = [
    'php'          => PHP_BINARY,                                   // php.exe ตัวที่รันไฟล์นี้
    'push'         => __DIR__ . '/push.php',
    'service_account' => __DIR__ . '/secrets/serviceAccount.json',
    'project_id'   => 'sawee-refer',
    'flag_file'    => __DIR__ . '/remission.flag',                  // notify.php สร้างไฟล์นี้ = ให้ส่ง remission ทันที
    'log_file'     => __DIR__ . '/logs/worker_' . date('Ym') . '.log',
    'changed_every'   => 120,     // วินาที
    'remission_every' => 300,     // วินาที
    'remission_hours' => [7, 19], // ช่วงเวลาที่ส่ง remission อัตโนมัติ
    'nightly_hour'    => 2,       // รอบเต็มตอนตี 2
    'max_hn_each'     => 3,       // เปลี่ยนเกินนี้ → ส่งแบบรอบ diff ครั้งเดียว
];

date_default_timezone_set('Asia/Bangkok');
set_time_limit(0);
$ONCE = in_array('--once', $argv ?? []);
@mkdir(dirname($W['log_file']), 0777, true);

function wlog($s) {
    global $W;
    $line = '[' . date('Y-m-d H:i:s') . "] $s\n";
    echo $line;
    @file_put_contents($W['log_file'], $line, FILE_APPEND);
}
function now_text() { return date('Y-m-d H:i:s'); }

/* ---------- Firestore REST ---------- */
function b64u($d) { return rtrim(strtr(base64_encode($d), '+/', '-_'), '='); }
function fs_token() {
    global $W;
    static $tok = null, $exp = 0;
    if ($tok && time() < $exp - 300) return $tok;
    $sa = json_decode((string)@file_get_contents($W['service_account']), true);
    if (!$sa) { wlog("อ่าน service account ไม่ได้: {$W['service_account']}"); return null; }
    $now = time();
    $h = b64u(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $c = b64u(json_encode(['iss' => $sa['client_email'], 'scope' => 'https://www.googleapis.com/auth/datastore',
        'aud' => 'https://oauth2.googleapis.com/token', 'iat' => $now, 'exp' => $now + 3600]));
    $sig = ''; openssl_sign("$h.$c", $sig, $sa['private_key'], 'SHA256');
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30,
        CURLOPT_POSTFIELDS => http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                                                'assertion' => "$h.$c." . b64u($sig)])]);
    $j = json_decode((string)curl_exec($ch), true); curl_close($ch);
    if (empty($j['access_token'])) { wlog('ขอ token Firestore ไม่ได้ (เน็ต/เวลาเครื่อง?)'); return null; }
    $tok = $j['access_token']; $exp = $now + 3600;
    return $tok;
}
function fs_url($path, $q = '') {
    global $W;
    return "https://firestore.googleapis.com/v1/projects/{$W['project_id']}/databases/(default)/documents/$path" . ($q ? "?$q" : '');
}
function fs_req($method, $url, $body = null) {
    $t = fs_token(); if (!$t) return [0, null];
    $ch = curl_init($url);
    $o = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30,
          CURLOPT_HTTPHEADER => ["Authorization: Bearer $t", 'Content-Type: application/json']];
    if ($body !== null) $o[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
    curl_setopt_array($ch, $o);
    $raw = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$code, json_decode((string)$raw, true)];
}
function fv($v) {
    if ($v === null) return ['nullValue' => null];
    if (is_bool($v)) return ['booleanValue' => $v];
    if (is_int($v)) return ['integerValue' => (string)$v];
    return ['stringValue' => (string)$v];
}
function fs_patch($path, $data) {
    $f = []; foreach ($data as $k => $v) $f[$k] = fv($v);
    $mask = implode('&', array_map(fn($k) => 'updateMask.fieldPaths=' . urlencode($k), array_keys($data)));
    return fs_req('PATCH', fs_url($path, $mask), ['fields' => $f])[0] === 200;
}
function fs_get($path) {
    [$c, $j] = fs_req('GET', fs_url($path));
    if ($c !== 200) return null;
    $o = []; foreach ($j['fields'] ?? [] as $k => $v) $o[$k] = $v['stringValue'] ?? $v['booleanValue'] ?? (isset($v['integerValue']) ? (int)$v['integerValue'] : null);
    return $o;
}

/* ---------- สัญญาณออนไลน์ ---------- */
$LAST_BEAT = 0; $CUR_JOB = null;
function heartbeat($force = false) {
    global $LAST_BEAT, $CUR_JOB;
    if (!$force && time() - $LAST_BEAT < 60) return;
    $LAST_BEAT = time();
    fs_patch('sync_control/watcher', ['last_seen' => now_text(), 'host' => gethostname(),
        'agent' => 'sync_worker', 'job' => $CUR_JOB]);
}

/* ---------- รัน push.php (ระหว่างรอ ส่งสัญญาณออนไลน์ต่อ) ---------- */
function run_push($args, $label) {
    global $W, $CUR_JOB;
    $CUR_JOB = $label;
    $cmd = escapeshellarg($W['php']) . ' ' . escapeshellarg($W['push']) . ($args ? ' ' . $args : '');
    $t0 = time();
    $p = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, dirname($W['push']));
    if (!is_resource($p)) { wlog("$label: เริ่ม push.php ไม่ได้"); $CUR_JOB = null; return [1, '']; }
    stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
    $out = '';
    while (true) {
        $out .= stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
        $st = proc_get_status($p);
        if (!$st['running']) break;
        heartbeat();
        usleep(500000);
    }
    $out .= stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    $rc = proc_close($p);
    if ($rc === -1 && isset($st['exitcode'])) $rc = $st['exitcode'];
    $CUR_JOB = null;
    $tail = implode("\n", array_slice(explode("\n", trim($out)), -6));
    wlog("$label: exit $rc ใน " . (time() - $t0) . " วิ" . ($rc ? "\n$tail" : ''));
    return [$rc, $out];
}

/* ---------- งานแต่ละชนิด ---------- */
function do_request() {
    $r = fs_get('sync_control/request');
    if (!$r || ($r['status'] ?? '') !== 'pending') return;
    fs_patch('sync_control/request', ['status' => 'running', 'started_at_text' => now_text()]);
    [$rc, $out] = run_push(!empty($r['force']) ? '--force' : '', 'ปุ่ม Sync' . (!empty($r['force']) ? ' (force)' : ''));
    if ($rc === 3) { fs_patch('sync_control/request', ['status' => 'pending']); return; }   // มีรอบอื่นรันอยู่ ลองใหม่รอบหน้า
    $tail = implode("\n", array_slice(explode("\n", trim($out)), -15));
    fs_patch('sync_control/request', ['status' => $rc === 0 ? 'done' : 'error', 'finished_at_text' => now_text(),
        'exit_code' => $rc, 'log_tail' => mb_substr($tail, 0, 3000)]);
}
function do_changed() {
    global $W;
    [$rc, $out] = run_push('--list-changed', 'ตรวจความเปลี่ยนแปลง');
    if ($rc !== 0) return;
    if (!preg_match('/^CHANGED_HNS:(.*)$/m', $out, $m)) return;
    $hns = json_decode($m[1], true) ?: [];
    if (!$hns) return;
    wlog('มีผู้ป่วยเปลี่ยนใน HOSxP ' . count($hns) . ' คน: ' . implode(', ', array_slice($hns, 0, 10)));
    if (count($hns) > $W['max_hn_each']) { run_push('--refill-only', 'ส่ง refill (diff)'); return; }
    foreach ($hns as $hn) if (preg_match('/^\d{1,12}$/', $hn)) run_push('--hn ' . $hn, "ส่ง HN $hn");
}
function do_remission($why) { run_push('--remission-only', "ส่ง remission ($why)"); }

/* ---------- loop ---------- */
wlog('sync_worker เริ่มทำงาน · php=' . $W['php'] . ' · push=' . $W['push']);
heartbeat(true);
$next_changed = 0; $next_rem = 0; $nightly_done = '';
while (true) {
    try {
        heartbeat();
        do_request();
        $h = (int)date('G'); $today = date('Y-m-d');
        if ($h === $W['nightly_hour'] && $nightly_done !== $today) {
            run_push('', 'รอบเต็มกลางคืน'); $nightly_done = $today;
        }
        if (is_file($W['flag_file'])) { @unlink($W['flag_file']); do_remission('ncdr_app แจ้ง'); $next_rem = time() + $W['remission_every']; }
        if (time() >= $next_changed) { do_changed(); $next_changed = time() + $W['changed_every']; }
        if (time() >= $next_rem && $h >= $W['remission_hours'][0] && $h < $W['remission_hours'][1]) {
            do_remission('ตามรอบ'); $next_rem = time() + $W['remission_every'];
        }
    } catch (Throwable $e) { wlog('ERROR: ' . $e->getMessage()); }
    if ($ONCE) break;
    sleep(20);
}
