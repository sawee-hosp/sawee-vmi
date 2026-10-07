const ts=require('/home/claude/.npm-global/lib/node_modules/typescript');const fs=require('fs');
const OUT='/mnt/user-data/outputs/';
function build(page){
  let html=fs.readFileSync(OUT+page,'utf8');
  const m=/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  const js=ts.transpileModule(m[1],{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
  fs.writeFileSync('compiled_'+page.replace('.html','.js'),js);
  html=html.replace(m[0],'<script src="compiled_'+page.replace('.html','.js')+'"></script>');
  html=html.replace(/<script[^>]*src="https?:[^"]*"[^>]*><\/script>/g,'').replace(/<link[^>]*href="https?:[^"]*"[^>]*>/g,'').replace(/@import url\([^)]*\);/g,'');
  html=html.replace(/<script src="shared.js[^"]*"><\/script>/,'<script src="seed.js"></script><script src="react-shim.js"></script><script src="fake-firebase.js"></script><script>window.Papa={parse(){}};window.XLSX={};window.L={};</script><script src="shared.js"></script>');
  fs.writeFileSync('t_'+page,html);
}
['internal.html','app.html','index.html'].forEach(build);
fs.copyFileSync(OUT+'shared.js','shared.js');
console.log('built');
