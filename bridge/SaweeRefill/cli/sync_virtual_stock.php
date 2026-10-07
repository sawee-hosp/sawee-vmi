<?php
/**
 * Sawee Rxfill Virtual Stock Engine v1.1
 *
 * v1.1 (ประหยัดโควตา Firestore):
 * - ข้ามใบเบิกที่ประมวลผลครบแล้ว (vmi_stock_engine_done) และใบที่กระทบยอดแล้วรอ INVS ยืนยัน (vmi_recon_done)
 * - อ่าน Lot/เหตุการณ์ เฉพาะ รพ.สต. ที่มีงานค้าง และอ่านเหตุการณ์เฉพาะของใบที่กำลังทำ (ไม่อ่านประวัติทั้งหมดทุกรอบ)
 * - ไม่แก้เอกสารใบเบิกทุกรอบอีกต่อไป
 *
 * Safety boundary:
 * - This script does NOT connect to MySQL and contains NO SQL.
 * - INVS data is consumed only from Firestore snapshots already synced by SELECT-only jobs.
 * - Working stock is stored only in Firebase.
 */
declare(strict_types=1);
date_default_timezone_set('Asia/Bangkok');

const VSTOCK_VERSION = '1.1.0';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

$configFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'config.php';
if (!file_exists($configFile)) { fwrite(STDERR, "ERROR: private/config.php not found\n"); exit(1); }
$config = require $configFile;
$logFile = (string)($config['virtual_stock']['log_file'] ?? dirname(__DIR__) . DIRECTORY_SEPARATOR . 'logs' . DIRECTORY_SEPARATOR . 'sync_virtual_stock.log');
@mkdir(dirname($logFile), 0777, true);

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
function eventIdV(string $prefix, string ...$parts): string { $safe=array_map(fn($x)=>safeV($x),$parts); return substr($prefix.'__'.implode('__',$safe),0,240); }

