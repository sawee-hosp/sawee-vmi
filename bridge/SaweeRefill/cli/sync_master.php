<?php
/**
 * Sawee Rxfill - INVS Master Drug Sync v1.5 Integrated
 * ------------------------------------------------------------
 * Source of truth from INVS:
 *   - price
 *   - pack_size
 *   - unit_id / unit_name (sale_unit)
 *
 * App-owned fields are NEVER overwritten for existing drugs:
 *   - status
 *   - fuzzy
 *   - unpacked
 *   - dispense_step
 *   - usage_multiplier
 *   - type
 *   - drug_name (existing display name is preserved; INVS name is stored separately)
 *
 * New INVS drugs are created automatically with safe defaults and
 * needs_vmi_setup=true so Admin can review App-owned VMI settings.
 *
 * CLI:
 *   TEST: php sync_master.php
 *   LIVE: php sync_master.php --live
 */

declare(strict_types=1);
date_default_timezone_set('Asia/Bangkok');

const SYNC_VERSION = '1.6.0-integrated';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

$baseDir = __DIR__;
$configFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'config.php';

if (!file_exists($configFile)) {
    fwrite(STDERR, "ERROR: private/config.php not found\n");
    exit(1);
}

$config = require $configFile;
$liveRequested = in_array('--live', $argv ?? [], true);
$isLive = $liveRequested && !empty($config['sync']['allow_live']);
$logFile = (string)($config['sync']['log_file'] ?? ($baseDir . DIRECTORY_SEPARATOR . 'sync_master.log'));

function logLine(string $level, string $message): void {
    global $logFile;
    $line = date('Y-m-d H:i:s') . " | {$level} | {$message}";
    echo $line . PHP_EOL;
    @file_put_contents($logFile, $line . PHP_EOL, FILE_APPEND);
}

function failNow(string $message, int $code = 1): never {
    logLine('ERROR', $message);
    exit($code);
}

foreach (['mysqli', 'curl', 'openssl', 'json'] as $ext) {
    if (!extension_loaded($ext)) failNow("PHP extension '{$ext}' is not enabled");
}

if ($liveRequested && empty($config['sync']['allow_live'])) {
    failNow('LIVE blocked because config.php allow_live=false', 2);
}

function cfg(array $config, string $group, string $key, mixed $default = null): mixed {
    return $config[$group][$key] ?? $default;
}

function validateConfig(array $config): void {
    foreach ([
        ['mysql','host'], ['mysql','user'], ['mysql','password'], ['mysql','database'],
        ['firebase','project_id'], ['firebase','service_account_json']
    ] as [$a,$b]) {
        $v = trim((string)cfg($config,$a,$b,''));
        if ($v === '') failNow("config.php missing {$a}.{$b}");
        if (str_contains($v, 'PUT_')) failNow("config.php still contains placeholder {$a}.{$b}");
    }
}
validateConfig($config);

$serviceAccountPath = (string)cfg($config,'firebase','service_account_json','');
if (!file_exists($serviceAccountPath)) failNow("serviceAccountKey.json not found: {$serviceAccountPath}");

function b64url(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function getAccessToken(string $serviceAccountPath): string {
    $raw = file_get_contents($serviceAccountPath);
    $key = json_decode((string)$raw, true);
    if (!is_array($key) || empty($key['client_email']) || empty($key['private_key'])) {
        failNow('Invalid serviceAccountKey.json');
    }

    $now = time();
    $header = ['alg'=>'RS256','typ'=>'JWT'];
    $claims = [
        'iss'=>$key['client_email'],
        'scope'=>FIRESTORE_SCOPE,
        'aud'=>GOOGLE_TOKEN_URL,
        'iat'=>$now,
        'exp'=>$now + 3600,
    ];

    $unsigned = b64url(json_encode($header, JSON_UNESCAPED_SLASHES)) . '.'
              . b64url(json_encode($claims, JSON_UNESCAPED_SLASHES));

    $pk = openssl_pkey_get_private($key['private_key']);
    if ($pk === false) failNow('Cannot open service-account private key');

    $sig = '';
    if (!openssl_sign($unsigned, $sig, $pk, OPENSSL_ALGO_SHA256)) {
        failNow('Cannot sign Google OAuth JWT');
    }

    $jwt = $unsigned . '.' . b64url($sig);

    $ch = curl_init(GOOGLE_TOKEN_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'=>$jwt,
        ]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 30,
    ]);
    $body = curl_exec($ch);
    if ($body === false) {
        $err = curl_error($ch); curl_close($ch);
        failNow("Google OAuth error: {$err}");
    }
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $json = json_decode($body, true);
    if ($http < 200 || $http >= 300 || empty($json['access_token'])) {
        failNow("Google OAuth HTTP {$http}: {$body}");
    }
    return (string)$json['access_token'];
}

