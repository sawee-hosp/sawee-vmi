<?php
/**
 * Sawee Rxfill INVS Department Stock Lot Sync v1.1
 *
 * v1.1 (ประหยัดโควตา Firestore):
 *   - จำสถานะ Lot ที่เขียนล่าสุดไว้ในเครื่อง (cache/stock_lots_state.json) → ไม่ต้องอ่าน Firestore ทุกรอบ
 *   - เขียนเฉพาะ Lot ที่เปลี่ยน (จำนวน/EXP/ตำแหน่ง/ราคา ฯลฯ) และ Lot ที่หายไปจาก INVS
 *   - ใส่ --full เพื่อบังคับเทียบกับ Firestore ใหม่ทั้งหมด (เช่น เมื่อสงสัยว่าข้อมูลไม่ตรง)
 *
 * Direction: INVS -> Firestore only.
 * INVS access is strictly SELECT-only. This script NEVER writes to INV_MD_C or any INVS table.
 * Firestore collections owned by this sync:
 *   - invs_stock_lots/{hospital_id}__{INV_MD_C.RECORD_NUMBER}
 *   - invs_stock_meta/{hospital_id}
 */
declare(strict_types=1);
date_default_timezone_set('Asia/Bangkok');

const LOT_SYNC_VERSION = '1.1.0';
const LOT_HASH_KEYS = ['hospital_id','hospital_name','invs_dept_id','invs_record_number','drug_id','trade_code','lot_no','expiry',
    'qty_on_hand','pack_ratio','location','pack_cost','unit_cost','lot_cost','lot_value','pack_price','vendor_code','manufac_code','pack_code','mod_sys','active'];
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

$configFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'config.php';
if (!file_exists($configFile)) { fwrite(STDERR, "ERROR: private/config.php not found\n"); exit(1); }
$config = require $configFile;
if (!is_array($config)) { fwrite(STDERR, "ERROR: config.php invalid\n"); exit(1); }

$logFile = (string)($config['lot_sync']['log_file'] ?? dirname(__DIR__) . DIRECTORY_SEPARATOR . 'logs' . DIRECTORY_SEPARATOR . 'sync_stock_lots.log');
@mkdir(dirname($logFile), 0777, true);

function logLot(string $level, string $message, array $context=[]): void {
    global $logFile;
    $suffix = $context ? ' | ' . json_encode($context, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES) : '';
    $line = date('Y-m-d H:i:s') . " | {$level} | {$message}{$suffix}";
    echo $line . PHP_EOL;
    @file_put_contents($logFile, $line . PHP_EOL, FILE_APPEND|LOCK_EX);
}
function failLot(string $message, int $code=1): never { logLot('ERROR', $message); exit($code); }
function cleanLot(mixed $v): string { return trim((string)($v ?? '')); }
function numLot(mixed $v, float $default=0): float {
    if ($v === null || $v === '') return $default;
    $s = str_replace(',', '', trim((string)$v));
    return is_numeric($s) ? (float)$s : $default;
}
function b64urlLot(string $data): string { return rtrim(strtr(base64_encode($data), '+/', '-_'), '='); }
function safeDocPart(string $v): string {
    $v = trim($v);
    $v = str_replace('/', '_', $v);
    return $v !== '' ? $v : 'UNKNOWN';
}

foreach (['mysqli','curl','openssl','json'] as $ext) {
    if (!extension_loaded($ext)) failLot("PHP extension {$ext} missing");
}
foreach ([['mysql','host'],['mysql','user'],['mysql','password'],['mysql','database'],['firebase','project_id'],['firebase','service_account_json']] as [$g,$k]) {
    $v = cleanLot($config[$g][$k] ?? '');
    if ($v === '' || str_contains($v, 'PUT_')) failLot("config missing {$g}.{$k}");
}
$serviceAccountPath = (string)$config['firebase']['service_account_json'];
if (!file_exists($serviceAccountPath)) failLot('serviceAccountKey.json not found');