foreach (['curl', 'openssl', 'json'] as $ext) if (!extension_loaded($ext)) vfail("PHP extension {$ext} missing");
foreach ([['firebase','project_id'],['firebase','service_account_json']] as [$g,$k]) {
    $value = cleanV($config[$g][$k] ?? '');
    if ($value === '' || str_contains($value, 'PUT_')) vfail("config missing {$g}.{$k}");
}
$serviceAccountPath = (string)$config['firebase']['service_account_json'];
if (!file_exists($serviceAccountPath)) vfail('serviceAccountKey.json not found');

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
function listCollectionV(string $project,string $collection,string $token,int $max=10000): array {
    $out=[]; $page=null;
    do {
        $url='https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents/'.rawurlencode($collection).'?pageSize=1000';
        if ($page) $url.='&pageToken='.rawurlencode($page);
        $r=httpV('GET',$url,$token);
        if ($r['status']<200 || $r['status']>=300) throw new RuntimeException("LIST {$collection} HTTP {$r['status']}: {$r['raw']}");
        foreach (($r['body']['documents']??[]) as $doc) {
            $fields=[]; foreach (($doc['fields']??[]) as $k=>$v) $fields[$k]=decodeV($v);
            $fields['_doc_id']=rawurldecode(basename((string)$doc['name'])); $out[]=$fields;
            if (count($out)>=$max) return $out;
        }
        $page=$r['body']['nextPageToken']??null;
    } while ($page);
    return $out;
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
// ค้นด้วยเงื่อนไขเท่ากับหลายฟิลด์ (AND) — Firestore ใช้ดัชนีฟิลด์เดี่ยวได้ ไม่ต้องสร้าง index
function queryEqManyV(string $project,string $collection,array $eq,string $token,int $limit=10000): array {
    $filters=[];
    foreach ($eq as $f=>$v) $filters[]=['fieldFilter'=>['field'=>['fieldPath'=>$f],'op'=>'EQUAL','value'=>['stringValue'=>(string)$v]]];
    $where=count($filters)===1 ? $filters[0] : ['compositeFilter'=>['op'=>'AND','filters'=>$filters]];
    $url='https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents:runQuery';
    $r=httpV('POST',$url,$token,['structuredQuery'=>['from'=>[['collectionId'=>$collection]],'where'=>$where,'limit'=>$limit]]);
    if ($r['status']<200 || $r['status']>=300) throw new RuntimeException("QUERY {$collection} HTTP {$r['status']}: {$r['raw']}");
    $out=[];
    foreach ($r['body'] as $entry) {
        $doc=$entry['document']??null; if(!$doc) continue;
        $fields=[]; foreach (($doc['fields']??[]) as $k=>$v) $fields[$k]=decodeV($v);
        $fields['_doc_id']=rawurldecode(basename((string)$doc['name'])); $out[]=$fields;
    }
    return $out;
}
function commitDocsV(string $project,string $token,array $docs): void {
    foreach (array_chunk($docs,300) as $chunk) {
        $writes=[];
        foreach ($chunk as $d) {
            $name='projects/'.$project.'/databases/(default)/documents/'.$d['collection'].'/'.$d['id'];
            $writes[]=['update'=>['name'=>$name,'fields'=>encodedFieldsV($d['fields'])]];
        }
        if (!$writes) continue;
        $url='https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents:commit';
        $r=httpV('POST',$url,$token,['writes'=>$writes]);
        if ($r['status']<200 || $r['status']>=300) throw new RuntimeException("COMMIT HTTP {$r['status']}: {$r['raw']}");
    }
}
function patchDocV(string $project,string $collection,string $docId,array $fields,string $token): void {
    $mask=[]; $encoded=[];
    foreach ($fields as $k=>$v) { $mask[]='updateMask.fieldPaths='.rawurlencode((string)$k); $encoded[(string)$k]=encodeV($v); }
    $url=docUrlV($project,$collection,$docId).'?'.implode('&',$mask);
    $r=httpV('PATCH',$url,$token,['fields'=>$encoded]);
    if ($r['status']<200 || $r['status']>=300) throw new RuntimeException("PATCH {$collection}/{$docId} HTTP {$r['status']}: {$r['raw']}");
}
function expiryKeyV(array $lot): string { $e=cleanV($lot['expiry']??''); return preg_match('/^\d{8}$/',$e)?$e:'99999999'; }
function sortLotsV(array &$lots): void {
    usort($lots,function($a,$b){
        $ea=expiryKeyV($a); $eb=expiryKeyV($b); if($ea!==$eb) return strcmp($ea,$eb);
        $ca=cleanV($a['created_at']??$a['source_at']??''); $cb=cleanV($b['created_at']??$b['source_at']??''); if($ca!==$cb) return strcmp($ca,$cb);
        return ((int)($a['invs_record_number']??$a['invs_detail_record_number']??0)) <=> ((int)($b['invs_record_number']??$b['invs_detail_record_number']??0));
    });
}

try {
    $token=accessTokenV($serviceAccountPath);
    $project=(string)$config['firebase']['project_id'];
    $now=gmdate('Y-m-d\TH:i:s\Z');
    $hospitals=listCollectionV($project,'master_hospitals',$token,1000);
    $mapped=array_values(array_filter($hospitals,fn($h)=>cleanV($h['hospital_id']??$h['_doc_id']??'')!=='' && cleanV($h['invs_dept_id']??'')!==''));
    $errors=0; $initialized=0; $reconciled=0; $receipts=0; $reads=0;

    foreach ($mapped as $hospital) {
        $hospitalId=cleanV($hospital['hospital_id']??$hospital['_doc_id']);
        try {
            $meta=getDocV($project,'vmi_stock_meta',$hospitalId,$token);

            // First run is a cutover snapshot only. Historical requisitions before cutover are intentionally not replayed.
            if (!$meta || ($meta['initialized']??false)!==true) {
                $refs=queryEqV($project,'invs_stock_lots','hospital_id',$hospitalId,$token,10000);
                $writes=[]; $baselineQty=0.0; $baselineLots=0;
                foreach ($refs as $r) {
                    $qty=numV($r['qty_on_hand']??0);
                    if (($r['active']??true)===false || $qty<=0) continue;
                    $record=(int)($r['invs_record_number']??0); if($record<=0) continue;
                    $lotId=safeV($hospitalId).'__BASE__'.$record;
                    $lot=[
                        'hospital_id'=>$hospitalId,'drug_id'=>cleanV($r['drug_id']??''),'lot_no'=>cleanV($r['lot_no']??''),'expiry'=>cleanV($r['expiry']??''),
                        'remaining_qty'=>$qty,'initial_qty'=>$qty,'active'=>true,'pack_ratio'=>max(1.0,numV($r['pack_ratio']??1)),
                        'pack_cost'=>(float)($r['pack_cost']??0),'unit_cost'=>(float)($r['unit_cost']??0),'location'=>cleanV($r['location']??''),
                        'source_type'=>'INVS_BASELINE','source_at'=>$now,'invs_record_number'=>$record,'invs_dept_id'=>cleanV($r['invs_dept_id']??''),
                        'reference_snapshot_at'=>cleanV($r['synced_at']??''),'created_at'=>$now,'updated_at'=>$now,'schema_version'=>18,'virtual_stock_version'=>VSTOCK_VERSION
                    ];
                    $writes[]=['collection'=>'vmi_virtual_lots','id'=>$lotId,'fields'=>$lot];
                    $eventId=eventIdV('BASELINE',$hospitalId,(string)$record);
                    $writes[]=['collection'=>'vmi_stock_events','id'=>$eventId,'fields'=>[
                        'hospital_id'=>$hospitalId,'drug_id'=>$lot['drug_id'],'lot_doc_id'=>$lotId,'lot_no'=>$lot['lot_no'],'expiry'=>$lot['expiry'],
                        'event_type'=>'BASELINE_INIT','qty_delta'=>$qty,'before_qty'=>0.0,'after_qty'=>$qty,'source'=>'INVS_SNAPSHOT_CUTOVER',
                        'invs_record_number'=>$record,'created_at'=>$now,'schema_version'=>18
                    ]];
                    $baselineQty+=$qty; $baselineLots++;
                }
                $writes[]=['collection'=>'vmi_stock_meta','id'=>$hospitalId,'fields'=>[
                    'hospital_id'=>$hospitalId,'initialized'=>true,'initialized_at'=>$now,'cutover_at'=>$now,'baseline_lot_count'=>$baselineLots,
                    'baseline_total_qty'=>$baselineQty,'last_engine_sync_at'=>$now,'status'=>'INITIALIZED','virtual_stock_version'=>VSTOCK_VERSION,'schema_version'=>18
                ]];
                commitDocsV($project,$token,$writes);
                $initialized++;
                vlog('INFO',"{$hospitalId}: initialized virtual stock",['lots'=>$baselineLots,'qty'=>$baselineQty]);
                continue;
            }

            $cutover=cleanV($meta['cutover_at']??$meta['initialized_at']??'');
            try { $reqs=queryEqManyV($project,'requisitions',['hospitalId'=>$hospitalId,'status'=>'Completed'],$token,5000); }
            catch (Throwable $qe) { $reqs=queryEqV($project,'requisitions','hospitalId',$hospitalId,$token,5000); }
            $reads+=max(1,count($reqs));
            $reqs=array_values(array_filter($reqs,function($r) use($cutover){
                $approved=cleanV($r['approved_at']??'');
                if (cleanV($r['status']??'')!=='Completed' || $approved==='' || ($cutover!=='' && $approved<=$cutover)) return false;
                if (($r['vmi_stock_engine_done']??false)===true) return false;            // ทำครบแล้ว
                $confirmed=strtoupper(cleanV($r['invs_confirm_flag']??''))==='Y';
                return ($r['vmi_recon_done']??false)!==true || $confirmed;               // กระทบยอดแล้ว รอ INVS ยืนยัน → ยังไม่มีงาน
            }));
            usort($reqs,fn($a,$b)=>strcmp(cleanV($a['approved_at']??''),cleanV($b['approved_at']??'')));

            if (!$reqs) {
                $metaOut=$meta; unset($metaOut['_doc_id']);
                $metaOut['last_engine_sync_at']=$now; $metaOut['status']='OK'; $metaOut['virtual_stock_version']=VSTOCK_VERSION; $metaOut['schema_version']=18;
                commitDocsV($project,$token,[['collection'=>'vmi_stock_meta','id'=>$hospitalId,'fields'=>$metaOut]]);
                continue; // ไม่มีงานค้าง: ไม่ต้องอ่าน Lot/เหตุการณ์
            }

            $virtualLots=queryEqV($project,'vmi_virtual_lots','hospital_id',$hospitalId,$token,10000);
            $reads+=max(1,count($virtualLots));
            $byDrug=[];
            foreach ($virtualLots as $lot) { $d=cleanV($lot['drug_id']??''); if($d!=='') $byDrug[$d][]=$lot; }
            foreach ($byDrug as &$rows) sortLotsV($rows); unset($rows);

            // อ่านเหตุการณ์เฉพาะของใบที่กำลังประมวลผล (กันทำซ้ำ) แทนการอ่านประวัติทั้งหมด
            $eventSet=[];
            foreach ($reqs as $wr) {
                $evs=queryEqV($project,'vmi_stock_events','source_requisition_id',(string)$wr['_doc_id'],$token,5000);
                $reads+=max(1,count($evs));
                foreach ($evs as $e) $eventSet[(string)$e['_doc_id']]=true;
            }

            foreach ($reqs as $req) {
                $reqId=(string)$req['_doc_id'];
                $items=is_array($req['items']??null)?$req['items']:[];

                // 1) Reconcile pre-refill credit. Only decreases are automatic; positive discrepancy requires manual adjustment.
                foreach ($items as $item) {
                    $drugId=cleanV($item['drugId']??$item['drug_id']??''); if($drugId==='') continue;
                    $eventId=eventIdV('RECON',$reqId,$drugId);
                    if (isset($eventSet[$eventId])) continue;

                    $rows=$byDrug[$drugId]??[]; sortLotsV($rows);
                    $before=array_sum(array_map(fn($x)=>numV($x['remaining_qty']??0),$rows));
                    $target=($item['actualStockTouched']??false)
                        ? numV($item['actualStock']??0)
                        : numV($item['systemStock']??max(0,(float)($item['prevExcess']??0)-(float)($item['usage']??0)));
                    $need=max(0.0,$before-$target); $left=$need; $allocations=[]; $writes=[];

                    foreach ($rows as $idx=>$lot) {
                        if ($left<=1e-7) break;
                        $qty=numV($lot['remaining_qty']??0); if($qty<=0) continue;
                        $used=min($qty,$left);
                        $rows[$idx]['remaining_qty']=$qty-$used;
                        $rows[$idx]['active']=$rows[$idx]['remaining_qty']>1e-7;
                        $rows[$idx]['updated_at']=$now;
                        $left-=$used;
                        $allocations[]=['lot_doc_id'=>$lot['_doc_id'],'lot_no'=>cleanV($lot['lot_no']??''),'expiry'=>cleanV($lot['expiry']??''),'qty'=>$used];
                        $doc=$rows[$idx]; unset($doc['_doc_id']);
                        $writes[]=['collection'=>'vmi_virtual_lots','id'=>$lot['_doc_id'],'fields'=>$doc];
                    }
                    $after=array_sum(array_map(fn($x)=>numV($x['remaining_qty']??0),$rows));
                    $positiveGap=max(0.0,$target-$before);
                    $writes[]=['collection'=>'vmi_stock_events','id'=>$eventId,'fields'=>[
                        'hospital_id'=>$hospitalId,'drug_id'=>$drugId,'event_type'=>'CREDIT_RECONCILE_FEFO','qty_delta'=>$after-$before,
                        'before_qty'=>$before,'after_qty'=>$after,'reported_credit'=>$target,'unresolved_positive_discrepancy'=>$positiveGap,
                        'allocations'=>$allocations,'source_requisition_id'=>$reqId,'requisition_no'=>cleanV($req['requisition_no']??''),
                        'source'=>'REQUISITION_COMPLETED','created_at'=>$now,'schema_version'=>18,'virtual_stock_version'=>VSTOCK_VERSION
                    ]];
                    commitDocsV($project,$token,$writes);
                    $byDrug[$drugId]=$rows; $eventSet[$eventId]=true; $reconciled++;
                    if ($positiveGap>0.0001) vlog('WARN',"{$hospitalId}/{$drugId}: reported credit is greater than virtual stock",['requisition'=>$reqId,'virtual_before'=>$before,'reported'=>$target,'gap'=>$positiveGap]);
                }

                $allReconciled=true;
                foreach ($items as $item) {
                    $drugId=cleanV($item['drugId']??$item['drug_id']??''); if($drugId==='') continue;
                    if (!isset($eventSet[eventIdV('RECON',$reqId,$drugId)])) { $allReconciled=false; break; }
                }

                // 2) Add actual INVS QTY_RCV after confirm, exactly once.
                $confirmed=strtoupper(cleanV($req['invs_confirm_flag']??''))==='Y';
                $snapshot=is_array($req['invs_dispense_snapshot']??null)?$req['invs_dispense_snapshot']:[];
                if ($confirmed && $allReconciled && $snapshot) {
                    foreach ($snapshot as $idx=>$row) {
                        $qty=numV($row['qty_rcv']??$row['QTY_RCV']??0); if($qty<=0) continue;
                        $alternate=is_array($row['alternate_receipts']??null)?array_values(array_filter($row['alternate_receipts'],fn($x)=>numV($x['qty_rcv']??0)>0)):[];
                        if ($alternate) {
                            // Multi-lot semantics have not been empirically verified yet. Do not risk double-counting.
                            vlog('WARN',"{$hospitalId}: {$reqId} has alternate receipt fields; auto receipt skipped",['drug'=>cleanV($row['drug_id']??''),'invs_sub_po_no'=>cleanV($req['invs_sub_po_no']??'')]);
                            continue;
                        }
                        $drugId=cleanV($row['drug_id']??$row['WORKING_CODE']??''); if($drugId==='') continue;
                        $detail=(int)($row['invs_detail_record_number']??$idx);
                        $eventId=eventIdV('RECEIPT',$reqId,(string)$detail);
                        if (isset($eventSet[$eventId])) continue;

                        $before=array_sum(array_map(fn($x)=>numV($x['remaining_qty']??0),$byDrug[$drugId]??[]));
                        $lotId=safeV($hospitalId).'__REQ__'.safeV(cleanV($req['invs_sub_po_no']??$reqId)).'__'.$detail;
                        $pack=max(1.0,numV($row['pack_ratio']??1));
                        $packCost=(float)($row['pack_cost']??0);
                        $lot=[
                            'hospital_id'=>$hospitalId,'drug_id'=>$drugId,'lot_no'=>cleanV($row['lot_no']??''),'expiry'=>cleanV($row['expiry']??''),
                            'remaining_qty'=>$qty,'initial_qty'=>$qty,'active'=>true,'pack_ratio'=>$pack,'pack_cost'=>$packCost,
                            'unit_cost'=>$pack>0?$packCost/$pack:0.0,'location'=>cleanV($row['location']??''),'source_type'=>'INVS_RECEIPT',
                            'source_requisition_id'=>$reqId,'invs_sub_po_no'=>cleanV($req['invs_sub_po_no']??''),'invs_detail_record_number'=>$detail,
                            'source_at'=>$now,'created_at'=>$now,'updated_at'=>$now,'schema_version'=>18,'virtual_stock_version'=>VSTOCK_VERSION
                        ];
                        $event=[
                            'hospital_id'=>$hospitalId,'drug_id'=>$drugId,'lot_doc_id'=>$lotId,'lot_no'=>$lot['lot_no'],'expiry'=>$lot['expiry'],
                            'event_type'=>'INVS_RECEIPT','qty_delta'=>$qty,'before_qty'=>$before,'after_qty'=>$before+$qty,
                            'source_requisition_id'=>$reqId,'invs_sub_po_no'=>$lot['invs_sub_po_no'],'invs_detail_record_number'=>$detail,
                            'source'=>'INVS_CONFIRMED_QTY_RCV','created_at'=>$now,'schema_version'=>18,'virtual_stock_version'=>VSTOCK_VERSION
                        ];
                        commitDocsV($project,$token,[
                            ['collection'=>'vmi_virtual_lots','id'=>$lotId,'fields'=>$lot],
                            ['collection'=>'vmi_stock_events','id'=>$eventId,'fields'=>$event]
                        ]);
                        $lot['_doc_id']=$lotId; $byDrug[$drugId][]=$lot; sortLotsV($byDrug[$drugId]);
                        $eventSet[$eventId]=true; $receipts++;
                    }
                }

                // บันทึกความคืบหน้าในใบเบิก เพื่อรอบถัดไปข้ามได้ (เขียนเฉพาะเมื่อสถานะเปลี่ยน)
                $patch=[];
                if ($allReconciled && ($req['vmi_recon_done']??false)!==true) $patch['vmi_recon_done']=true;
                if ($allReconciled && $confirmed) $patch['vmi_stock_engine_done']=true;
                if ($patch) {
                    $patch['vmi_stock_engine_seen_at']=$now; $patch['vmi_stock_engine_version']=VSTOCK_VERSION;
                    try { patchDocV($project,'requisitions',$reqId,$patch,$token); } catch(Throwable $ignore) {}
                }
            }

            $metaOut=$meta; unset($metaOut['_doc_id']);
            $metaOut['last_engine_sync_at']=$now; $metaOut['status']='OK'; $metaOut['virtual_stock_version']=VSTOCK_VERSION; $metaOut['schema_version']=18;
            commitDocsV($project,$token,[['collection'=>'vmi_stock_meta','id'=>$hospitalId,'fields'=>$metaOut]]);
            vlog('INFO',"{$hospitalId}: virtual stock engine OK",['requisitions_after_cutover'=>count($reqs)]);
        } catch(Throwable $e) {
            $errors++; vlog('ERROR',"{$hospitalId}: {$e->getMessage()}");
        }
    }

    vlog('INFO','DONE',['initialized'=>$initialized,'reconciled'=>$reconciled,'receipts'=>$receipts,'firestore_reads_approx'=>$reads,'errors'=>$errors]);
    exit($errors?2:0);
} catch(Throwable $e) {
    vfail($e->getMessage());
}