function httpJson(string $method, string $url, string $accessToken, ?array $payload=null): array {
    $ch = curl_init($url);
    $headers = ['Authorization: Bearer '.$accessToken, 'Accept: application/json'];
    if ($payload !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 90,
    ]);
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
    }
    $body = curl_exec($ch);
    if ($body === false) {
        $err = curl_error($ch); curl_close($ch);
        throw new RuntimeException($err);
    }
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $decoded = json_decode((string)$body, true);
    return ['status'=>$http, 'body'=>is_array($decoded)?$decoded:[], 'raw'=>(string)$body];
}

function fsValue(?array $v): mixed {
    if (!$v) return null;
    foreach (['doubleValue','integerValue','stringValue','booleanValue','timestampValue'] as $k) {
        if (array_key_exists($k,$v)) return $v[$k];
    }
    return null;
}

function fsString(string $v): array { return ['stringValue'=>$v]; }
function fsBool(bool $v): array { return ['booleanValue'=>$v]; }
function fsNumber(float|int $v): array {
    if (is_int($v) || abs((float)$v - round((float)$v)) < 0.0000001) {
        return ['integerValue'=>(string)(int)round((float)$v)];
    }
    return ['doubleValue'=>(float)$v];
}
function fsTimestampNow(): array { return ['timestampValue'=>gmdate('Y-m-d\TH:i:s\Z')]; }

function firestoreCollectionBase(string $projectId, string $collection): string {
    return 'projects/' . rawurlencode($projectId) . '/databases/(default)/documents/' . rawurlencode($collection);
}

function loadCollection(string $projectId, string $collection, string $accessToken): array {
    $byId = [];
    $pageToken = null;
    do {
        $url = 'https://firestore.googleapis.com/v1/' . firestoreCollectionBase($projectId,$collection) . '?pageSize=1000';
        if ($pageToken) $url .= '&pageToken=' . rawurlencode($pageToken);
        $res = httpJson('GET',$url,$accessToken);
        if ($res['status'] < 200 || $res['status'] >= 300) {
            throw new RuntimeException("Load {$collection} failed HTTP {$res['status']}: {$res['raw']}");
        }
        foreach (($res['body']['documents'] ?? []) as $doc) {
            $docName = (string)($doc['name'] ?? '');
            $docId = rawurldecode(basename($docName));
            $fields = $doc['fields'] ?? [];
            $byId[$docId] = ['doc_name'=>$docName,'doc_id'=>$docId,'fields'=>$fields];
        }
        $pageToken = $res['body']['nextPageToken'] ?? null;
    } while ($pageToken);
    logLine('INFO', "Loaded Firestore {$collection}: ".count($byId).' documents');
    return $byId;
}

function patchDocument(string $docName, array $encodedFields, string $accessToken, bool $mustExist=true): void {
    if (!$encodedFields) return;
    $q = [];
    foreach (array_keys($encodedFields) as $field) {
        $q[] = 'updateMask.fieldPaths=' . rawurlencode($field);
    }
    $q[] = 'currentDocument.exists=' . ($mustExist ? 'true' : 'false');
    $url = 'https://firestore.googleapis.com/v1/' . $docName . '?' . implode('&',$q);
    $res = httpJson('PATCH',$url,$accessToken,['fields'=>$encodedFields]);
    if ($res['status'] < 200 || $res['status'] >= 300) {
        throw new RuntimeException("Firestore PATCH HTTP {$res['status']}: {$res['raw']}");
    }
}

