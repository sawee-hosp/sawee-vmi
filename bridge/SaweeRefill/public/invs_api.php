<?php
/**
 * Sawee Rxfill -> INVS Integrated API v2.3.0
 *   v2.7.0: คำค้นหาจาก inst_name, ตำแหน่งจากตาราง location (ตามคลัง), รองรับ HOSxP ที่เก็บวันที่เป็น พ.ศ. (date_mode)
 *   v2.8.0: ประหยัดโควตา Firestore — เติม updated_at เมื่อแก้ใบเบิก · CLI sync เขียน/อ่านเฉพาะที่เปลี่ยน (ดู cli/*.php)
 *   v2.6.1: sync_hosxp_codes รองรับคอลัมน์ INV_CODE, กรอง INVALID_DATE, ส่ง CONVER_FACT
 *   v2.6.0: sync_ncds (ดึงยอดยา NCDs ตามนัดจาก sawee-refer เข้า ncds_demand_inbox)
 *   v2.5.0: hosxp_diag (ตรวจการเชื่อม HOSxP), invs_discover + invs_extras (คำค้นหา/ตำแหน่งยา อ่านอย่างเดียว)
 *   v2.4.0: list_depts (อ่านตาราง dept_id ของ INVS แบบอ่านอย่างเดียว)
 *   v2.3.0: hosxp_usage (OPD+IPD usage from HOSxP), internal requisitions (หน่วยงาน/ห้องยา) via source=internal
 * PHP 8.x / XAMPP / mysqli + curl + openssl + json
 *
 * Scope (intentionally narrow):
 *   - Admin-only preflight and send
 *   - Writes ONLY sm_po + sm_po_c
 *   - Does NOT touch inv_md/inv_md_c stock quantities, card, confirmation, receipt or dispensing
 *   - MyISAM-safe compensating cleanup on failure
 *   - Idempotent marker in sm_po.REF_NO to prevent duplicate send for the same Firestore requisition
 */

declare(strict_types=1);
date_default_timezone_set('Asia/Bangkok');

const BRIDGE_VERSION = '2.8.0';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With');
header('Access-Control-Max-Age: 600');
header('Access-Control-Allow-Private-Network: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$baseDir = __DIR__;
// Runtime API may be copied into XAMPP htdocs. Keep secrets outside web root.
$configCandidates = [
    getenv('SAWEE_RXFILL_INVS_CONFIG') ?: '',
    'C:\\SaweeRefill\\private\\config.php',
    dirname(__DIR__) . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'config.php',
];
$configFile = '';
foreach ($configCandidates as $candidate) {
    if ($candidate !== '' && file_exists($candidate)) { $configFile = $candidate; break; }
}
if ($configFile === '') {
    respondError('CONFIG_MISSING', 'ไม่พบ C:\\SaweeRefill\\private\\config.php กรุณารัน INSTALL_ALL.bat และตั้งค่า config.php', 500);
}
$config = require $configFile;
if (!is_array($config)) respondError('CONFIG_INVALID', 'config.php ต้อง return array', 500);

function respond(array $payload, int $status=200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}
function respondError(string $code, string $message, int $status=400, array $extra=[]): never {
    respond(array_merge(['ok'=>false,'code'=>$code,'message'=>$message,'bridge_version'=>BRIDGE_VERSION], $extra), $status);
}
function cfg(array $a, string $g, string $k, mixed $default=null): mixed { return $a[$g][$k] ?? $default; }
function cleanText(mixed $v): string { return trim((string)($v ?? '')); }
function finiteNumber(mixed $v, float $default=0): float {
    if ($v === null || $v === '') return $default;
    $s = str_replace(',','',trim((string)$v));
    return is_numeric($s) ? (float)$s : $default;
}
function logBridge(array $config, string $level, string $event, array $context=[]): void {
    $file = (string)cfg($config,'bridge','log_file',__DIR__.DIRECTORY_SEPARATOR.'invs_bridge.log');
    $row = [
        'ts'=>date('c'), 'level'=>$level, 'event'=>$event,
        'bridge_version'=>BRIDGE_VERSION, 'context'=>$context
    ];
    @file_put_contents($file, json_encode($row, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL, FILE_APPEND|LOCK_EX);
}
function b64url(string $data): string { return rtrim(strtr(base64_encode($data), '+/', '-_'), '='); }


foreach (['mysqli','curl','openssl','json'] as $ext) {
    if (!extension_loaded($ext)) respondError('PHP_EXTENSION_MISSING', "PHP extension {$ext} ยังไม่เปิดใช้งาน", 500);
}

function getAccessToken(string $serviceAccountPath): string {
    $key = json_decode((string)file_get_contents($serviceAccountPath), true);
    if (!is_array($key) || empty($key['client_email']) || empty($key['private_key'])) throw new RuntimeException('serviceAccountKey.json ไม่ถูกต้อง');
    $now = time();
    $header = ['alg'=>'RS256','typ'=>'JWT'];
    $claims = ['iss'=>$key['client_email'],'scope'=>FIRESTORE_SCOPE,'aud'=>GOOGLE_TOKEN_URL,'iat'=>$now,'exp'=>$now+3600];
    $unsigned = b64url(json_encode($header,JSON_UNESCAPED_SLASHES)).'.'.b64url(json_encode($claims,JSON_UNESCAPED_SLASHES));
    $pk = openssl_pkey_get_private($key['private_key']);
    if ($pk === false) throw new RuntimeException('เปิด private key ไม่สำเร็จ');
    $sig='';
    if (!openssl_sign($unsigned,$sig,$pk,OPENSSL_ALGO_SHA256)) throw new RuntimeException('Sign Google OAuth JWT ไม่สำเร็จ');
    $jwt = $unsigned.'.'.b64url($sig);
    $ch = curl_init(GOOGLE_TOKEN_URL);
    curl_setopt_array($ch,[
        CURLOPT_POST=>true,
        CURLOPT_POSTFIELDS=>http_build_query(['grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>$jwt]),
        CURLOPT_HTTPHEADER=>['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>30
    ]);
    $body = curl_exec($ch);
    if ($body === false) { $e=curl_error($ch); curl_close($ch); throw new RuntimeException('Google OAuth: '.$e); }
    $http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch);
    $json=json_decode((string)$body,true);
    if ($http<200 || $http>=300 || empty($json['access_token'])) throw new RuntimeException("Google OAuth HTTP {$http}");
    return (string)$json['access_token'];
}

function curlJson(string $method,string $url,array $headers=[],?array $payload=null,int $timeout=45): array {
    $ch=curl_init($url);
    $opts=[CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>$timeout,CURLOPT_HTTPHEADER=>$headers];
    if ($payload!==null) { $opts[CURLOPT_POSTFIELDS]=json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES); }
    curl_setopt_array($ch,$opts);
    $body=curl_exec($ch);
    if ($body===false) { $e=curl_error($ch); curl_close($ch); throw new RuntimeException($e); }
    $http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE); curl_close($ch);
    $json=json_decode((string)$body,true);
    return ['status'=>$http,'body'=>is_array($json)?$json:[],'raw'=>(string)$body];
}

function verifyFirebaseIdToken(array $config,string $idToken): array {
    $apiKey=(string)cfg($config,'firebase','web_api_key','');
    $url='https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='.rawurlencode($apiKey);
    $res=curlJson('POST',$url,['Content-Type: application/json'],['idToken'=>$idToken],30);
    $user=$res['body']['users'][0] ?? null;
    if ($res['status']<200 || $res['status']>=300 || !is_array($user) || empty($user['localId'])) {
        throw new RuntimeException('Firebase session ไม่ถูกต้องหรือหมดอายุ');
    }
    return $user;
}

function decodeFsValue(?array $v): mixed {
    if (!$v) return null;
    if (array_key_exists('nullValue',$v)) return null;
    if (array_key_exists('stringValue',$v)) return (string)$v['stringValue'];
    if (array_key_exists('integerValue',$v)) return (int)$v['integerValue'];
    if (array_key_exists('doubleValue',$v)) return (float)$v['doubleValue'];
    if (array_key_exists('booleanValue',$v)) return (bool)$v['booleanValue'];
    if (array_key_exists('timestampValue',$v)) return (string)$v['timestampValue'];
    if (array_key_exists('arrayValue',$v)) return array_map('decodeFsValue',$v['arrayValue']['values'] ?? []);
    if (array_key_exists('mapValue',$v)) {
        $out=[]; foreach (($v['mapValue']['fields'] ?? []) as $k=>$x) $out[$k]=decodeFsValue($x); return $out;
    }
    return null;
}
function encodeFsValue(mixed $v): array {
    if ($v===null) return ['nullValue'=>null];
    if (is_bool($v)) return ['booleanValue'=>$v];
    if (is_int($v)) return ['integerValue'=>(string)$v];
    if (is_float($v)) {
        if (abs($v-round($v))<0.0000001) return ['integerValue'=>(string)(int)round($v)];
        return ['doubleValue'=>$v];
    }
    if (is_array($v)) {
        $isList=array_is_list($v);
        if ($isList) return ['arrayValue'=>['values'=>array_map('encodeFsValue',$v)]];
        $fields=[]; foreach ($v as $k=>$x) $fields[(string)$k]=encodeFsValue($x);
        return ['mapValue'=>['fields'=>$fields]];
    }
    return ['stringValue'=>(string)$v];
}
function fsDocumentToArray(array $doc): array {
    $out=[]; foreach (($doc['fields'] ?? []) as $k=>$v) $out[$k]=decodeFsValue($v); return $out;
}
function firestoreDocUrl(string $project,string $collection,string $docId): string {
    return 'https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents/'.rawurlencode($collection).'/'.rawurlencode($docId);
}
function getFirestoreDoc(string $project,string $collection,string $docId,string $accessToken): ?array {
    $res=curlJson('GET',firestoreDocUrl($project,$collection,$docId),['Authorization: Bearer '.$accessToken,'Accept: application/json'],null,45);
    if ($res['status']===404) return null;
    if ($res['status']<200 || $res['status']>=300) throw new RuntimeException("Firestore GET {$collection}/{$docId} HTTP {$res['status']}: {$res['raw']}");
    return fsDocumentToArray($res['body']);
}
function patchFirestoreDoc(string $project,string $collection,string $docId,array $fields,string $accessToken): void {
    $mask=[]; $encoded=[];
    foreach ($fields as $k=>$v) { $mask[]='updateMask.fieldPaths='.rawurlencode((string)$k); $encoded[(string)$k]=encodeFsValue($v); }
    // v2.8: ใบเบิกที่ Bridge แก้ → แตะ updated_at ให้แคชบนเว็บ (ดึงเฉพาะที่เปลี่ยน) เห็นสถานะใหม่
    if (in_array($collection,['requisitions','internal_requisitions'],true) && !isset($fields['updated_at'])) {
        $mask[]='updateMask.fieldPaths=updated_at'; $encoded['updated_at']=['timestampValue'=>gmdate('Y-m-d\TH:i:s\Z')];
    }
    $url=firestoreDocUrl($project,$collection,$docId).'?'.implode('&',$mask);
    $res=curlJson('PATCH',$url,['Authorization: Bearer '.$accessToken,'Content-Type: application/json'],['fields'=>$encoded],45);
    if ($res['status']<200 || $res['status']>=300) throw new RuntimeException("Firestore PATCH HTTP {$res['status']}: {$res['raw']}");
}

function normalizeRoleValue(mixed $value): string {
    $role=cleanText($value);
    // Match WebApp behavior and also strip common invisible Unicode characters
    // that can survive copy/paste into Firestore fields.
    $role=preg_replace('/[\x{200B}-\x{200D}\x{2060}\x{FEFF}]/u','',$role) ?? $role;
    $role=strtolower(trim($role));
    if (in_array($role,['admin','administrator'],true)) return 'admin';
    if (in_array($role,['hospital','รพ.สต.','รพสต'],true)) return 'hospital';
    if (in_array($role,['dept','department','หน่วยงาน'],true)) return 'dept';
    if (in_array($role,['pharmacy','ห้องยา'],true)) return 'pharmacy';
    return $role;
}
function profileActiveValue(array $profile): bool {
    if (!array_key_exists('active',$profile) || $profile['active']===null || $profile['active']==='') return true;
    $v=$profile['active'];
    if (is_bool($v)) return $v;
    if (is_numeric($v)) return ((float)$v)!==0.0;
    $s=strtolower(trim((string)$v));
    return !in_array($s,['false','0','n','no','inactive','disabled','off'],true);
}
function extractFirebaseIdToken(array $requestBody=[]): string {
    $candidates=[];
    foreach (['HTTP_AUTHORIZATION','REDIRECT_HTTP_AUTHORIZATION','Authorization'] as $key) {
        if (!empty($_SERVER[$key])) $candidates[]=(string)$_SERVER[$key];
    }
    if (function_exists('getallheaders')) {
        $headers=getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $k=>$v) {
                if (strcasecmp((string)$k,'Authorization')===0 && trim((string)$v)!=='') $candidates[]=(string)$v;
            }
        }
    }
    if (function_exists('apache_request_headers')) {
        $headers=apache_request_headers();
        if (is_array($headers)) {
            foreach ($headers as $k=>$v) {
                if (strcasecmp((string)$k,'Authorization')===0 && trim((string)$v)!=='') $candidates[]=(string)$v;
            }
        }
    }
    foreach ($candidates as $auth) {
        if (preg_match('/^Bearer\s+(.+)$/i',trim($auth),$m) && trim($m[1])!=='') return trim($m[1]);
    }
    // XAMPP/Apache บาง configuration ไม่ส่ง Authorization header ต่อให้ PHP
    // WebApp จึงส่ง Firebase ID token ซ้ำใน JSON body เป็น fallback เฉพาะ loopback bridge
    $bodyToken=trim((string)($requestBody['firebase_id_token'] ?? ''));
    if ($bodyToken!=='') return $bodyToken;
    return '';
}
function getAuthContext(array $config,array $requestBody=[]): array {
    $idToken=extractFirebaseIdToken($requestBody);
    if ($idToken==='') respondError('AUTH_REQUIRED','ไม่พบ Firebase ID token จากทั้ง Authorization header และ JSON fallback กรุณาใช้ WebApp v4.16.3 หรือใหม่กว่า',401,[
        'auth_transport_debug'=>[
            'http_authorization'=>!empty($_SERVER['HTTP_AUTHORIZATION']),
            'redirect_http_authorization'=>!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION']),
            'json_token_present'=>!empty($requestBody['firebase_id_token'])
        ]
    ]);
    try {
        $authUser=verifyFirebaseIdToken($config,$idToken);
        $uid=(string)$authUser['localId'];
        $access=getAccessToken((string)cfg($config,'firebase','service_account_json',''));
        $project=(string)cfg($config,'firebase','project_id','sawee-rxfill');
        $profile=getFirestoreDoc($project,'users',$uid,$access);
        if (!$profile) respondError('PROFILE_NOT_FOUND','Bridge ยืนยัน Firebase Auth ได้ แต่ไม่พบ users/'.$uid.' ใน Firestore project '.$project,403,[
            'auth_debug'=>['uid'=>$uid,'project_id'=>$project,'profile_exists'=>false]
        ]);
        $rawRole=$profile['role'] ?? '';
        $role=normalizeRoleValue($rawRole);
        $active=profileActiveValue($profile);
        return [
            'uid'=>$uid,
            'name'=>cleanText($profile['name'] ?? ($authUser['email'] ?? $uid)),
            'profile'=>$profile,
            'access_token'=>$access,
            'role'=>$role,
            'active'=>$active,
            'auth_debug'=>[
                'uid'=>$uid,
                'project_id'=>$project,
                'profile_exists'=>true,
                'role_raw'=>is_scalar($rawRole)?(string)$rawRole:gettype($rawRole),
                'role_normalized'=>$role,
                'active_field_exists'=>array_key_exists('active',$profile),
                'active_effective'=>$active,
            ]
        ];
    } catch (Throwable $e) {
        respondError('AUTH_FAILED',$e->getMessage(),401);
    }
}
function requireAdmin(array $config,array $requestBody=[]): array {
    $ctx=getAuthContext($config,$requestBody);
    if ($ctx['role']!=='admin' || $ctx['active']!==true) {
        $d=$ctx['auth_debug'];
        $msg='Bridge อ่านสิทธิ์เป็น role="'.($d['role_normalized'] ?: '(ว่าง)').'", active=' . ($d['active_effective']?'true':'false') .
             ', project='.$d['project_id'].' จึงไม่อนุญาตส่งเข้า INVS';
        respondError('ADMIN_ONLY',$msg,403,['auth_debug'=>$d]);
    }
    return $ctx;
}

