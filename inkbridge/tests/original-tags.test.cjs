const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');

test('search keeps the ancestors of a matching descendant without mutating the stored hierarchy',async()=>{
 const {filterTagTree}=await import('../src/core/original-tags.mjs');
 const tags=[{id:'p',name:'父',subTagIds:['c','other'],collapsed:true},{id:'c',name:'子',subTagIds:['g']},{id:'g',name:'中文孫標籤',subTagIds:[]},{id:'other',name:'無關',subTagIds:[]}],groups=[{id:'group',tags:['p']}];
 const result=filterTagTree(tags,groups,'孫標籤');assert.deepEqual(result.tags.map(row=>row.id),['p','c','g']);assert.deepEqual(result.tagGroups[0].tags,['p']);assert.deepEqual(result.tags[0].subTagIds,['c']);assert.equal(result.tags[0].collapsed,false);assert.equal(tags[0].collapsed,true);assert.deepEqual(tags[0].subTagIds,['c','other']);
 assert.deepEqual(filterTagTree(tags,groups,'不存在'),{tags:[],tagGroups:[]});assert.equal(filterTagTree(tags,groups,'').tags,tags);
});
async function fixture(t){
 const {createOriginalTags}=await import('../src/core/original-tags.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-tags-')),file=path.join(root,'workspace.sqlite3');let db=new WorkspaceDatabase(file),pending=[],tail=Promise.resolve();
 const commit=operations=>db.commit({requestId:crypto.randomUUID(),baseRevision:db.revision(),operations});
 const coordinator={stage:operation=>pending.push(structuredClone(operation)),flush:async()=>{if(pending.length){const batch=pending;pending=[];commit(batch);}}};
 const make=name=>({id:crypto.randomUUID(),name,tags:[],subTagIds:[],createdTime:'2026-11-24T01:00:00.000Z'});
 const create=()=>createOriginalTags({r:()=>({YH:{newTagGroup:({name})=>make(name),newTag:({name,...rest})=>({...make(name),...rest})}}),coordinator,navigate:action=>{const result=tail.then(action);tail=result.catch(()=>{});return result;},load:async()=>db.load(),catalogOperation:(kind,data)=>({type:'putCatalog',kind,data})});const api=create();
 t.after(()=>{db.close();return fs.rm(root,{recursive:true,force:true});});
 const states=async()=>(await api.call('getTagStates')).data;
 return {api,create,states,load:()=>db.load(),commit,pending:()=>pending,revision:()=>db.revision(),reopen:()=>{db.close();db=new WorkspaceDatabase(file);}};
}
const content=id=>({type:'putContent',data:{id,title:'標題 '+id,body:'不可刪掉的正文',document:null,kind:'text',tone:'sage'}});
const catalog=(kind,data)=>({type:'putCatalog',kind,data});
const add=(id,extra)=>({tagData:{id,name:'標籤 '+id,subTagIds:[],color:'#112233'},collection:{id:'collection-'+id,queryConfig:{type:'tag',id},viewIds:['view-'+id],currentViewId:'view-'+id},collectionView:{id:'view-'+id,collectionId:'collection-'+id,type:'table'},...extra});

test('empty tag reads keep stable native seed IDs without creating a shared revision or staged writes',async t=>{
 const f=await fixture(t),first=await f.states();assert.equal(first.tagList.length,6);assert.equal(first.tagGroups.length,1);
 assert.deepEqual(await f.states(),first);assert.equal(f.revision(),0);assert.equal(f.pending().length,0);assert.equal(f.load().tags,undefined);
 assert.deepEqual((await f.create().call('getTagStates')).data,first,'another window must derive identical built-in IDs and metadata');
 await assert.rejects(f.api.call('addTag',add('bad',{tagGroupId:'missing'})),/分組不存在/);
 assert.equal(f.revision(),0);assert.equal(f.pending().length,0);assert.deepEqual(await f.states(),first);
 await f.api.call('addTag',add('first',{tagGroupId:first.tagGroups[0].id}));assert(f.load().tags.some(row=>row.id==='first'));
 assert.equal((await f.states()).tagGroups[0].tags[0],'first');const revision=f.revision();await f.states();assert.equal(f.revision(),revision);
});

test('native group and descendant writes retain ordering, rename metadata, no content in card DTOs, and exact reopen',async t=>{
 const f=await fixture(t);await f.api.call('addTagGroup',{id:'work',name:'工作',tags:[],order:5,collapsed:false});
 await f.api.call('addTag',add('parent',{tagGroupId:'work'}));
 await f.api.call('addTag',add('sibling',{tagGroupId:'work'}));
 await f.api.call('addTag',add('child',{parentTagId:'parent'}));await f.api.call('addTag',add('grandchild',{parentTagId:'child'}));
 await f.api.call('updateTag',{tagId:'parent',updateData:{name:'重新命名',cards:[{id:'do-not-save'}],collapsed:true}});
 await f.api.call('updateTag',{tagId:'parent',updateData:{subTagIds:JSON.stringify(['child'])}});
 await f.api.call('updateTagGroup',{id:'work',name:'工作分組',tags:['parent','sibling']});
 const system=(await f.states()).tagGroups.find(row=>row.id!=='work');
 await f.api.call('batchUpdateTagGroup',[{id:'work',order:10},{id:system.id,order:1}]);
 f.commit([content('one'),content('two'),content('trash'),catalog('card',{id:'trash',isTrashed:'1'})]);
 await f.api.call('batchAddTagToCards',{cardList:['one','two','trash'].map(id=>({id,objectType:'NoteCard'})),tagIds:['parent']});
 const state=await f.states(),tag=state.tagList.find(row=>row.id==='parent'),group=state.tagGroups.find(row=>row.id==='work');
 assert.equal(tag.name,'重新命名');assert.equal(tag.color,'#112233');assert(tag.collapsed);assert.deepEqual(tag.subTagIds,['child']);
 assert.equal(tag.cards.length,2);assert(tag.cards.every(row=>row.cardData.title.startsWith('標題 ')));assert(tag.cards.every(row=>!Object.hasOwn(row.cardData,'content')));
 assert.deepEqual(group.tags,['parent','sibling']);assert.equal(group.name,'工作分組');assert.equal(group.order,10);
 assert.equal(f.load().tags.find(row=>row.id==='parent').cards,undefined);
 const before=f.load(),revision=f.revision();f.reopen();assert.deepEqual(f.load(),before);assert.deepEqual(await f.states(),state);assert.equal(f.revision(),revision);
});

