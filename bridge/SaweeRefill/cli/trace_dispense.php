<?php
/**
 * Sawee Rxfill Traceability v1.0 (v6.14) — จับคู่การจ่ายยารายผู้ป่วยจาก HOSxP กับ lot ในห้องยา (FEFO สมมติ)
 *
 * อ่าน:   Firestore master_depts (ห้องยา), pharmacy_lot_meta (วันนับ initial), pharmacy_lots (lot initial + รับเข้า), master_drugs (hosxp_code/ตัวคูณ)
 *         HOSxP opitemrece (hn, vn, an, rxdate, icode, qty) — SELECT อย่างเดียว
 * เขียน:  ฐาน sawee_trace (แยกจาก INVS/HOSxP) เท่านั้น — ไม่แตะ INVS / HOSxP / Firestore
 * ไม่มีชื่อผู้ป่วย มีแค่ HN/VN/AN (ข้อมูลสุขภาพส่วนบุคคล PDPA — เก็บในเครื่อง Bridge ใน LAN)
 *
 * ทำงาน: ต่อยา → ถ้าวันนับ initial เปลี่ยน = รีเซ็ต lot ของยานั้น → ประมวลผลวันที่ processed_to+1 … เมื่อวาน
 *        จ่าย (qty>0) ตัด lot ที่รับแล้ว ณ วันนั้น ตาม EXP ใกล้สุดก่อน · คืนยา (qty<0) คืนเข้า lot ที่ผู้ป่วยรายนั้นได้ล่าสุด
 *        ไม่มี lot พอ = บันทึก kind X (ยาขาด/ยังไม่บันทึกรับ)
 * ใช้: php cli/trace_dispense.php [--fixture=path.json] [--until=YYYY-MM-DD]
 */
declare(strict_types=1);
date_default_timezone_set('Asia/Bangkok');
const TRACE_VERSION = '1.0.0';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