function requireRoles(array $config,array $requestBody,array $roles): array {
    $ctx=getAuthContext($config,$requestBody);
    if (!in_array($ctx['role'],$roles,true) || $ctx['active']!==true) {
        respondError('ROLE_NOT_ALLOWED','สิทธิ์ '.($ctx['role'] ?: '(ว่าง)').' ใช้งานคำสั่งนี้ไม่ได้ (ต้องเป็น '.implode(' / ',$roles).')',403,['auth_debug'=>$ctx['auth_debug']]);
    }
    return $ctx;
}
function connectHosxp(array $config): mysqli {
    $h=$config['hosxp'] ?? null;
    if (!is_array($h) || cleanText($h['host'] ?? '')==='' || str_contains((string)($h['user'] ?? ''),'PUT_')) {
        throw new RuntimeException("ยังไม่ได้ตั้งค่า 'hosxp' ใน C:\\SaweeRefill\\private\\config.php (host/user/password/database ของ HOSxP)");
    }
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $db=mysqli_init();
    if (!$db) throw new RuntimeException('mysqli_init failed');
    $db->options(MYSQLI_OPT_CONNECT_TIMEOUT,(int)($h['connect_timeout'] ?? 10));
    $db->real_connect((string)$h['host'],(string)($h['user'] ?? ''),(string)($h['password'] ?? ''),(string)($h['database'] ?? 'hos'),(int)($h['port'] ?? 3306));
    $db->set_charset((string)($h['charset'] ?? 'tis620'));
    return $db;
}
function hosxpText(array $config,mixed $v): string {
    $s=(string)($v ?? '');
    $cs=strtolower((string)($config['hosxp']['charset'] ?? 'tis620'));
    if ($s!=='' && in_array($cs,['tis620','tis-620','latin1'],true) && !(function_exists('mb_check_encoding') && mb_check_encoding($s,'UTF-8'))) {
        $c=@iconv('TIS-620','UTF-8//IGNORE',$s);
        if ($c!==false) $s=$c;
    }
    return trim($s);
}
function shiftYears(string $ymd,int $years): string {
    [$y,$m,$d]=array_map('intval',explode('-',$ymd));
    $y+=$years;
    if (!checkdate($m,$d,$y)) $d=28; // 29 ก.พ. ที่ไม่มีในปีปลายทาง
    return sprintf('%04d-%02d-%02d',$y,$m,$d);
}
function validDateYmd(string $d): bool {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/',$d)) return false;
    [$y,$m,$dd]=array_map('intval',explode('-',$d));
    return checkdate($m,$dd,$y);
}

