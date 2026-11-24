// SQLite adapter for the original tag tree, card picker and background DTOs.
import {noteRecord,attachmentRecord,websiteRecord} from './original-catalog.mjs';
const parseArray=value=>{const list=typeof value==='string'?JSON.parse(value):value??[];if(!Array.isArray(list)||list.some(id=>typeof id!=='string'||!/^[a-z\d_.:-]{1,128}$/i.test(id)))throw Error('標籤順序格式無效');return [...new Set(list)];};
const tagRow=row=>{const {cards,...data}=row;return {...data,subTagIds:parseArray(row.subTagIds)};};
const groupRow=row=>({...row,tags:parseArray(row.tags)});
const validNamed=row=>{if(!row||!/^[a-z\d_.:-]{1,128}$/i.test(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>255)throw Error('標籤名稱或識別無效');return row;};
const trashed=row=>row?.isTrashed===true||row?.isTrashed===1||row?.isTrashed==='1';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function filterTagTree(tags,groups,query){
 const text=query.trim().toLocaleLowerCase();if(!text)return {tags,tagGroups:groups};
 const keep=new Set(tags.filter(tag=>tag.name.toLocaleLowerCase().includes(text)).map(tag=>tag.id));
 let changed=true;while(changed){changed=false;for(const tag of tags)if(!keep.has(tag.id)&&parseArray(tag.subTagIds).some(id=>keep.has(id))){keep.add(tag.id);changed=true;}}
 return {tags:tags.filter(tag=>keep.has(tag.id)).map(tag=>({...tag,collapsed:false,subTagIds:parseArray(tag.subTagIds).filter(id=>keep.has(id))})),tagGroups:groups.map(group=>({...group,tags:parseArray(group.tags).filter(id=>keep.has(id))})).filter(group=>group.tags.length)};
}

export function createOriginalTags({r,navigate,coordinator,load,catalogOperation}){
 const reads=new Set(['getTagStates','getTagListAndGroup','getCommonTagsByCardIds']);
 const writes=new Set(['addTag','updateTag','deleteTag','addTagGroup','updateTagGroup','batchUpdateTagGroup','deleteTagGroup','addTagToCard','batchAddTagToCards','batchDeleteTagFromCards']);
 const systemNames=['NoteCard','WebClipping','VideoHighlight','PdfHighlight','AudioHighlight','NoteHighlight'];
 let defaults;
 function withDefaults(graph){
  if((graph.tagGroups||[]).length)return {graph,bootstrap:[]};
  // Stable native seed IDs, but no shared write merely from opening the page.
  if(!defaults||defaults.workspaceId!==graph.workspaceId){
   const systemTime='1970-01-01T00:00:00.000Z';
   const tags=[...(graph.tags||[])],created=[],group={...r(19281).YH.newTagGroup({name:'System'}),id:`tag-group-system-${graph.workspaceId}`,createdTime:systemTime,lastEditedTime:systemTime,createdBy:'system'};
   for(let order=0;order<systemNames.length;order++){
    const name=systemNames[order];let tag=tags.find(tag=>tag.name===name&&tag.createdBy==='system');
    if(!tag){tag=tagRow({...r(19281).YH.newTag({name,order}),id:`tag-system-${graph.workspaceId}-${name}`,createdTime:systemTime,lastEditedTime:systemTime,createdBy:'system'});tags.push(tag);created.push(tag);}
   }
   group.tags=tags.map(tag=>tag.id);defaults={workspaceId:graph.workspaceId,tags,group,created};
  }
  return {graph:{...graph,tags:defaults.tags,tagGroups:[defaults.group]},bootstrap:[...defaults.created.map(data=>catalogOperation('tag',data)),catalogOperation('tag-group',defaults.group)]};
 }
 function dto(graph){
  const tags=(graph.tags||[]).map(tagRow),groups=(graph.tagGroups||[]).map(groupRow),contents=new Map((graph.contents||[]).map(row=>[row.id,row]));
  const metadata=new Map((graph.cardMetadata||[]).map(row=>[row.id,row])),diaries=new Map((graph.quickNotes||[]).map(row=>[row.id,row]));
  return {tagList:tags.map(tag=>({...tag,cards:(graph.cardTags||[]).filter(link=>link.tagId===tag.id).flatMap(link=>{
   const content=contents.get(link.cardId),meta=metadata.get(link.cardId),diary=diaries.get(link.cardId);
   if(!content||trashed(meta)||trashed(diary))return [];
   const record=content.kind==='image'||content.kind==='pdf'?attachmentRecord(graph,content):content.kind==='html'?websiteRecord(graph,content):noteRecord(graph,content);
   const {content:_content,...cardData}={...record,...(diary||{}),type:link.cardType||record.type};
   return [{...link,cardData}];
  }).sort((a,b)=>(Date.parse(b.createdTime)||0)-(Date.parse(a.createdTime)||0))})),tagGroups:groups};
 }
 function validateHierarchy(tags,groups){
  const byId=new Map(tags.map(tag=>[tag.id,tag]));
  for(const group of groups)for(const id of group.tags)if(!byId.has(id))throw Error('標籤分組引用不存在的標籤');
  const done=new Set(),visiting=new Set();
  const visit=id=>{if(visiting.has(id))throw Error('標籤不能形成循環');if(done.has(id))return;const tag=byId.get(id);if(!tag)throw Error('子標籤不存在');visiting.add(id);for(const child of tag.subTagIds)visit(child);visiting.delete(id);done.add(id);};
  for(const id of byId.keys())visit(id);
 }
 const call=(name,payload)=>navigate(async()=>{
  if(!reads.has(name)&&!writes.has(name))throw Error('Unsupported original tag service: '+name);
  await coordinator.flush();const initialized=withDefaults(await load()),graph=initialized.graph;
  if(name==='getTagStates'||name==='getTagListAndGroup')return {success:true,data:dto(graph)};
  if(name==='getCommonTagsByCardIds'){const ids=payload?.cardIds||[];return {success:true,data:ids.length?(graph.tags||[]).map(tagRow).filter(tag=>ids.every(cardId=>(graph.cardTags||[]).some(link=>link.cardId===cardId&&link.tagId===tag.id))):[]};}
  const tags=(graph.tags||[]).map(tagRow),groups=(graph.tagGroups||[]).map(groupRow),operations=[];
  const put=(kind,data)=>operations.push(catalogOperation(kind,data)),remove=(kind,id)=>operations.push({type:'deleteCatalog',kind,id});
  const tagById=id=>{const row=tags.find(row=>row.id===id);if(!row)throw Error('標籤不存在');return row;};
  const groupById=id=>{const row=groups.find(row=>row.id===id);if(!row)throw Error('標籤分組不存在');return row;};
  const update=(kind,row,next)=>{if(!same(row,next)){const value={...next,lastEditedTime:new Date().toISOString()};put(kind,value);Object.assign(row,value);}};
  function deleteTags(rootIds,groupId){
   const ids=new Set(),visit=id=>{if(ids.has(id))return;const tag=tagById(id);ids.add(id);for(const child of tag.subTagIds)visit(child);};for(const id of rootIds)visit(id);
   const collectionIds=new Set((graph.collections||[]).filter(row=>row.queryConfig?.type==='tag'&&ids.has(row.queryConfig.id)).map(row=>row.id));
   for(const row of tags)if(ids.has(row.id))remove('tag',row.id);else update('tag',row,{...row,subTagIds:row.subTagIds.filter(id=>!ids.has(id))});
   for(const row of groups)if(row.id===groupId)remove('tag-group',row.id);else update('tag-group',row,{...row,tags:row.tags.filter(id=>!ids.has(id))});
   for(const row of graph.cardTags||[])if(ids.has(row.tagId))remove('card-tag',row.id);
   for(const row of graph.collections||[])if(collectionIds.has(row.id))remove('collection',row.id);
   for(const row of graph.collectionViews||[])if(collectionIds.has(row.collectionId))remove('collection-view',row.id);
   for(const row of graph.collectionPropertyRelations||[])if(collectionIds.has(row.collectionId))remove('collection-property',row.id);
  }
  if(name==='addTag'){
   const {tagData,tagGroupId,parentTagId,collection,collectionView}=payload||{},tag=validNamed(tagRow(tagData||{}));
   if(tags.some(row=>row.id===tag.id))throw Error('標籤ID已存在');
   const parent=parentTagId?tagById(parentTagId):null,group=tagGroupId?groupById(tagGroupId):null;
   if(!parent&&!group)throw Error('請指定標籤分組或父標籤');
   if(collection&&(!collection.id||graph.collections?.some(row=>row.id===collection.id)))throw Error('標籤集合ID已存在或無效');
   if(collectionView&&(!collectionView.id||!collection||collectionView.collectionId!==collection.id||graph.collectionViews?.some(row=>row.id===collectionView.id)))throw Error('標籤集合檢視無效');
   tags.push(tag);put('tag',tag);if(group)update('tag-group',group,{...group,tags:[tag.id,...group.tags]});if(parent)update('tag',parent,{...parent,subTagIds:[tag.id,...parent.subTagIds]});
   if(collection)put('collection',collection);if(collectionView)put('collection-view',collectionView);
  }else if(name==='updateTag'){
   const row=tagById(payload?.tagId),{cards,...updates}=payload?.updateData||{};
   update('tag',row,validNamed(tagRow({...row,...updates,id:row.id})));
  }else if(name==='addTagGroup'){
   const group=validNamed(groupRow(payload||{}));if(groups.some(row=>row.id===group.id))throw Error('標籤分組ID已存在');groups.push(group);put('tag-group',group);
  }else if(name==='updateTagGroup'||name==='batchUpdateTagGroup'){
   const batch=name==='updateTagGroup'?[payload]:payload;if(!Array.isArray(batch))throw Error('標籤分組批次格式無效');
   const next=batch.map(value=>{const old=groupById(value?.id);return {old,next:validNamed(groupRow({...old,...value,id:old.id}))};});
   for(const {old,next:row}of next)update('tag-group',old,row);
  }else if(name==='deleteTag')deleteTags([tagById(payload?.tagId).id]);
  else if(name==='deleteTagGroup'){const group=groupById(payload);deleteTags(group.tags,group.id);}
  else if(name==='batchAddTagToCards'||name==='addTagToCard'){
   if(name==='addTagToCard'&&!Array.isArray(payload?.cardIds))throw Error('Invalid tag assignment');
   const cards=name==='addTagToCard'?payload.cardIds.map(id=>({id,objectType:payload.cardType})):payload?.cardList||[],tagIds=payload?.tagIds||[];if(!Array.isArray(cards)||!Array.isArray(tagIds))throw Error('Invalid tag assignment');
   if(cards.some(card=>!graph.contents.some(row=>row.id===card.id)))throw Error('卡片不存在');for(const id of tagIds)tagById(id);
   for(const card of cards)for(const tagId of new Set(tagIds))if(!(graph.cardTags||[]).some(link=>link.cardId===card.id&&link.tagId===tagId))put('card-tag',{id:`${card.id}:${tagId}`,cardId:card.id,cardType:card.objectType||'NoteCard',tagId,createdBy:payload.createdBy||'inkbridge-local',createdTime:new Date().toISOString()});
  }else if(name==='batchDeleteTagFromCards'){
   if(!Array.isArray(payload?.cardIds))throw Error('Invalid tag assignment');tagById(payload.tagId);
   for(const link of graph.cardTags||[])if(payload.cardIds.includes(link.cardId)&&link.tagId===payload.tagId)remove('card-tag',link.id);
  }
  if(!name.startsWith('delete'))validateHierarchy(tags,groups);
  if(operations.length){for(const operation of [...initialized.bootstrap,...operations])coordinator.stage(operation);await coordinator.flush();}
  return {success:true};
 });
 return {has:name=>reads.has(name)||writes.has(name),call,project:graph=>dto(withDefaults(graph).graph)};
}
