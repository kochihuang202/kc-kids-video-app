// Native23/66963/37883 own snapshot timing, scope, shortcuts and the 30-step cap.
// Native48626.ib restores typed records; this module adapts that storage boundary
// to InkBridge's schema and one atomic transaction. Never undo files/history or
// delete content objects merely because their canvas placement was undone.
import {documentIdentity} from './note-version.mjs';
const catalogs={'section':'sections','text-element':'textElements','drawing-stroke':'drawingStrokes','mindmap':'mindmaps','mindmap-node':'mindmapNodes','mindmap-instance':'mindmapInstances','whiteboard-instance':'whiteboardInstances','connection':'connections'};
const clone=value=>structuredClone(value),same=(a,b)=>documentIdentity(a)===documentIdentity(b);
export function captureCanvasHistory(graph,boardId){
 let value={workspaceId:graph.workspaceId,contents:graph.contents,instances:graph.instances,cardMetadata:graph.cardMetadata||[],...Object.fromEntries(Object.values(catalogs).map(key=>[key,graph[key]||[]]))};
 if(boardId){
  value.instances=value.instances.filter(row=>row.boardId===boardId);const ids=new Set(value.instances.map(row=>row.contentId));
  value.contents=value.contents.filter(row=>ids.has(row.id));value.cardMetadata=value.cardMetadata.filter(row=>ids.has(row.id));
  for(const key of ['sections','textElements','drawingStrokes','mindmapInstances','connections'])value[key]=value[key].filter(row=>row.whiteboardId===boardId);
  const maps=new Set(value.mindmapInstances.map(row=>row.objectId));value.mindmaps=value.mindmaps.filter(row=>maps.has(row.id));value.mindmapNodes=value.mindmapNodes.filter(row=>maps.has(row.mindMapId));
  value.whiteboardInstances=value.whiteboardInstances.filter(row=>row.containerType==='whiteboard'&&row.containerId===boardId);value.boardId=boardId;
 }
 return clone(value);
}
function depth(row,rows){const seen=new Set();let n=0;while(row?.parentId){if(seen.has(row.id))throw Error('Cyclic history group');seen.add(row.id);n++;row=rows.find(r=>r.id===row.parentId);}return n;}
export function canvasHistoryOperations(target,current){
 if(!target||target.workspaceId!==current.workspaceId)throw Error('復原記錄不屬於目前工作區');
 if(target.boardId){const whole=current;current={...captureCanvasHistory(current,target.boardId),contents:whole.contents,cardMetadata:whole.cardMetadata};}
 const deletes=[],puts=[],sectionPuts=[],sectionDeletes=[],connections=[];
 const putCatalog=(kind,data)=>({type:'putCatalog',kind,data:clone(data)});
 for(const row of current.instances)if(!target.instances.some(r=>r.id===row.id))deletes.push({type:'deleteInstance',id:row.id});
 for(const row of target.contents){const old=current.contents.find(r=>r.id===row.id);if(!old)throw Error('復原的內容來源已不存在');const {revision:ignored,...data}=row,{revision:ignoredOld,...oldData}=old;if(!same(data,oldData))puts.push({type:'putContent',data});}
 for(const row of target.cardMetadata||[]){const old=current.cardMetadata?.find(r=>r.id===row.id);if(!same(row,old))puts.push(putCatalog('card',row));}
 for(const row of target.instances){const old=current.instances.find(r=>r.id===row.id);if(same(row,old))continue;const {attributes,...data}=row;puts.push({type:'putInstance',data:clone(data)});puts.push(putCatalog('instance',attributes||{id:row.id}));}
 for(const [kind,key]of Object.entries(catalogs)){
  // Folder references and their order are shell navigation, not scene history.
  const rows=(target[key]||[]).filter(row=>kind!=='whiteboard-instance'||row.containerType==='whiteboard'),previous=(current[key]||[]).filter(row=>kind!=='whiteboard-instance'||row.containerType==='whiteboard');
  for(const row of rows){const old=previous.find(r=>r.id===row.id);if(same(row,old))continue;const op=putCatalog(kind,row);(kind==='section'?sectionPuts:kind==='connection'?connections:puts).push(op);}
  for(const row of previous)if(!rows.some(r=>r.id===row.id)){const op={type:'deleteCatalog',kind,id:row.id};(kind==='section'?sectionDeletes:deletes).push(op);}
 }
 sectionPuts.sort((a,b)=>depth(a.data,target.sections)-depth(b.data,target.sections));
 sectionDeletes.sort((a,b)=>depth(current.sections.find(r=>r.id===b.id),current.sections)-depth(current.sections.find(r=>r.id===a.id),current.sections));
 // Deleting a placement cascades its edges. Reassert surviving connections last.
 if(deletes.some(op=>op.type==='deleteInstance'||op.kind==='connection'))for(const row of target.connections||[])if(!connections.some(op=>op.data.id===row.id))connections.push(putCatalog('connection',row));
 return [...deletes,...sectionPuts,...puts,...sectionDeletes,...connections];
}
