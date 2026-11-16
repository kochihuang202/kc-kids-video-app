// Publish a verified complete release before removing superseded full packages.
// This never traverses or deletes workspace snapshots/assets or user reports.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {readZipEnvelope}=require('../../src/main/release-zip.cjs');
const {verifyEnvelope}=require('../../src/main/program-updates.cjs');
const {hashFile,copyVerified}=require('../../src/main/stream-files.cjs');
async function deliverRelease({release,exchange,key}){
 release=await fs.realpath(release);exchange=await fs.realpath(exchange);
 const manifest=verifyEnvelope(await readZipEnvelope(release),key);
 if(manifest.version!==2||manifest.mode!=='full')throw Error('Delivery requires a signed complete release');
 const name=path.basename(release);if(!/^InkBridge-release-[a-zA-Z0-9.-]+\.zip$/.test(name))throw Error('Invalid release filename');
 const sha256=await hashFile(release),target=path.join(exchange,name);
 const inside=file=>path.dirname(file)===exchange;
 try{if(await hashFile(target)!==sha256)throw Error('Existing release has different bytes');}
 catch(e){if(e.code!=='ENOENT')throw e;const pending=target+'.pending-'+crypto.randomUUID();try{await copyVerified(release,pending,{sha256});await fs.rename(pending,target);}finally{await fs.rm(pending,{force:true});}}
 if(await hashFile(target)!==sha256)throw Error('Delivered ZIP failed verification');
 const removed=[];
 for(const entry of await fs.readdir(exchange,{withFileTypes:true})){
  if(!entry.isFile()||entry.name===name)continue;
  const file=path.join(exchange,entry.name);if(!inside(file))throw Error('Delivery path escaped');
  let obsolete=/^InkBridge-\d+\.\d+\.\d+-[a-f0-9]+-[a-f0-9]+\.zip(?:\.sha256)?$/.test(entry.name)||/^Start-InkBridge-\d+\.\d+\.\d+\.(bat|ps1|json)$/.test(entry.name);
  if(/^InkBridge-release-[a-zA-Z0-9.-]+\.zip$/.test(entry.name)){
   try{const old=verifyEnvelope(await readZipEnvelope(file),key);obsolete=old.version===2&&old.mode==='full'&&old.sequence<manifest.sequence;}catch{obsolete=false;}
  }
  if(obsolete){await fs.unlink(file);removed.push(entry.name);}
 }
 return {version:manifest.targetVersion,buildId:manifest.targetBuildId,zip:target,bytes:(await fs.stat(target)).size,sha256,removed};
}
if(require.main===module){const [release,exchange]=process.argv.slice(2);deliverRelease({release,exchange,key:require('../../src/main/publisher-public.json')}).then(v=>console.log(JSON.stringify(v,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={deliverRelease};
