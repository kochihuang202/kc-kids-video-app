// Select only the published subtree. No profile, database, history or credentials
// are copied into the public document. Original payload mapping is in the viewer.
const clone=value=>JSON.parse(JSON.stringify(value));
const pick=(record,keys)=>Object.fromEntries(keys.filter(k=>record?.[k]!==undefined).map(k=>[k,record[k]]));
const visibleKeys=['title','name','fileId','mediaType','caption','width','height','currentPage','totalPages','pageCount','scale','isAutoHeight','color','fontSize','padding','topPadding','style','backgroundColor','lastEditedTime','createdTime','fixedConnection','canvasBackground','backgroundType','backgroundImage','inkbridgePreviewFileId','cornerRadius','textAlign','verticalAlign','highlightHeader','isPinned','pinStyle','pinColor','pinPosition','isFolded','rotationAngle','displayType','parentId','isAutoWidth'];
const {normalizeSelection}=require('./share-selection.cjs');
function scopeWebShare(graph,rootBoardId,{selectedBoardIds}={}){
 const boards=new Map((graph.boards||[]).filter(b=>!b.attributes?.isTrashed).map(b=>[b.id,b]));
 if(!boards.has(rootBoardId))throw Error('分享白板不存在');
 const ids=new Set(normalizeSelection(graph,rootBoardId,selectedBoardIds)),links=(graph.whiteboardInstances||[]).filter(r=>!r.isTrashed&&r.containerType==='whiteboard');
 // A generated board preview can contain a descendant that was not selected.
 // It is a rendering cache, not the user's chosen background image.
 const sanitizePreview=(a,generated=a.inkbridgePreviewFileId)=>{if(selectedBoardIds!==undefined){delete a.inkbridgePreviewFileId;if(generated&&(a.backgroundImage===generated||a.backgroundImage==='flexnote://file/'+generated))delete a.backgroundImage;}return a;};
 const boardAttributes=b=>sanitizePreview(pick(b.attributes,visibleKeys));
 const trashed=new Set((graph.cardMetadata||[]).filter(r=>r.isTrashed).map(r=>r.id));
 const instances=(graph.instances||[]).filter(r=>ids.has(r.boardId)&&!r.attributes?.isTrashed&&!trashed.has(r.contentId)).map(r=>({...pick(r,['id','contentId','boardId','x','y','width','height','z','parentId']),attributes:pick(r.attributes,visibleKeys)})),contentIds=new Set(instances.map(r=>r.contentId));
 const contents=(graph.contents||[]).filter(r=>contentIds.has(r.id)).map(r=>pick(r,['id','title','body','document','kind','tone']));if(contents.length!==contentIds.size)throw Error('分享卡片內容缺失');
 const sectionRows=(graph.sections||[]).filter(r=>ids.has(r.whiteboardId||r.boardId)),mapInstances=(graph.mindmapInstances||[]).filter(r=>ids.has(r.whiteboardId)),mapIds=new Set(mapInstances.map(r=>r.objectId));
 const scoped={boards:[...ids].map(id=>({id,title:boards.get(id).title,attributes:boardAttributes(boards.get(id))})),instances,contents,
  whiteboardInstances:links.filter(r=>ids.has(r.containerId)).map(r=>ids.has(r.whiteboardId)?sanitizePreview(pick(r,['id','whiteboardId','containerId','containerType','x','y','width','height',...visibleKeys]),r.inkbridgePreviewFileId||boards.get(r.whiteboardId)?.attributes?.inkbridgePreviewFileId):({...pick(r,['id','whiteboardId','containerId','containerType','x','y','width','height']),isUnshared:true,name:'未分享'})),cardMetadata:(graph.cardMetadata||[]).filter(r=>contentIds.has(r.id)&&!r.isTrashed).map(r=>pick(r,['id',...visibleKeys])),sections:sectionRows,
  textElements:(graph.textElements||[]).filter(r=>ids.has(r.whiteboardId||r.boardId)),drawingStrokes:(graph.drawingStrokes||[]).filter(r=>ids.has(r.whiteboardId||r.boardId)),
  mindmapInstances:mapInstances,mindmaps:(graph.mindmaps||[]).filter(r=>mapIds.has(r.id)),mindmapNodes:(graph.mindmapNodes||[]).filter(r=>mapIds.has(r.mindMapId)),
  connections:(graph.connections||[]).filter(r=>ids.has(r.whiteboardId||r.boardId))};
 const required=new Set(),known=new Map((graph.files||[]).map(r=>[r.id,r]));
 function walk(value,key=''){
  if(typeof value==='string'){
   if(value.startsWith('flexnote://file/')){const id=value.slice(16).split(/[?.]/)[0];if(!/^[a-f0-9]{64}$/.test(id))throw Error('分享附件引用格式不合法');required.add(id);}
   else if(/fileId|snapshot|backgroundImage|inkbridgePreviewFileId/i.test(key)&&/^[a-f0-9]{64}$/.test(value))required.add(value);
   else if(/^https?:\/\//.test(value)&&/src|backgroundImage/i.test(key))throw Error('分享內容包含未下載的外部圖片，請先保存為本機附件');
   else if((key==='content'||key==='caption')&&/^[\[{]/.test(value)){try{walk(JSON.parse(value));}catch(error){if(error.message.startsWith('分享'))throw error;}}
  }else if(Array.isArray(value))value.forEach(v=>walk(v,key));else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))walk(v,k);
 }
 walk(scoped);const files=[...required].map(id=>{const file=known.get(id);if(!file)throw Error('分享附件缺失：'+id);return file;});
 // Metadata uses an allowlist: never serialize absolute paths or arbitrary
 // account/plugin metadata alongside the selected visible card properties.
 scoped.files=files.map(({id,name,type,size,sha256,metadata})=>{let dimensions={};try{dimensions=typeof metadata==='string'?JSON.parse(metadata):metadata;}catch{}return {id,name,type,size,sha256,metadata:JSON.stringify(pick(dimensions,['width','height','duration','totalPages','numPages']))};});
 return {format:'inkbridge-web-share',version:1,rootBoardId,boardIds:[...ids],graph:clone(scoped),files:clone(files)};
}
module.exports={scopeWebShare};
