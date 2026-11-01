// Data adapter for original 64744.am and background tag services. The full
// native manager creates its tag/collection/view DTOs; no replacement tag UI.
export function createOriginalTags({r,navigate,coordinator,load,catalogOperation}){
 const reads=new Set(['getTagStates','getCommonTagsByCardIds']);
 const writes=new Set(['addTag','batchAddTagToCards','batchDeleteTagFromCards']);
 const systemNames=['NoteCard','WebClipping','VideoHighlight','PdfHighlight','AudioHighlight','NoteHighlight'];
 const put=(kind,data)=>coordinator.stage(catalogOperation(kind,data));
 async function initialize(){
  const graph=await load();if((graph.tagGroups||[]).length)return graph;
  // Original initTagState creates a System group and these six system tags.
  // IDs belong to this independent workspace rather than the original account.
  const tags=[...(graph.tags||[])],group={...r(19281).YH.newTagGroup({name:'System'}),createdBy:'system'};
  for(let order=0;order<systemNames.length;order++){
   const name=systemNames[order];let tag=tags.find(tag=>tag.name===name&&tag.createdBy==='system');
   if(!tag){tag={...r(19281).YH.newTag({name,order}),createdBy:'system'};tags.push(tag);put('tag',tag);}
   group.tags.push(tag.id);
  }
  for(const tag of tags)if(!group.tags.includes(tag.id))group.tags.push(tag.id);
  put('tag-group',group);await coordinator.flush();return load();
 }
 const call=(name,payload)=>navigate(async()=>{
  await coordinator.flush();let graph=await initialize();
  if(name==='getTagStates')return {success:true,data:{tagList:graph.tags||[],tagGroups:graph.tagGroups||[]}};
  if(name==='getCommonTagsByCardIds'){const ids=payload.cardIds||[];return {success:true,data:ids.length?(graph.tags||[]).filter(tag=>ids.every(cardId=>(graph.cardTags||[]).some(link=>link.cardId===cardId&&link.tagId===tag.id))):[]};}
  if(name==='addTag'){
   const {tagData:tag,tagGroupId,collection,collectionView}=payload,group=(graph.tagGroups||[]).find(row=>row.id===tagGroupId);
   if(!group)throw Error('標籤分組不存在');if((graph.tags||[]).some(row=>row.id===tag.id))throw Error('標籤ID已存在');
   put('tag',tag);put('tag-group',{...group,tags:[...group.tags,tag.id]});
   if(collection)put('collection',collection);if(collectionView)put('collection-view',collectionView);
  }else if(name==='batchAddTagToCards'){
   const cards=payload.cardList||[],tagIds=payload.tagIds||[];if(!Array.isArray(cards)||!Array.isArray(tagIds))throw Error('Invalid tag assignment');
   if(cards.some(card=>!graph.contents.some(row=>row.id===card.id)))throw Error('卡片不存在');if(tagIds.some(id=>!(graph.tags||[]).some(tag=>tag.id===id)))throw Error('標籤不存在');
   for(const card of cards)for(const tagId of tagIds)if(!(graph.cardTags||[]).some(link=>link.cardId===card.id&&link.tagId===tagId))put('card-tag',{id:`${card.id}:${tagId}`,cardId:card.id,cardType:card.objectType||'NoteCard',tagId,createdBy:payload.createdBy||'inkbridge-local',createdTime:new Date().toISOString()});
  }else if(name==='batchDeleteTagFromCards'){
   for(const link of graph.cardTags||[])if((payload.cardIds||[]).includes(link.cardId)&&link.tagId===payload.tagId)coordinator.stage({type:'deleteCatalog',kind:'card-tag',id:link.id});
  }else throw Error('Unsupported original tag service: '+name);
  await coordinator.flush();return {success:true};
 });
 return {has:name=>reads.has(name)||writes.has(name),call};
}