function firebaseAccessTokenLot(string $path): string {
    $key = json_decode((string)file_get_contents($path), true);
    if (!is_array($key) || empty($key['client_email']) || empty($key['private_key'])) throw new RuntimeException('invalid service account');
    $now = time();
    $unsigned = b64urlLot(json_encode(['alg'=>'RS256','typ'=>'JWT'])) . '.' . b64urlLot(json_encode([
        'iss'=>$key['client_email'], 'scope'=>FIRESTORE_SCOPE, 'aud'=>GOOGLE_TOKEN_URL, 'iat'=>$now, 'exp'=>$now+3600
    ]));
    $private = openssl_pkey_get_private($key['private_key']);
    $sig = '';
    if (!$private || !openssl_sign($unsigned, $sig, $private, OPENSSL_ALGO_SHA256)) throw new RuntimeException('JWT sign failed');
    $ch = curl_init(GOOGLE_TOKEN_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST=>true,
        CURLOPT_POSTFIELDS=>http_build_query(['grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>$unsigned.'.'.b64urlLot($sig)]),
        CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_TIMEOUT=>30
    ]);
    $raw = curl_exec($ch);
    if ($raw === false) { $e=curl_error($ch); curl_close($ch); throw new RuntimeException($e); }
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $json = json_decode((string)$raw, true);
    if ($http < 200 || $http >= 300 || empty($json['access_token'])) throw new RuntimeException("OAuth HTTP {$http}: {$raw}");
    return (string)$json['access_token'];
}

function httpLot(string $method, string $url, string $token, ?array $payload=null): array {
    $headers = ['Authorization: Bearer '.$token, 'Accept: application/json'];
    if ($payload !== null) $headers[] = 'Content-Type: application/json';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST=>$method, CURLOPT_HTTPHEADER=>$headers, CURLOPT_RETURNTRANSFER=>true,
        CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_TIMEOUT=>120
    ]);
    if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
    $raw = curl_exec($ch);
    if ($raw === false) { $e=curl_error($ch); curl_close($ch); throw new RuntimeException($e); }
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $body = json_decode((string)$raw, true);
    return ['status'=>$status, 'body'=>is_array($body)?$body:[], 'raw'=>(string)$raw];
}
function decodeLot(?array $v): mixed {
    if (!$v) return null;
    if (array_key_exists('nullValue',$v)) return null;
    if (array_key_exists('stringValue',$v)) return (string)$v['stringValue'];
    if (array_key_exists('integerValue',$v)) return (int)$v['integerValue'];
    if (array_key_exists('doubleValue',$v)) return (float)$v['doubleValue'];
    if (array_key_exists('booleanValue',$v)) return (bool)$v['booleanValue'];
    if (array_key_exists('timestampValue',$v)) return (string)$v['timestampValue'];
    if (array_key_exists('arrayValue',$v)) return array_map('decodeLot', $v['arrayValue']['values'] ?? []);
    if (array_key_exists('mapValue',$v)) { $o=[]; foreach (($v['mapValue']['fields'] ?? []) as $k=>$x) $o[$k]=decodeLot($x); return $o; }
    return null;
}
function encodeLot(mixed $v): array {
    if ($v === null) return ['nullValue'=>null];
    if (is_bool($v)) return ['booleanValue'=>$v];
    if (is_int($v)) return ['integerValue'=>(string)$v];
    if (is_float($v)) {
        if (abs($v-round($v)) < 1e-9) return ['integerValue'=>(string)(int)round($v)];
        return ['doubleValue'=>$v];
    }
    if (is_array($v)) {
        if (array_is_list($v)) return ['arrayValue'=>['values'=>array_map('encodeLot',$v)]];
        $fields=[]; foreach ($v as $k=>$x) $fields[(string)$k]=encodeLot($x);
        return ['mapValue'=>['fields'=>$fields]];
    }
    return ['stringValue'=>(string)$v];
}
function encodedFieldsLot(array $fields): array { $out=[]; foreach ($fields as $k=>$v) $out[(string)$k]=encodeLot($v); return $out; }

