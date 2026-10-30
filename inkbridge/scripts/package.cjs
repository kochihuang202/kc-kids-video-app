const {packager}=require('@electron/packager');
const path=require('node:path');
const fs=require('node:fs');const crypto=require('node:crypto');
const output=path.resolve(__dirname,'../release',`0.1.0-${crypto.randomUUID().slice(0,8)}`);
packager({dir:path.resolve(__dirname,'..'),out:output,name:'InkBridge',platform:'win32',arch:'x64',
  electronVersion:require('electron/package.json').version,overwrite:false,asar:false,prune:true,
  ignore:[/^\/artifacts($|\/)/,/^\/test-results($|\/)/,/^\/tests($|\/)/,/^\/release($|\/)/,/^\/docs($|\/)/,/^\/playwright.config.cjs$/],
  win32metadata:{CompanyName:'InkBridge',FileDescription:'InkBridge 墨橋',ProductName:'InkBridge'}})
  .then(paths=>{
    const executable=path.join(paths[0],'InkBridge.exe');
    const sha256=crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
    const result={product:'InkBridge',version:'0.1.0',executable,sha256,createdAt:new Date().toISOString()};
    fs.writeFileSync(path.resolve(__dirname,'../release/last-build.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }).catch(error=>{console.error(error);process.exitCode=1;});