test('deleting a tag or group recursively removes tag links and collections while preserving every note and placement',async t=>{
 const f=await fixture(t);await f.api.call('addTagGroup',{id:'g',name:'分組',tags:[]});
 for(const [id,extra]of [['parent',{tagGroupId:'g'}],['child',{parentTagId:'parent'}],['grandchild',{parentTagId:'child'}],['keep',{tagGroupId:'g'}]])await f.api.call('addTag',add(id,extra));
 f.commit([content('one')]);await f.api.call('batchAddTagToCards',{cardList:[{id:'one',objectType:'NoteCard'}],tagIds:['parent','child','grandchild','keep']});
 f.commit([catalog('property',{id:'shared-property',name:'備註',type:'text',config:{}}),catalog('collection-property',{id:'relation-child',collectionId:'collection-child',propertyId:'shared-property'}),catalog('collection-property',{id:'relation-keep',collectionId:'collection-keep',propertyId:'shared-property'}),catalog('object-property',{id:'object-value',objectId:'one',propertyId:'shared-property',value:'保留共用欄位內容'})]);
 const notes=f.load().contents,placements=f.load().instances;
 await f.api.call('deleteTag',{tagId:'parent'});let graph=f.load();assert.deepEqual(graph.contents,notes);assert.deepEqual(graph.instances,placements);
 for(const id of ['parent','child','grandchild']){assert(!graph.tags.some(row=>row.id===id));assert(!graph.cardTags.some(row=>row.tagId===id));assert(!graph.collections.some(row=>row.queryConfig.id===id));assert(!graph.collectionViews.some(row=>row.collectionId==='collection-'+id));}
 assert.deepEqual(graph.tagGroups.find(row=>row.id==='g').tags,['keep']);assert.equal(graph.cardTags.length,1);
 assert.deepEqual(graph.collectionPropertyRelations.map(row=>row.id),['relation-keep']);assert.equal(graph.properties[0].id,'shared-property');assert.equal(graph.objectPropertyRelations[0].value,'保留共用欄位內容');
 await f.api.call('deleteTagGroup','g');graph=f.load();assert(!graph.tagGroups.some(row=>row.id==='g'));assert(!graph.tags.some(row=>row.id==='keep'));assert.equal(graph.cardTags,undefined);assert.equal(graph.collections,undefined);assert.equal(graph.collectionViews,undefined);assert.equal(graph.collectionPropertyRelations,undefined);assert.equal(graph.properties.length,1);assert.equal(graph.objectPropertyRelations.length,1);assert.deepEqual(graph.contents,notes);
 f.reopen();assert.deepEqual(f.load(),graph);
});

test('table addTagToCard payload is compatible and card counts exclude trashed and missing sources',async t=>{
 const f=await fixture(t);await f.api.call('addTagGroup',{id:'g',name:'分組',tags:[]});await f.api.call('addTag',add('tag',{tagGroupId:'g'}));f.commit([content('old'),content('new'),content('trashed'),catalog('card',{id:'trashed',isTrashed:1})]);
 await f.api.call('addTagToCard',{cardIds:['old','new','trashed'],tagIds:['tag'],cardType:'NoteCard',createdBy:'device'});
 f.commit([catalog('card-tag',{...f.load().cardTags.find(row=>row.cardId==='old'),createdTime:'2026-11-01T00:00:00Z'}),catalog('card-tag',{...f.load().cardTags.find(row=>row.cardId==='new'),createdTime:'2026-11-24T00:00:00Z'}),catalog('card-tag',{id:'missing:tag',cardId:'missing',tagId:'tag'})]);
 assert.deepEqual((await f.states()).tagList.find(row=>row.id==='tag').cards.map(row=>row.cardId),['new','old']);const before=f.load();await assert.rejects(f.api.call('addTagToCard',{cardIds:['old','missing'],tagIds:['tag']}));assert.deepEqual(f.load(),before);assert.equal(f.pending().length,0);
});

test('invalid native batches and cycles stage nothing and preserve the original graph',async t=>{
 const f=await fixture(t);await f.api.call('addTagGroup',{id:'g',name:'分組',tags:[]});await f.api.call('addTag',add('p',{tagGroupId:'g'}));await f.api.call('addTag',add('c',{parentTagId:'p'}));f.commit([content('one')]);
 for(const [name,payload]of [
  ['batchUpdateTagGroup',[{id:'g',name:'不該留下'},{id:'missing',name:'missing'}]],
  ['batchAddTagToCards',{cardList:[{id:'one'},{id:'missing'}],tagIds:['p']}],
  ['batchAddTagToCards',{cardList:[{id:'one'}],tagIds:['p','missing']}],
  ['updateTag',{tagId:'c',updateData:{subTagIds:['p']}}],
  ['updateTagGroup',{id:'g',tags:['missing']}],
 ]){const before=f.load();await assert.rejects(f.api.call(name,payload));assert.equal(f.pending().length,0);assert.deepEqual(f.load(),before);}
});
