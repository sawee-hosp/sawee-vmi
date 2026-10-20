// ทดสอบ api/line-webhook.js ด้วย fetch จำลอง: node tests/line_webhook_test.js $PWD/api/line-webhook.js
const crypto=require('crypto'); const {Readable}=require('stream');
const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
process.env.FIREBASE_SERVICE_ACCOUNT=JSON.stringify({project_id:'p1',client_email:'x@p1.iam',private_key:privateKey});
process.env.LINE_CHANNEL_SECRET='sec'; process.env.LINE_CHANNEL_ACCESS_TOKEN='tok'; process.env.LINE_BOT_ID='@abc123';
const db={'line_link_codes/123456':{uid:{stringValue:'u1'},expires_at:{timestampValue:new Date(Date.now()+60000).toISOString()}},
          'line_link_codes/654321':{uid:{stringValue:'u1'},expires_at:{timestampValue:new Date(Date.now()-60000).toISOString()}},
          'users/u1':{name:{stringValue:'จนท'},role:{stringValue:'hospital'}}};
const replies=[];
global.fetch=async(url,opt={})=>{
  const J=(o,s=200)=>({ok:s<300,status:s,json:async()=>o,text:async()=>JSON.stringify(o),headers:{get:()=>'application/json'}});
  if(url.includes('oauth2')) return J({access_token:'g',expires_in:3600});
  if(url.includes('api.line.me')){ if(url.includes('profile')) return J({displayName:'Nok'}); replies.push(JSON.parse(opt.body).messages[0].text); return J({}); }
  const path=decodeURIComponent(url.split('/documents/')[1]||'').split('?')[0];
  if(url.endsWith(':runQuery')){ const v=JSON.parse(opt.body).structuredQuery.where.fieldFilter.value.stringValue; return J(Object.entries(db).filter(([k,d])=>k.startsWith('users/')&&d.line_user_id&&d.line_user_id.stringValue===v).map(([k,d])=>({document:{name:'x/'+k,fields:d}}))); }
  if(opt.method==='PATCH'){ db[path]=Object.assign(db[path]||{},JSON.parse(opt.body).fields); return J({}); }
  if(opt.method==='DELETE'){ delete db[path]; return J({}); }
  return db[path]?J({fields:db[path]}):J({},404);
};
const h=require(process.argv[2]);
const call=async(events,badSig)=>{ const raw=Buffer.from(JSON.stringify({events})); const req=Readable.from([raw]); req.method='POST';
  req.headers={'x-line-signature':badSig?'xxx':crypto.createHmac('sha256','sec').update(raw).digest('base64')};
  let st,body; const res={status(s){st=s;return this;},json(b){body=b;return this;},setHeader(){}}; await h(req,res); return [st,body]; };
(async()=>{
  const out=[];const ck=(n,c,x)=>out.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
  let r=await call([],true); ck('bad signature rejected',r[0]===401);
  r=await call([{type:'message',replyToken:'t',source:{userId:'Lx'},message:{type:'text',text:'654321'}}]); ck('expired code',replies.pop().includes('หมดอายุ'));
  r=await call([{type:'message',replyToken:'t',source:{userId:'Lx'},message:{type:'text',text:'รหัส 123456'}}]);
  ck('linked', db['users/u1'].line_user_id?.stringValue==='Lx' && db['users/u1'].line_display_name?.stringValue==='Nok' && !db['line_link_codes/123456'], JSON.stringify(db['users/u1']).slice(0,120));
  ck('success reply', (replies.pop()||'').includes('ผูกบัญชีสำเร็จ'));
  r=await call([{type:'unfollow',source:{userId:'Lx'}}]); ck('unfollow clears', db['users/u1'].line_user_id.stringValue==='');
  let st,body; const res={status(s){st=s;return this;},json(b){body=b;return this;},setHeader(){}}; await h({method:'GET',headers:{}},res); ck('GET info', body.botId==='@abc123' && body.addFriendUrl.includes('line.me'), JSON.stringify(body));
  console.log(out.join('\n'));
})();
