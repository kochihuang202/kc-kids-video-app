const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createLineage,ancestorsOf}=require('../src/main/snapshot-lineage.cjs');
const {planRetention,dayOf}=require('../src/main/snapshot-retention.cjs');
const uuid=()=>crypto.randomUUID(),m=(workspaceId,snapshotId,parentSnapshotId=null)=>({workspaceId,snapshotId,parentSnapshotId,sourceComputerId:uuid(),createdAt:'2026-11-01T00:00:00.000Z',revision:1});

test('legacy copies missing merge metadata reconcile without hiding real identity conflicts',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-lineage-upgrade-')),exchange=path.join(root,'exchange');await fs.mkdir(exchange);
 const one=createLineage({localDirectory:path.join(root,'A'),getExchange:()=>exchange}),two=createLineage({localDirectory:path.join(root,'B'),getExchange:()=>exchange});
 const old={...m(uuid(),uuid()),database:{path:'database.sqlite3',bytes:1024,sha256:'a'.repeat(64)}},rich={...old,mergeDigest:'b'.repeat(64)};
 await one.remember(old);
 const shared=path.join(exchange,'lineage',old.workspaceId,old.snapshotId+'.json');await fs.writeFile(shared,JSON.stringify(rich));
 assert.equal((await one.records()).get(old.snapshotId).mergeDigest,rich.mergeDigest);
 await one.remember(rich);await two.remember(old);
 assert.equal((await two.records()).get(old.snapshotId).mergeDigest,rich.mergeDigest);
 for(const patch of [{mergeDigest:'c'.repeat(64)},{database:{...old.database,sha256:'d'.repeat(64)}},{parentSnapshotId:uuid()}])await assert.rejects(one.remember({...rich,...patch}),/不同|衝突/);
 const authority={...rich,authorityId:old.snapshotId,isAuthoritative:true};await fs.writeFile(shared,JSON.stringify(authority));
 assert.equal((await one.records()).get(old.snapshotId).isAuthoritative,true);
 await assert.rejects(one.remember({...authority,authorityId:uuid(),isAuthoritative:false}),/不同|衝突/);
 await fs.rm(root,{recursive:true,force:true});
});
test('immutable lineage survives missing payloads and simultaneous same-record publication; conflicting causal records are rejected',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-lineage-')),exchange=path.join(root,'exchange');await fs.mkdir(exchange);const one=createLineage({localDirectory:path.join(root,'A'),getExchange:()=>exchange}),two=createLineage({localDirectory:path.join(root,'B'),getExchange:()=>exchange});
 const w=uuid(),first=m(w,uuid()),chain=[first];for(let i=1;i<100;i++)chain.push(m(w,uuid(),chain.at(-1).snapshotId));
 for(const record of chain)await one.remember(record);
 await Promise.all([one.remember(first),two.remember(first)]);
 const graph=await two.records(),walk=ancestorsOf(graph,chain.at(-1).snapshotId);assert.equal(walk.set.size,100);assert(walk.complete);assert(walk.set.has(first.snapshotId));
 await assert.rejects(two.remember({...first,parentSnapshotId:uuid()}),/不同|衝突/);
 assert.equal((await one.records()).get(first.snapshotId).parentSnapshotId,null);
 await one.markPruned(first,chain.at(-1).snapshotId);assert(await two.pruned(w,first.snapshotId));
 assert.equal(await two.pruned(w,chain.at(-1).snapshotId),false);
});
test('Taiwan sparse retention is a union, keeps latest ten and monthly older history, with deterministic boundaries',()=>{
 assert.equal(dayOf('2026-11-01T16:00:00Z'),'2026-11-02');const now=Date.parse('2026-11-16T00:00:00Z');
 const row=(id,date)=>({snapshotId:id,manifest:{createdAt:date}}),chain=[...Array.from({length:12},(_,i)=>row('recent'+i,new Date(now-i*60000).toISOString())),row('old1','2026-03-01T00:00:00Z'),row('old2','2026-03-30T00:00:00Z'),row('old3','2026-04-01T00:00:00Z')];
 const plan=planRetention({chain,now});for(let i=0;i<10;i++)assert(plan.keep.has('recent'+i));assert(plan.keep.has('old2'));assert(plan.keep.has('old3'));assert(plan.remove.includes('old1'));assert(plan.remove.includes('recent11'));
});
