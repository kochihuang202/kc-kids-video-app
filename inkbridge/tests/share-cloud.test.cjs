const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {createShareClient,PART_SIZE}=require('../src/main/share-client.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('real local workerd/R2: multipart SHA, resume, pairing, stable identity, conflicts, current membership and revocation',async()=>{
 const config={modules:true,scriptPath:path.resolve(__dirname,'../share-site/_worker.js'),compatibilityDate:'2026-08-28',r2Buckets:['SHARE_BUCKET'],bindings:{BOOTSTRAP_TOKEN_SHA256:hash('synthetic-bootstrap')},serviceBindings:{ASSETS:()=>new Response('<!doctype html><html><head><script type="module" src="./viewer.mjs"></script></head><body>reader</body></html>',{headers:{'content-type':'text/html'}})}};
 const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(config):config);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-share-cloud-'));
 try {
  const dispatch=(url,init)=>mf.dispatchFetch(url,init),baseUrl='https://synthetic.test',jobs=path.join(dir,'jobs');
  let interrupt=true,puts=0;
  const client=createShareClient({baseUrl,token:'synthetic-bootstrap',jobDirectory:jobs,fetch:async(url,init)=>{if(init?.method==='PUT'){puts++;if(interrupt&&puts===2)throw Error('synthetic network interruption');}return dispatch(url,init);}});
  const packageDirectory=path.join(dir,'package');await fs.mkdir(path.join(packageDirectory,'assets'),{recursive:true});
  const attachment=Buffer.alloc(PART_SIZE+333,7),assetHash=hash(attachment),assetPath='assets/'+assetHash+'.pdf';
  const data={format:'inkbridge-web-share',version:1,rootBoardId:'root',boardIds:['root','child'],graph:{boards:[{id:'root'},{id:'child'}]},attachments:[{source_file_id:assetHash,path:assetPath,size:attachment.length,sha256:assetHash}]};
  const graph=Buffer.from(JSON.stringify(data));
  await fs.writeFile(path.join(packageDirectory,'share.json'),graph);await fs.writeFile(path.join(packageDirectory,assetPath),attachment);
  await fs.writeFile(path.join(packageDirectory,'package-manifest.json'),JSON.stringify({format:'inkbridge-share-package',version:1,rootBoardId:'root',readerBuild:'test-native',capturedAt:'2026-11-11T00:00:00.000Z',files:[{path:'share.json',size:graph.length,sha256:hash(graph)},{path:assetPath,size:attachment.length,sha256:assetHash}]}));
  assert.equal(await client.status({workspaceId:'w',rootBoardId:'root'}),null);
  const opts={workspaceId:'w',rootBoardId:'root',requestId:'first',expectedVersion:null,packageDirectory,selection:{child:true},imagePreset:'original'};
  await assert.rejects(client.publish(opts),/synthetic network interruption/);interrupt=false;
  const first=await client.publish(opts);assert.equal(first.enabled,true);assert.deepEqual(first.selection,{child:true});assert.equal(first.imagePreset,'original');assert.equal(first.capturedAt,'2026-11-11T00:00:00.000Z');
  assert.deepEqual(await client.publish(opts),first,'same request id commit idempotent');
  const pub=new URL(first.url),prefix=pub.origin+pub.pathname;
  const index=await dispatch(prefix);assert.equal(index.status,200);assert.match(await index.text(),/<base href="\/reader\/test-native\/">/);
  const shared=await dispatch(prefix+'share.json?shareId=child');assert.equal(shared.status,200);assert.equal((await shared.json()).publicationVersion,first.version);
  assert.equal((await dispatch(prefix+'share.json?shareId=private')).status,404);
  assert.equal((await dispatch(baseUrl+'/objects/'+assetHash)).status,404);
  assert.equal((await dispatch(prefix+'assets/private.pdf')).status,404);
  const ranged=await dispatch(prefix+assetPath+'?v='+first.version,{headers:{range:'bytes=7-19'}});assert.equal(ranged.status,206);assert.equal((await ranged.arrayBuffer()).byteLength,13);
  assert.equal((await dispatch(prefix+assetPath,{headers:{range:'bytes=999999999-'}})).status,416);assert.equal((await dispatch(prefix+assetPath,{headers:{range:'bytes=0-1,7-8'}})).status,416);
  const pair=await client.createPairing(),redeemed=await client.redeemPairing({code:pair.code});assert.ok(redeemed.token);await assert.rejects(client.redeemPairing({code:pair.code}),e=>e.status===410);
  const secondDevice=createShareClient({baseUrl,token:redeemed.token,jobDirectory:jobs,fetch:dispatch});assert.equal((await secondDevice.status({workspaceId:'w',rootBoardId:'root'})).publicationId,first.publicationId);
  await assert.rejects(secondDevice.publish({...opts,requestId:'stale',expectedVersion:'wrong'}),e=>e.status===409);
  const disabled=await secondDevice.setEnabled({publicationId:first.publicationId,expectedVersion:first.version,enabled:false});
  assert.equal((await dispatch(prefix+assetPath)).status,404);assert.equal((await dispatch(prefix+'share.json')).status,404);
  await assert.rejects(client.setEnabled({publicationId:first.publicationId,expectedVersion:first.version,enabled:true}),e=>e.status===409);
  const enabled=await client.setEnabled({publicationId:first.publicationId,expectedVersion:disabled.version,enabled:true});
  assert.equal((await dispatch(prefix+assetPath+'?v='+first.version)).status,409);
  assert.equal((await dispatch(prefix+assetPath+'?v='+enabled.version)).status,200);
  const bucket=await mf.getR2Bucket('SHARE_BUCKET'),proof=await bucket.head('objects/'+assetHash);assert.equal(proof.customMetadata.sha256,assetHash);assert.equal(Buffer.from(proof.checksums.sha256).toString('hex'),assetHash);
  assert.ok((await client.listJobs()).some(j=>j.state==='complete'));
 }finally{await mf.dispose();await fs.rm(dir,{recursive:true,force:true});}
});

