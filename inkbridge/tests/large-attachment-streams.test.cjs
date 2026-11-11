const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createAttachmentStore,IMAGE_MAX_BYTES,PDF_MAX_BYTES}=require('../src/main/attachment-store.cjs');
const {copyVerified,hashFile,scanFile}=require('../src/main/stream-files.cjs');
const writeLargePDF=require('./helpers/large-pdf-fixture.cjs');
test('exact 512MiB PDF import uses bounded buffers, deduplicates, resolves asynchronously and detects corruption',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-large-pdf-')),files=path.join(root,'files'),source=path.join(root,'large.pdf');
 try{
  await writeLargePDF(source,PDF_MAX_BYTES);const store=createAttachmentStore(files,()=>{throw Error('PDF must not decode as image');});
  let peakExternal=process.memoryUsage().external,heartbeats=0;const initial=peakExternal,timer=setInterval(()=>{peakExternal=Math.max(peakExternal,process.memoryUsage().external);heartbeats++;},5);
  let one;try{one=await store.prepareFile(source);}finally{clearInterval(timer);}
  assert.equal(one.fileRecord.size,PDF_MAX_BYTES);assert.equal(one.type,'pdf');assert.equal(one.fileId,await hashFile(source));assert.ok(heartbeats>5,'main event loop remains available during import');
  assert.ok(peakExternal-initial<IMAGE_MAX_BYTES,`bounded external memory: ${peakExternal-initial}`);
  const info=await store.resolveUrl('flexnote://file/'+one.fileId);assert.equal(info.size,PDF_MAX_BYTES);assert.equal(info.filePath,store.resolvePath(one.fileId));assert.throws(()=>store.readUrl('flexnote://file/'+one.fileId),/streaming/);
  const before=await fs.stat(one.filePath),again=await store.prepareFile(source,'again.pdf');assert.equal(again.fileId,one.fileId);assert.equal((await fs.stat(one.filePath)).mtimeMs,before.mtimeMs);assert.deepEqual(await fs.readdir(files),[one.fileId+'.pdf']);
  // Reopened stores independently stream-verify; do not inherit a process cache.
  await createAttachmentStore(files,()=>{}).resolveUrl('flexnote://file/'+one.fileId+'.pdf');
  const handle=await fs.open(one.filePath,'r+');try{await handle.write(Buffer.from('broken'),0,6,100);}finally{await handle.close();}
  await assert.rejects(store.resolveUrl('flexnote://file/'+one.fileId),/integrity/);await assert.rejects(store.prepareFile(source),/integrity/);assert.deepEqual(await fs.readdir(files),[one.fileId+'.pdf']);
  t.diagnostic(JSON.stringify({bytes:PDF_MAX_BYTES,peakExternalIncrease:peakExternal-initial,heartbeats}));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('missing, >512MiB, >64MiB image and incomplete PDF inputs publish nothing',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-invalid-files-')),files=path.join(root,'files'),store=createAttachmentStore(files,()=>({width:1,height:1}));
 try{
  await assert.rejects(store.prepareFile(path.join(root,'missing.pdf')),/ENOENT/);
  for(const [name,size,header,tail] of [['huge.pdf',PDF_MAX_BYTES+1,'%PDF-1.4','%%EOF'],['large.png',IMAGE_MAX_BYTES+1,'\x89PNG\r\n\x1a\n',''],['incomplete.pdf',100,'%PDF-1.4','']]){
   const source=path.join(root,name),h=await fs.open(source,'wx');try{await h.truncate(size);await h.write(Buffer.from(header,'latin1'),0,header.length,0);if(tail)await h.write(Buffer.from(tail),0,tail.length,size-tail.length);}finally{await h.close();}
   await assert.rejects(store.prepareFile(source));assert.deepEqual(await fs.readdir(files),[]);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('stream publication detects a changed/disappeared source, preserves existing objects and removes partial copies',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-stream-interrupt-')),source=path.join(root,'source'),target=path.join(root,'target');
 try{
  await fs.writeFile(source,Buffer.alloc(128*1024,65));await fs.writeFile(target,'old');const sha=await hashFile(source);
  await assert.rejects(copyVerified(source,target,{sha256:sha}),/integrity/);assert.equal(await fs.readFile(target,'utf8'),'old');
  await assert.rejects(copyVerified(source,path.join(root,'new'),{sha256:'0'.repeat(64)}),/integrity/);assert.deepEqual((await fs.readdir(root)).sort(),['source','target']);
  let changed=false;await assert.rejects(scanFile(source,{onChunk:async()=>{if(!changed){changed=true;await fs.truncate(source,4);}}}),/changed/);
  await fs.writeFile(source,Buffer.alloc(128*1024,65));let removed=false;await assert.rejects(scanFile(source,{onChunk:async()=>{if(!removed){removed=true;await fs.unlink(source);}}}));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
