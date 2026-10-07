<?php
/**
 * Sawee Rxfill INVS Requisition Status + Lot/Expiry Sync v1.3
 * READ-ONLY from INVS. Writes only snapshots/status back to Firestore.
 * v1.3 (ประหยัดโควตา Firestore):
 *  - จำรายการใบที่ส่ง INVS แล้วไว้ในเครื่อง (cache/req_status_state.json) ไม่ list ใบเบิกทั้งหมดทุกรอบ
 *    รอบปกติค้นเฉพาะใบที่ส่งใหม่ (invs_sent_at > ครั้งก่อน)
 *  - เขียนกลับเฉพาะใบที่สถานะ/จำนวนรับเปลี่ยน · หยุดตรวจใบที่ยืนยันแล้วเกิน 7 วัน
 *  - ใส่ updated_at ให้แคชบนเว็บเห็นการเปลี่ยน · ใส่ --full เพื่อ list ใหม่ทั้งหมด
 * Never changes stock, CARD, SM_PO or SM_PO_C.
 */
declare(strict_types=1);
date_default_timezone_set('Asia/Bangkok');
const STATUS_SYNC_VERSION='1.3.0';
const FINAL_RECHECK_DAYS=7;
const GOOGLE_TOKEN_URL='https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE='https://www.googleapis.com/auth/datastore';
$configFile=dirname(__DIR__).DIRECTORY_SEPARATOR.'private'.DIRECTORY_SEPARATOR.'config.php';
if(!file_exists($configFile)){fwrite(STDERR,"ERROR: private/config.php not found\n");exit(1);} $config=require $configFile;
$logFile=(string)($config['status_sync']['log_file']??dirname(__DIR__).DIRECTORY_SEPARATOR.'logs'.DIRECTORY_SEPARATOR.'sync_requisition_status.log');
@mkdir(dirname($logFile),0777,true);
function logx(string $level,string $msg):void{global $logFile;$s=date('Y-m-d H:i:s')." | {$level} | {$msg}";echo $s.PHP_EOL;@file_put_contents($logFile,$s.PHP_EOL,FILE_APPEND|LOCK_EX);}
function failx(string $m,int $c=1):never{logx('ERROR',$m);exit($c);} function clean(mixed $v):string{return trim((string)($v??''));}
function b64url(string $d):string{return rtrim(strtr(base64_encode($d),'+/','-_'),'=');}
foreach(['mysqli','curl','openssl','json'] as $e) if(!extension_loaded($e)) failx("PHP extension {$e} missing");
foreach([['mysql','host'],['mysql','user'],['mysql','password'],['mysql','database'],['firebase','project_id'],['firebase','service_account_json']] as [$g,$k]){ $v=clean($config[$g][$k]??''); if($v===''||str_contains($v,'PUT_')) failx("config missing {$g}.{$k}"); }
$sa=(string)$config['firebase']['service_account_json']; if(!file_exists($sa)) failx('serviceAccountKey.json not found');
function accessToken(string $path):string{$k=json_decode((string)file_get_contents($path),true);if(!is_array($k)||empty($k['client_email'])||empty($k['private_key']))throw new RuntimeException('invalid service account');$now=time();$u=b64url(json_encode(['alg'=>'RS256','typ'=>'JWT'])).'.'.b64url(json_encode(['iss'=>$k['client_email'],'scope'=>FIRESTORE_SCOPE,'aud'=>GOOGLE_TOKEN_URL,'iat'=>$now,'exp'=>$now+3600]));$pk=openssl_pkey_get_private($k['private_key']);$sig='';if(!$pk||!openssl_sign($u,$sig,$pk,OPENSSL_ALGO_SHA256))throw new RuntimeException('JWT sign failed');$ch=curl_init(GOOGLE_TOKEN_URL);curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>http_build_query(['grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>$u.'.'.b64url($sig)]),CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>30]);$raw=curl_exec($ch);$http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);$j=json_decode((string)$raw,true);if($http<200||$http>=300||empty($j['access_token']))throw new RuntimeException("OAuth HTTP {$http}");return(string)$j['access_token'];}
function httpj(string $method,string $url,string $token,?array $payload=null):array{$h=['Authorization: Bearer '.$token,'Accept: application/json'];if($payload!==null)$h[]='Content-Type: application/json';$ch=curl_init($url);curl_setopt_array($ch,[CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>$h,CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>90]);if($payload!==null)curl_setopt($ch,CURLOPT_POSTFIELDS,json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));$raw=curl_exec($ch);if($raw===false){$e=curl_error($ch);curl_close($ch);throw new RuntimeException($e);} $http=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);$j=json_decode((string)$raw,true);return['status'=>$http,'body'=>is_array($j)?$j:[],'raw'=>(string)$raw];}
function dec(?array $v):mixed{if(!$v)return null;if(array_key_exists('nullValue',$v))return null;if(array_key_exists('stringValue',$v))return(string)$v['stringValue'];if(array_key_exists('integerValue',$v))return(int)$v['integerValue'];if(array_key_exists('doubleValue',$v))return(float)$v['doubleValue'];if(array_key_exists('booleanValue',$v))return(bool)$v['booleanValue'];if(array_key_exists('timestampValue',$v))return(string)$v['timestampValue'];if(array_key_exists('arrayValue',$v))return array_map('dec',$v['arrayValue']['values']??[]);if(array_key_exists('mapValue',$v)){ $o=[];foreach(($v['mapValue']['fields']??[])as$k=>$x)$o[$k]=dec($x);return$o;}return null;}
function enc(mixed $v):array{if(is_array($v)&&array_keys($v)===['__ts'])return['timestampValue'=>(string)$v['__ts']];if($v===null)return['nullValue'=>null];if(is_bool($v))return['booleanValue'=>$v];if(is_int($v))return['integerValue'=>(string)$v];if(is_float($v)){if(abs($v-round($v))<1e-7)return['integerValue'=>(string)(int)round($v)];return['doubleValue'=>$v];}if(is_array($v)){if(array_is_list($v))return['arrayValue'=>['values'=>array_map('enc',$v)]];$f=[];foreach($v as$k=>$x)$f[(string)$k]=enc($x);return['mapValue'=>['fields'=>$f]];}return['stringValue'=>(string)$v];}
function loadReqs(string $project,string $token,int $max):array{$out=[];$page=null;do{$url='https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents/requisitions?pageSize=1000';if($page)$url.='&pageToken='.rawurlencode($page);$r=httpj('GET',$url,$token);if($r['status']<200||$r['status']>=300)throw new RuntimeException("Firestore list HTTP {$r['status']}");foreach(($r['body']['documents']??[])as$d){$f=[];foreach(($d['fields']??[])as$k=>$v)$f[$k]=dec($v);if(clean($f['invs_sub_po_no']??'')!==''){$f['_doc_id']=rawurldecode(basename((string)$d['name']));$out[]=$f;if(count($out)>=$max)return$out;}}$page=$r['body']['nextPageToken']??null;}while($page);return$out;}
function patchReq(string $project,string $id,array $fields,string $token):void{$mask=[];$ef=[];foreach($fields as$k=>$v){$mask[]='updateMask.fieldPaths='.rawurlencode((string)$k);$ef[$k]=enc($v);} $url='https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents/requisitions/'.rawurlencode($id).'?'.implode('&',$mask).'&currentDocument.exists=true';$r=httpj('PATCH',$url,$token,['fields'=>$ef]);if($r['status']===404||($r['status']===400&&str_contains($r['raw'],'FAILED_PRECONDITION')))throw new DomainException('DOC_GONE');if($r['status']<200||$r['status']>=300)throw new RuntimeException("PATCH {$id} HTTP {$r['status']}: {$r['raw']}");}
function statePathS():string{return dirname(__DIR__).DIRECTORY_SEPARATOR.'cache'.DIRECTORY_SEPARATOR.'req_status_state.json';}
function loadStateS():array{$p=statePathS();if(!is_file($p))return[];$j=json_decode((string)file_get_contents($p),true);return(is_array($j)&&($j['v']??0)===1&&is_array($j['reqs']??null))?$j:[];}
function saveStateS(array $st):void{$p=statePathS();@mkdir(dirname($p),0777,true);$t=$p.'.tmp';if(@file_put_contents($t,json_encode($st,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES))!==false)@rename($t,$p);}
// ใบที่ส่ง INVS หลังเวลาที่กำหนด (invs_sent_at เป็นข้อความ ISO จาก Bridge เรียงตามตัวอักษรได้)
function newSentReqs(string $project,string $token,string $since):array{$url='https://firestore.googleapis.com/v1/projects/'.rawurlencode($project).'/databases/(default)/documents:runQuery';$q=['structuredQuery'=>['from'=>[['collectionId'=>'requisitions']],'where'=>['fieldFilter'=>['field'=>['fieldPath'=>'invs_sent_at'],'op'=>'GREATER_THAN_OR_EQUAL','value'=>['stringValue'=>$since]]],'limit'=>2000]];$r=httpj('POST',$url,$token,$q);if($r['status']<200||$r['status']>=300)throw new RuntimeException("Firestore query HTTP {$r['status']}: {$r['raw']}");$out=[];foreach($r['body'] as $e){$d=$e['document']??null;if(!$d)continue;$f=[];foreach(($d['fields']??[])as$k=>$v)$f[$k]=dec($v);if(clean($f['invs_sub_po_no']??'')==='')continue;$f['_doc_id']=rawurldecode(basename((string)$d['name']));$out[]=$f;}return $out;}
function dbconn(array $c):mysqli{mysqli_report(MYSQLI_REPORT_ERROR|MYSQLI_REPORT_STRICT);$d=mysqli_init();$d->options(MYSQLI_OPT_CONNECT_TIMEOUT,(int)($c['connect_timeout']??15));$d->real_connect((string)$c['host'],(string)$c['user'],(string)$c['password'],(string)$c['database'],(int)($c['port']??3306));$d->set_charset((string)($c['charset']??'utf8'));return$d;}
function fnum(mixed $v):float{return is_numeric($v)?(float)$v:0.0;}
function snapshot(mysqli $db,string $sub):?array{$st=$db->prepare('SELECT SUB_PO_NO,SEND_FLAG,CONFIRM_FLAG,CONFIRM_DATE,CONFIRM_TIME,PROCESS,TOTAL_ITEM,TOTAL_COST,TOTAL_VALUE FROM sm_po WHERE SUB_PO_NO=? ORDER BY RECORD_NUMBER DESC LIMIT 1');$st->bind_param('s',$sub);$st->execute();$h=$st->get_result()->fetch_assoc();$st->close();if(!$h)return null;$sql='SELECT RECORD_NUMBER,WORKING_CODE,QTY_ORDER,QTY_RCV,QTY_CFM,PACK_RATIO,COST,VALUE,TRADE_CODE,LOT_NO,EXPIRED_DATE,CONFIRM_FLAG,USER_CFM,CONFIRM_DATE,PACK_COST,PACK_CODE,LOCATION,PROCESS,SUB_PROCESS,CANCEL_DISP,SEND_CANCEL,LAST_UPD,APP_VERSION,QTY_RCV1,PACK_RATIO1,EXPIRED_DATE1,LOCATION1,COST1,VALUE1,QTY_RCV2,PACK_RATIO2,EXPIRED_DATE2,LOCATION2,COST2,VALUE2,QTY_RCV3,PACK_RATIO3,EXPIRED_DATE3,LOCATION3,COST3,VALUE3,DISP_RECNO,EXCH_RECNO FROM sm_po_c WHERE SUB_PO_NO=? ORDER BY RECORD_NUMBER';$st=$db->prepare($sql);$st->bind_param('s',$sub);$st->execute();$rows=$st->get_result()->fetch_all(MYSQLI_ASSOC);$st->close();$items=[];foreach($rows as$r){$alt=[];for($i=1;$i<=3;$i++){if(fnum($r['QTY_RCV'.$i]??0)>0||clean($r['EXPIRED_DATE'.$i]??'')!=='')$alt[]=['qty_rcv'=>fnum($r['QTY_RCV'.$i]??0),'pack_ratio'=>fnum($r['PACK_RATIO'.$i]??0),'expiry'=>clean($r['EXPIRED_DATE'.$i]??''),'location'=>clean($r['LOCATION'.$i]??''),'cost'=>fnum($r['COST'.$i]??0),'value'=>fnum($r['VALUE'.$i]??0)];}$items[]=['invs_detail_record_number'=>(int)($r['RECORD_NUMBER']??0),'drug_id'=>clean($r['WORKING_CODE']??''),'qty_order'=>fnum($r['QTY_ORDER']??0),'qty_rcv'=>fnum($r['QTY_RCV']??0),'qty_cfm'=>fnum($r['QTY_CFM']??0),'pack_ratio'=>fnum($r['PACK_RATIO']??0),'cost'=>fnum($r['COST']??0),'value'=>fnum($r['VALUE']??0),'trade_code'=>clean($r['TRADE_CODE']??''),'lot_no'=>clean($r['LOT_NO']??''),'expiry'=>clean($r['EXPIRED_DATE']??''),'confirm_flag'=>clean($r['CONFIRM_FLAG']??''),'user_cfm'=>clean($r['USER_CFM']??''),'confirm_date'=>clean($r['CONFIRM_DATE']??''),'pack_cost'=>fnum($r['PACK_COST']??0),'pack_code'=>$r['PACK_CODE']!==null?(int)$r['PACK_CODE']:null,'location'=>clean($r['LOCATION']??''),'process'=>clean($r['PROCESS']??''),'sub_process'=>clean($r['SUB_PROCESS']??''),'cancel_disp'=>clean($r['CANCEL_DISP']??''),'send_cancel'=>clean($r['SEND_CANCEL']??''),'last_upd'=>clean($r['LAST_UPD']??''),'app_version'=>clean($r['APP_VERSION']??''),'disp_recno'=>$r['DISP_RECNO']!==null?(int)$r['DISP_RECNO']:null,'exch_recno'=>$r['EXCH_RECNO']!==null?(int)$r['EXCH_RECNO']:null,'alternate_receipts'=>$alt];}return['header'=>$h,'items'=>$items];}
try{
    $token=accessToken($sa);$project=(string)$config['firebase']['project_id'];$max=(int)($config['status_sync']['max_requisitions_per_run']??2000);
    $full=in_array('--full',$argv??[],true);
    $state=$full?[]:loadStateS();
    $reads=0;
    if(!$state){
        // รอบแรก/--full: list ทั้งหมดครั้งเดียว แล้วจำไว้
        $all=loadReqs($project,$token,$max);$reads+=max(1,count($all));
        $state=['v'=>1,'last_sent_at'=>'','reqs'=>[]];
        foreach($all as $r){$state['reqs'][(string)$r['_doc_id']]=['sub'=>clean($r['invs_sub_po_no']??''),'hash'=>'','final_at'=>null];$sa2=clean($r['invs_sent_at']??'');if($sa2>$state['last_sent_at'])$state['last_sent_at']=$sa2;}
    }else{
        $new=newSentReqs($project,$token,(string)($state['last_sent_at']?:'0'));$reads+=max(1,count($new));
        foreach($new as $r){$id=(string)$r['_doc_id'];if(!isset($state['reqs'][$id])||($state['reqs'][$id]['sub']??'')!==clean($r['invs_sub_po_no']??''))$state['reqs'][$id]=['sub'=>clean($r['invs_sub_po_no']??''),'hash'=>'','final_at'=>null];$sa2=clean($r['invs_sent_at']??'');if($sa2>$state['last_sent_at'])$state['last_sent_at']=$sa2;}
    }
    $db=dbconn($config['mysql']);
    $nowTs=time();$ok=0;$same=0;$missing=0;$err=0;$skippedFinal=0;
    foreach($state['reqs'] as $id=>$info){
        $id=(string)$id;$sub=(string)($info['sub']??'');
        if($sub===''){continue;}
        if(!empty($info['final_at']) && $nowTs-(int)$info['final_at']>FINAL_RECHECK_DAYS*86400){$skippedFinal++;continue;}
        try{
            $s=snapshot($db,$sub);
            if(!$s){$missing++;logx('WARN',"{$id}: INVS {$sub} not found");continue;}
            $h=$s['header'];$confirmed=strtoupper(clean($h['CONFIRM_FLAG']??''))==='Y';
            $ordered=array_sum(array_map(fn($x)=>fnum($x['qty_order']??0),$s['items']));$received=array_sum(array_map(fn($x)=>fnum($x['qty_rcv']??0),$s['items']));
            $deliveryState='SENT';if($confirmed){if($received<=0.000001)$deliveryState='CONFIRMED_ZERO';elseif($received+0.000001<$ordered)$deliveryState='CONFIRMED_PARTIAL';else$deliveryState='CONFIRMED_FULL';}
            $fields=['invs_status'=>'SENT','invs_send_flag'=>clean($h['SEND_FLAG']??''),'invs_confirm_flag'=>clean($h['CONFIRM_FLAG']??''),'invs_confirm_date'=>clean($h['CONFIRM_DATE']??''),'invs_confirm_time'=>clean($h['CONFIRM_TIME']??''),'invs_process'=>clean($h['PROCESS']??''),'invs_fulfillment_status'=>$deliveryState,'invs_confirm_total_item'=>fnum($h['TOTAL_ITEM']??0),'invs_confirm_total_cost'=>fnum($h['TOTAL_COST']??0),'invs_confirm_total_value'=>fnum($h['TOTAL_VALUE']??0),'invs_delivery_summary'=>['ordered_qty'=>$ordered,'received_qty'=>$received,'difference_qty'=>$ordered-$received,'state'=>$deliveryState],'invs_dispense_snapshot'=>$s['items']];
            $hash=substr(sha1(json_encode($fields,JSON_UNESCAPED_UNICODE)),0,20);
            if($confirmed && empty($info['final_at']))$state['reqs'][$id]['final_at']=$nowTs;
            if(($info['hash']??'')===$hash){$same++;continue;} // ไม่เปลี่ยน → ไม่เขียน
            $fields['invs_last_status_sync_at']=gmdate('Y-m-d\TH:i:s\Z');$fields['invs_status_sync_version']=STATUS_SYNC_VERSION;$fields['invs_status_hash']=$hash;
            $fields['updated_at']=['__ts'=>gmdate('Y-m-d\TH:i:s\Z')]; // ให้แคชบนเว็บเห็นการเปลี่ยน
            patchReq($project,$id,$fields,$token);
            $state['reqs'][$id]['hash']=$hash;$ok++;
            logx('INFO',"{$id}: {$sub} {$deliveryState} ordered={$ordered} received={$received} items=".count($s['items']));
        }catch(DomainException $gone){unset($state['reqs'][$id]);logx('WARN',"{$id}: ไม่พบใบใน Firestore แล้ว (ถูกลบ) — เลิกติดตาม");}
        catch(Throwable$e){$err++;logx('ERROR',"{$id}: {$e->getMessage()}");}
    }
    // เก็บไฟล์ให้เล็ก: ตัดใบที่ยืนยันแล้วเกิน 120 วัน
    foreach($state['reqs'] as $id=>$info){if(!empty($info['final_at'])&&$nowTs-(int)$info['final_at']>120*86400)unset($state['reqs'][$id]);}
    saveStateS($state);
    $db->close();logx('INFO',"DONE updated={$ok} unchanged={$same} final_skipped={$skippedFinal} missing={$missing} errors={$err} firestore_reads~{$reads}");exit($err?2:0);
}catch(Throwable$e){failx($e->getMessage());}
