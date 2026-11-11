// Share membership is based on graph identity, never titles or tree row indexes.
function getShareTree(graph,rootBoardId){
 const boards=new Map((graph.boards||[]).filter(b=>!b.attributes?.isTrashed).map(b=>[b.id,b]));
 if(!boards.has(rootBoardId))throw Error('分享白板不存在');
 const allLinks=(graph.whiteboardInstances||[]).filter(r=>!r.isTrashed&&r.containerType==='whiteboard'),ids=new Set(),links=[];
 function visit(id){if(ids.has(id))return;if(!boards.has(id))throw Error('子白板不存在：'+id);ids.add(id);for(const row of allLinks.filter(r=>r.containerId===id)){links.push({containerId:id,whiteboardId:row.whiteboardId});visit(row.whiteboardId);}}
 visit(rootBoardId);
 return {rootBoardId,boards:[...ids].map(id=>({id,name:boards.get(id).title||'白板'})),links};
}
function updateSelection(tree,selectedIds,boardId,checked){
 const known=new Set(tree.boards.map(b=>b.id));if(!known.has(boardId))throw Error('白板不在分享範圍');
 const selected=new Set(selectedIds),root=tree.rootBoardId;
 if(checked){
  // Breadth-first discovery gives each reachable board a finite parent path,
  // including DAGs and cycles. Do not expose unrelated alternate parents.
  const parent=new Map([[root,null]]),queue=[root];
  for(let i=0;i<queue.length;i++)for(const l of tree.links.filter(l=>l.containerId===queue[i]))if(!parent.has(l.whiteboardId)){parent.set(l.whiteboardId,l.containerId);queue.push(l.whiteboardId);}
  for(let id=boardId;id!==null&&id!==undefined;id=parent.get(id))selected.add(id);
 }else{
  const removed=new Set();function remove(id){if(id===root||removed.has(id))return;removed.add(id);selected.delete(id);for(const l of tree.links.filter(l=>l.containerId===id))remove(l.whiteboardId);}remove(boardId);
 }
 selected.add(root);return tree.boards.map(b=>b.id).filter(id=>selected.has(id));
}
function normalizeSelection(graph,rootBoardId,selectedBoardIds){
 const tree=getShareTree(graph,rootBoardId);
 if(selectedBoardIds===undefined)return tree.boards.map(b=>b.id);
 if(!Array.isArray(selectedBoardIds)||selectedBoardIds.some(id=>typeof id!=='string'))throw Error('分享白板選擇格式不合法');
 let selected=[rootBoardId];for(const id of new Set(selectedBoardIds))selected=updateSelection(tree,selected,id,true);
 return selected;
}
module.exports={getShareTree,normalizeSelection,updateSelection};
