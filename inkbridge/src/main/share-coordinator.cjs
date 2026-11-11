const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createShareClient}=require('./share-client.cjs');
const {exportWebShare}=require('./web-share-export.cjs');
function createShareCoordinator({data,project,credentials,capture,load,onProgress=()=>{},exportPackage=exportWebShare,clientFactory=createShareClient}){
 const jobs=new Map(),exports=new Map(),directory=path.join(data,'SharePublishing');
 const id=value=>{if(typeof value!=='string'||!/^[\w-]{1,100}$/.test(value))throw Error('分享識別無效');return value;};
 async function client(){const config=await credentials.clientConfig();return {config,api:clientFactory({...config,jobDirectory:path.join(directory,'uploads')})};}
 async function status(boardId){const config=await credentials.status();if(!config.configured)return {...config,selection:[boardId],imagePreset:'clarity'};const {api}=await client(),graph=await load();return {...config,...await api.status({workspaceId:graph.workspaceId,rootBoardId:boardId})};}
 async function persist(job){await fs.mkdir(directory,{recursive:true});const target=path.join(directory,job.requestId+'.json'),tmp=target+'.'+crypto.randomUUID()+'.tmp',h=await fs.open(tmp,'wx',0o600);try{await h.writeFile(JSON.stringify(job));await h.sync();}finally{await h.close();}try{await fs.rename(tmp,target);}finally{await fs.rm(tmp,{force:true});}}
 async function run(job){
  if(jobs.has(job.requestId))return jobs.get(job.requestId).promise;
  const controller=new AbortController(),entry={controller};jobs.set(job.requestId,entry);
  entry.promise=(async()=>{try{
   const {api,config}=await client();if(job.baseUrl&&job.baseUrl!==config.baseUrl)throw Error('此待發布版本屬於另一個分享網站');
   const graph=JSON.parse(await fs.readFile(job.captureFile,'utf8'));if(!job.packageDirectory){
    onProgress({phase:'preparing',requestId:job.requestId,boardId:job.boardId});
    const pkg=await exportPackage({graph,rootBoardId:job.boardId,selectedBoardIds:job.selection,imagePreset:job.imagePreset,losslessImageIds:job.losslessImageIds,contentOnly:true,readerBuild:config.readerBuild,capturedAt:job.capturedAt,revision:graph.revision,workspaceDirectory:data,projectDirectory:project,outputDirectory:path.join(directory,'packages'),imageCacheDirectory:path.join(data,'ShareImageCache')});
    job.packageDirectory=pkg.directory;job.bytes=pkg.bytes;job.attachments=pkg.attachments;await persist(job);
    onProgress({phase:'prepared',requestId:job.requestId,boardId:job.boardId,bytes:pkg.bytes,attachmentCount:pkg.attachments?.length,attachments:pkg.attachments});
   }
   if(controller.signal.aborted)throw Error('發布已取消');
   const receipt=await api.publish({workspaceId:graph.workspaceId,rootBoardId:job.boardId,requestId:job.requestId,expectedVersion:job.expectedVersion,packageDirectory:job.packageDirectory,selection:job.selection,imagePreset:job.imagePreset,losslessImageIds:job.losslessImageIds,readerBuild:config.readerBuild,signal:controller.signal,onProgress:p=>onProgress({...p,boardId:job.boardId})});
   job.state='complete';job.receipt=receipt;await persist(job);const current=await load();return {...receipt,bytes:job.bytes,attachments:job.attachments,capturedAt:job.capturedAt,capturedRevision:graph.revision,localChanged:current.workspaceId!==graph.workspaceId||current.revision!==graph.revision};
  }catch(error){job.state=controller.signal.aborted?'cancelled':'interrupted';job.error=error.message;await persist(job);onProgress({phase:'error',requestId:job.requestId,boardId:job.boardId,message:error.message});throw error;}finally{jobs.delete(job.requestId);}})();return entry.promise;
 }
 async function call(request={}){
  const method=request.method;
  if(method==='configure'){
   const baseUrl=credentials.validateUrl(request.baseUrl),config=await credentials.status();
   if(request.pairingCode){const api=clientFactory({baseUrl,token:'',jobDirectory:path.join(directory,'uploads')});const result=await api.redeemPairing({code:request.pairingCode});return credentials.write({baseUrl,token:result.token,readerBuild:request.readerBuild||config.readerBuild||'inkbridge-reader-v1'});}
   throw Error('請使用已連線電腦產生的一次性配對碼');
  }
  if(method==='pair'){const {api}=await client();return api.createPairing();}
  const boardId=id(request.boardId);
  if(method==='status')return status(boardId);
  if(method==='tree')return require('./share-selection.cjs').getShareTree(await load(),boardId);
  if(method==='prepare'){
   const graph=await capture(),selected=require('./web-share-data.cjs').scopeWebShare(graph,boardId,{selectedBoardIds:request.selectedBoardIds||[boardId]});
   return {boards:selected.boardIds.length,attachmentCount:selected.files.length,sourceBytes:selected.files.reduce((n,f)=>n+f.size,0),revision:graph.revision,capturedAt:new Date().toISOString(),images:selected.files.filter(f=>f.type!=='pdf').map(f=>({id:f.id,name:f.name,type:f.type,size:f.size}))};
  }
  if(method==='setEnabled'){const {api}=await client();return api.setEnabled({publicationId:id(request.publicationId),expectedVersion:request.expectedVersion,enabled:!!request.enabled});}
  if(method==='cancel'){const job=jobs.get(id(request.requestId));job?.controller.abort();return {cancelled:!!job};}
  if(method==='open'){const destination=exports.get(request.exportId);if(!destination)throw Error('匯出資料夾不存在');return {directory:destination};}
  if(method==='resume'){const key=id(request.requestId),job=JSON.parse(await fs.readFile(path.join(directory,key+'.json'),'utf8'));if(job.boardId!==boardId||job.requestId!==key)throw Error('待發布版本不符');if(job.state==='cancelled')throw Error('發布已取消；請重新發布新的版本');return run(job);}
  if(method==='jobs'){try{return (await Promise.all((await fs.readdir(directory)).filter(f=>/^[\w-]+\.json$/.test(f)).map(async f=>JSON.parse(await fs.readFile(path.join(directory,f),'utf8'))))).filter(j=>j.boardId===boardId&&j.state!=='complete').map(j=>({requestId:j.requestId,state:j.state,capturedAt:j.capturedAt,error:j.error}));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  if(!['publish','offline','create'].includes(method))throw Error('分享操作無效');
  if(method==='publish')await credentials.clientConfig();
  const graph=await capture(),capturedAt=new Date().toISOString();
  const selection=Array.isArray(request.selectedBoardIds)?[...new Set([boardId,...request.selectedBoardIds.map(id)])]:[boardId];
  if(method!=='publish'){
   const result=await exportPackage({graph,rootBoardId:boardId,selectedBoardIds:method==='create'&&!request.selectedBoardIds?undefined:selection,imagePreset:request.imagePreset||'clarity',losslessImageIds:request.losslessImageIds||[],workspaceDirectory:data,projectDirectory:project,outputDirectory:path.join(data,'exports','web'),capturedAt,revision:graph.revision});
   const exportId=crypto.randomUUID();exports.set(exportId,result.directory);return {...result,exportId};
  }
  const requestId=id(request.requestId||crypto.randomUUID()),captureFile=path.join(directory,requestId+'.capture');await fs.mkdir(directory,{recursive:true});
  // wx prevents retrying an id with a different capture; resume always uses it.
  const h=await fs.open(captureFile,'wx');try{await h.writeFile(JSON.stringify(graph));await h.sync();}finally{await h.close();}
  const config=await credentials.status(),job={requestId,boardId,captureFile,capturedAt,selection,imagePreset:request.imagePreset||'clarity',losslessImageIds:request.losslessImageIds||[],expectedVersion:request.expectedVersion??null,baseUrl:config.baseUrl,state:'pending'};
  await persist(job);return run(job);
 }
 return {call,cancelAll:()=>{for(const entry of jobs.values())entry.controller.abort();}};
}
module.exports={createShareCoordinator};
