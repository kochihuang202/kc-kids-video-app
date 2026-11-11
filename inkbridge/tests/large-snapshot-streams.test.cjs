const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createDatabaseClient}=require('../src/main/database-client.cjs'),{createAttachmentStore}=require('../src/main/attachment-store.cjs');
const {createWorkspaceSnapshots,hashFile}=require('../src/main/workspace-snapshots.cjs'),{createSyncSnapshots}=require('../src/main/sync-snapshots.cjs');
const {stageRestore}=require('../src/main/workspace-restore.cjs');
test('>64MiB CAS snapshots, outbox publication and restore stream verified bytes; corrupt source cannot advance publication',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-large-snapshot-')),local=path.join(root,'local'),exchange=path.join(root,'exchange');
 await fs.mkdir(path.join(local,'Profile'),{recursive:true});await fs.mkdir(exchange);const source=path.join(root,'source.pdf');
 const db=createDatabaseClient({filename:path.join(local,'Workspace/inkbridge.sqlite3')});
 try{
  await require('./helpers/large-pdf-fixture.cjs')(source,65*1024*1024);const store=createAttachmentStore(path.join(local,'files'),()=>{}),attachment=await store.prepareFile(source);
  const commit=async(baseRevision,title)=>db.commit({requestId:crypto.randomUUID(),baseRevision,operations:[{type:'putContent',data:{id:'card',title,body:'PDF snapshot',kind:'text',tone:'sage'}},{type:'putCatalog',kind:'file',data:attachment.fileRecord}]});
  await commit(0,'first');const options={localDirectory:local,database:db,getExchange:()=>exchange,resolveAttachment:store.resolvePath};
  const snapshots=createWorkspaceSnapshots(options),first=await snapshots.create(),firstDir=path.join(exchange,'snapshots',first.workspaceId,first.snapshotId),manifest=await snapshots.validate(exchange,firstDir);
  assert.equal(manifest.assets[0].bytes,attachment.fileRecord.size);assert.equal(await hashFile(path.join(exchange,manifest.assets[0].objectPath)),attachment.fileId);
  const staged=await stageRestore({local,exchange,workspaceId:first.workspaceId,snapshotId:first.snapshotId,snapshots});assert.equal(await hashFile(path.join(local,'Restore-'+staged.id,attachment.fileRecord.filePath)),attachment.fileId);
  // Outbox uses its own real publication implementation, not the direct publisher.
  const outbox=createSyncSnapshots(options),published=await outbox.create();assert.equal(published.pending,0);assert.equal((await outbox.status()).published,true);
  const before=await fs.readFile(path.join(local,'Profile/snapshot-state.json'),'utf8'),oldManifest=await fs.readFile(path.join(firstDir,'manifest.json'),'utf8');
  await commit(1,'second');const h=await fs.open(attachment.filePath,'r+');try{await h.write(Buffer.from('bad'),0,3,100);}finally{await h.close();}
  await assert.rejects(snapshots.create(),/資料庫|integrity/);await assert.rejects(outbox.create(),/一致|integrity/);
  assert.equal(await fs.readFile(path.join(local,'Profile/snapshot-state.json'),'utf8'),before);assert.equal(await fs.readFile(path.join(firstDir,'manifest.json'),'utf8'),oldManifest);await snapshots.validate(exchange,firstDir);
 }finally{await db.close();await fs.rm(root,{recursive:true,force:true});}
});
