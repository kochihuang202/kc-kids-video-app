const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { SnapshotPrototype, nativeApi, hashFile } = require('./snapshot-prototype.cjs');

const bindingPath = process.env.FLEXNOTE_SQLITE_BINDING;
if (!bindingPath) throw Error('Set FLEXNOTE_SQLITE_BINDING to the privately extracted shipped addon; never distribute that binary');
const api = nativeApi(bindingPath);
const evidenceRoot = process.env.FLEXNOTE_PROTOTYPE_OUTPUT || path.join(os.tmpdir(), 'flexnote-isolated-tests');
const workspaceId = 'synthetic-workspace';
const image1 = Buffer.from('89504e470d0a1a0a0000000049454e44ae426082', 'hex');
const image2 = Buffer.concat([image1, Buffer.from('second-independent-version')]);

async function fixture(deviceId = 'computer-A', exchangeRoot) {
  await fs.mkdir(evidenceRoot, { recursive: true });
  const localRoot = await fs.mkdtemp(path.join(evidenceRoot, deviceId + '-'));
  const working = path.join(localRoot, 'working');
  await fs.mkdir(path.join(working, 'files'), { recursive: true });
  await fs.writeFile(path.join(working, 'isolated-prototype.json'), JSON.stringify({ isolated: true, workspaceId }));
  await fs.writeFile(path.join(working, 'files', 'source.png'), image1);
  const dbFile = path.join(working, `db_${workspaceId}.sqlite3`);
  const db = await api.open(dbFile);
  try {
    await api.exec(db, `
      CREATE TABLE noteCards(id TEXT PRIMARY KEY,title TEXT,content TEXT);
      CREATE TABLE whiteboardList(id TEXT PRIMARY KEY,name TEXT);
      CREATE TABLE noteCardInstances(id TEXT PRIMARY KEY,objectId TEXT,whiteboardId TEXT,x REAL,y REAL);
      CREATE TABLE files(id TEXT PRIMARY KEY,filePath TEXT,useLink INTEGER);
      CREATE TABLE noteCardContentVersions(id TEXT PRIMARY KEY,noteCardId TEXT,content TEXT);
      CREATE TABLE whiteboardContentVersions(id TEXT PRIMARY KEY,whiteboardId TEXT,payload BLOB);
      CREATE TABLE tagList(id TEXT PRIMARY KEY,name TEXT);
      CREATE TABLE cardTagList(id TEXT PRIMARY KEY,cardId TEXT,tagId TEXT,blockId TEXT);
      CREATE INDEX instance_object ON noteCardInstances(objectId);
      CREATE VIRTUAL TABLE ai_content_fts USING fts5(entity_id,content);
      INSERT INTO noteCards VALUES('card-1','中文筆記','{"root":{"children":[{"type":"text","text":"shared"}]}}');
      INSERT INTO whiteboardList VALUES('board-A','A'),('board-B','B');
      INSERT INTO noteCardInstances VALUES('i1','card-1','board-A',1,2),('i2','card-1','board-B',3,4);
      INSERT INTO files VALUES('asset-1','files/source.png',0);
      INSERT INTO noteCardContentVersions VALUES('h1','card-1','original-history');
      INSERT INTO whiteboardContentVersions VALUES('b1','board-A',X'00FF0102');
      INSERT INTO tagList VALUES('tag-1','測試');
      INSERT INTO cardTagList VALUES('ct-1','card-1','tag-1','block-1');
      INSERT INTO ai_content_fts VALUES('card-1','shared searchable content');
    `);
  } finally { await api.close(db); }
  const exchange = exchangeRoot || await fs.mkdtemp(path.join(evidenceRoot, 'exchange-'));
  let pending = null;
  const manager = await new SnapshotPrototype({ bindingPath, localRoot, exchangeRoot: exchange,
    workspaceId, deviceId, flush: async () => {
      if (pending) { const task = pending; pending = null; await task(); }
    }, withBarrier: async fn => fn() }).init();
  return { manager, localRoot, exchange, working, dbFile,
    setPending: task => { pending = task; } };
}
async function update(context, title) {
  const db = await api.open(context.dbFile);
  try { await api.exec(db, `UPDATE noteCards SET title='${title.replaceAll("'", "''")}' WHERE id='card-1'`); }
  finally { await api.close(db); }
}
async function title(context) {
  const db = await api.open(context.dbFile, true);
  try { return (await api.query(db, 'SELECT title FROM noteCards'))[0].title; }
  finally { await api.close(db); }
}
async function assetObjects(root) {
  const results = [];
  for (const prefix of await fs.readdir(path.join(root, 'assets'))) {
    for (const file of await fs.readdir(path.join(root, 'assets', prefix))) results.push(path.join(prefix, file));
  }
  return results;
}

