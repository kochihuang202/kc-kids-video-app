// Immutable causal metadata survives disposal of large SQLite checkpoints.
// Shared writes only create unique records; no device rewrites a global head.
const fs=require('node:fs/promises'),path=require('node:path');
const {UUID,json,exists}=require('./sync-files.cjs');
function recordOf(m){
 if(!m||!UUID.test(m.workspaceId||'')||!UUID.test(m.snapshotId||'')||!UUID.test(m.sourceComputerId||'')||!Number.isFinite(Date.parse(m.createdAt)))throw Error('版本關係紀錄無效');
 const parents=[...new Set(m.parentSnapshotIds||[m.parentSnapshotId].filter(Boolean))];
 if(parents.some(id=>!UUID.test(id)||id===m.snapshotId)||m.parentSnapshotId&&parents[0]!==m.parentSnapshotId)throw Error('版本關係父節點無效');
 return {format:'inkbridge-lineage',version:1,workspaceId:m.workspaceId,snapshotId:m.snapshotId,parentSnapshotId:parents[0]||null,parentSnapshotIds:parents,sourceComputerId:m.sourceComputerId,sourceComputerName:m.sourceComputerName||'',createdAt:m.createdAt,revision:m.revision,database:m.database?{sha256:m.database.sha256,bytes:m.database.bytes,path:'database.sqlite3'}:undefined,summary:m.summary,restoredFromSnapshotId:m.restoredFromSnapshotId||undefined};
}
async function immutable(file,value){
 await fs.mkdir(path.dirname(file),{recursive:true});
 const old=await json(file,null);if(old){if(!sameRecord(old,value))throw Error('相同版本 ID 有不同版本關係紀錄');return;}
 const bytes=JSON.stringify(value,null,2),temporary=file+'.pending-'+require('node:crypto').randomUUID();let h;
 try{h=await fs.open(temporary,'wx');await h.writeFile(bytes);await h.sync();await h.close();h=null;try{await fs.link(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;const raced=await json(file,null);if(!sameRecord(raced,value))throw Error('版本關係紀錄同時發布衝突');}}
 finally{if(h)await h.close();await fs.rm(temporary,{force:true});}
}
function sameRecord(a,b){const critical=m=>{const value=recordOf(m);delete value.summary;return value;};return JSON.stringify(critical(a))===JSON.stringify(critical(b));}
function createLineage({localDirectory,getExchange}){
 const local=path.join(localDirectory,'Lineage');
 const shared=async()=>{const root=getExchange();return root&&await fs.realpath(root).catch(()=>null);};
 const filename=(base,w,id)=>path.join(base,w,id+'.json');
 async function remember(m){const r=recordOf(m);await immutable(filename(local,r.workspaceId,r.snapshotId),r);const root=await shared();if(root)await immutable(filename(path.join(root,'lineage'),r.workspaceId,r.snapshotId),r);return r;}
 async function records(){
  const result=new Map(),root=await shared();
  for(const base of [local,root&&path.join(root,'lineage')].filter(Boolean))for(const w of await fs.readdir(base,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){
   if(!w.isDirectory()||!UUID.test(w.name))continue;
   for(const f of await fs.readdir(path.join(base,w.name))){if(!f.endsWith('.json')||!UUID.test(f.slice(0,-5)))continue;const raw=await json(path.join(base,w.name,f),null),r=recordOf(raw);if(r.workspaceId!==w.name||r.snapshotId!==f.slice(0,-5))throw Error('版本關係路徑不一致');const old=result.get(r.snapshotId);if(old&&!sameRecord(old,r))throw Error('版本關係紀錄衝突');result.set(r.snapshotId,r);}
  }
  return result;
 }
 async function markPruned(m,anchor){
  const root=await shared();if(!root)throw Error('交換資料夾目前無法使用');
  if(!UUID.test(anchor)||!UUID.test(m.workspaceId)||!UUID.test(m.snapshotId))throw Error('清理版本 ID 無效');
  // The immutable notice distinguishes discarded history from an incoming,
  // not-yet-downloaded checkpoint. Notice order is never a causal decision.
  const file=path.join(root,'lineage-pruned',m.workspaceId,m.snapshotId+'.json');
  await fs.mkdir(path.dirname(file),{recursive:true});
  if(!await exists(file)){
   const temporary=file+'.pending-'+require('node:crypto').randomUUID();let h;
   try{h=await fs.open(temporary,'wx');await h.writeFile(JSON.stringify({format:'inkbridge-pruned-payload',version:1,workspaceId:m.workspaceId,snapshotId:m.snapshotId,anchor}));await h.sync();await h.close();h=null;await fs.link(temporary,file).catch(e=>{if(e.code!=='EEXIST')throw e;});}
   finally{if(h)await h.close();await fs.rm(temporary,{force:true});}
  }
 }
 async function pruned(w,id){const root=await shared();if(!root)return false;const n=await json(path.join(root,'lineage-pruned',w,id+'.json'),null);return n?.format==='inkbridge-pruned-payload'&&n.version===1&&n.workspaceId===w&&n.snapshotId===id&&UUID.test(n.anchor);}
 return {remember,records,markPruned,pruned};
}
function parentsOf(m){return m.parentSnapshotIds||[m.parentSnapshotId].filter(Boolean);}
function ancestorsOf(graph,id){
 const set=new Set(),visiting=new Set();let complete=true;
 function walk(node){if(!node)return;if(visiting.has(node)){complete=false;return;}if(set.has(node))return;set.add(node);const m=graph.get(node);if(!m){complete=false;return;}visiting.add(node);for(const parent of parentsOf(m))walk(parent);visiting.delete(node);}
 walk(id);return {set,complete};
}
module.exports={recordOf,createLineage,parentsOf,ancestorsOf};
