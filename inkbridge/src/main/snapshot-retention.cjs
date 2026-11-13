// Snapshot retention (user decision 2026-11-14): keep the newest 30 snapshots of the current
// workspace's history plus the newest one of each earlier day; delete the rest.
//
// Safety rules:
// - Only verified ancestors of the local head are ever deleted. Newer versions, branches,
//   other workspaces and anything whose ancestry cannot be proven are kept.
// - If any snapshot of this workspace is incomplete (still syncing), nothing is deleted.
// - Deleting history breaks the parent chain that tells "older here" from "another computer",
//   so the kept older snapshots are recorded in snapshots/<workspace>/retention.json with the
//   head they were verified against. Scans read it (retainedAncestor below).
// - Unpublished local outbox entries are never removed; published local copies of snapshots
//   that are no longer kept are removed.
// - Shared assets are left alone.
const fs = require('node:fs/promises'), path = require('node:path');
const { json, writeJSON, UUID } = require('./sync-files.cjs');
const KEEP_RECENT = 30, MIN_INTERVAL = 6 * 60 * 60 * 1000;
const dayOf = iso => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : 'unknown'; };
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
// Pure plan over verified history: `chain` is the head's chain (newest first), `prior` the
// older snapshots an earlier run already verified (no longer linked to the chain).
function planRetention({ chain, prior = [], keepRecent = KEEP_RECENT }) {
  const keep = new Set(chain.slice(0, keepRecent).map(row => row.snapshotId)), byDay = new Map();
  for (const row of [...chain.slice(keepRecent), ...prior]) { const day = dayOf(row.manifest.createdAt), best = byDay.get(day); if (!best || String(row.manifest.createdAt) > String(best.manifest.createdAt)) byDay.set(day, row); }
  for (const row of byDay.values()) keep.add(row.snapshotId);
  const remove = [...chain, ...prior].filter(row => !keep.has(row.snapshotId)).map(row => row.snapshotId);
  return { keep, remove, ancestors: [...keep].filter(id => id !== chain[0]?.snapshotId) };
}
function createSnapshotRetention({ localDirectory, getExchange, index, head, now = () => Date.now(), keepRecent = KEEP_RECENT }) {
  const stateFile = path.join(localDirectory, 'Profile', 'snapshot-retention.json'), outbox = path.join(localDirectory, 'Outbox');
  async function prune({ workspaceId, force = false } = {}) {
    const exchange = getExchange(); if (!exchange || !UUID.test(workspaceId || '')) return { skipped: 'unconfigured' };
    const state = await json(stateFile, {});
    if (!force && Number.isFinite(state.lastRunAt) && now() - state.lastRunAt < MIN_INTERVAL) return { skipped: 'recent' };
    const root = await fs.realpath(exchange), rows = (await index()).filter(row => row.workspaceId === workspaceId);
    if (rows.some(row => row.integrity !== 'complete')) return { skipped: 'incomplete' };
    const current = await head(workspaceId); if (!current?.snapshotId) return { skipped: 'no-head' };
    const graph = new Map(rows.map(row => [row.snapshotId, row]));
    // The verified chain: head back through existing parents (newest first).
    const chain = []; for (let id = current.snapshotId, seen = new Set(); id && graph.has(id) && !seen.has(id); id = graph.get(id).manifest.parentSnapshotId) { seen.add(id); chain.push(graph.get(id)); }
    if (!chain.length) return { skipped: 'no-head' };
    const previous = await readRetention(root, workspaceId), inChain = new Set(chain.map(row => row.snapshotId));
    const anchorValid = previous && (previous.anchor === current.snapshotId || inChain.has(previous.anchor));
    const prior = anchorValid ? [...previous.ancestors].filter(id => graph.has(id) && !inChain.has(id)).map(id => graph.get(id)) : [];
    const plan = planRetention({ chain, prior, keepRecent });
    // A branch (or any other kept snapshot) must keep its parent, or it turns into 'unknown'.
    const history = new Set([...chain, ...prior].map(row => row.snapshotId)), parentsInUse = new Set(rows.filter(row => !history.has(row.snapshotId)).map(row => row.manifest.parentSnapshotId).filter(Boolean));
    const remove = plan.remove.filter(id => !parentsInUse.has(id)), ancestors = [...new Set([...plan.ancestors, ...plan.remove.filter(id => parentsInUse.has(id))])];
    if (!remove.length) { await writeJSON(stateFile, { lastRunAt: now(), removed: 0, localRemoved: 0, kept: chain.length + prior.length }); return { removed: 0, localRemoved: 0, kept: chain.length + prior.length }; }
    // Record the kept history first, so a scan never sees a gap without it.
    await writeJSON(retentionFile(root, workspaceId), { format: 'inkbridge-retention', version: 1, workspaceId, anchor: current.snapshotId, ancestors, updatedAt: new Date(now()).toISOString() });
    const base = path.join(root, 'snapshots', workspaceId);
    for (const id of remove) { if (!UUID.test(id) || id === current.snapshotId) continue; await fs.rm(path.join(base, id), { recursive: true, force: true }); }
    // Local outbox: published copies that are no longer kept.
    let localRemoved = 0;
    const kept = new Set([current.snapshotId, ...ancestors]);
    for (const id of await fs.readdir(outbox).catch(() => [])) {
      if (!UUID.test(id) || kept.has(id)) continue;
      const dir = path.join(outbox, id), receipt = await json(path.join(dir, 'published.json'), null).catch(() => null);
      if (!receipt || receipt.root !== root) continue;
      const manifest = await json(path.join(dir, 'manifest.json'), null).catch(() => null);
      if (manifest && manifest.workspaceId !== workspaceId) continue;
      await fs.rm(dir, { recursive: true, force: true }); localRemoved++;
    }
    await writeJSON(stateFile, { lastRunAt: now(), removed: remove.length, localRemoved, kept: kept.size });
    return { removed: remove.length, localRemoved, kept: kept.size };
  }
  return { prune };
}
module.exports = { createSnapshotRetention, planRetention, readRetention, retainedAncestor, decidable, dayOf, KEEP_RECENT };
