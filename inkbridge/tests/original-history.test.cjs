const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
test('native version DTOs commit and restore through the one real SQLite coordinator',async()=>{
 const {PersistenceCoordinator}=await import('../src/core/persistence-coordinator.mjs'),{createOriginalNoteWriter}=await import('../src/core/original-note-writes.mjs');
 const db=new WorkspaceDatabase(path.join(await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-history-')),'workspace.sqlite3'));
 const doc=text=>({root:{type:'root',version:1,children:[{type:'paragraph',version:1,children:[{type:'text',version:1,text}]}]}}),a=doc('Version A'),b=doc('Version B');
 db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[{type:'putContent',data:{id:'note',title:'A',body:'Version A',document:a,kind:'text',tone:'sage'}},{type:'putCatalog',kind:'card',data:{id:'note',createdTime:'2000-01-01T00:00:00Z',lastEditedTime:'2000-01-01T00:00:00Z'}}]});
 const contents=new Map(db.load().contents.map(row=>[row.id,row]));let editorDocument=a;
 const coordinator=new PersistenceCoordinator({revision:db.revision(),autoDelay:60000,commit:request=>Promise.resolve(db.commit(request)),beforeFlush:async()=>accept('note',editorDocument)});
 function accept(id,document){const old=contents.get(id);if(JSON.stringify(old.document)===JSON.stringify(document))return;const next={...old,document,title:document.root.children[0].children[0].text,body:document.root.children[0].children[0].text};contents.set(id,next);coordinator.stage({type:'putContent',data:next});}
 let tail=Promise.resolve();const writer=createOriginalNoteWriter({navigate:operation=>(tail=tail.catch(()=>{}).then(operation)),coordinator,load:async()=>db.load(),contents,instances:new Map(),acceptContentDocument:accept,replaceContentDocument:(id,document)=>{editorDocument=document;accept(id,document);},catalogOperation:(kind,data)=>({type:'putCatalog',kind,data:JSON.parse(JSON.stringify(data))})});
 try{
  editorDocument=b;await writer('updateNoteCard',{id:'note',updates:{content:JSON.stringify(b)},contentVersionSnapshot:{title:'Version A',content:JSON.stringify(a)}});const saved=db.load();assert.deepEqual(saved.contents[0].document,b);assert.equal(saved.contentVersions.length,1);assert.equal(saved.cardMetadata[0].createdTime,'2000-01-01T00:00:00Z');assert.notEqual(saved.cardMetadata[0].lastEditedTime,'2000-01-01T00:00:00Z');
  const result=await writer('restoreNoteCardContentVersion',{noteCardId:'note',versionId:saved.contentVersions[0].id});assert(result.success);assert.deepEqual(db.load().contents[0].document,a);assert.deepEqual(editorDocument,a);assert.equal(db.load().contentVersions.length,3);
  const revision=db.revision();assert.deepEqual(await writer('restoreNoteCardContentVersion',{noteCardId:'note',versionId:'missing'}),{success:false,error:'version_not_found'});assert.equal(db.revision(),revision);
 }finally{coordinator.dispose();db.close();}
});
