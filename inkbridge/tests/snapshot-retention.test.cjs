const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { createSyncSnapshots } = require('../src/main/sync-snapshots.cjs');
const { planRetention } = require('../src/main/snapshot-retention.cjs');
const { startupSnapshotStatus } = require('../src/main/startup-snapshot-status.cjs');
const WS = crypto.randomUUID(), OTHER = crypto.randomUUID(), DEVICE = crypto.randomUUID();
// Local-time noon of day `d` plus `i` minutes, so day grouping does not depend on the timezone.
const at = (d, i) => new Date(2026, 10, 1 + d, 12, i).toISOString();
async function writeSnapshot(base, workspaceId, snapshotId, parentSnapshotId, createdAt) {
  const dir = path.join(base, 'snapshots', workspaceId, snapshotId); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ format: 'inkbridge-snapshot', version: 1, workspaceId, snapshotId, sourceComputerId: DEVICE, parentSnapshotId, createdAt, revision: 1, assets: [] }));
  await fs.writeFile(path.join(dir, 'database.sqlite3'), 'x');
}
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-retention-')), local = path.join(root, 'local'), exchange = path.join(root, 'exchange');
  await fs.mkdir(path.join(local, 'Profile'), { recursive: true }); await fs.mkdir(path.join(local, 'Outbox'), { recursive: true });
  // 50 snapshots, five a day over ten days, each the child of the previous one.
  const chain = []; let parent = null;
  for (let d = 0; d < 10; d++) for (let i = 0; i < 5; i++) { const id = crypto.randomUUID(); await writeSnapshot(exchange, WS, id, parent, at(d, i)); chain.push(id); parent = id; }
  const branch = crypto.randomUUID(); await writeSnapshot(exchange, WS, branch, chain[3], at(0, 30)); // a side branch off an old snapshot
  const other = crypto.randomUUID(); await writeSnapshot(exchange, OTHER, other, null, at(0, 0));
  const head = chain.at(-1), real = await fs.realpath(exchange);
  const writeHead = async id => fs.writeFile(path.join(local, 'Profile/snapshot-state.json'), JSON.stringify({ deviceId: DEVICE, heads: { [WS]: { snapshotId: id, revision: 1 }, [exchange + '|' + WS]: { snapshotId: id, revision: 1 } } }));
  await writeHead(head);
  const snapshots = createSyncSnapshots({ localDirectory: local, database: { summary: async () => ({ workspaceId: WS, revision: 1 }) }, getExchange: () => exchange, resolveAttachment: () => null });
  return { root, local, exchange, real, chain, branch, other, head, snapshots, writeHead };
}
const exists = file => fs.stat(file).then(() => true, () => false);

// User changed the policy to FlexNote's sparse union on 2026-11-16.
test('the FlexNote plan keeps newest ten plus hourly/daily/weekly/monthly representatives', () => {
  const rows = Array.from({ length: 50 }, (_, n) => ({ snapshotId: 'id' + n, manifest: { createdAt: at(9 - Math.floor(n / 5), 4 - (n % 5)) } }));
  const { keep, remove } = planRetention({ chain: rows,now:Date.parse(at(10,0)) });
  assert.equal(keep.size, 18); assert.equal(remove.length, 32);
  for (const n of [0, 9, 10, 15, 20, 45]) assert(keep.has('id' + n), 'kept id' + n);
  for (const n of [11, 14, 49]) assert(!keep.has('id' + n), 'removed id' + n);
});