function connectInvs(array $cfg): mysqli {
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
    $db = mysqli_init();
    if (!$db) failNow('mysqli_init failed');
    $db->options(MYSQLI_OPT_CONNECT_TIMEOUT, (int)($cfg['connect_timeout'] ?? 15));
    try {
        $db->real_connect(
            (string)$cfg['host'], (string)$cfg['user'], (string)$cfg['password'],
            (string)$cfg['database'], (int)($cfg['port'] ?? 3306)
        );
        $db->set_charset((string)($cfg['charset'] ?? 'utf8mb4'));
    } catch (Throwable $e) {
        failNow('Cannot connect INVS MySQL: '.$e->getMessage());
    }
    return $db;
}

function getTableColumns(mysqli $db, string $table): array {
    $stmt = $db->prepare("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION");
    $stmt->bind_param('s',$table);
    $stmt->execute();
    $res = $stmt->get_result();
    $out = [];
    while ($r = $res->fetch_assoc()) $out[strtoupper((string)$r['COLUMN_NAME'])] = (string)$r['COLUMN_NAME'];
    $stmt->close();
    return $out;
}

function qi(string $identifier): string {
    return '`' . str_replace('`','``',$identifier) . '`';
}

/**
 * Detect how drug_gn references sale_unit.
 * Primary expected schema: drug_gn.SU_ID -> sale_unit.SU_ID.
 * Other fallbacks are included for INVS variants.
 */
function detectUnitJoin(mysqli $db): array {
    $cols = getTableColumns($db,'drug_gn');
    if (!$cols) failNow('Table drug_gn not found or has no readable columns');

    $candidates = [
        ['SU_ID','id'],
        ['SALE_UNIT_ID','id'],
        ['UNIT_ID','id'],
        ['SU_ID_EX','external'],
        ['SALE_UNIT','name'],
    ];
    foreach ($candidates as [$candidate,$mode]) {
        if (!isset($cols[$candidate])) continue;
        $actual = $cols[$candidate];
        if ($mode === 'id') {
            return [
                'description'=>"drug_gn.{$actual} -> sale_unit.SU_ID",
                'join'=>"LEFT JOIN sale_unit su ON su.SU_ID = g.".qi($actual),
                'source_column'=>$actual
            ];
        }
        if ($mode === 'external') {
            return [
                'description'=>"drug_gn.{$actual} -> sale_unit.SU_ID_EX",
                'join'=>"LEFT JOIN sale_unit su ON TRIM(su.SU_ID_EX) = TRIM(g.".qi($actual).")",
                'source_column'=>$actual
            ];
        }
        return [
            'description'=>"drug_gn.{$actual} -> sale_unit.SALE_UNIT",
            'join'=>"LEFT JOIN sale_unit su ON su.SU_ID = (SELECT MIN(su2.SU_ID) FROM sale_unit su2 WHERE TRIM(su2.SALE_UNIT)=TRIM(g.".qi($actual)."))",
            'source_column'=>$actual
        ];
    }

    failNow('Cannot find unit-link column in drug_gn. Expected one of: SU_ID, SALE_UNIT_ID, UNIT_ID, SU_ID_EX, SALE_UNIT. Columns found: '.implode(', ',array_values($cols)));
}

function parsePositiveNumber(mixed $v): ?float {
    $s = trim(str_replace(',','',(string)$v));
    if ($s === '' || !is_numeric($s)) return null;
    $n = (float)$s;
    return $n > 0 ? $n : null;
}

function numbersDifferent(float $a, float $b, float $epsilon): bool {
    return abs($a-$b) >= $epsilon;
}

function normalizedText(mixed $v): string { return trim((string)($v ?? '')); }

