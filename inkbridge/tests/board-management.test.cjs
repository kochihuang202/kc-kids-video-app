const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
test('native board attributes, rename and trash commit atomically and preserve referenced content',async()=>{
 const file=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-board-management-')),'workspace.sqlite3');let db=new WorkspaceDatabase(file);
 const commit=operations=>db.commit({requestId:crypto.randomUUID(),baseRevision:db.revision(),operations});
 try{
  commit([{type:'putContent',data:{id:'content',title:'Shared',body:'Keep this',kind:'text',tone:'sage'}},{type:'putInstance',data:{id:'instance',contentId:'content',boardId:'board-main',x:0,y:0,width:520,height:200,z:0}}]);
  const before=db.load(),board=before.boards[0];
  commit([{type:'putBoard',data:{...board,title:'Renamed',attributes:{icon:'book',isTrashed:false}}}]);
  let saved=db.load().boards[0];assert.equal(saved.title,'Renamed');assert.deepEqual(saved.view,board.view);
  commit([{type:'putBoard',data:{...saved,attributes:{...saved.attributes,isTrashed:true}}}]);
  const trashed=db.load();assert.deepEqual(trashed.contents,before.contents);assert.deepEqual(trashed.instances,before.instances);assert.equal(trashed.boards[0].attributes.isTrashed,true);
  assert.throws(()=>commit([{type:'putBoard',data:{...saved,title:'Must rollback',attributes:{icon:undefined}}}]));assert.equal(db.load().boards[0].title,'Renamed');
  db.close();db=new WorkspaceDatabase(file);assert.deepEqual(db.load(),trashed);
 }finally{db.close();}
});