test('retention deletes only verified history, keeps branches, other workspaces and unpublished local copies, and scans stay decidable', async () => {
  const f = await fixture(), base = path.join(f.exchange, 'snapshots', WS);
  // Local outbox: a published copy of a snapshot that will go, an unpublished one, one published elsewhere.
  const outbox = path.join(f.local, 'Outbox'), gone = f.chain[10], unpublished = crypto.randomUUID(), elsewhere = f.chain[11];
  for (const id of [gone, unpublished, elsewhere,f.branch]) { await fs.mkdir(path.join(outbox, id), { recursive: true }); await fs.writeFile(path.join(outbox, id, 'manifest.json'), JSON.stringify({ workspaceId: WS, snapshotId: id })); }
  await fs.writeFile(path.join(outbox, gone, 'published.json'), JSON.stringify({ root: f.real }));
  await fs.writeFile(path.join(outbox, elsewhere, 'published.json'), JSON.stringify({ root: path.join(f.root, 'old-exchange') }));
  await fs.writeFile(path.join(outbox,f.branch,'published.json'),JSON.stringify({root:f.real}));
  const before = await f.snapshots.index(); assert.equal(before.find(r => r.snapshotId === f.branch).relation, 'branch');

  const result = await f.snapshots.prune({ workspaceId: WS, force: true });
  // 50 history: latest ten + eight earlier daily representatives. The parent
  // of a branch may lose its payload, but its immutable causal record remains.
  assert.deepEqual({ removed: result.removed, localRemoved: result.localRemoved }, { removed: 32, localRemoved: 1 });
  const left = (await fs.readdir(base)).filter(name => name !== 'retention.json');
  assert.equal(left.length, 51 - 32);
  assert(left.includes(f.branch) && left.includes(f.head));
  assert(await exists(path.join(f.exchange,'lineage',WS,f.chain[3]+'.json')));
  assert(await exists(path.join(f.exchange, 'snapshots', OTHER, f.other)), 'other workspace untouched');
  assert(!await exists(path.join(outbox, gone)) && await exists(path.join(outbox, unpublished)) && await exists(path.join(outbox, elsewhere)));
  assert(await exists(path.join(outbox,f.branch)),'published side-branch local copy is not ordinary disposable history');

  const after = await f.snapshots.index(), own = after.filter(r => r.workspaceId === WS);
  assert.deepEqual(own.filter(r => r.snapshotId !== f.branch && !['current', 'ancestor'].includes(r.relation)).map(r => r.relation), [], 'every kept history snapshot is recognised');
  assert.equal(own.find(r => r.snapshotId === f.branch).relation, 'branch', 'the branch is still a branch');
  const status = startupSnapshotStatus({ rows: own.filter(r => r.snapshotId !== f.branch), workspaceId: WS, localRevision: 1, head: { snapshotId: f.head, revision: 1 } });
  assert.equal(status.kind, 'current');

  // Throttled within six hours.
  assert.deepEqual(await f.snapshots.prune({ workspaceId: WS }), { skipped: 'recent' });

  // A second run after ten more snapshots on a new day keeps the earlier daily ones decidable.
  let parent = f.head; const added = [];
  for (let i = 0; i < 10; i++) { const id = crypto.randomUUID(); await writeSnapshot(f.exchange, WS, id, parent, at(10, i)); added.push(id); parent = id; }
  await f.writeHead(parent);
  const second = await f.snapshots.prune({ workspaceId: WS, force: true });
  assert(second.removed > 0);
  const final = (await f.snapshots.index()).filter(r => r.workspaceId === WS && r.snapshotId !== f.branch);
  assert.deepEqual(final.filter(r => !['current', 'ancestor'].includes(r.relation)).map(r => r.relation), []);
  assert.equal(startupSnapshotStatus({ rows: final, workspaceId: WS, localRevision: 1, head: { snapshotId: parent, revision: 1 } }).kind, 'current');
  const days = new Set(final.map(r => r.manifest.createdAt.slice(0, 10)));
  assert(days.size >= 10, 'one snapshot per earlier day survives');
});

test('nothing is deleted while a snapshot of the workspace is incomplete', async () => {
  const f = await fixture();
  await fs.mkdir(path.join(f.exchange, 'snapshots', WS, crypto.randomUUID()), { recursive: true }); // syncing: no manifest yet
  assert.deepEqual(await f.snapshots.prune({ workspaceId: WS, force: true }), { skipped: 'incomplete' });
  assert.equal((await fs.readdir(path.join(f.exchange, 'snapshots', WS))).length, 52);
});

test('a second computer at retained history finds the single successor after pruning; local edits and side branches remain explicit', async () => {
  const f=await fixture();await f.snapshots.prune({workspaceId:WS,force:true});
  await f.writeHead(f.chain[4]); // Kept daily snapshot, disconnected from the newest thirty.
  const rows=(await f.snapshots.index()).filter(r=>r.workspaceId===WS&&r.snapshotId!==f.branch);
  const clean=startupSnapshotStatus({rows,workspaceId:WS,localRevision:1,head:{snapshotId:f.chain[4],revision:1}});
  assert.equal(clean.kind,'newer');assert.equal(clean.candidate.snapshotId,f.head);assert.equal(clean.hasLocalChanges,false);
  const dirty=startupSnapshotStatus({rows,workspaceId:WS,localRevision:2,head:{snapshotId:f.chain[4],revision:1}});
  assert.equal(dirty.hasLocalChanges,true);
  const all=await f.snapshots.index();
  assert.equal(startupSnapshotStatus({rows:all,workspaceId:WS,localRevision:1,head:{snapshotId:f.chain[4],revision:1}}).kind,'branches');
  await f.writeHead(f.chain[10]); // Deleted payload still has immutable causal metadata.
  assert.equal(startupSnapshotStatus({rows:(await f.snapshots.index()).filter(r=>r.workspaceId===WS&&r.snapshotId!==f.branch),workspaceId:WS,localRevision:1,head:{snapshotId:f.chain[10],revision:1}}).candidate.snapshotId,f.head);
  const missing=crypto.randomUUID();await f.writeHead(missing);
  assert.equal(startupSnapshotStatus({rows:(await f.snapshots.index()).filter(r=>r.workspaceId===WS&&r.snapshotId!==f.branch),workspaceId:WS,localRevision:1,head:{snapshotId:missing,revision:1}}).candidate,null);
});
