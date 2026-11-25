// Missing SQLite batch contracts used by native94700.Su. The native algorithm
// remains responsible for IDs, offsets, group expansion and edge remapping.
import {validateBoardReference} from './nested-whiteboards.mjs';
import {prepareCardMove,cardMoveOperations} from './card-move.mjs';

export function installCardCut({store,board,getBoardId,getWorkspaceId,isBoard,screenToFlow,load,mutate,track,onMove,report}){
 let pending=null,busy=false,pointer=null;
 const editing=event=>store.getState().editingNodeId||event.target?.closest?.('input,textarea,[contenteditable=true],[role=dialog]');
 board.addEventListener('pointermove',event=>{pointer={boardId:getBoardId(),x:event.clientX,y:event.clientY};});
 window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!editing(event)){pending=null;return;}
  if(!isBoard()||event.defaultPrevented||event.isComposing||event.keyCode===229||editing(event)||busy||
     !(event.ctrlKey||event.metaKey)||event.shiftKey||event.altKey||event.key.toLowerCase()!=='x')return;
  const {nodes,selectedNodeIds}=store.getState(),cards=nodes.filter(node=>selectedNodeIds.has(node.id));
  if(!cards.length||cards.length!==selectedNodeIds.size||cards.some(node=>node.type!=='NoteCard'))return;
  event.preventDefault();event.stopImmediatePropagation();
  const cut={token:crypto.randomUUID(),source:getBoardId(),workspaceId:getWorkspaceId(),ids:cards.map(node=>node.id)};
  pending=cut;
  window.inkbridge.writeClipboardTextAndHtml({text:cards.map(node=>node.data.title||'筆記卡片').join('\n'),html:'<meta data-inkbridge-card-cut="'+cut.token+'">'})
   .catch(error=>{if(pending===cut)pending=null;report(error);});
 },true);
 window.addEventListener('paste',event=>{
  const token=/data-inkbridge-card-cut="([a-f0-9-]+)"/i.exec(event.clipboardData?.getData('text/html')||'')?.[1];
  if(!token||!isBoard()||editing(event))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(busy||pending?.token!==token)return;
  const cut=pending,target=getBoardId(),box=board.getBoundingClientRect();
  const point=screenToFlow(pointer?.boardId===target?pointer:{x:box.left+box.width/2,y:box.top+box.height/2});
  busy=true;
  track(()=>mutate(async()=>{
   const graph=await load();
   if(graph.workspaceId!==cut.workspaceId||getBoardId()!==target||!isBoard())throw Error('白板已切換，請重新貼上');
   const move=prepareCardMove(graph,cut,target,point);
   return {graph,move,operations:cardMoveOperations(graph,move)};
  },({move})=>{
   pending=null;
   onMove(move,target);
  })).finally(()=>{busy=false;}).catch(()=>{});
 },true);
}
export function installOriginalClipboard({navigate,coordinator,load,elements,connections,rehydrate}){
 const previous=globalThis.__inkbridgeServices,names=new Set(['batchCreateTextElements','batchCreateWhiteboardInstances','batchAddConnections','batchUpdateConnections','batchDeleteConnections','batchDeleteEdges','batchDeleteMediaCardInstances','batchDeletePdfCardInstances','batchUpdatePdfCardInstances','batchGetInstanceListByNodeIdAndType']);
 const call=async(name,payload)=>{
  if(name==='batchCreateTextElements')return elements.call(name,payload);
  if(['batchAddConnections','batchUpdateConnections','batchDeleteConnections','batchDeleteEdges'].includes(name))return connections.call(name,payload);
  if(name==='batchGetInstanceListByNodeIdAndType'){
   await coordinator.flush();const graph=await load(),out=[];
   for(const [key,type,rows]of [['noteCards','NoteCard',graph.instances.filter(row=>graph.contents.some(c=>c.id===row.contentId&&c.kind==='text')).map(row=>({...row.attributes,id:row.id,objectId:row.contentId,whiteboardId:row.boardId,x:row.x,y:row.y,width:row.width,height:row.height}))],['sections','NodeGroup',graph.sections],['textElements','Text',graph.textElements],['mindmapInstances','Mindmap',graph.mindmapInstances],['mindmapNodes','MindmapNode',graph.mindmapNodes],['pdfCards','PDFCard',graph.instances.filter(row=>graph.contents.some(c=>c.id===row.contentId&&c.kind==='pdf'))],['mediaCards','MediaCard',graph.instances.filter(row=>graph.contents.some(c=>c.id===row.contentId&&c.kind==='image'))],['whiteboardInstances','Whiteboard',graph.whiteboardInstances],['videoHighlightInstances','VideoHighlight',graph.videoHighlightInstances]])for(const row of rows||[])if(payload[key]?.includes(row.id))out.push({...row.attributes,...row,objectId:row.objectId||row.contentId,whiteboardId:row.whiteboardId||row.boardId,__type:type});
   return out;
  }
  return navigate(async()=>{
   await coordinator.flush();const graph=await load();
   if(name==='batchCreateWhiteboardInstances'){
    if(!Array.isArray(payload)||new Set(payload.map(row=>row.id)).size!==payload.length)throw Error('白板引用批次格式錯誤');
    const proposed={...graph,whiteboardInstances:[...(graph.whiteboardInstances||[]),...payload]};
    for(const row of payload){if(graph.whiteboardInstances?.some(r=>r.id===row.id))throw Error('白板引用已存在');validateBoardReference(proposed,row);}
    for(const row of payload)coordinator.stage({type:'putCatalog',kind:'whiteboard-instance',data:row});
   }else if(name==='batchUpdatePdfCardInstances'){
    for(const {id,updates}of payload){const old=graph.instances.find(row=>row.id===id&&graph.contents.some(c=>c.id===row.contentId&&c.kind==='pdf'));if(!old)throw Error('PDF位置不存在');coordinator.stage({type:'putInstance',data:{...old,...updates,id}});coordinator.stage({type:'putCatalog',kind:'instance',data:{...old.attributes,...updates,id}});}
   }else{
    for(const id of payload)coordinator.stage({type:'deleteInstance',id});
   }
   await coordinator.flush();rehydrate(await load(),{preserveHistory:true});return {success:true};
  });
 };
 globalThis.__inkbridgeServices={has:name=>names.has(name)||previous.has(name),call:(name,payload)=>names.has(name)?call(name,payload):previous.call(name,payload)};
 // Canvas10764 now emits MindmapNode roots; the complete native94700 paste
 // converter still consumes Mindmap placements. Adapt their verified identity
 // contract, retaining the map's shared content and native layout on hydration.
 globalThis.__inkbridgePrepareCanvasPaste=(nodes,edges)=>{
  const roots=new Set(nodes.filter(row=>row.type==='MindmapNode'&&row.data.isRoot).map(row=>row.data.mindMapId||row.data.objectId));
  if(nodes.some(row=>row.type==='MindmapNode'&&!row.data.isRoot&&!roots.has(row.data.mindMapId)))throw Error('原版通用貼上流程不支援獨立思維導圖子樹；可複製根節點或在編輯器內複製文字。');
  const normalized=nodes.filter(row=>row.type!=='MindmapNode'||row.data.isRoot).map(row=>row.type==='MindmapNode'?{...row,type:'Mindmap',data:{...row.data,objectId:row.data.mindMapId||row.data.objectId}}:row),ids=new Set(normalized.map(row=>row.id));
  return {nodes:normalized,edges:edges.filter(row=>ids.has(row.source)&&ids.has(row.target))};
 };
 globalThis.__inkbridgeAfterCanvasPaste=async()=>{await coordinator.flush();rehydrate(await load(),{preserveHistory:true});};
 return {call};
}