$configFile = getenv('SAWEE_TRACE_CONFIG') ?: (dirname(__DIR__) . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'config.php');
if (!file_exists($configFile)) { fwrite(STDERR, "ERROR: private/config.php not found\n"); exit(1); }
$config = require $configFile;
$logFile = (string)($config['trace']['log_file'] ?? dirname(__DIR__) . DIRECTORY_SEPARATOR . 'logs' . DIRECTORY_SEPARATOR . 'trace_dispense.log');
@mkdir(dirname($logFile), 0777, true);
$opts = getopt('', ['fixture::', 'until::']);
if (empty($config['trace']['enabled']) && empty($opts['fixture'])) { echo date('Y-m-d H:i:s')." | INFO | trace ปิดอยู่ (ตั้ง trace.enabled=true ใน config.php หลังสร้างฐาน sawee_trace)\n"; exit(0); }
function vlog(string $level, string $message, array $context = []): void {
    global $logFile;
    $line = date('Y-m-d H:i:s') . " | {$level} | {$message}";
    if ($context) $line .= ' | ' . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo $line . PHP_EOL;
    @file_put_contents($logFile, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
}
function vfail(string $message, int $code = 1): never { vlog('ERROR', $message); exit($code); }
function cleanV(mixed $v): string { return trim((string)($v ?? '')); }
function numV(mixed $v): float { return is_numeric($v) ? max(0.0, (float)$v) : 0.0; }
function safeV(string $v): string { $x = preg_replace('/[^A-Za-z0-9_-]+/', '_', trim($v)); return $x !== '' ? $x : 'X'; }
function b64V(string $v): string { return rtrim(strtr(base64_encode($v), '+/', '-_'), '='); }
function accessTokenV(string $path): string {
    $key = json_decode((string)file_get_contents($path), true);
    if (!is_array($key) || empty($key['client_email']) || empty($key['private_key'])) throw new RuntimeException('invalid service account');
    $now = time();
    $unsigned = b64V(json_encode(['alg'=>'RS256','typ'=>'JWT'])) . '.' . b64V(json_encode([
        'iss'=>$key['client_email'], 'scope'=>FIRESTORE_SCOPE, 'aud'=>GOOGLE_TOKEN_URL, 'iat'=>$now, 'exp'=>$now+3600
    ]));
    $private = openssl_pkey_get_private($key['private_key']);
    $sig = '';
    if (!$private || !openssl_sign($unsigned, $sig, $private, OPENSSL_ALGO_SHA256)) throw new RuntimeException('JWT sign failed');
    $ch = curl_init(GOOGLE_TOKEN_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST=>true,
        CURLOPT_POSTFIELDS=>http_build_query(['grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>$unsigned.'.'.b64V($sig)]),
        CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_TIMEOUT=>30
    ]);
    $raw = curl_exec($ch);
    if ($raw === false) { $e = curl_error($ch); curl_close($ch); throw new RuntimeException($e); }
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $json = json_decode((string)$raw, true);
    if ($http < 200 || $http >= 300 || empty($json['access_token'])) throw new RuntimeException("OAuth HTTP {$http}: {$raw}");
    return (string)$json['access_token'];
}
function httpV(string $method, string $url, string $token, ?array $payload = null): array {
    $headers = ['Authorization: Bearer '.$token, 'Accept: application/json'];
    if ($payload !== null) $headers[] = 'Content-Type: application/json';
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST=>$method, CURLOPT_HTTPHEADER=>$headers, CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_TIMEOUT=>120]);
    if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $raw = curl_exec($ch);
    if ($raw === false) { $e = curl_error($ch); curl_close($ch); throw new RuntimeException($e); }
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $body = json_decode((string)$raw, true);
    return ['status'=>$status, 'body'=>is_array($body)?$body:[], 'raw'=>(string)$raw];
}
function decodeV(?array $v): mixed {
    if (!$v) return null;
    if (array_key_exists('nullValue',$v)) return null;
    if (array_key_exists('stringValue',$v)) return (string)$v['stringValue'];
    if (array_key_exists('integerValue',$v)) return (int)$v['integerValue'];
    if (array_key_exists('doubleValue',$v)) return (float)$v['doubleValue'];
    if (array_key_exists('booleanValue',$v)) return (bool)$v['booleanValue'];
    if (array_key_exists('timestampValue',$v)) return (string)$v['timestampValue'];
    if (array_key_exists('arrayValue',$v)) return array_map('decodeV', $v['arrayValue']['values'] ?? []);
    if (array_key_exists('mapValue',$v)) { $out=[]; foreach (($v['mapValue']['fields'] ?? []) as $k=>$x) $out[$k]=decodeV($x); return $out; }
    return null;
}
function encodeV(mixed $v): array {
    if ($v === null) return ['nullValue'=>null];
    if (is_bool($v)) return ['booleanValue'=>$v];
    if (is_int($v)) return ['integerValue'=>(string)$v];
    if (is_float($v)) {
        if (abs($v - round($v)) < 1e-8) return ['integerValue'=>(string)(int)round($v)];
        return ['doubleValue'=>$v];
    }
    if (is_array($v)) {
        if (array_is_list($v)) return ['arrayValue'=>['values'=>array_map('encodeV',$v)]];
        $fields=[]; foreach ($v as $k=>$x) $fields[(string)$k]=encodeV($x);
        return ['mapValue'=>['fields'=>$fields]];
    }
    return ['stringValue'=>(string)$v];
}
function encodedFieldsV(array $fields): array { $out=[]; foreach ($fields as $k=>$v) $out[(string)$k]=encodeV($v); return $out; }
function docUrlV(string $project,string $collection,string $docId): string {
    return 'https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents/'.rawurlencode($collection).'/'.rawurlencode($docId);
}
function getDocV(string $project,string $collection,string $docId,string $token): ?array {
    $r=httpV('GET',docUrlV($project,$collection,$docId),$token);
    if ($r['status']===404) return null;
    if ($r['status']<200 || $r['status']>=300) throw new RuntimeException("GET {$collection}/{$docId} HTTP {$r['status']}: {$r['raw']}");
    $fields=[]; foreach (($r['body']['fields']??[]) as $k=>$v) $fields[$k]=decodeV($v);
    $fields['_doc_id']=$docId; return $fields;
}
function queryEqV(string $project,string $collection,string $field,string $value,string $token,int $limit=10000): array {
    $url='https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents:runQuery';
    $payload=['structuredQuery'=>['from'=>[['collectionId'=>$collection]],'where'=>['fieldFilter'=>['field'=>['fieldPath'=>$field],'op'=>'EQUAL','value'=>['stringValue'=>$value]]],'limit'=>$limit]];
    $r=httpV('POST',$url,$token,$payload);
    if ($r['status']<200 || $r['status']>=300) throw new RuntimeException("QUERY {$collection} HTTP {$r['status']}: {$r['raw']}");
    $out=[];
    foreach ($r['body'] as $entry) {
        $doc=$entry['document']??null; if(!$doc) continue;
        $fields=[]; foreach (($doc['fields']??[]) as $k=>$v) $fields[$k]=decodeV($v);
        $fields['_doc_id']=rawurldecode(basename((string)$doc['name'])); $out[]=$fields;
    }
    return $out;
}