test('real local R2: hostile manifests, corrupt bytes, cancellation, simultaneous publication and pairing races preserve current',async()=>{
 const config={modules:true,scriptPath:path.resolve(__dirname,'../share-site/_worker.js'),compatibilityDate:'2026-08-28',r2Buckets:['SHARE_BUCKET'],bindings:{BOOTSTRAP_TOKEN_SHA256:hash('synthetic-bootstrap')}};
 const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(config):config),dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-share-adversarial-'));
 const baseUrl='https://synthetic.test',headers={authorization:'Bearer synthetic-bootstrap','content-type':'application/json'};
 const call=(route,body,method='POST',extra={})=>mf.dispatchFetch(baseUrl+route,{method,headers:{...headers,...extra},body:Buffer.isBuffer(body)?body:JSON.stringify(body)});
 const client=createShareClient({baseUrl,token:'synthetic-bootstrap',jobDirectory:path.join(dir,'jobs'),fetch:(url,init)=>mf.dispatchFetch(url,init)});
 async function pkg(name,root='root',extra={}){
  const folder=path.join(dir,name);await fs.mkdir(folder);const data={format:'inkbridge-web-share',version:1,rootBoardId:root,boardIds:[root],graph:{boards:[{id:root}]},attachments:[],...extra},b=Buffer.from(JSON.stringify(data));
  await fs.writeFile(path.join(folder,'share.json'),b);const manifest={format:'inkbridge-share-package',version:1,rootBoardId:root,readerBuild:'test-native',files:[{path:'share.json',size:b.length,sha256:hash(b),contentType:'application/json'}]};
  await fs.writeFile(path.join(folder,'package-manifest.json'),JSON.stringify(manifest));return {folder,manifest,b};
 }
 try {
  const p=await pkg('first'),opts={workspaceId:'w',rootBoardId:'root',requestId:'valid',packageDirectory:p.folder,expectedVersion:null},first=await client.publish(opts);
  const originalStatus=()=>client.status({workspaceId:'w',rootBoardId:'root'});
  const begin=(requestId,manifest=p.manifest)=>({workspaceId:'w',rootBoardId:'root',requestId,expectedVersion:first.version,manifest});
  for(const pathName of ['assets/../secret.pdf','assets/a//b.pdf','assets/evil.html']){
   assert.equal((await call('/api/uploads',begin('unsafe-'+pathName,{...p.manifest,files:[...p.manifest.files,{path:pathName,sha256:hash('x'),size:1,contentType:'application/pdf'}]}))).status,400);
  }
  assert.equal((await call('/api/uploads',begin('duplicate',{...p.manifest,files:[...p.manifest.files,...p.manifest.files]}))).status,400);
  assert.equal((await call('/api/uploads',begin('oversize',{...p.manifest,files:[...p.manifest.files,{path:'assets/large.pdf',sha256:hash('large'),size:512*1024*1024+1,contentType:'application/pdf'}]}))).status,400);
  const expected=Buffer.from('expected'),actual=Buffer.from('corrupt!'),badHash=hash(expected),badManifest={...p.manifest,files:[...p.manifest.files,{path:'assets/'+badHash+'.pdf',size:actual.length,sha256:badHash,contentType:'application/pdf'}]};
  const upload=await(await call('/api/uploads',begin('bad-full-hash',badManifest))).json(),partRoute='/api/uploads/'+upload.uploadId+'/files/'+badHash;
  assert.equal((await call(partRoute+'/parts/1',actual,'PUT',{'content-type':'application/octet-stream','x-part-sha256':hash('wrong')})).status,422);
  const receipt=await(await call(partRoute+'/parts/1',actual,'PUT',{'content-type':'application/octet-stream','x-part-sha256':hash(actual)})).json();
  assert.equal((await call(partRoute+'/complete',{parts:[{...receipt,partNumber:2}]})).status,422);
  assert.equal((await call(partRoute+'/complete',{parts:[receipt]})).status,422,'ETag/part digests cannot fake full source SHA');
  assert.equal((await call('/api/uploads/'+upload.uploadId+'/commit',{})).status,422);
  assert.equal((await originalStatus()).version,first.version);
  const cancelled=await(await call('/api/uploads/'+upload.uploadId+'/cancel',{})).json();assert.equal(cancelled.cancelled,true);
  assert.equal((await call(partRoute+'/parts/1',actual,'PUT',{'content-type':'application/octet-stream','x-part-sha256':hash(actual)})).status,410);
  assert.equal((await call('/api/uploads/'+upload.uploadId+'/commit',{})).status,410);
  // A real pointer CAS determines the winner, not timestamps or client order.
  const races=await Promise.allSettled([client.publish({...opts,requestId:'race-a',expectedVersion:first.version}),client.publish({...opts,requestId:'race-b',expectedVersion:first.version})]);
  assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
  const winner=await originalStatus(),other=await pkg('other','another-root');
  const another=await client.publish({...opts,rootBoardId:'another-root',requestId:'other-root',expectedVersion:null,packageDirectory:other.folder});assert.notEqual(another.publicationId,winner.publicationId);assert.equal((await originalStatus()).version,winner.version);
  const pair=await client.createPairing(),redeems=await Promise.allSettled([client.redeemPairing({code:pair.code}),client.redeemPairing({code:pair.code})]);assert.equal(redeems.filter(r=>r.status==='fulfilled').length,1);assert.equal(redeems.filter(r=>r.status==='rejected'&&r.reason.status===410).length,1);
  const excluded=await pkg('placeholder','root',{graph:{boards:[{id:'root'}],whiteboardInstances:[{id:'reference',containerId:'root',containerType:'whiteboard',whiteboardId:'excluded',x:0,y:0,width:100,height:100,isUnshared:true,name:'未分享'}]}});
  const placeholder=await client.publish({...opts,requestId:'placeholder',expectedVersion:winner.version,packageDirectory:excluded.folder});
  const publicJSON=await(await mf.dispatchFetch(new URL('share.json',placeholder.url))).json();assert.equal(publicJSON.graph.boards.length,1);assert.equal(publicJSON.graph.whiteboardInstances[0].name,'未分享');
  assert.equal((await mf.dispatchFetch(new URL('share.json?shareId=excluded',placeholder.url))).status,404);
  const leaked=await pkg('leaked-placeholder','root',{graph:{boards:[{id:'root'}],whiteboardInstances:[{id:'ref',containerId:'root',whiteboardId:'excluded',isUnshared:true,name:'未分享',backgroundImage:'private-preview'}]}});
  await assert.rejects(client.publish({...opts,requestId:'leaked-placeholder',expectedVersion:placeholder.version,packageDirectory:leaked.folder}),e=>e.status===422);
  assert.equal((await originalStatus()).version,placeholder.version);
  const sameRequest={...begin('same-id-race'),expectedVersion:placeholder.version};
  const sameRace=await Promise.all([call('/api/uploads',{...sameRequest,imagePreset:'clarity'}),call('/api/uploads',{...sameRequest,imagePreset:'compact'})]);assert.deepEqual(sameRace.map(r=>r.status).sort(),[200,409]);
  const cancellable=await pkg('cancel-client','cancel-root'),controller=new AbortController();
  await assert.rejects(client.publish({...opts,rootBoardId:'cancel-root',requestId:'client-abort',expectedVersion:null,packageDirectory:cancellable.folder,signal:controller.signal,onProgress:p=>{if(p.phase==='uploading')controller.abort(Error('intentional user cancellation'));}}),/intentional user cancellation/);
  const cancelledJob=(await client.listJobs()).find(j=>j.requestId==='client-abort');assert.equal(cancelledJob.state,'cancelled');assert.equal(cancelledJob.cancellation.cancelled,true);assert.equal(await client.status({workspaceId:'w',rootBoardId:'cancel-root'}),null);
  const changed=await pkg('changed-source','changed-root');let changedOnce=false;
  await assert.rejects(client.publish({...opts,rootBoardId:'changed-root',requestId:'source-changed',expectedVersion:null,packageDirectory:changed.folder,onProgress:p=>{if(p.phase==='uploading'&&!changedOnce){changedOnce=true;require('node:fs').appendFileSync(path.join(changed.folder,'share.json'),' ');}}}),/Package changed during publishing/);
  assert.equal(await client.status({workspaceId:'w',rootBoardId:'changed-root'}),null);
 }finally{await mf.dispose();await fs.rm(dir,{recursive:true,force:true});}
});