function buildInvsMasterSql(string $unitJoin): string {
    return <<<SQL
SELECT
    TRIM(g.WORKING_CODE) AS drug_id,
    g.DRUG_NAME AS invs_drug_name,
    CAST(su.SU_ID AS CHAR) AS unit_id,
    su.SALE_UNIT AS unit_name,
    su.SU_ID_EX AS unit_id_ex,

    COALESCE(
        NULLIF((
            SELECT pr2.PACK_RATIO
            FROM pack_ratio pr2
            WHERE TRIM(pr2.WORKING_CODE)=TRIM(g.WORKING_CODE)
              AND (pr2.HIDE IS NULL OR TRIM(pr2.HIDE) NOT IN ('Y','1'))
              AND pr2.PACK_RATIO IS NOT NULL AND pr2.PACK_RATIO > 0
            ORDER BY CASE WHEN pr2.LAST_BUY IS NULL THEN 1 ELSE 0 END,
                     pr2.LAST_BUY DESC,
                     pr2.PACK_RATIO DESC
            LIMIT 1
        ),0),
        NULLIF(lc.ACTIVE_PACK,0),
        NULLIF(st.stock_pack_ratio,0),
        1
    ) AS pack_size,

    ROUND(
        CASE
            WHEN lc.VALUE IS NOT NULL AND lc.VALUE > 0
                 AND lc.ACTIVE_QTY IS NOT NULL AND lc.ACTIVE_QTY > 0
                 AND lc.ACTIVE_PACK IS NOT NULL AND lc.ACTIVE_PACK > 0
                THEN (lc.VALUE / lc.ACTIVE_QTY) * lc.ACTIVE_PACK
            WHEN lc.PACK_COST IS NOT NULL AND lc.PACK_COST > 0
                THEN lc.PACK_COST
            WHEN lc.VALUE IS NOT NULL AND lc.VALUE > 0
                 AND lc.ACTIVE_PACK IS NOT NULL AND lc.ACTIVE_PACK > 0
                THEN (lc.VALUE / lc.ACTIVE_PACK)
            WHEN pr.BUY_UNIT_COST IS NOT NULL AND pr.BUY_UNIT_COST > 0
                THEN pr.BUY_UNIT_COST
            WHEN lc.COST IS NOT NULL AND lc.COST > 0
                THEN lc.COST * COALESCE(NULLIF(lc.ACTIVE_PACK,0),NULLIF(pr.PACK_RATIO,0),NULLIF(st.stock_pack_ratio,0),1)
            WHEN st.stock_lot_cost IS NOT NULL AND st.stock_lot_cost > 0
                THEN st.stock_lot_cost
            WHEN any_c.PACK_COST IS NOT NULL AND any_c.PACK_COST > 0
                THEN any_c.PACK_COST
            WHEN any_c.COST IS NOT NULL AND any_c.COST > 0
                THEN any_c.COST * COALESCE(NULLIF(any_c.ACTIVE_PACK,0),NULLIF(pr.PACK_RATIO,0),NULLIF(st.stock_pack_ratio,0),1)
            WHEN g.LAST_BUY_COST IS NOT NULL AND g.LAST_BUY_COST > 0
                THEN g.LAST_BUY_COST * COALESCE(NULLIF(pr.PACK_RATIO,0),NULLIF(st.stock_pack_ratio,0),1)
            ELSE 0
        END, 2
    ) AS price,

    COALESCE(lc.OPERATE_DATE, pr.LAST_BUY, any_c.OPERATE_DATE) AS last_datetime

FROM drug_gn g
{$unitJoin}

LEFT JOIN (
    SELECT c1.*
    FROM card c1
    INNER JOIN (
        SELECT TRIM(WORKING_CODE) AS WORKING_CODE, MAX(RECORD_NUMBER) AS max_rec_id
        FROM card
        WHERE (CANCEL_FLAG IS NULL OR TRIM(CANCEL_FLAG) NOT IN ('Y','1'))
          AND TRIM(R_S_STATUS)='R'
          AND ((VALUE IS NOT NULL AND VALUE>0) OR (PACK_COST IS NOT NULL AND PACK_COST>0) OR (COST IS NOT NULL AND COST>0))
        GROUP BY TRIM(WORKING_CODE)
    ) c2 ON c1.RECORD_NUMBER=c2.max_rec_id AND TRIM(c1.WORKING_CODE)=c2.WORKING_CODE
) lc ON TRIM(g.WORKING_CODE)=lc.WORKING_CODE

LEFT JOIN (
    SELECT TRIM(WORKING_CODE) AS WORKING_CODE,
           MAX(NULLIF(LOT_COST,0)) AS stock_lot_cost,
           MAX(NULLIF(PACK_RATIO,0)) AS stock_pack_ratio
    FROM inv_md_c
    GROUP BY TRIM(WORKING_CODE)
) st ON TRIM(g.WORKING_CODE)=st.WORKING_CODE

LEFT JOIN (
    SELECT c1.*
    FROM card c1
    INNER JOIN (
        SELECT TRIM(WORKING_CODE) AS WORKING_CODE, MAX(RECORD_NUMBER) AS max_rec_id
        FROM card
        WHERE (CANCEL_FLAG IS NULL OR TRIM(CANCEL_FLAG) NOT IN ('Y','1'))
          AND ((PACK_COST IS NOT NULL AND PACK_COST>0) OR (COST IS NOT NULL AND COST>0) OR (VALUE IS NOT NULL AND VALUE>0))
        GROUP BY TRIM(WORKING_CODE)
    ) c2 ON c1.RECORD_NUMBER=c2.max_rec_id AND TRIM(c1.WORKING_CODE)=c2.WORKING_CODE
) any_c ON TRIM(g.WORKING_CODE)=any_c.WORKING_CODE

LEFT JOIN (
    SELECT TRIM(WORKING_CODE) AS WORKING_CODE,
           MAX(BUY_UNIT_COST) AS BUY_UNIT_COST,
           MAX(NULLIF(PACK_RATIO,0)) AS PACK_RATIO,
           MAX(LAST_BUY) AS LAST_BUY
    FROM pack_ratio
    WHERE (HIDE IS NULL OR TRIM(HIDE) NOT IN ('Y','1'))
      AND ((BUY_UNIT_COST IS NOT NULL AND BUY_UNIT_COST>0) OR (PACK_RATIO IS NOT NULL AND PACK_RATIO>0))
    GROUP BY TRIM(WORKING_CODE)
) pr ON TRIM(g.WORKING_CODE)=pr.WORKING_CODE

WHERE (g.HIDE IS NULL OR TRIM(g.HIDE) NOT IN ('Y','1'))
ORDER BY TRIM(g.WORKING_CODE) ASC
SQL;
}

