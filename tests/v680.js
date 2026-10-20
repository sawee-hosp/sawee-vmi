// v6.8: modal ชวนผูก LINE ตอนเข้าใช้ (รพ.สต./แอดมิน) + สร้างรหัสผูก (ต้องรัน build.js ก่อน)
const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const seed=(uid,extra)=>fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid},collections:{
  master_drugs:{},master_unit:{},master_depts:{},config:{},master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ'}},
  users:{h1:Object.assign({name:'จนท',role:'hospital',hospital_id:'H1',email:'h@x'},extra||{})}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  seed('h1'); const ctx=await b.newContext({viewport:{width:1400,height:900}}); let p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
  check('prompt shown for unlinked hospital user', (await p.innerText('body')).includes('รับแจ้งเตือนผ่าน LINE'));
  await p.click('#line-make-code'); await p.waitForTimeout(400);
  const code=await p.textContent('#line-code').catch(()=>'');
  const saved=await p.evaluate(c=>window.__STORE.line_link_codes&&window.__STORE.line_link_codes.get(c),code);
  check('link code created', /^\d{6}$/.test(code||'') && saved && saved.uid==='h1', code);
  await p.click('#line-prompt-close'); await p.waitForTimeout(200);
  check('prompt closed', !(await p.innerText('body')).includes('รับแจ้งเตือนผ่าน LINE'));
  await p.reload(); await p.waitForTimeout(1500);
  check('not shown again in same session', !(await p.innerText('body')).includes('รับแจ้งเตือนผ่าน LINE'));
  check('no errors', !errs.length, errs.join(' | ')); await ctx.close();
  seed('h1',{line_user_id:'Lx',line_display_name:'Nok'}); const c2=await b.newContext(); p=await c2.newPage();
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
  check('linked user: no prompt', !(await p.innerText('body')).includes('รับแจ้งเตือนผ่าน LINE'));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
