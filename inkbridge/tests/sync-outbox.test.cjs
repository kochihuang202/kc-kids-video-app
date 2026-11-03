const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createDatabaseClient}=require('../src/main/database-client.cjs'),{createSyncSnapshots}=require('../src/main/sync-snapshots.cjs');
test('durable offline outbox retries the same UUID and keeps ancestry across folder-path change',async()=>{
 const local=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-outbox-'));await fs.mkdir(path.join(local,'Profile'));let exchange=path.join(local,'MissingExchange');
 const db=createDatabaseClient({filename:path.join(local,'Workspace/inkbridge.sqlite3')}),snap=createSyncSnapshots({localDirectory:local,database:db,getExchange:()=>exchange,resolveAttachment:()=>{throw Error('No attachments');}});
 try{await db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[{type:'putContent',data:{id:'a',title:'A',body:'離線資料',kind:'text',tone:'sage'}}]});const first=await snap.create();assert.equal(first.pending,1);assert.equal(first.created,true);
 const repeated=await snap.create();assert.equal(repeated.snapshotId,first.snapshotId);assert.equal(repeated.created,false);
 assert.equal((await snap.status()).published,false,'a local outbox head is not a OneDrive publication');
 await fs.mkdir(exchange);assert.equal((await snap.flushOutbox()).pending,0);const m=await snap.manifest(first.workspaceId,first.snapshotId);assert.equal(m.revision,1);
 assert.equal((await snap.status()).published,true);
 const moved=path.join(local,'MovedExchange');await fs.rename(exchange,moved);exchange=moved;assert.equal((await snap.status()).baseSnapshotId,first.snapshotId);
 await db.commit({requestId:crypto.randomUUID(),baseRevision:1,operations:[{type:'putContent',data:{id:'a',title:'A',body:'恢復後',kind:'text',tone:'sage'}}]});const second=await snap.create();assert.equal((await snap.manifest(second.workspaceId,second.snapshotId)).parentSnapshotId,first.snapshotId);
 }finally{await db.close();}
});
