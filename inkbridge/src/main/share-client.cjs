const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PART_SIZE = 8 * 1024 * 1024;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function aborted(signal) { if(signal?.aborted) throw signal.reason || Object.assign(new Error('Publishing cancelled'),{name:'AbortError'}); }
async function hashFile(file,signal) {
 const hash=crypto.createHash('sha256');let size=0;
 for await(const chunk of createReadStream(file)){aborted(signal);hash.update(chunk);size+=chunk.length;}
 return {sha256:hash.digest('hex'),size};
}
function createShareClient({baseUrl,token,jobDirectory,fetch:fetchImpl=globalThis.fetch}) {
 const base=new URL(baseUrl);if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname)))throw Error('Sharing requires HTTPS');
 if(base.username||base.password||base.search||base.hash)throw Error('Invalid sharing site URL');
 const site=base.origin;
 async function request(route,{method='GET',body,headers={},signal,authenticated=true}={}) {
  aborted(signal);
  const response=await fetchImpl(site+route,{method,signal,headers:{...(authenticated?{authorization:'Bearer '+token}:{}),...(body&&!Buffer.isBuffer(body)?{'content-type':'application/json'}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
  let result;try{result=await response.json();}catch{throw Object.assign(new Error('Sharing server returned HTTP '+response.status+' without JSON for '+route),{status:response.status,code:'SHARE_HTTP_ERROR'});}
  if(!response.ok)throw Object.assign(new Error(result.error||'Sharing request failed'),{status:response.status,code:response.status===409?'SHARE_CONFLICT':'SHARE_HTTP_ERROR'});return result;
 }
 async function publish({workspaceId,rootBoardId,requestId=crypto.randomUUID(),expectedVersion=null,packageDirectory,selection,imagePreset,losslessImageIds,readerBuild,onProgress=()=>{},signal}) {
  if(!jobDirectory)throw Error('Sharing job directory required');
  const root=await fs.realpath(packageDirectory),raw=JSON.parse(await fs.readFile(path.join(root,'package-manifest.json'),'utf8'));
  const manifest={format:'inkbridge-share-package',version:1,rootBoardId,readerBuild:readerBuild||raw.readerBuild,files:[]};
  const types={'.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.bmp':'image/bmp','.pdf':'application/pdf'};
  const sources=new Map();
  for(const item of raw.files||[]) {
   if(item.path!=='share.json'&&!item.path.startsWith('assets/'))continue;
   if(item.path.includes('\\')||item.path.split('/').some(s=>!s||s==='.'||s==='..'))throw Error('Unsafe package path');
   const file=await fs.realpath(path.join(root,item.path));
   if(!file.startsWith(root+path.sep))throw Error('Package file escapes package');
   const stat=await fs.stat(file);if(!stat.isFile())throw Error('Package entry is not a file');
   const integrity=await hashFile(file,signal),size=item.size??item.bytes;
   if(integrity.size!==size||integrity.sha256!==item.sha256)throw Error('Package integrity failure: '+item.path);
   manifest.files.push({path:item.path,size,sha256:item.sha256,contentType:item.contentType||types[path.extname(item.path).toLowerCase()]||'application/octet-stream'});
   sources.set(item.sha256,file);
  }
  if(!manifest.files.some(f=>f.path==='share.json'))throw Error('Package has no share.json');
  if(!manifest.readerBuild)throw Error('Reader build required');
  const body={workspaceId,rootBoardId,requestId,expectedVersion,manifest,...(selection===undefined?{}:{selection}),...(imagePreset===undefined?{}:{imagePreset}),...(losslessImageIds===undefined?{}:{losslessImageIds}),...(raw.capturedAt?{capturedAt:raw.capturedAt}:{})};
  const jobKey=sha(JSON.stringify([site,workspaceId,rootBoardId,requestId])),journalPath=path.join(jobDirectory,jobKey+'.json');
  await fs.mkdir(jobDirectory,{recursive:true});
  let journal;try{journal=JSON.parse(await fs.readFile(journalPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const fingerprint=sha(JSON.stringify(body));
  if(journal&&journal.fingerprint!==fingerprint)throw Error('Publish request id already belongs to another package');
  journal=journal||{format:'inkbridge-share-job',version:1,site,requestId,workspaceId,rootBoardId,packageDirectory:root,fingerprint,parts:{},state:'pending'};
  let saves=Promise.resolve();
  const save=()=>{const content=JSON.stringify(journal,null,2);saves=saves.then(async()=>{const tmp=journalPath+'.'+crypto.randomUUID()+'.tmp',handle=await fs.open(tmp,'wx',0o600);try{await handle.writeFile(content);await handle.sync();}finally{await handle.close();}await fs.rename(tmp,journalPath);});return saves;};
  await save();
  try {
   onProgress({phase:'connecting',requestId});
   const upload=await request('/api/uploads',{method:'POST',body,signal});
   if(upload.partSize!==PART_SIZE)throw Error('Unsupported upload part size');
   journal.uploadId=upload.uploadId;await save();
   const tasks=[],unique=new Map(upload.files.map(f=>[f.sha256,f]));let uploadedBytes=0,totalBytes=[...unique.values()].reduce((n,f)=>n+f.size,0);
   for(const f of unique.values()) {
    journal.parts[f.sha256]={};
    for(const part of f.uploadedParts||[])journal.parts[f.sha256][part.partNumber]=part;
    if(f.complete){uploadedBytes+=f.size;continue;}
    const count=Math.max(1,Math.ceil(f.size/PART_SIZE));
    for(let partNumber=1;partNumber<=count;partNumber++) {
     const size=Math.min(PART_SIZE,f.size-(partNumber-1)*PART_SIZE);
     if(journal.parts[f.sha256][partNumber]){uploadedBytes+=size;continue;}
     tasks.push(async()=>{
      aborted(signal);const handle=await fs.open(sources.get(f.sha256),'r');let bytes;
      try{bytes=Buffer.alloc(size);const read=await handle.read(bytes,0,size,(partNumber-1)*PART_SIZE);if(read.bytesRead!==size)throw Error('Package file changed while uploading');}finally{await handle.close();}
      const receipt=await request('/api/uploads/'+upload.uploadId+'/files/'+f.sha256+'/parts/'+partNumber,{method:'PUT',body:bytes,headers:{'content-type':'application/octet-stream','x-part-sha256':sha(bytes)},signal});
      journal.parts[f.sha256][partNumber]=receipt;uploadedBytes+=size;await save();onProgress({phase:'uploading',uploadedBytes,totalBytes,requestId});
     });
    }
   }
   let cursor=0,failed;const run=async()=>{while(cursor<tasks.length&&!failed){try{aborted(signal);await tasks[cursor++]();}catch(error){failed=error;throw error;}}};
   await Promise.allSettled([run(),run()]);if(failed)throw failed;
   for(const f of unique.values()) {
    aborted(signal);onProgress({phase:'verifying',path:f.path,uploadedBytes,totalBytes,requestId});
    // Re-read even skipped/resumed bytes. A changed local source cannot publish.
    const integrity=await hashFile(sources.get(f.sha256),signal);
    if(integrity.sha256!==f.sha256||integrity.size!==f.size)throw Error('Package changed during publishing: '+f.path);
    if(!f.complete)await request('/api/uploads/'+upload.uploadId+'/files/'+f.sha256+'/complete',{method:'POST',body:{parts:Object.values(journal.parts[f.sha256]).sort((a,b)=>a.partNumber-b.partNumber)},signal});
   }
   aborted(signal);journal.state='committing';await save();onProgress({phase:'publishing',requestId});
   const result=await request('/api/uploads/'+upload.uploadId+'/commit',{method:'POST',body:{},signal});
   journal.state='complete';journal.result=result;await save();onProgress({phase:'complete',...result,requestId});return result;
  }catch(error){
   journal.state=signal?.aborted?'cancelled':'interrupted';journal.lastError=error.message;
   if(signal?.aborted&&journal.uploadId){try{journal.cancellation=await request('/api/uploads/'+journal.uploadId+'/cancel',{method:'POST',body:{},signal:AbortSignal.timeout(5000)});}catch{journal.serverCancellationPending=true;}}
   await save();throw error;
  }
 }
 return {
  status:({workspaceId,rootBoardId})=>request('/api/shares/status?'+new URLSearchParams({workspaceId,rootBoardId})),
  publish,
  setEnabled:({publicationId,expectedVersion,enabled})=>request('/api/shares/'+encodeURIComponent(publicationId)+'/enabled',{method:'POST',body:{expectedVersion,enabled}}),
  createPairing:()=>request('/api/pairings',{method:'POST',body:{}}),
  redeemPairing:({code})=>request('/api/pairings/redeem',{method:'POST',body:{code},authenticated:false}),
  cancelUpload:({uploadId})=>{if(!/^[a-f0-9]{64}$/.test(uploadId||''))throw Error('Invalid upload ID');return request('/api/uploads/'+uploadId+'/cancel',{method:'POST',body:{}});},
  async listJobs(){try{return await Promise.all((await fs.readdir(jobDirectory)).filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).map(async f=>JSON.parse(await fs.readFile(path.join(jobDirectory,f),'utf8'))));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
 };
}
module.exports={createShareClient,PART_SIZE};
