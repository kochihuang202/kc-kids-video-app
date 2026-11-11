// Cloudflare Pages advanced-mode Worker. SHARE_BUCKET must remain private.
const PART_SIZE = 8 * 1024 * 1024;
const MAX_PDF_SIZE = 512 * 1024 * 1024;
const MAX_IMAGE_SIZE = 64 * 1024 * 1024;
const MAX_GRAPH_SIZE = 16 * 1024 * 1024;
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async value => hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value));
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'content-type':'application/json', 'cache-control':'no-store', 'x-content-type-options':'nosniff'}});
function fail(status, message) { throw Object.assign(new Error(message), {status}); }
function required(value, name) { if (typeof value !== 'string' || !value || value.length > 200) fail(400, 'Invalid '+name); return value; }
async function read(bucket, key) { const o = await bucket.get(key); return o ? {value:await o.json(), etag:o.etag} : null; }
async function write(bucket, key, value, etag) { return bucket.put(key, JSON.stringify(value), {onlyIf:etag ? {etagMatches:etag} : {etagDoesNotMatch:'*'}, httpMetadata:{contentType:'application/json'}}); }
function currentKey(id) { return 'publications/'+id+'/current'; }
async function current(env,id) { return read(env.SHARE_BUCKET,currentKey(id)); }
function publicStatus(url, value) { return {publicationId:value.publicationId,version:value.version,enabled:value.enabled,rootBoardId:value.rootBoardId,readerBuild:value.readerBuild,selection:value.selection,imagePreset:value.imagePreset,losslessImageIds:value.losslessImageIds||[],capturedAt:value.capturedAt,publishedAt:value.publishedAt,url:url.origin+'/s/'+value.publicationId+'/?shareId='+encodeURIComponent(value.rootBoardId)}; }
async function identity(url, workspaceId, rootBoardId) { return (await sha(JSON.stringify([url.origin,required(workspaceId,'workspaceId'),required(rootBoardId,'rootBoardId')]))).slice(0,40); }
async function authenticate(request, env) {
 const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if (!token) fail(401,'Device pairing required');
 const hash = await sha(token);
 if (env.BOOTSTRAP_TOKEN_SHA256 && hash === env.BOOTSTRAP_TOKEN_SHA256) return 'owner';
 const device = await read(env.SHARE_BUCKET,'devices/'+hash);
 if (!device || device.value.revoked) fail(401,'Device token invalid');
 return device.value.owner;
}
function validateManifest(m) {
 if (!m || m.format !== 'inkbridge-share-package' || m.version !== 1 || !Array.isArray(m.files) || !m.files.length || m.files.length > 10000) fail(400,'Invalid package manifest');
 required(m.rootBoardId,'rootBoardId');
 if (!/^[A-Za-z0-9._-]+$/.test(required(m.readerBuild,'readerBuild'))) fail(400,'Invalid readerBuild');
 const paths = new Set();
 for (const f of m.files) {
  if (!f||typeof f.path!=='string'||!(f.path === 'share.json' || /^assets\/[A-Za-z0-9._/-]+$/.test(f.path)) || f.path.split('/').some(s=>s==='..'||s==='.'||!s) || paths.has(f.path)) fail(400,'Invalid or duplicate file path');
  paths.add(f.path);
  if (!/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size < 0 || Math.ceil(f.size/PART_SIZE)>10000) fail(400,'Invalid file integrity metadata');
  const extension=f.path.match(/\.([a-z0-9]+)$/)?.[1],mime={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',json:'application/json'}[extension];
  if(!mime||f.contentType!==mime)fail(400,'Unsupported publication file type');
  if(f.size>(f.path==='share.json'?MAX_GRAPH_SIZE:extension==='pdf'?MAX_PDF_SIZE:MAX_IMAGE_SIZE))fail(400,'Publication file exceeds size limit');
 }
 if (!paths.has('share.json')) fail(400,'Missing share.json');
}
async function verified(env, f) { const o=await env.SHARE_BUCKET.head('objects/'+f.sha256); return o?.size === f.size && o.customMetadata?.sha256 === f.sha256 && o.checksums?.sha256 && hex(o.checksums.sha256)===f.sha256; }
async function session(env, id, owner) { const s=await read(env.SHARE_BUCKET,'uploads/'+id+'/session'); if (!s || s.value.owner!==owner) fail(404,'Upload missing'); return s.value; }
async function activeSession(env,id,owner) { const s=await session(env,id,owner);if(s.cancelled)fail(410,'Upload cancelled; create a new publication request');return s; }
async function boundedBytes(request,limit) {
 const reader=request.body?.getReader();if(!reader)return new ArrayBuffer(0);
 const chunks=[];let length=0;
 try {for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();fail(413,'Request body exceeds upload part limit');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result.buffer;
}
async function boundedJSON(request){try{return JSON.parse(new TextDecoder().decode(await boundedBytes(request,4*1024*1024)));}catch(error){if(error.status)throw error;fail(400,'Invalid JSON request');}}
async function uploadStatus(env,s) {
 const files=[];
 for (const f of s.manifest.files) {
  const uploadedParts=[];let cursor;
  do {const receipts=await env.SHARE_BUCKET.list({prefix:'uploads/'+s.uploadId+'/parts/'+f.sha256+'/',cursor});
   for(const o of receipts.objects)uploadedParts.push((await read(env.SHARE_BUCKET,o.key)).value);
   cursor=receipts.truncated?receipts.cursor:undefined;
  }while(cursor);
  files.push({...f,complete:await verified(env,f),uploadedParts});
 }
 return {uploadId:s.uploadId,publicationId:s.publicationId,partSize:PART_SIZE,files};
}
async function api(request, env, url) {
 const p=url.pathname;
 if (p==='/api/pairings/redeem' && request.method==='POST') {
  const {code}=await boundedJSON(request); if (!/^[a-f0-9]{32}$/.test(code||'')) fail(400,'Invalid pairing code');
  const key='pairings/'+await sha(code), pair=await read(env.SHARE_BUCKET,key);
  if (!pair || pair.value.used || pair.value.expiresAt<Date.now()) fail(410,'Pairing code expired or used');
  if (!await write(env.SHARE_BUCKET,key,{...pair.value,used:true},pair.etag)) fail(410,'Pairing code already used');
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  await write(env.SHARE_BUCKET,'devices/'+await sha(token),{owner:pair.value.owner,createdAt:Date.now(),revoked:false});
  return json({token});
 }
 const owner=await authenticate(request,env);
 if (p==='/api/pairings' && request.method==='POST') {
  const code=hex(crypto.getRandomValues(new Uint8Array(16))),expiresAt=Date.now()+5*60*1000;
  await write(env.SHARE_BUCKET,'pairings/'+await sha(code),{owner,expiresAt,used:false}); return json({code,expiresAt});
 }
 if (p==='/api/shares/status' && request.method==='GET') {
  const id=await identity(url,url.searchParams.get('workspaceId'),url.searchParams.get('rootBoardId')), c=await current(env,id);
  return json(c ? publicStatus(url,c.value) : null);
 }
 if (p==='/api/uploads' && request.method==='POST') {
  const b=await boundedJSON(request); validateManifest(b.manifest);
  if(b.losslessImageIds!==undefined&&(!Array.isArray(b.losslessImageIds)||b.losslessImageIds.length>10000||b.losslessImageIds.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))))fail(400,'Invalid image settings');
  if (b.rootBoardId!==b.manifest.rootBoardId) fail(400,'Root board mismatch');
  const publicationId=await identity(url,b.workspaceId,b.rootBoardId), uploadId=await sha(JSON.stringify([owner,publicationId,required(b.requestId,'requestId')]));
  const key='uploads/'+uploadId+'/session',old=await read(env.SHARE_BUCKET,key), fingerprint=await sha(JSON.stringify(b));
  if (old && old.value.fingerprint!==fingerprint) fail(409,'Request id reused for different package');
  if (!old) {
   const c=await current(env,publicationId); if ((c?.value.version??null)!==(b.expectedVersion??null)) fail(409,'Publication changed; refresh before publishing');
   await write(env.SHARE_BUCKET,key,{...b,owner,publicationId,uploadId,fingerprint,createdAt:Date.now()});
  }
  const stored=await activeSession(env,uploadId,owner);
  if(stored.fingerprint!==fingerprint)fail(409,'Request id reused concurrently for different package');
  return json(await uploadStatus(env,stored));
 }
 let cancel=p.match(/^\/api\/uploads\/([a-f0-9]{64})\/cancel$/);
 if(cancel&&request.method==='POST') {
  const key='uploads/'+cancel[1]+'/session',record=await read(env.SHARE_BUCKET,key),s=await session(env,cancel[1],owner),c=await current(env,s.publicationId);
  if(c?.value.requestId===s.requestId)return json({cancelled:false,committed:true,status:publicStatus(url,c.value)});
  if(!s.cancelled&&!await write(env.SHARE_BUCKET,key,{...s,cancelled:true},record.etag))fail(409,'Upload state changed');
  for(const f of s.manifest.files){const state=await read(env.SHARE_BUCKET,'uploads/'+s.uploadId+'/files/'+f.sha256);if(state){try{await env.SHARE_BUCKET.resumeMultipartUpload(state.value.key,state.value.uploadId).abort();}catch{}await env.SHARE_BUCKET.delete(state.value.key);}}
  return json({cancelled:true,committed:false});
 }
 let m=p.match(/^\/api\/uploads\/([a-f0-9]{64})\/files\/([a-f0-9]{64})\/(parts\/(\d+)|complete)$/);
 if (m) {
  const s=await activeSession(env,m[1],owner), f=s.manifest.files.find(f=>f.sha256===m[2]); if (!f) fail(404,'File outside package');
  const prefix='uploads/'+s.uploadId, stateKey=prefix+'/files/'+f.sha256, staging='staging/'+s.uploadId+'/'+f.sha256;
  if (await verified(env,f)) return json({complete:true});
  let state=await read(env.SHARE_BUCKET,stateKey);
  if (!state) {
   const upload=await env.SHARE_BUCKET.createMultipartUpload(staging);
   if (!await write(env.SHARE_BUCKET,stateKey,{uploadId:upload.uploadId,key:staging})) await upload.abort();
   state=await read(env.SHARE_BUCKET,stateKey);
  }
  const multipart=env.SHARE_BUCKET.resumeMultipartUpload(state.value.key,state.value.uploadId);
  if (m[4] && request.method==='PUT') {
   const partNumber=Number(m[4]),count=Math.max(1,Math.ceil(f.size/PART_SIZE));
   if (partNumber<1||partNumber>count) fail(400,'Invalid part number');
   const bytes=await boundedBytes(request,PART_SIZE),expected=partNumber===count ? f.size-(count-1)*PART_SIZE : PART_SIZE;
   if (bytes.byteLength!==expected || bytes.byteLength>PART_SIZE) fail(400,'Invalid part size');
   const digest=await sha(bytes); if (digest!==request.headers.get('x-part-sha256')) fail(422,'Part SHA-256 mismatch');
   const claimKey=prefix+'/partclaims/'+f.sha256+'/'+String(partNumber).padStart(5,'0');
   await write(env.SHARE_BUCKET,claimKey,{sha256:digest});
   if((await read(env.SHARE_BUCKET,claimKey)).value.sha256!==digest)fail(409,'Part differs from earlier upload');
   const receiptKey=prefix+'/parts/'+f.sha256+'/'+String(partNumber).padStart(5,'0'),existing=await read(env.SHARE_BUCKET,receiptKey);
   if (existing) {if(existing.value.sha256!==digest) fail(409,'Part differs from earlier upload'); return json(existing.value);}
   const part=await multipart.uploadPart(partNumber,bytes),receipt={...part,sha256:digest};
   await write(env.SHARE_BUCKET,receiptKey,receipt); return json(receipt);
  }
  if (m[3]==='complete' && request.method==='POST') {
   const {parts}=await boundedJSON(request),count=Math.max(1,Math.ceil(f.size/PART_SIZE));
   if (!Array.isArray(parts)||parts.length!==count) fail(400,'Incomplete part list');
   for (let i=0;i<count;i++) {
    const receipt=await read(env.SHARE_BUCKET,prefix+'/parts/'+f.sha256+'/'+String(i+1).padStart(5,'0'));
    if (!receipt || parts[i].partNumber!==i+1 || receipt.value.etag!==parts[i].etag || receipt.value.sha256!==parts[i].sha256) fail(422,'Part receipt mismatch');
   }
   if (!await env.SHARE_BUCKET.head(staging)) await multipart.complete(parts.map(({partNumber,etag})=>({partNumber,etag})));
   const source=await env.SHARE_BUCKET.get(staging);
   if(source.size!==f.size)fail(422,'Full source size mismatch');
   // The R2 storage service checks the complete received stream against SHA-256
   // before accepting CAS. Unlike hashing 512 MiB in this Worker, this does not
   // consume the publishing Worker's JavaScript CPU/memory budget.
   try{await env.SHARE_BUCKET.put('objects/'+f.sha256,source.body,{sha256:f.sha256,onlyIf:{etagDoesNotMatch:'*'},customMetadata:{sha256:f.sha256},httpMetadata:{contentType:f.contentType||'application/octet-stream'}});}
   catch(error){if(/checksum|sha-?256|digest/i.test(error.message))fail(422,'Full source SHA-256 mismatch');throw error;}
   if(!await verified(env,f))fail(422,'Verified object checksum unavailable');
   await env.SHARE_BUCKET.delete(staging); return json({complete:true,sha256:f.sha256});
  }
  fail(405,'Method not allowed');
 }
 m=p.match(/^\/api\/uploads\/([a-f0-9]{64})\/commit$/);
 if (m && request.method==='POST') {
  const s=await activeSession(env,m[1],owner), c=await current(env,s.publicationId);
  if(c?.value.requestId===s.requestId) return json(publicStatus(url,c.value));
  if((c?.value.version??null)!==(s.expectedVersion??null)) fail(409,'Publication changed; prior version retained');
  for(const f of s.manifest.files) if(!await verified(env,f)) fail(422,'Package file not verified: '+f.path);
  const dataFile=s.manifest.files.find(f=>f.path==='share.json'),data=await (await env.SHARE_BUCKET.get('objects/'+dataFile.sha256)).json();
  if(data.format!=='inkbridge-web-share'||data.rootBoardId!==s.rootBoardId||!Array.isArray(data.boardIds)||!data.boardIds.includes(s.rootBoardId)||data.boardIds.some(id=>typeof id!=='string'||!id||id.length>200)||new Set(data.boardIds).size!==data.boardIds.length||!Array.isArray(data.attachments)) fail(422,'Invalid share graph');
  const graphFiles=[];
  for(const a of data.attachments||[]){
   graphFiles.push({path:a.path,sha256:a.sha256,size:a.size});
   if(a.preview_path!==undefined)graphFiles.push({path:a.preview_path,sha256:a.preview_sha256,size:a.preview_size});
  }
  for(const a of graphFiles)if(!s.manifest.files.some(f=>f.path===a.path&&f.sha256===a.sha256&&f.size===a.size)) fail(422,'Attachment missing from manifest');
  const allowed=new Set(data.boardIds);
  if(!Array.isArray(data.graph?.boards)||data.graph.boards.some(b=>!allowed.has(b.id))||new Set(data.graph.boards.map(b=>b.id)).size!==allowed.size||data.graph.boards.length!==allowed.size) fail(422,'Board membership mismatch');
  for(const row of data.graph.instances||[])if(!allowed.has(row.boardId))fail(422,'Card outside board membership');
  for(const row of data.graph.whiteboardInstances||[]){
   if(!allowed.has(row.containerId))fail(422,'Nested board outside membership');
   if(row.isUnshared===true){const keys=new Set(['id','containerId','containerType','whiteboardId','x','y','width','height','isUnshared','name']);if(allowed.has(row.whiteboardId)||row.name!=='未分享'||Object.keys(row).some(k=>!keys.has(k)))fail(422,'Unsafe unshared placeholder');}
   else if(!allowed.has(row.whiteboardId))fail(422,'Nested board outside membership');
  }
  for(const field of ['sections','textElements','drawingStrokes','connections'])for(const row of data.graph[field]||[])if(!allowed.has(row.whiteboardId||row.boardId))fail(422,'Element outside board membership');
  for(const row of data.graph.mindmapInstances||[])if(!allowed.has(row.whiteboardId))fail(422,'Mindmap outside board membership');
  const contentIds=new Set((data.graph.instances||[]).map(r=>r.contentId));
  for(const row of [...(data.graph.contents||[]),...(data.graph.cardMetadata||[])])if(!contentIds.has(row.id))fail(422,'Content outside board membership');
  for(const f of s.manifest.files) if(f.path!=='share.json'&&!graphFiles.some(a=>a.path===f.path&&a.sha256===f.sha256&&a.size===f.size)) fail(422,'File outside attachment membership');
  const value={publicationId:s.publicationId,workspaceId:s.workspaceId,rootBoardId:s.rootBoardId,version:crypto.randomUUID(),enabled:true,requestId:s.requestId,readerBuild:s.manifest.readerBuild,manifest:s.manifest,boardIds:data.boardIds,selection:s.selection,imagePreset:s.imagePreset,losslessImageIds:s.losslessImageIds||[],capturedAt:s.capturedAt||null,publishedAt:new Date().toISOString(),createdAt:Date.now()};
  await write(env.SHARE_BUCKET,'publications/'+s.publicationId+'/versions/'+value.version,value);
  await activeSession(env,m[1],owner);
  if(!await write(env.SHARE_BUCKET,currentKey(s.publicationId),value,c?.etag)) fail(409,'Concurrent publication won; prior current retained');
  return json(publicStatus(url,value));
 }
 m=p.match(/^\/api\/shares\/([a-f0-9]{40})\/enabled$/);
 if(m&&request.method==='POST') {
  const b=await boundedJSON(request),c=await current(env,m[1]); if(!c) fail(404,'Publication missing');
  if(typeof b.enabled!=='boolean'||b.expectedVersion!==c.value.version) fail(409,'Publication changed');
  const value={...c.value,version:crypto.randomUUID(),enabled:b.enabled};
  await write(env.SHARE_BUCKET,'publications/'+m[1]+'/versions/'+value.version,value);
  if(!await write(env.SHARE_BUCKET,currentKey(m[1]),value,c.etag)) fail(409,'Publication changed');
  return json(publicStatus(url,value));
 }
 fail(404,'Unknown endpoint');
}
async function publicShare(request,env,url,m) {
 if(!['GET','HEAD'].includes(request.method)) fail(405,'Read only');
 const c=await current(env,m[1]); if(!c?.value.enabled) fail(404,'Share unavailable');
 const v=c.value,board=url.searchParams.get('shareId');if(board&&!v.boardIds.includes(board)) fail(404,'Board not published');
 if(url.searchParams.has('v')&&url.searchParams.get('v')!==v.version) fail(409,'Share updated; reload the page');
 let resource=decodeURIComponent(m[2]||'');
 if(!resource||resource==='index.html') {
  if(!env.ASSETS) fail(503,'Reader assets unavailable');
  const readerUrl=new URL('/reader/'+v.readerBuild+'/index.html',url);
  const result=await env.ASSETS.fetch(new Request(readerUrl,{method:request.method})),headers=new Headers(result.headers);
  headers.set('cache-control','no-store');headers.set('x-content-type-options','nosniff');
  if(request.method==='HEAD'||result.status!==200)return new Response(result.body,{status:result.status,headers});
  // Runtime resources belong to the immutable reader build, while viewer.mjs
  // derives share.json and attachment paths from the visible /s/<id>/ URL.
  headers.delete('content-length');headers.delete('etag');
  return new HTMLRewriter().on('head',{element(element){element.prepend('<base href="/reader/'+v.readerBuild+'/">',{html:true});}}).transform(new Response(result.body,{status:result.status,headers}));
 }
 const f=v.manifest.files.find(f=>f.path===resource);if(!f) fail(404,'Resource outside current membership');
 if(resource==='share.json') {
  const data=await (await env.SHARE_BUCKET.get('objects/'+f.sha256)).json();
  const response=json({...data,publicationVersion:v.version,publishedAt:v.publishedAt});
  return request.method==='HEAD'?new Response(null,{headers:response.headers}):response;
 }
 let range;
 if(request.headers.has('range')){
  const parsed=request.headers.get('range').match(/^bytes=(\d*)-(\d*)$/);let start,end;
  if(parsed&&(parsed[1]||parsed[2])){
   if(!parsed[1]){const suffix=Number(parsed[2]);if(Number.isSafeInteger(suffix)&&suffix>0){start=Math.max(0,f.size-suffix);end=f.size-1;}}
   else{start=Number(parsed[1]);end=parsed[2]?Math.min(Number(parsed[2]),f.size-1):f.size-1;}
  }
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=f.size||end<start)return new Response(null,{status:416,headers:{'content-range':'bytes */'+f.size,'cache-control':'no-store'}});
  range={offset:start,length:end-start+1};
 }
 const object=await env.SHARE_BUCKET.get('objects/'+f.sha256,range?{range}:{});if(!object) fail(404,'Resource missing');
 const headers=new Headers({'content-type':f.contentType||(resource==='share.json'?'application/json':'application/octet-stream'),'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','accept-ranges':'bytes','etag':object.httpEtag});
 let status=200;
 if(request.headers.has('range')&&object.range){const start=object.range.offset??Math.max(0,object.size-object.range.suffix),length=object.range.length??object.range.suffix;headers.set('content-range',`bytes ${start}-${start+length-1}/${object.size}`);headers.set('content-length',String(length));status=206;}else headers.set('content-length',String(object.size));
 return new Response(request.method==='HEAD'?null:object.body,{status,headers});
}
export default {async fetch(request,env) {try {
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/')) return await api(request,env,url);
 const m=url.pathname.match(/^\/s\/([a-f0-9]{40})(?:\/(.*))?$/);if(m)return await publicShare(request,env,url,m);
 if(url.pathname.startsWith('/reader/')&&env.ASSETS)return env.ASSETS.fetch(request);
 if(url.pathname==='/health')return json({ok:true,service:'inkbridge-share',protocol:1});
 fail(404,'Not found');
 }catch(error){return json({error:error.status?error.message:'Sharing service error'},error.status||500);}}};
