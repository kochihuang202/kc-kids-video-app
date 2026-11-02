// A recommendation, never a restore command. Decisions use the version DAG.
function startupSnapshotStatus({rows,workspaceId,localRevision,head}){
  const complete=rows.filter(row=>row.integrity==='complete');
  const own=complete.filter(row=>row.workspaceId===workspaceId);
  const newer=own.filter(row=>row.relation==='newer');
  const parents=new Set(newer.map(row=>row.manifest.parentSnapshotId).filter(Boolean));
  const tips=newer.filter(row=>!parents.has(row.snapshotId));
  const branches=own.filter(row=>row.relation==='branch');
  const unknown=own.filter(row=>['unknown','unbased'].includes(row.relation));
  const other=complete.filter(row=>row.workspaceId!==workspaceId);
  const incomplete=rows.filter(row=>row.integrity!=='complete');
  const kind=branches.length||tips.length>1?'branches':unknown.length?'unknown':tips.length===1?'newer':other.length?'other-workspace':incomplete.length?'incomplete':'current';
  return {kind,workspaceId,localRevision,baseSnapshotId:head?.snapshotId||null,baseRevision:head?.revision??null,hasLocalChanges:!!head&&localRevision!==head.revision,
    candidate:kind==='newer'?{workspaceId:tips[0].workspaceId,snapshotId:tips[0].snapshotId,sourceComputerId:tips[0].manifest.sourceComputerId,createdAt:tips[0].manifest.createdAt}:null,
    counts:{newer:tips.length,branches:branches.length,unknown:unknown.length,otherWorkspaces:new Set(other.map(row=>row.workspaceId)).size,incomplete:incomplete.length}};
}
module.exports={startupSnapshotStatus};
