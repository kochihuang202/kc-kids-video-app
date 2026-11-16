const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs'),{createDatabaseClient}=require('../src/main/database-client.cjs'),{createSyncSnapshots}=require('../src/main/sync-snapshots.cjs');
test('an unchanged latest-version restore is equivalent, then the other computer continues editing without false conflict',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-continuation-')),exchange=path.join(root,'exchange'),local=path.join(root,'A');await fs.mkdir(exchange);await fs.mkdir(path.join(local,'Profile'),{recursive:true});
 const filename=path.join(local,'Workspace/inkbridge.sqlite3'),seed=new WorkspaceDatabase(filename);seed.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[{type:'putContent',data:{id:'note',title:'共同內容',body:'共同最新版',kind:'text',tone:'sage'}}]});seed.close();const db=createDatabaseClient({filename}),snap=createSyncSnapshots({localDirectory:local,database:db,getExchange:()=>exchange,resolveAttachment:()=>{}});
 try{
  const common=await snap.create(),fake=await snap.create('restore',{force:true,parentSnapshotId:common.snapshotId,restoredFromSnapshotId:common.snapshotId});
  await snap.adopt(await snap.manifest(common.workspaceId,common.snapshotId));
  await db.commit({requestId:crypto.randomUUID(),baseRevision:1,operations:[{type:'putContent',data:{id:'note',title:'共同內容',body:'另一台繼續編輯的新內容',kind:'text',tone:'sage'}}]});const latest=await snap.create();
  const restore=require('../src/main/workspace-restore.cjs'),B=path.join(root,'B');await fs.mkdir(path.join(B,'Profile'),{recursive:true});
  const bSeed=new WorkspaceDatabase(path.join(B,'Workspace/inkbridge.sqlite3'));bSeed.close();const staged=await restore.stageRestore({local:B,exchange,workspaceId:common.workspaceId,snapshotId:fake.snapshotId,snapshots:snap,sharedAssets:true});
  await restore.switchRestore({local:B,staged,snapshots:{adopt:async()=>{}}});
  const bDb=createDatabaseClient({filename:path.join(B,'Workspace/inkbridge.sqlite3')}),b=createSyncSnapshots({localDirectory:B,database:bDb,getExchange:()=>exchange,resolveAttachment:()=>{}});
  try{await b.adopt(await snap.manifest(common.workspaceId,fake.snapshotId));const status=await b.startup();assert.equal(status.kind,'newer');assert.equal(status.candidate.snapshotId,latest.snapshotId);assert.equal(status.hasLocalChanges,false);
   // The verified equality survives disposal of the old large payload and a restart.
   await fs.rm(path.join(exchange,'snapshots',common.workspaceId,fake.snapshotId),{recursive:true});
   const reopened=createSyncSnapshots({localDirectory:B,database:bDb,getExchange:()=>exchange,resolveAttachment:()=>{}});assert.equal((await reopened.startup()).candidate.snapshotId,latest.snapshotId);
   await bDb.commit({requestId:crypto.randomUUID(),baseRevision:1,operations:[{type:'putContent',data:{id:'note',title:'共同內容',body:'確實未同步的本機修改',kind:'text',tone:'sage'}}]});assert.equal((await b.startup()).hasLocalChanges,true);
   const changed=await b.create();assert.notEqual((await b.startup()).kind,'newer');assert.equal((await bDb.load()).contents[0].body,'確實未同步的本機修改');
   assert(changed.snapshotId);
  }finally{await bDb.close();}
 }finally{await db.close();}
});

test('intentional rollback to an ancestor remains a genuine forward version',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-rollback-intent-')),exchange=path.join(root,'exchange'),local=path.join(root,'A');await fs.mkdir(exchange);await fs.mkdir(path.join(local,'Profile'),{recursive:true});
 let client=createDatabaseClient({filename:path.join(local,'Workspace/inkbridge.sqlite3')});const facade={summary:()=>client.summary(),snapshot:f=>client.snapshot(f),load:()=>client.load()};
 const snap=createSyncSnapshots({localDirectory:local,database:facade,getExchange:()=>exchange,resolveAttachment:()=>{}});
 try{await client.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[{type:'putContent',data:{id:'note',title:'A',body:'舊內容',kind:'text',tone:'sage'}}]});const old=await snap.create();await client.commit({requestId:crypto.randomUUID(),baseRevision:1,operations:[{type:'putContent',data:{id:'note',title:'A',body:'新內容',kind:'text',tone:'sage'}}]});const newer=await snap.create();
  const restore=require('../src/main/workspace-restore.cjs'),stage=await restore.stageRestore({local,exchange,workspaceId:old.workspaceId,snapshotId:old.snapshotId,snapshots:snap,sharedAssets:true});await client.close();await restore.switchRestore({local,staged:stage,snapshots:snap});client=createDatabaseClient({filename:path.join(local,'Workspace/inkbridge.sqlite3')});const rolled=await snap.create('restore',{force:true,parentSnapshotId:newer.snapshotId,restoredFromSnapshotId:old.snapshotId});
  const rows=await snap.index();assert.equal(rows.find(r=>r.snapshotId===rolled.snapshotId).equivalentTo,undefined);assert.equal((await client.load()).contents[0].body,'舊內容');
 }finally{await client.close();}
});