function ymdT(string $s): string { $v=substr(trim($s),0,10); return preg_match('/^\d{4}-\d{2}-\d{2}$/',$v)?$v:''; }
function addDaysT(string $ymd,int $n): string { return date('Y-m-d', strtotime($ymd.' '.($n>=0?'+':'').$n.' day')); }
function expKeyT(string $e): string { $v=preg_replace('/\D/','',$e); if (strlen($v)>=8) { $y=(int)substr($v,0,4); if ($y>2400) $y-=543; return sprintf('%04d%s',$y,substr($v,4,4)); } return '99999999'; }
function connectMy(array $c, string $dbName): mysqli {
    mysqli_report(MYSQLI_REPORT_ERROR|MYSQLI_REPORT_STRICT);
    $db=mysqli_init(); $db->options(MYSQLI_OPT_CONNECT_TIMEOUT,(int)($c['connect_timeout']??10));
    $db->real_connect((string)($c['host']??'127.0.0.1'),(string)($c['user']??''),(string)($c['password']??''),$dbName,(int)($c['port']??3306));
    return $db;
}

// ----- อ่านข้อมูลต้นทาง (Firestore หรือ fixture สำหรับทดสอบ) -----
$untilYmd = ymdT((string)($opts['until'] ?? '')) ?: date('Y-m-d', strtotime('-1 day'));
if (!empty($opts['fixture'])) {
    $fx = json_decode((string)file_get_contents((string)$opts['fixture']), true);
    $depts = $fx['depts'] ?? []; $metas = $fx['meta'] ?? []; $lotsAll = $fx['lots'] ?? []; $drugs = $fx['drugs'] ?? [];
} else {
    foreach (['curl','openssl','json'] as $ext) if (!extension_loaded($ext)) vfail("PHP extension {$ext} missing");
    $project = cleanV($config['firebase']['project_id'] ?? ''); $sa = (string)($config['firebase']['service_account_json'] ?? '');
    if ($project==='' || !file_exists($sa)) vfail('config firebase.project_id / service_account_json ไม่ครบ');
    $token = accessTokenV($sa);
    $depts = array_values(array_filter(queryEqV($project,'master_depts','kind','pharmacy',$token), fn($d)=>($d['active'] ?? true)!==false));
    $metas = []; $lotsAll = []; $drugs = [];
    foreach ($depts as $d) {
        $did = cleanV($d['dept_id'] ?? $d['_doc_id']);
        foreach (queryEqV($project,'pharmacy_lot_meta','dept_id',$did,$token) as $m) $metas[] = $m;
        foreach (queryEqV($project,'pharmacy_lots','dept_id',$did,$token) as $l) $lotsAll[] = $l;
    }
    foreach (array_unique(array_map(fn($m)=>cleanV($m['drug_id'] ?? ''), $metas)) as $drugId) { if ($drugId==='') continue; $dd = getDocV($project,'master_drugs',$drugId,$token); if ($dd) $drugs[$drugId] = $dd; }
}

$traceCfg = array_merge($config['mysql'] ?? [], $config['trace'] ?? []);
$traceDbName = (string)($config['trace']['database'] ?? 'sawee_trace');
if ($traceDbName==='' || $traceDbName===(string)($config['mysql']['database'] ?? '')) vfail('trace.database ต้องเป็นฐานแยกจาก INVS');
$tdb = connectMy($traceCfg, $traceDbName); $tdb->set_charset('utf8mb4');
$hcfg = $config['hosxp'] ?? []; if (cleanV($hcfg['host'] ?? '')==='') vfail('config hosxp.* ไม่ครบ');
$hdb = connectMy($hcfg, (string)($hcfg['database'] ?? 'hos'));
$dateMode = strtolower(cleanV($hcfg['date_mode'] ?? 'ce')) === 'be' ? 'be' : 'ce';
$shift = fn(string $ymd, int $y) => sprintf('%04d%s', (int)substr($ymd,0,4)+$y, substr($ymd,4));