function listCollectionLot(string $project, string $collection, string $token, int $max=10000): array {
    $out=[]; $page=null;
    do {
        $url='https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents/'.rawurlencode($collection).'?pageSize=1000';
        if ($page) $url.='&pageToken='.rawurlencode($page);
        $r=httpLot('GET',$url,$token);
        if ($r['status']<200 || $r['status']>=300) throw new RuntimeException("Firestore list {$collection} HTTP {$r['status']}: {$r['raw']}");
        foreach (($r['body']['documents'] ?? []) as $doc) {
            $fields=[]; foreach (($doc['fields'] ?? []) as $k=>$v) $fields[$k]=decodeLot($v);
            $fields['_doc_id']=rawurldecode(basename((string)$doc['name']));
            $out[]=$fields;
            if (count($out)>=$max) return $out;
        }
        $page=$r['body']['nextPageToken'] ?? null;
    } while ($page);
    return $out;
}

function queryHospitalLotsLot(string $project, string $hospitalId, string $token): array {
    $url='https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents:runQuery';
    $payload=['structuredQuery'=>[
        'from'=>[['collectionId'=>'invs_stock_lots']],
        'where'=>['fieldFilter'=>[
            'field'=>['fieldPath'=>'hospital_id'], 'op'=>'EQUAL', 'value'=>['stringValue'=>$hospitalId]
        ]],
        'limit'=>5000
    ]];
    $r=httpLot('POST',$url,$token,$payload);
    if ($r['status']<200 || $r['status']>=300) throw new RuntimeException("Firestore query invs_stock_lots HTTP {$r['status']}: {$r['raw']}");
    $out=[];
    foreach ($r['body'] as $entry) {
        $doc=$entry['document'] ?? null;
        if (!$doc) continue;
        $fields=[]; foreach (($doc['fields'] ?? []) as $k=>$v) $fields[$k]=decodeLot($v);
        $fields['_doc_id']=rawurldecode(basename((string)$doc['name']));
        $out[]=$fields;
    }
    return $out;
}

// ค่าแฮชของเนื้อหา Lot (ไม่รวมเวลา sync / days_to_expiry ที่เปลี่ยนทุกวัน) ใช้ตัดสินว่าต้องเขียนหรือไม่
function lotHash(array $f): string {
    $o=[];
    foreach (LOT_HASH_KEYS as $k) {
        $v=$f[$k] ?? null;
        if (is_bool($v)) $o[$k]=$v?'1':'0';
        elseif (is_int($v) || is_float($v) || (is_string($v) && is_numeric($v) && in_array($k,['qty_on_hand','pack_ratio','pack_cost','unit_cost','lot_cost','lot_value','pack_price','invs_record_number','pack_code'],true))) $o[$k]=rtrim(rtrim(number_format((float)$v,6,'.',''),'0'),'.');
        elseif ($v===null) $o[$k]='';
        else $o[$k]=trim((string)$v);
    }
    return substr(sha1(json_encode($o, JSON_UNESCAPED_UNICODE)),0,16);
}
function lotStatePath(): string { return dirname(__DIR__).DIRECTORY_SEPARATOR.'cache'.DIRECTORY_SEPARATOR.'stock_lots_state.json'; }
function loadLotState(): array {
    $p=lotStatePath();
    if (!is_file($p)) return ['v'=>1,'hospitals'=>[]];
    $j=json_decode((string)file_get_contents($p), true);
    return (is_array($j) && ($j['v']??0)===1 && is_array($j['hospitals']??null)) ? $j : ['v'=>1,'hospitals'=>[]];
}
function saveLotState(array $state): void {
    $p=lotStatePath(); @mkdir(dirname($p),0777,true);
    $tmp=$p.'.tmp';
    if (@file_put_contents($tmp, json_encode($state, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES))!==false) @rename($tmp,$p);
}

