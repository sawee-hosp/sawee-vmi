const G=require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(G+'/playwright'); const fs=require('fs'), path=require('path'); const DIR=__dirname;
const res=[]; const check=(n,c,x)=>res.push((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
fs.writeFileSync(path.join(DIR,'seed.js'),'window.__SEED='+JSON.stringify({user:{uid:'a1'},collections:{
  master_drugs:{},master_unit:{},master_depts:{},config:{},master_hospitals:{H1:{hospital_id:'H1',hospital_name:'รพ.สต.ทุ่งระยะ'}},
  line_logs:{L1:{type:'dispensed',to_name:'จนท',ok:true,preview:'ห้องยาจัดยาเรียบร้อยแล้ว',at:'2026-10-20T08:00:00Z'}},
  users:{a1:{name:'แอดมิน',role:'admin',email:'a@x',line_user_id:'La',line_display_name:'Ad'},h1:{name:'จนท',role:'hospital',hospital_id:'H1',email:'h@x'}}}})+';');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await (await b.newContext({viewport:{width:1400,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+path.join(DIR,'t_app.html')); await p.waitForTimeout(1500);
  await p.click('text=LINE Console'); await p.waitForTimeout(800);
  const t=await p.innerText('#line-console').catch(()=>'');
  check('console renders', t.includes('ผูก LINE แล้ว (1)') && t.includes('ยังไม่ผูก') && t.includes('จนท'), t.slice(0,300));
  check('logs listed', t.includes('ห้องยาจัดยาเรียบร้อยแล้ว'));
  await p.click('text=แก้ไขข้อมูลส่วนตัว'); await p.waitForTimeout(300);
  check('no errors', !errs.length, errs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e=>{console.error('HARNESS',e.message); console.log(res.join('\n')); process.exit(1);});
