// Own bounded-memory, fsynced immutable-file publication. Never rename over an
// existing CAS object: a racing writer must publish the same verified bytes.
const fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const CHUNK_BYTES=64*1024;
const fingerprint=s=>[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':');
async function scanFile(source,{maxBytes=Number.MAX_SAFE_INTEGER,onChunk=()=>{},allowEmpty=false}={}){
 const handle=await fsp.open(source,'r');
 try{
  const before=await handle.stat();if(!before.isFile()||!before.size&&!allowEmpty||before.size>maxBytes)throw Error('Invalid attachment byte length');
  const hash=crypto.createHash('sha256');let bytes=0;
  for await(const chunk of handle.createReadStream({autoClose:false,highWaterMark:CHUNK_BYTES})){
   bytes+=chunk.length;if(bytes>maxBytes)throw Error('Invalid attachment byte length');hash.update(chunk);await onChunk(chunk);
  }
  const after=await handle.stat(),current=await fsp.stat(source);if(bytes!==before.size||fingerprint(before)!==fingerprint(after)||fingerprint(current)!==fingerprint(after))throw Object.assign(Error('Source changed during attachment read'),{code:'SOURCE_CHANGED',before:fingerprint(before),after:fingerprint(after),current:fingerprint(current)});
  return {sha256:hash.digest('hex'),bytes,fingerprint:fingerprint(after)};
 }finally{await handle.close();}
}
async function hashFile(source){
 // OneDrive may hydrate or replace a placeholder while the first read opens it.
 // Reopen and hash from byte zero; never accept the digest of an unstable read.
 for(let attempt=0;;attempt++){
  try{return (await scanFile(source,{allowEmpty:true})).sha256;}
  catch(error){if(error.code!=='SOURCE_CHANGED'||attempt>=2)throw error;}
 }
}
async function copyVerified(source,target,{sha256,bytes,maxBytes=Number.MAX_SAFE_INTEGER,validate=()=>{},destination=()=>target,allowEmpty=bytes===0}={}){
 await fsp.mkdir(path.dirname(target),{recursive:true});
 const temporary=target+'.pending-'+crypto.randomUUID();let out;
 try{
  out=await fsp.open(temporary,'wx');
  const info=await scanFile(source,{maxBytes,allowEmpty,onChunk:chunk=>out.writeFile(chunk)});
  if(sha256&&info.sha256!==sha256||bytes!==undefined&&info.bytes!==bytes)throw Error('Attachment integrity failure');
  await validate(info,temporary);await out.sync();await out.close();out=null;
  const published=destination(info);
  try{await fsp.link(temporary,published);}catch(error){
   if(error.code!=='EEXIST')throw error;
   if(!(await fsp.lstat(published)).isFile())throw Error('Existing attachment integrity failure');
   const existing=await scanFile(published,{allowEmpty});if(existing.sha256!==info.sha256||existing.bytes!==info.bytes)throw Error('Existing attachment integrity failure');
  }
  return {...info,filePath:published};
 }finally{if(out)await out.close();await fsp.rm(temporary,{force:true});}
}
module.exports={scanFile,hashFile,copyVerified,fingerprint,CHUNK_BYTES};
