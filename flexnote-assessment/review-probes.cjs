// Readiness review probes, not a production integration or FlexNote launcher.
// All writes/locks/renames are confined to a newly-created private directory.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { nativeApi, hashFile, SnapshotPrototype } = require('./snapshot-prototype.cjs');

async function main() {
  const binding = process.env.FLEXNOTE_SQLITE_BINDING;
  const output = process.env.FLEXNOTE_REVIEW_OUTPUT;
  if (!binding || !output) throw Error('Set binding and private review output root');
  await fs.mkdir(output, { recursive: true });
  const root = await fs.mkdtemp(path.join(path.resolve(output), 'review-'));
  const api = nativeApi(binding), report = { engine: api.version, root };
  const inside = file => {
    const rel = path.relative(root, path.resolve(file));
    assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel), 'Probe target must remain inside its private root');
    return file;
  };
  const version = async db => (await api.query(db, 'PRAGMA data_version'))[0].data_version;
  const file = inside(path.join(root, 'data-version.sqlite3'));
  const writer = await api.open(file);
  await api.exec(writer, 'CREATE TABLE example(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO example VALUES(1,\'committed\')');
  const observer = await api.open(file, true);
  const before = { writer: await version(writer), observer: await version(observer) };
  const newConnection = await api.open(file, true);
  const freshBefore = await version(newConnection);
  await api.close(newConnection);
  await api.exec(writer, 'UPDATE example SET value=\'changed\' WHERE id=1');
  const after = { writer: await version(writer), observer: await version(observer) };
  const reopened = await api.open(file, true);
  const freshAfter = await version(reopened);
  await api.close(reopened);
  assert.equal(before.writer, after.writer);
  assert.notEqual(before.observer, after.observer);
  assert.equal(freshBefore, freshAfter, 'This shipped engine demonstrates fresh-connection false negatives');
  const asset = inside(path.join(root, 'asset.bin'));
  const assetBefore = await version(observer);
  await fs.writeFile(asset, 'asset-only-change');
  const assetAfter = await version(observer);
  assert.equal(assetBefore, assetAfter);
  const pendingEditor = 'not yet dispatched to SQLite'; // Counterexample, not a real editor probe.
  assert.notEqual((await api.query(observer, 'SELECT value FROM example'))[0].value, pendingEditor);
  report.dataVersion = { before, after, freshBefore, freshAfter,
    assetOnlyChangeVisible: assetBefore !== assetAfter, pendingEditorVisible: false };
  await api.close(observer); await api.close(writer);

  const ordinary = inside(path.join(root, 'ordinary-open.txt'));
  const ordinaryMoved = inside(path.join(root, 'ordinary-moved.txt'));
  await fs.writeFile(ordinary, 'probe');
  const ordinaryHandle = await fs.open(ordinary, 'r');
  try {
    try { await fs.rename(ordinary, ordinaryMoved); report.nodeOpenFileRename = 'allowed'; }
    catch (error) { report.nodeOpenFileRename = error.code; }
  } finally { await ordinaryHandle.close(); }
  if (report.nodeOpenFileRename === 'allowed') await fs.rename(ordinaryMoved, ordinary);

  if (process.platform === 'win32') {
    const localRoot = inside(path.join(root, 'local'));
    const working = inside(path.join(localRoot, 'working'));
    const exchangeRoot = inside(path.join(root, 'exchange'));
    await fs.mkdir(working, { recursive: true });
    await fs.writeFile(path.join(working, 'isolated-prototype.json'), JSON.stringify({ isolated: true, workspaceId: 'lock-review' }));
    const dbFile = inside(path.join(working, 'db_lock-review.sqlite3'));
    const db = await api.open(dbFile);
    await api.exec(db, 'CREATE TABLE files(id TEXT PRIMARY KEY,filePath TEXT,useLink INTEGER); CREATE TABLE example(value TEXT); INSERT INTO example VALUES(\'old\')');
    await api.close(db);
    const manager = await new SnapshotPrototype({ bindingPath: binding, localRoot, exchangeRoot, workspaceId: 'lock-review', deviceId: 'review-computer' }).init();
    const first = await manager.capture();
    const change = await api.open(dbFile);
    await api.exec(change, 'UPDATE example SET value=\'preserve-this\'');
    await api.close(change);
    const workingHash = await hashFile(dbFile);
    const ps = value => "'" + value.replaceAll("'", "''") + "'";
    // FileShare.ReadWrite permits backup reads, but intentionally omits Delete sharing.
    const command = `$h=[IO.File]::Open(${ps(dbFile)},[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite); try {[Console]::Out.WriteLine('READY'); [Console]::Out.Flush(); [Console]::In.ReadLine() | Out-Null} finally {$h.Dispose()}`;
    const holder = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = ''; holder.stderr.on('data', chunk => { stderr += chunk; });
    const closed = once(holder, 'close');
    await new Promise((resolve, reject) => {
      let text = '';
      holder.stdout.on('data', chunk => { text += chunk; if (text.includes('READY')) resolve(); });
      holder.once('error', reject);
      holder.once('close', code => { if (!text.includes('READY')) reject(Error('Lock holder failed: ' + code + ' ' + stderr)); });
    });
    try {
      try { await manager.load(first.snapshotId); report.lockedLoad = { outcome: 'completed' }; }
      catch (error) { report.lockedLoad = { outcome: 'rejected', code: error.code, message: error.message }; }
      report.lockedLoad.workingExists = !!await fs.stat(working);
      report.lockedLoad.workingDatabaseHashUnchanged = await hashFile(dbFile) === workingHash;
      const check = await api.open(dbFile, true);
      try { report.lockedLoad.valueAfter = (await api.query(check, 'SELECT value FROM example'))[0].value; }
      finally { await api.close(check); }
      assert.equal(report.lockedLoad.outcome, 'rejected');
      assert.equal(report.lockedLoad.valueAfter, 'preserve-this');
      assert.equal(report.lockedLoad.workingDatabaseHashUnchanged, true);
    } finally {
      holder.stdin.end('\n');
      await closed;
    }
  }
  await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
