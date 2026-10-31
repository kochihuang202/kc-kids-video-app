const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
test('folder and native board-instance records persist and participate in the workspace transaction',async()=>{
 const file=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-catalog-')),'workspace.sqlite3');let db=new WorkspaceDatabase(file);const commit=operations=>db.commit({requestId:crypto.randomUUID(),baseRevision:db.revision(),operations});
 try{
  const folder={id:'folder-a',name:'Group A',description:'',whiteboardInstanceIds:['ref-a'],order:0},ref={id:'ref-a',whiteboardId:'board-main',containerType:'folder',containerId:'folder-a',isTrashed:false,rank:0};
  commit([{type:'putCatalog',kind:'folder',data:folder},{type:'putCatalog',kind:'whiteboard-instance',data:ref}]);const before=db.load();assert.deepEqual(before.folders,[folder]);assert.deepEqual(before.whiteboardInstances,[ref]);
  assert.throws(()=>commit([{type:'putCatalog',kind:'folder',data:{...folder,name:'Must rollback'}},{type:'putCatalog',kind:'whiteboard-instance',data:{...ref,id:'invalid-ref',whiteboardId:'missing'}}]));assert.deepEqual(db.load(),before);
  db.close();db=new WorkspaceDatabase(file);assert.deepEqual(db.load(),before);
 }finally{db.close();}
});