test('512 MiB real PDF uploads in bounded parts and verifies full streamed source in real local R2',{skip:process.env.INKBRIDGE_TEST_LARGE_SHARE!=='1'},async()=>{
 const config={modules:true,scriptPath:path.resolve(__dirname,'../share-site/_worker.js'),compatibilityDate:'2026-08-28',r2Buckets:['SHARE_BUCKET'],bindings:{BOOTSTRAP_TOKEN_SHA256:hash('synthetic-bootstrap')}};
 const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(config):config),dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-share-512MiB-'));
 let pulse=0,timer=setInterval(()=>pulse++,10),puts=0,maxPart=0;
 try{
  await fs.mkdir(path.join(dir,'assets'));const temp=path.join(dir,'assets/source.pdf'),size=512*1024*1024;
  await require('./helpers/large-pdf-fixture.cjs')(temp,size);const info=await require('../src/main/stream-files.cjs').scanFile(temp),asset='assets/'+info.sha256+'.pdf';await fs.rename(temp,path.join(dir,asset));
  const data={format:'inkbridge-web-share',version:1,rootBoardId:'large-root',boardIds:['large-root'],graph:{boards:[{id:'large-root'}]},attachments:[{source_file_id:info.sha256,path:asset,size,sha256:info.sha256}]},b=Buffer.from(JSON.stringify(data));
  await fs.writeFile(path.join(dir,'share.json'),b);await fs.writeFile(path.join(dir,'package-manifest.json'),JSON.stringify({format:'inkbridge-share-package',version:1,rootBoardId:'large-root',readerBuild:'test-native',files:[{path:'share.json',size:b.length,sha256:hash(b)},{path:asset,size,sha256:info.sha256}]}));
  const client=createShareClient({baseUrl:'https://synthetic.test',token:'synthetic-bootstrap',jobDirectory:path.join(dir,'jobs'),fetch:(url,init)=>{if(init.method==='PUT'){puts++;maxPart=Math.max(maxPart,init.body.length);}return mf.dispatchFetch(url,init);}});
  const start=Date.now(),result=await client.publish({workspaceId:'w',rootBoardId:'large-root',requestId:'large-file',packageDirectory:dir});
  const bucket=await mf.getR2Bucket('SHARE_BUCKET'),saved=await bucket.head('objects/'+info.sha256);assert.equal(saved.size,size);assert.equal(saved.customMetadata.sha256,info.sha256);assert.equal(Buffer.from(saved.checksums.sha256).toString('hex'),info.sha256);assert.equal(maxPart,PART_SIZE);assert.equal(puts,65);assert.ok(pulse>100);
  const ranged=await mf.dispatchFetch(new URL(asset+'?v='+result.version,result.url),{headers:{range:'bytes=0-7'}});assert.equal(ranged.status,206);assert.match(Buffer.from(await ranged.arrayBuffer()).toString(),/^%PDF-/);
  console.log(JSON.stringify({realPDFBytes:size,partRequests:puts,maxPartBytes:maxPart,heartbeat:pulse,milliseconds:Date.now()-start,verifiedSourceSHA256:info.sha256}));
 }finally{clearInterval(timer);await mf.dispose();await fs.rm(dir,{recursive:true,force:true});}
});
