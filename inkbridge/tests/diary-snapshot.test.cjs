const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs'),{createDatabaseClient}=require('../src/main/database-client.cjs'),{createWorkspaceSnapshots}=require('../src/main/workspace-snapshots.cjs');
test('diary and tasks travel in the same validated workspace snapshot',async()=>{
 const {noteDocument}=await import('../src/core/rich-document.mjs'),root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-diary-snapshot-')),local=path.join(root,'A'),exchange=path.join(root,'exchange');await fs.mkdir(path.join(local,'files'),{recursive:true});await fs.mkdir(exchange);await fs.mkdir(path.join(local,'Profile'),{recursive:true});
 const database=createDatabaseClient({filename:path.join(local,'Workspace/inkbridge.sqlite3')});
 try{
  await database.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[{type:'putContent',data:{id:'day',kind:'text',title:'日記',body:'日記中文龍',tone:'sage',document:noteDocument({body:'日記中文龍'})}},{type:'putCatalog',kind:'quick-note',data:{id:'day',date:'2026-11-17'}},{type:'putCatalog',kind:'todo',data:{id:'task',title:'跨機待辦',completed:false}}]});
  const snapshots=createWorkspaceSnapshots({localDirectory:local,database,getExchange:()=>exchange,resolveAttachment:()=>{throw Error('No attachments expected');}}),saved=await snapshots.create(),before=await database.load(),directory=path.join(exchange,'snapshots',before.workspaceId,saved.snapshotId);
  await snapshots.validate(exchange,directory);const file=path.join(root,'B.sqlite3');await fs.copyFile(path.join(directory,'database.sqlite3'),file);const other=new WorkspaceDatabase(file);
  try{assert.deepEqual(other.load().quickNotes,before.quickNotes);assert.deepEqual(other.load().todos,before.todos);assert.deepEqual(other.load().contents,before.contents);}finally{other.close();}
 }finally{await database.close();}
});
