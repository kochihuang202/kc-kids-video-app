// Storage adapter for native48626/19281/99665 text and shape workflows.
const clone=value=>JSON.parse(JSON.stringify(value));
export function createOriginalTextElements({r,graph,navigate,coordinator,store,sections,getBoardId}){
 const rows=new Map(),pending=new Set();
 const replace=graph=>{rows.clear();for(const row of graph.textElements||[])rows.set(row.id,row);};replace(graph);
 const put=row=>coordinator.stage({type:'putCatalog',kind:'text-element',data:clone(row)});
 const extra=sections.extraNodes;
 const scene=()=>[...rows.values()].filter(row=>row.whiteboardId===getBoardId()).map(row=>{const node=r(19281).YH.textElementToTextNode(row);if(!node.parentId)return node;const parent=sections.sections.get(node.parentId);if(!parent)return {...node,parentId:''};let x=0,y=0,id=node.parentId;const seen=new Set();while(id){if(seen.has(id))throw Error('Cyclic text group');seen.add(id);const group=sections.sections.get(id);if(!group)break;x+=group.x;y+=group.y;id=group.parentId;}return {...node,position:{x:node.position.x+x,y:node.position.y+y}};});
 sections.extraNodes=()=>[...(extra?.()||[]),...scene()];
 function acceptContent(id,document){const old=rows.get(id);if(!old)return false;const content=clone(document);if(JSON.stringify(old.content)===JSON.stringify(content))return true;const next={...old,content};rows.set(id,next);put(next);store.getState().setNodes(nodes=>nodes.map(node=>node.id===id?{...node,data:{...node.data,content}}:node));r(66597).L.clearCache();r(66597).L.requestRender();return true;}
 const names=new Set(['createTextElement','updateTextElement','batchUpdateTextElements','batchDeleteTextElements','getTextElementsByWhiteboardId']);
 function call(name,payload){if(name==='getTextElementsByWhiteboardId')return Promise.resolve({textElements:[...rows.values()].filter(row=>row.whiteboardId===(typeof payload==='string'?payload:payload.whiteboardId))});
 const task=navigate(async()=>{await coordinator.flush();const next=new Map(rows),items=name==='batchDeleteTextElements'||name==='batchUpdateTextElements'?payload:[payload];if(!Array.isArray(items))throw Error('Invalid text element batch');
 for(const item of items){const id=typeof item==='string'?item:item.id,old=next.get(id);if(!id)throw Error('文字元素ID不存在');if(name==='batchDeleteTextElements'){next.delete(id);continue;}if(name==='createTextElement'&&old)throw Error('文字元素已存在');if(name!=='createTextElement'&&!old)throw Error('文字元素不存在');const row=clone(name==='createTextElement'?item:{...old,...item.updates,id});if(typeof row.content==='string')row.content=JSON.parse(row.content);next.set(id,row);}
 for(const item of items){const id=typeof item==='string'?item:item.id;coordinator.stage(next.has(id)?{type:'putCatalog',kind:'text-element',data:next.get(id)}:{type:'deleteCatalog',kind:'text-element',id});}
 await coordinator.flush();rows.clear();for(const [id,row]of next)rows.set(id,row);if(name==='batchDeleteTextElements')store.getState().setNodes(nodes=>nodes.filter(node=>!items.includes(node.id)));return {success:true};});pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;}
 const original=globalThis.__inkbridgeServices;globalThis.__inkbridgeServices={has:name=>names.has(name)||original.has(name),call:(name,payload)=>names.has(name)?call(name,payload):original.call(name,payload)};
 return {rows,scene,replace,acceptContent,settle:async()=>{while(pending.size)await Promise.all([...pending]);}};
}
