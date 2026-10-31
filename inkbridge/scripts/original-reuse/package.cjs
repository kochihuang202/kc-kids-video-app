// PRIVATE local preview only. Never includes formal profiles or source in Git.
const {packager}=require('@electron/packager');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),original=path.join(root,'private-original-editor'),stage=path.join(original,'package-source-'+crypto.randomUUID().slice(0,8));
fs.mkdirSync(stage,{recursive:true});
function copy(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});fs.cpSync(from,to,{recursive:true,errorOnExist:true,force:false});}
for(const folder of ['scripts/original-reuse','src/main','src/core'])copy(path.join(root,folder),path.join(stage,folder));
for(const folder of ['vendor','source-modules'])copy(path.join(original,folder),path.join(stage,'private-original-editor',folder));
for(const file of ['runtime.js','register-original.js','modules.json','source-receipt.json','source-baseline.json'])copy(path.join(original,file),path.join(stage,'private-original-editor',file));
const tsRoot=path.dirname(require.resolve('typescript/package.json',{paths:[root]}));copy(tsRoot,path.join(stage,'node_modules/typescript'));
const typescript=require(path.join(tsRoot,'package.json')).version;
fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify({name:'inkbridge-original-preview',productName:'InkBridge',version:'0.5.0-preview.1',private:true,main:'scripts/original-reuse/host.cjs',dependencies:{typescript},scripts:{'build:original':'node scripts/original-reuse/collect.cjs'}},null,2));
(async()=>{
  const output=path.join(root,'release','original-port-'+crypto.randomUUID().slice(0,8));
  const paths=await packager({dir:stage,out:output,name:'InkBridge',platform:'win32',arch:'x64',electronVersion:require('electron/package.json').version,asar:false,prune:false,overwrite:false,
    win32metadata:{CompanyName:'InkBridge',ProductName:'InkBridge Original Module Preview',FileDescription:'Private original-module porting preview'}});
  const executable=path.join(paths[0],'InkBridge.exe'),sha256=crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
  const result={product:'InkBridge original-module preview',version:'0.5.0-preview.1',private:true,executable,sha256,createdAt:new Date().toISOString(),sourceRoot:stage,originalSourceSha256:JSON.parse(fs.readFileSync(path.join(original,'source-receipt.json'))).asarSha256};
  fs.writeFileSync(path.join(original,'last-private-build.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
