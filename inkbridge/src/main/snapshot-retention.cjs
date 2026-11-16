// User-approved FlexNote-style sparse union (2026-11-16): latest ten,
// hourly within 24h, daily within 30d, weekly within 90d, monthly older.
//
// Safety rules:
// - Only verified ancestors of the local head are ever deleted. Newer versions, branches,
//   other workspaces and anything whose ancestry cannot be proven are kept.
// - If any snapshot of this workspace is incomplete (still syncing), nothing is deleted.
// - Every causal record is persisted outside the disposable DB directories.
//   Legacy retention.json is read only as migration evidence, never overwritten.
// - Unpublished local outbox entries are never removed; published local copies of snapshots
//   that are no longer kept are removed.
// - Shared assets are left alone.
const fs = require('node:fs/promises'), path = require('node:path');
const { json, writeJSON, UUID } = require('./sync-files.cjs');
const KEEP_RECENT = 10, MIN_INTERVAL = 6 * 60 * 60 * 1000;
const {ancestorsOf}=require('./snapshot-lineage.cjs');
const taiwanDate=iso=>new Date(Date.parse(iso)+8*60*60*1000);
const dayOf = iso => { const d=taiwanDate(iso);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):'unknown'; };
const retentionFile = (root, workspaceId) => path.join(root, 'snapshots', workspaceId, 'retention.json');
async function readRetention(root, workspaceId) {
  const value = await json(retentionFile(root, workspaceId), null).catch(() => null);
  if (!value || value.format !== 'inkbridge-retention' || value.version !== 1 || !UUID.test(value.anchor || '') || !Array.isArray(value.ancestors)) return null;
  return { anchor: value.anchor, ancestors: new Set(value.ancestors.filter(id => UUID.test(id))) };
}
// A snapshot listed as a verified ancestor of `anchor` is history whenever the anchor is the
// head, an ancestor of it, or a descendant of it (then the listed one is not a newer tip either).
function retainedAncestor(retention, snapshotId, head, ancestorsOf, graph) {
  if (!retention || !head || !retention.ancestors.has(snapshotId) || !graph.has(retention.anchor)) return false;
  return retention.anchor === head || ancestorsOf(head).set.has(retention.anchor) || ancestorsOf(retention.anchor).set.has(head);
}
// A walk that ends at the retention gap still reached verified history, so it is decidable.
function decidable(walk, retention) { return walk.complete || !!retention && [...walk.set].some(id => id === retention.anchor || retention.ancestors.has(id)); }
// The certificate proves these snapshots all precede its anchor, but does not
// order them against each other. Do not mislabel them as ancestors of the local
// head: they are superseded by a proven successor instead. Unlisted branches
// and missing/deleted local bases remain undecidable.
function applyRetentionSuccessor(rows, retention, head, ancestorsOf, graph) {
  if (!retention || !head || !retention.ancestors.has(head) || !graph.has(retention.anchor)) return;
  for (const row of rows) {
    if (!row.manifest || row.snapshotId === head) continue;
    if (row.snapshotId === retention.anchor || ancestorsOf(row.snapshotId).set.has(retention.anchor)) row.relation = 'newer';
    else if (retention.ancestors.has(row.snapshotId)) row.relation = 'superseded';
  }
}
// Pure plan over verified history: `chain` is the head's chain (newest first), `prior` the
// older snapshots an earlier run already verified (no longer linked to the chain).
function planRetention({ chain, prior = [], keepRecent = KEEP_RECENT, now = Date.now() }) {
  const unique=new Map([...chain,...prior].map(r=>[r.snapshotId,r])),rows=[...unique.values()].sort((a,b)=>Date.parse(b.manifest.createdAt)-Date.parse(a.manifest.createdAt)||a.snapshotId.localeCompare(b.snapshotId));
  const keep=new Set(rows.slice(0,keepRecent).map(r=>r.snapshotId)),buckets=new Map(),HOUR=3600000,DAY=24*HOUR;
  for(const row of rows){
    const timestamp=Date.parse(row.manifest.createdAt);if(!Number.isFinite(timestamp)){keep.add(row.snapshotId);continue;}
    const age=now-timestamp,date=taiwanDate(row.manifest.createdAt),day=date.toISOString().slice(0,10),keys=[];
    if(age<0){keep.add(row.snapshotId);continue;}
    if(age<=DAY)keys.push('hour:'+date.toISOString().slice(0,13));
    if(age<=30*DAY)keys.push('day:'+day);
    if(age<=90*DAY){const week=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));week.setUTCDate(week.getUTCDate()-(week.getUTCDay()+6)%7);keys.push('week:'+week.toISOString().slice(0,10));}
    if(age>90*DAY)keys.push('month:'+day.slice(0,7));
    for(const key of keys)if(!buckets.has(key))buckets.set(key,row.snapshotId);
  }
  for(const id of buckets.values())keep.add(id);
  return {keep,remove:rows.filter(r=>!keep.has(r.snapshotId)).map(r=>r.snapshotId),ancestors:[...keep].filter(id=>id!==chain[0]?.snapshotId)};
}
function createSnapshotRetention({ localDirectory, getExchange, index, head, remember, markPruned, now = () => Date.now(), keepRecent = KEEP_RECENT }) {
  const stateFile = path.join(localDirectory, 'Profile', 'snapshot-retention.json'), outbox = path.join(localDirectory, 'Outbox');
  async function prune({ workspaceId, force = false } = {}) {
    const exchange = getExchange(); if (!exchange || !UUID.test(workspaceId || '')) return { skipped: 'unconfigured' };
    const state = await json(stateFile, {});
    if (!force && Number.isFinite(state.lastRunAt) && now() - state.lastRunAt < MIN_INTERVAL) return { skipped: 'recent' };
    const root = await fs.realpath(exchange), rows = (await index()).filter(row => row.workspaceId === workspaceId);
    if (rows.some(row => row.integrity === 'incomplete'&&!row.metadataOnly)) return { skipped: 'incomplete' };
    const current = await head(workspaceId); if (!current?.snapshotId) return { skipped: 'no-head' };
    const graph=new Map(rows.filter(r=>r.manifest).map(r=>[r.snapshotId,r.manifest])),known=ancestorsOf(graph,current.snapshotId),byId=new Map(rows.map(r=>[r.snapshotId,r]));
    if(!byId.get(current.snapshotId)||byId.get(current.snapshotId).metadataOnly)return {skipped:'no-head'};
    // A legacy certificate can identify additional old payloads, but never
    // authorises deletion of unknown or independent branches.
    const previous=await readRetention(root,workspaceId);
    if(previous&&(previous.anchor===current.snapshotId||known.set.has(previous.anchor)))for(const id of previous.ancestors)known.set.add(id);
    const chain=rows.filter(r=>r.integrity==='complete'&&!r.metadataOnly&&known.set.has(r.snapshotId)).sort((a,b)=>Date.parse(b.manifest.createdAt)-Date.parse(a.manifest.createdAt));
    const plan=planRetention({chain,keepRecent,now:now()}),remove=plan.remove.filter(id=>id!==current.snapshotId);
    if(!remember||!markPruned)return {skipped:'lineage-unavailable'};
    // Persist every available parent edge before any deletion. Independent
    // immutable records cannot be lost to another computer's retention write.
    for(const row of rows)if(row.manifest)await remember(row.manifest);
    if (!remove.length) { await writeJSON(stateFile, { lastRunAt: now(), removed: 0, localRemoved: 0, kept: chain.length }); return { removed: 0, localRemoved: 0, kept: chain.length }; }
    for(const id of remove)await markPruned(byId.get(id).manifest,current.snapshotId);
    const base = path.join(root, 'snapshots', workspaceId);
    for (const id of remove) { if (!UUID.test(id) || id === current.snapshotId) continue; await fs.rm(path.join(base, id), { recursive: true, force: true }); }
    // Local outbox: published copies that are no longer kept.
    let localRemoved = 0;
    const removed=new Set(remove);
    for (const id of await fs.readdir(outbox).catch(() => [])) {
      if (!UUID.test(id) || !removed.has(id)) continue;
      const dir = path.join(outbox, id), receipt = await json(path.join(dir, 'published.json'), null).catch(() => null);
      if (!receipt || receipt.root !== root) continue;
      const manifest = await json(path.join(dir, 'manifest.json'), null).catch(() => null);
      if (!manifest || manifest.workspaceId !== workspaceId) continue;
      await fs.rm(dir, { recursive: true, force: true }); localRemoved++;
    }
    await writeJSON(stateFile, { lastRunAt: now(), removed: remove.length, localRemoved, kept: plan.keep.size });
    return { removed: remove.length, localRemoved, kept: plan.keep.size };
  }
  return { prune };
}
module.exports = { createSnapshotRetention, planRetention, readRetention, retainedAncestor, decidable, applyRetentionSuccessor, dayOf, KEEP_RECENT };