function docField(array $doc, string $field): mixed {
    return fsValue($doc['fields'][$field] ?? null);
}

/* =============================== MAIN =============================== */
logLine('INFO','============================================================');
logLine('INFO','Sawee Rxfill INVS Master Sync v'.SYNC_VERSION.' START');
logLine('INFO',$isLive ? 'MODE=LIVE' : 'MODE=TEST / DRY RUN (no Firestore write)');

$projectId = trim((string)cfg($config,'firebase','project_id','sawee-rxfill'));
$drugCollection = trim((string)cfg($config,'firebase','collection','master_drugs'));
$unitCollection = trim((string)cfg($config,'firebase','unit_collection','master_unit'));
$warnPct = (float)cfg($config,'sync','warn_change_percent',30);
$priceEpsilon = (float)cfg($config,'sync','price_epsilon',0.05);
$packEpsilon = (float)cfg($config,'sync','pack_epsilon',0.0001);
$maxWrites = (int)cfg($config,'sync','max_updates_per_run',2500);

logLine('INFO','Firebase authentication...');
$accessToken = getAccessToken($serviceAccountPath);
logLine('INFO','Firebase authentication OK');

try {
    $drugDocs = loadCollection($projectId,$drugCollection,$accessToken);
    $unitDocs = loadCollection($projectId,$unitCollection,$accessToken);
} catch (Throwable $e) {
    failNow($e->getMessage());
}

$db = connectInvs($config['mysql']);
logLine('INFO','INVS MySQL connected');

$unitJoin = detectUnitJoin($db);
logLine('INFO','Unit relation detected: '.$unitJoin['description']);

/* ---------- Read sale_unit ---------- */
$invsUnits = [];
try {
    $uRes = $db->query("SELECT SU_ID, SALE_UNIT, HIDE, SU_ID_EX FROM sale_unit ORDER BY SU_ID");
    while ($r = $uRes->fetch_assoc()) {
        $id = trim((string)($r['SU_ID'] ?? ''));
        if ($id === '') continue;
        $invsUnits[$id] = [
            'unit_id'=>$id,
            'unit_name'=>normalizedText($r['SALE_UNIT'] ?? ''),
            'su_id_ex'=>normalizedText($r['SU_ID_EX'] ?? ''),
            'hide'=>normalizedText($r['HIDE'] ?? ''),
        ];
    }
    $uRes->free();
} catch (Throwable $e) {
    failNow('Cannot read sale_unit: '.$e->getMessage());
}
logLine('INFO','INVS sale_unit rows='.count($invsUnits));

