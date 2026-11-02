const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createDatabaseClient}=require('../src/main/database-client.cjs');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
const {createWorkspaceSnapshots}=require('../src/main/workspace-snapshots.cjs');
test('consistent SQLite/CAS restore, no-op, interrupted publication, missing asset and independent branch preservation',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-snapshots-')),local=path.join(root,'A'),exchange=path.join(root,'exchange');
  await fs.mkdir(path.join(local,'Profile'),{recursive:true});await fs.mkdir(exchange);
  const database=createDatabaseClient({filename:path.join(local,'Workspace','inkbridge.sqlite3')});
  await fs.mkdir(path.join(local,'files'));
  const bytes=Buffer.from('immutable test fixture'),id=crypto.createHash('sha256').update(bytes).digest('hex'),attachment=path.join(local,'files',id+'.png');await fs.writeFile(attachment,bytes);
  let revision=0,fail='';
  const commit=async body=>{revision=(await database.commit({requestId:crypto.randomUUID(),baseRevision:revision,operations:[{type:'putContent',data:{id:'card',title:'卡片',body,kind:'text',tone:'sage'}},{type:'putCatalog',kind:'file',data:{id,name:'fixture.png',filePath:`files/${id}.png`,sha256:id,size:bytes.length}}]})).revision;};
  const options={localDirectory:local,database,getExchange:()=>exchange,resolveAttachment:()=>attachment,fault:stage=>{if(stage===fail)throw Error('injected '+stage);}};
  const snapshots=createWorkspaceSnapshots(options);
  try{
    await commit('第一版');const request=snapshots.create();assert.equal(snapshots.create(),request);const first=await request;assert.equal(first.created,true);
    const state=JSON.parse(await fs.readFile(path.join(local,'Profile/snapshot-state.json'))),workspace=(await database.load()).workspaceId;
    const directory=s=>path.join(exchange,'snapshots',workspace,s.snapshotId);
    const manifest=await snapshots.validate(exchange,directory(first));assert.equal(manifest.assets.length,1);
    assert.equal((await snapshots.create()).created,false);
    // Restore to an isolated working copy through standard SQLite, all rows survive.
    const restored=path.join(root,'restored.sqlite3');await fs.copyFile(path.join(directory(first),'database.sqlite3'),restored);
    const copy=new WorkspaceDatabase(restored);assert.deepEqual(copy.load(),await database.load());copy.close();
    await commit('第二版');fail='after-database';await assert.rejects(snapshots.create(),/injected/);
    await snapshots.validate(exchange,directory(first));assert.deepEqual(JSON.parse(await fs.readFile(path.join(local,'Profile/snapshot-state.json'))),state);
    fail='';const second=await snapshots.create();assert.equal((await snapshots.validate(exchange,directory(second))).parentSnapshotId,first.snapshotId);
    // Simulate B continuing from V1: its own device identity and local parent head.
    const b=path.join(root,'B');await fs.mkdir(path.join(b,'Profile'),{recursive:true});
    state.deviceId=crypto.randomUUID();await fs.writeFile(path.join(b,'Profile/snapshot-state.json'),JSON.stringify(state));
    await fs.mkdir(path.join(b,'Workspace'));await fs.copyFile(path.join(directory(first),'database.sqlite3'),path.join(b,'Workspace','inkbridge.sqlite3'));
    const bDatabase=createDatabaseClient({filename:path.join(b,'Workspace','inkbridge.sqlite3')});
    const bGraph=await bDatabase.load();await bDatabase.commit({requestId:crypto.randomUUID(),baseRevision:bGraph.revision,operations:[{type:'putContent',data:{id:'card',title:'卡片',body:'B 的獨立修改',kind:'text',tone:'sage'}}]});
    const branch=createWorkspaceSnapshots({...options,localDirectory:b,database:bDatabase});let other;try{other=await branch.create();}finally{await bDatabase.close();}
    assert.notEqual(other.snapshotId,second.snapshotId);assert.equal((await branch.validate(exchange,directory(other))).parentSnapshotId,first.snapshotId);
    await snapshots.validate(exchange,directory(second));
    const asset=path.join(exchange,manifest.assets[0].objectPath);await fs.rename(asset,asset+'.offline');await assert.rejects(snapshots.validate(exchange,directory(first)));
    await fs.rename(asset+'.offline',asset);await snapshots.validate(exchange,directory(first));
    assert.equal((await fs.readdir(path.join(exchange,'assets',id.slice(0,2)))).length,1);
    const rows=await snapshots.scan();assert.equal(rows.find(r=>r.snapshotId===second.snapshotId).relation,'current');assert.equal(rows.find(r=>r.snapshotId===first.snapshotId).relation,'ancestor');assert.equal(rows.find(r=>r.snapshotId===other.snapshotId).relation,'branch');assert.ok(rows.some(r=>r.integrity==='incomplete'));
    const {stageRestore,switchRestore,recoverRestore}=require('../src/main/workspace-restore.cjs');
    await database.close();
    for(const phase of ['after-old-Workspace','after-new-Workspace','after-old-files','after-new-files']){
      const staged=await stageRestore({local,exchange,workspaceId:workspace,snapshotId:first.snapshotId,snapshots});
      await assert.rejects(switchRestore({local,staged,snapshots,fault:at=>{if(at===phase)throw Error('interruption');}}),/interruption/);
      await recoverRestore(local);
      const previous=new WorkspaceDatabase(path.join(local,'Workspace','inkbridge.sqlite3'));assert.equal(previous.load().contents[0].body,'第二版');previous.close();
      assert.deepEqual(await fs.readFile(attachment),bytes);
    }
    // Simulate a process killed after switching only the database directory:
    // no catch handler ran; startup recovery must restore the previous workspace.
    const interrupted=await stageRestore({local,exchange,workspaceId:workspace,snapshotId:first.snapshotId,snapshots});
    const interruptedRoot=path.join(local,'Restore-'+interrupted.id);
    await fs.writeFile(path.join(local,'Profile','restore-journal.json'),JSON.stringify({id:interrupted.id,phase:'switching'}));
    await fs.rename(path.join(local,'Workspace'),path.join(interruptedRoot,'previous','Workspace'));
    await fs.rename(path.join(interruptedRoot,'Workspace'),path.join(local,'Workspace'));
    await recoverRestore(local);
    const recovered=new WorkspaceDatabase(path.join(local,'Workspace','inkbridge.sqlite3'));assert.equal(recovered.load().contents[0].body,'第二版');recovered.close();
    const staged=await stageRestore({local,exchange,workspaceId:workspace,snapshotId:first.snapshotId,snapshots});
    await switchRestore({local,staged,snapshots});
    const loaded=new WorkspaceDatabase(path.join(local,'Workspace','inkbridge.sqlite3'));assert.equal(loaded.load().contents[0].body,'第一版');loaded.close();
    assert.deepEqual(await fs.readFile(attachment),bytes);
    const restoredState=JSON.parse(await fs.readFile(path.join(local,'Profile/snapshot-state.json')));assert.equal(restoredState.heads[exchange+'|'+workspace].snapshotId,first.snapshotId);
    await snapshots.validate(exchange,directory(second));await snapshots.validate(exchange,directory(other));
  }finally{await database.close();await fs.rm(root,{recursive:true,force:true});}
});
