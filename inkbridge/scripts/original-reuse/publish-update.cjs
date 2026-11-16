const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createZip}=require('../../src/main/export-packages.cjs'),{safePath}=require('../../src/main/program-updates.cjs'),{atomic,writeJSON}=require('../../src/main/sync-files.cjs');
const {hashFile}=require('../../src/main/workspace-snapshots.cjs');
async function publishUpdate({base,target,output,privateKey,sequence,zipOnly=false}){
  const previous=JSON.parse(await fs.readFile(path.join(base,'portable-build.json'))),next=JSON.parse(await fs.readFile(path.join(target,'portable-build.json')));
  if(!previous.buildId||!next.buildId||previous.buildId===next.buildId)throw Error('兩個不同的可更新版本才可產生增量包');
  if(!Number.isSafeInteger(sequence)||sequence<=(previous.releaseSequence||0)||sequence!==next.releaseSequence)throw Error('發布序號必須與目標版本相同，且高於來源版本');
  const a=new Map(previous.files.map(f=>[f.path,f.sha256])),b=new Map(next.files.map(f=>[f.path,f.sha256]));
  a.set('portable-build.json',await hashFile(path.join(base,'portable-build.json')));b.set('portable-build.json',await hashFile(path.join(target,'portable-build.json')));
  const files=[],zipFiles=[];for(const name of new Set([...a.keys(),...b.keys()])){if(a.get(name)===b.get(name))continue;safePath(name);const sha256=b.get(name)||null,bytes=sha256?(await fs.stat(path.join(target,name))).size:undefined;files.push({path:name,oldSha256:a.get(name)||null,sha256,...(zipOnly&&sha256?{bytes}:{})});if(sha256){const file=path.join(target,name);if(await hashFile(file)!==sha256)throw Error('發布輸入與 Manifest 不符');zipFiles.push({name,data:await fs.readFile(file)});}}
  const releaseId=crypto.randomUUID(),zip=createZip(zipFiles),zipName=`InkBridge-update-${releaseId}.zip`;
  const descriptor={format:'inkbridge-update',version:zipOnly?2:1,...(zipOnly?{mode:'delta'}:{}),releaseId,sequence,baseBuildId:previous.buildId,targetBuildId:next.buildId,targetVersion:next.version,platform:'win32-x64',schemaVersion:1,createdAt:new Date().toISOString(),...(!zipOnly?{zip:{name:zipName,sha256:crypto.createHash('sha256').update(zip).digest('hex'),bytes:zip.length}}:{}),files};
  const payload=Buffer.from(JSON.stringify(descriptor)),signature=crypto.sign('RSA-SHA256',payload,await fs.readFile(privateKey)).toString('base64');
  const envelope={payload:payload.toString('base64'),signature},release=zipOnly?createZip([{name:'release.json',data:JSON.stringify(envelope)},...zipFiles]):zip;
  await fs.mkdir(output,{recursive:true});await atomic(path.join(output,zipName),release);if(!zipOnly)await writeJSON(path.join(output,`InkBridge-update-${releaseId}.json`),envelope);
  return {releaseId,zip:path.join(output,zipName),bytes:release.length,files:files.length,descriptor};
}
async function publishFullRelease({target,output,privateKey,sequence}){
 const {writeReleaseZip}=require('./write-release-zip.cjs'),next=JSON.parse(await fs.readFile(path.join(target,'portable-build.json'),'utf8'));
 if(sequence!==next.releaseSequence||!Number.isSafeInteger(sequence)||sequence<1||!Array.isArray(next.files)||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(next.version))throw Error('Invalid full release identity');
 if(crypto.createHash('sha256').update(JSON.stringify(next.files)).digest('hex')!==next.buildId)throw Error('Invalid full build file identity');
 const files=[],entries=[],seen=new Set();
 for(const f of [...next.files,{path:'portable-build.json',sha256:await hashFile(path.join(target,'portable-build.json')),bytes:(await fs.stat(path.join(target,'portable-build.json'))).size}]){
  safePath(f.path);if(seen.has(f.path.toLowerCase()))throw Error('Duplicate full file');seen.add(f.path.toLowerCase());const source=path.join(target,f.path);if(!(await fs.lstat(source)).isFile())throw Error('Non-file release source');
  files.push({path:f.path,sha256:f.sha256,bytes:f.bytes});entries.push({name:f.path,file:source,sha256:f.sha256,bytes:f.bytes});
 }
 const releaseId=crypto.randomUUID(),descriptor={format:'inkbridge-update',version:2,mode:'full',releaseId,sequence,baseBuildId:null,targetBuildId:next.buildId,targetVersion:next.version,platform:'win32-x64',schemaVersion:1,createdAt:new Date().toISOString(),files};
 const payload=Buffer.from(JSON.stringify(descriptor)),signature=crypto.sign('RSA-SHA256',payload,await fs.readFile(privateKey)).toString('base64');
 await fs.mkdir(output,{recursive:true});const zip=path.join(output,`InkBridge-release-${next.version}-${releaseId}.zip`),pending=zip+'.pending';
 try{await writeReleaseZip(pending,[{name:'release.json',data:JSON.stringify({payload:payload.toString('base64'),signature})},...entries]);await fs.rename(pending,zip);}finally{await fs.rm(pending,{force:true});}
 return {releaseId,zip,bytes:(await fs.stat(zip)).size,files:files.length,descriptor};
}
if(require.main===module){const [base,target,output,sequence]=process.argv.slice(2);publishUpdate({base,target,output,sequence:Number(sequence),privateKey:process.env.INKBRIDGE_PUBLISHER_KEY||path.resolve(__dirname,'../../private-publisher/key.pem')}).then(value=>console.log(JSON.stringify({...value,descriptor:undefined},null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});}
module.exports={publishUpdate,publishFullRelease};