$unitCandidates = [];
foreach ($invsUnits as $id=>$u) {
    $existing = $unitDocs[$id] ?? null;
    $oldName = $existing ? normalizedText(docField($existing,'unit_name')) : '';
    $oldEx = $existing ? normalizedText(docField($existing,'invs_su_id_ex')) : '';
    $oldHide = $existing ? normalizedText(docField($existing,'invs_hide')) : '';
    $changed = !$existing || $oldName !== $u['unit_name'] || $oldEx !== $u['su_id_ex'] || $oldHide !== $u['hide'];
    if (!$changed) continue;
    $unitCandidates[] = ['existing'=>$existing,'data'=>$u];
    logLine($existing?'INFO':'NEW',($existing?'UNIT CHANGE':'UNIT NEW')." | {$id} | {$u['unit_name']} | EX={$u['su_id_ex']}");
}

/* ---------- Read INVS drug master ---------- */
$sql = buildInvsMasterSql($unitJoin['join']);
try {
    $result = $db->query($sql);
} catch (Throwable $e) {
    failNow('INVS master query failed: '.$e->getMessage());
}

$stats = [
    'rows'=>0,'existing'=>0,'new'=>0,'changed'=>0,'unchanged'=>0,
    'price_changed'=>0,'pack_changed'=>0,'unit_changed'=>0,'name_diff'=>0,
    'price_missing'=>0,'unit_missing'=>0,'large_price'=>0,'updated'=>0,'created'=>0,'failed'=>0,
];
$drugCandidates = [];

while ($row = $result->fetch_assoc()) {
    $stats['rows']++;
    $drugId = normalizedText($row['drug_id'] ?? '');
    if ($drugId === '') continue;

    $invsName = normalizedText($row['invs_drug_name'] ?? '');
    $unitId = normalizedText($row['unit_id'] ?? '');
    $unitName = normalizedText($row['unit_name'] ?? '');
    $unitEx = normalizedText($row['unit_id_ex'] ?? '');
    $pack = parsePositiveNumber($row['pack_size'] ?? null);
    $price = parsePositiveNumber($row['price'] ?? null);
    $lastDate = normalizedText($row['last_datetime'] ?? '');

    $existing = null;
    // Primary expected doc id == drug_id; also support legacy doc whose drug_id field differs from doc id.
    if (isset($drugDocs[$drugId])) {
        $existing = $drugDocs[$drugId];
    } else {
        foreach ($drugDocs as $d) {
            if (normalizedText(docField($d,'drug_id')) === $drugId) { $existing = $d; break; }
        }
    }

    if (!$existing) {
        $stats['new']++;
        if ($price === null) $stats['price_missing']++;
        if ($unitId === '') $stats['unit_missing']++;
        $safePack = $pack ?? 1.0;
        $safePrice = $price ?? 0.0;
        $drugCandidates[] = [
            'action'=>'create','drug_id'=>$drugId,'doc'=>null,
            'data'=>compact('drugId','invsName','unitId','unitName','unitEx','safePack','safePrice','lastDate')
        ];
        logLine('NEW',"DRUG NEW | {$drugId} | {$invsName} | pack={$safePack} | unit={$unitId}:{$unitName} | price={$safePrice}");
        continue;
    }

    $stats['existing']++;
    $oldPrice = (float)(docField($existing,'price') ?? 0);
    $oldPack = (float)(docField($existing,'pack_size') ?? 0);
    $oldUnit = normalizedText(docField($existing,'unit_id'));
    $oldDisplayName = normalizedText(docField($existing,'drug_name'));
    $oldInvsName = normalizedText(docField($existing,'invs_drug_name'));
    $oldInvsUnitName = normalizedText(docField($existing,'invs_sale_unit'));
    $oldInvsUnitEx = normalizedText(docField($existing,'invs_su_id_ex'));
    $oldSource = normalizedText(docField($existing,'master_sync_source'));

    $priceChanged = $price !== null && ($oldPrice <= 0 || numbersDifferent($oldPrice,$price,$priceEpsilon));
    $packChanged = $pack !== null && ($oldPack <= 0 || numbersDifferent($oldPack,$pack,$packEpsilon));
    $unitChanged = $unitId !== '' && $oldUnit !== $unitId;
    $nameDiff = $invsName !== '' && $oldDisplayName !== '' && $invsName !== $oldDisplayName;

    if ($priceChanged) $stats['price_changed']++;
    if ($packChanged) $stats['pack_changed']++;
    if ($unitChanged) $stats['unit_changed']++;
    if ($nameDiff) $stats['name_diff']++;
    if ($price === null) $stats['price_missing']++;
    if ($unitId === '') $stats['unit_missing']++;

    if ($priceChanged && $oldPrice > 0) {
        $pct = (($price-$oldPrice)/$oldPrice)*100;
        $large = abs($pct) >= $warnPct;
        if ($large) $stats['large_price']++;
        logLine($large?'WARN':'INFO',($large?'PRICE LARGE':'PRICE CHANGE')." | {$drugId} | {$oldPrice} -> {$price} | ".number_format($pct,1).'%');
    }
    if ($packChanged) logLine('INFO',"PACK CHANGE | {$drugId} | {$oldPack} -> {$pack}");
    if ($unitChanged) logLine('INFO',"UNIT CHANGE | {$drugId} | {$oldUnit} -> {$unitId} ({$unitName})");

    // Metadata refresh only when needed. Existing App-owned fields are intentionally absent.
    $metadataChanged = $oldInvsName !== $invsName || $oldInvsUnitName !== $unitName || $oldInvsUnitEx !== $unitEx || $oldSource !== 'INVS';
    if (!$priceChanged && !$packChanged && !$unitChanged && !$metadataChanged) {
        $stats['unchanged']++;
        continue;
    }

    $stats['changed']++;
    $drugCandidates[] = [
        'action'=>'update','drug_id'=>$drugId,'doc'=>$existing,
        'data'=>compact('invsName','unitId','unitName','unitEx','pack','price','lastDate','oldPrice','oldPack','oldUnit','priceChanged','packChanged','unitChanged')
    ];
}
$result->free();
$db->close();

