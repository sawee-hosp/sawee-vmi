const ts=(()=>{try{return require('typescript');}catch(e){return require(require('path').join(require('child_process').execSync('npm root -g').toString().trim(),'typescript'));}})();const fs=require('fs');
for (const f of process.argv.slice(2)){
  const html=fs.readFileSync(f,'utf8');
  const re=/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g;let m,i=0;
  const blocks=f.endsWith('.js')?[html]:[];
  while((m=re.exec(html)))blocks.push(m[1]);
  blocks.forEach((code,idx)=>{
    const r=ts.transpileModule(code,{reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020,allowJs:true},fileName:'x.jsx'});
    const d=r.diagnostics||[];
    if(!d.length) console.log(f,'block',idx+1,'OK');
    d.slice(0,8).forEach(x=>{const {line,character}=x.file?x.file.getLineAndCharacterOfPosition(x.start):{line:0,character:0};console.log(f,'ERR line',line+1,':',character,ts.flattenDiagnosticMessageText(x.messageText,'\n'));});
  });
}