function connectDb(array $config): mysqli {
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $db=mysqli_init();
    if (!$db) throw new RuntimeException('mysqli_init failed');
    $db->options(MYSQLI_OPT_CONNECT_TIMEOUT,(int)cfg($config,'mysql','connect_timeout',10));
    $db->real_connect((string)cfg($config,'mysql','host',''),(string)cfg($config,'mysql','user',''),(string)cfg($config,'mysql','password',''),(string)cfg($config,'mysql','database',''),(int)cfg($config,'mysql','port',3306));
    $db->set_charset((string)cfg($config,'mysql','charset','utf8'));
    return $db;
}
function tableHasColumn(mysqli $db,string $table,string $column): bool {
    static $cache=[]; $key=strtolower($table.'|'.$column); if (array_key_exists($key,$cache)) return $cache[$key];
    $st=$db->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1');
    $st->bind_param('ss',$table,$column); $st->execute(); $ok=(bool)$st->get_result()->fetch_row(); $st->close(); return $cache[$key]=$ok;
}
function validateDept(mysqli $db,string $deptId): array {
    $st=$db->prepare("SELECT DEPT_ID, DEPT_NAME, HIDE FROM dept_id WHERE DEPT_ID=? LIMIT 1");
    $st->bind_param('s',$deptId); $st->execute(); $r=$st->get_result()->fetch_assoc(); $st->close();
    if (!$r) throw new RuntimeException("ไม่พบ DEPT_ID {$deptId} ใน INVS");
    if (in_array(strtoupper(cleanText($r['HIDE'] ?? '')),['Y','1'],true)) throw new RuntimeException("DEPT_ID {$deptId} ถูกซ่อนใน INVS");
    return $r;
}
function findNlem(mysqli $db,string $workingCode,string $tradeCode,?int $packCode): ?int {
    $candidates=[['drug_gn','WORKING_CODE',$workingCode],['drug_vn','TRADE_CODE',$tradeCode],['pack_ratio','WORKING_CODE',$workingCode]];
    foreach ($candidates as [$table,$key,$value]) {
        if (!tableHasColumn($db,$table,'NLEM') || !tableHasColumn($db,$table,$key)) continue;
        $sql="SELECT NLEM FROM {$table} WHERE {$key}=? AND NLEM IS NOT NULL";
        if ($table==='pack_ratio' && $packCode!==null && tableHasColumn($db,'pack_ratio','PACK_CODE')) $sql.=' AND PACK_CODE='.(int)$packCode;
        $sql.=' LIMIT 1';
        $st=$db->prepare($sql); $st->bind_param('s',$value); $st->execute(); $r=$st->get_result()->fetch_assoc(); $st->close();
        if ($r && $r['NLEM']!==null && $r['NLEM']!=='') return (int)$r['NLEM'];
    }
    return null;
}
function findFirstLot(mysqli $db,string $workingCode,string $stockId): ?array {
    $sql="SELECT RECORD_NUMBER, WORKING_CODE, PACK_RATIO, QTY_ON_HAND, LOCATION, LOT_COST, VENDOR_CODE, MANUFAC_CODE, LOT_VALUE, TRADE_CODE, DEPT_ID, LOT_NO, USER_ID, EXPIRED_DATE, PACK_COST, PACK_CODE, MOD_SYS, PACK_PRICE
          FROM inv_md_c
          WHERE TRIM(WORKING_CODE)=TRIM(?) AND DEPT_ID=? AND COALESCE(QTY_ON_HAND,0)>0
          ORDER BY RECORD_NUMBER ASC LIMIT 1";
    $st=$db->prepare($sql); $st->bind_param('ss',$workingCode,$stockId); $st->execute(); $r=$st->get_result()->fetch_assoc(); $st->close(); return $r ?: null;
}
function drugExists(mysqli $db,string $workingCode): ?array {
    $st=$db->prepare('SELECT WORKING_CODE, DRUG_NAME FROM drug_gn WHERE TRIM(WORKING_CODE)=TRIM(?) LIMIT 1');
    $st->bind_param('s',$workingCode); $st->execute(); $r=$st->get_result()->fetch_assoc(); $st->close(); return $r ?: null;
}
function makeMarker(string $reqId): string { return 'SV'.strtoupper(substr(sha1($reqId),0,13)); }
function getExistingByMarker(mysqli $db,string $marker): ?array {
    $st=$db->prepare('SELECT * FROM sm_po WHERE REF_NO=? ORDER BY RECORD_NUMBER DESC LIMIT 1');
    $st->bind_param('s',$marker); $st->execute(); $r=$st->get_result()->fetch_assoc(); $st->close(); return $r ?: null;
}
function loadExistingDetails(mysqli $db,string $subPoNo): array {
    $st=$db->prepare('SELECT RECORD_NUMBER,SUB_PO_NO,WORKING_CODE,QTY_ORDER,QTY_RCV,PACK_RATIO,COST,VALUE,TRADE_CODE,EXPIRED_DATE,USER_ID,CONFIRM_FLAG,BUY_UNIT_COST,LOT_NO,PACK_COST,MOD_SYS,REQ_DATE,PACK_CODE,NLEM,CLIENT_IP,DISP_RECNO,EXCH_RECNO FROM sm_po_c WHERE SUB_PO_NO=? ORDER BY RECORD_NUMBER');
    $st->bind_param('s',$subPoNo); $st->execute(); $rows=$st->get_result()->fetch_all(MYSQLI_ASSOC); $st->close(); return $rows;
}
function generateSubPoNoAndInsertHeader(mysqli $db,array $h): string {
    $year2=str_pad((string)(((int)date('Y')+543)%100),2,'0',STR_PAD_LEFT);
    $prefix=$year2.date('md');
    $db->query('LOCK TABLES sm_po WRITE, ms_ivo READ');
    try {
        $max=0;
        $like=$prefix.'%';
        $st=$db->prepare("SELECT SUB_PO_NO AS doc_no FROM sm_po WHERE SUB_PO_NO LIKE ? UNION ALL SELECT RECEIVE_NO AS doc_no FROM ms_ivo WHERE RECEIVE_NO LIKE ?");
        $st->bind_param('ss',$like,$like); $st->execute(); $res=$st->get_result();
        while ($r=$res->fetch_assoc()) {
            $doc=cleanText($r['doc_no'] ?? '');
            if (str_starts_with($doc,$prefix)) { $suffix=(int)substr($doc,strlen($prefix)); if ($suffix>$max) $max=$suffix; }
        }
        $st->close();
        $next=$max+1;
        if ($next>9999) throw new RuntimeException('เลขใบเบิกประจำวันเกิน 9999');
        $subPoNo=$prefix.str_pad((string)$next,4,'0',STR_PAD_LEFT);

        $sql="INSERT INTO sm_po (SUB_PO_NO,DEPT_ID,ACC_NO,TOTAL_ITEM,TOTAL_COST,TOTAL_VALUE,SYSDATE,OK,PROCESS,ERROR_ENTER,ERROR_PROCESS,STOCK_ID,USER_ID,SUB_PO_DATE,CONFIRM_FLAG,PRIOR_FLAG,R_S_STATUS,SEND_FLAG,PRINT_FLAG,MOD_SYS,REF_NO,SUB_PO_UNO,CONFIRM_DATE,CONFIRM_TIME,DIST_TYPE,REQ_INTER,CFM_INTER)
              VALUES (?,?,NULL,?,?,?,NOW(),NULL,NULL,NULL,NULL,?,?,?,'N',NULL,'R','N',NULL,?,?,NULL,NULL,NULL,NULL,'N','N')";
        $st=$db->prepare($sql);
        $st->bind_param('ssdddsssss',$subPoNo,$h['dept_id'],$h['total_item'],$h['total_cost'],$h['total_value'],$h['stock_id'],$h['user_id'],$h['req_date'],$h['mod_sys'],$h['marker']);
        $st->execute(); $st->close();
        $db->query('UNLOCK TABLES');
        return $subPoNo;
    } catch (Throwable $e) {
        try { $db->query('UNLOCK TABLES'); } catch (Throwable $ignore) {}
        throw $e;
    }
}
function cleanupOwnPartial(mysqli $db,string $subPoNo,string $marker): void {
    $st=$db->prepare("DELETE FROM sm_po_c WHERE SUB_PO_NO=? AND (CONFIRM_FLAG IS NULL OR CONFIRM_FLAG<>'Y')"); $st->bind_param('s',$subPoNo); $st->execute(); $st->close();
    $st=$db->prepare("DELETE FROM sm_po WHERE SUB_PO_NO=? AND REF_NO=? AND (CONFIRM_FLAG IS NULL OR CONFIRM_FLAG<>'Y') AND (SEND_FLAG IS NULL OR SEND_FLAG<>'Y')"); $st->bind_param('ss',$subPoNo,$marker); $st->execute(); $st->close();
}

function buildPreflight(mysqli $db,array $config,array $req,array $hospital): array {
    $status=cleanText($req['status'] ?? '');
    if (!in_array($status,['Pending','Draft'],true)) throw new RuntimeException("ใบเบิกสถานะ {$status} ไม่พร้อมส่งเข้า INVS");
    if (strtoupper(cleanText($req['invs_status'] ?? ''))==='SENT' || cleanText($req['invs_sub_po_no'] ?? '')!=='') {
        return ['already_sent'=>true,'sub_po_no'=>cleanText($req['invs_sub_po_no'] ?? ''),'items'=>[],'warnings'=>[],'errors'=>[],'ok'=>true];
    }
    $deptId=cleanText($hospital['invs_dept_id'] ?? '');
    if ($deptId==='') throw new RuntimeException('หน่วยเบิกนี้ยังไม่ได้ตั้งค่า INVS Dept ID (Admin > รพ.สต. หรือ Admin > หน่วยงาน/ห้องยา)');
    $stockId=cleanText($hospital['invs_stock_id'] ?? cfg($config,'invs','default_stock_id','10'));
    if ($stockId==='') throw new RuntimeException('ยังไม่ได้ตั้งค่า INVS Stock ID');
    $dept=validateDept($db,$deptId); $stock=validateDept($db,$stockId);
    $warnings=[]; $errors=[]; $lines=[];
    // skipped_items เป็นข้อมูลจากขั้นตอน import รบ.301 ที่ผู้ใช้ตั้งใจไม่เบิก
    // INVS ต้องพิจารณาเฉพาะรายการที่อยู่ใน req.items และมีจำนวนจ่าย > 0 เท่านั้น
    $items=is_array($req['items'] ?? null) ? $req['items'] : [];
    $seenDrug=[];
    foreach ($items as $idx=>$it) {
        if (!is_array($it)) continue;
        $qty=finiteNumber($it['dispenseQty'] ?? $it['finalRequestedQty'] ?? 0);
        if ($qty<=0) continue;
        $drugId=cleanText($it['drugId'] ?? '');
        if ($drugId==='') { $errors[]="รายการที่ ".($idx+1)." ไม่มี drugId"; continue; }
        if (isset($seenDrug[$drugId])) { $errors[]="พบรหัสยา {$drugId} ซ้ำในใบเบิก"; continue; }
        $seenDrug[$drugId]=true;
        if (cleanText($it['type'] ?? '')==='6') { $errors[]="{$drugId}: เป็นวัคซีน type 6 แต่มีจำนวนจ่าย {$qty} ซึ่งไม่ควรส่งเข้า INVS ผ่าน VMI"; continue; }
        $dg=drugExists($db,$drugId);
        if (!$dg) { $errors[]="ไม่พบรหัสยา {$drugId} ใน DRUG_GN"; continue; }
        $lot=findFirstLot($db,$drugId,$stockId);
        if (!$lot) { $errors[]="{$drugId} {$dg['DRUG_NAME']}: ไม่พบ lot ที่ QTY_ON_HAND > 0 ในคลัง {$stockId}"; continue; }
        $pack=max(1.0,finiteNumber($lot['PACK_RATIO'] ?? 1,1));
        $packCost=finiteNumber($lot['PACK_COST'] ?? 0);
        if ($packCost<=0) { $errors[]="{$drugId}: lot {$lot['LOT_NO']} ไม่มี PACK_COST"; continue; }
        $cost=round($packCost/$pack,6);
        $value=round($qty*$cost,2);
        $lotQty=finiteNumber($lot['QTY_ON_HAND'] ?? 0);
        $masterPack=finiteNumber($it['packSize'] ?? 0);
        if ($masterPack>0 && abs($masterPack-$pack)>0.000001) $warnings[]="{$drugId}: Pack ใน Sawee VMI {$masterPack} ต่างจาก lot INVS {$pack} — จะใช้ค่า INVS";
        if ($qty>$lotQty) {
            $msg="{$drugId}: ขอ {$qty} แต่ lot ตั้งต้น {$lot['LOT_NO']} เหลือ {$lotQty}";
            if (!empty($config['invs']['block_if_first_lot_short'])) $errors[]=$msg.' (v1.0 บล็อกการส่งเพื่อความปลอดภัย)'; else $warnings[]=$msg;
        }
        $nlem=findNlem($db,$drugId,cleanText($lot['TRADE_CODE'] ?? ''),isset($lot['PACK_CODE'])?(int)$lot['PACK_CODE']:null);
        $lines[]=[
            'drug_id'=>$drugId,'drug_name'=>cleanText($dg['DRUG_NAME'] ?? ($it['name'] ?? '')),'qty'=>$qty,
            'lot_record'=>(int)$lot['RECORD_NUMBER'],'lot_no'=>cleanText($lot['LOT_NO'] ?? ''),'expiry'=>cleanText($lot['EXPIRED_DATE'] ?? ''),'lot_qty_on_hand'=>$lotQty,
            'pack_ratio'=>$pack,'cost'=>$cost,'pack_cost'=>$packCost,'value'=>$value,
            'vendor_code'=>cleanText($lot['VENDOR_CODE'] ?? ''),'manufac_code'=>cleanText($lot['MANUFAC_CODE'] ?? ''),'trade_code'=>cleanText($lot['TRADE_CODE'] ?? $drugId),
            'pack_code'=>($lot['PACK_CODE']!==null && $lot['PACK_CODE']!=='')?(int)$lot['PACK_CODE']:null,'nlem'=>$nlem,
            'location'=>cleanText($lot['LOCATION'] ?? ''),'mod_sys'=>cleanText($lot['MOD_SYS'] ?? cfg($config,'invs','mod_sys','MED')),
            'vmi_pack_size'=>$masterPack
        ];
    }
    if (!$lines) $errors[]='ไม่มีรายการที่มีจำนวนจ่ายมากกว่า 0';
    $totalItem=count($lines);
    $totalCost=round(array_sum(array_map(fn($x)=>(float)$x['cost'],$lines)),2);
    $totalValue=round(array_sum(array_map(fn($x)=>(float)$x['value'],$lines)),2);
    return [
        'ok'=>count($errors)===0,'already_sent'=>false,'dept_id'=>$deptId,'dept_name'=>cleanText($dept['DEPT_NAME'] ?? ''),'stock_id'=>$stockId,'stock_name'=>cleanText($stock['DEPT_NAME'] ?? ''),
        'request_date'=>date('Ymd'),'item_count'=>$totalItem,'total_cost'=>$totalCost,'total_value'=>$totalValue,
        'items'=>$lines,'warnings'=>$warnings,'errors'=>$errors
    ];
}