$totalWrites = count($unitCandidates)+count($drugCandidates);
logLine('INFO',"SUMMARY | INVS drugs={$stats['rows']} existing={$stats['existing']} new={$stats['new']} changed={$stats['changed']} unchanged={$stats['unchanged']}");
logLine('INFO',"CHANGES | price={$stats['price_changed']} pack={$stats['pack_changed']} unit={$stats['unit_changed']} large_price={$stats['large_price']} price_missing={$stats['price_missing']} unit_missing={$stats['unit_missing']}");
logLine('INFO',"UNIT MASTER | total=".count($invsUnits)." writes=".count($unitCandidates));
logLine('INFO',"PLANNED FIRESTORE WRITES={$totalWrites}");

if (!$isLive) {
    logLine('INFO','TEST COMPLETE: no Firestore data changed');
    exit(0);
}

if ($totalWrites > $maxWrites) {
    failNow("SAFETY STOP: planned writes {$totalWrites} > max_updates_per_run={$maxWrites}. Increase config only after checking TEST output.");
}

/* ---------- Write master_unit first ---------- */
foreach ($unitCandidates as $c) {
    $u = $c['data'];
    $existing = $c['existing'];
    $docName = $existing
        ? $existing['doc_name']
        : firestoreCollectionBase($projectId,$unitCollection).'/'.rawurlencode($u['unit_id']);
    $fields = [
        'unit_id'=>fsString($u['unit_id']),
        'unit_name'=>fsString($u['unit_name']),
        'invs_su_id'=>fsNumber((int)$u['unit_id']),
        'invs_su_id_ex'=>fsString($u['su_id_ex']),
        'invs_hide'=>fsString($u['hide']),
        'source'=>fsString('INVS'),
        'invs_synced_at'=>fsTimestampNow(),
        'updated_at'=>fsTimestampNow(),
    ];
    try {
        patchDocument($docName,$fields,$accessToken,(bool)$existing);
        logLine('OK',($existing?'UNIT UPDATED':'UNIT CREATED')." | {$u['unit_id']} | {$u['unit_name']}");
    } catch (Throwable $e) {
        $stats['failed']++;
        logLine('ERROR',"UNIT FAILED | {$u['unit_id']} | ".$e->getMessage());
    }
}