function commitDocsLot(string $project, string $token, array $docs): void {
    foreach (array_chunk($docs, 300) as $chunk) {
        $writes=[];
        foreach ($chunk as $d) {
            $name='projects/'.$project.'/databases/(default)/documents/'.$d['collection'].'/'.$d['id'];
            $w=['update'=>['name'=>$name,'fields'=>encodedFieldsLot($d['fields'])]];
            if (!empty($d['mask'])) $w['updateMask']=['fieldPaths'=>array_values($d['mask'])];
            $writes[]=$w;
        }
        if (!$writes) continue;
        $url='https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents:commit';
        $r=httpLot('POST',$url,$token,['writes'=>$writes]);
        if ($r['status']<200 || $r['status']>=300) throw new RuntimeException("Firestore commit HTTP {$r['status']}: {$r['raw']}");
    }
}

function dbLot(array $cfg): mysqli {
    mysqli_report(MYSQLI_REPORT_ERROR|MYSQLI_REPORT_STRICT);
    $db=mysqli_init();
    $db->options(MYSQLI_OPT_CONNECT_TIMEOUT,(int)($cfg['connect_timeout']??15));
    $db->real_connect((string)$cfg['host'],(string)$cfg['user'],(string)$cfg['password'],(string)$cfg['database'],(int)($cfg['port']??3306));
    $db->set_charset((string)($cfg['charset']??'utf8'));
    return $db;
}

function readDeptLots(mysqli $db, string $deptId, int $maxRows): array {
    $sql="SELECT RECORD_NUMBER, WORKING_CODE, PACK_RATIO, QTY_ON_HAND, LOCATION, LOT_COST, VENDOR_CODE, MANUFAC_CODE, LOT_VALUE, TRADE_CODE, DEPT_ID, LOT_NO, USER_ID, EXPIRED_DATE, PACK_COST, PACK_CODE, MOD_SYS, PACK_PRICE
          FROM inv_md_c
          WHERE DEPT_ID=? AND COALESCE(QTY_ON_HAND,0)>0
          ORDER BY WORKING_CODE ASC,
                   CASE WHEN EXPIRED_DATE IS NULL OR TRIM(EXPIRED_DATE)='' THEN '99999999' ELSE EXPIRED_DATE END ASC,
                   RECORD_NUMBER ASC
          LIMIT ?";
    $st=$db->prepare($sql); $st->bind_param('si',$deptId,$maxRows); $st->execute();
    $rows=$st->get_result()->fetch_all(MYSQLI_ASSOC); $st->close(); return $rows;
}

