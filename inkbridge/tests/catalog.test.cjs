const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');

test('native folder deletion is atomic and preserves boards, contents and placements',async()=>{
 const {folderDeletionOperations}=await import('../src/core/original-folder-writes.mjs');
 const file=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-folder-delete-')),'workspace.sqlite3');let db=new WorkspaceDatabase(file);
 const commit=operations=>db.commit({requestId:crypto.randomUUID(),baseRevision:db.revision(),operations});
 try{
  commit([{type:'putCatalog',kind:'folder',data:{id:'f',name:'Folder',whiteboardInstanceIds:['ref']}},{type:'putCatalog',kind:'whiteboard-instance',data:{id:'ref',whiteboardId:'board-main',containerId:'f',containerType:'folder',isTrashed:false}}]);
  const before=db.load(),ops=folderDeletionOperations(before,'f','2026-10-31T00:00:00Z');
  assert.throws(()=>commit([...ops,{type:'putCatalog',kind:'whiteboard-instance',data:{id:'bad',whiteboardId:'missing'}}]));assert.deepEqual(db.load(),before);
  commit(ops);const after=db.load();assert.equal((after.folders||[]).length,0);assert(after.boards[0].attributes.isTrashed);assert(after.whiteboardInstances[0].isTrashed);assert.deepEqual(after.contents,before.contents);assert.deepEqual(after.instances,before.instances);
  db.close();db=new WorkspaceDatabase(file);assert.deepEqual(db.load(),after);
 }finally{db.close();}
});
test('folder and native board-instance records persist and participate in the workspace transaction',async()=>{
 const file=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-catalog-')),'workspace.sqlite3');let db=new WorkspaceDatabase(file);const commit=operations=>db.commit({requestId:crypto.randomUUID(),baseRevision:db.revision(),operations});
 try{
  const folder={id:'folder-a',name:'Group A',description:'',whiteboardInstanceIds:['ref-a'],order:0},ref={id:'ref-a',whiteboardId:'board-main',containerType:'folder',containerId:'folder-a',isTrashed:false,rank:0};
  commit([{type:'putCatalog',kind:'folder',data:folder},{type:'putCatalog',kind:'whiteboard-instance',data:ref}]);const before=db.load();assert.deepEqual(before.folders,[folder]);assert.deepEqual(before.whiteboardInstances,[ref]);
  assert.throws(()=>commit([{type:'putCatalog',kind:'folder',data:{...folder,name:'Must rollback'}},{type:'putCatalog',kind:'whiteboard-instance',data:{...ref,id:'invalid-ref',whiteboardId:'missing'}}]));assert.deepEqual(db.load(),before);
  db.close();db=new WorkspaceDatabase(file);assert.deepEqual(db.load(),before);
 }finally{db.close();}
});