/* ---------- Write master_drugs ---------- */
foreach ($drugCandidates as $c) {
    $id = $c['drug_id'];
    $d = $c['data'];
    try {
        if ($c['action']==='create') {
            $docName = firestoreCollectionBase($projectId,$drugCollection).'/'.rawurlencode($id);
            $fields = [
                'drug_id'=>fsString($id),
                'drug_name'=>fsString($d['invsName'] !== '' ? $d['invsName'] : $id),
                'price'=>fsNumber($d['safePrice']),
                'pack_size'=>fsNumber($d['safePack']),
                'unit_id'=>fsString($d['unitId']),

                // Safe App-owned defaults for new drugs only.
                'status'=>fsString('Active'),
                'unpacked'=>fsBool(false),
                'dispense_step'=>fsNumber($d['safePack']),
                'usage_multiplier'=>fsNumber(1),
                'fuzzy'=>fsString(''),
                'type'=>fsString('1'),
                'needs_vmi_setup'=>fsBool(true),
                'created_source'=>fsString('INVS'),

                'invs_drug_name'=>fsString($d['invsName']),
                'invs_pack_size'=>fsNumber($d['safePack']),
                'invs_sale_unit'=>fsString($d['unitName']),
                'invs_su_id'=>fsString($d['unitId']),
                'invs_su_id_ex'=>fsString($d['unitEx']),
                'master_sync_source'=>fsString('INVS'),
                'master_sync_version'=>fsString(SYNC_VERSION),
                'price_source'=>fsString('INVS_LATEST_PRICE'),
                'price_invs_last_datetime'=>fsString($d['lastDate']),
                'price_updated_at'=>fsTimestampNow(),
                'pack_size_updated_at'=>fsTimestampNow(),
                'unit_updated_at'=>fsTimestampNow(),
                'invs_master_synced_at'=>fsTimestampNow(),
                'updated_at'=>fsTimestampNow(), // v6.2: ให้แคชบนเว็บดึงยาที่เปลี่ยน
            ];
            patchDocument($docName,$fields,$accessToken,false);
            $stats['created']++;
            logLine('OK',"DRUG CREATED | {$id} | {$d['invsName']}");
            continue;
        }

        $docName = $c['doc']['doc_name'];
        $fields = [
            'invs_drug_name'=>fsString($d['invsName']),
            'invs_sale_unit'=>fsString($d['unitName']),
            'invs_su_id'=>fsString($d['unitId']),
            'invs_su_id_ex'=>fsString($d['unitEx']),
            'master_sync_source'=>fsString('INVS'),
            'master_sync_version'=>fsString(SYNC_VERSION),
            'invs_master_synced_at'=>fsTimestampNow(),
        ];

        if ($d['priceChanged'] && $d['price'] !== null) {
            $fields['price_previous'] = fsNumber($d['oldPrice']);
            $fields['price'] = fsNumber($d['price']);
            $fields['price_source'] = fsString('INVS_LATEST_PRICE');
            $fields['price_invs_last_datetime'] = fsString($d['lastDate']);
            $fields['price_updated_at'] = fsTimestampNow();
        }
        if ($d['packChanged'] && $d['pack'] !== null) {
            $fields['pack_size_previous'] = fsNumber($d['oldPack']);
            $fields['pack_size'] = fsNumber($d['pack']);
            $fields['invs_pack_size'] = fsNumber($d['pack']);
            $fields['pack_size_updated_at'] = fsTimestampNow();
        } elseif ($d['pack'] !== null) {
            $fields['invs_pack_size'] = fsNumber($d['pack']);
        }
        if ($d['unitChanged'] && $d['unitId'] !== '') {
            $fields['unit_id_previous'] = fsString($d['oldUnit']);
            $fields['unit_id'] = fsString($d['unitId']);
            $fields['unit_updated_at'] = fsTimestampNow();
        }

        // v6.2: ยาที่ไม่เปลี่ยนถูกข้ามตั้งแต่ขั้นวางแผนแล้ว · เติม updated_at ให้แคชบนเว็บดึงยาที่เปลี่ยน
        $fields['updated_at'] = fsTimestampNow();
        patchDocument($docName,$fields,$accessToken,true);
        $stats['updated']++;
        logLine('OK',"DRUG UPDATED | {$id} | price=".($d['priceChanged']?'Y':'-')." pack=".($d['packChanged']?'Y':'-')." unit=".($d['unitChanged']?'Y':'-'));
    } catch (Throwable $e) {
        $stats['failed']++;
        logLine('ERROR',"DRUG FAILED | {$id} | ".$e->getMessage());
    }
}

logLine('INFO',"LIVE COMPLETE | drug_updated={$stats['updated']} drug_created={$stats['created']} failed={$stats['failed']}");
exit($stats['failed'] > 0 ? 3 : 0);
