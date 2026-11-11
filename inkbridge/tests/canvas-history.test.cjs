const {test}=require('node:test'),assert=require('node:assert/strict'),{WorkspaceDatabase}=require('../src/main/database.cjs'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
test('native history storage boundary restores hierarchy and cascaded connections atomically, retaining content and files',async()=>{
 const {captureCanvasHistory,canvasHistoryOperations}=await import('../src/core/canvas-history.mjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkbridge-history-')),db=new WorkspaceDatabase(path.join(dir,'db.sqlite3'));
 const commit=ops=>db.commit({requestId:crypto.randomUUID(),baseRevision:db.load().revision,operations:ops});
 try{
  commit([{type:'putContent',data:{id:'note',kind:'text',title:'Title',body:'Body',tone:'sage',document:null}},{type:'putInstance',data:{id:'one',contentId:'note',boardId:'board-main',x:10,y:20,width:200,height:100,z:0}},{type:'putInstance',data:{id:'two',contentId:'note',boardId:'board-main',x:400,y:20,width:200,height:100,z:1}},{type:'putCatalog',kind:'connection',data:{id:'edge',whiteboardId:'board-main',beginId:'one',endId:'two'}}]);
  const start=captureCanvasHistory(db.load());
  commit([{type:'putCatalog',kind:'section',data:{id:'group',whiteboardId:'board-main',x:0,y:0,width:800,height:400}},{type:'putCatalog',kind:'instance',data:{id:'one',parentId:'group'}},{type:'putCatalog',kind:'instance',data:{id:'two',parentId:'group'}}]);
  const grouped=captureCanvasHistory(db.load());commit(canvasHistoryOperations(start,db.load()));assert.equal((db.load().sections||[]).length,0);assert.equal(db.load().instances[0].attributes?.parentId,undefined);
  commit(canvasHistoryOperations(grouped,db.load()));assert.equal((db.load().sections||[]).length,1);assert.equal(db.load().instances[0].attributes.parentId,'group');
  commit([{type:'deleteInstance',id:'one'}]);assert.equal((db.load().connections||[]).length,0);commit(canvasHistoryOperations(grouped,db.load()));assert.equal((db.load().connections||[]).length,1);assert.equal(db.load().instances.length,2);
  const before=db.load(),invalid=structuredClone(grouped);invalid.instances[0].width=-1;
  assert.throws(()=>commit(canvasHistoryOperations(invalid,before)));assert.deepEqual(db.load(),before);
  commit([{type:'putBoard',data:{id:'other',title:'Other',view:{x:90,y:20,zoom:.4}}},{type:'putInstance',data:{id:'unrelated',contentId:'note',boardId:'other',x:50,y:50,width:200,height:100,z:0}}]);
  const scoped=captureCanvasHistory(db.load(),'board-main');assert.equal(scoped.instances.length,2);
  commit([{type:'deleteInstance',id:'one'}]);commit(canvasHistoryOperations(scoped,db.load()));
  assert.equal(db.load().instances.find(r=>r.id==='unrelated').x,50);assert.deepEqual(db.load().boards.find(r=>r.id==='other').view,{x:90,y:20,zoom:.4});
 }finally{db.close();}
});