function insertDetails(mysqli $db,array $config,string $subPoNo,array $lines,string $reqDate): void {
    $userId=cleanText(cfg($config,'invs','user_id',''));
    $clientIp=cleanText(cfg($config,'invs','client_ip','127.0.0.1')) ?: '127.0.0.1';
    $sql="INSERT INTO sm_po_c (SUB_PO_NO,WORKING_CODE,QTY_ORDER,QTY_RCV,PACK_RATIO,COST,VALUE,VENDOR_CODE,MANUFAC_CODE,TRADE_CODE,EXPIRED_DATE,LOCATION,USER_ID,CONFIRM_FLAG,BUY_UNIT_COST,LOT_NO,PACK_COST,MOD_SYS,REQ_DATE,PACK_CODE,NLEM,CLIENT_IP,LAST_UPD,APP_VERSION)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'N',?,?,?,?,?,?,?,?,NOW(),?)";
    $st=$db->prepare($sql);
    foreach ($lines as $x) {
        $working=$x['drug_id']; $qty=(float)$x['qty']; $pack=(float)$x['pack_ratio']; $cost=(float)$x['cost']; $value=(float)$x['value'];
        $vendor=$x['vendor_code']; $manufac=$x['manufac_code']; $trade=$x['trade_code']; $exp=$x['expiry']; $location=$x['location']; $buy=(float)$x['pack_cost']; $lot=$x['lot_no']; $packCost=(float)$x['pack_cost']; $mod=$x['mod_sys'] ?: cleanText(cfg($config,'invs','mod_sys','MED')); $packCode=$x['pack_code']; $nlem=$x['nlem']; $appVersion='SVMI2.1';
        $st->bind_param('ssdddddssssssdsdssiiss',$subPoNo,$working,$qty,$qty,$pack,$cost,$value,$vendor,$manufac,$trade,$exp,$location,$userId,$buy,$lot,$packCost,$mod,$reqDate,$packCode,$nlem,$clientIp,$appVersion);
        $st->execute();
    }
    $st->close();
}

// ----------------------------- health -----------------------------
if ($_SERVER['REQUEST_METHOD']==='GET') {
    $action=cleanText($_GET['action'] ?? 'health');
    if ($action!=='health') respondError('METHOD_NOT_ALLOWED','ใช้ GET ได้เฉพาะ action=health',405);
    $missing=[];
    foreach ([['mysql','host'],['mysql','user'],['mysql','password'],['mysql','database']] as [$g,$k]) {
        $v=cleanText(cfg($config,$g,$k,''));
        if ($v==='' || str_contains($v,'PUT_')) $missing[]="{$g}.{$k}";
    }
    $sa=(string)cfg($config,'firebase','service_account_json','');
    $firebaseReady=cleanText(cfg($config,'firebase','project_id',''))!=='' && cleanText(cfg($config,'firebase','web_api_key',''))!=='' && $sa!=='' && file_exists($sa);
    if ($missing) respondError('CONFIG_INCOMPLETE','กรุณาแก้ private\\config.php: '.implode(', ',$missing),500,['config_file'=>$configFile,'firebase_ready'=>$firebaseReady]);
    try {
        $db=connectDb($config); $db->query('SELECT 1');
        $dbInfo=['connected'=>true,'host'=>(string)cfg($config,'mysql','host',''),'port'=>(int)cfg($config,'mysql','port',3306),'database'=>(string)cfg($config,'mysql','database','')];
        $db->close();
        $saProject='';
        if ($sa!=='' && file_exists($sa)) { $saJson=json_decode((string)file_get_contents($sa),true); $saProject=cleanText($saJson['project_id'] ?? ''); }
        respond(['ok'=>true,'bridge_version'=>BRIDGE_VERSION,'live_send_enabled'=>!empty($config['bridge']['allow_live_send']),'mysql'=>$dbInfo,'firebase'=>['project_id'=>(string)cfg($config,'firebase','project_id',''),'service_account_exists'=>$sa!==''&&file_exists($sa),'service_account_project_id'=>$saProject],'config_file'=>$configFile,'hosxp_configured'=>is_array($config['hosxp'] ?? null) && cleanText($config['hosxp']['host'] ?? '')!=='','features'=>['hosxp_usage','internal_requisitions','list_depts','hosxp_diag','invs_discover','invs_extras','sync_ncds']]);
    } catch (Throwable $e) { respondError('HEALTH_FAILED',$e->getMessage(),500,['config_file'=>$configFile]); }
}
if ($_SERVER['REQUEST_METHOD']!=='POST') respondError('METHOD_NOT_ALLOWED','รองรับ POST เท่านั้น',405);
foreach ([['mysql','host'],['mysql','user'],['mysql','password'],['mysql','database'],['firebase','project_id'],['firebase','service_account_json'],['firebase','web_api_key']] as [$g,$k]) {
    $v=cleanText(cfg($config,$g,$k,''));
    if ($v==='' || str_contains($v,'PUT_')) respondError('CONFIG_INCOMPLETE', "private/config.php ขาดหรือยังไม่ได้ตั้ง {$g}.{$k}", 500);
}
$serviceAccountPath = (string)cfg($config,'firebase','service_account_json','');
if (!file_exists($serviceAccountPath)) respondError('SERVICE_ACCOUNT_MISSING', 'ไม่พบ private/serviceAccountKey.json', 500);

$raw=(string)file_get_contents('php://input');
$body=json_decode($raw,true);
if (!is_array($body)) respondError('JSON_INVALID','Request body ต้องเป็น JSON',400);
$action=cleanText($body['action'] ?? '');
if (!in_array($action,['authcheck','preflight','send','sync_hosxp_codes','hosxp_usage','list_depts','hosxp_diag','invs_discover','invs_extras','sync_ncds'],true)) respondError('ACTION_INVALID','action ไม่รองรับ: '.$action,400);

// ----------------------------- list_depts (READ-ONLY) -----------------------------
if ($action==='list_depts') {
    $admin=requireAdmin($config,$body);
    try {
        $db=connectDb($config);
        $want=['DEPT_ID','DEPT_NAME','HIDE','HOSP_TYPE','DEPT_TYPE','MOD_SYS','STD_CODE','SUPPLY_OFFICER','INV_DIRECTOR','SUPPLY_DIRECTOR'];
        $cols=array_values(array_filter($want,fn($c)=>tableHasColumn($db,'dept_id',$c)));
        if (!in_array('DEPT_ID',$cols,true) || !in_array('DEPT_NAME',$cols,true)) throw new RuntimeException('ตาราง dept_id ไม่มีคอลัมน์ DEPT_ID/DEPT_NAME');
        $res=$db->query('SELECT `'.implode('`,`',$cols).'` FROM dept_id ORDER BY DEPT_ID');
        $rows=[];
        while ($r=$res->fetch_assoc()) {
            $row=[];
            foreach ($want as $c) $row[strtolower($c)]=cleanText($r[$c] ?? '');
            $rows[]=$row;
        }
        $res->free(); $db->close();
        logBridge($config,'INFO','LIST_DEPTS',['admin_uid'=>$admin['uid'],'count'=>count($rows)]);
        respond(['ok'=>true,'action'=>'list_depts','count'=>count($rows),'rows'=>$rows,'bridge_version'=>BRIDGE_VERSION]);
    } catch (Throwable $e) {
        if (isset($db) && $db instanceof mysqli) { try { $db->close(); } catch (Throwable $ignore) {} }
        respondError('BRIDGE_ERROR',$e->getMessage(),500);
    }
}
if ($action==='authcheck') {
    $ctx=getAuthContext($config,$body);
    respond(['ok'=>true,'bridge_version'=>BRIDGE_VERSION,'is_admin'=>$ctx['role']==='admin' && $ctx['active']===true,'auth_debug'=>$ctx['auth_debug']]);
}

