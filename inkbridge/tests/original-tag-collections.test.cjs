const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
const op=(kind,data)=>({type:'putCatalog',kind,data});
const doc=text=>({root:{type:'root',children:[{type:'paragraph',children:[{type:'text',text}]}]}});
async function fixture(){
 const {createOriginalTagCollections}=await import('../src/core/original-tag-collections.mjs'),{PersistenceCoordinator}=await import('../src/core/persistence-coordinator.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-tag-collection-')),file=path.join(dir,'workspace.sqlite3');let db=new WorkspaceDatabase(file);
 db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[
  {type:'putContent',data:{id:'note',title:'標籤卡片',body:'中文正文',document:doc('中文正文'),kind:'text',tone:'sage'}},
  {type:'putContent',data:{id:'trash',title:'已刪除',body:'',document:doc(''),kind:'text',tone:'sage'}},
  op('card',{id:'trash',isTrashed:true}),op('tag',{id:'t',name:'工作',subTagIds:[]}),op('tag',{id:'other',name:'家裡',subTagIds:[]}),
  op('card-tag',{id:'link',tagId:'t',cardId:'note',cardType:'NoteCard'}),op('card-tag',{id:'link-trash',tagId:'t',cardId:'trash',cardType:'NoteCard'}),op('card-tag',{id:'link-other',tagId:'other',cardId:'note',cardType:'NoteCard',blockId:'block-1'}),
  op('collection',{id:'c',viewIds:['v'],currentViewId:'v',defaultViewId:null,queryConfig:{type:'tag',id:'t'},titlePropertyConfig:{name:'Name'}}),
  op('collection-view',{id:'v',collectionId:'c',name:'卡片',type:'grid',config:{tableProperties:[]},filterConfig:{},sortConfig:{},objectSort:[]})
 ]});
 const coordinator=new PersistenceCoordinator({revision:db.revision(),autoDelay:60000,commit:async request=>db.commit(request)}),service=createOriginalTagCollections({navigate:action=>action(),coordinator,load:async()=>db.load(),catalogOperation:op,now:()=> '2026-11-24T00:00:00.000Z'});
 return {service,coordinator,load:()=>db.load(),revision:()=>db.revision(),async reopen(){coordinator.dispose();db.close();db=new WorkspaceDatabase(file);},async close(){coordinator.dispose();db.close();await fs.rm(dir,{recursive:true,force:true});}};
}

test('tag collection reads return the original full DTO without creating revisions and survive reopen',async()=>{
 const f=await fixture();try{
  const before=f.revision(),first=await f.service.call('getTagCollectionByTagId',{tagId:'t'}),data=first.data;
  assert.equal(first.success,true);assert.equal(data.collection.id,'c');assert.deepEqual(data.collectionViews.map(row=>row.id),['v']);
  assert.deepEqual(data.relatedNoteCardList.map(row=>row.id),['note']);assert.equal(data.relatedNoteCardList[0].content.root.children[0].children[0].text,'中文正文');
  assert.deepEqual(data.cardTagsByCardId['note::block-1'],[{id:'other',name:'家裡',color:'default'}]);assert.deepEqual(data.propertyValueList,[]);
  for(const field of ['relatedPdfCardList','relatedHighlightCardList','relatedMediaCardList','relatedMindmapCardList','relatedWhiteboardCardList','relatedDailyNotesCardList','relatedWebsiteCardList','relatedVideoHighlightCardList','relatedAudioHighlightCardList','relatedNoteHighlightCardList'])assert.deepEqual(data[field],[]);
  assert.equal(f.revision(),before);await f.reopen();assert.deepEqual(await f.service.call('getTagCollectionByTagId',{tagId:'t'}),first);assert.equal(f.revision(),before);
 }finally{await f.close();}
});

