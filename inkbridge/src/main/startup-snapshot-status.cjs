// A recommendation, never a restore command. Decisions use the version DAG.
function startupSnapshotStatus({rows,workspaceId,localRevision,head}){
  const complete=rows.filter(row=>row.integrity==='complete'&&!row.metadataOnly);
  const own=complete.filter(row=>row.workspaceId===workspaceId);
  const newer=own.filter(row=>row.relation==='newer');
  const graph=new Map(rows.filter(row=>row.workspaceId===workspaceId&&row.manifest).map(row=>[row.snapshotId,row.manifest]));
  const parents=new Set();
  for(const row of newer){const todo=[...(row.manifest.parentSnapshotIds||[row.manifest.parentSnapshotId])],seen=new Set();while(todo.length){const id=todo.pop();if(!id||seen.has(id))continue;seen.add(id);parents.add(id);const m=graph.get(id);if(m)todo.push(...(m.parentSnapshotIds||[m.parentSnapshotId]));}}
  const tips=newer.filter(row=>!parents.has(row.snapshotId));
  // An incoming verified merge contains both parents. Its already-integrated
  // other parent is history of that successor, not an unresolved side branch.
  const branches=own.filter(row=>row.relation==='branch'&&!parents.has(row.snapshotId));
  const unknown=own.filter(row=>['unknown','unbased'].includes(row.relation)&&!parents.has(row.snapshotId));
  const other=complete.filter(row=>row.workspaceId!==workspaceId);
  const incomplete=rows.filter(row=>row.workspaceId===workspaceId&&row.integrity!=='complete'&&row.integrity!=='history'&&row.relation!=='authority-backup'&&!row.metadataOnly);
  const kind=branches.length||tips.length>1?'branches':unknown.length?'unknown':tips.length===1?'newer':other.length?'other-workspace':incomplete.length?'incomplete':'current';
  return {kind,workspaceId,localRevision,baseSnapshotId:head?.snapshotId||null,baseRevision:head?.revision??null,hasLocalChanges:!!head&&localRevision!==head.revision,
    candidate:kind==='newer'?{workspaceId:tips[0].workspaceId,snapshotId:tips[0].snapshotId,sourceComputerId:tips[0].manifest.sourceComputerId,createdAt:tips[0].manifest.createdAt}:null,
    counts:{newer:tips.length,branches:branches.length,unknown:unknown.length,otherWorkspaces:new Set(other.map(row=>row.workspaceId)).size,incomplete:incomplete.length}};
}
module.exports={startupSnapshotStatus};