// ----------------------------- sync_hosxp_codes -----------------------------
if ($action==='sync_hosxp_codes') {
    $admin=requireAdmin($config,$body);
    try {
        $db=connectDb($config);
        $mappings=[];
        $colError='';
        // Primary attempt: standard column names ICODE / HIS_CODE
        $attempted=[];
        $icodeCol=null; $hcodeCol=null;
        // Detect actual columns in inv_has_his via information_schema
        $colSt=$db->prepare('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION');
        $tbl='inv_has_his';
        $colSt->bind_param('s',$tbl); $colSt->execute(); $colRes=$colSt->get_result();
        $foundCols=[];
        while ($cr=$colRes->fetch_assoc()) $foundCols[]=strtoupper((string)$cr['COLUMN_NAME']);
        $colSt->close();
        // Map primary candidates for INVS code column and HIS code column
        $icandidates=['INV_CODE','ICODE','WORKING_CODE','DRUG_CODE','INVS_CODE'];
        $hcandidates=['HIS_CODE','HCODE','HOSXP_CODE','HOS_CODE'];
        foreach ($icandidates as $c) { if (in_array($c,$foundCols,true)) { $icodeCol=$c; break; } }
        foreach ($hcandidates as $c) { if (in_array($c,$foundCols,true)) { $hcodeCol=$c; break; } }
        if ($icodeCol===null || $hcodeCol===null) {
            $db->close();
            $missing=[];
            if ($icodeCol===null) $missing[]='INVS code column (tried: '.implode(', ',$icandidates).')';
            if ($hcodeCol===null) $missing[]='HIS code column (tried: '.implode(', ',$hcandidates).')';
            logBridge($config,'ERROR','SYNC_HOSXP_CODES_COL_DETECT_FAILED',['admin_uid'=>$admin['uid'],'found_cols'=>$foundCols,'missing'=>$missing]);
            respondError('HOSXP_COL_NOT_FOUND','ตรวจหาคอลัมน์ใน inv_has_his ไม่สำเร็จ: '.implode('; ',$missing).'. คอลัมน์ที่พบ: '.implode(', ',$foundCols),500,['found_columns'=>$foundCols]);
        }
        // คอลัมน์เสริม (ถ้ามี): INVALID_DATE = วันที่เลิกใช้การจับคู่, CONVER_FACT = ตัวคูณแปลงหน่วย HIS → INVS, HIS_NAME = ชื่อใน HOSxP
        $hasInvalid=in_array('INVALID_DATE',$foundCols,true);
        $hasFactor=in_array('CONVER_FACT',$foundCols,true);
        $hasHisName=in_array('HIS_NAME',$foundCols,true);
        $sql='SELECT `'.$icodeCol.'` AS invs_code, `'.$hcodeCol.'` AS hosxp_code'
            .($hasFactor?', `CONVER_FACT` AS conver_fact':'').($hasHisName?', `HIS_NAME` AS his_name':'')
            .' FROM `inv_has_his` WHERE `'.$hcodeCol.'` IS NOT NULL AND `'.$hcodeCol."` <> ''"
            .($hasInvalid?' AND (`INVALID_DATE` IS NULL OR `INVALID_DATE` > CURDATE())':'');
        $res=$db->query($sql);
        $skippedInvalid=0;
        if ($hasInvalid) { $cr=$db->query("SELECT COUNT(*) c FROM `inv_has_his` WHERE `INVALID_DATE` IS NOT NULL AND `INVALID_DATE` <= CURDATE()")->fetch_assoc(); $skippedInvalid=(int)($cr['c'] ?? 0); }
        while ($row=$res->fetch_assoc()) {
            $ic=cleanText($row['invs_code'] ?? '');
            $hc=cleanText($row['hosxp_code'] ?? '');
            if ($ic==='' || $hc==='') continue;
            $m=['invs_code'=>$ic,'hosxp_code'=>$hc];
            if ($hasFactor) { $f=finiteNumber($row['conver_fact'] ?? 1,1); $m['conver_fact']=$f>0?$f:1; }
            if ($hasHisName) $m['his_name']=cleanText($row['his_name'] ?? '');
            $mappings[]=$m;
        }
        $res->free();
        $db->close();
        logBridge($config,'INFO','SYNC_HOSXP_CODES_SUCCESS',['admin_uid'=>$admin['uid'],'count'=>count($mappings),'icode_col'=>$icodeCol,'hcode_col'=>$hcodeCol]);
        respond(['ok'=>true,'action'=>'sync_hosxp_codes','count'=>count($mappings),'mappings'=>$mappings,'skipped_invalid'=>$skippedInvalid,'columns'=>['invs'=>$icodeCol,'his'=>$hcodeCol],'bridge_version'=>BRIDGE_VERSION]);
    } catch (Throwable $e) {
        if (isset($db) && $db instanceof mysqli) { try { $db->close(); } catch (Throwable $ignore) {} }
        logBridge($config,'ERROR','SYNC_HOSXP_CODES_FAILED',['admin_uid'=>$admin['uid'] ?? '','error'=>$e->getMessage()]);
        respondError('BRIDGE_ERROR',$e->getMessage(),500);
    }
}

// ----------------------------- sync_ncds -----------------------------
// ปุ่ม "ดึงยอดใหม่" ในหน้าเว็บ: ทำงานเดียวกับ cli/sync_ncds_demand.php
if ($action==='sync_ncds') {
    $admin=requireAdmin($config,$body);
    $lib=dirname(dirname($configFile)).DIRECTORY_SEPARATOR.'cli'.DIRECTORY_SEPARATOR.'lib_ncds_sync.php';
    if (!is_file($lib)) respondError('LIB_MISSING','ไม่พบ '.$lib.' กรุณารัน INSTALL_ALL.bat ของ Bridge v2.6.0',500);
    require_once $lib;
    try {
        $r=ncds_sync($config);
        logBridge($config,'INFO','SYNC_NCDS',['admin_uid'=>$admin['uid'],'fetched'=>$r['fetched'],'written'=>$r['written'],'unmapped'=>count($r['unmapped'])]);
        respond(array_merge(['action'=>'sync_ncds','bridge_version'=>BRIDGE_VERSION],$r,['ok'=>true,'had_errors'=>!$r['ok']]));
    } catch (Throwable $e) {
        logBridge($config,'ERROR','SYNC_NCDS_FAILED',['admin_uid'=>$admin['uid'],'error'=>$e->getMessage()]);
        respondError('NCDS_SYNC_FAILED',$e->getMessage(),500);
    }
}