test('view creation, selection, reorder and deletion persist without deleting notes',async()=>{
 const f=await fixture();try{
  const result=await f.service.call('createCollectionView',{id:'table',collectionId:'c',name:'表格',type:'table',config:{tableProperties:[]},filterConfig:{},sortConfig:{},objectSort:['link']});
  assert.deepEqual(result.collection.viewIds,['v','table']);assert.equal(result.collectionView.id,'table');
  await f.service.call('updateCollection',{id:'c',viewIds:['table','v'],currentViewId:'table',defaultViewId:'table'});
  await f.service.call('updateCollectionView',{id:'table',name:'已改名',config:{tableProperties:[],custom:true}});
  await f.reopen();const state=await f.service.call('getTagCollectionByTagId',{tagId:'t'});assert.deepEqual(state.data.collectionViews.map(row=>row.id),['table','v']);assert.equal(state.data.collection.currentViewId,'table');
  const deleted=await f.service.call('deleteCollectionView',{collectionId:'c',collectionViewId:'table'});assert.equal(deleted.collection.currentViewId,'v');assert.equal(deleted.collection.defaultViewId,null);assert(f.load().contents.some(row=>row.id==='note'));
  await assert.rejects(f.service.call('deleteCollectionView',{collectionId:'c',collectionViewId:'v'}),/保留/);
 }finally{await f.close();}
});

test('kanban status property, options and values are durable and invalid batches stage nothing',async()=>{
 const f=await fixture();try{
  const kanban=await f.service.call('createCollectionView',{id:'kanban',collectionId:'c',name:'看板',type:'kanban',config:{tableProperties:[]},filterConfig:{},sortConfig:{},objectSort:[]}),property=kanban.propertyList[0];
  assert.equal(property.type,'Select');assert.equal(kanban.collectionView.config.kanban.columnBy,property.id);
  await f.service.call('updateProperty',{id:property.id,type:'Select',config:{options:[{id:'yes',name:'完成',color:'green'},{id:'no',name:'未完成',color:'red'}]}});
  await f.service.call('updatePropertyValue',{propertyId:property.id,objectId:'note',value:['yes','no']});
  const revision=f.revision();await f.service.call('updatePropertyValue',{propertyId:property.id,objectId:'note',value:['yes','no']});assert.equal(f.revision(),revision,'same value is not a new content revision');
  await f.service.call('updateProperty',{id:property.id,type:'Select',config:{options:[{id:'yes',name:'完成',color:'green'}]}});
  assert.equal(f.load().objectPropertyRelations[0].value,'["yes"]');assert.deepEqual(f.load().collectionViews.find(row=>row.id==='kanban').config.kanban.options.map(row=>row.id),['none','yes']);
  const graph=f.load(),before=f.revision();await assert.rejects(f.service.call('createProperty',{property:{id:'orphan',name:'不能留下的部分',type:'Text',config:{}},collectionId:'c',collectionViewId:'missing'}),/不存在/);await f.coordinator.flush();assert.equal(f.revision(),before);assert.deepEqual(f.load(),graph);
  await f.reopen();const data=(await f.service.call('getTagCollectionByTagId',{tagId:'t'})).data;assert.equal(data.propertyValueList[0].value,'["yes"]');assert.equal(data.propertyList[0].id,property.id);
 }finally{await f.close();}
});

test('shared property rename forks only the current collection and copies its values',async()=>{
 const f=await fixture();try{
  await f.service.call('createCollection',{id:'c2',viewIds:[],currentViewId:null,queryConfig:{type:'tag',id:'other'},titlePropertyConfig:{}});
  await f.service.call('createProperty',{property:{id:'p',name:'共同欄位',type:'Text',config:{}},collectionId:'c',collectionViewId:'v',userId:'local'});
  await f.service.call('createProperty',{property:{id:'p',name:'共同欄位',type:'Text',config:{}},collectionId:'c2',usePrevious:true,userId:'local'});
  await f.service.call('updatePropertyValue',{propertyId:'p',objectId:'note',value:'原始中文'});
  const renamed=await f.service.call('renamePropertyInCollection',{propertyId:'p',collectionId:'c',name:'工作欄位'});
  assert.equal(renamed.forked,true);assert.notEqual(renamed.property.id,'p');assert.equal(f.load().properties.find(row=>row.id==='p').name,'共同欄位');
  assert(f.load().collectionPropertyRelations.some(row=>row.collectionId==='c2'&&row.propertyId==='p'));
  assert(f.load().collectionPropertyRelations.some(row=>row.collectionId==='c'&&row.propertyId===renamed.property.id));
  assert(f.load().objectPropertyRelations.some(row=>row.propertyId===renamed.property.id&&row.value==='原始中文'));
  assert.equal(f.load().collectionViews.find(row=>row.id==='v').config.tableProperties[0].id,renamed.property.id);
  const overview=await f.service.call('getPropertyOverview');assert.equal(overview.data.find(row=>row.id==='p').usages[0].collectionId,'c2');
  const byIds=await f.service.call('getPropertyByIds',['p']);assert.equal(byIds.data.properties[0].name,'共同欄位');
  await f.service.call('deleteProperty',renamed.property.id);assert.equal(f.load().contents.find(row=>row.id==='note').body,'中文正文');assert(!f.load().collectionPropertyRelations.some(row=>row.propertyId===renamed.property.id));assert(!f.load().objectPropertyRelations.some(row=>row.propertyId===renamed.property.id));assert.deepEqual(f.load().collectionViews.find(row=>row.id==='v').config.tableProperties,[]);
 }finally{await f.close();}
});