test('shipped SQLite 3.44.2 native Backup API preserves database, history, tags, FTS and cross-board identity', async () => {
  assert.equal(api.version, '3.44.2');
  const c = await fixture();
  const before = await hashFile(c.dbFile);
  const version = await c.manager.capture();
  assert.equal(await hashFile(c.dbFile), before, 'read-only backup must not modify source');
  const rows = await c.manager.scan();
  assert.equal(rows[0].integrity, 'complete');
  const snapshot = path.join(c.exchange, 'snapshots', workspaceId, version.snapshotId, 'database.sqlite3');
  const source = await api.open(c.dbFile, true), restored = await api.open(snapshot, true);
  try {
    for (const sql of ['SELECT * FROM sqlite_master ORDER BY name', 'SELECT * FROM noteCards',
      'SELECT * FROM noteCardInstances ORDER BY id', 'SELECT * FROM noteCardContentVersions',
      'SELECT * FROM whiteboardContentVersions', 'SELECT * FROM cardTagList',
      "SELECT entity_id FROM ai_content_fts WHERE ai_content_fts MATCH 'searchable'"]) {
      assert.deepEqual(await api.query(restored, sql), await api.query(source, sql));
    }
  } finally { await api.close(source); await api.close(restored); }
});

test('no changes produce no extra snapshot; unchanged attachments are shared across changed database snapshots', async () => {
  const c = await fixture();
  const v1 = await c.manager.capture('ctrl-s');
  assert.equal((await c.manager.capture('10-minute-timer')).created, false);
  assert.equal((await c.manager.capture('normal-close')).created, false);
  await update(c, 'changed');
  const v2 = await c.manager.capture('ctrl-s');
  assert.equal(v2.manifest.parentVersionId, v1.snapshotId);
  assert.equal((await assetObjects(c.exchange)).length, 1);
  assert.equal((await c.manager.scan()).length, 2);
  assert.deepEqual((await fs.readdir(c.exchange)).sort(), ['assets', 'snapshots']);
});

test('flush contract is awaited before backup, not simulated by simply waiting a fixed editor delay', async () => {
  const c = await fixture();
  c.setPending(async () => {
    await new Promise(resolve => setImmediate(resolve));
    await update(c, 'pending-editor-write-finished');
  });
  const v = await c.manager.capture('ctrl-s');
  const db = await api.open(path.join(c.exchange, 'snapshots', workspaceId, v.snapshotId, 'database.sqlite3'), true);
  try { assert.equal((await api.query(db, 'SELECT title FROM noteCards'))[0].title, 'pending-editor-write-finished'); }
  finally { await api.close(db); }
});

test('immutable attachment versions allow complete old-snapshot restore without overwriting newer snapshot', async () => {
  const c = await fixture();
  const v1 = await c.manager.capture();
  await update(c, 'new');
  await fs.writeFile(path.join(c.working, 'files', 'source.png'), image2);
  const v2 = await c.manager.capture();
  assert.equal((await assetObjects(c.exchange)).length, 2);
  await c.manager.load(v1.snapshotId);
  assert.equal(await title(c), '中文筆記');
  assert.deepEqual(await fs.readFile(path.join(c.working, 'files', 'source.png')), image1);
  assert.equal((await c.manager.capture()).created, false);
  const rows = await c.manager.scan();
  assert.equal(rows.find(r => r.snapshotId === v2.snapshotId).integrity, 'complete');
});

test('snapshot interruption after assets or database leaves previous generation intact; incomplete generation is not loadable', async () => {
  for (const phase of ['after-assets', 'after-database', 'after-manifest']) {
    const c = await fixture();
    const v1 = await c.manager.capture();
    const oldPath = path.join(c.exchange, 'snapshots', workspaceId, v1.snapshotId, 'database.sqlite3');
    const oldHash = await hashFile(oldPath);
    await update(c, 'unpublished-edit');
    await assert.rejects(c.manager.capture('manual', phase), /Injected interruption/);
    assert.equal(await hashFile(oldPath), oldHash);
    assert.equal(c.manager.state.snapshotId, v1.snapshotId);
    const rows = await c.manager.scan();
    assert.equal(rows.find(r => r.snapshotId === v1.snapshotId).integrity, 'complete');
    if (phase === 'after-database') assert.ok(rows.some(r => r.integrity === 'incomplete'));
  }
});

