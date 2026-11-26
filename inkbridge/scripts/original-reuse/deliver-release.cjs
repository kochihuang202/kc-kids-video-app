// Publish a verified complete release before removing superseded full packages.
// This never traverses or deletes workspace snapshots/assets or user reports.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {readZipEnvelope,verifyReleaseZip}=require('../../src/main/release-zip.cjs');
const {verifyEnvelope}=require('../../src/main/program-updates.cjs');
const {hashFile,copyVerified}=require('../../src/main/stream-files.cjs');
async function copyRelease(release,exchange){
 const sha256=await hashFile(release),target=path.join(exchange,path.basename(release));
 try{if(await hashFile(target)!==sha256)throw Error('Existing release has different bytes');}
 catch(e){if(e.code!=='ENOENT')throw e;const pending=target+'.pending-'+crypto.randomUUID();try{await copyVerified(release,pending,{sha256});await fs.rename(pending,target);}finally{await fs.rm(pending,{force:true});}}
 if(await hashFile(target)!==sha256)throw Error('Delivered ZIP failed verification');
 return {zip:target,sha256,bytes:(await fs.stat(target)).size};
}
async function deliverRelease({release,exchange,key,delta}){
 release=await fs.realpath(release);exchange=await fs.realpath(exchange);
 const manifest=(await verifyReleaseZip(release,key)).descriptor;
 if(manifest.version!==2||manifest.mode!=='full')throw Error('Delivery requires a signed complete release');
 const name=path.basename(release);if(!/^InkBridge-release-[a-zA-Z0-9.-]+\.zip$/.test(name))throw Error('Invalid release filename');
 let deliveredDelta;
 if(delta){
  const {file,baseBuildId}=delta,update=(await verifyReleaseZip(file,key)).descriptor;
  if(!/^InkBridge-update-[0-9a-f-]+\.zip$/i.test(path.basename(file))||update.version!==2||update.mode!=='delta'||
     update.targetBuildId!==manifest.targetBuildId||update.baseBuildId!==baseBuildId||update.sequence!==manifest.sequence)throw Error('Tested delta does not match the full release');
  deliveredDelta=await copyRelease(file,exchange);
 }
 const full=await copyRelease(release,exchange);
 const removed=[];
 const entries=await fs.readdir(exchange,{withFileTypes:true});
 const regular=new Set(entries.filter(entry=>entry.isFile()).map(entry=>entry.name));
 for(const entry of entries){
  if(!entry.isFile()||entry.name===name||entry.name===path.basename(deliveredDelta?.zip||''))continue;
  const file=path.join(exchange,entry.name);if(path.dirname(file)!==exchange)throw Error('Delivery path escaped');
  let obsolete=/^InkBridge-\d+\.\d+\.\d+-[a-f0-9]+-[a-f0-9]+\.zip(?:\.sha256)?$/.test(entry.name)||/^Start-InkBridge-\d+\.\d+\.\d+\.(bat|ps1|json)$/.test(entry.name);
  if(/^InkBridge-release-[a-zA-Z0-9.-]+\.zip$/.test(entry.name)||(deliveredDelta&&/^InkBridge-update-[0-9a-f-]+\.zip$/i.test(entry.name))){
   try{
    const old=verifyEnvelope(await readZipEnvelope(file),key);
    obsolete=old.version===2&&['full','delta'].includes(old.mode)&&(old.sequence<manifest.sequence||
     old.sequence===manifest.sequence&&old.targetBuildId===manifest.targetBuildId&&
     (old.mode==='full'||deliveredDelta&&old.baseBuildId===delta.baseBuildId));
   }catch{obsolete=false;}
  }
  if(obsolete){await fs.unlink(file);removed.push(entry.name);}
 }
 if(deliveredDelta){
  for(const name of regular){
   if(!/^InkBridge-update-[a-f0-9-]+\.json$/i.test(name))continue;
   const descriptor=path.join(exchange,name);
   let old;
   try{old=verifyEnvelope(JSON.parse(await fs.readFile(descriptor,'utf8')),key);}catch{continue;}
   if(old.version!==1||old.sequence>=manifest.sequence||!regular.has(old.zip.name))continue;
   const payload=path.join(exchange,old.zip.name);
   if(await hashFile(payload).catch(()=>null)!==old.zip.sha256)continue;
   await fs.unlink(descriptor);
   await fs.unlink(payload);
   removed.push(name,old.zip.name);
  }
 }
 return {version:manifest.targetVersion,buildId:manifest.targetBuildId,...full,removed,...(deliveredDelta&&{delta:deliveredDelta})};
}
module.exports={deliverRelease};
if(require.main===module){
 const [release,exchange]=process.argv.slice(2);
 require('./release-cleanup.cjs').deliverValidatedRelease({release,exchange,key:require('../../src/main/publisher-public.json'),releaseRoot:path.resolve(__dirname,'../../release'),deliver:deliverRelease})
  .then(v=>console.log(JSON.stringify(v,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
