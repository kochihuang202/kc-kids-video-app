const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
test('native favorites preserve ordered nesting, target queries and card data on link deletion',async()=>{
 const {PersistenceCoordinator}=await import('../src/core/persistence-coordinator.mjs'),{createOriginalBookmarks}=await import('../src/core/original-bookmarks.mjs');
 const db=new WorkspaceDatabase(path.join(await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-bookmarks-')),'workspace.sqlite3'));
 db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[{type:'putContent',data:{id:'note',kind:'text',title:'Note',body:'Body',tone:'sage'}},{type:'putBoard',data:{id:'board',title:'Board',view:{x:0,y:0,zoom:1}}}]});
 const coordinator=new PersistenceCoordinator({revision:db.revision(),autoDelay:60000,commit:async request=>db.commit(request)});let tail=Promise.resolve();
 const service=createOriginalBookmarks({r:id=>id===19281?{YH:{newTabGroup:()=>({id:'generated',tabIds:[],pinnedTabIds:[]})}}:{ex:value=>value},redux:{dispatch(){}},navigate:operation=>(tail=tail.catch(()=>{}).then(operation)),coordinator,load:async()=>db.load(),catalogOperation:(kind,data)=>({type:'putCatalog',kind,data})});
 try{
  await service.ready();const before=db.load();
  await service.call('createTab',{id:'folder',title:'Folder',type:'folder',tabGroupId:'default',parentTabId:'',subTabIds:[]});
  await service.call('createTab',{id:'link',title:'Alias',type:'NoteCard',sourceId:'note',tabGroupId:'default',parentTabId:'folder'});
  let graph=db.load();assert.deepEqual(graph.tabGroups[0].tabIds,['folder']);assert.deepEqual(graph.savedTabs.find(row=>row.id==='folder').subTabIds,['link']);
  const source=await service.call('initTabSource','default');assert.equal(source.nodeCardTabSource[0].id,'note');assert.equal(source.allWhiteboards[0].id,'board');
  const refs=await service.call('getTabReferencesObjectCards',{references:[{id:'note',type:'NoteCard'},{id:'missing',type:'NoteCard'}]});assert.deepEqual(refs.noteCards,source.nodeCardTabSource);assert.deepEqual(refs.mediaCards,[]);
  const stable=db.load();await assert.rejects(service.call('createTab',{id:'invalid',title:'Invalid',type:'NoteCard',tabGroupId:'default',parentTabId:'missing'}),/資料夾不存在/);assert.deepEqual(db.load(),stable);
  await service.call('deleteTab',{id:'folder'});graph=db.load();assert.deepEqual(graph.savedTabs||[],[]);assert.deepEqual(graph.tabGroups[0].tabIds,[]);assert.deepEqual(graph.contents,before.contents);assert.deepEqual(graph.boards,before.boards);
 }finally{coordinator.dispose();db.close();}
});