// ----------------------------- hosxp_diag (READ-ONLY) -----------------------------
// ตรวจทีละขั้นว่าทำไมดึงยอดใช้ได้ 0 รายการ: เชื่อมต่อ / ตาราง / ช่วงวันที่ / JOIN drugitems / SQL กำหนดเอง
if ($action==='hosxp_diag') {
    $actor=requireRoles($config,$body,['admin','pharmacy']);
    $from=cleanText($body['date_from'] ?? ''); $to=cleanText($body['date_to'] ?? '');
    $steps=[]; $ok=true;
    $add=function(string $name,bool $pass,string $detail,array $data=[]) use (&$steps,&$ok){ $steps[]=['step'=>$name,'ok'=>$pass,'detail'=>$detail,'data'=>$data]; if(!$pass) $ok=false; };
    $h=$config['hosxp'] ?? null;
    $add('config', is_array($h) && cleanText($h['host'] ?? '')!=='' && !str_contains((string)($h['user'] ?? ''),'PUT_'),
        is_array($h) ? ('host='.($h['host'] ?? '').' db='.($h['database'] ?? 'hos').' charset='.($h['charset'] ?? 'tis620').' usage_sql='.(trim((string)($h['usage_sql'] ?? ''))!==''?'กำหนดเอง':'ค่าเริ่มต้น')) : "ไม่พบส่วน 'hosxp' ใน config.php");
    if (!$ok) respond(['ok'=>true,'action'=>'hosxp_diag','all_pass'=>false,'steps'=>$steps,'bridge_version'=>BRIDGE_VERSION]);
    try {
        $hdb=connectHosxp($config);
        $r=$hdb->query('SELECT DATABASE() db, VERSION() v, @@character_set_connection cs')->fetch_assoc();
        $add('connect',true,'เชื่อมต่อสำเร็จ: database='.$r['db'].' MySQL '.$r['v'].' charset '.$r['cs']);
        $t=$hdb->query("SELECT COUNT(*) c FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('opitemrece','drugitems')")->fetch_assoc();
        $add('tables',(int)$t['c']===2,(int)$t['c']===2?'พบตาราง opitemrece และ drugitems':'ไม่พบ opitemrece/drugitems ในฐาน '.$r['db'].' (ตั้ง database ผิดหรือไม่?)');
        if ((int)$t['c']===2) {
            // ค่าต่ำสุด/สูงสุดมักเป็นวันที่ที่คีย์ผิด จึงหา "วันล่าสุดที่เป็นไปได้" แยกแบบ ค.ศ. และ พ.ศ.
            $mxCE=$hdb->query("SELECT MAX(rxdate) d FROM opitemrece WHERE rxdate < '2100-01-01'")->fetch_assoc()['d'] ?? null;
            $mxBE=$hdb->query("SELECT MAX(rxdate) d FROM opitemrece WHERE rxdate >= '2400-01-01' AND rxdate < '2650-01-01'")->fetch_assoc()['d'] ?? null;
            $today=date('Y-m-d');
            $ceFresh=$mxCE && $mxCE >= date('Y-m-d',strtotime('-14 days'));
            $beFresh=$mxBE && $mxBE >= shiftYears(date('Y-m-d',strtotime('-14 days')),543);
            $add('data_range',$ceFresh || $beFresh,
                'วันที่จ่ายยาล่าสุดแบบ ค.ศ.: '.($mxCE ?: '-').' · แบบ พ.ศ.: '.($mxBE ?: '-').' (วันนี้ '.$today.')'
                .($ceFresh ? ' — ฐานนี้เก็บวันที่เป็น ค.ศ. และเป็นข้อมูลปัจจุบัน' : ($beFresh ? ' — ฐานนี้เก็บวันที่เป็น พ.ศ. Bridge จะแปลงให้อัตโนมัติ (date_mode=auto)' :
                  ' — ข้อมูลล่าสุดเก่ากว่า 14 วัน ฐานนี้น่าจะเป็นฐานสำรอง/สำเนา ไม่ใช่ HOSxP ตัวที่ใช้งานจริง ตรวจ host และ database ใน config.php')));
            if (validDateYmd($from) && validDateYmd($to)) {
                $st=$hdb->prepare("SELECT COUNT(*) n, SUM(CASE WHEN COALESCE(an,'')<>'' THEN 1 ELSE 0 END) ipd, COUNT(DISTINCT icode) icodes FROM opitemrece WHERE rxdate BETWEEN ? AND ?");
                $st->bind_param('ss',$from,$to); $st->execute(); $c=$st->get_result()->fetch_assoc(); $st->close();
                $rowsCE=(int)$c['n'];
                $fB=shiftYears($from,543); $tB=shiftYears($to,543);
                $st=$hdb->prepare("SELECT COUNT(*) n, SUM(CASE WHEN COALESCE(an,'')<>'' THEN 1 ELSE 0 END) ipd, COUNT(DISTINCT icode) icodes FROM opitemrece WHERE rxdate BETWEEN ? AND ?");
                $st->bind_param('ss',$fB,$tB); $st->execute(); $cb=$st->get_result()->fetch_assoc(); $st->close();
                $rowsBE=(int)$cb['n'];
                $useBE=$rowsCE===0 && $rowsBE>0;
                $add('rows_in_range',$rowsCE>0 || $useBE,
                    "ช่วง {$from} ถึง {$to} (ค.ศ.): {$rowsCE} แถว (IPD ".(int)$c['ipd'].') · ถ้าอ่านเป็น พ.ศ. ('.$fB.' ถึง '.$tB.'): '.$rowsBE.' แถว (IPD '.(int)$cb['ipd'].')'
                    .($useBE ? ' — ใช้แบบ พ.ศ. ได้ Bridge จะสลับให้อัตโนมัติ' : ($rowsCE===0 ? ' — ไม่มีข้อมูลทั้งสองแบบในช่วงนี้' : '')));
                if ($useBE) { $from=$fB; $to=$tB; }
                $st=$hdb->prepare("SELECT COUNT(*) n, COUNT(DISTINCT o.icode) icodes FROM opitemrece o INNER JOIN drugitems d ON d.icode=o.icode WHERE o.rxdate BETWEEN ? AND ?");
                $st->bind_param('ss',$from,$to); $st->execute(); $j=$st->get_result()->fetch_assoc(); $st->close();
                $add('join_drugitems',(int)$j['n']>0,'หลัง JOIN drugitems (เฉพาะยา): '.(int)$j['n'].' แถว, '.(int)$j['icodes'].' icode'.((int)$c['n']>0 && (int)$j['n']===0?' — มีข้อมูลแต่ไม่ใช่ยาใน drugitems (ตรวจว่าตาราง drugitems ถูกต้อง)':''));
                $st=$hdb->prepare("SELECT o.icode, d.name, d.units, o.qty, o.rxdate, o.vn, o.an FROM opitemrece o INNER JOIN drugitems d ON d.icode=o.icode WHERE o.rxdate BETWEEN ? AND ? LIMIT 5");
                $st->bind_param('ss',$from,$to); $st->execute(); $res=$st->get_result(); $sample=[];
                while ($x=$res->fetch_assoc()) { $x['name']=hosxpText($config,$x['name']); $x['units']=hosxpText($config,$x['units']); $sample[]=$x; }
                $st->close();
                $add('sample',count($sample)>0,'ตัวอย่าง '.count($sample).' แถว (ดูชื่อยาว่าอ่านภาษาไทยได้หรือไม่)',['rows'=>$sample]);
                $custom=trim((string)($config['hosxp']['usage_sql'] ?? ''));
                if ($custom!=='') {
                    try { $st=$hdb->prepare($custom); $st->bind_param('ss',$from,$to); $st->execute(); $n=$st->get_result()->num_rows; $st->close();
                        $add('custom_sql',$n>0,"usage_sql ที่กำหนดเองคืน {$n} แถว".($n===0?' — SQL กำหนดเองน่าจะเป็นสาเหตุ ลองลบให้ว่างเพื่อใช้ค่าเริ่มต้น':''));
                    } catch (Throwable $ce) { $add('custom_sql',false,'usage_sql ผิดพลาด: '.$ce->getMessage()); }
                }
            } else { $add('dates',false,'date_from/date_to ไม่ถูกต้อง'); }
        }
        $hdb->close();
    } catch (Throwable $e) {
        $add('connect',false,'เชื่อมต่อไม่สำเร็จ: '.$e->getMessage());
    }
    logBridge($config,'INFO','HOSXP_DIAG',['uid'=>$actor['uid'],'all_pass'=>$ok]);
    respond(['ok'=>true,'action'=>'hosxp_diag','all_pass'=>$ok,'steps'=>$steps,'bridge_version'=>BRIDGE_VERSION]);
}

