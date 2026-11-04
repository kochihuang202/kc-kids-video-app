// InkBridge SQLite boundary for native 19281/48626/81958 mindmaps. Layout,
// keyboard handling, editor and canvas remain native; no substitute tree engine.
import {validateMarkers,MAP_STYLES} from './mindmap-appearance.mjs';
import {selectionAfterMindmapDelete} from './mindmap-keyboard.mjs';
const copy=value=>JSON.parse(JSON.stringify(value));
const list=value=>Array.isArray(value)?value:[value];
const reads=new Set(['getMindMapById','getMindmapById','getAllMindMaps','getMindMapsByIds','getMindMapNodesByMindMapId','getMindMapInstancesByWhiteboardId']);
const writes=new Set(['addMindMap','updateMindMap','deleteMindMap','restoreMindMap','addMindMapNode','updateMindMapNode','batchUpdateMindMapNodes','batchDeleteMindMapNodes','createMindMapInstance','updateMindMapInstance','batchUpdateMindMapInstances','deleteMindMapInstance','batchDeleteMindMapInstances']);
export function createOriginalMindmaps({r,graph,navigate,coordinator,catalogOperation,store,getBoardId,measureNode,getBaseNodes=()=>[]}){
 const mindmaps=new Map(),nodes=new Map(),instances=new Map(),pending=new Set();
 const put=(kind,row)=>coordinator.stage(catalogOperation(kind,copy(row)));
 const remove=(kind,id)=>coordinator.stage({type:'deleteCatalog',kind,id});
 function replace(next){for(const [map,key]of [[mindmaps,'mindmaps'],[nodes,'mindmapNodes'],[instances,'mindmapInstances']]){map.clear();for(const row of next[key]||[])map.set(row.id,copy(row));}}
 replace(graph);
 function record(id){const map=mindmaps.get(id);if(!map)return null;const children=[...nodes.values()].filter(node=>node.mindMapId===id).map(node=>({...node,inkbridgeMapStyle:map.inkbridgeStyle||'branch'}));return {...map,nodes:children,graph:r(19281).YH.convertMindMapNodesToGraph(map,children)};}
 const records=()=>[...mindmaps.keys()].map(record);
 function scene(){const result={nodes:[],connections:[]};for(const placement of instances.values()){
   if(placement.whiteboardId!==getBoardId())continue;const map=record(placement.objectId);if(!map||map.isTrashed||!map.nodes.some(node=>node.isRoot))continue;
   const root=r(19281).YH.mindMapInstanceToMindMapNode(placement,map),layout=r(81958).Oy(root,map,measureNode);
   result.nodes.push(...layout.nodes);result.connections.push(...layout.connections);
  }
  result.nodes=r(81958).X([...getBaseNodes(),...result.nodes]).filter(node=>node.type==='MindmapNode');return result;
 }
 function hydrate(){publishRecords();const next=scene(),current=store.getState();current.setNodes([...current.nodes.filter(node=>node.type!=='MindmapNode'&&node.type!=='Mindmap'),...next.nodes]);current.setConnections([...current.connections.filter(edge=>!String(edge.id).startsWith('mindmap-conn-')),...next.connections]);r(66597).L.clearCache();r(66597).L.requestRender();}
 function publishRecords(){const redux=r(63268).Z;for(const map of records())redux.dispatch(r(23407).GE(map));}
 function validateNode(row){if(!row||typeof row.id!=='string'||!mindmaps.has(row.mindMapId))throw Error('思維導圖節點或來源不存在');if(!Array.isArray(row.childNodeIds||[]))throw Error('思維導圖子節點格式錯誤');if((row.childNodeIds||[]).includes(row.id))throw Error('思維導圖不能循環引用自己');}
 function proposedNode(row,existing){if(row.inkbridgeMarkers!==undefined)validateMarkers(row.inkbridgeMarkers);if(row.inkbridgeNodeStyle!=null&&!MAP_STYLES.includes(row.inkbridgeNodeStyle))throw Error('無效的節點樣式');const next=copy({...existing,...row});if(typeof next.content==='string')next.content=JSON.parse(next.content);next.childNodeIds=next.childNodeIds||next.childrenIds||[];validateNode(next);return next;}
 function checkCycles(proposed){const visiting=new Set(),visited=new Set();function visit(id){if(visiting.has(id))throw Error('思維導圖階層形成循環');if(visited.has(id))return;const node=proposed.get(id);if(!node)return;visiting.add(id);for(const child of node.childNodeIds||[]){const row=proposed.get(child);if(row&&row.mindMapId!==node.mindMapId)throw Error('思維導圖不能引用其他導圖的節點');visit(child);}visiting.delete(id);visited.add(id);}for(const id of proposed.keys())visit(id);}
 const has=name=>reads.has(name)||writes.has(name);
 async function perform(name,payload){
  if(reads.has(name)){const id=typeof payload==='string'?payload:payload?.id||payload?.mindMapId||payload?.mindmapId;if(name==='getAllMindMaps')return {success:true,mindMaps:records().filter(row=>!row.isTrashed),mindmaps:records().filter(row=>!row.isTrashed)};if(name==='getMindMapsByIds'){const ids=Array.isArray(payload)?payload:payload.ids;return {success:true,mindMaps:records().filter(row=>ids.includes(row.id))};}if(name==='getMindMapNodesByMindMapId')return {success:true,nodes:[...nodes.values()].filter(row=>row.mindMapId===id)};if(name==='getMindMapInstancesByWhiteboardId')return {success:true,instances:[...instances.values()].filter(row=>row.whiteboardId===(typeof payload==='string'?payload:payload.whiteboardId))};const mindMap=record(id);return {success:!!mindMap,mindMap};}
  await coordinator.flush();
  const before={mindmaps:new Map(mindmaps),nodes:new Map(nodes),instances:new Map(instances)},boardAtStart=getBoardId();let refresh=false,continuation;
  try{
   if(name==='addMindMap'){
    const map=copy(payload);if(!map?.id)throw Error('思維導圖識別碼不存在');const children=map.nodes||map.graph?.children||[];delete map.nodes;delete map.graph;mindmaps.set(map.id,{...mindmaps.get(map.id),...map});
    const proposed=new Map(nodes);for(const row of children){const node=proposedNode({...row,mindMapId:map.id},nodes.get(row.id));proposed.set(node.id,node);}checkCycles(proposed);
    put('mindmap',mindmaps.get(map.id));for(const row of children){const node=proposed.get(row.id);nodes.set(node.id,node);put('mindmap-node',node);}
   }else if(name==='updateMindMap'||name==='restoreMindMap'||name==='deleteMindMap'){
    const id=typeof payload==='string'?payload:payload.id,old=mindmaps.get(id);if(!old)throw Error('思維導圖不存在');const updates=name==='updateMindMap'?payload.updates||{}:{isTrashed:name==='deleteMindMap'};if(updates.inkbridgeStyle!==undefined&&!MAP_STYLES.includes(updates.inkbridgeStyle))throw Error('無效的導圖樣式');const next=copy({...old,...updates,id});mindmaps.set(id,next);put('mindmap',next);refresh=true;
   }else if(name==='addMindMapNode'||name==='updateMindMapNode'||name==='batchUpdateMindMapNodes'){
    const rows=name==='batchUpdateMindMapNodes'?payload.nodes:[payload.node],proposed=new Map(nodes);if(!Array.isArray(rows))throw Error('思維導圖節點更新格式錯誤');
    for(const row of rows){const old=proposed.get(row.id);if(name!=='addMindMapNode'&&!old)throw Error('思維導圖節點不存在');const next=proposedNode(row,old);proposed.set(next.id,next);}
    if(name==='addMindMapNode'&&payload.parentId){const parent=proposed.get(payload.parentId);if(!parent)throw Error('思維導圖父節點不存在');proposed.set(parent.id,proposedNode({...parent,childNodeIds:payload.parentChildNodeIds||[...parent.childNodeIds,payload.node.id]},parent));}
    refresh=rows.some(row=>row.inkbridgeMarkers!==undefined||row.inkbridgeNodeStyle!==undefined);checkCycles(proposed);for(const [id,node]of proposed)if(JSON.stringify(node)!==JSON.stringify(nodes.get(id))){nodes.set(id,node);put('mindmap-node',node);}
   }else if(name==='createMindMapInstance'){
    const rows=list(payload);if(rows.some(placement=>!placement?.id||!mindmaps.has(placement.objectId)))throw Error('思維導圖位置或來源不存在');for(const placement of rows){instances.set(placement.id,copy(placement));put('mindmap-instance',placement);}refresh=true;
   }else if(name==='updateMindMapInstance'||name==='batchUpdateMindMapInstances'){
    const rows=name==='updateMindMapInstance'?[payload]:payload;if(!Array.isArray(rows))throw Error('思維導圖位置更新格式錯誤');
    if(rows.some(row=>!row||!instances.has(row.id)))throw Error('思維導圖位置不存在');for(const row of rows){const old=instances.get(row.id),next=copy({...old,...row.updates,id:row.id});instances.set(row.id,next);put('mindmap-instance',next);}refresh=true;
   }else if(name==='deleteMindMapInstance'||name==='batchDeleteMindMapInstances'){
    const ids=name==='deleteMindMapInstance'?[typeof payload==='string'?payload:payload.id]:payload;for(const id of ids){instances.delete(id);remove('mindmap-instance',id);}refresh=true;
   }else if(name==='batchDeleteMindMapNodes'){
    const ids=new Set(payload),visit=id=>{for(const child of nodes.get(id)?.childNodeIds||[])if(!ids.has(child)){ids.add(child);visit(child);}};for(const id of [...ids])visit(id);
    continuation=selectionAfterMindmapDelete([...nodes.values()],ids);
    for(const id of ids){const node=nodes.get(id);if(node?.isRoot)for(const [placementId,row]of instances)if(row.objectId===node.mindMapId){instances.delete(placementId);remove('mindmap-instance',placementId);}nodes.delete(id);remove('mindmap-node',id);}
    for(const [id,node]of nodes){if(!(node.childNodeIds||[]).some(child=>ids.has(child)))continue;const next={...node,childNodeIds:node.childNodeIds.filter(child=>!ids.has(child))};nodes.set(id,next);put('mindmap-node',next);}refresh=true;
   }else throw Error('Unsupported mindmap service: '+name);
   await coordinator.flush();if(refresh){publishRecords();hydrate();}
   if(continuation&&getBoardId()===boardAtStart){
    const state=store.getState();
    // Do not steal a newer user selection while waiting for the SQLite ACK.
    if(!state.selectedNodeIds.size||[...state.selectedNodeIds].every(id=>!state.nodes.some(node=>node.id===id))){
     const ids=continuation.map(id=>state.nodes.find(node=>node.type==='MindmapNode'&&(node.id===id||node.data.id===id))?.id).filter(Boolean);
     state.setSelectedNodeIds(new Set(ids));
    }
   }
   return {success:true,mindMap:typeof payload==='string'?record(payload):record(payload?.id||payload?.node?.mindMapId||payload?.objectId),relatedMindmaps:name==='createMindMapInstance'?list(payload).map(row=>record(row.objectId)).filter(Boolean):[]};
  }catch(error){mindmaps.clear();nodes.clear();instances.clear();for(const [target,source]of [[mindmaps,before.mindmaps],[nodes,before.nodes],[instances,before.instances]])for(const [id,row]of source)target.set(id,row);throw error;}
 }
 function call(name,payload){if(reads.has(name))return Promise.resolve(perform(name,payload));const task=navigate(()=>perform(name,payload));pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;}
 // Stage synchronously: this can run inside coordinator.beforeFlush while it
 // reads live Lexical editors. Calling coordinator.flush from here deadlocks.
 function acceptContent(nodeId,document){const node=nodes.get(nodeId);if(!node)return false;const content=copy(document);if(JSON.stringify(node.content)===JSON.stringify(content))return true;const next={...node,content,lastEditedTime:new Date().toISOString()};nodes.set(nodeId,next);put('mindmap-node',next);store.getState().setNodes(rows=>rows.map(row=>row.id===nodeId?{...row,data:{...row.data,content,lastEditedTime:next.lastEditedTime}}:row));r(66597).L.clearCache();r(66597).L.requestRender();const redux=r(63268).Z,current=redux.getState().flow.mindmaps.find(map=>map.id===node.mindMapId);if(current?.graph)redux.dispatch(r(23407).Fk({id:node.mindMapId,graph:{...current.graph,children:current.graph.children.map(row=>row.id===nodeId?{...row,content,lastEditedTime:next.lastEditedTime}:row)}}));if(node.isRoot){const map={...mindmaps.get(node.mindMapId),title:r(94700).LG(content)};mindmaps.set(map.id,map);put('mindmap',map);redux.dispatch(r(23407).mb({id:map.id,title:map.title}));}relayout(node.mindMapId);return true;}
 function relayout(id){const state=store.getState(),map=record(id);if(!map)return;const result=r(81958).jm(state.nodes,id,map.layoutMode||'logic-right','light');state.setNodes(result.nodes);const ids=new Set(result.nodes.filter(node=>node.data?.mindMapId===id).map(node=>node.id));state.setConnections([...state.connections.filter(edge=>!String(edge.id).startsWith('mindmap-conn-')||!ids.has(edge.source.nodeId)),...result.connections]);r(66597).L.clearCache();r(66597).L.requestRender();}
 async function settle(){while(pending.size)await Promise.all([...pending]);}
 function deleteNodes(ids){return call('batchDeleteMindMapNodes',ids);}
 return {has,call,scene,hydrate,records,record,replace,settle,acceptContent,deleteNodes,mindmaps,nodes,instances};
}