$summary = ['drugs'=>0,'rows'=>0,'no_lot'=>0,'returns'=>0,'resets'=>0];
foreach ($metas as $meta) {
    $deptId = cleanV($meta['dept_id'] ?? ''); $drugId = cleanV($meta['drug_id'] ?? ''); $initYmd = ymdT((string)($meta['initial_ymd'] ?? ''));
    if ($deptId==='' || $drugId==='' || $initYmd==='' || !($meta['initialized'] ?? true)) continue;
    $drug = $drugs[$drugId] ?? null; if (!$drug) { vlog('WARN','ไม่พบยาใน master_drugs',['drug'=>$drugId]); continue; }
    $icodes = array_values(array_filter(array_map('trim', preg_split('/[,;\s]+/', (string)($drug['hosxp_code'] ?? '')))));
    if (!$icodes) { vlog('WARN','ยายังไม่จับคู่รหัส HOSxP',['drug'=>$drugId]); continue; }
    $mult = (float)($drug['hosxp_multiplier'] ?? 1); if ($mult <= 0) $mult = 1.0;
    $lots = array_values(array_filter($lotsAll, fn($l)=>cleanV($l['dept_id'] ?? '')===$deptId && cleanV($l['drug_id'] ?? '')===$drugId && ($l['active'] ?? true)!==false));

    $tdb->begin_transaction();
    try {
        $st=$tdb->prepare('SELECT initial_ymd, processed_to FROM trace_drug_state WHERE dept_id=? AND drug_id=? FOR UPDATE'); $st->bind_param('ss',$deptId,$drugId); $st->execute(); $state=$st->get_result()->fetch_assoc(); $st->close();
        if (!$state || (string)$state['initial_ymd'] !== $initYmd) {
            // นับ initial ใหม่ → รีเซ็ต lot ของยานี้ (ประวัติการจ่ายเดิมเก็บไว้)
            $st=$tdb->prepare('DELETE FROM trace_lot WHERE dept_id=? AND drug_id=?'); $st->bind_param('ss',$deptId,$drugId); $st->execute(); $st->close();
            $st=$tdb->prepare('REPLACE INTO trace_drug_state (dept_id,drug_id,initial_ymd,processed_to) VALUES (?,?,?,?)'); $st->bind_param('ssss',$deptId,$drugId,$initYmd,$initYmd); $st->execute(); $st->close();
            $state=['initial_ymd'=>$initYmd,'processed_to'=>$initYmd]; $summary['resets']++;
        }
        // เพิ่ม lot ที่ยังไม่มี (initial + รับเข้าหลังวันนับ)
        $ins=$tdb->prepare('INSERT IGNORE INTO trace_lot (lot_doc_id,dept_id,drug_id,lot_no,expiry,trade_name,received_ymd,qty_initial,remain) VALUES (?,?,?,?,?,?,?,?,?)');
        foreach ($lots as $l) {
            $rcv = ymdT((string)($l['received_ymd'] ?? '')) ?: $initYmd;
            if (($l['source'] ?? '')==='RECEIPT' && $rcv <= $initYmd) continue;
            $q=(float)($l['qty'] ?? 0); $id=cleanV($l['_doc_id'] ?? ($l['id'] ?? '')); if ($id==='') continue;
            $ln=cleanV($l['lot_no'] ?? ''); $ex=cleanV($l['expiry'] ?? ''); $tn=cleanV($l['trade_name'] ?? '');
            $ins->bind_param('sssssssdd',$id,$deptId,$drugId,$ln,$ex,$tn,$rcv,$q,$q); $ins->execute();
        }
        $ins->close();
        $from = addDaysT((string)$state['processed_to'], 1);
        if ($from > $untilYmd) { $tdb->commit(); continue; }
        // lot ปัจจุบัน
        $res=$tdb->query("SELECT lot_doc_id, lot_no, expiry, trade_name, received_ymd, remain FROM trace_lot WHERE dept_id='".$tdb->real_escape_string($deptId)."' AND drug_id='".$tdb->real_escape_string($drugId)."'");
        $pool=[]; while ($r=$res->fetch_assoc()) { $r['remain']=(float)$r['remain']; $pool[$r['lot_doc_id']]=$r; } $res->free();
        uasort($pool, fn($a,$b)=>strcmp(expKeyT($a['expiry']),expKeyT($b['expiry'])) ?: strcmp($a['received_ymd'],$b['received_ymd']));
        // ยอดจ่ายจาก HOSxP
        $ph=implode(',',array_fill(0,count($icodes),'?'));
        $hf = $dateMode==='be' ? $shift($from,543) : $from; $ht = $dateMode==='be' ? $shift($untilYmd,543) : $untilYmd;
        $hs=$hdb->prepare("SELECT o.hn, o.vn, o.an, o.rxdate, o.icode, o.qty FROM opitemrece o WHERE o.icode IN ($ph) AND o.rxdate BETWEEN ? AND ? ORDER BY o.rxdate, o.vn, o.an");
        $args=array_merge($icodes,[$hf,$ht]); $hs->bind_param(str_repeat('s',count($args)),...$args); $hs->execute(); $hr=$hs->get_result();
        $put=$tdb->prepare('INSERT INTO trace_dispense (dept_id,drug_id,icode,hn,vn,an,rxdate,qty_hosxp,qty,lot_doc_id,lot_no,expiry,trade_name,kind) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $write=function(array $row,float $qh,float $q,?array $lot,string $kind) use ($put,$deptId,$drugId,&$summary) {
            $ic=(string)$row['icode']; $hn=(string)$row['hn']; $vn=(string)($row['vn']??''); $an=(string)($row['an']??''); $d=(string)$row['_d'];
            $lid=$lot['lot_doc_id']??''; $ln=$lot['lot_no']??''; $ex=$lot['expiry']??''; $tn=$lot['trade_name']??'';
            $put->bind_param('sssssssddsssss',$deptId,$drugId,$ic,$hn,$vn,$an,$d,$qh,$q,$lid,$ln,$ex,$tn,$kind); $put->execute(); $summary['rows']++;
        };
        $lastLotByHn=[];
        while ($row=$hr->fetch_assoc()) {
            $d=substr((string)$row['rxdate'],0,10); if ($dateMode==='be') $d=$shift($d,-543); $row['_d']=$d;
            $qh=(float)$row['qty']; $q=$qh*$mult; if (abs($q)<1e-9) continue;
            if ($q < 0) { // คืนยา → คืนเข้า lot ที่ผู้ป่วยรายนี้ได้ล่าสุด ไม่งั้น lot แรก
                $lid = $lastLotByHn[(string)$row['hn']] ?? (array_key_first($pool) ?? null);
                if ($lid && isset($pool[$lid])) { $pool[$lid]['remain'] += -$q; $write($row,$qh,$q,$pool[$lid],'R'); } else $write($row,$qh,$q,null,'R');
                $summary['returns']++; continue;
            }
            $left=$q;
            foreach ($pool as $lid=>&$lot) {
                if ($left<=1e-9) break; if ($lot['remain']<=1e-9 || (string)$lot['received_ymd'] > $d) continue;
                $use=min($lot['remain'],$left); $lot['remain']-=$use; $left-=$use;
                $write($row, $qh*($use/$q), $use, $lot, 'D'); $lastLotByHn[(string)$row['hn']]=$lid;
            }
            unset($lot);
            if ($left>1e-9) { $write($row, $qh*($left/$q), $left, null, 'X'); $summary['no_lot']++; }
        }
        $hs->close(); $put->close();
        $up=$tdb->prepare('UPDATE trace_lot SET remain=? WHERE lot_doc_id=?');
        foreach ($pool as $lid=>$lot) { $r=round($lot['remain'],3); $up->bind_param('ds',$r,$lid); $up->execute(); }
        $up->close();
        $st=$tdb->prepare('UPDATE trace_drug_state SET processed_to=? WHERE dept_id=? AND drug_id=?'); $st->bind_param('sss',$untilYmd,$deptId,$drugId); $st->execute(); $st->close();
        $tdb->commit(); $summary['drugs']++;
    } catch (Throwable $e) {
        $tdb->rollback(); vlog('ERROR','ประมวลผลยาไม่สำเร็จ',['drug'=>$drugId,'error'=>$e->getMessage()]);
    }
}
$hdb->close(); $tdb->close();
vlog('INFO','trace_dispense '.TRACE_VERSION.' เสร็จ',$summary + ['until'=>$untilYmd]);
exit(0);