test('missing native system collections project stable defaults and materialize only with a valid edit',async()=>{
 const {createOriginalTagCollections}=await import('../src/core/original-tag-collections.mjs'),{PersistenceCoordinator}=await import('../src/core/persistence-coordinator.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-system-tag-collection-')),file=path.join(dir,'workspace.sqlite3');let db=new WorkspaceDatabase(file);
 const coordinator=new PersistenceCoordinator({revision:0,autoDelay:60000,commit:async request=>db.commit(request)}),time='2026-11-24T00:00:00.000Z';
 const native={newCollectionView:({name,collectionId,type})=>({id:crypto.randomUUID(),name,collectionId,type,config:{tableProperties:[{id:'title',width:200,shouldWrap:false}],kanban:{columnBy:null,options:[]}},filterConfig:{},sortConfig:[],objectSort:[],createdBy:'local'}),newCollection:value=>({id:crypto.randomUUID(),...value,createdBy:'local'})};
 const tag={id:'system-note',name:'NoteCard',createdBy:'system',createdTime:time,subTagIds:[]},group={id:'system-group',name:'System',createdBy:'system',tags:[tag.id]};
 const options={r:()=>({YH:native}),projectTags:graph=>({tagList:graph.tags||[tag],tagGroups:graph.tagGroups||[group]}),navigate:action=>action(),coordinator,load:async()=>db.load(),catalogOperation:op,now:()=>time};
 let service=createOriginalTagCollections(options);
 try{
  const first=(await service.call('getTagCollectionByTagId',{tagId:tag.id})).data;assert.equal(db.revision(),0);assert.equal(first.collectionViews[0].name,'Table');assert.equal(first.collectionViews[0].type,'table');assert.deepEqual(first.collectionViews[0].config.tableProperties,[{id:'title',width:200,shouldWrap:false}]);
  service=createOriginalTagCollections(options);assert.deepEqual((await service.call('getTagCollectionByTagId',{tagId:tag.id})).data,first);assert.equal(db.revision(),0);
  assert.equal((await service.call('getTag',tag.id)).data.name,'NoteCard');
  const view=first.collectionViews[0];await service.call('updateCollectionView',{id:view.id,config:{...view.config,tableProperties:view.config.tableProperties.map((column,index)=>({...column,sortIndex:index,sort:null,pinned:null}))}});assert.equal(db.revision(),0,'grid initialization defaults must not materialize the workspace');
  await assert.rejects(service.call('createProperty',{property:{id:'bad',name:'不留下半筆',type:'Text',config:{}},collectionId:first.collection.id,collectionViewId:'missing'}),/不存在/);await coordinator.flush();assert.equal(db.revision(),0);assert.equal(db.load().tags,undefined);
  await service.call('createProperty',{property:{id:'p',name:'備註',type:'Text',config:{}},collectionId:first.collection.id,collectionViewId:first.collectionViews[0].id});assert.equal(db.revision(),1);assert.equal(db.load().tags[0].id,tag.id);assert.equal(db.load().collections.length,1);assert.equal(db.load().collectionViews.length,1);
  db.close();db=new WorkspaceDatabase(file);service=createOriginalTagCollections(options);assert.equal((await service.call('getTagCollectionByTagId',{tagId:tag.id})).data.propertyList[0].name,'備註');assert.equal(db.revision(),1);
 }finally{coordinator.dispose();db.close();await fs.rm(dir,{recursive:true,force:true});}
});