// ----------------------------- invs_discover (READ-ONLY) -----------------------------
// ช่วยหาว่า INVS เก็บ "คำค้นหา" และ "ตำแหน่งยา" ไว้ตารางไหน (ชื่อตารางแต่ละเวอร์ชันไม่เหมือนกัน)
if ($action==='invs_discover') {
    $admin=requireAdmin($config,$body);
    $probe=cleanText($body['probe_value'] ?? '');
    try {
        $db=connectDb($config);
        $cols=[]; 
        $res=$db->query("SELECT TABLE_NAME t, COLUMN_NAME c, DATA_TYPE dt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
                          AND (COLUMN_NAME REGEXP 'KEY|SEARCH|WORD|LOCAT|SHELF|RACK|BIN|POSITION' OR TABLE_NAME REGEXP 'key|search|word|locat|shelf|rack')
                          ORDER BY TABLE_NAME, ORDINAL_POSITION");
        while ($r=$res->fetch_assoc()) $cols[]=$r;
        $res->free();
        $hits=[];
        if ($probe!=='') {
            // ค้นค่าตัวอย่าง (เช่น FORTUM) เฉพาะตารางที่มีคอลัมน์รหัสยา และขนาดไม่ใหญ่มาก
            $tables=[];
            $res=$db->query("SELECT c.TABLE_NAME t, c.COLUMN_NAME c FROM information_schema.COLUMNS c JOIN information_schema.TABLES tb ON tb.TABLE_SCHEMA=c.TABLE_SCHEMA AND tb.TABLE_NAME=c.TABLE_NAME
                             WHERE c.TABLE_SCHEMA=DATABASE() AND c.DATA_TYPE IN ('varchar','char','text','tinytext','mediumtext')
                               AND COALESCE(tb.TABLE_ROWS,0) < 300000 AND tb.TABLE_TYPE='BASE TABLE'
                               AND c.TABLE_NAME IN (SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME IN ('WORKING_CODE','TRADE_CODE','DRUG_CODE','ICODE'))
                             ORDER BY c.TABLE_NAME");
            while ($r=$res->fetch_assoc()) $tables[$r['t']][]=$r['c'];
            $res->free();
            $checked=0;
            foreach ($tables as $t=>$cs) {
                if ($checked++>120) break;
                foreach ($cs as $c) {
                    try {
                        $st=$db->prepare('SELECT 1 FROM `'.str_replace('`','',$t).'` WHERE `'.str_replace('`','',$c).'`=? LIMIT 1');
                        $st->bind_param('s',$probe); $st->execute(); $found=(bool)$st->get_result()->fetch_row(); $st->close();
                        if ($found) $hits[]=['table'=>$t,'column'=>$c];
                    } catch (Throwable $ignore) {}
                }
            }
        }
        $db->close();
        respond(['ok'=>true,'action'=>'invs_discover','candidates'=>$cols,'probe_value'=>$probe,'probe_hits'=>$hits,'bridge_version'=>BRIDGE_VERSION]);
    } catch (Throwable $e) {
        if (isset($db) && $db instanceof mysqli) { try { $db->close(); } catch (Throwable $ignore) {} }
        respondError('BRIDGE_ERROR',$e->getMessage(),500);
    }
}

// ----------------------------- invs_extras (READ-ONLY) -----------------------------
// คืนคำค้นหา (keyword) และตำแหน่งยา (location) ต่อ WORKING_CODE เพื่อ sync เข้า master_drugs
// ตั้ง SQL เองได้ใน config: 'invs_extra' => ['keyword_sql'=>..., 'location_sql'=>...] (ต้องคืน working_code + keyword / location)
if ($action==='invs_extras') {
    $admin=requireAdmin($config,$body);
    try {
        $db=connectDb($config);
        $ex=$config['invs_extra'] ?? [];
        $stockId=cleanText(cfg($config,'invs','default_stock_id','10'));
        $detected=['keyword'=>'','location'=>''];
        // --- keyword ---
        $kwSql=trim((string)($ex['keyword_sql'] ?? ''));
        // ชื่อพ้องของ INVS อยู่ในตาราง inst_name (INST_NAME + WORKING_CODE)
        if ($kwSql==='' && tableHasColumn($db,'inst_name','INST_NAME') && tableHasColumn($db,'inst_name','WORKING_CODE')) {
            $kwSql="SELECT TRIM(WORKING_CODE) AS working_code, TRIM(INST_NAME) AS keyword FROM inst_name WHERE INST_NAME IS NOT NULL AND TRIM(INST_NAME)<>''";
            $detected['keyword']='inst_name.INST_NAME';
        }
        if ($kwSql==='') {
            $res=$db->query("SELECT TABLE_NAME t, GROUP_CONCAT(COLUMN_NAME) cols FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() GROUP BY TABLE_NAME
                              HAVING FIND_IN_SET('WORKING_CODE',cols) AND (cols REGEXP 'KEYWORD|KEY_WORD|SEARCH_WORD|SEARCH_KEY|SEARCH_TEXT')");
            while ($r=$res->fetch_assoc()) {
                $kc=null; foreach (explode(',',$r['cols']) as $c) if (preg_match('/KEYWORD|KEY_WORD|SEARCH_WORD|SEARCH_KEY|SEARCH_TEXT/i',$c)) { $kc=$c; break; }
                if ($kc) { $kwSql='SELECT TRIM(WORKING_CODE) AS working_code, TRIM(`'.$kc.'`) AS keyword FROM `'.$r['t'].'` WHERE `'.$kc.'` IS NOT NULL AND TRIM(`'.$kc.'`)<>\'\''; $detected['keyword']=$r['t'].'.'.$kc; break; }
            }
            $res->free();
        } else { $detected['keyword']='config.keyword_sql'; }
        $keywords=[];
        if ($kwSql!=='') { $res=$db->query($kwSql); while ($r=$res->fetch_assoc()) { $wc=cleanText($r['working_code'] ?? ''); $kw=cleanText($r['keyword'] ?? ''); if ($wc!=='' && $kw!=='') $keywords[]=['working_code'=>$wc,'keyword'=>$kw]; } $res->free(); }
        // --- location ---
        $locSql=trim((string)($ex['location_sql'] ?? ''));
        $locFallbackSql='';
        $sidEsc=$db->real_escape_string($stockId);
        // ตาราง location ของ INVS: ตำแหน่งยาต่อคลัง (LOCATION_ID + WORKING_CODE + DEPT_ID) — ใช้ก่อน แล้วเติมที่ขาดจาก lot
        if ($locSql==='' && tableHasColumn($db,'location','LOCATION_ID') && tableHasColumn($db,'location','WORKING_CODE')) {
            $locSql="SELECT TRIM(WORKING_CODE) AS working_code, TRIM(LOCATION_ID) AS location FROM location WHERE LOCATION_ID IS NOT NULL AND TRIM(LOCATION_ID)<>''"
                .(tableHasColumn($db,'location','DEPT_ID') ? " AND DEPT_ID='{$sidEsc}'" : '')." ORDER BY working_code";
            $detected['location']="location.LOCATION_ID (คลัง {$stockId})";
            if (tableHasColumn($db,'inv_md_c','LOCATION')) {
                $locFallbackSql="SELECT TRIM(WORKING_CODE) AS working_code, TRIM(LOCATION) AS location, SUM(COALESCE(QTY_ON_HAND,0)) AS qty
                         FROM inv_md_c WHERE DEPT_ID='{$sidEsc}' AND LOCATION IS NOT NULL AND TRIM(LOCATION)<>''
                         GROUP BY TRIM(WORKING_CODE), TRIM(LOCATION) ORDER BY working_code, qty DESC";
                $detected['location'].=' + inv_md_c.LOCATION';
            }
        }
        if ($locSql==='') {
            if (tableHasColumn($db,'inv_md_c','LOCATION')) {
                // ตำแหน่งจาก lot ในคลังจ่าย: ใช้ตำแหน่งของ lot ที่ยังมีของมากที่สุด
                $sid=$db->real_escape_string($stockId);
                $locSql="SELECT TRIM(WORKING_CODE) AS working_code, TRIM(LOCATION) AS location, SUM(COALESCE(QTY_ON_HAND,0)) AS qty
                         FROM inv_md_c WHERE DEPT_ID='{$sid}' AND LOCATION IS NOT NULL AND TRIM(LOCATION)<>''
                         GROUP BY TRIM(WORKING_CODE), TRIM(LOCATION) ORDER BY working_code, qty DESC";
                $detected['location']="inv_md_c.LOCATION (คลัง {$stockId})";
            }
        } else { $detected['location']='config.location_sql'; }
        $locations=[]; $seen=[];
        foreach (array_filter([$locSql,$locFallbackSql]) as $q) {
            $res=$db->query($q);
            while ($r=$res->fetch_assoc()) { $wc=cleanText($r['working_code'] ?? ''); $lc=cleanText($r['location'] ?? ''); if ($wc==='' || $lc==='' || isset($seen[$wc])) continue; $seen[$wc]=true; $locations[]=['working_code'=>$wc,'location'=>$lc]; }
            $res->free();
        }
        $db->close();
        logBridge($config,'INFO','INVS_EXTRAS',['admin_uid'=>$admin['uid'],'keywords'=>count($keywords),'locations'=>count($locations),'detected'=>$detected]);
        respond(['ok'=>true,'action'=>'invs_extras','detected'=>$detected,'keywords'=>$keywords,'locations'=>$locations,'bridge_version'=>BRIDGE_VERSION]);
    } catch (Throwable $e) {
        if (isset($db) && $db instanceof mysqli) { try { $db->close(); } catch (Throwable $ignore) {} }
        respondError('BRIDGE_ERROR',$e->getMessage(),500);
    }
}

// ----------------------------- hosxp_usage -----------------------------
// ยอดใช้ยาจาก HOSxP ช่วงวันที่ที่กำหนด แยก OPD (an ว่าง) / IPD (an มีค่า) จาก opitemrece
if ($action==='hosxp_usage') {
    $actor=requireRoles($config,$body,['admin','pharmacy']);
    $from=cleanText($body['date_from'] ?? ''); $to=cleanText($body['date_to'] ?? '');
    if (!validDateYmd($from) || !validDateYmd($to)) respondError('DATE_INVALID','date_from / date_to ต้องเป็นรูปแบบ YYYY-MM-DD',400);
    if ($from>$to) respondError('DATE_INVALID','วันเริ่มต้องไม่เกินวันสิ้นสุด',400);
    $days=(int)((strtotime($to)-strtotime($from))/86400)+1;
    if ($days>400) respondError('DATE_RANGE_TOO_LONG','ช่วงวันที่ยาวเกิน 400 วัน',400);
    try {
        $hdb=connectHosxp($config);
        $customSql=trim((string)($config['hosxp']['usage_sql'] ?? ''));
        $sql=$customSql!=='' ? $customSql : "SELECT o.icode,
                 SUM(CASE WHEN COALESCE(o.an,'')='' THEN o.qty ELSE 0 END) AS opd_qty,
                 SUM(CASE WHEN COALESCE(o.an,'')<>'' THEN o.qty ELSE 0 END) AS ipd_qty,
                 SUM(CASE WHEN COALESCE(o.an,'')='' THEN 1 ELSE 0 END) AS opd_rx,
                 SUM(CASE WHEN COALESCE(o.an,'')<>'' THEN 1 ELSE 0 END) AS ipd_rx,
                 MAX(d.name) AS name, MAX(d.strength) AS strength, MAX(d.units) AS units
               FROM opitemrece o
               INNER JOIN drugitems d ON d.icode=o.icode
               WHERE o.rxdate BETWEEN ? AND ?
               GROUP BY o.icode";
        // date_mode: 'ce' = วันที่เป็น ค.ศ. (มาตรฐาน HOSxP), 'be' = เป็น พ.ศ., 'auto' = ลอง ค.ศ. ก่อน ถ้าไม่พบให้ลอง พ.ศ.
        $dateMode=strtolower(cleanText($config['hosxp']['date_mode'] ?? 'auto')) ?: 'auto';
        $runUsage=function(string $f,string $t) use ($hdb,$sql) { $st=$hdb->prepare($sql); $st->bind_param('ss',$f,$t); $st->execute(); $res=$st->get_result(); $out=[]; while ($r=$res->fetch_assoc()) $out[]=$r; $st->close(); return $out; };
        $usedMode='ce';
        if ($dateMode==='be') { $raw=$runUsage(shiftYears($from,543),shiftYears($to,543)); $usedMode='be'; }
        else {
            $raw=$runUsage($from,$to);
            if (!$raw && $dateMode==='auto') { $raw=$runUsage(shiftYears($from,543),shiftYears($to,543)); if ($raw) $usedMode='be'; }
        }
        $rows=[];
        foreach ($raw as $r) {
            $icode=cleanText($r['icode'] ?? ''); if ($icode==='') continue;
            $opd=finiteNumber($r['opd_qty'] ?? 0); $ipd=finiteNumber($r['ipd_qty'] ?? 0);
            $rows[]=[
                'icode'=>$icode,'name'=>hosxpText($config,$r['name'] ?? ''),'strength'=>hosxpText($config,$r['strength'] ?? ''),'units'=>hosxpText($config,$r['units'] ?? ''),
                'opd_qty'=>$opd,'ipd_qty'=>$ipd,'total_qty'=>$opd+$ipd,'opd_rx'=>(int)($r['opd_rx'] ?? 0),'ipd_rx'=>(int)($r['ipd_rx'] ?? 0)
            ];
        }
        $hdb->close();
        logBridge($config,'INFO','HOSXP_USAGE',['uid'=>$actor['uid'],'role'=>$actor['role'],'from'=>$from,'to'=>$to,'rows'=>count($rows)]);
        respond(['ok'=>true,'action'=>'hosxp_usage','date_from'=>$from,'date_to'=>$to,'days'=>$days,'count'=>count($rows),'rows'=>$rows,'custom_sql'=>$customSql!=='','date_mode'=>$dateMode,'date_mode_used'=>$usedMode,'bridge_version'=>BRIDGE_VERSION]);
    } catch (Throwable $e) {
        if (isset($hdb) && $hdb instanceof mysqli) { try { $hdb->close(); } catch (Throwable $ignore) {} }
        logBridge($config,'ERROR','HOSXP_USAGE_FAILED',['uid'=>$actor['uid'] ?? '','error'=>$e->getMessage()]);
        respondError('HOSXP_ERROR','ดึงยอดใช้จาก HOSxP ไม่สำเร็จ: '.$e->getMessage(),500);
    }
}

$reqId=cleanText($body['requisition_id'] ?? '');
if ($reqId==='') respondError('REQ_ID_REQUIRED','ไม่พบ requisition_id',400);
// source=internal → ใบเบิกหน่วยงาน/ห้องยาภายใน รพ. (internal_requisitions + master_depts)
$isInternal=cleanText($body['source'] ?? '')==='internal';
$reqCol=$isInternal ? 'internal_requisitions' : 'requisitions';
$unitCol=$isInternal ? 'master_depts' : 'master_hospitals';

$admin=requireAdmin($config,$body);
$project=(string)cfg($config,'firebase','project_id','sawee-rxfill');
try {
    $req=getFirestoreDoc($project,$reqCol,$reqId,$admin['access_token']);
    if (!$req) respondError('REQ_NOT_FOUND','ไม่พบใบเบิกใน Firestore ('.$reqCol.')',404);
    $hospitalId=cleanText($req[$isInternal ? 'deptId' : 'hospitalId'] ?? '');
    if ($hospitalId==='') throw new RuntimeException('ใบเบิกไม่มี '.($isInternal ? 'deptId' : 'hospitalId'));
    $hospital=getFirestoreDoc($project,$unitCol,$hospitalId,$admin['access_token']);
    if (!$hospital) throw new RuntimeException("ไม่พบ {$unitCol}/{$hospitalId}");

    $db=connectDb($config);
    $marker=makeMarker($reqId);
    $existing=getExistingByMarker($db,$marker);
    if ($existing && strtoupper(cleanText($existing['SEND_FLAG'] ?? ''))==='Y') {
        $details=loadExistingDetails($db,(string)$existing['SUB_PO_NO']);
        $repairWarning='';
        try {
            patchFirestoreDoc($project,$reqCol,$reqId,[
                'invs_status'=>'SENT','invs_sub_po_no'=>(string)$existing['SUB_PO_NO'],'invs_ref_marker'=>$marker,
                'invs_recovered_at'=>gmdate('Y-m-d\TH:i:s\Z'),'invs_recovered_by_uid'=>$admin['uid'],'invs_recovered_by_name'=>$admin['name'],
                'invs_total_item'=>(int)($existing['TOTAL_ITEM'] ?? count($details)),'invs_total_cost'=>finiteNumber($existing['TOTAL_COST'] ?? 0),'invs_total_value'=>finiteNumber($existing['TOTAL_VALUE'] ?? 0),'invs_bridge_version'=>BRIDGE_VERSION
            ],$admin['access_token']);
        } catch (Throwable $repairErr) { $repairWarning='; แต่ซ่อมสถานะ Firestore ไม่สำเร็จ: '.$repairErr->getMessage(); }
        $payload=['ok'=>true,'already_sent'=>true,'sub_po_no'=>(string)$existing['SUB_PO_NO'],'marker'=>$marker,'item_count'=>count($details),'total_cost'=>finiteNumber($existing['TOTAL_COST'] ?? 0),'total_value'=>finiteNumber($existing['TOTAL_VALUE'] ?? 0),'items'=>$details,'warnings'=>['ใบเบิกนี้ถูกส่งเข้า INVS ไปแล้ว ระบบจะไม่สร้างซ้ำ'.$repairWarning],'errors'=>[],'bridge_version'=>BRIDGE_VERSION,'live_send_enabled'=>!empty($config['bridge']['allow_live_send'])];
        $db->close(); respond($payload);
    }

    $pre=buildPreflight($db,$config,$req,$hospital);
    $pre['marker']=$marker; $pre['requisition_id']=$reqId; $pre['hospital_id']=$hospitalId; $pre['bridge_version']=BRIDGE_VERSION; $pre['live_send_enabled']=!empty($config['bridge']['allow_live_send']);
    if ($action==='preflight') { $db->close(); logBridge($config,'INFO','PREFLIGHT',['req_id'=>$reqId,'admin_uid'=>$admin['uid'],'ok'=>$pre['ok'],'errors'=>$pre['errors']]); respond($pre); }

    if (!empty($pre['already_sent'])) { $db->close(); respond($pre); }
    if (!$pre['ok']) { $db->close(); respondError('PREFLIGHT_FAILED','ยังส่งเข้า INVS ไม่ได้ กรุณาแก้รายการที่แจ้งก่อน',409,$pre); }
    if (empty($config['bridge']['allow_live_send'])) { $db->close(); respondError('LIVE_DISABLED','Dry-run ผ่านแล้ว แต่ config.php ยังตั้ง allow_live_send=false',409,$pre); }

    // Re-check existing marker immediately before live write.
    $existing=getExistingByMarker($db,$marker);
    if ($existing) {
        $sent=strtoupper(cleanText($existing['SEND_FLAG'] ?? ''))==='Y';
        $confirmed=strtoupper(cleanText($existing['CONFIRM_FLAG'] ?? ''))==='Y';
        if ($sent || $confirmed) {
            $sub=(string)$existing['SUB_PO_NO']; $details=loadExistingDetails($db,$sub); $db->close();
            respond(['ok'=>true,'already_sent'=>true,'sub_po_no'=>$sub,'marker'=>$marker,'item_count'=>count($details),'items'=>$details,'warnings'=>['พบรายการเดิมจาก marker จึงไม่สร้างซ้ำ'],'errors'=>[],'bridge_version'=>BRIDGE_VERSION]);
        }
        cleanupOwnPartial($db,(string)$existing['SUB_PO_NO'],$marker);
    }

    $userId=cleanText(cfg($config,'invs','user_id',''));
    if ($userId==='') throw new RuntimeException('config.php ยังไม่ได้ตั้ง invs.user_id');
    $header=[
        'dept_id'=>$pre['dept_id'],'stock_id'=>$pre['stock_id'],'user_id'=>$userId,'req_date'=>$pre['request_date'],
        'total_item'=>(float)$pre['item_count'],'total_cost'=>(float)$pre['total_cost'],'total_value'=>(float)$pre['total_value'],
        'mod_sys'=>cleanText(cfg($config,'invs','mod_sys','MED')) ?: 'MED','marker'=>$marker
    ];

    $subPoNo='';
    try {
        logBridge($config,'INFO','SEND_START',['req_id'=>$reqId,'admin_uid'=>$admin['uid'],'hospital_id'=>$hospitalId,'marker'=>$marker,'items'=>$pre['item_count']]);
        $subPoNo=generateSubPoNoAndInsertHeader($db,$header);
        insertDetails($db,$config,$subPoNo,$pre['items'],$pre['request_date']);

        $st=$db->prepare('SELECT COUNT(*) c, COALESCE(SUM(VALUE),0) v FROM sm_po_c WHERE SUB_PO_NO=?');
        $st->bind_param('s',$subPoNo); $st->execute(); $vr=$st->get_result()->fetch_assoc(); $st->close();
        $count=(int)($vr['c'] ?? 0); $value=round(finiteNumber($vr['v'] ?? 0),2);
        if ($count!==(int)$pre['item_count']) throw new RuntimeException("ตรวจย้อนกลับไม่ผ่าน: detail {$count}/{$pre['item_count']}");
        if (abs($value-(float)$pre['total_value'])>0.01) throw new RuntimeException("ตรวจยอดไม่ผ่าน: DB {$value} / expected {$pre['total_value']}");
        $st=$db->prepare("UPDATE sm_po SET SEND_FLAG='Y' WHERE SUB_PO_NO=? AND REF_NO=? AND CONFIRM_FLAG='N'");
        $st->bind_param('ss',$subPoNo,$marker); $st->execute(); if ($st->affected_rows!==1) throw new RuntimeException('ตั้ง SEND_FLAG=Y ไม่สำเร็จ'); $st->close();
    } catch (Throwable $writeErr) {
        if ($subPoNo!=='') {
            try { cleanupOwnPartial($db,$subPoNo,$marker); } catch (Throwable $cleanupErr) { logBridge($config,'ERROR','CLEANUP_FAILED',['sub_po_no'=>$subPoNo,'error'=>$cleanupErr->getMessage()]); }
        }
        throw $writeErr;
    }

    $snapshot=array_map(fn($x)=>[
        'drug_id'=>$x['drug_id'],'qty'=>$x['qty'],'invs_lot_record_number'=>(int)$x['lot_record'],'lot_no'=>$x['lot_no'],'expiry'=>$x['expiry'],'pack_ratio'=>$x['pack_ratio'],'cost'=>$x['cost'],'pack_cost'=>$x['pack_cost'],'value'=>$x['value']
    ],$pre['items']);
    $firestoreWarning='';
    try {
        patchFirestoreDoc($project,$reqCol,$reqId,[
            'invs_status'=>'SENT','invs_sub_po_no'=>$subPoNo,'invs_ref_marker'=>$marker,
            'invs_sent_at'=>gmdate('Y-m-d\TH:i:s\Z'),'invs_sent_by_uid'=>$admin['uid'],'invs_sent_by_name'=>$admin['name'],
            'invs_dept_id'=>$pre['dept_id'],'invs_stock_id'=>$pre['stock_id'],'invs_total_item'=>(int)$pre['item_count'],
            'invs_total_cost'=>(float)$pre['total_cost'],'invs_total_value'=>(float)$pre['total_value'],'invs_bridge_version'=>BRIDGE_VERSION,
            'invs_items_snapshot'=>$snapshot,'invs_request_lot_snapshot'=>$snapshot
        ],$admin['access_token']);
    } catch (Throwable $fsErr) {
        $firestoreWarning='ส่ง INVS สำเร็จ แต่บันทึกสถานะกลับ Firestore ไม่สำเร็จ: '.$fsErr->getMessage();
        logBridge($config,'ERROR','FIRESTORE_MARK_FAILED',['req_id'=>$reqId,'sub_po_no'=>$subPoNo,'error'=>$fsErr->getMessage()]);
    }
    try {
        $auditId='INVS_SEND_'.strtoupper(substr(sha1($reqId),0,20));
        patchFirestoreDoc($project,'audit_logs',$auditId,[
            'action'=>'REQUISITION_INVS_SEND','target_type'=>$reqCol,'target_id'=>$reqId,
            'actor_uid'=>$admin['uid'],'actor_name'=>$admin['name'],'actor_role'=>'admin','actor_hospital_id'=>'',
            'details'=>['source'=>$isInternal?'internal':'rpst','hospital_id'=>$hospitalId,'sub_po_no'=>$subPoNo,'dept_id'=>$pre['dept_id'],'stock_id'=>$pre['stock_id'],'item_count'=>(int)$pre['item_count'],'total_value'=>(float)$pre['total_value'],'bridge_version'=>BRIDGE_VERSION],
            'schema_version'=>17,'created_at'=>gmdate('Y-m-d\TH:i:s\Z')
        ],$admin['access_token']);
    } catch (Throwable $auditErr) {
        logBridge($config,'WARN','AUDIT_FIRESTORE_FAILED',['req_id'=>$reqId,'sub_po_no'=>$subPoNo,'error'=>$auditErr->getMessage()]);
    }

    $details=loadExistingDetails($db,$subPoNo); $db->close();
    logBridge($config,'INFO','SEND_SUCCESS',['req_id'=>$reqId,'sub_po_no'=>$subPoNo,'admin_uid'=>$admin['uid'],'item_count'=>count($details),'total_value'=>$pre['total_value']]);
    $warnings=$pre['warnings']; if ($firestoreWarning!=='') $warnings[]=$firestoreWarning;
    respond(array_merge($pre,['ok'=>true,'already_sent'=>false,'sub_po_no'=>$subPoNo,'items'=>$pre['items'],'warnings'=>$warnings,'errors'=>[],'bridge_version'=>BRIDGE_VERSION]));

} catch (Throwable $e) {
    if (isset($db) && $db instanceof mysqli) { try { $db->close(); } catch (Throwable $ignore) {} }
    logBridge($config,'ERROR','REQUEST_FAILED',['action'=>$action,'req_id'=>$reqId,'admin_uid'=>$admin['uid'] ?? '','error'=>$e->getMessage()]);
    respondError('BRIDGE_ERROR',$e->getMessage(),500);
}
