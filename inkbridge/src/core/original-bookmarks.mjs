// Original64744.rf /79509/48206 favorites contract. These records are separate
// from history tabs and from tag Collections; deleting a link never deletes a card.
import {noteRecord} from './original-catalog.mjs';
export function createOriginalBookmarks({r,redux,navigate,coordinator,load,catalogOperation}){
 const methods=new Set(['getTabs','getTabGroups','initTabSource','getTabReferencesObjectCards','createTab','updateTab','deleteTab','updateTabGroup']);
 const arrays=data=>{const next={...data};for(const key of ['tabIds','pinnedTabIds','subTabIds'])if(next[key]!==undefined)next[key]=typeof next[key]==='string'?JSON.parse(next[key]):next[key];return next;};
 const put=(kind,data)=>coordinator.stage(catalogOperation(kind,arrays(data)));
 const defaultGroup={...r(19281).YH.newTabGroup({name:'Default'}),id:'default',title:'Default',createdBy:'system'};
 const ready=()=>navigate(async()=>{await coordinator.flush();let graph=await load();if(!(graph.tabGroups||[]).length)graph={...graph,tabGroups:[defaultGroup]};redux.dispatch(r(49478).ex({currentTabGroupId:graph.tabGroups[0].id}));return graph;});
 const call=(name,payload)=>navigate(async()=>{
  await coordinator.flush();const graph=await load(),tabs=graph.savedTabs||[],groups=graph.tabGroups?.length?graph.tabGroups:[defaultGroup];
  if(!graph.tabGroups?.length&&['createTab','updateTabGroup'].includes(name))put('tab-group',defaultGroup);
  if(name==='getTabs')return {success:true,data:tabs};if(name==='getTabGroups')return {success:true,data:groups};
  // background initTabSource selects saved-link targets, not history tabs.
  // Unsupported card models have no records in this workspace yet.
  const notes=ids=>graph.contents.filter(row=>row.kind==='text'&&ids.has(row.id)).map(row=>noteRecord(graph,row));
  const media=ids=>graph.contents.filter(row=>row.kind==='image'&&(ids.has(row.id)||ids.has(graph.cardMetadata?.find(meta=>meta.id===row.id)?.fileId))).map(row=>({...graph.cardMetadata?.find(meta=>meta.id===row.id),...row,type:'image'}));
  if(name==='initTabSource'){
   const group=tabs.filter(tab=>tab.tabGroupId===payload),ids=types=>new Set(group.filter(tab=>types.includes(tab.type)).map(tab=>tab.sourceId));
   const boards=graph.boards.map(board=>({color:'white',icon:null,...board.attributes,id:board.id,name:board.title}));
   return {success:true,allWhiteboards:boards,nodeCardTabSource:notes(ids(['NoteCard'])),whiteboardTabSource:boards.filter(board=>ids(['Whiteboard']).has(board.id)),mediaTabSource:media(ids(['MediaCard','image','video','audio'])),tagTabSource:(graph.tags||[]).filter(tag=>ids(['tag']).has(tag.id)),pdfTabSource:[],highlightTabSource:[],mindmapTabSource:[],videoHighlightTabSource:[],noteHighlightTabSource:[],websiteTabSource:[]};
  }
  if(name==='getTabReferencesObjectCards'){
   const references=payload.references||[],ids=types=>new Set(references.filter(ref=>types.includes(ref.type)).map(ref=>ref.id));
   return {noteCards:notes(ids(['NoteCard'])),mediaCards:media(ids(['MediaCard','image','video','audio'])),mindMaps:[],pdfCards:[],highlights:[],videoHighlights:[],audioHighlights:[],noteHighlights:[]};
  }
  if(name==='createTab'){
   const tab=arrays(payload);if(tabs.some(row=>row.id===tab.id))throw Error('收藏ID已存在');if(!groups.some(group=>group.id===tab.tabGroupId))throw Error('收藏分組不存在');
   if(tab.parentTabId&&!tabs.some(row=>row.id===tab.parentTabId&&row.type==='folder'))throw Error('收藏資料夾不存在');
   put('saved-tab',tab);
   // Keep a recoverable tree even if the native caller is interrupted before
   // its following ordering request. That request may still choose final order.
   if(tab.parentTabId){const parent=tabs.find(row=>row.id===tab.parentTabId);put('saved-tab',{...parent,subTabIds:[...new Set([...(parent.subTabIds||[]),tab.id])]});}
   else{const group=groups.find(group=>group.id===tab.tabGroupId);put('tab-group',{...group,tabIds:[...new Set([...group.tabIds,tab.id])]});}
   await coordinator.flush();return {success:true,tab};
  }
  if(name==='updateTab'){
   const previous=tabs.find(row=>row.id===payload.id);if(!previous)throw Error('收藏不存在');const tab=arrays({...previous,...payload,lastEditedTime:new Date().toISOString()});put('saved-tab',tab);await coordinator.flush();return {success:true,tab};
  }
  if(name==='updateTabGroup'){
   const previous=groups.find(row=>row.id===payload.id);if(!previous)throw Error('收藏分組不存在');const tabGroup=arrays({...previous,...payload,lastEditedTime:new Date().toISOString()});put('tab-group',tabGroup);await coordinator.flush();return {success:true,tabGroup};
  }
  if(name==='deleteTab'){
   const id=typeof payload==='string'?payload:payload.id,ids=new Set([id]);let changed=true;while(changed){changed=false;for(const tab of tabs)if(ids.has(tab.parentTabId)&&!ids.has(tab.id)){ids.add(tab.id);changed=true;}}
   for(const id of ids)coordinator.stage({type:'deleteCatalog',kind:'saved-tab',id});
   for(const tab of tabs)if(!ids.has(tab.id)&&tab.subTabIds?.some(id=>ids.has(id)))put('saved-tab',{...tab,subTabIds:tab.subTabIds.filter(id=>!ids.has(id))});
   for(const group of groups)put('tab-group',{...group,tabIds:group.tabIds.filter(id=>!ids.has(id)),pinnedTabIds:group.pinnedTabIds.filter(id=>!ids.has(id))});
   await coordinator.flush();return {success:true,deletedTabIds:[...ids]};
  }
  throw Error('Unsupported bookmark service');
 });
 return {ready,has:name=>methods.has(name),call};
}