test('manifest/database can arrive before asset: pending, corrupt and complete states are distinguished', async () => {
  const c = await fixture();
  const v = await c.manager.capture();
  const receiver = await fixture('receiver');
  await fs.cp(path.join(c.exchange, 'snapshots', workspaceId, v.snapshotId), path.join(receiver.exchange, 'snapshots', workspaceId, v.snapshotId), { recursive: true });
  assert.equal((await receiver.manager.scan())[0].integrity, 'incomplete');
  await fs.cp(path.join(c.exchange, 'assets'), path.join(receiver.exchange, 'assets'), { recursive: true });
  receiver.manager.isLocallyAvailable = async () => false;
  assert.equal((await receiver.manager.scan())[0].integrity, 'incomplete');
  receiver.manager.isLocallyAvailable = async () => true;
  assert.equal((await receiver.manager.scan())[0].integrity, 'complete');
  await fs.writeFile(path.join(receiver.exchange, v.manifest.assets[0].objectPath), Buffer.from('damaged'));
  assert.equal((await receiver.manager.scan())[0].integrity, 'invalid');
  await assert.rejects(receiver.manager.load(v.snapshotId), /hash mismatch|Integrity mismatch/);
});

test('late A branch and earlier B branch are both retained; choosing A protects unsaved B edits and bases next snapshot on A', async () => {
  const a = await fixture('computer-A');
  const root = await a.manager.capture();
  const b = await fixture('computer-B');
  await fs.cp(a.exchange, b.exchange, { recursive: true }); // Simulated delivery only, not real OneDrive.
  await b.manager.load(root.snapshotId);
  await update(a, 'A-edit');
  const va = await a.manager.capture(); // Delay delivery of A's branch.
  await update(b, 'B-edit');
  const vb = await b.manager.capture();
  assert.equal(va.manifest.parentVersionId, root.snapshotId);
  assert.equal(vb.manifest.parentVersionId, root.snapshotId);
  await fs.cp(b.exchange, a.exchange, { recursive: true, force: false });
  await fs.cp(a.exchange, b.exchange, { recursive: true, force: false }); // A arrives later.
  const rows = await b.manager.scan();
  assert.equal(rows.find(r => r.snapshotId === va.snapshotId).relation, 'branch');
  assert.equal(rows.find(r => r.snapshotId === vb.snapshotId).relation, 'current');
  await update(b, 'B-not-yet-snapshotted');
  await b.manager.load(va.snapshotId);
  assert.equal(await title(b), 'A-edit');
  const saved = await b.manager.scan();
  assert.ok(saved.some(r => r.manifest?.parentVersionId === vb.snapshotId));
  await update(b, 'continue-A');
  const next = await b.manager.capture();
  assert.equal(next.manifest.parentVersionId, va.snapshotId);
  assert.ok((await fs.readdir(path.join(b.exchange, 'snapshots', workspaceId))).includes(vb.snapshotId));
});

test('failed load after swap rolls back original working database, assets and version state', async () => {
  const c = await fixture();
  const old = await c.manager.capture();
  await update(c, 'keep-this-edit');
  await fs.writeFile(path.join(c.working, 'files', 'source.png'), image2);
  await assert.rejects(c.manager.load(old.snapshotId, 'after-swap'), /Injected interruption/);
  assert.equal(await title(c), 'keep-this-edit');
  assert.deepEqual(await fs.readFile(path.join(c.working, 'files', 'source.png')), image2);
  assert.notEqual(c.manager.state.snapshotId, old.snapshotId);
});

test('vulnerable-engine WAL online backup is explicitly rejected without modifying source mode', async () => {
  const c = await fixture();
  const db = await api.open(c.dbFile);
  try {
    await api.exec(db, 'PRAGMA journal_mode=WAL');
    await assert.rejects(c.manager.capture(), /WAL online backup disabled/);
    assert.equal((await api.query(db, 'PRAGMA journal_mode'))[0].journal_mode, 'wal');
  } finally { await api.close(db); }
});

test('an internally consistent manifest that omits a required attachment is rejected against database references', async () => {
  const c = await fixture();
  const v = await c.manager.capture();
  const manifestFile = path.join(c.exchange, 'snapshots', workspaceId, v.snapshotId, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  manifest.assets = [];
  manifest.fingerprint = require('node:crypto').createHash('sha256').update(JSON.stringify({ database: manifest.database.sha256, assets: [] })).digest('hex');
  await fs.writeFile(manifestFile, JSON.stringify(manifest)); // Synthetic corrupted input, never a production object.
  const rows = await c.manager.scan();
  assert.equal(rows[0].integrity, 'invalid');
  assert.match(rows[0].error, /does not cover database references/);
});

test('unknown application versions are rejected and current workspace remains unchanged', async () => {
  const c = await fixture();
  const v = await c.manager.capture();
  const manifestFile = path.join(c.exchange, 'snapshots', workspaceId, v.snapshotId, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  manifest.appVersion = '999.0.0';
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(c.manager.load(v.snapshotId), /Unsupported application version/);
  assert.equal(await title(c), '中文筆記');
});
