export function validateBoardReference(graph, row) {
  if (!graph.boards.some(b=>b.id===row.whiteboardId&&!b.attributes?.isTrashed)) throw Error('目標白板不存在');
  if(row.containerType!=='whiteboard')return;
  if(!graph.boards.some(b=>b.id===row.containerId&&!b.attributes?.isTrashed))throw Error('父白板不存在');
  const refs=(graph.whiteboardInstances||[]).filter(r=>r.id!==row.id&&!r.isTrashed&&r.containerType==='whiteboard').concat(row);
  const visit=(id,path=new Set())=>{if(path.has(id))throw Error('不能建立循環白板引用');const next=new Set(path).add(id);for(const r of refs.filter(r=>r.containerId===id))visit(r.whiteboardId,next);};
  visit(row.containerId);
}

export function installNestedWhiteboards({r,graph,store,getBoardId,sections,navigate,coordinator,load,shell,rehydrate=()=>{}}){
  let current=graph;
  const replace=next=>{current=next;};
  const scene=()=> (current.whiteboardInstances||[]).filter(row=>!row.isTrashed&&row.containerType==='whiteboard'&&row.containerId===getBoardId()).flatMap(row=>{
    const board=current.boards.find(b=>b.id===row.whiteboardId&&!b.attributes?.isTrashed);return board?[r(19281).YH.whiteboardInstanceToWhiteboardNode(row,{...board.attributes,...(board.attributes?.inkbridgePreviewFileId?{backgroundType:'image',backgroundImage:'flexnote://file/'+board.attributes.inkbridgePreviewFileId}:{}),id:board.id,name:board.title})]:[];
  });
  sections.extraNodes=scene;
  const original=globalThis.__inkbridgeServices;
  const names=new Set(['batchUpdateWhiteboardInstances','batchDeleteWhiteboardInstances','deleteWhiteboardInstance']);
  const refresh=async()=>{replace(await load());sections.hydrate();rehydrate();shell.hydrate(current);};
  globalThis.__inkbridgeServices={has:name=>name==='saveWhiteboardPreview'||names.has(name)||original.has(name),call:async(name,payload)=>{
    if(name==='saveWhiteboardPreview'){
      const saved=await original.call('savePureBase64Image',{items:[{base64Image:payload.base64Image,fileName:'whiteboard-preview.png'}]});
      await original.call('updateBoard',{id:payload.whiteboardId,inkbridgePreviewFileId:saved[0].fileId});await refresh();return {success:true};
    }
    if(name==='createWhiteboardInstance'||name==='updateWhiteboardInstance'){
      const graph=await load(),old=graph.whiteboardInstances?.find(r=>r.id===payload.id);
      try{validateBoardReference(graph,{...old,...payload,...payload.updates});}catch(error){await refresh();throw error;}
      const result=await original.call(name,payload);await refresh();return result;
    }
    if(names.has(name))return navigate(async()=>{
      await coordinator.flush();const graph=await load(),refs=new Map((graph.whiteboardInstances||[]).map(row=>[row.id,row]));
      const deleting=name!=='batchUpdateWhiteboardInstances',rows=Array.isArray(payload)?payload:[payload];
      for(const item of rows){const id=typeof item==='string'?item:item.id,old=refs.get(id);if(!old)throw Error('白板引用不存在');if(deleting)refs.delete(id);else{const row={...old,...item.updates,id};validateBoardReference({...graph,whiteboardInstances:[...refs.values()]},row);refs.set(id,row);}}
      for(const item of rows){const id=typeof item==='string'?item:item.id;coordinator.stage(deleting?{type:'deleteCatalog',kind:'whiteboard-instance',id}:{type:'putCatalog',kind:'whiteboard-instance',data:refs.get(id)});}
      await coordinator.flush();await refresh();return {success:true};
    });
    const result=await original.call(name,payload);
    if(['createWhiteboard','updateBoard','deleteWhiteboard','restoreWhiteboard'].includes(name))await refresh();
    return result;
  }};
  let captureTask;
  function capture(){if(!current.whiteboardInstances?.some(row=>!row.isTrashed&&row.whiteboardId===getBoardId()))return Promise.resolve();if(captureTask)return captureTask;captureTask=(async()=>{await coordinator.flush();store.getState().setEditingNode(null);await coordinator.flush();await new Promise((resolve,reject)=>window.dispatchEvent(new CustomEvent(r(50852).j,{detail:{whiteboardId:getBoardId(),resolve,reject}})));})().finally(()=>{captureTask=null;});return captureTask;}
  return {replace,scene,refresh,capture};
}