try {
    $token=firebaseAccessTokenLot($serviceAccountPath);
    $project=(string)$config['firebase']['project_id'];
    $maxHospitals=(int)($config['lot_sync']['max_hospitals_per_run'] ?? 200);
    $maxLots=(int)($config['lot_sync']['max_lots_per_hospital'] ?? 5000);
    $hospitals=listCollectionLot($project,'master_hospitals',$token,$maxHospitals);

    $mapped=[]; $deptOwners=[];
    foreach ($hospitals as $h) {
        $hospitalId=cleanLot($h['hospital_id'] ?? $h['_doc_id'] ?? '');
        $deptId=cleanLot($h['invs_dept_id'] ?? '');
        if ($hospitalId==='' || $deptId==='') continue;
        if (isset($deptOwners[$deptId]) && $deptOwners[$deptId]!==$hospitalId) {
            throw new RuntimeException("INVS DEPT_ID {$deptId} ถูก map ซ้ำระหว่าง {$deptOwners[$deptId]} และ {$hospitalId} — หยุดเพื่อป้องกันข้อมูลข้ามหน่วยงาน");
        }
        $deptOwners[$deptId]=$hospitalId;
        $mapped[]=['hospital_id'=>$hospitalId,'hospital_name'=>cleanLot($h['hospital_name']??''),'dept_id'=>$deptId];
    }
    logLot('INFO','Mapped hospitals: '.count($mapped));

    $db=dbLot($config['mysql']);
    $totalActive=0; $totalStale=0; $hospitalErrors=0; $totalWrites=0; $totalReads=0;
    $forceFull=in_array('--full', $argv ?? [], true) || !empty($config['lot_sync']['force_full']);
    $state=$forceFull ? ['v'=>1,'hospitals'=>[]] : loadLotState();

    foreach ($mapped as $h) {
        $hospitalId=$h['hospital_id']; $deptId=$h['dept_id'];
        $runId=date('YmdHis').'-'.substr(sha1($hospitalId.'|'.microtime(true)),0,8);
        $syncAt=gmdate('Y-m-d\TH:i:s\Z');
        try {
            $rows=readDeptLots($db,$deptId,$maxLots);
            $hitLimit=count($rows)>=$maxLots;
            if ($hitLimit) logLot('WARN',"{$hospitalId}: hit max_lots_per_hospital={$maxLots}; stale marking disabled for this run");
            // สถานะที่เขียนล่าสุด: ใช้ไฟล์ในเครื่องก่อน ถ้าไม่มี (รอบแรก/--full) จึงอ่านจาก Firestore ครั้งเดียว
            $known=$state['hospitals'][$hospitalId] ?? null; // docId => hash | 'STALE'
            $existingByRecord=[];
            if (!is_array($known)) {
                $existing=queryHospitalLotsLot($project,$hospitalId,$token);
                $totalReads+=max(1,count($existing));
                $known=[];
                foreach ($existing as $e) {
                    $existingByRecord[(string)($e['invs_record_number'] ?? '')]=$e;
                    $known[(string)$e['_doc_id']]=(($e['active']??false)!==true && numLot($e['qty_on_hand']??0)<=0) ? 'STALE' : lotHash($e);
                }
            }
            $nextKnown=$known;

            $writes=[]; $seen=[]; $seenDocs=[]; $drugSet=[]; $totalQty=0.0; $expiry90=0; $expiry180=0;
            $today=new DateTimeImmutable('today', new DateTimeZone('Asia/Bangkok'));
            foreach ($rows as $r) {
                $record=(int)$r['RECORD_NUMBER']; $recordKey=(string)$record; $seen[$recordKey]=true;
                $drugId=cleanLot($r['WORKING_CODE']??''); if ($drugId==='') continue;
                $drugSet[$drugId]=true;
                $qty=numLot($r['QTY_ON_HAND']??0); $pack=max(1.0,numLot($r['PACK_RATIO']??1,1)); $packCost=numLot($r['PACK_COST']??0);
                $unitCost=$pack>0 ? round($packCost/$pack,6) : 0.0;
                $expiry=cleanLot($r['EXPIRED_DATE']??''); $days=null;
                if (preg_match('/^\d{8}$/',$expiry)) {
                    $dt=DateTimeImmutable::createFromFormat('!Ymd',$expiry,new DateTimeZone('Asia/Bangkok'));
                    if ($dt) { $days=(int)$today->diff($dt)->format('%r%a'); if($days<=90)$expiry90++; if($days<=180)$expiry180++; }
                }
                $totalQty+=$qty;
                $docId=safeDocPart($hospitalId).'__'.$record;
                $fields=[
                    'hospital_id'=>$hospitalId, 'hospital_name'=>$h['hospital_name'], 'invs_dept_id'=>$deptId,
                    'invs_record_number'=>$record, 'drug_id'=>$drugId, 'trade_code'=>cleanLot($r['TRADE_CODE']??''),
                    'lot_no'=>cleanLot($r['LOT_NO']??''), 'expiry'=>$expiry, 'days_to_expiry'=>$days,
                    'qty_on_hand'=>$qty, 'pack_ratio'=>$pack, 'location'=>cleanLot($r['LOCATION']??''),
                    'pack_cost'=>$packCost, 'unit_cost'=>$unitCost, 'lot_cost'=>numLot($r['LOT_COST']??0), 'lot_value'=>numLot($r['LOT_VALUE']??0),
                    'pack_price'=>numLot($r['PACK_PRICE']??0), 'vendor_code'=>cleanLot($r['VENDOR_CODE']??''), 'manufac_code'=>cleanLot($r['MANUFAC_CODE']??''),
                    'pack_code'=>($r['PACK_CODE']!==null && $r['PACK_CODE']!=='')?(int)$r['PACK_CODE']:null,
                    'mod_sys'=>cleanLot($r['MOD_SYS']??''), 'active'=>true, 'read_only'=>true, 'source'=>'INV_MD_C',
                    'sync_run_id'=>$runId, 'last_seen_at'=>$syncAt, 'synced_at'=>$syncAt, 'lot_sync_version'=>LOT_SYNC_VERSION
                ];
                $h=lotHash($fields);
                $seenDocs[$docId]=true;
                if (($known[$docId] ?? '')===$h) continue; // ไม่เปลี่ยน → ไม่เขียน
                $writes[]=['collection'=>'invs_stock_lots','id'=>$docId,'fields'=>$fields];
                $nextKnown[$docId]=$h;
            }

            // Lot ที่เคยมีแต่หายจาก INVS → ทำเป็นไม่ใช้งาน (แก้เฉพาะฟิลด์สถานะ ไม่ต้องอ่านเอกสารเดิม)
            $staleCount=0;
            if (!$hitLimit) foreach ($known as $docId=>$h) {
                if (isset($seenDocs[$docId]) || $h==='STALE') continue;
                $writes[]=['collection'=>'invs_stock_lots','id'=>$docId,'mask'=>['hospital_id','invs_dept_id','active','qty_on_hand','read_only','source','stale_at','synced_at','sync_run_id','lot_sync_version'],'fields'=>[
                    'hospital_id'=>$hospitalId,'invs_dept_id'=>$deptId,'active'=>false,'qty_on_hand'=>0.0,'read_only'=>true,'source'=>'INV_MD_C',
                    'stale_at'=>$syncAt,'synced_at'=>$syncAt,'sync_run_id'=>$runId,'lot_sync_version'=>LOT_SYNC_VERSION
                ]];
                $nextKnown[$docId]='STALE'; $staleCount++;
            }

            $writes[]=['collection'=>'invs_stock_meta','id'=>safeDocPart($hospitalId),'fields'=>[
                'hospital_id'=>$hospitalId,'hospital_name'=>$h['hospital_name'],'invs_dept_id'=>$deptId,
                'status'=>$hitLimit?'TRUNCATED':'OK','last_sync_at'=>$syncAt,'sync_run_id'=>$runId,'lot_count'=>count($rows),'drug_count'=>count($drugSet),
                'total_qty_on_hand'=>$totalQty,'expiry_le_90_count'=>$expiry90,'expiry_le_180_count'=>$expiry180,
                'source'=>'INV_MD_C','read_only'=>true,'lot_sync_version'=>LOT_SYNC_VERSION,'changed_lots'=>count($writes)
            ]];
            commitDocsLot($project,$token,$writes);
            $state['hospitals'][$hospitalId]=$nextKnown; saveLotState($state);
            $totalActive+=count($rows); $totalStale+=$staleCount; $totalWrites+=count($writes);
            logLot('INFO',"{$hospitalId} / DEPT {$deptId}: active=".count($rows)." written=".(count($writes)-1)." stale={$staleCount} drugs=".count($drugSet));
        } catch (Throwable $e) {
            $hospitalErrors++;
            // Keep the previous good Firebase snapshot/meta untouched on a failed run.
            // The WebApp will show it as stale instead of replacing good data with an error document.
            logLot('ERROR',"{$hospitalId} / DEPT {$deptId}: {$e->getMessage()}");
        }
    }
    $db->close();
    logLot('INFO',"DONE active={$totalActive} stale={$totalStale} firestore_writes={$totalWrites} firestore_reads~{$totalReads} hospital_errors={$hospitalErrors}");
    exit($hospitalErrors?2:0);
} catch (Throwable $e) {
    failLot($e->getMessage());
}
